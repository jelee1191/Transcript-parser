# Simple Deployment Guide

## The Standard Approach

Your API key is secured using **environment variables** - the same way every production web app does it (Netflix, Spotify, ChatGPT, etc.).

### How It Works

```
Browser (Public)          Vercel Backend              LLM Provider
     │                         │                            │
     │  Send: prompt, text     │                            │
     ├────────────────────────>│                            │
     │  (NO API key)            │  Get API key from env var  │
     │                         │  Call API with key         │
     │                         ├───────────────────────────>│
     │                         │                            │
     │                         │<───────────────────────────┤
     │  Return: result         │                            │
     │<────────────────────────┤                            │
```

**Your API key is NEVER in:**
- Browser code ✅
- Git repository ✅
- Publicly accessible ✅

**Your API key IS in:**
- Vercel environment variables (secure) ✅

## Deploy in 3 Steps

### 1. Get API Key (Free)

https://aistudio.google.com/app/apikey

Click "Create API Key" → Copy it

### 2. Deploy to Vercel

**Option A: Via GitHub**
```bash
git add .
git commit -m "Ready to deploy"
git push
```
Then go to https://vercel.com/new and import your repo.

**Option B: Via CLI**
```bash
npm install -g vercel
vercel
```

### 3. Add Environment Variable

In Vercel dashboard:
1. Go to your project
2. Settings → Environment Variables
3. Add: `GEMINI_API_KEY` = `your-key-from-step-1`
4. Select all environments
5. Save and Redeploy

**Done!** Visit your URL: `https://your-project.vercel.app`

## What About Abuse?

**Q: Can random people use my app and drain my API quota?**

A: Technically yes, but:

1. **Gemini has a free tier** (1,500 requests/day) - that's a lot
2. **Nobody knows your URL** unless you share it
3. **You can add rate limiting** if needed (see below)
4. **Most people won't abuse it** - they'd need to find your URL first

### If You Want Protection

If you're worried about abuse, you have options:

**Option 1: Keep it private**
- Don't share the URL publicly
- Only bookmark it for yourself
- Problem solved

**Option 2: IP-based rate limiting**
Add this to `api/llm.js`:
```javascript
// Simple rate limiting by IP
const rateLimit = new Map();
const IP = req.headers['x-forwarded-for'] || req.connection.remoteAddress;
const now = Date.now();
const limit = rateLimit.get(IP) || { count: 0, resetTime: now + 60000 };

if (now > limit.resetTime) {
    limit.count = 0;
    limit.resetTime = now + 60000;
}

if (limit.count >= 10) {
    return res.status(429).json({ error: 'Rate limit exceeded. Try again later.' });
}

limit.count++;
rateLimit.set(IP, limit);
```
This allows 10 requests per minute per IP address.

**Option 3: Add authentication**
Add a password/login system using Auth0, Clerk, or similar.

**My recommendation:** Start without any protection. If you see unexpected usage in your Gemini dashboard, add rate limiting.

## Local Development

Test locally before deploying:

```bash
# 1. Add your key to .env
echo "GEMINI_API_KEY=your-key-here" > .env

# 2. Install and run
npm install
npm run dev

# 3. Open browser
# http://localhost:3000
```

## Monitoring

Check your API usage:
- **Gemini**: https://aistudio.google.com/
- **Vercel**: https://vercel.com/dashboard (functions, bandwidth)

Set up alerts in your Gemini dashboard if you want notifications.

## Costs

- **Vercel hosting**: $0 (free forever)
- **Gemini API**: $0 (free tier: 1,500 requests/day)
- **Total**: $0/month

If you exceed Gemini free tier:
- Gemini 1.5 Flash: ~$0.000075 per request
- For 100 transcripts/month = ~$0.01

## FAQ

**Is my API key secure?**
Yes. It's in Vercel environment variables, never in your code or browser.

**Can people see my API key in the browser?**
No. The browser never receives it. Only the backend has it.

**What if someone inspects the network requests?**
They'll see the prompt and result, but NOT your API key.

**What if I accidentally committed my API key before?**
1. Revoke that key in Gemini dashboard
2. Generate a new key
3. Add new key to Vercel environment variables
4. Never commit .env to git (it's already in .gitignore)

**Can I use this for a public SaaS product?**
Not recommended without proper authentication. This setup is for:
- Personal use ✅
- Sharing with small team ✅
- Public free tool (with rate limiting) ✅
- Multi-tenant SaaS ❌ (need user accounts, billing, etc.)

**How do I change LLM providers?**
Edit `app.js` line 11: Change `provider: 'gemini'` to `'openai'` or `'anthropic'`
Then add that provider's API key to Vercel environment variables.

## That's It!

You have the industry-standard setup:
- ✅ API key in environment variables (secure)
- ✅ Backend proxy (secure)
- ✅ Free hosting (Vercel)
- ✅ Free API usage (Gemini)
- ✅ No complex authentication (unless you want it)

This is literally how most web apps handle API keys. You're good to go!

---

**Ready?** Just follow the 3 steps above and you're deployed.
