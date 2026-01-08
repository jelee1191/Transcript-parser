# Transcript Parser - Specification

## Project Overview
A simple webapp to batch process PDF transcripts (earnings calls, conference presentations) using LLM prompts. Eliminates the tedium of uploading PDFs one-by-one, copying/pasting prompts, and manually transferring outputs to OneNote.

## Core Use Case
As a hedge fund analyst, process multiple (e.g., 8) PDF transcripts simultaneously:
1. Upload multiple PDFs → see alphabetized list
2. Enter/select a prompt → save for reuse
3. Click "Parse Transcripts" → process all PDFs
4. Preview/copy each result → paste into OneNote

## UI Layout

### Three Main Areas

**Area 1: File Upload Zone**
- Drag-and-drop or click to upload PDFs
- Display uploaded files in alphabetized list
- Show file names clearly
- Visual indicator of uploaded files

**Area 2: Prompt Input Zone**
- Large text area for prompt input
- Dropdown/list to select saved prompts
- Buttons: "Save Prompt", "Delete Prompt"
- Display list of saved prompts with names

**Area 3: Control & Results Zone**
- Action buttons: "Parse Transcripts", "Clear All"
- Processing status display showing:
  - Each PDF being processed
  - Progress indicator (processing/complete)
  - Per-PDF results: "Preview" and "Copy" buttons
  - Preview expands to show full text output

## Implementation Phases

### Phase 1: Basic Frontend Structure (MVP Core)
**Goal:** Create static UI with core layout

Steps:
1. Initialize project with basic HTML/CSS/JS structure
2. Create three-area layout with proper styling
3. Implement file upload UI (no processing yet)
4. Display uploaded file names in list
5. Sort file list alphabetically
6. Add basic prompt input textarea
7. Add "Parse Transcripts" and "Clear All" buttons (non-functional)

**Deliverable:** Static UI that looks right, no backend functionality

---

### Phase 2: File Management
**Goal:** Handle file uploads and display

Steps:
1. Implement file upload handling (accept PDF only)
2. Store uploaded files in memory/state
3. Display file names with remove option
4. Implement "Clear All" to reset file list
5. Add file validation (PDF check, size limits)
6. Show file count

**Deliverable:** Working file upload with proper list management

---

### Phase 3: Prompt Management
**Goal:** Save, load, and manage prompts

Steps:
1. Implement prompt save functionality (localStorage or simple backend)
2. Add prompt naming dialog/input
3. Create saved prompts dropdown/list UI
4. Implement prompt loading from saved list
5. Add delete prompt functionality
6. Set default/initial prompts if needed

**Deliverable:** Full prompt management system

---

### Phase 4: PDF Text Extraction
**Goal:** Extract text from uploaded PDFs

Steps:
1. Choose PDF parsing library (pdf.js, pdf-parse, or similar)
2. Implement PDF text extraction function
3. Handle multi-page PDFs
4. Test with sample transcript PDFs
5. Add error handling for corrupted/unreadable PDFs
6. Display extraction status/errors

**Deliverable:** Ability to extract text from all uploaded PDFs

---

### Phase 5: LLM Integration
**Goal:** Send prompts to LLM and get responses

Steps:
1. Choose LLM API (OpenAI, Anthropic Claude, etc.)
2. Set up API credentials/configuration
3. Implement API call function (prompt + PDF text → response)
4. Add API key input/storage (secure)
5. Handle API rate limits and errors
6. Test with single PDF first

**Deliverable:** Single PDF processing with LLM works end-to-end

---

### Phase 6: Batch Processing
**Goal:** Process multiple PDFs sequentially or in parallel

Steps:
1. Implement queue/batch processing logic
2. Add processing status for each PDF (pending/processing/complete/error)
3. Update UI to show real-time status
4. Handle errors gracefully (continue processing others)
5. Consider rate limiting (sequential vs parallel)
6. Add progress indicators

**Deliverable:** Can process all uploaded PDFs automatically

---

### Phase 7: Results Display & Export
**Goal:** Show results with preview and copy functionality

Steps:
1. Store LLM responses for each PDF
2. Display results list matching PDF order
3. Implement "Preview" button → expand/collapse result text
4. Implement "Copy" button → clipboard copy
5. Add visual feedback for copy action
6. Format output text properly
7. Consider adding "Copy All" option

**Deliverable:** Full results management with preview/copy

---

### Phase 8: Polish & UX Improvements
**Goal:** Make the app production-ready for daily use

Steps:
1. Add loading states and spinners
2. Improve error messages (user-friendly)
3. Add keyboard shortcuts (e.g., Ctrl+V to paste files)
4. Responsive design for different screen sizes
5. Add helpful tooltips/instructions
6. Improve visual design (colors, spacing, typography)
7. Add confirmation dialogs (e.g., "Clear All" confirmation)
8. Performance optimization
9. Add download results as text/markdown option

**Deliverable:** Production-ready webapp

---

### Optional Future Enhancements
- Save processing history
- Export results to OneNote directly via API
- Support other file formats (DOCX, TXT)
- Batch edit prompts (run different prompts on different PDFs)
- Templates for common analysis types
- Token usage/cost tracking
- Multiple LLM provider support
- Dark mode

## Technical Stack Recommendations

### Frontend
- **Option 1 (Simple):** Vanilla HTML/CSS/JavaScript
- **Option 2 (Modern):** React + Vite (faster development, better state management)
- **Option 3 (Full-stack):** Next.js (if you want server-side processing)

### PDF Processing
- **Browser-based:** pdf.js (Mozilla's library)
- **Node-based:** pdf-parse or pdf2json

### LLM API
- OpenAI (GPT-4)
- Anthropic (Claude)
- Both support similar REST APIs

### Storage
- **Prompts:** localStorage (simple) or backend database
- **Files:** In-memory for session, or temp server storage
- **API Keys:** Environment variables or secure user input

### Deployment
- **Simple:** Netlify, Vercel (static hosting)
- **With Backend:** Heroku, Railway, AWS

## Key Technical Decisions

1. **Client-side vs Server-side PDF processing:**
   - Client-side: Faster, no upload needed, works offline
   - Server-side: Better for large files, more control

2. **API calls from browser vs backend:**
   - Browser: Simpler, but exposes API key (need proxy or user-provided key)
   - Backend: Secure API key, better rate limiting

3. **File storage:**
   - Session-only (cleared on refresh) is simplest
   - Persist to backend if you want to resume sessions

## Security Considerations
- Never commit API keys to git
- Use environment variables for secrets
- Consider rate limiting to prevent abuse
- Validate file types and sizes
- Sanitize text output before displaying

## Success Metrics
- Can upload 8+ PDFs at once
- Process all PDFs without manual intervention
- Easy one-click copy to clipboard
- Saved prompts reusable across sessions
- Total time to process 8 transcripts < 5 minutes (vs 15-20 manually)
