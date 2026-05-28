const express = require('express');
const cors = require('cors');
const path = require('path');
const fs = require('fs');
const axios = require('axios');
const zlib = require('zlib');

const app = express();
const PORT = process.env.PORT || 3001;

// Authorized client credentials for the local FastAPI Smart Proxy
const PROXY_BASE_URL = 'https://ciel.sryze.cc/v1';
const PROXY_CLIENT_KEY = 'ciel_sk_afba29f2e6defe1cdfbe057f85b1ecda';

// Bulletproof Fetch Helper powered by Axios with manual Brotli/Gzip/Deflate decompression
async function safeFetchJSON(url, options = {}) {
  try {
    const headers = options.headers || {};
    delete headers['Accept-Encoding'];
    
    let requestData = undefined;
    if (options.body) {
      if (typeof options.body === 'string') {
        try {
          requestData = JSON.parse(options.body);
        } catch (e) {
          requestData = options.body;
        }
      } else {
        requestData = options.body;
      }
    }

    const axiosConfig = {
      url: url,
      method: options.method || 'GET',
      headers: headers,
      data: requestData,
      responseType: 'arraybuffer' // Fetch as raw bytes
    };
    
    const response = await axios(axiosConfig);
    const buffer = Buffer.from(response.data);
    
    let decodedString = '';
    
    // 1. Try Brotli Decompression
    try {
      const decompressed = zlib.brotliDecompressSync(buffer);
      decodedString = decompressed.toString('utf8');
    } catch (brErr) {
      // 2. Try Gzip Decompression
      try {
        const decompressed = zlib.gunzipSync(buffer);
        decodedString = decompressed.toString('utf8');
      } catch (gzErr) {
        // 3. Try Inflate
        try {
          const decompressed = zlib.inflateSync(buffer);
          decodedString = decompressed.toString('utf8');
        } catch (infErr) {
          try {
            const decompressed = zlib.inflateRawSync(buffer);
            decodedString = decompressed.toString('utf8');
          } catch (infRawErr) {
            // 4. Plain UTF-8 fallback
            decodedString = buffer.toString('utf8');
          }
        }
      }
    }

    try {
      return JSON.parse(decodedString);
    } catch (parseError) {
      console.error("JSON parse error. Content start:", decodedString.substring(0, 300));
      throw new Error(`Invalid JSON format: ${parseError.message}`);
    }
  } catch (error) {
    if (error.response && error.response.data) {
      let errorString = '';
      try {
        const errBuf = Buffer.from(error.response.data);
        errorString = errBuf.toString('utf8');
      } catch (e) {
        errorString = error.response.data.toString();
      }
      console.error(`API response error (${error.response.status}):`, errorString);
      throw new Error(`API error (${error.response.status}): ${errorString}`);
    }
    console.error("Axios network/comms error:", error.message);
    throw error;
  }
}

app.use(cors());
app.use(express.json());
app.use(express.static(path.join(__dirname, 'public')));

// Helper to load specialized script writing skills from git toolkits
function getSkillPrompt(video_type, sub_genre) {
  try {
    if (video_type === 'youtube_hook') {
      const p = '/root/akira-flow/skills/youtube-viral-script-toolkit/skills/youtube-viral-script.md';
      if (fs.existsSync(p)) return fs.readFileSync(p, 'utf8');
    } else if (video_type === 'story_anime') {
      const activeGenre = sub_genre || 'viral-story-framework';
      const p = path.join('/root/akira-flow/skills/anime-story-weaver', activeGenre, 'SKILL.md');
      if (fs.existsSync(p)) return fs.readFileSync(p, 'utf8');
      
      const backupP = '/root/akira-flow/skills/anime-story-weaver/viral-story-framework/SKILL.md';
      if (fs.existsSync(backupP)) return fs.readFileSync(backupP, 'utf8');
    }
  } catch (e) {
    console.error("Error reading skill files:", e);
  }
  return '';
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
    console.error("Failed to parse initial JSON, attempting regex cleanup...", e);
    
    try {
      const repaired = cleaned
        .replace(/\n/g, '\\n')
        .replace(/\r/g, '\\r');
      return JSON.parse(repaired);
    } catch (innerError) {
      throw new Error("Could not parse AI response as JSON. Output was: " + str.substring(0, 200) + "...");
    }
  }
}

// GET /api/anime-genres - Dynamically list cloned sub-genres
app.get('/api/anime-genres', (req, res) => {
  try {
    const dir = '/root/akira-flow/skills/anime-story-weaver';
    if (!fs.existsSync(dir)) {
      return res.json([]);
    }
    
    const items = fs.readdirSync(dir);
    const genres = items.filter(item => {
      const fullPath = path.join(dir, item);
      return fs.statSync(fullPath).isDirectory() && !item.startsWith('.') && item !== 'viral-story-framework';
    }).map(item => {
      const friendlyName = item.split('-').map(w => w.charAt(0).toUpperCase() + w.slice(1)).join(' ');
      return { id: item, name: friendlyName };
    });
    
    res.json(genres);
  } catch (e) {
    console.error("Error listing anime genres:", e);
    res.json([]);
  }
});

// GET /api/models - Dynamic model listing with free/paid filtering
app.get('/api/models', async (req, res) => {
  try {
    console.log('Querying models from local FastAPI proxy...');
    const data = await safeFetchJSON(`${PROXY_BASE_URL}/models`, {
      headers: {
        'Authorization': `Bearer ${PROXY_CLIENT_KEY}`
      }
    });
    
    const rawModels = data.data || [];

    // Filter out premium paid models based on keywords
    const paidKeywords = ['large', 'pro', 'gpt-5', 'claude', 'grok', 'midijourney', 'reasoning', 'mistral-large', 'qwen-large', 'universal-3'];
    
    const freeTextModels = rawModels.filter(m => {
      // Must support text output
      const isText = m.input_modalities && m.input_modalities.includes('text') && m.output_modalities && m.output_modalities.includes('text');
      if (!isText) return false;

      // Filter out paid models
      const isPaid = paidKeywords.some(keyword => m.id.toLowerCase().includes(keyword));
      return !isPaid;
    }).map(m => {
      return {
        name: m.id,
        description: `Free Modality — Context: ${m.context_length || '128k'}`
      };
    });

    if (freeTextModels.length === 0) {
      res.json([
        { name: 'openai-fast', description: 'Free Modality — Fast Reasoning' },
        { name: 'mistral', description: 'Free Modality — Multi-lingual precise' },
        { name: 'deepseek', description: 'Free Modality — Deep reasoning and outline structure' },
        { name: 'llama', description: 'Free Modality — Fast and creative' },
        { name: 'perplexity-fast', description: 'Free Modality — Live search facts-retriever' },
        { name: 'kimi', description: 'Free Modality — Ultra long context' }
      ]);
    } else {
      res.json(freeTextModels);
    }

  } catch (error) {
    console.error('Error fetching models from proxy:', error);
    res.json([
      { name: 'openai-fast', description: 'Free Modality — Fast Reasoning' },
      { name: 'mistral', description: 'Free Modality — Multi-lingual precise' },
      { name: 'deepseek', description: 'Free Modality — Deep reasoning and outline structure' },
      { name: 'llama', description: 'Free Modality — Fast and creative' },
      { name: 'perplexity-fast', description: 'Free Modality — Live search facts-retriever' },
      { name: 'kimi', description: 'Free Modality — Ultra long context' }
    ]);
  }
});

// POST /api/generate-script - Multi-Agent Research & Writing Pipeline via Proxy Router
app.post('/api/generate-script', async (req, res) => {
  const {
    topic,
    duration_target = '1 min',
    language = 'english',
    video_type = 'youtube_hook',
    sub_genre = '',
    model = 'openai-fast',
    enable_research = false,
    tavily_key = ''
  } = req.body;

  if (!topic) {
    return res.status(400).json({ error: 'Topic is required.' });
  }

  let targetSeconds = 60;
  if (duration_target.includes('3')) targetSeconds = 180;
  else if (duration_target.includes('5')) targetSeconds = 300;
  else if (duration_target.includes('10')) targetSeconds = 600;
  
  const estimatedWords = Math.round(targetSeconds / 0.13);

  try {
    let researchReport = '';
    
    // ==========================================
    // AGENT 1: AUTONOMOUS RESEARCH AGENT
    // ==========================================
    if (enable_research) {
      if (tavily_key && tavily_key.trim()) {
        console.log('AGENT 1: Launching Tavily Web Research Agent...');
        try {
          const tavilyRes = await axios.post('https://api.tavily.com/search', {
            api_key: tavily_key.trim(),
            query: topic,
            search_depth: 'advanced',
            include_answer: true
          });
          
          if (tavilyRes.data) {
            const data = tavilyRes.data;
            const summary = data.answer || 'No direct summary answer compiled.';
            let resultsText = '';
            if (data.results && data.results.length > 0) {
              resultsText = data.results.map((r, i) => `[${i+1}] **${r.title}** (${r.url})\nSnippet: ${r.content}`).join('\n\n');
            } else {
              resultsText = 'No specific source results returned.';
            }
            
            researchReport = `## Tavily Deep Web Search Report for: "${topic}"\n\n### Direct Summary Answer\n${summary}\n\n### Sources & Live References\n${resultsText}\n`;
            console.log('AGENT 1: Tavily web research report compiled!');
          } else {
            throw new Error('Received empty response from Tavily API.');
          }
        } catch (tavilyErr) {
          console.error("Tavily Search Agent encountered a handled exception:", tavilyErr.message);
          researchReport = `Tavily web research failed: ${tavilyErr.message}. Proceeding with fallback standard intelligence.`;
        }
      } else {
        console.log('AGENT 1: Launching Gemini Research Agent via Proxy...');
        const researchInstruction = `You are the Akira Flow Research Agent. Your job is to perform deep, fact-based search and gather shocking information, high-retention details, and knowledge gaps on this topic: "${topic}".
Generate a detailed Research Report.
Include:
1. Topic Context and Framing Angle.
2. 3 Shocking Facts or knowledge gaps that most viewers don't know (Shock Value).
3. Recommended curiosity triggers (FOMO, Relativity, Fear, Pattern Interrupt).
4. Suggested emotional triggers and pacing details.
Write the report in clear English as a structured Markdown document. Use Google search or real fact details.`;

        const researchPrompt = `Research and compile a viral script outline about: "${topic}"`;
        
        try {
          const researchData = await safeFetchJSON(`${PROXY_BASE_URL}/chat/completions`, {
            method: 'POST',
            headers: {
              'Content-Type': 'application/json',
              'Authorization': `Bearer ${PROXY_CLIENT_KEY}`
            },
            body: JSON.stringify({
              model: 'gemini',
              messages: [
                { role: 'system', content: researchInstruction },
                { role: 'user', content: researchPrompt }
              ]
            })
          });

          if (researchData && researchData.choices && researchData.choices[0] && researchData.choices[0].message) {
            researchReport = researchData.choices[0].message.content;
            console.log('AGENT 1: Gemini Research report successfully compiled!');
          } else {
            throw new Error('Research Agent returned an empty or unexpected payload structure.');
          }
        } catch (err) {
          console.error("Autonomous Research Agent encountered a handled exception:", err.message);
          researchReport = `Failed to fetch live research due to API status (${err.message}). Proceeding with standard script writing.`;
        }
      }
    }

    // Load custom writing skills cloned from git toolkits
    const skillPrompt = getSkillPrompt(video_type, sub_genre);

    // ==========================================
    // AGENT 2: SCRIPT WRITER AGENT
    // ==========================================
    console.log(`AGENT 2: Launching Script Writer Agent using model "${model}" via Proxy...`);

    const systemInstruction = `You are the Akira Flow Script Writer Agent. Your job is to draft a highly engaging and professional video script matching the user's specs.
You MUST respond with a RAW, VALID JSON object only. Do NOT enclose your output in markdown code blocks like \`\`\`json. Return only the JSON string.

Writing Skills & Frameworks to follow:
---
${skillPrompt}
---

${enable_research ? `Here is the Autonomous Research Report on the topic to guide your writing:\n---\n${researchReport}\n---\n` : ''}

Script Generation Rules:
1. Video Type: "${video_type}".
   - "youtube_hook": Frame as introductory curiosity gap hook -> core pacing body -> call to action (CTA) outro.
   - "story_anime": Rich emotional dialogues, high pacing, character face-slapping, romantic or power progression climax.
2. Language: "${language}". 
   - If "hindi", write in modern natural Roman Hinglish (standard Hindi using English characters) so that it is readable in the terminal and logs without encoding issues.
   - If "english", use standard clear narration English.
3. Target Duration: ${duration_target} (~${targetSeconds} seconds, approx ${estimatedWords} words).
   - The combined word count of all scene dialogue/narration MUST be around ${estimatedWords} words!
   - Break the script into sequential scenes.
4. Character-dialogue breakdown:
   - "NARRATOR" for narrations.
   - Define character names (e.g. "CHAR_A_GIRL", "CHAR_B_BOY") based on context.
   - Each scene has exactly one character speaking.
5. Timing: Scene duration = word_count * 0.13 seconds. Start/end times must chain perfectly.
6. AI Voice Realism Punctuation Tuning:
   - Modern neural AI voice models (ElevenLabs, Edge Neural) determine breathing pauses, emotional shifts, and intensity purely from punctuation.
   - Use short sentences (10-15 words) separated by periods (".") to force natural 0.7s breath resets.
   - Use commas (",") to simulate natural 0.3s quick pauses.
   - Use exclamation marks ("!") for high-intensity, excited, or dramatic segments to raise the AI's pitch and volume.
   - Use question marks ("?") to make rhetorical questions rise naturally at the end.
   - Never output long, unpunctuated sentences. Keep conversational Hinglish flow incredibly natural, conversational, and punchy, using spoken fillers (e.g., "Pata hai?", "Dosto,", "Socho,").

Return exactly this JSON schema (and absolutely nothing else):
{
  "script_text": "Full combined Roman script text here...",
  "characters": ["NARRATOR", "CHAR_A", ...],
  "estimated_duration_seconds": ${targetSeconds},
  "language": "${language}",
  "video_type": "${video_type}",
  "word_count": ${estimatedWords},
  "research_report": "${enable_research ? 'Pasted markdown research report...' : ''}",
  "scenes": [
    {
      "id": 1,
      "text": "Dialogue or narration of scene 1...",
      "character": "NARRATOR",
      "start_sec": 0,
      "end_sec": 8
    },
    ...
  ]
}`;

    const prompt = `Write a video script about: "${topic}". Remember target duration: ${duration_target}, type: ${video_type}, sub-genre: ${sub_genre}. Ensure output is raw JSON matching the schema.`;

    const responseData = await safeFetchJSON(`${PROXY_BASE_URL}/chat/completions`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${PROXY_CLIENT_KEY}`
      },
      body: JSON.stringify({
        model: model,
        messages: [
          { role: 'system', content: systemInstruction },
          { role: 'user', content: prompt }
        ],
        response_format: { type: 'json_object' }
      })
    });

    let resultText = '';
    if (responseData && responseData.choices && responseData.choices[0] && responseData.choices[0].message) {
      resultText = responseData.choices[0].message.content;
    } else {
      throw new Error('Received empty or invalid JSON response from Pollinations Proxy.');
    }

    if (!resultText) {
      throw new Error('Received empty response content from Pollinations.');
    }

    console.log('Parsing LLM script JSON...');
    const scriptJSON = cleanAndParseJSON(resultText);
    
    if (enable_research && researchReport) {
      scriptJSON.research_report = researchReport;
    }

    res.json(scriptJSON);
  } catch (error) {
    console.error('Error generating script:', error);
    res.status(500).json({ error: error.message || 'An error occurred during script generation.' });
  }
});

// Start the server
app.listen(PORT, () => {
  console.log(`Script Agent microservice is running on port ${PORT}`);
});
