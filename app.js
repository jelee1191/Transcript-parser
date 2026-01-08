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
// ============================================

// State
let uploadedFiles = [];
let savedPrompts = [];
let currentResults = [];

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

// Initialize
function init() {
    // Configure PDF.js worker
    if (typeof pdfjsLib !== 'undefined') {
        pdfjsLib.GlobalWorkerOptions.workerSrc = 'https://cdnjs.cloudflare.com/ajax/libs/pdf.js/3.11.174/pdf.worker.min.js';
    }

    setupEventListeners();
    loadSavedPrompts();
    updateSavedPromptsButtons(); // Initialize buttons even if empty
    updateUI();
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

function handleSavePrompt() {
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

    // Check if prompt with this name already exists
    const existingIndex = savedPrompts.findIndex(p => p.name === name);
    if (existingIndex !== -1) {
        // Overwrite without asking
        savedPrompts[existingIndex].text = text;
        showToast(`Prompt "${name}" updated`, 'success');
    } else {
        savedPrompts.push({ name, text });
        showToast(`Prompt "${name}" saved`, 'success');
    }

    localStorage.setItem('savedPrompts', JSON.stringify(savedPrompts));
    updateSavedPromptsButtons();
    loadPromptByName(name);
}

function handleDeletePrompt() {
    const name = promptNameInput.value.trim();

    if (!name) {
        showToast('Please select a prompt to delete', 'warning');
        return;
    }

    const index = savedPrompts.findIndex(p => p.name === name);
    if (index === -1) {
        showToast(`No prompt named "${name}" found`, 'error');
        return;
    }

    // Delete without confirmation
    savedPrompts.splice(index, 1);
    localStorage.setItem('savedPrompts', JSON.stringify(savedPrompts));
    updateSavedPromptsButtons();
    promptNameInput.value = '';
    promptInput.value = '';
    showToast(`Prompt "${name}" deleted`, 'success');
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
