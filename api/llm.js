// Vercel Serverless Function for LLM API Proxy
// This keeps your API keys secure and protected from public abuse
// Now with STREAMING support to prevent timeouts!
// Supports user-provided API keys (encrypted in database)

import crypto from 'crypto';
import { createClient } from '@supabase/supabase-js';

// Encryption functions for decrypting user API keys
const ALGORITHM = 'aes-256-gcm';

function getEncryptionKey() {
    const key = process.env.API_KEY_ENCRYPTION_SECRET;
    if (!key || key.length !== 64) {
        return null; // Encryption not configured
    }
    return Buffer.from(key, 'hex');
}

function decrypt(encryptedText) {
    const key = getEncryptionKey();
    if (!key) return null;

    try {
        const [ivHex, authTagHex, encrypted] = encryptedText.split(':');
        const decipher = crypto.createDecipheriv(ALGORITHM, key, Buffer.from(ivHex, 'hex'));
        decipher.setAuthTag(Buffer.from(authTagHex, 'hex'));
        let decrypted = decipher.update(encrypted, 'hex', 'utf8');
        decrypted += decipher.final('utf8');
        return decrypted;
    } catch (error) {
        console.error('Decryption error:', error);
        return null;
    }
}

// Get Supabase client for server-side operations
function getSupabaseClient() {
    const supabaseUrl = process.env.SUPABASE_URL;
    const supabaseServiceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

    if (!supabaseUrl || !supabaseServiceKey) {
        return null;
    }

    return createClient(supabaseUrl, supabaseServiceKey);
}

// Verify user token and get user ID
async function verifyUserToken(supabase, authHeader) {
    if (!authHeader || !authHeader.startsWith('Bearer ')) {
        return null;
    }

    const token = authHeader.replace('Bearer ', '');

    try {
        const { data: { user }, error } = await supabase.auth.getUser(token);
        if (error || !user) {
            return null;
        }
        return user.id;
    } catch (error) {
        return null;
    }
}

// Get user's API key for a provider (if they have one saved)
async function getUserApiKey(supabase, userId, provider) {
    if (!supabase || !userId) return null;

    try {
        const { data, error } = await supabase
            .from('user_api_keys')
            .select('encrypted_key')
            .eq('user_id', userId)
            .eq('provider', provider)
            .single();

        if (error || !data) return null;

        return decrypt(data.encrypted_key);
    } catch (error) {
        console.error('Error fetching user API key:', error);
        return null;
    }
}

// Get the API key to use (user's key if available, otherwise environment variable)
async function getApiKey(provider, supabase, userId) {
    // First, try to get user's custom API key
    if (supabase && userId) {
        const userKey = await getUserApiKey(supabase, userId, provider);
        if (userKey) {
            return { key: userKey, isUserKey: true };
        }
    }

    // Fall back to environment variable
    let envKey;
    switch (provider) {
        case 'openai':
            envKey = process.env.OPENAI_API_KEY;
            break;
        case 'anthropic':
            envKey = process.env.ANTHROPIC_API_KEY;
            break;
        case 'gemini':
            envKey = process.env.GEMINI_API_KEY;
            break;
    }

    return { key: envKey, isUserKey: false };
}

export default async function handler(req, res) {
    // Only allow POST requests
    if (req.method !== 'POST') {
        return res.status(405).json({ error: 'Method not allowed' });
    }

    try {
        const { provider, prompt, text, modelName } = req.body;

        if (!prompt || !text) {
            return res.status(400).json({ error: 'Missing prompt or text' });
        }

        // Initialize Supabase and check for user authentication
        const supabase = getSupabaseClient();
        const userId = supabase ? await verifyUserToken(supabase, req.headers.authorization) : null;

        // Get API key (user's or default)
        const { key: apiKey, isUserKey } = await getApiKey(provider, supabase, userId);

        if (!apiKey) {
            return res.status(400).json({
                error: `No API key configured for ${provider}. ${userId ? 'Add your API key in Settings.' : 'Please login and add your API key, or contact the administrator.'}`
            });
        }

        // Set headers for streaming response
        res.setHeader('Content-Type', 'text/event-stream');
        res.setHeader('Cache-Control', 'no-cache');
        res.setHeader('Connection', 'keep-alive');

        if (provider === 'openai') {
            await streamOpenAI(prompt, text, modelName, res, apiKey);
        } else if (provider === 'anthropic') {
            await streamAnthropic(prompt, text, modelName, res, apiKey);
        } else if (provider === 'gemini') {
            await streamGemini(prompt, text, modelName, res, apiKey);
        } else {
            return res.status(400).json({ error: 'Invalid provider' });
        }

        // Don't call res.end() here - each streaming function handles it
        // to ensure all writes complete before closing the connection
    } catch (error) {
        console.error('LLM API Error:', error);
        // Send error as SSE event
        res.write(`data: ${JSON.stringify({ error: error.message })}\n\n`);
        res.end();
    }
}

async function streamOpenAI(prompt, text, modelName, res, apiKey) {
    const model = modelName || process.env.OPENAI_MODEL || 'gpt-5.1';
    const response = await fetch('https://api.openai.com/v1/chat/completions', {
        method: 'POST',
        headers: {
            'Content-Type': 'application/json',
            'Authorization': `Bearer ${apiKey}`
        },
        body: JSON.stringify({
            model,
            messages: [{ role: 'user', content: `${prompt}\n\n${text}` }],
            temperature: 0.7,
            max_tokens: 16000, // Ensure complete responses for long transcripts
            stream: true
        })
    });

    if (!response.ok) {
        const error = await response.json();
        throw new Error(`OpenAI API error: ${error.error?.message || response.statusText}`);
    }

    // Read streaming response
    const reader = response.body.getReader();
    const decoder = new TextDecoder();
    let buffer = '';

    try {
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
                    if (data === '[DONE]') continue;

                    try {
                        const parsed = JSON.parse(data);
                        const content = parsed.choices[0]?.delta?.content;
                        if (content) {
                            res.write(`data: ${JSON.stringify({ chunk: content })}\n\n`);
                        }
                    } catch (e) {
                        // Skip malformed JSON
                    }
                }
            }
        }

        // Process any remaining data in buffer
        if (buffer.trim()) {
            decoder.decode(); // Flush decoder
        }

        // Send completion signal and end response together to ensure delivery
        res.end(`data: ${JSON.stringify({ done: true })}\n\n`);
    } catch (error) {
        console.error('OpenAI streaming error:', error);
        throw error;
    }
}

async function streamAnthropic(prompt, text, modelName, res, apiKey) {
    const model = modelName || process.env.ANTHROPIC_MODEL || 'claude-sonnet-4-5-20250929';

    const response = await fetch('https://api.anthropic.com/v1/messages', {
        method: 'POST',
        headers: {
            'Content-Type': 'application/json',
            'x-api-key': apiKey,
            'anthropic-version': '2023-06-01'
        },
        body: JSON.stringify({
            model,
            max_tokens: 16000, // Increased from 8192 to allow complete responses
            messages: [{ role: 'user', content: `${prompt}\n\n${text}` }],
            stream: true
        })
    });

    if (!response.ok) {
        const error = await response.json();
        console.error('Anthropic API error response:', JSON.stringify(error, null, 2));
        throw new Error(`Anthropic API error: ${error.error?.message || error.message || JSON.stringify(error)}`);
    }

    // Read streaming response
    const reader = response.body.getReader();
    const decoder = new TextDecoder();
    let buffer = '';

    try {
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

                        // Anthropic sends content in delta events
                        if (parsed.type === 'content_block_delta') {
                            const content = parsed.delta?.text;
                            if (content) {
                                res.write(`data: ${JSON.stringify({ chunk: content })}\n\n`);
                            }
                        }
                    } catch (e) {
                        // Skip malformed JSON
                    }
                }
            }
        }

        // Process any remaining data in buffer
        if (buffer.trim()) {
            decoder.decode(); // Flush decoder
        }

        // Send completion signal and end response together to ensure delivery
        res.end(`data: ${JSON.stringify({ done: true })}\n\n`);
    } catch (error) {
        console.error('Anthropic streaming error:', error);
        throw error;
    }
}

async function streamGemini(prompt, text, modelName, res, apiKey) {
    const model = modelName || process.env.GEMINI_MODEL || 'gemini-3-pro-preview';
    const response = await fetch(
        `https://generativelanguage.googleapis.com/v1beta/models/${model}:streamGenerateContent?key=${apiKey}&alt=sse`,
        {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                contents: [{ parts: [{ text: `${prompt}\n\n${text}` }] }],
                generationConfig: {
                    temperature: 0.7,
                    maxOutputTokens: 16000 // Increased from 8192 for complete responses
                }
            })
        }
    );

    if (!response.ok) {
        const error = await response.json();
        throw new Error(`Gemini API error: ${error.error?.message || response.statusText}`);
    }

    // Read streaming response
    const reader = response.body.getReader();
    const decoder = new TextDecoder();
    let buffer = '';

    try {
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
                        const content = parsed.candidates?.[0]?.content?.parts?.[0]?.text;
                        if (content) {
                            res.write(`data: ${JSON.stringify({ chunk: content })}\n\n`);
                        }
                    } catch (e) {
                        // Skip malformed JSON
                    }
                }
            }
        }

        // Process any remaining data in buffer
        if (buffer.trim()) {
            decoder.decode(); // Flush decoder
        }

        // Send completion signal and end response together to ensure delivery
        res.end(`data: ${JSON.stringify({ done: true })}\n\n`);
    } catch (error) {
        console.error('Gemini streaming error:', error);
        throw error;
    }
}
