# Transcript Parser

A simple webapp to batch process PDF transcripts (earnings calls, conference presentations) using LLM prompts. Eliminates the tedium of processing multiple transcripts one at a time.

**🌐 Deploy to internet in 5 minutes** • **💰 100% Free** • **🔒 Secure**

## Features

- **Batch Upload**: Upload multiple PDF files at once
- **Alphabetized Display**: Files are automatically sorted alphabetically
- **Prompt Management**: Save, load, and reuse your favorite prompts (includes default earnings call template)
- **LLM Integration**: Support for Google Gemini, OpenAI GPT-4, and Anthropic Claude
- **Parallel Processing**: Process multiple files simultaneously (~10x faster)
- **Easy Export**: Preview and copy results to clipboard (formatted for OneNote)
- **Simple UI**: Clean, intuitive interface with three main areas
- **Free Hosting**: Deploy to Vercel for free internet access

## Quick Deploy to Internet (Recommended)

**Deploy in 3 steps:**

1. Get a free Gemini API key: https://aistudio.google.com/app/apikey
2. Deploy to Vercel: https://vercel.com/new (import your GitHub repo)
3. Add environment variable in Vercel: `GEMINI_API_KEY` = your-api-key

**Done!** Visit your Vercel URL and start using.

**📖 Full guide:** [SIMPLE-DEPLOY.md](SIMPLE-DEPLOY.md)

**Cost: $0** - Vercel hosting is free, Gemini has a generous free tier (1,500 requests/day)

## Local Development

To run locally for testing:

```bash
npm install
npm run dev
```

Add your API key to `.env`:
```env
GEMINI_API_KEY=your-api-key
```

Open: http://localhost:3000

## How to Use

### 1. Upload PDF Files

- Drag and drop PDF files into the upload area, or
- Click the upload area to browse for files
- Files will appear in an alphabetized list
- Click the × button to remove any file

### 2. Create or Select a Prompt

Enter your prompt in the text area, for example:

```
Please summarize this earnings call transcript, highlighting:
- Key financial metrics and performance
- Management commentary and outlook
- Any forward-looking guidance
- Significant risks or challenges mentioned
```

**Save Prompts for Reuse:**
- New users get a comprehensive "Earnings Call Summary" prompt automatically
- Create custom prompts:
  1. Type your prompt
  2. Click **Save**
  3. Enter a name for the prompt
  4. Click the saved prompt button to load it anytime

### 3. Process Transcripts

1. Click **Parse Transcripts**
2. Watch the progress for each file:
   - "Extracting text..." - Reading the PDF
   - "Processing with LLM..." - Getting AI response
   - "Complete" - Ready to preview/copy
3. Each completed transcript shows two buttons:
   - **Preview**: View the full output
   - **Copy**: Copy to clipboard for pasting into OneNote

### 4. Clear When Done

Click **Clear All** to remove all files and results and start fresh.

## Security & Privacy

**How is the API key secured?**

Your API key is stored in **Vercel environment variables**, never in your code or browser. This is the industry-standard approach used by all major web apps.

**How it works:**
1. Browser sends prompt + PDF text to your Vercel backend
2. Backend gets API key from environment variables
3. Backend calls LLM API with the key
4. Result returned to browser

**Your API key is NEVER:**
- In browser code ❌
- In git repository ❌
- Publicly visible ❌

**Can others use my deployed app?**

Yes, anyone with your URL can use it. If you want to prevent this, see [SIMPLE-DEPLOY.md](SIMPLE-DEPLOY.md#if-you-want-protection) for rate limiting options.

For personal use, just don't share the URL publicly and you'll be fine.

## File Structure

```
transcript-parser/
├── index.html          # Main HTML file
├── styles.css          # Styling
├── app.js             # Frontend JavaScript
├── api/
│   ├── llm.js         # Vercel serverless function - LLM proxy
│   ├── keys.js        # Vercel serverless function - User API key management
│   └── config.js      # Vercel serverless function - Supabase config
├── vercel.json        # Vercel configuration
├── .env               # Local environment variables (gitignored)
├── .env.example       # Environment variable template
├── spec.md            # Original project specification
├── CLAUDE.md          # Implementation documentation
├── AUTH-SETUP.md      # Authentication setup guide
├── SIMPLE-DEPLOY.md   # Deployment guide
└── README.md          # This file
```

## Technical Details

### Technologies Used

- **Frontend**: Vanilla HTML, CSS, JavaScript (no frameworks)
- **Backend**: Vercel Serverless Functions (Node.js)
- **PDF Processing**: PDF.js (Mozilla) - client-side
- **LLM APIs**: Google Gemini, OpenAI, Anthropic Claude
- **Hosting**: Vercel (free tier)
- **Storage**: localStorage (prompts) + Vercel Environment Variables (API keys)

### Browser Requirements

- Modern browser with ES6+ support
- JavaScript enabled
- localStorage enabled
- Internet connection for LLM API calls

### Architecture

```
Your Browser                    Vercel Serverless         LLM Provider
                               Function
┌──────────────┐              ┌─────────────┐           ┌──────────┐
│              │              │             │           │          │
│ Upload PDF   │──────────────│ Receives    │──────────│  Gemini  │
│ Enter prompt │   HTTPS      │ request     │  HTTPS   │ OpenAI   │
│              │──────────────│             │──────────│ Claude   │
│ (no API key) │   + access   │ Has API key │          │          │
│              │     code     │ in env vars │          │          │
└──────────────┘              └─────────────┘           └──────────┘
```

**Key Points:**
- PDFs processed in browser (fast, private)
- Only extracted text sent to backend
- Backend has API keys securely
- Access code prevents abuse

### Limitations

- PDF files must contain extractable text (not scanned images)
- API rate limits apply based on your LLM provider
- Large PDFs may take longer to process
- Very large batches (50+ files) may hit provider rate limits

## Troubleshooting

### API errors
- Verify `GEMINI_API_KEY` is set in Vercel environment variables
- Check you haven't exceeded Gemini free tier (1,500 requests/day)
- Make sure you redeployed after adding environment variables

### PDF text extraction fails
- Ensure the PDF contains text (not scanned images)
- Try opening the PDF in a PDF reader to verify it's not corrupted
- Some PDFs may have restricted permissions

### LLM API errors
- Check Vercel environment variables have correct API key
- Verify you have credits/quota with your LLM provider (check provider dashboard)
- For Gemini: Check you haven't hit free tier rate limits (15/min)
- Redeploy on Vercel after changing environment variables

### Function timeout errors
- Streaming is enabled with 300s timeout (requires Vercel Pro - $20/month)
- Very long transcripts (100+ pages) may still timeout
- Solutions:
  - Split very large transcripts into smaller parts
  - Simplify prompts to reduce processing time

### Can't deploy to Vercel
- Make sure `vercel.json` and `api/llm.js` exist
- Check Vercel build logs for specific errors
- Verify your GitHub repo is properly connected

## Future Enhancements

Potential features for future versions:
- Export results as CSV or JSON
- Direct integration with OneNote API
- Support for DOCX and TXT files
- Processing history
- Token usage/cost tracking
- Custom prompt templates library

## Support

For issues or questions:
1. Check this README
2. Review the spec.md for technical details
3. Check browser console for error messages

## License

This project is open source and available for personal and commercial use.
