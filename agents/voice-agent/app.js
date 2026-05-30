const express = require('express');
const cors = require('cors');
const path = require('path');
const fs = require('fs');
const { exec } = require('child_process');
const { MsEdgeTTS, OUTPUT_FORMAT } = require('msedge-tts');
const axios = require('axios');
const zlib = require('zlib');

const app = express();
const PORT = process.env.PORT || 3002;

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

// Helper to get precise audio duration using ffprobe
function getAudioDuration(filePath) {
  return new Promise((resolve, reject) => {
    exec(`ffprobe -i "${filePath}" -show_entries format=duration -v quiet -of csv="p=0"`, (error, stdout, stderr) => {
      if (error) {
        console.error(`ffprobe error for ${filePath}:`, error);
        return reject(error);
      }
      const duration = parseFloat(stdout.trim());
      if (isNaN(duration)) {
        return reject(new Error("Could not parse audio duration"));
      }
      resolve(duration);
    });
  });
}

// Helper to map 0.8x-1.2x speed to MS Edge TTS rate percentages (e.g., 1.1 -> "+10%", 0.8 -> "-20%")
function getRatePercentage(speed) {
  const diff = Math.round((speed - 1) * 100);
  if (diff >= 0) {
    return `+${diff}%`;
  } else {
    return `${diff}%`;
  }
}

// GET /api/models - Discover TTS options via Proxy
app.get('/api/models', async (req, res) => {
  try {
    // 1. Standard Edge TTS Voices (Free)
    const edgeVoices = [
      { id: 'hi-IN-SwaraNeural', name: 'Swara (Hindi Female)', provider: 'edge', gender: 'female', lang: 'hindi' },
      { id: 'hi-IN-MadhurNeural', name: 'Madhur (Hindi Male)', provider: 'edge', gender: 'male', lang: 'hindi' },
      { id: 'en-US-JennyNeural', name: 'Jenny (English Female)', provider: 'edge', gender: 'female', lang: 'english' },
      { id: 'en-US-GuyNeural', name: 'Guy (English Male)', provider: 'edge', gender: 'male', lang: 'english' },
      { id: 'en-US-AriaNeural', name: 'Aria (English Female)', provider: 'edge', gender: 'female', lang: 'english' },
      { id: 'en-US-LiamNeural', name: 'Liam (English Male)', provider: 'edge', gender: 'male', lang: 'english' }
    ];

    // 2. Query Pollinations TTS models from Proxy Router
    let pollinationsVoices = [];
    try {
      const data = await safeFetchJSON(`${PROXY_BASE_URL}/models`, {
        headers: {
          'Authorization': `Bearer ${PROXY_CLIENT_KEY}`
        }
      });
      
      const rawModels = data.data || [];
      
      // Filter models that support audio output and are free
      const audioModels = rawModels.filter(m => {
        const isAudio = m.output_modalities && m.output_modalities.includes('audio');
        const isPaid = m.id.toLowerCase().includes('universal-3'); // filter out premium universal-3-pro
        return isAudio && !isPaid;
      });

      pollinationsVoices = audioModels.map(m => ({
        id: m.id,
        name: `${m.id.charAt(0).toUpperCase() + m.id.slice(1)} (Free AI Speech)`,
        provider: 'pollinations',
        gender: 'neutral',
        lang: 'multi'
      }));
    } catch (e) {
      console.warn("Pollinations models fetch failed or timed out. Using default presets.", e);
    }

    // Default backup AI models if API is down
    if (pollinationsVoices.length === 0) {
      pollinationsVoices = [
        { id: 'acestep', name: 'Acestep (Free AI speech)', provider: 'pollinations', gender: 'neutral', lang: 'multi' },
        { id: 'qwen-tts', name: 'Qwen TTS (Free AI Speech)', provider: 'pollinations', gender: 'neutral', lang: 'multi' }
      ];
    }

    res.json({
      edge: edgeVoices,
      pollinations: pollinationsVoices
    });
  } catch (error) {
    console.error('Error fetching voice models:', error);
    res.status(500).json({ error: 'Failed to fetch models.' });
  }
});

// POST /api/preview-voice - Quickly play a voice sample
app.post('/api/preview-voice', async (req, res) => {
  const { provider = 'edge', voice, speed = 1.0, text = 'Akira Flow voice model preview!' } = req.body;

  if (!voice) {
    return res.status(400).json({ error: 'Voice ID is required.' });
  }

  const sampleId = `sample_${Date.now()}`;
  const outputPath = path.join(tempDir, `${sampleId}.mp3`);
  const relativeUrl = `/temp/${sampleId}.mp3`;

  try {
    if (provider === 'edge') {
      const tts = new MsEdgeTTS();
      await tts.setMetadata(voice, OUTPUT_FORMAT.AUDIO_24KHZ_48KBITRATE_MONO_MP3);
      
      const rate = getRatePercentage(speed);
      const { audioStream } = tts.toStream(text, { rate });
      
      const writeStream = fs.createWriteStream(outputPath);
      audioStream.pipe(writeStream);
      
      await new Promise((resolve, reject) => {
        writeStream.on('finish', resolve);
        writeStream.on('error', reject);
      });

    } else {
      // Pollinations AI Tier (Routed through Proxy)
      const url = `${PROXY_BASE_URL}/audio/${encodeURIComponent(text)}?model=${encodeURIComponent(voice)}`;
      console.log(`Calling Proxy TTS Preview: ${url}`);
      
      const response = await axios({
        url: url,
        method: 'GET',
        headers: {
          'Authorization': `Bearer ${PROXY_CLIENT_KEY}`
        },
        responseType: 'arraybuffer'
      });

      const buffer = Buffer.from(response.data);
      fs.writeFileSync(outputPath, buffer);
    }

    res.json({ sample_url: relativeUrl });
  } catch (error) {
    console.error('Error generating preview:', error);
    res.status(500).json({ error: error.message || 'Failed to generate voice preview.' });
  }
});

// POST /api/generate-voice - Generate voice-overs for the entire script and merge them via Proxy
app.post('/api/generate-voice', async (req, res) => {
  const { scenes, voice_settings = {} } = req.body;

  if (!scenes || !Array.isArray(scenes) || scenes.length === 0) {
    return res.status(400).json({ error: 'Scenes array is required.' });
  }

  const jobId = `job_${Date.now()}`;
  const generatedFiles = [];
  const audioTimeline = [];
  let currentStartSec = 0;

  try {
    for (const scene of scenes) {
      const sceneId = scene.id;
      const text = scene.text;
      const speaker = scene.character || 'NARRATOR';

      const speakerConfig = voice_settings[speaker] || voice_settings['NARRATOR'] || {
        provider: 'edge',
        voice: 'en-US-JennyNeural',
        speed: 1.0
      };

      const sceneFilename = `voice_${jobId}_scene_${sceneId}.mp3`;
      const scenePath = path.join(tempDir, sceneFilename);

      console.log(`Generating speech for Scene ${sceneId} (${speaker}): "${text.substring(0, 40)}..." using ${speakerConfig.voice}`);

      if (speakerConfig.provider === 'edge') {
        const tts = new MsEdgeTTS();
        await tts.setMetadata(speakerConfig.voice, OUTPUT_FORMAT.AUDIO_24KHZ_48KBITRATE_MONO_MP3);
        
        const rate = getRatePercentage(speakerConfig.speed || 1.0);
        const { audioStream } = tts.toStream(text, { rate });
        
        const writeStream = fs.createWriteStream(scenePath);
        audioStream.pipe(writeStream);
        
        await new Promise((resolve, reject) => {
          writeStream.on('finish', resolve);
          writeStream.on('error', reject);
        });

      } else {
        // Pollinations AI Tier (Routed through Proxy)
        const url = `${PROXY_BASE_URL}/audio/${encodeURIComponent(text)}?model=${encodeURIComponent(speakerConfig.voice)}`;
        const response = await axios({
          url: url,
          method: 'GET',
          headers: {
            'Authorization': `Bearer ${PROXY_CLIENT_KEY}`
          },
          responseType: 'arraybuffer'
        });

        const buffer = Buffer.from(response.data);
        fs.writeFileSync(scenePath, buffer);
      }

      // Apply FFmpeg Humanizer
      const enhance = voice_settings.enhance !== false; // Default ON
      if (enhance) {
        const enhancedPath = scenePath.replace('.mp3', '_enhanced.mp3');
        await new Promise((resolve, reject) => {
          const filter = "silenceremove=stop_periods=-1:stop_duration=0.5:stop_threshold=-50dB, aformat=channel_layouts=mono, anequalizer=c0 f=1000 w=200 g=2, loudnorm";
          exec(`ffmpeg -i "${scenePath}" -af "${filter}" -y "${enhancedPath}"`, (err) => {
            if (err) {
              console.warn("FFmpeg filter failed, using original:", err.message);
              resolve();
            } else {
              fs.renameSync(enhancedPath, scenePath);
              resolve();
            }
          });
        });
      }

      // Get exact duration of generated MP3 file
      const duration = await getAudioDuration(scenePath);
      const endSec = parseFloat((currentStartSec + duration).toFixed(2));

      audioTimeline.push({
        id: sceneId,
        character: speaker,
        start_sec: currentStartSec,
        end_sec: endSec,
        duration_sec: parseFloat(duration.toFixed(2)),
        file_url: `/temp/${sceneFilename}`
      });

      generatedFiles.push(scenePath);
      currentStartSec = endSec;
    }

    // Merge audio files using FFmpeg concat stream copy
    const concatFilePath = path.join(tempDir, `concat_${jobId}.txt`);
    const masterFilename = `master_${jobId}.mp3`;
    const masterPath = path.join(tempDir, masterFilename);

    const fileListContent = generatedFiles.map(fp => `file '${fp}'`).join('\n');
    fs.writeFileSync(concatFilePath, fileListContent);

    console.log(`Concatenating ${generatedFiles.length} files into Master Audio track...`);
    await new Promise((resolve, reject) => {
      // Use re-encoding (-c:a libmp3lame) instead of copy to ensure sample rate consistency
      exec(`ffmpeg -f concat -safe 0 -i "${concatFilePath}" -c:a libmp3lame -q:a 4 -y "${masterPath}"`, (error, stdout, stderr) => {
        try { fs.unlinkSync(concatFilePath); } catch (e) {}
        
        if (error) {
          console.error("FFmpeg merge error:", error);
          return reject(error);
        }
        resolve();
      });
    });

    res.json({
      audio_timeline: audioTimeline,
      master_audio_url: `/temp/${masterFilename}`,
      total_duration_seconds: currentStartSec
    });

  } catch (error) {
    console.error('Error generating audio timeline:', error);
    generatedFiles.forEach(fp => {
      try { fs.unlinkSync(fp); } catch (e) {}
    });
    res.status(500).json({ error: error.message || 'Failed to generate speech timeline.' });
  }
});

// Periodic cleanup of temp directory (files older than 1 hour)
setInterval(() => {
  try {
    const files = fs.readdirSync(tempDir);
    const now = Date.now();
    const expiryTime = 60 * 60 * 1000;
    
    files.forEach(file => {
      const filePath = path.join(tempDir, file);
      const stat = fs.statSync(filePath);
      if (now - stat.mtimeMs > expiryTime) {
        fs.unlinkSync(filePath);
      }
    });
  } catch (e) {
    console.error("Error cleaning temp voice files:", e);
  }
}, 30 * 60 * 1000);

app.listen(PORT, () => {
  console.log(`Voice Agent microservice is running on port ${PORT}`);
});
