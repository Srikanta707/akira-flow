const express = require('express');
const cors = require('cors');
const path = require('path');
const fs = require('fs');
const axios = require('axios');
const zlib = require('zlib');

const app = express();
const PORT = process.env.PORT || 3008;

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

// Express custom routing middleware to serve temp assets from agent directories
app.get('/temp/:filename', (req, res) => {
  const filename = req.params.filename;
  const cleanFilename = filename.split('?')[0];
  let fullPath = null;
  
  if (cleanFilename.startsWith('img_') || cleanFilename.startsWith('ref_')) {
    fullPath = path.join('/root/akira-flow/agents/image-agent/public/temp', cleanFilename);
  } else if (cleanFilename.startsWith('voice_') || cleanFilename.startsWith('master_job_') || cleanFilename.startsWith('master_17')) {
    fullPath = path.join('/root/akira-flow/agents/voice-agent/public/temp', cleanFilename);
  } else if (cleanFilename.startsWith('master_video_') || cleanFilename.startsWith('seg_') || cleanFilename.startsWith('concat_') || cleanFilename.startsWith('master_video_17')) {
    fullPath = path.join('/root/akira-flow/agents/video-agent/public/temp', cleanFilename);
  }
  
  if (fullPath && fs.existsSync(fullPath)) {
    return res.sendFile(fullPath);
  }
  
  res.status(404).send('Asset not found.');
});

// Persistent shared database for cloud jobs
const sharedDir = path.join('/root/akira-flow', 'shared');
if (!fs.existsSync(sharedDir)) {
  fs.mkdirSync(sharedDir, { recursive: true });
}

const dbPath = path.join(sharedDir, 'jobs_db.json');

// Helper to load jobs from SQLite-like JSON database
function loadJobs() {
  try {
    if (fs.existsSync(dbPath)) {
      return JSON.parse(fs.readFileSync(dbPath, 'utf8'));
    }
  } catch (e) {
    console.error("Error reading jobs database, returning empty list:", e);
  }
  return {};
}

// Helper to save jobs persistently on disk
function saveJobs(jobs) {
  try {
    fs.writeFileSync(dbPath, JSON.stringify(jobs, null, 2));
  } catch (e) {
    console.error("Error writing to jobs database:", e);
  }
}

// Get single job details
function getJob(jobId) {
  const jobs = loadJobs();
  return jobs[jobId] || null;
}

// Update single job status and progress
function updateJob(jobId, updates) {
  const jobs = loadJobs();
  if (jobs[jobId]) {
    for (const key in updates) {
      if (key.includes('.')) {
        const parts = key.split('.');
        let current = jobs[jobId];
        for (let i = 0; i < parts.length - 1; i++) {
          if (!current[parts[i]]) {
            current[parts[i]] = {};
          }
          current = current[parts[i]];
        }
        current[parts[parts.length - 1]] = updates[key];
      } else {
        jobs[jobId][key] = updates[key];
      }
    }
    saveJobs(jobs);
    console.log(`Job ${jobId} updated: Status=${jobs[jobId].status}, Step=${jobs[jobId].current_step}, Progress=${jobs[jobId].progress_percent}%`);
  }
}

// Background orchestration loop (Agent 1 -> Agent 2 -> Agent 3 -> Agent 4 -> Agent 5)
async function runOrchestration(jobId) {
  const job = getJob(jobId);
  if (!job || job.status === 'processing') return;

  updateJob(jobId, { status: 'processing', error_message: '' });

  try {
    // ----------------------------------------------------
    // STEP 1: SCRIPT AGENT
    // ----------------------------------------------------
    let scriptData = job.data.script;
    if (!scriptData) {
      updateJob(jobId, { current_step: 'script', progress_percent: 10 });
      console.log(`Orchestrator [Job ${jobId}]: Triggering Script Agent...`);
      
      const scriptRes = await axios.post('http://localhost:3001/api/generate-script', {
        topic: job.topic,
        duration_target: job.duration_target,
        language: job.language,
        video_type: job.video_type,
        sub_genre: job.sub_genre,
        model: job.model_script,
        enable_research: job.enable_research,
        tavily_key: job.tavily_key
      }, { timeout: 600000 }); // 10 minutes timeout

      scriptData = scriptRes.data;
      updateJob(jobId, { 'data.script': scriptData, progress_percent: 25 });
    }

    // Check if job was paused in between
    if (getJob(jobId).status !== 'processing') return;

    // ----------------------------------------------------
    // STEP 2: VOICE AGENT
    // ----------------------------------------------------
    let voiceData = job.data.voice;
    if (!voiceData) {
      updateJob(jobId, { current_step: 'voice', progress_percent: 30 });
      console.log(`Orchestrator [Job ${jobId}]: Triggering Voice Agent...`);

      // Configure voices mapping using selected voice_profile
      const voiceSettings = {};
      const characters = scriptData.characters || ['NARRATOR'];
      
      let selectedProvider = 'edge';
      if (job.voice_profile && (job.voice_profile.includes('acestep') || job.voice_profile.includes('tts') || job.voice_profile.includes('qwen'))) {
        selectedProvider = 'pollinations';
      }

      characters.forEach((char, index) => {
        if (index === 0 || char === 'NARRATOR') {
          voiceSettings[char] = {
            provider: selectedProvider,
            voice: job.voice_profile || 'en-US-GuyNeural',
            speed: 1.0
          };
        } else {
          // Alternative characters mapping fallback
          const isMale = index % 2 === 0;
          if (job.language === 'hindi') {
            voiceSettings[char] = {
              provider: 'edge',
              voice: isMale ? 'hi-IN-MadhurNeural' : 'hi-IN-SwaraNeural',
              speed: 1.0
            };
          } else {
            voiceSettings[char] = {
              provider: 'edge',
              voice: isMale ? 'en-US-GuyNeural' : 'en-US-JennyNeural',
              speed: 1.0
            };
          }
        }
      });

      const voiceRes = await axios.post('http://localhost:3002/api/generate-voice', {
        scenes: scriptData.scenes,
        voice_settings: voiceSettings
      }, { timeout: 600000 }); // 10 minutes timeout

      voiceData = voiceRes.data;
      updateJob(jobId, { 'data.voice': voiceData, progress_percent: 50 });
    }

    if (getJob(jobId).status !== 'processing') return;

    // ----------------------------------------------------
    // STEP 3: IMAGE AGENT
    // ----------------------------------------------------
    let imageData = job.data.images;
    if (!imageData) {
      updateJob(jobId, { current_step: 'image', progress_percent: 55 });
      console.log(`Orchestrator [Job ${jobId}]: Triggering Image Agent...`);

      const imgRes = await axios.post('http://localhost:3003/api/generate-images', {
        scenes: scriptData.scenes,
        video_type: job.video_type,
        model: job.model_image || 'flux'
      }, { timeout: 600000 }); // 10 minutes timeout

      imageData = imgRes.data;
      updateJob(jobId, { 'data.images': imageData, progress_percent: 75 });
    }

    if (getJob(jobId).status !== 'processing') return;

    // ----------------------------------------------------
    // STEP 4: VIDEO COMPOSER AGENT
    // ----------------------------------------------------
    let videoData = job.data.video;
    if (!videoData) {
      updateJob(jobId, { current_step: 'video', progress_percent: 80 });
      console.log(`Orchestrator [Job ${jobId}]: Triggering Video Composer Agent...`);

      const videoRes = await axios.post('http://localhost:3004/api/compose-video', {
        scenes: imageData.scenes,
        audio_timeline: voiceData.audio_timeline
      }, { timeout: 600000 }); // 10 minutes timeout

      videoData = videoRes.data;
      updateJob(jobId, { 'data.video': videoData, progress_percent: 90 });
    }

    if (getJob(jobId).status !== 'processing') return;

    // ----------------------------------------------------
    // STEP 5: REVIEW AGENT
    // ----------------------------------------------------
    let reviewData = job.data.review;
    if (!reviewData) {
      updateJob(jobId, { current_step: 'review', progress_percent: 92 });
      console.log(`Orchestrator [Job ${jobId}]: Triggering Review Agent...`);

      const reviewRes = await axios.post('http://localhost:3005/api/review-video', {
        scenes: scriptData.scenes,
        video_url: videoData.video_url
      }, { timeout: 600000 }); // 10 minutes timeout

      reviewData = reviewRes.data;
      updateJob(jobId, { 'data.review': reviewData, progress_percent: 100, status: 'done' });
      console.log(`Orchestrator [Job ${jobId}]: Video Generation completely successfully!`);
    }

  } catch (error) {
    console.error(`Orchestration error for Job ${jobId}:`, error);
    
    // Check if error is due to insufficient balance (402)
    const isCreditError = error.message.includes('402') || error.message.toLowerCase().includes('balance') || error.message.toLowerCase().includes('payment');
    
    updateJob(jobId, {
      status: isCreditError ? 'paused' : 'failed',
      error_message: error.message || 'An error occurred during agent orchestration.'
    });
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

// GET /api/models - Categorized and tagged model listing
app.get('/api/models', async (req, res) => {
  try {
    const PROXY_BASE_URL = 'https://ciel.sryze.cc/v1';
    const PROXY_CLIENT_KEY = 'ciel_sk_afba29f2e6defe1cdfbe057f85b1ecda';
    
    console.log('Querying models from local FastAPI proxy...');
    const data = await safeFetchJSON(`${PROXY_BASE_URL}/models`, {
      headers: {
        'Authorization': `Bearer ${PROXY_CLIENT_KEY}`
      }
    });

    const rawModels = data.data || [];
    const paidKeywords = ['large', 'pro', 'gpt-5', 'claude', 'grok', 'midijourney', 'reasoning', 'mistral-large', 'qwen-large', 'universal-3'];

    // 1. Text models filter and tag
    let textModels = rawModels.filter(m => {
      return m.input_modalities && m.input_modalities.includes('text') && m.output_modalities && m.output_modalities.includes('text');
    }).map(m => {
      const isPaid = paidKeywords.some(keyword => m.id.toLowerCase().includes(keyword));
      return {
        name: m.id,
        premium: isPaid,
        description: isPaid ? 'Premium Reasoning Model' : 'Free Modality'
      };
    });

    // 2. Image models filter and tag
    let imageModels = rawModels.filter(m => {
      return m.output_modalities && m.output_modalities.includes('image');
    }).map(m => {
      const isPaid = paidKeywords.some(keyword => m.id.toLowerCase().includes(keyword));
      return {
        name: m.id,
        premium: isPaid,
        description: isPaid ? 'Premium Visual Sheets Gen' : 'Free Modality'
      };
    });

    // Backups if empty
    if (textModels.length === 0) {
      textModels = [
        { name: 'openai-fast', premium: false, description: 'Free Modality — Fast Reasoning' },
        { name: 'mistral', premium: false, description: 'Free Modality — Multi-lingual precise' },
        { name: 'deepseek', premium: false, description: 'Free Modality — Deep reasoning and outline structure' },
        { name: 'llama', premium: false, description: 'Free Modality — Fast and creative' },
        { name: 'perplexity-fast', premium: false, description: 'Free Modality — Live search facts-retriever' },
        { name: 'kimi', premium: false, description: 'Free Modality — Ultra long context' }
      ];
    }
    if (imageModels.length === 0) {
      imageModels = [
        { name: 'flux', premium: false, description: 'Free Modality — High detail FLUX model' },
        { name: 'gptimage', premium: false, description: 'Free Modality — Quick and consistent SDXL' },
        { name: 'zimage', premium: false, description: 'Free Modality — Styled anime illustrations' }
      ];
    }

    res.json({ text: textModels, image: imageModels });

  } catch (error) {
    console.error('Error fetching models from proxy:', error);
    res.json({
      text: [
        { name: 'openai-fast', premium: false, description: 'Free Modality — Fast Reasoning' },
        { name: 'mistral', premium: false, description: 'Free Modality — Multi-lingual precise' },
        { name: 'deepseek', premium: false, description: 'Free Modality — Deep reasoning and outline structure' },
        { name: 'llama', premium: false, description: 'Free Modality — Fast and creative' },
        { name: 'perplexity-fast', premium: false, description: 'Free Modality — Live search facts-retriever' },
        { name: 'kimi', premium: false, description: 'Free Modality — Ultra long context' }
      ],
      image: [
        { name: 'flux', premium: false, description: 'Free Modality — High detail FLUX model' },
        { name: 'gptimage', premium: false, description: 'Free Modality — Quick and consistent SDXL' },
        { name: 'zimage', premium: false, description: 'Free Modality — Styled anime illustrations' }
      ]
    });
  }
});

// GET /api/jobs - List all jobs
app.get('/api/jobs', (req, res) => {
  const jobs = loadJobs();
  const list = Object.values(jobs).reverse();
  res.json(list);
});

// GET /api/jobs/:id - Check job status
app.get('/api/jobs/:id', (req, res) => {
  const job = getJob(req.params.id);
  if (!job) {
    return res.status(404).json({ error: 'Job not found.' });
  }
  res.json(job);
});

// DELETE /api/jobs/:id - Delete a job
app.delete('/api/jobs/:id', (req, res) => {
  const jobs = loadJobs();
  const jobId = req.params.id;

  if (!jobs[jobId]) {
    return res.status(404).json({ error: 'Job not found.' });
  }

  delete jobs[jobId];
  saveJobs(jobs);
  res.json({ success: true });
});

// POST /api/jobs/:id/retry - Retry a failed job
app.post('/api/jobs/:id/retry', (req, res) => {
  const jobId = req.params.id;
  const job = getJob(jobId);

  if (!job) {
    return res.status(404).json({ error: 'Job not found.' });
  }

  if (job.status !== 'failed') {
    return res.status(400).json({ error: 'Only failed jobs can be retried.' });
  }

  // Determine which pipeline steps to clear (from failed step onward)
  const pipelineSteps = ['script', 'voice', 'images', 'video', 'review', 'thumbnails'];
  const failedStepIndex = pipelineSteps.indexOf(job.current_step);

  const updates = {
    status: 'pending',
    error_message: '',
    progress_percent: 0
  };

  // Clear data for the failed step and all subsequent steps
  if (failedStepIndex >= 0) {
    for (let i = failedStepIndex; i < pipelineSteps.length; i++) {
      updates[`data.${pipelineSteps[i]}`] = null;
    }
  }

  updateJob(jobId, updates);

  // Re-trigger orchestration
  runOrchestration(jobId);

  res.json({ job_id: jobId, status: 'pending' });
});

// GET /api/voice-models - Dynamic proxy to fetch voices from Voice Agent
app.get('/api/voice-models', async (req, res) => {
  try {
    const data = await safeFetchJSON('http://localhost:3002/api/models');
    res.json(data);
  } catch (error) {
    console.error('Error proxying voice models:', error);
    // Return robust local presets fallback
    res.json({
      edge: [
        { id: 'hi-IN-SwaraNeural', name: 'Swara (Hindi Female)', provider: 'edge', gender: 'female', lang: 'hindi' },
        { id: 'hi-IN-MadhurNeural', name: 'Madhur (Hindi Male)', provider: 'edge', gender: 'male', lang: 'hindi' },
        { id: 'en-US-JennyNeural', name: 'Jenny (English Female)', provider: 'edge', gender: 'female', lang: 'english' },
        { id: 'en-US-GuyNeural', name: 'Guy (English Male)', provider: 'edge', gender: 'male', lang: 'english' },
        { id: 'en-GB-SoniaNeural', name: 'Sonia (British Female)', provider: 'edge', gender: 'female', lang: 'english' },
        { id: 'en-US-AriaNeural', name: 'Aria (English Dialect Female)', provider: 'edge', gender: 'female', lang: 'english' }
      ],
      pollinations: [
        { id: 'acestep', name: 'Acestep (Free AI speech)', provider: 'pollinations', gender: 'neutral', lang: 'multi' },
        { id: 'qwen-tts', name: 'Qwen TTS (Free AI Speech)', provider: 'pollinations', gender: 'neutral', lang: 'multi' }
      ]
    });
  }
});

// POST /api/jobs - Create and trigger new background job
app.post('/api/jobs', (req, res) => {
  const {
    topic,
    video_type = 'story_anime',
    sub_genre = '',
    duration_target = '1 min',
    language = 'english',
    model_script = 'openai-fast',
    model_image = 'flux',
    enable_research = false,
    voice_profile = 'en-US-GuyNeural',
    tavily_key = ''
  } = req.body;

  if (!topic) {
    return res.status(400).json({ error: 'Topic is required.' });
  }

  const jobId = `job_${Date.now()}`;
  const newJob = {
    job_id: jobId,
    topic,
    video_type,
    sub_genre,
    duration_target,
    language,
    model_script,
    model_image,
    enable_research,
    voice_profile,
    tavily_key,
    status: 'pending',
    current_step: 'script',
    progress_percent: 0,
    error_message: '',
    created_at: new Date().toISOString(),
    data: {
      script: null,
      voice: null,
      images: null,
      video: null,
      review: null,
      thumbnails: null
    }
  };

  const jobs = loadJobs();
  jobs[jobId] = newJob;
  saveJobs(jobs);

  // Trigger orchestration asynchronously in the background (cloud processing)
  runOrchestration(jobId);

  res.json({ job_id: jobId, status: 'pending' });
});

// POST /api/jobs/:id/resume - Resume paused background job
app.post('/api/jobs/:id/resume', (req, res) => {
  const jobId = req.params.id;
  const job = getJob(jobId);

  if (!job) {
    return res.status(404).json({ error: 'Job not found.' });
  }

  // Trigger background loop asynchronously
  runOrchestration(jobId);

  res.json({ job_id: jobId, status: 'processing' });
});

// POST /api/jobs/:id/thumbnail - On-demand Thumbnail Generator (Generates 3 templates)
app.post('/api/jobs/:id/thumbnail', async (req, res) => {
  const jobId = req.params.id;
  const job = getJob(jobId);

  if (!job || !job.data.script) {
    return res.status(400).json({ error: 'Job or script outline not found. Cannot generate thumbnail.' });
  }

  console.log(`Generating YouTube Thumbnails for Job ${jobId}...`);
  const script = job.data.script;

  try {
    const templates = [
      `eye-catching youtube thumbnail, high contrast, dramatic text "SACRIFICE" in bold neon fonts, anime style key frame about ${job.topic}, 4k resolution`,
      `epic viral youtube thumbnail, highly detailed, mystery concept, warning signs, face of key character, neon pink highlight, 4k`,
      `trending youtube thumbnail frame, face-slapping drama style, anime expressions, neon glowing borders, title placeholder "THE TRUTH", 4k`
    ];

    const generatedThumbnails = [];

    for (let i = 0; i < templates.length; i++) {
      const imgRes = await axios.post('http://localhost:3003/api/generate-images', {
        scenes: [{ scene_id: `thumb_${i}`, text: templates[i] }],
        model: job.model_image || 'flux',
        video_type: job.video_type
      }, { timeout: 600000 }); // 10 minutes timeout

      const resData = imgRes.data;
      if (resData.scenes && resData.scenes.length > 0) {
        generatedThumbnails.push(resData.scenes[0].image_url);
      }
    }

    updateJob(jobId, { 'data.thumbnails': generatedThumbnails });
    res.json({ thumbnails: generatedThumbnails });

  } catch (error) {
    console.error('Error generating thumbnails:', error);
    res.status(500).json({ error: 'Failed to generate thumbnails.' });
  }
});

// Start Orchestrator

// Pollinations Credit Background Worker (Every 5 minutes)
const PROXY_BASE_URL = 'https://ciel.sryze.cc/v1';
const PROXY_CLIENT_KEY = 'ciel_sk_afba29f2e6defe1cdfbe057f85b1ecda';
setInterval(async () => {
  try {
    const res = await axios.get(`${PROXY_BASE_URL}/account/balance`, {
      headers: { 'Authorization': `Bearer ${PROXY_CLIENT_KEY}` },
      timeout: 5000
    });
    if (res.data && res.data.balance !== undefined) {
      const balance = res.data.balance;
      console.log(`[Credit Worker] Current Balance: ${balance}`);
      const jobs = loadJobs();
      let jobsUpdated = false;
      if (balance <= 0) {
        for (const jid in jobs) {
          if (jobs[jid].status === 'processing') {
            jobs[jid].status = 'paused_credits';
            jobs[jid].error_message = 'Paused - Waiting for Credits';
            console.log(`[Credit Worker] Pausing Job ${jid} due to low credits.`);
            jobsUpdated = true;
          }
        }
      } else {
        for (const jid in jobs) {
          if (jobs[jid].status === 'paused_credits') {
            jobs[jid].status = 'pending';
            jobs[jid].error_message = '';
            console.log(`[Credit Worker] Resuming Job ${jid} as credits refilled!`);
            jobsUpdated = true;
            setTimeout(() => runOrchestration(jid), 1000);
          }
        }
      }
      if (jobsUpdated) saveJobs(jobs);
    }
  } catch (error) {
    // Ignore fetch errors during polling to prevent log spam
  }
}, 5 * 60 * 1000);

app.listen(PORT, () => {
  console.log(`Main Orchestrator Hub is running on port ${PORT}`);
  
  // Auto-recovery: If any job was in "processing" state on startup, revert it to "paused"
  // so the user can resume it seamlessly (or let auto-resume pick it up)
  try {
    const jobs = loadJobs();
    let updated = false;
    for (const id in jobs) {
      if (jobs[id].status === 'processing') {
        jobs[id].status = 'paused';
        jobs[id].error_message = 'Orchestrator server restarted. Pipeline paused safely.';
        updated = true;
      }
    }
    if (updated) {
      saveJobs(jobs);
      console.log("Auto-recovered crashed/interrupted processing jobs on startup.");
    }
  } catch (err) {
    console.error("Failed to run startup database recovery:", err);
  }
});
