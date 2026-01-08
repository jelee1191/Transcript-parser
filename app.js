// ============================================
// CONFIGURATION
// ============================================
const API_CONFIG = {
    // Backend API endpoint (works for both local dev and Vercel deployment)
    backendUrl: window.location.hostname === 'localhost'
        ? 'http://localhost:3000/api/llm'  // Local development
        : '/api/llm',  // Production (Vercel serverless function)

    // Provider selection
    provider: 'gemini',  // 'openai', 'anthropic', or 'gemini'
    modelName: ''  // Optional: Leave empty for default, or specify custom model
};

// Supabase configuration (set via inline script in HTML or env)
const SUPABASE_URL = window.SUPABASE_URL || '';
const SUPABASE_ANON_KEY = window.SUPABASE_ANON_KEY || '';

// Initialize Supabase client
let supabase = null;
if (typeof window.supabase !== 'undefined' && SUPABASE_URL && SUPABASE_ANON_KEY) {
    supabase = window.supabase.createClient(SUPABASE_URL, SUPABASE_ANON_KEY);
    console.log('✅ Supabase initialized successfully');
} else {
    console.warn('⚠️ Supabase not initialized. Auth features disabled.');
    console.log('- window.supabase exists:', typeof window.supabase !== 'undefined');
    console.log('- SUPABASE_URL:', SUPABASE_URL ? 'Set' : 'Missing');
    console.log('- SUPABASE_ANON_KEY:', SUPABASE_ANON_KEY ? 'Set' : 'Missing');
}
// ============================================

// State
let uploadedFiles = [];
let savedPrompts = [];
let currentResults = [];
let currentUser = null;
let isAuthMode = 'login'; // 'login' or 'signup'

// DOM Elements
const uploadZone = document.getElementById('uploadZone');
const fileInput = document.getElementById('fileInput');
const fileList = document.getElementById('fileList');
const promptInput = document.getElementById('promptInput');
const promptNameInput = document.getElementById('promptNameInput');
const savedPromptsButtons = document.getElementById('savedPromptsButtons');
const savePromptBtn = document.getElementById('savePromptBtn');
const deletePromptBtn = document.getElementById('deletePromptBtn');
const parseBtn = document.getElementById('parseBtn');
const clearBtn = document.getElementById('clearBtn');
const resultsContainer = document.getElementById('resultsContainer');
const toast = document.getElementById('toast');

// Auth DOM Elements
const authModal = document.getElementById('authModal');
const authModalClose = document.getElementById('authModalClose');
const authModalTitle = document.getElementById('authModalTitle');
const authForm = document.getElementById('authForm');
const authEmail = document.getElementById('authEmail');
const authPassword = document.getElementById('authPassword');
const authSubmitBtn = document.getElementById('authSubmitBtn');
const authToggleText = document.getElementById('authToggleText');
const authToggleBtn = document.getElementById('authToggleBtn');
const authUser = document.getElementById('authUser');
const authButtons = document.getElementById('authButtons');
const loginBtn = document.getElementById('loginBtn');
const logoutBtn = document.getElementById('logoutBtn');
const userEmail = document.getElementById('userEmail');

// Toast notification helper
let toastTimeout;
function showToast(message, type = 'info') {
    toast.textContent = message;
    toast.className = 'toast show';

    if (type === 'success') {
        toast.classList.add('success');
    } else if (type === 'error') {
        toast.classList.add('error');
    } else if (type === 'warning') {
        toast.classList.add('warning');
    }

    // Clear existing timeout
    if (toastTimeout) {
        clearTimeout(toastTimeout);
    }

    // Auto-hide after 3 seconds
    toastTimeout = setTimeout(() => {
        toast.classList.remove('show');
    }, 3000);
}

// ============================================
// AUTHENTICATION FUNCTIONS
// ============================================

async function checkAuth() {
    if (!supabase) {
        // No Supabase configured, use local storage only
        loadSavedPrompts();
        updateAuthUI();
        return;
    }

    const { data: { session } } = await supabase.auth.getSession();
    if (session) {
        currentUser = session.user;
        await loadUserPrompts();
    } else {
        loadSavedPrompts(); // Fallback to localStorage
    }
    updateAuthUI();
}

function updateAuthUI() {
    if (currentUser) {
        authUser.style.display = 'flex';
        authButtons.style.display = 'none';
        userEmail.textContent = currentUser.email;
    } else {
        authUser.style.display = 'none';
        authButtons.style.display = 'flex';
    }
}

function openAuthModal(mode = 'login') {
    console.log('📝 Opening auth modal in mode:', mode);
    isAuthMode = mode;
    authModalTitle.textContent = mode === 'login' ? 'Login' : 'Sign Up';
    authSubmitBtn.textContent = mode === 'login' ? 'Login' : 'Sign Up';
    authToggleText.textContent = mode === 'login' ? "Don't have an account?" : 'Already have an account?';
    authToggleBtn.textContent = mode === 'login' ? 'Sign up' : 'Login';
    authModal.classList.add('visible');
    authEmail.value = '';
    authPassword.value = '';
}

function closeAuthModal() {
    authModal.classList.remove('visible');
}

async function handleAuthSubmit(e) {
    e.preventDefault();

    if (!supabase) {
        showToast('Authentication not configured', 'error');
        return;
    }

    const email = authEmail.value.trim();
    const password = authPassword.value.trim();

    if (!email || !password) {
        showToast('Please fill in all fields', 'warning');
        return;
    }

    authSubmitBtn.disabled = true;
    authSubmitBtn.textContent = isAuthMode === 'login' ? 'Logging in...' : 'Signing up...';

    try {
        if (isAuthMode === 'login') {
            const { data, error } = await supabase.auth.signInWithPassword({ email, password });
            if (error) throw error;
            currentUser = data.user;
            showToast('Logged in successfully!', 'success');
        } else {
            const { data, error } = await supabase.auth.signUp({ email, password });
            if (error) throw error;
            currentUser = data.user;
            showToast('Account created! Please check your email to verify.', 'success');
        }

        closeAuthModal();
        await loadUserPrompts();
        updateAuthUI();
    } catch (error) {
        console.error('Auth error:', error);
        showToast(error.message || 'Authentication failed', 'error');
    } finally {
        authSubmitBtn.disabled = false;
        authSubmitBtn.textContent = isAuthMode === 'login' ? 'Login' : 'Sign Up';
    }
}

async function handleLogout() {
    if (!supabase) return;

    const { error } = await supabase.auth.signOut();
    if (error) {
        showToast('Logout failed', 'error');
        return;
    }

    currentUser = null;
    savedPrompts = [];
    updateSavedPromptsButtons();
    updateAuthUI();
    showToast('Logged out successfully', 'success');
}

async function loadUserPrompts() {
    if (!supabase || !currentUser) {
        loadSavedPrompts();
        return;
    }

    const { data, error } = await supabase
        .from('prompts')
        .select('*')
        .eq('user_id', currentUser.id)
        .order('created_at', { ascending: false });

    if (error) {
        console.error('Error loading prompts:', error);
        showToast('Failed to load prompts', 'error');
        loadSavedPrompts(); // Fallback
        return;
    }

    savedPrompts = data.map(p => ({ name: p.name, text: p.text, id: p.id }));
    updateSavedPromptsButtons();
}

async function saveUserPrompt(name, text) {
    if (!supabase || !currentUser) {
        // Fallback to localStorage
        return savePromptToLocalStorage(name, text);
    }

    // Check if prompt exists
    const existing = savedPrompts.find(p => p.name === name);

    if (existing) {
        // Update existing
        const { error } = await supabase
            .from('prompts')
            .update({ text, updated_at: new Date().toISOString() })
            .eq('id', existing.id);

        if (error) {
            console.error('Error updating prompt:', error);
            showToast('Failed to update prompt', 'error');
            return;
        }

        showToast(`Prompt "${name}" updated`, 'success');
    } else {
        // Insert new
        const { data, error } = await supabase
            .from('prompts')
            .insert([{ user_id: currentUser.id, name, text }])
            .select();

        if (error) {
            console.error('Error saving prompt:', error);
            showToast('Failed to save prompt', 'error');
            return;
        }

        savedPrompts.push({ name, text, id: data[0].id });
        showToast(`Prompt "${name}" saved`, 'success');
    }

    updateSavedPromptsButtons();
}

async function deleteUserPrompt(name) {
    if (!supabase || !currentUser) {
        // Fallback to localStorage
        return deletePromptFromLocalStorage(name);
    }

    const prompt = savedPrompts.find(p => p.name === name);
    if (!prompt) {
        showToast(`No prompt named "${name}" found`, 'error');
        return;
    }

    const { error } = await supabase
        .from('prompts')
        .delete()
        .eq('id', prompt.id);

    if (error) {
        console.error('Error deleting prompt:', error);
        showToast('Failed to delete prompt', 'error');
        return;
    }

    savedPrompts = savedPrompts.filter(p => p.id !== prompt.id);
    updateSavedPromptsButtons();
    promptNameInput.value = '';
    promptInput.value = '';
    showToast(`Prompt "${name}" deleted`, 'success');
}

function savePromptToLocalStorage(name, text) {
    const existingIndex = savedPrompts.findIndex(p => p.name === name);
    if (existingIndex !== -1) {
        savedPrompts[existingIndex].text = text;
        showToast(`Prompt "${name}" updated`, 'success');
    } else {
        savedPrompts.push({ name, text });
        showToast(`Prompt "${name}" saved`, 'success');
    }
    localStorage.setItem('savedPrompts', JSON.stringify(savedPrompts));
    updateSavedPromptsButtons();
}

function deletePromptFromLocalStorage(name) {
    const index = savedPrompts.findIndex(p => p.name === name);
    if (index === -1) {
        showToast(`No prompt named "${name}" found`, 'error');
        return;
    }

    savedPrompts.splice(index, 1);
    localStorage.setItem('savedPrompts', JSON.stringify(savedPrompts));
    updateSavedPromptsButtons();
    promptNameInput.value = '';
    promptInput.value = '';
    showToast(`Prompt "${name}" deleted`, 'success');
}

// ============================================
// INITIALIZE
// ============================================

async function init() {
    // Configure PDF.js worker
    if (typeof pdfjsLib !== 'undefined') {
        pdfjsLib.GlobalWorkerOptions.workerSrc = 'https://cdnjs.cloudflare.com/ajax/libs/pdf.js/3.11.174/pdf.worker.min.js';
    }

    setupEventListeners();
    await checkAuth(); // Load user auth and prompts
    updateSavedPromptsButtons(); // Initialize buttons even if empty
    updateUI();

    // Listen for auth state changes
    if (supabase) {
        supabase.auth.onAuthStateChange((event, session) => {
            if (event === 'SIGNED_IN') {
                currentUser = session.user;
                loadUserPrompts();
                updateAuthUI();
            } else if (event === 'SIGNED_OUT') {
                currentUser = null;
                savedPrompts = [];
                updateSavedPromptsButtons();
                updateAuthUI();
            }
        });
    }
}

// Event Listeners
function setupEventListeners() {
    // Upload zone click
    uploadZone.addEventListener('click', () => fileInput.click());

    // File input change
    fileInput.addEventListener('change', handleFileSelect);

    // Drag and drop
    uploadZone.addEventListener('dragover', handleDragOver);
    uploadZone.addEventListener('dragleave', handleDragLeave);
    uploadZone.addEventListener('drop', handleDrop);

    // Prompt management
    savePromptBtn.addEventListener('click', handleSavePrompt);
    deletePromptBtn.addEventListener('click', handleDeletePrompt);

    // Event delegation for file list remove buttons
    fileList.addEventListener('click', (e) => {
        if (e.target.classList.contains('file-remove')) {
            const index = parseInt(e.target.dataset.index);
            removeFileByIndex(index);
        }
    });

    // Event delegation for saved prompt buttons
    savedPromptsButtons.addEventListener('click', (e) => {
        if (e.target.classList.contains('prompt-button')) {
            const promptName = e.target.dataset.promptname;
            loadPromptByName(promptName);
        }
    });

    // Event delegation for result preview and copy buttons
    resultsContainer.addEventListener('click', (e) => {
        if (e.target.classList.contains('preview-btn')) {
            const index = parseInt(e.target.dataset.index);
            togglePreview(index);
        } else if (e.target.classList.contains('copy-btn')) {
            const index = parseInt(e.target.dataset.index);
            copyToClipboard(index);
        }
    });

    // Control buttons
    parseBtn.addEventListener('click', handleParse);
    clearBtn.addEventListener('click', handleClearAll);

    // Auth buttons and modal
    if (loginBtn) {
        loginBtn.addEventListener('click', () => {
            console.log('🔘 Login button clicked');
            openAuthModal('login');
        });
        console.log('✅ Login button event listener attached');
    } else {
        console.warn('⚠️ Login button not found');
    }

    if (logoutBtn) logoutBtn.addEventListener('click', handleLogout);
    if (authModalClose) authModalClose.addEventListener('click', closeAuthModal);
    if (authToggleBtn) authToggleBtn.addEventListener('click', () => {
        openAuthModal(isAuthMode === 'login' ? 'signup' : 'login');
    });
    if (authForm) authForm.addEventListener('submit', handleAuthSubmit);

    // Close modal when clicking outside
    if (authModal) {
        authModal.addEventListener('click', (e) => {
            if (e.target === authModal) closeAuthModal();
        });
        console.log('✅ Auth modal event listeners attached');
    } else {
        console.warn('⚠️ Auth modal not found');
    }
}

// File Upload Handlers
function handleFileSelect(e) {
    const files = Array.from(e.target.files);
    addFiles(files);
    fileInput.value = ''; // Reset input
}

function handleDragOver(e) {
    e.preventDefault();
    uploadZone.classList.add('drag-over');
}

function handleDragLeave(e) {
    e.preventDefault();
    uploadZone.classList.remove('drag-over');
}

function handleDrop(e) {
    e.preventDefault();
    uploadZone.classList.remove('drag-over');

    const files = Array.from(e.dataTransfer.files).filter(file =>
        file.type === 'application/pdf' || file.name.endsWith('.pdf')
    );

    addFiles(files);
}

function addFiles(files) {
    // Filter for PDFs only
    const pdfFiles = files.filter(file =>
        file.type === 'application/pdf' || file.name.endsWith('.pdf')
    );

    // Add to uploaded files (avoid duplicates)
    pdfFiles.forEach(file => {
        if (!uploadedFiles.find(f => f.name === file.name)) {
            uploadedFiles.push(file);
        }
    });

    // Sort alphabetically
    uploadedFiles.sort((a, b) => a.name.localeCompare(b.name));

    updateUI();
}

function removeFileByIndex(index) {
    uploadedFiles.splice(index, 1);
    updateUI();
}

// PDF Text Extraction
async function extractTextFromPDF(file) {
    try {
        const arrayBuffer = await file.arrayBuffer();
        const pdf = await pdfjsLib.getDocument({ data: arrayBuffer }).promise;
        let fullText = '';

        // Extract text from each page
        for (let i = 1; i <= pdf.numPages; i++) {
            const page = await pdf.getPage(i);
            const textContent = await page.getTextContent();
            const pageText = textContent.items.map(item => item.str).join(' ');
            fullText += pageText + '\n\n';
        }

        return fullText.trim();
    } catch (error) {
        console.error('Error extracting PDF text:', error);
        throw new Error(`Failed to extract text from ${file.name}: ${error.message}`);
    }
}

// Prompt Management
function loadSavedPrompts() {
    const saved = localStorage.getItem('savedPrompts');
    if (saved) {
        savedPrompts = JSON.parse(saved);
        updateSavedPromptsButtons();
    }
}

function updateSavedPromptsButtons() {
    if (savedPrompts.length === 0) {
        savedPromptsButtons.innerHTML = '<p style="color: #a0aec0; font-size: 0.9rem;">No saved prompts yet. Enter a name above and click Save to save a prompt.</p>';
        return;
    }

    savedPromptsButtons.innerHTML = savedPrompts.map(prompt => `
        <button class="prompt-button" data-promptname="${escapeHtml(prompt.name)}">
            ${escapeHtml(prompt.name)}
        </button>
    `).join('');
}

function loadPromptByName(promptName) {
    const prompt = savedPrompts.find(p => p.name === promptName);
    if (prompt) {
        promptInput.value = prompt.text;
        promptNameInput.value = prompt.name;

        // Highlight the active button
        document.querySelectorAll('.prompt-button').forEach(btn => {
            btn.classList.remove('active');
        });
        const activeBtn = document.querySelector(`[data-promptname="${escapeHtml(promptName)}"]`);
        if (activeBtn) {
            activeBtn.classList.add('active');
        }

        // Update button states since prompt was loaded programmatically
        updateButtonStates();
    }
}

async function handleSavePrompt() {
    const text = promptInput.value.trim();
    const name = promptNameInput.value.trim();

    if (!text) {
        showToast('Please enter a prompt first', 'warning');
        return;
    }

    if (!name) {
        showToast('Please enter a name for this prompt', 'warning');
        return;
    }

    // Use auth-aware save function
    await saveUserPrompt(name, text);
    loadPromptByName(name);
}

async function handleDeletePrompt() {
    const name = promptNameInput.value.trim();

    if (!name) {
        showToast('Please select a prompt to delete', 'warning');
        return;
    }

    // Use auth-aware delete function
    await deleteUserPrompt(name);
}

// LLM API Integration
async function callLLM(prompt, text) {
    const response = await fetch(API_CONFIG.backendUrl, {
        method: 'POST',
        headers: {
            'Content-Type': 'application/json'
        },
        body: JSON.stringify({
            provider: API_CONFIG.provider,
            prompt: prompt,
            text: text,
            modelName: API_CONFIG.modelName
        })
    });

    if (!response.ok) {
        const error = await response.json().catch(() => ({ error: response.statusText }));
        throw new Error(error.error || `Server error: ${response.statusText}`);
    }

    const data = await response.json();
    return data.result;
}

// Control Handlers
async function handleParse() {
    if (uploadedFiles.length === 0) {
        showToast('Please upload at least one PDF file', 'warning');
        return;
    }

    if (!promptInput.value.trim()) {
        showToast('Please enter a prompt', 'warning');
        return;
    }

    const prompt = promptInput.value.trim();

    // Initialize results
    currentResults = uploadedFiles.map(file => ({
        filename: file.name,
        status: 'pending',
        statusText: 'Pending...',
        output: ''
    }));

    updateUI();

    // Disable parse button during processing
    parseBtn.disabled = true;
    parseBtn.textContent = 'Processing...';

    // Process each file
    for (let i = 0; i < uploadedFiles.length; i++) {
        const file = uploadedFiles[i];

        try {
            // Update status to processing
            currentResults[i].status = 'processing';
            currentResults[i].statusText = 'Extracting text...';
            updateResultsDisplay();

            // Extract text from PDF
            const pdfText = await extractTextFromPDF(file);

            // Update status
            currentResults[i].statusText = 'Processing with LLM...';
            updateResultsDisplay();

            // Call LLM API (to be implemented in Phase 5)
            const result = await callLLM(prompt, pdfText);

            // Update result
            currentResults[i].status = 'complete';
            currentResults[i].statusText = 'Complete';
            currentResults[i].output = result;
            updateResultsDisplay();

        } catch (error) {
            console.error(`Error processing ${file.name}:`, error);
            currentResults[i].status = 'error';
            currentResults[i].statusText = `Error: ${error.message}`;
            updateResultsDisplay();
        }
    }

    // Re-enable parse button
    parseBtn.disabled = false;
    parseBtn.textContent = 'Parse Transcripts';
}

function handleClearAll() {
    if (uploadedFiles.length === 0 && currentResults.length === 0) {
        return;
    }

    // Clear without confirmation
    uploadedFiles = [];
    currentResults = [];
    updateUI();
    showToast('All files and results cleared', 'success');
}

// UI Updates
function updateUI() {
    updateFileList();
    updateResultsDisplay();
    updateButtonStates();
}

function updateFileList() {
    if (uploadedFiles.length === 0) {
        fileList.innerHTML = '';
        return;
    }

    fileList.innerHTML = uploadedFiles.map((file, index) => `
        <div class="file-item">
            <span class="file-name">${escapeHtml(file.name)}</span>
            <button class="file-remove" data-index="${index}">×</button>
        </div>
    `).join('');
}

function updateResultsDisplay() {
    if (currentResults.length === 0) {
        resultsContainer.innerHTML = '<p class="empty-state">Upload files and click "Parse Transcripts" to begin</p>';
        return;
    }

    resultsContainer.innerHTML = currentResults.map((result, index) => `
        <div class="result-item ${result.status}">
            <div class="result-header">
                <span class="result-filename">${escapeHtml(result.filename)}</span>
                <span class="result-status">${result.statusText}</span>
            </div>
            ${result.status === 'complete' ? `
                <div class="result-actions">
                    <button class="btn btn-small preview-btn" data-index="${index}">Preview</button>
                    <button class="btn btn-small btn-primary copy-btn" data-index="${index}">Copy</button>
                </div>
                <div class="result-preview" id="preview-${index}">
                    ${escapeHtml(result.output)}
                </div>
            ` : ''}
        </div>
    `).join('');
}

function updateButtonStates() {
    parseBtn.disabled = uploadedFiles.length === 0 || !promptInput.value.trim();
}

// Helper Functions
function escapeHtml(text) {
    const div = document.createElement('div');
    div.textContent = text;
    return div.innerHTML;
}

function togglePreview(index) {
    const preview = document.getElementById(`preview-${index}`);
    preview.classList.toggle('visible');
}

async function copyToClipboard(index) {
    const text = currentResults[index].output;

    // Convert markdown-style formatting to HTML for rich text paste
    const htmlContent = convertMarkdownToHtml(text);

    try {
        // Copy both plain text and HTML to clipboard
        // This allows OneNote and other apps to use the rich formatting
        await navigator.clipboard.write([
            new ClipboardItem({
                'text/plain': new Blob([text], { type: 'text/plain' }),
                'text/html': new Blob([htmlContent], { type: 'text/html' })
            })
        ]);
        showToast('Copied to clipboard', 'success');
    } catch (err) {
        // Fallback to plain text if rich clipboard fails
        console.error('Rich copy failed, falling back to plain text:', err);
        try {
            await navigator.clipboard.writeText(text);
            showToast('Copied as plain text', 'success');
        } catch (err2) {
            console.error('Failed to copy:', err2);
            showToast('Failed to copy to clipboard', 'error');
        }
    }
}

function convertMarkdownToHtml(text) {
    // Use marked.js library for proper markdown parsing
    if (typeof marked !== 'undefined') {
        // Configure marked to handle line breaks properly
        marked.setOptions({
            breaks: true,  // Convert \n to <br>
            gfm: true      // GitHub Flavored Markdown
        });

        const htmlBody = marked.parse(text);
        return `<html><body>${htmlBody}</body></html>`;
    }

    // Fallback: just wrap plain text if marked isn't loaded
    const escaped = text.replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/\n/g, '<br>');
    return `<html><body>${escaped}</body></html>`;
}

// Listen for prompt changes to update button state
promptInput.addEventListener('input', updateUI);

// Initialize the app
init();
