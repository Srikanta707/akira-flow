const express = require('express');
const cors = require('cors');
const path = require('path');
const fs = require('fs');
const axios = require('axios');

const app = express();
const PORT = process.env.PORT || 3001;

// Pollinations.ai Configuration
const POLLINATIONS_BASE_URL = 'https://gen.pollinations.ai';
const POLLINATIONS_API_KEY = process.env.POLLINATIONS_API_KEY || 'sk_89634e2c-396a-497c-9ef1-42e131d87f7b'; // Default fallback or use env

// Robust Fetch Helper for Pollinations.ai
async function callPollinationsText(model, messages, jsonMode = false) {
    try {
        const payload = {
            model: model || 'openai',
            messages: messages,
            seed: Math.floor(Math.random() * 1000000)
        };

        if (jsonMode) {
            payload.response_format = { type: 'json_object' };
        }

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
        console.error("Pollinations API Error:", error.response ? error.response.data : error.message);
        throw new Error(error.response ? JSON.stringify(error.response.data) : error.message);
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
            throw new Error("Could not parse AI response as JSON.");
        }
    }
}

// GET /api/models - Dynamic model listing from Pollinations
app.get('/api/models', async (req, res) => {
    try {
        const response = await axios.get(`${POLLINATIONS_BASE_URL}/v1/models`);
        const models = response.data.data || [];
        // Filter text models
        const textModels = models.map(m => ({
            name: m.id,
            description: `Pollinations model: ${m.id}`
        }));
        res.json(textModels);
    } catch (error) {
        console.error('Error fetching models:', error);
        res.json([
            { name: 'openai', description: 'Standard powerful model' },
            { name: 'openai-fast', description: 'Fast responses' },
            { name: 'gemini', description: 'Deep reasoning' }
        ]);
    }
});

// POST /api/generate-script - Core Logic
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
            console.log('AGENT 1: Launching Research...');
            const researchInstruction = `You are the Akira Flow Research Agent. Gather shocking facts and high-retention details on: "${topic}". Output a markdown report.`;
            researchReport = await callPollinationsText('gemini-search', [
                { role: 'system', content: researchInstruction },
                { role: 'user', content: `Research topic: ${topic}` }
            ]);
        }

        const skillPrompt = getSkillPrompt(video_type, sub_genre);
        console.log('AGENT 2: Writing Script...');

        let targetSeconds = 60;
        if (duration_target.includes('3')) targetSeconds = 180;
        const estimatedWords = Math.round(targetSeconds / 0.13);

        const systemInstruction = `You are the Akira Flow Script Writer Agent. Respond with a RAW VALID JSON object only.
Skills:
${skillPrompt}
Research:
${researchReport}

Rules:
1. Type: ${video_type}. Lang: ${language} (if hindi, use Roman Hinglish).
2. Duration: ${targetSeconds}s (~${estimatedWords} words).
3. JSON Schema: { "script_text": "...", "scenes": [{ "id": 1, "text": "...", "character": "...", "start_sec": 0, "end_sec": 5 }] }`;

        const scriptContent = await callPollinationsText(model, [
            { role: 'system', content: systemInstruction },
            { role: 'user', content: `Write script about: ${topic}` }
        ], true);

        const scriptJSON = cleanAndParseJSON(scriptContent);
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
