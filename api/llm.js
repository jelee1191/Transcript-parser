// Vercel Serverless Function for LLM API Proxy
// This keeps your API keys secure and protected from public abuse

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

        let result;

        if (provider === 'openai') {
            result = await callOpenAI(prompt, text, modelName);
        } else if (provider === 'anthropic') {
            result = await callAnthropic(prompt, text, modelName);
        } else if (provider === 'gemini') {
            result = await callGemini(prompt, text, modelName);
        } else {
            return res.status(400).json({ error: 'Invalid provider' });
        }

        res.status(200).json({ result });
    } catch (error) {
        console.error('LLM API Error:', error);
        res.status(500).json({ error: error.message });
    }
}

async function callOpenAI(prompt, text, modelName) {
    const model = modelName || process.env.OPENAI_MODEL || 'gpt-4-turbo';
    const response = await fetch('https://api.openai.com/v1/chat/completions', {
        method: 'POST',
        headers: {
            'Content-Type': 'application/json',
            'Authorization': `Bearer ${process.env.OPENAI_API_KEY}`
        },
        body: JSON.stringify({
            model,
            messages: [{ role: 'user', content: `${prompt}\n\n${text}` }],
            temperature: 0.7
        })
    });

    if (!response.ok) {
        const error = await response.json();
        throw new Error(`OpenAI API error: ${error.error?.message || response.statusText}`);
    }

    const data = await response.json();
    return data.choices[0].message.content;
}

async function callAnthropic(prompt, text, modelName) {
    const model = modelName || process.env.ANTHROPIC_MODEL || 'claude-3-5-sonnet-20241022';
    const response = await fetch('https://api.anthropic.com/v1/messages', {
        method: 'POST',
        headers: {
            'Content-Type': 'application/json',
            'x-api-key': process.env.ANTHROPIC_API_KEY,
            'anthropic-version': '2023-06-01'
        },
        body: JSON.stringify({
            model,
            max_tokens: 4096,
            messages: [{ role: 'user', content: `${prompt}\n\n${text}` }]
        })
    });

    if (!response.ok) {
        const error = await response.json();
        throw new Error(`Anthropic API error: ${error.error?.message || response.statusText}`);
    }

    const data = await response.json();
    return data.content[0].text;
}

async function callGemini(prompt, text, modelName) {
    const model = modelName || process.env.GEMINI_MODEL || 'gemini-2.0-flash-exp';
    const response = await fetch(
        `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent?key=${process.env.GEMINI_API_KEY}`,
        {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                contents: [{ parts: [{ text: `${prompt}\n\n${text}` }] }],
                generationConfig: {
                    temperature: 0.7,
                    maxOutputTokens: 8192
                }
            })
        }
    );

    if (!response.ok) {
        const error = await response.json();
        throw new Error(`Gemini API error: ${error.error?.message || response.statusText}`);
    }

    const data = await response.json();
    return data.candidates[0].content.parts[0].text;
}
