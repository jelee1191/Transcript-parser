# Authentication Setup Guide

Your Transcript Parser now has **user authentication** with **per-user saved prompts** and **user API keys**!

## What's New

- ✅ Login/Signup system in the top right corner
- ✅ Saved prompts are tied to your account (stored in database)
- ✅ Access your prompts from any device
- ✅ **User API Keys**: Users can add their own OpenAI/Anthropic/Gemini API keys
- ✅ API keys are encrypted and stored securely
- ✅ Still works without login (uses localStorage as fallback)

## Setup (5 Minutes)

### Step 1: Create Supabase Account

1. Go to: https://supabase.com
2. Click "Start your project"
3. Sign up with GitHub (recommended) or email
4. **Free forever** - no credit card required

### Step 2: Create a New Project

1. Click "New Project"
2. Choose an organization (or create one)
3. Fill in:
   - **Project name**: `transcript-parser` (or whatever you like)
   - **Database password**: Generate a strong password (save it somewhere)
   - **Region**: Choose closest to you
4. Click "Create new project"
5. Wait ~2 minutes for setup to complete

### Step 3: Create the Prompts Table

1. In your Supabase project, click "**SQL Editor**" in the left sidebar
2. Click "**+ New query**"
3. Copy and paste this SQL:

```sql
-- Create prompts table
CREATE TABLE prompts (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id UUID REFERENCES auth.users(id) ON DELETE CASCADE NOT NULL,
  name TEXT NOT NULL,
  text TEXT NOT NULL,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  UNIQUE(user_id, name)
);

-- Enable Row Level Security
ALTER TABLE prompts ENABLE ROW LEVEL SECURITY;

-- Create policy: Users can only see their own prompts
CREATE POLICY "Users can view own prompts"
  ON prompts FOR SELECT
  USING (auth.uid() = user_id);

-- Create policy: Users can insert their own prompts
CREATE POLICY "Users can insert own prompts"
  ON prompts FOR INSERT
  WITH CHECK (auth.uid() = user_id);

-- Create policy: Users can update their own prompts
CREATE POLICY "Users can update own prompts"
  ON prompts FOR UPDATE
  USING (auth.uid() = user_id);

-- Create policy: Users can delete their own prompts
CREATE POLICY "Users can delete own prompts"
  ON prompts FOR DELETE
  USING (auth.uid() = user_id);

-- Create index for faster lookups
CREATE INDEX prompts_user_id_idx ON prompts(user_id);
```

4. Click "**Run**" (or press `Ctrl/Cmd + Enter`)
5. You should see "Success. No rows returned"

### Step 3b: Create the User API Keys Table (Optional but Recommended)

This table allows users to add their own API keys instead of using the default ones.

1. Click "**+ New query**" again
2. Copy and paste this SQL:

```sql
-- Create user_api_keys table for storing encrypted API keys
CREATE TABLE user_api_keys (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id UUID REFERENCES auth.users(id) ON DELETE CASCADE NOT NULL,
  provider TEXT NOT NULL,  -- 'openai', 'anthropic', or 'gemini'
  encrypted_key TEXT NOT NULL,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  UNIQUE(user_id, provider)  -- One key per provider per user
);

-- Enable Row Level Security
ALTER TABLE user_api_keys ENABLE ROW LEVEL SECURITY;

-- Create policy: Users can only view their own keys
CREATE POLICY "Users can view own keys"
  ON user_api_keys FOR SELECT
  USING (auth.uid() = user_id);

-- Create policy: Users can insert their own keys
CREATE POLICY "Users can insert own keys"
  ON user_api_keys FOR INSERT
  WITH CHECK (auth.uid() = user_id);

-- Create policy: Users can update their own keys
CREATE POLICY "Users can update own keys"
  ON user_api_keys FOR UPDATE
  USING (auth.uid() = user_id);

-- Create policy: Users can delete their own keys
CREATE POLICY "Users can delete own keys"
  ON user_api_keys FOR DELETE
  USING (auth.uid() = user_id);

-- Create index for faster lookups
CREATE INDEX user_api_keys_user_id_idx ON user_api_keys(user_id);
```

3. Click "**Run**"
4. You should see "Success. No rows returned"

### Step 4: Get Your API Keys

1. In Supabase, click "**Settings**" (gear icon in bottom left)
2. Click "**API**" in the settings menu
3. You'll see two important values:

**Copy these:**
- **Project URL**: `https://xxxxx.supabase.co`
- **anon public**: `eyJhbGci...` (long string)

⚠️ **Important:** Copy the `anon` key, NOT the `service_role` key!

### Step 5: Add to Vercel

1. Go to your Vercel project dashboard
2. Click "**Settings**" → "**Environment Variables**"
3. Add these variables:

| Name | Value | Description |
|------|-------|-------------|
| `SUPABASE_URL` | `https://xxxxx.supabase.co` | Your Supabase project URL |
| `SUPABASE_ANON_KEY` | `eyJhbGci...` | The anon/public key |
| `SUPABASE_SERVICE_ROLE_KEY` | `eyJhbGci...` | The service_role key (for user API key management) |
| `API_KEY_ENCRYPTION_SECRET` | 64 hex characters | See below for how to generate |

**Generate the encryption secret:**
Run this command in your terminal:
```bash
node -e "console.log(require('crypto').randomBytes(32).toString('hex'))"
```
Copy the output (a 64-character string) and use it as `API_KEY_ENCRYPTION_SECRET`.

4. Select **Production**, **Preview**, and **Development**
5. Click "Save"

### Step 6: Redeploy

1. Go to "**Deployments**" tab
2. Click ⋯ on the latest deployment
3. Click "**Redeploy**"

### Step 7: Done!

Visit your Vercel URL. You'll see a "**Login**" button in the top right!

## Using Authentication

### First Time Setup

1. Click "**Login**" in the top right
2. Click "**Sign up**" at the bottom
3. Enter your email and password (min 6 characters)
4. Click "**Sign Up**"
5. **Check your email** for a confirmation link
6. Click the link to verify your account
7. Go back to the app and login

### Saving Prompts

Once logged in:
1. Type your prompt
2. Enter a name (e.g., "Earnings Call Summary")
3. Click "**Save**"
4. Your prompt is now saved to the database!

### Using Your Own API Keys

If you want to use your own API keys instead of the default ones:

1. Click "**Settings**" (next to Logout)
2. Enter your API key for any provider (OpenAI, Anthropic, or Gemini)
3. Click "**Save**"
4. Your key is encrypted and stored securely
5. The app will now use YOUR key for that provider

**Benefits of using your own keys:**
- Use your own billing/credits
- Access to your own rate limits
- Full control over your API usage

**Where to get API keys:**
- OpenAI: https://platform.openai.com/api-keys
- Anthropic: https://console.anthropic.com/settings/keys
- Google Gemini: https://aistudio.google.com/app/apikey

### Accessing Prompts

- Logged in → Prompts saved to database (accessible from any device)
- Not logged in → Prompts saved to browser localStorage (device-specific)

## Local Development

To test auth locally:

1. Add to your `.env` file:
```env
SUPABASE_URL=https://xxxxx.supabase.co
SUPABASE_ANON_KEY=eyJhbGci...
SUPABASE_SERVICE_ROLE_KEY=eyJhbGci...
API_KEY_ENCRYPTION_SECRET=your-64-character-hex-string
```

2. Run:
```bash
npm install
npm run dev
```

3. Open http://localhost:3000

## Features

### Security
- ✅ Row Level Security (RLS) enabled
- ✅ Users can only see/edit their own prompts
- ✅ Email verification required
- ✅ Passwords hashed by Supabase
- ✅ User API keys encrypted with AES-256-GCM
- ✅ Encryption key stored server-side only

### Fallback Mode
If Supabase is not configured:
- ✅ App still works normally
- ✅ Login button hidden
- ✅ Prompts saved to localStorage
- ✅ No authentication required

## Troubleshooting

### "Authentication not configured" error
**Problem:** Supabase credentials not loaded

**Fix:**
1. Check Vercel environment variables are set correctly
2. Make sure you redeployed after adding them
3. Check browser console for errors

### "Failed to load prompts" error
**Problem:** Database table not created or RLS policy issue

**Fix:**
1. Re-run the SQL from Step 3 in Supabase SQL Editor
2. Check that all policies were created successfully
3. Verify you're logged in

### Email confirmation not arriving
**Problem:** Supabase email not sent

**Fix:**
1. Check your spam folder
2. In Supabase dashboard, go to Authentication → Email Templates
3. Verify email sending is configured
4. For development, check Authentication → Users to manually confirm

### Can't login after signup
**Problem:** Email not verified

**Solutions:**
- Wait for confirmation email and click the link
- OR manually verify in Supabase:
  1. Go to Authentication → Users
  2. Find your email
  3. Click ⋯ → "Send magic link" or manually verify

## Advanced: Custom Email Templates

Want to customize the signup/login emails?

1. Supabase Dashboard → Authentication → Email Templates
2. Edit "Confirm signup" template
3. Customize the HTML/text
4. Save

## Cost

**Supabase Free Tier:**
- ✅ 50,000 monthly active users
- ✅ 500 MB database space
- ✅ Unlimited API requests
- ✅ Free forever

**More than enough for personal use!**

## Optional: Social Login

Want to add Google/GitHub login?

1. Supabase Dashboard → Authentication → Providers
2. Enable Google or GitHub
3. Follow the setup instructions
4. Update your app UI (see Supabase docs)

## Database Management

View/edit your prompts:

1. Supabase Dashboard → Table Editor
2. Select "prompts" table
3. See all prompts (with user associations)
4. Edit or delete as needed

## FAQ

**Q: Can I migrate my existing localStorage prompts to the database?**

A: Yes! Login, then manually re-save each prompt. Or write a migration script.

**Q: What if I forget my password?**

A: Click "Forgot password" on the login form (you'd need to add this feature to the UI, or use Supabase's password reset flow).

**Q: Can I share prompts with other users?**

A: Not currently. You'd need to modify the RLS policies to allow sharing.

**Q: Is this production-ready?**

A: Yes! Supabase handles all auth securely. The free tier is suitable for thousands of users.

**Q: Can I export my prompts?**

A: Yes, from Supabase Table Editor, or add an export feature to the app.

---

**You're all set!** Authentication is now live. Your prompts are safely stored in the database and accessible from anywhere.
