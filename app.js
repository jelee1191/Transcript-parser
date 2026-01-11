// ============================================
// CONFIGURATION
// ============================================
const API_CONFIG = {
    // Backend API endpoint (works for both local dev and Vercel deployment)
    backendUrl: window.location.hostname === 'localhost'
        ? 'http://localhost:3000/api/llm'  // Local development
        : '/api/llm'  // Production (Vercel serverless function)
};

// Prevent double-loading
if (window.transcriptParserLoaded) {
    console.warn('⚠️ App already loaded, skipping initialization');
    throw new Error('App already loaded');
}
window.transcriptParserLoaded = true;

// Supabase configuration (set via inline script in HTML or env)
const SUPABASE_URL = window.SUPABASE_URL || '';
const SUPABASE_ANON_KEY = window.SUPABASE_ANON_KEY || '';

// Initialize Supabase client (make it globally accessible in this script)
var supabaseClient = null;
if (typeof window.supabase !== 'undefined' && SUPABASE_URL && SUPABASE_ANON_KEY) {
    supabaseClient = window.supabase.createClient(SUPABASE_URL, SUPABASE_ANON_KEY);
}
// ============================================

// State
var uploadedFiles = [];
var savedPrompts = [];
var currentResults = [];
var currentUser = null;
var isAuthMode = 'login'; // 'login' or 'signup'

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

// Model settings DOM Elements
const providerSelect = document.getElementById('providerSelect');
const modelInput = document.getElementById('modelInput');

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

// Settings DOM Elements
const settingsBtn = document.getElementById('settingsBtn');
const settingsModal = document.getElementById('settingsModal');
const settingsModalClose = document.getElementById('settingsModalClose');

// API Key management state
var userApiKeys = {
    openai: false,
    anthropic: false,
    gemini: false
};

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
    if (!supabaseClient) {
        // No Supabase configured, use local storage only
        loadSavedPrompts();
        updateAuthUI();
        return;
    }

    const { data: { session } } = await supabaseClient.auth.getSession();
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

    if (!supabaseClient) {
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
            const { data, error } = await supabaseClient.auth.signInWithPassword({ email, password });
            if (error) throw error;
            currentUser = data.user;
            showToast('Logged in successfully!', 'success');
        } else {
            const { data, error } = await supabaseClient.auth.signUp({ email, password });
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
    if (!supabaseClient) return;

    const { error } = await supabaseClient.auth.signOut();
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
    if (!supabaseClient || !currentUser) {
        loadSavedPrompts();
        return;
    }

    const { data, error } = await supabaseClient
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
    if (!supabaseClient || !currentUser) {
        // Fallback to localStorage
        return savePromptToLocalStorage(name, text);
    }

    // Check if prompt exists
    const existing = savedPrompts.find(p => p.name === name);

    if (existing) {
        // Update existing
        const { error } = await supabaseClient
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
        const { data, error } = await supabaseClient
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
    if (!supabaseClient || !currentUser) {
        // Fallback to localStorage
        return deletePromptFromLocalStorage(name);
    }

    const prompt = savedPrompts.find(p => p.name === name);
    if (!prompt) {
        showToast(`No prompt named "${name}" found`, 'error');
        return;
    }

    const { error } = await supabaseClient
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
// API KEY MANAGEMENT FUNCTIONS
// ============================================

// Get the current user's access token for API calls
async function getAuthToken() {
    if (!supabaseClient || !currentUser) return null;

    const { data: { session } } = await supabaseClient.auth.getSession();
    return session?.access_token || null;
}

// Get API endpoint URL for keys
function getKeysApiUrl() {
    return window.location.hostname === 'localhost'
        ? 'http://localhost:3000/api/keys'
        : '/api/keys';
}

// Open settings modal
function openSettingsModal() {
    settingsModal.classList.add('visible');
    loadUserApiKeyStatus();
}

// Close settings modal
function closeSettingsModal() {
    settingsModal.classList.remove('visible');
    // Clear input fields
    document.getElementById('openaiKeyInput').value = '';
    document.getElementById('anthropicKeyInput').value = '';
    document.getElementById('geminiKeyInput').value = '';
}

// Load user's API key status (which providers have keys configured)
async function loadUserApiKeyStatus() {
    if (!currentUser) return;

    const token = await getAuthToken();
    if (!token) return;

    try {
        const response = await fetch(getKeysApiUrl(), {
            method: 'GET',
            headers: {
                'Authorization': `Bearer ${token}`
            }
        });

        if (!response.ok) {
            throw new Error('Failed to load API key status');
        }

        const data = await response.json();

        // Reset status
        userApiKeys = { openai: false, anthropic: false, gemini: false };

        // Update status from response
        if (data.keys) {
            data.keys.forEach(key => {
                userApiKeys[key.provider] = true;
            });
        }

        updateApiKeyStatusUI();
    } catch (error) {
        console.error('Error loading API key status:', error);
    }
}

// Update the UI to show which keys are configured
function updateApiKeyStatusUI() {
    const providers = ['openai', 'anthropic', 'gemini'];

    providers.forEach(provider => {
        const statusEl = document.getElementById(`${provider}KeyStatus`);
        if (statusEl) {
            if (userApiKeys[provider]) {
                statusEl.textContent = 'Configured';
                statusEl.className = 'api-key-status configured';
            } else {
                statusEl.textContent = 'Not configured';
                statusEl.className = 'api-key-status not-configured';
            }
        }
    });
}

// Save an API key
async function saveApiKey(provider) {
    const inputEl = document.getElementById(`${provider}KeyInput`);
    const apiKey = inputEl.value.trim();

    if (!apiKey) {
        showToast('Please enter an API key', 'warning');
        return;
    }

    const token = await getAuthToken();
    if (!token) {
        showToast('Please login first', 'error');
        return;
    }

    try {
        const response = await fetch(getKeysApiUrl(), {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                'Authorization': `Bearer ${token}`
            },
            body: JSON.stringify({ provider, apiKey })
        });

        const data = await response.json();

        if (!response.ok) {
            throw new Error(data.error || 'Failed to save API key');
        }

        showToast(data.message || `${provider} API key saved`, 'success');
        inputEl.value = '';
        userApiKeys[provider] = true;
        updateApiKeyStatusUI();
    } catch (error) {
        console.error('Error saving API key:', error);
        showToast(error.message || 'Failed to save API key', 'error');
    }
}

// Delete an API key
async function deleteApiKey(provider) {
    const token = await getAuthToken();
    if (!token) {
        showToast('Please login first', 'error');
        return;
    }

    if (!userApiKeys[provider]) {
        showToast(`No ${provider} API key to delete`, 'warning');
        return;
    }

    try {
        const response = await fetch(getKeysApiUrl(), {
            method: 'DELETE',
            headers: {
                'Content-Type': 'application/json',
                'Authorization': `Bearer ${token}`
            },
            body: JSON.stringify({ provider })
        });

        const data = await response.json();

        if (!response.ok) {
            throw new Error(data.error || 'Failed to delete API key');
        }

        showToast(data.message || `${provider} API key deleted`, 'success');
        userApiKeys[provider] = false;
        updateApiKeyStatusUI();
    } catch (error) {
        console.error('Error deleting API key:', error);
        showToast(error.message || 'Failed to delete API key', 'error');
    }
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
    if (supabaseClient) {
        supabaseClient.auth.onAuthStateChange((event, session) => {
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
        loginBtn.addEventListener('click', () => openAuthModal('login'));
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
    }

    // Settings modal
    if (settingsBtn) settingsBtn.addEventListener('click', openSettingsModal);
    if (settingsModalClose) settingsModalClose.addEventListener('click', closeSettingsModal);
    if (settingsModal) {
        settingsModal.addEventListener('click', (e) => {
            if (e.target === settingsModal) closeSettingsModal();
        });
    }

    // API Key save/delete buttons
    document.getElementById('openaiKeySaveBtn')?.addEventListener('click', () => saveApiKey('openai'));
    document.getElementById('openaiKeyDeleteBtn')?.addEventListener('click', () => deleteApiKey('openai'));
    document.getElementById('anthropicKeySaveBtn')?.addEventListener('click', () => saveApiKey('anthropic'));
    document.getElementById('anthropicKeyDeleteBtn')?.addEventListener('click', () => deleteApiKey('anthropic'));
    document.getElementById('geminiKeySaveBtn')?.addEventListener('click', () => saveApiKey('gemini'));
    document.getElementById('geminiKeyDeleteBtn')?.addEventListener('click', () => deleteApiKey('gemini'));
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

    // Sort prompts alphabetically A-Z
    const sortedPrompts = [...savedPrompts].sort((a, b) => a.name.localeCompare(b.name));

    savedPromptsButtons.innerHTML = sortedPrompts.map(prompt => `
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
            // Compare dataset values directly (no escaping issues)
            if (btn.dataset.promptname === promptName) {
                btn.classList.add('active');
            } else {
                btn.classList.remove('active');
            }
        });

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

// LLM API Integration with STREAMING support
async function callLLM(prompt, text, onChunk) {
    // Get selected provider and model from UI
    const provider = providerSelect.value;
    const modelName = modelInput.value.trim();

    // Get auth token if user is logged in
    const authToken = await getAuthToken();

    // Build headers
    const headers = {
        'Content-Type': 'application/json'
    };

    // Add auth header if logged in (to use user's API keys)
    if (authToken) {
        headers['Authorization'] = `Bearer ${authToken}`;
    }

    const response = await fetch(API_CONFIG.backendUrl, {
        method: 'POST',
        headers: headers,
        body: JSON.stringify({
            provider: provider,
            prompt: prompt,
            text: text,
            modelName: modelName
        })
    });

    if (!response.ok) {
        const error = await response.json().catch(() => ({ error: response.statusText }));
        throw new Error(error.error || `Server error: ${response.statusText}`);
    }

    // Read streaming response
    const reader = response.body.getReader();
    const decoder = new TextDecoder();
    let fullResult = '';
    let buffer = '';

    while (true) {
        const { done, value } = await reader.read();
        if (done) break;

        // Use stream: true to handle multi-byte characters split across chunks
        buffer += decoder.decode(value, { stream: true });
        const lines = buffer.split('\n');

        // Keep the last partial line in the buffer
        buffer = lines.pop() || '';

        for (const line of lines) {
            if (line.trim() && line.startsWith('data: ')) {
                const data = line.slice(6).trim();

                try {
                    const parsed = JSON.parse(data);

                    if (parsed.error) {
                        throw new Error(parsed.error);
                    }

                    if (parsed.chunk) {
                        fullResult += parsed.chunk;
                        // Call the callback with the new chunk
                        if (onChunk) {
                            onChunk(parsed.chunk, fullResult);
                        }
                    }
                } catch (e) {
                    if (e.message && e.message !== 'Unexpected end of JSON input') {
                        throw e;
                    }
                    // Skip malformed JSON
                }
            }
        }
    }

    // Flush decoder to handle any remaining bytes
    if (buffer.trim()) {
        decoder.decode(); // Flush
    }

    return fullResult;
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

    // Process all files in parallel
    const processFile = async (file, index) => {
        try {
            // Update status to processing
            currentResults[index].status = 'processing';
            currentResults[index].statusText = 'Extracting text...';
            updateResultsDisplay();

            // Extract text from PDF
            const pdfText = await extractTextFromPDF(file);

            // Update status
            currentResults[index].statusText = 'Processing with LLM...';
            updateResultsDisplay();

            // Call LLM API with streaming callback
            const result = await callLLM(prompt, pdfText, (chunk, fullResult) => {
                // Update the output in real-time as chunks arrive
                currentResults[index].output = fullResult;
                updateResultsDisplay();
            });

            // Update result
            currentResults[index].status = 'complete';
            currentResults[index].statusText = 'Complete';
            currentResults[index].output = result;
            updateResultsDisplay();

        } catch (error) {
            console.error(`Error processing ${file.name}:`, error);
            currentResults[index].status = 'error';
            currentResults[index].statusText = `Error: ${error.message}`;
            updateResultsDisplay();
        }
    };

    // Process all files concurrently
    await Promise.all(
        uploadedFiles.map((file, index) => processFile(file, index))
    );

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
                    ${convertMarkdownToHtmlPreview(cleanOutput(result.output))}
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

function cleanOutput(text) {
    // First, trim the entire string
    let cleaned = text.trim();

    // Split into lines
    const lines = cleaned.split('\n');

    // Find the first non-empty line and remove its leading whitespace
    for (let i = 0; i < lines.length; i++) {
        if (lines[i].trim().length > 0) {
            // Get the leading whitespace of the first non-empty line
            const leadingWhitespace = lines[i].match(/^\s*/)[0];

            // Remove this amount of leading whitespace from all lines
            return lines.map(line => {
                if (line.startsWith(leadingWhitespace)) {
                    return line.slice(leadingWhitespace.length);
                }
                return line;
            }).join('\n').trim();
        }
    }

    return cleaned;
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

function convertMarkdownToHtmlPreview(text) {
    // Use marked.js library for proper markdown parsing (for inline preview)
    if (typeof marked !== 'undefined') {
        // Configure marked to handle line breaks properly
        marked.setOptions({
            breaks: true,  // Convert \n to <br>
            gfm: true      // GitHub Flavored Markdown
        });

        return marked.parse(text);
    }

    // Fallback: just escape and preserve line breaks
    const escaped = text.replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/\n/g, '<br>');
    return escaped;
}

// Listen for prompt changes to update button state
promptInput.addEventListener('input', updateUI);

// Initialize the app
init();
