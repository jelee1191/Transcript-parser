// Vercel Serverless Function for User API Key Management
// Handles encrypted storage and retrieval of user API keys

import crypto from 'crypto';
import { createClient } from '@supabase/supabase-js';

// Initialize Supabase client with service role for server-side operations
function getSupabaseClient() {
    const supabaseUrl = process.env.SUPABASE_URL;
    const supabaseServiceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

    if (!supabaseUrl || !supabaseServiceKey) {
        return null;
    }

    return createClient(supabaseUrl, supabaseServiceKey);
}

// Encryption functions using AES-256-GCM
const ALGORITHM = 'aes-256-gcm';

function getEncryptionKey() {
    const key = process.env.API_KEY_ENCRYPTION_SECRET;
    if (!key || key.length !== 64) {
        throw new Error('API_KEY_ENCRYPTION_SECRET must be a 64-character hex string (32 bytes)');
    }
    return Buffer.from(key, 'hex');
}

function encrypt(text) {
    const key = getEncryptionKey();
    const iv = crypto.randomBytes(16);
    const cipher = crypto.createCipheriv(ALGORITHM, key, iv);

    let encrypted = cipher.update(text, 'utf8', 'hex');
    encrypted += cipher.final('hex');
    const authTag = cipher.getAuthTag().toString('hex');

    // Format: iv:authTag:encryptedData
    return `${iv.toString('hex')}:${authTag}:${encrypted}`;
}

function decrypt(encryptedText) {
    const key = getEncryptionKey();
    const [ivHex, authTagHex, encrypted] = encryptedText.split(':');

    const decipher = crypto.createDecipheriv(ALGORITHM, key, Buffer.from(ivHex, 'hex'));
    decipher.setAuthTag(Buffer.from(authTagHex, 'hex'));

    let decrypted = decipher.update(encrypted, 'hex', 'utf8');
    decrypted += decipher.final('utf8');

    return decrypted;
}

// Verify user token and get user ID
async function verifyUserToken(supabase, authHeader) {
    if (!authHeader || !authHeader.startsWith('Bearer ')) {
        return null;
    }

    const token = authHeader.replace('Bearer ', '');

    const { data: { user }, error } = await supabase.auth.getUser(token);

    if (error || !user) {
        return null;
    }

    return user.id;
}

export default async function handler(req, res) {
    // CORS headers
    res.setHeader('Access-Control-Allow-Origin', '*');
    res.setHeader('Access-Control-Allow-Methods', 'GET, POST, DELETE, OPTIONS');
    res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization');

    if (req.method === 'OPTIONS') {
        return res.status(200).end();
    }

    const supabase = getSupabaseClient();

    if (!supabase) {
        return res.status(500).json({ error: 'Database not configured' });
    }

    // Verify user authentication
    const userId = await verifyUserToken(supabase, req.headers.authorization);

    if (!userId) {
        return res.status(401).json({ error: 'Unauthorized. Please login first.' });
    }

    try {
        if (req.method === 'GET') {
            // List which providers have keys configured (don't return actual keys)
            const { data, error } = await supabase
                .from('user_api_keys')
                .select('provider, created_at, updated_at')
                .eq('user_id', userId);

            if (error) throw error;

            // Return list of configured providers
            const configuredProviders = data.map(row => ({
                provider: row.provider,
                configured: true,
                createdAt: row.created_at,
                updatedAt: row.updated_at
            }));

            return res.status(200).json({ keys: configuredProviders });

        } else if (req.method === 'POST') {
            // Save or update an API key
            const { provider, apiKey } = req.body;

            if (!provider || !apiKey) {
                return res.status(400).json({ error: 'Missing provider or apiKey' });
            }

            const validProviders = ['openai', 'anthropic', 'gemini'];
            if (!validProviders.includes(provider)) {
                return res.status(400).json({ error: 'Invalid provider. Must be: openai, anthropic, or gemini' });
            }

            // Basic validation of API key format
            if (apiKey.length < 10) {
                return res.status(400).json({ error: 'API key appears to be invalid (too short)' });
            }

            // Encrypt the API key
            const encryptedKey = encrypt(apiKey);

            // Upsert the key (insert or update if exists)
            const { error } = await supabase
                .from('user_api_keys')
                .upsert({
                    user_id: userId,
                    provider: provider,
                    encrypted_key: encryptedKey,
                    updated_at: new Date().toISOString()
                }, {
                    onConflict: 'user_id,provider'
                });

            if (error) throw error;

            return res.status(200).json({ success: true, message: `${provider} API key saved successfully` });

        } else if (req.method === 'DELETE') {
            // Delete an API key
            const { provider } = req.body;

            if (!provider) {
                return res.status(400).json({ error: 'Missing provider' });
            }

            const { error } = await supabase
                .from('user_api_keys')
                .delete()
                .eq('user_id', userId)
                .eq('provider', provider);

            if (error) throw error;

            return res.status(200).json({ success: true, message: `${provider} API key deleted` });

        } else {
            return res.status(405).json({ error: 'Method not allowed' });
        }

    } catch (error) {
        console.error('API Keys Error:', error);
        return res.status(500).json({ error: error.message || 'Internal server error' });
    }
}

// Export decrypt function for use by llm.js
export { decrypt };
