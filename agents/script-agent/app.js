const express = require('express');
const cors = require('cors');
const path = require('path');
const fs = require('fs');
const axios = require('axios');

const app = express();
const PORT = process.env.PORT || 3001;

// Pollinations.ai Configuration (STRICT PAID MODE)
const POLLINATIONS_BASE_URL = 'https://gen.pollinations.ai';
const POLLINATIONS_API_KEY = process.env.POLLINATIONS_API_KEY || 'sk_WAF0YaqgB5NZ6IDI3VVnraG8YHirl2QY';

// Tavily Search Configuration
const TAVILY_API_KEY = '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';

// Robust Fetch Helper for Pollinations.ai
async function callPollinationsText(model, messages, jsonMode = false) {
    try {
        const payload = {
            model: model || 'openai-fast',
            messages: messages,
            seed: Math.floor(Math.random() * 1000000)
        };

        if (jsonMode) {
            payload.response_format = { type: 'json_object' };
            // Ensure "json" is in the system prompt for models that require it
            if (messages[0] && messages[0].role === 'system') {
                if (!messages[0].content.toLowerCase().includes('json')) {
                    messages[0].content += " You MUST respond in a valid JSON format.";
                }
            }
        }

        console.log(`[API CALL] Model: ${payload.model} | JSON: ${jsonMode}`);
        const response = await axios.post(`${POLLINATIONS_BASE_URL}/v1/chat/completions`, payload, {
            headers: {
                'Authorization': `Bearer ${POLLINATIONS_API_KEY}`,
                'Content-Type': 'application/json'
            },
            timeout: 120000
        });

        if (response.data && response.data.choices && response.data.choices[0]) {
            return response.data.choices[0].message.content;
        }
        throw new Error("Invalid response from Pollinations API");
    } catch (error) {
        const errorData = error.response ? error.response.data : error.message;
        console.error("Pollinations API Error:", JSON.stringify(errorData));
        throw new Error(JSON.stringify(errorData));
    }
}

app.use(cors());
app.use(express.json());
app.use(express.static(path.join(__dirname, 'public')));

// Helper to load skills
function getSkillPrompt(video_type, sub_genre) {
    try {
        let skillContent = '';
        if (video_type === 'youtube_hook') {
            const p = '/root/akira-flow/skills/youtube-viral-script-toolkit/skills/youtube-viral-script.md';
            if (fs.existsSync(p)) skillContent = fs.readFileSync(p, 'utf8');
        } else if (video_type === 'story_anime') {
            const activeGenre = sub_genre || 'viral-story-framework';
            const p = path.join('/root/akira-flow/skills/anime-story-weaver', activeGenre, 'SKILL.md');
            if (fs.existsSync(p)) skillContent = fs.readFileSync(p, 'utf8');
        }
        return skillContent;
    } catch (e) {
        console.error("Error reading skill files:", e);
        return '';
    }
}

// Helper to clean and parse LLM response
function cleanAndParseJSON(str) {
    let cleaned = str.trim();
    if (cleaned.startsWith('```')) {
        cleaned = cleaned.replace(/^```json\s*/i, '').replace(/```$/, '').trim();
    }
    try {
        return JSON.parse(cleaned);
    } catch (e) {
        console.error("JSON parse failure, attempting regex repair...");
        try {
            const repaired = cleaned.replace(/\n/g, '\\n').replace(/\r/g, '\\r');
            return JSON.parse(repaired);
        } catch (innerError) {
            throw new Error("Could not parse AI response as JSON. Content: " + str.substring(0, 100));
        }
    }
}

// GET /api/models - Dynamic model listing from Pollinations
app.get('/api/models', async (req, res) => {
    try {
        const response = await axios.get(`${POLLINATIONS_BASE_URL}/v1/models`);
        const models = response.data.data || [];
        const textModels = models.map(m => ({
            name: m.id,
            description: `Paid Model: ${m.id}`
        }));
        res.json(textModels);
    } catch (error) {
        console.error('Error fetching models:', error);
        res.json([
            { name: 'openai-fast', description: 'Paid Reasoning Model' },
            { name: 'gemini', description: 'Deep Research' },
            { name: 'mistral-large', description: 'Multi-lingual Expert' }
        ]);
    }
});

// POST /api/generate-script - Core Logic (STRICT PAID ONLY)
app.post('/api/generate-script', async (req, res) => {
    const {
        topic,
        duration_target = '1 min',
        language = 'english',
        video_type = 'youtube_hook',
        sub_genre = '',
        model = 'openai-fast',
        enable_research = false
    } = req.body;

    if (!topic) return res.status(400).json({ error: 'Topic is required.' });

    try {
        let researchReport = '';
        if (enable_research) {
            console.log('AGENT 1: Launching Tavily Web Research...');
            try {
                const tavilyRes = await axios.post('https://api.tavily.com/search', {
                    api_key: TAVILY_API_KEY,
                    query: topic,
                    search_depth: 'advanced',
                    include_answer: true
                });
                if (tavilyRes.data) {
                    const data = tavilyRes.data;
                    const summary = data.answer || 'No summary answer available.';
                    researchReport = `## Tavily Deep Web Search Report: "${topic}"\n\n${summary}\n`;
                    console.log('AGENT 1: Tavily research success!');
                }
            } catch (tavilyErr) {
                console.warn("Tavily failed, using Gemini-Search fallback...");
                const researchInstruction = `You are the Akira Flow Research Agent. Gather facts on: "${topic}". Output markdown.`;
                researchReport = await callPollinationsText('gemini-search', [
                    { role: 'system', content: researchInstruction },
                    { role: 'user', content: `Research topic: ${topic}` }
                ]);
            }
        }

        const skillPrompt = getSkillPrompt(video_type, sub_genre);
        
        // Map UI model choices to strict Paid IDs
        let activeModel = model;
        if (model === 'gemini') activeModel = 'gemini-large';
        if (model === 'openai-fast') activeModel = 'openai-fast'; // This is already paid if using sk_ key

        console.log(`AGENT 2: Writing Script using ${activeModel}...`);

        let targetSeconds = 60;
        if (duration_target.includes('3')) targetSeconds = 180;
        const estimatedWords = Math.round(targetSeconds / 0.13);

        const systemInstruction = `You are the Akira Flow Script Writer Agent. You MUST respond in a valid JSON format.
SKILLS & FRAMEWORKS:
${skillPrompt}
RESEARCH DATA:
${researchReport}

CONSTRAINTS:
1. Type: ${video_type}. Language: ${language} (if hindi, use Roman Hinglish).
2. Target Duration: ${targetSeconds}s (~${estimatedWords} words).
3. Output strictly RAW VALID JSON matching this schema:
{
  "script_text": "Full script narration...",
  "scenes": [
    { "id": 1, "text": "Scene dialogue...", "character": "NARRATOR/CHAR_NAME", "start_sec": 0, "end_sec": 8 }
  ],
  "estimated_duration": ${targetSeconds},
  "word_count": ${estimatedWords},
  "research_summary": "Short summary of research used"
}`;

        const scriptContent = await callPollinationsText(activeModel, [
            { role: 'system', content: systemInstruction },
            { role: 'user', content: `Write a high-retention script about: ${topic}` }
        ], true);

        const scriptJSON = cleanAndParseJSON(scriptContent);
        
        // Add actual word count for the UI
        if (scriptJSON.script_text) {
            scriptJSON.word_count = scriptJSON.script_text.split(/\s+/).length;
        }

        if (enable_research) scriptJSON.research_report = researchReport;

        res.json(scriptJSON);
    } catch (error) {
        console.error('Generation Error:', error);
        res.status(500).json({ error: error.message });
    }
});

app.listen(PORT, () => {
    console.log(`Script Agent microservice is running on port ${PORT}`);
});
