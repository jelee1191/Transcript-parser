// Vercel Serverless Function for LLM API Proxy
// This keeps your API keys secure and protected from public abuse
// Now with STREAMING support to prevent timeouts!

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

        // Set headers for streaming response
        res.setHeader('Content-Type', 'text/event-stream');
        res.setHeader('Cache-Control', 'no-cache');
        res.setHeader('Connection', 'keep-alive');

        if (provider === 'openai') {
            await streamOpenAI(prompt, text, modelName, res);
        } else if (provider === 'anthropic') {
            await streamAnthropic(prompt, text, modelName, res);
        } else if (provider === 'gemini') {
            await streamGemini(prompt, text, modelName, res);
        } else {
            return res.status(400).json({ error: 'Invalid provider' });
        }

        res.end();
    } catch (error) {
        console.error('LLM API Error:', error);
        // Send error as SSE event
        res.write(`data: ${JSON.stringify({ error: error.message })}\n\n`);
        res.end();
    }
}

async function streamOpenAI(prompt, text, modelName, res) {
    const model = modelName || process.env.OPENAI_MODEL || 'gpt-5.1';
    const response = await fetch('https://api.openai.com/v1/chat/completions', {
        method: 'POST',
        headers: {
            'Content-Type': 'application/json',
            'Authorization': `Bearer ${process.env.OPENAI_API_KEY}`
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
                            // Forward chunk to client
                            res.write(`data: ${JSON.stringify({ chunk: content })}\n\n`);
                        }
                    } catch (e) {
                        // Log parse errors for debugging
                        console.error('OpenAI parse error:', e.message, 'Data:', data);
                    }
                }
            }
        }

        // Process any remaining data in buffer
        if (buffer.trim()) {
            decoder.decode(); // Flush decoder
        }

        // Send completion signal
        res.write(`data: ${JSON.stringify({ done: true })}\n\n`);
        console.log('OpenAI stream completed successfully');
    } catch (error) {
        console.error('OpenAI streaming error:', error);
        throw error;
    }
}

async function streamAnthropic(prompt, text, modelName, res) {
    const model = modelName || process.env.ANTHROPIC_MODEL || 'claude-sonnet-4-5-20250929';

    if (!process.env.ANTHROPIC_API_KEY) {
        throw new Error('ANTHROPIC_API_KEY environment variable is not set');
    }

    const response = await fetch('https://api.anthropic.com/v1/messages', {
        method: 'POST',
        headers: {
            'Content-Type': 'application/json',
            'x-api-key': process.env.ANTHROPIC_API_KEY,
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
                        // Log when we receive the message_stop event
                        if (parsed.type === 'message_stop') {
                            console.log('Anthropic stream received message_stop event');
                        }
                    } catch (e) {
                        // Log parse errors for debugging
                        console.error('Anthropic parse error:', e.message, 'Data:', data);
                    }
                }
            }
        }

        // Process any remaining data in buffer
        if (buffer.trim()) {
            decoder.decode(); // Flush decoder
        }

        // Send completion signal
        res.write(`data: ${JSON.stringify({ done: true })}\n\n`);
        console.log('Anthropic stream completed successfully');
    } catch (error) {
        console.error('Anthropic streaming error:', error);
        throw error;
    }
}

async function streamGemini(prompt, text, modelName, res) {
    const model = modelName || process.env.GEMINI_MODEL || 'gemini-3-pro-preview';
    const response = await fetch(
        `https://generativelanguage.googleapis.com/v1beta/models/${model}:streamGenerateContent?key=${process.env.GEMINI_API_KEY}&alt=sse`,
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
                        // Log parse errors for debugging
                        console.error('Gemini parse error:', e.message, 'Data:', data);
                    }
                }
            }
        }

        // Process any remaining data in buffer
        if (buffer.trim()) {
            decoder.decode(); // Flush decoder
        }

        // Send completion signal
        res.write(`data: ${JSON.stringify({ done: true })}\n\n`);
        console.log('Gemini stream completed successfully');
    } catch (error) {
        console.error('Gemini streaming error:', error);
        throw error;
    }
}
