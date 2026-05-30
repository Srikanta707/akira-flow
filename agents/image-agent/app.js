const express = require('express');
const cors = require('cors');
const path = require('path');
const fs = require('fs');
const axios = require('axios');
const zlib = require('zlib');

const app = express();
const PORT = process.env.PORT || 3003;

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

// Ensure temp directory exists inside public
const tempDir = path.join(__dirname, 'public', 'temp');
if (!fs.existsSync(tempDir)) {
  fs.mkdirSync(tempDir, { recursive: true });
}

// GET /api/models - Discover Image models
app.get('/api/models', async (req, res) => {
  try {
    console.log('Querying image models from local FastAPI proxy...');
    const data = await safeFetchJSON(`${PROXY_BASE_URL}/models`, {
      headers: {
        'Authorization': `Bearer ${PROXY_CLIENT_KEY}`
      }
    });

    const rawModels = data.data || [];

    // Filter models that support image output
    const imageModels = rawModels.filter(m => m.output_modalities && m.output_modalities.includes('image'));
    const freeImageModels = imageModels.map(m => ({
      name: m.id,
      description: `Free Modality — Image Gen`
    }));

    if (freeImageModels.length === 0) {
      res.json([
        { name: 'flux', description: 'Free Modality — High detail FLUX model' },
        { name: 'gptimage', description: 'Free Modality — Quick and consistent SDXL' },
        { name: 'zimage', description: 'Free Modality — Styled anime illustrations' }
      ]);
    } else {
      res.json(freeImageModels);
    }
  } catch (error) {
    console.error('Error fetching image models:', error);
    res.json([
      { name: 'flux', description: 'Free Modality — High detail FLUX model' },
      { name: 'gptimage', description: 'Free Modality — Quick and consistent SDXL' },
      { name: 'zimage', description: 'Free Modality — Styled anime illustrations' }
    ]);
  }
});

// POST /api/generate-images - Process script scenes and generate consistent images
app.post('/api/generate-images', async (req, res) => {
  const { scenes, model = 'flux', video_type = 'story_anime' } = req.body;

  if (!scenes || !Array.isArray(scenes) || scenes.length === 0) {
    return res.status(400).json({ error: 'Scenes array is required.' });
  }

  const jobId = `job_${Date.now()}`;
  const generatedScenes = [];
  const characterSheets = {};

  try {
    // 1. Identify unique characters and generate consistent reference character sheets
    const uniqueCharacters = new Set();
    scenes.forEach(s => {
      if (s.character && s.character !== 'NARRATOR') {
        uniqueCharacters.add(s.character);
      }
    });

    const charactersArray = Array.from(uniqueCharacters);
    console.log(`Generating character reference sheets for: ${charactersArray.join(', ')}`);

    // Parallelize character reference sheet generation
    await Promise.all(charactersArray.map(async (char) => {
      const refFilename = `ref_${jobId}_${char}.jpg`;
      const refPath = path.join(tempDir, refFilename);

      const stylePrefix = video_type === 'story_anime' ? 'anime style, vibrant coloring, cinematic lighting, detailed, ' : 'cinematic style, realistic lighting, detailed, ';
      const promptText = `${stylePrefix}character model sheet showing front face close up of ${char}, consistent design, detailed hair and eyes, high resolution, 4k`;

      const url = `https://ciel.sryze.cc/image/${encodeURIComponent(promptText)}?model=${encodeURIComponent(model)}`;
      
      console.log(`Calling Proxy Image Gen for Character Sheet: ${char}`);
      const axiosRes = await axios({
        url: url,
        method: 'GET',
        headers: {
          'Authorization': `Bearer ${PROXY_CLIENT_KEY}`
        },
        responseType: 'arraybuffer',
        timeout: 120000 // 2 min timeout
      });

      const buffer = Buffer.from(axiosRes.data);
      fs.writeFileSync(refPath, buffer);
      characterSheets[char] = `/temp/${refFilename}`;
    }));

    // 2. Generate a visual scene for each script scene in parallel
    console.log(`Launching parallel generation for ${scenes.length} scenes...`);
    const scenePromises = scenes.map(async (scene) => {
      const sceneId = scene.id;
      const text = scene.text;
      const speaker = scene.character || 'NARRATOR';

      const sceneFilename = `img_${jobId}_scene_${sceneId}.jpg`;
      const scenePath = path.join(tempDir, sceneFilename);

      const stylePrefix = video_type === 'story_anime' ? 'anime style key visual, vibrant coloring, highly detailed, cinematic lighting, ' : 'cinematic frame, 4k resolution, highly detailed, photorealistic lighting, ';
      
      let promptText = `${stylePrefix}${text}`;
      if (speaker !== 'NARRATOR' && characterSheets[speaker]) {
        promptText += `, featuring the character ${speaker} as shown in reference sheet`;
      }

      const url = `https://ciel.sryze.cc/image/${encodeURIComponent(promptText)}?model=${encodeURIComponent(model)}`;
      console.log(`Generating Scene ${sceneId} Image Prompt: "${promptText.substring(0, 50)}..."`);
      
      const axiosRes = await axios({
        url: url,
        method: 'GET',
        headers: {
          'Authorization': `Bearer ${PROXY_CLIENT_KEY}`
        },
        responseType: 'arraybuffer',
        timeout: 120000 // 2 min timeout
      });

      const buffer = Buffer.from(axiosRes.data);
      fs.writeFileSync(scenePath, buffer);

      return {
        scene_id: sceneId,
        image_url: `/temp/${sceneFilename}`,
        prompt_used: promptText
      };
    });

    const results = await Promise.all(scenePromises);
    generatedScenes.push(...results);

    res.json({
      scenes: generatedScenes.sort((a, b) => a.scene_id - b.scene_id),
      character_sheets: characterSheets
    });

  } catch (error) {
    console.error('Error generating images:', error);
    res.status(500).json({ error: error.message || 'Failed to generate scene images.' });
  }
});

// Periodic cleanup of temp images older than 2 hours
setInterval(() => {
  try {
    const files = fs.readdirSync(tempDir);
    const now = Date.now();
    const expiryTime = 2 * 60 * 60 * 1000; // 2 hours
    
    files.forEach(file => {
      const filePath = path.join(tempDir, file);
      const stat = fs.statSync(filePath);
      if (now - stat.mtimeMs > expiryTime) {
        fs.unlinkSync(filePath);
      }
    });
  } catch (e) {
    console.error("Error cleaning temp images:", e);
  }
}, 30 * 60 * 1000);

app.listen(PORT, () => {
  console.log(`Image Agent microservice is running on port ${PORT}`);
});
