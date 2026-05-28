// Helper to manage cookies for persistence
function setCookie(name, value, days) {
  let expires = "";
  if (days) {
    let date = new Date();
    date.setTime(date.getTime() + (days * 24 * 60 * 60 * 1000));
    expires = "; expires=" + date.toUTCString();
  }
  document.cookie = name + "=" + (value || "") + expires + "; path=/";
}

function getCookie(name) {
  let nameEQ = name + "=";
  let ca = document.cookie.split(';');
  for(let i=0;i < ca.length;i++) {
    let c = ca[i];
    while (c.charAt(0)==' ') c = c.substring(1,c.length);
    if (c.indexOf(nameEQ) == 0) return c.substring(nameEQ.length,c.length);
  }
  return null;
}

// Format seconds to mm:ss
function formatTime(seconds) {
  if (seconds === undefined || seconds === null || isNaN(seconds)) return '00:00';
  const m = Math.floor(seconds / 60);
  const s = Math.floor(seconds % 60);
  const pad = (num) => String(num).padStart(2, '0');
  return `${pad(m)}:${pad(s)}`;
}

// Convert ISO timestamp to relative time string (e.g. 5m ago)
function getRelativeTime(isoString) {
  if (!isoString) return 'just now';
  const now = new Date();
  const past = new Date(isoString);
  const diffMs = now - past;
  const diffSec = Math.floor(diffMs / 1000);
  
  if (diffSec < 60) return 'just now';
  
  const diffMin = Math.floor(diffSec / 60);
  if (diffMin < 60) return `${diffMin}m ago`;
  
  const diffHr = Math.floor(diffMin / 60);
  if (diffHr < 24) return `${diffHr}h ago`;
  
  const diffDays = Math.floor(diffHr / 24);
  return `${diffDays}d ago`;
}

// App State
let activeJobId = localStorage.getItem('akira_active_job_id') || getCookie('akira_active_job_id') || null;
let pollInterval = null;
let simulatedLogInterval = null;
let lastProgress = -1;

// Elements
const homeScreen = document.getElementById('home-screen');
const workspaceScreen = document.getElementById('workspace-screen');
const orchestrationForm = document.getElementById('orchestration-form');
const topicInput = document.getElementById('topic-input');
const videoTypeSelect = document.getElementById('video-type');
const subGenreSelect = document.getElementById('sub-genre-select');
const subGenreFormGroup = document.getElementById('sub-genre-form-group');
const durationTargetSelect = document.getElementById('duration-target');
const languageSelect = document.getElementById('language-select');
const modelScriptSelect = document.getElementById('model-script');
const modelImageSelect = document.getElementById('model-image');
const researchSwitch = document.getElementById('research-switch');
const launchPipelineBtn = document.getElementById('launch-pipeline-btn');
const cloudJobsContainer = document.getElementById('cloud-jobs-container');
const jobsCountText = document.getElementById('jobs-count');
const backHomeBtn = document.getElementById('back-home-btn');

// Workspace elements
const nodeScript = document.getElementById('node-script');
const nodeVoice = document.getElementById('node-voice');
const nodeImage = document.getElementById('node-image');
const nodeVideo = document.getElementById('node-video');
const nodeReview = document.getElementById('node-review');
const line1 = document.getElementById('line-1');
const line2 = document.getElementById('line-2');
const line3 = document.getElementById('line-3');
const line4 = document.getElementById('line-4');

const activeAgentLabel = document.getElementById('active-agent-label');
const activeProgressPercent = document.getElementById('active-progress-percent');
const workspaceProgressFill = document.getElementById('workspace-progress-fill');
const creditPauseAlert = document.getElementById('credit-pause-alert');
const resumeJobBtn = document.getElementById('resume-job-btn');
const workspaceScenesContainer = document.getElementById('workspace-scenes-container');

// Media elements
const reviewScoreBadge = document.getElementById('review-score-badge');
const videoRenderingOverlay = document.getElementById('video-rendering-overlay');
const videoPlayerStatus = document.getElementById('video-player-status');
const masterVideoPlayer = document.getElementById('master-video-player');
const exportDownloadBtn = document.getElementById('export-download-btn');
const generateThumbnailsBtn = document.getElementById('generate-thumbnails-btn');
const thumbnailsContainer = document.getElementById('thumbnails-container');

// Logs
const consoleLogsContainer = document.getElementById('console-logs-container');
const logTimestamp = document.getElementById('log-timestamp');

// Auto-Resume Toggle inside Settings or State
let autoResumeEnabled = localStorage.getItem('akira_auto_resume') === 'true';

// Add Auto-Resume Option dynamically to form
const autoResumeWrapper = document.createElement('div');
autoResumeWrapper.className = 'form-group';
autoResumeWrapper.innerHTML = `
  <label>Auto-Resume on Limit</label>
  <div class="switch-container">
    <div>
      <span style="font-size: 0.8rem; font-weight: 500;">Fail-Safe Auto-Resume</span>
      <p style="font-size: 0.65rem; color: var(--text-muted);">Automatically retries every 30s when credits run out</p>
    </div>
    <label class="switch">
      <input type="checkbox" id="auto-resume-switch" ${autoResumeEnabled ? 'checked' : ''}>
      <span class="slider"></span>
    </label>
  </div>
`;
orchestrationForm.insertBefore(autoResumeWrapper, orchestrationForm.lastElementChild);

const autoResumeSwitch = document.getElementById('auto-resume-switch');
autoResumeSwitch.addEventListener('change', (e) => {
  autoResumeEnabled = e.target.checked;
  localStorage.setItem('akira_auto_resume', autoResumeEnabled);
});

// Preset Buttons
document.getElementById('preset-scifi-btn').addEventListener('click', () => {
  topicInput.value = "A cyberpunk detective discovers that his own neural memory chips are cloned from a criminal mastermind executed 10 years ago.";
  videoTypeSelect.value = "story_anime";
  triggerGenreToggle();
});

document.getElementById('preset-reels-btn').addEventListener('click', () => {
  topicInput.value = "3 mind-bending space relativity facts that will make you feel incredibly tiny in the universe.";
  videoTypeSelect.value = "youtube_hook";
  triggerGenreToggle();
});

// Setup styles toggle based on style choice
function triggerGenreToggle() {
  if (videoTypeSelect.value === 'youtube_hook') {
    subGenreFormGroup.style.display = 'none';
  } else {
    subGenreFormGroup.style.display = 'block';
  }
}
videoTypeSelect.addEventListener('change', triggerGenreToggle);

// Initialize Page
document.addEventListener('DOMContentLoaded', () => {
  triggerGenreToggle();
  fetchAnimeGenres();
  fetchModels();
  fetchJobsList();

  // Light/Dark Theme Toggle logic
  const themeToggleBtn = document.getElementById('theme-toggle-btn');
  let currentTheme = localStorage.getItem('akira_theme') || 'light';
  
  if (currentTheme === 'dark') {
    document.body.classList.add('dark-theme');
    if (themeToggleBtn) themeToggleBtn.textContent = '🌙';
  } else {
    document.body.classList.remove('dark-theme');
    if (themeToggleBtn) themeToggleBtn.textContent = '☀️';
  }
  
  if (themeToggleBtn) {
    themeToggleBtn.addEventListener('click', () => {
      if (document.body.classList.contains('dark-theme')) {
        document.body.classList.remove('dark-theme');
        themeToggleBtn.textContent = '☀️';
        localStorage.setItem('akira_theme', 'light');
        addLog('☀️ Light Theme Enabled');
      } else {
        document.body.classList.add('dark-theme');
        themeToggleBtn.textContent = '🌙';
        localStorage.setItem('akira_theme', 'dark');
        addLog('🌙 Dark Theme Enabled');
      }
    });
  }
  
  // Continuous server timestamp simulation
  setInterval(() => {
    const d = new Date();
    logTimestamp.textContent = d.toTimeString().split(' ')[0];
  }, 1000);

  // Copy Logs to Clipboard
  const copyLogsBtn = document.getElementById('copy-logs-btn');
  if (copyLogsBtn) {
    copyLogsBtn.addEventListener('click', () => {
      const lines = Array.from(consoleLogsContainer.querySelectorAll('.console-line'))
        .map(el => el.textContent)
        .join('\n');
      navigator.clipboard.writeText(lines).then(() => {
        const origText = copyLogsBtn.textContent;
        copyLogsBtn.textContent = 'Copied! ✅';
        setTimeout(() => {
          copyLogsBtn.textContent = origText;
        }, 2000);
      }).catch(err => {
        console.error('Could not copy logs: ', err);
      });
    });
  }

  // If a job was already active, reload it directly (zero-loss persistence)
  if (activeJobId) {
    switchToScreen('workspace');
    startPollingJob(activeJobId);
  }
});

// Switch screens
function switchToScreen(screen) {
  if (screen === 'workspace') {
    homeScreen.style.display = 'none';
    workspaceScreen.style.display = 'block';
  } else {
    workspaceScreen.style.display = 'none';
    homeScreen.style.display = 'grid';
    if (pollInterval) clearInterval(pollInterval);
    if (simulatedLogInterval) clearInterval(simulatedLogInterval);
    fetchJobsList();
  }
}

backHomeBtn.addEventListener('click', () => {
  switchToScreen('home');
});

// Fetch cloned sub-genres
async function fetchAnimeGenres() {
  try {
    const res = await fetch('/api/anime-genres');
    const genres = await res.json();
    
    // Clear dynamic options while preserving Universal Story
    subGenreSelect.innerHTML = '<option value="viral-story-framework">Universal Story</option>';
    
    genres.forEach(g => {
      const opt = document.createElement('option');
      opt.value = g.id;
      opt.textContent = g.name;
      subGenreSelect.appendChild(opt);
    });
  } catch (e) {
    console.error("Failed to load sub-genres:", e);
  }
}

// Fetch available models (Script & Image categories)
async function fetchModels() {
  try {
    const res = await fetch('/api/models');
    const data = await res.json();
    
    // 1. Script Models Dropdown
    if (data.text && data.text.length > 0) {
      modelScriptSelect.innerHTML = '';
      data.text.forEach(m => {
        const opt = document.createElement('option');
        opt.value = m.name;
        opt.textContent = m.name + (m.premium ? ' [Premium 💎]' : '');
        
        // Auto-select best default reasoning model
        if (m.name.includes('openai-fast') || m.name === 'openai-fast') {
          opt.selected = true;
        }
        modelScriptSelect.appendChild(opt);
      });
    }
    
    // 2. Image Models Dropdown
    if (data.image && data.image.length > 0) {
      modelImageSelect.innerHTML = '';
      data.image.forEach(m => {
        const opt = document.createElement('option');
        opt.value = m.name;
        opt.textContent = m.name + (m.premium ? ' [Premium 💎]' : '');
        
        // Auto-select best default image model
        if (m.name.includes('flux') || m.name === 'flux') {
          opt.selected = true;
        }
        modelImageSelect.appendChild(opt);
      });
    }
    
    // 3. Dynamic Voice Models Dropdown
    await fetchVoiceModels();
  } catch (e) {
    console.error("Failed to load models:", e);
  }
}

// Fetch dynamic voice models from voice service via backend proxy
async function fetchVoiceModels() {
  try {
    const res = await fetch('/api/voice-models');
    const data = await res.json();
    
    const voiceSelect = document.getElementById('voice-select');
    if (!voiceSelect) return;
    
    voiceSelect.innerHTML = '';
    
    // Populating Edge standard neural voices (free)
    if (data.edge && data.edge.length > 0) {
      const optGroupEdge = document.createElement('optgroup');
      optGroupEdge.label = 'Edge Neural Voices (Free)';
      data.edge.forEach(v => {
        const opt = document.createElement('option');
        opt.value = v.id;
        opt.textContent = v.name;
        if (v.id === 'hi-IN-MadhurNeural') {
          opt.selected = true; // Madhur default
        }
        optGroupEdge.appendChild(opt);
      });
      voiceSelect.appendChild(optGroupEdge);
    }
    
    // Populating Pollinations voice systems
    if (data.pollinations && data.pollinations.length > 0) {
      const optGroupPoll = document.createElement('optgroup');
      optGroupPoll.label = 'AI Speech Synthesis (Modality)';
      data.pollinations.forEach(v => {
        const opt = document.createElement('option');
        opt.value = v.id;
        opt.textContent = v.name;
        optGroupPoll.appendChild(opt);
      });
      voiceSelect.appendChild(optGroupPoll);
    }
  } catch (err) {
    console.error("Failed to fetch voice models, preserving native presets:", err);
  }
}

// Fetch lists of all recent projects
async function fetchJobsList() {
  try {
    const res = await fetch('/api/jobs');
    const jobs = await res.json();
    
    // Update jobs count badge
    if (jobsCountText) {
      jobsCountText.textContent = jobs.length;
    }
    
    if (jobs.length === 0) {
      cloudJobsContainer.innerHTML = `
        <div style="color: var(--text-muted); text-align: center; padding: 3rem;">
          No jobs found. Launch one above!
        </div>
      `;
      return;
    }
    
    cloudJobsContainer.innerHTML = '';
    jobs.forEach(job => {
      const isSelected = activeJobId === job.job_id;
      const card = document.createElement('div');
      card.className = `job-card ${isSelected ? 'active-border' : ''}`;
      
      let badgeClass = 'processing';
      if (job.status === 'done') badgeClass = 'done';
      else if (job.status === 'paused') badgeClass = 'paused';
      else if (job.status === 'failed') badgeClass = 'failed';
      
      const relTime = getRelativeTime(job.created_at);
      
      card.innerHTML = `
        <div class="job-info">
          <div class="job-topic">${escapeHTML(job.topic)}</div>
          <div class="job-meta">
            <span class="status-tag ${badgeClass}">${job.status}</span>
            <span>Step: ${job.current_step}</span>
            <span>Progress: ${job.progress_percent}%</span>
            <span>⏱️ ${relTime}</span>
          </div>
        </div>
        <div class="job-actions">
          ${job.status === 'failed' ? `
            <button class="job-act-btn retry-btn" title="Retry Failed Job">
              🔄
            </button>
          ` : ''}
          <button class="job-act-btn del delete-btn" title="Delete Project">
            🗑️
          </button>
        </div>
      `;
      
      // Workbench selection click
      card.addEventListener('click', (e) => {
        if (e.target.closest('.job-act-btn')) return; // ignore action buttons
        selectJob(job.job_id);
      });

      // Delete listener
      const deleteBtn = card.querySelector('.delete-btn');
      if (deleteBtn) {
        deleteBtn.addEventListener('click', async (e) => {
          e.stopPropagation();
          if (!confirm("Are you sure you want to delete this project?")) return;
          try {
            const delRes = await fetch(`/api/jobs/${job.job_id}`, { method: 'DELETE' });
            if (!delRes.ok) throw new Error("Failed to delete job");
            
            addLog(`🗑️ Deleted Project ID: ${job.job_id}`);
            
            if (activeJobId === job.job_id) {
              activeJobId = null;
              localStorage.removeItem('akira_active_job_id');
              setCookie('akira_active_job_id', '', -1);
              resetWorkspaceUI();
              switchToScreen('home');
            }
            fetchJobsList();
          } catch (err) {
            console.error("Delete error:", err);
            addLog(`❌ Delete failed: ${err.message}`);
          }
        });
      }

      // Retry listener
      const retryBtn = card.querySelector('.retry-btn');
      if (retryBtn) {
        retryBtn.addEventListener('click', async (e) => {
          e.stopPropagation();
          try {
            addLog(`🔄 Initiating retry for failed Job ID: ${job.job_id}`);
            const retRes = await fetch(`/api/jobs/${job.job_id}/retry`, { method: 'POST' });
            const data = await retRes.json();
            if (!retRes.ok) throw new Error(data.error || "Failed to retry job");
            
            addLog(`🚀 Job retry triggered successfully!`);
            selectJob(job.job_id);
          } catch (err) {
            console.error("Retry error:", err);
            addLog(`❌ Retry failed: ${err.message}`);
          }
        });
      }
      
      cloudJobsContainer.appendChild(card);
    });
  } catch (e) {
    console.error("Failed to load jobs list:", e);
  }
}

// Form Submission - Create Job
orchestrationForm.addEventListener('submit', async (e) => {
  e.preventDefault();
  
  const topic = topicInput.value.trim();
  if (!topic) return;
  
  launchPipelineBtn.disabled = true;
  launchPipelineBtn.innerHTML = `<span>Orchestrating...</span> <div class="spinner" style="width: 14px; height: 14px; border-width: 2px;"></div>`;
  
  try {
    const res = await fetch('/api/jobs', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        topic,
        video_type: videoTypeSelect.value,
        sub_genre: subGenreSelect.value,
        duration_target: durationTargetSelect.value,
        language: languageSelect.value,
        model_script: modelScriptSelect.value,
        model_image: modelImageSelect.value,
        enable_research: researchSwitch.checked,
        voice_profile: document.getElementById('voice-select').value,
        tavily_key: document.getElementById('tavily-key-input').value.trim()
      })
    });
    
    const data = await res.json();
    if (!res.ok) {
      throw new Error(data.error || 'Failed to trigger job');
    }
    
    // Persist active ID
    selectJob(data.job_id);
    
    // Clear input
    topicInput.value = '';
    
  } catch (error) {
    console.error("Failed to trigger job:", error);
    addLog(`❌ Error triggering job: ${error.message}`);
  } finally {
    launchPipelineBtn.disabled = false;
    launchPipelineBtn.innerHTML = `<span>Launch Autonomous Pipeline</span> <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><polygon points="5 3 19 12 5 21 5 3"/></svg>`;
  }
});

// Select active job
function selectJob(jobId) {
  activeJobId = jobId;
  localStorage.setItem('akira_active_job_id', jobId);
  setCookie('akira_active_job_id', jobId, 7);
  
  // Clear previews and overlays to reload cleanly
  resetWorkspaceUI();
  
  // Transition
  switchToScreen('workspace');
  
  // Start Polling
  startPollingJob(jobId);
}

// Reset workspace components UI
function resetWorkspaceUI() {
  workspaceScenesContainer.innerHTML = `<div style="color: var(--text-muted); text-align: center; padding: 4rem;">Loading workbench parameters...</div>`;
  masterVideoPlayer.removeAttribute('src');
  masterVideoPlayer.removeAttribute('data-loaded-src');
  masterVideoPlayer.load();
  masterVideoPlayer.style.display = 'none';
  videoRenderingOverlay.style.display = 'flex';
  videoPlayerStatus.textContent = 'Waiting for Video Composer...';
  reviewScoreBadge.style.display = 'none';
  exportDownloadBtn.classList.add('disabled-item');
  exportDownloadBtn.removeAttribute('href');
  generateThumbnailsBtn.classList.add('disabled-item');
  thumbnailsContainer.innerHTML = `
    <div style="grid-column: 1 / span 3; color: var(--text-muted); font-size: 0.8rem; text-align: center; padding: 1.5rem; border: 1px dashed var(--border-color); border-radius: 8px;">
      Master video review must be completed to unlock thumbnails.
    </div>
  `;
  creditPauseAlert.style.display = 'none';
  lastProgress = -1;
}

// Background log simulator
function startSimulatedLogs(step) {
  if (simulatedLogInterval) clearInterval(simulatedLogInterval);
  
  const stepLogs = {
    script: [
      "Gemini Research agent starting up...",
      "Searching web queries on VPS...",
      "Fact logs compiled. Launching script writing LLM...",
      "Injecting specialized anime-weaver rules...",
      "Analyzing climax structure & pattern interrupts...",
      "Streaming raw JSON scenes from proxy router..."
    ],
    voice: [
      "Voice TTS generator starting...",
      "Synthesizing alternate male/female voices via Edge Neural...",
      "Scene audio tracks writing to cache folders...",
      "Validating sound pacing alignments...",
      "Combining audio elements via multi-channel filters..."
    ],
    image: [
      "Image Generator running scene descriptors...",
      "Translating screenplay scenes to visual prompts...",
      "Invoking visual sheet proxy (FLUX standard style)...",
      "Consistent character reference seed applied...",
      "Downloading HD storyboard sheets successfully..."
    ],
    video: [
      "FFmpeg audio-video orchestrator running...",
      "Applying smooth 3D Ken Burns panning zoom styles...",
      "Mapping visual scene layers with sub-second offsets...",
      "Stitching scene fragments using AAC-H.264 profile...",
      "Building unified master MP4 stream..."
    ],
    review: [
      "Gemini Vision Agent loading video stream...",
      "Scanning scene consistency and sound pacing overlaps...",
      "Calculating compliance quality indices...",
      "Quality score benchmark matches requirements!",
      "Master render finalized successfully."
    ]
  };
  
  const logs = stepLogs[step] || ["Orchestrating agent parameters..."];
  let idx = 0;
  
  simulatedLogInterval = setInterval(() => {
    if (idx < logs.length) {
      addLog(`[${step.toUpperCase()}] ${logs[idx]}`);
      idx++;
    } else {
      clearInterval(simulatedLogInterval);
    }
  }, 4000);
}

// Start polling API
function startPollingJob(jobId) {
  if (pollInterval) clearInterval(pollInterval);
  
  fetchJobStatus(jobId); // Initial call
  
  pollInterval = setInterval(() => {
    fetchJobStatus(jobId);
  }, 3000);
}

// Main Polling Call
async function fetchJobStatus(jobId) {
  try {
    const res = await fetch(`/api/jobs/${jobId}`);
    if (!res.ok) {
      throw new Error("Job details could not be resolved.");
    }
    
    const job = await res.json();
    
    // Update horizontal tracker highlights
    updateTrackerUI(job.current_step, job.status);
    
    // Update labels
    const friendlySteps = {
      script: 'Script & Outline Agent',
      voice: 'Voice Synthesis Agent',
      image: 'Visual Storyboard Agent',
      video: 'Composition & Stitching Agent',
      review: 'Gemini QA Review Agent'
    };
    
    activeAgentLabel.textContent = friendlySteps[job.current_step] || job.current_step;
    activeProgressPercent.textContent = `${job.progress_percent}%`;
    workspaceProgressFill.style.width = `${job.progress_percent}%`;
    
    // Status Logs trigger
    if (job.progress_percent !== lastProgress) {
      addLog(`Orchestrator: Job state updated. Progress: ${job.progress_percent}%. Step: ${job.current_step}`);
      startSimulatedLogs(job.current_step);
      lastProgress = job.progress_percent;
    }
    
    // Render specific data assets
    renderDataAssets(job);
    
    // Handle Paused state due to credit exhaustion (402)
    if (job.status === 'paused') {
      creditPauseAlert.style.display = 'flex';
      
      if (autoResumeEnabled) {
        addLog(`⚠️ Balance limit detected! Fail-Safe Auto-Resume is active. Retrying pipeline in 30 seconds...`);
        // Debounce auto-resume triggers to avoid hammering endpoint
        if (!window.autoResumeTimeout) {
          window.autoResumeTimeout = setTimeout(() => {
            window.autoResumeTimeout = null;
            resumeActiveJob();
          }, 30000);
        }
      }
    } else {
      creditPauseAlert.style.display = 'none';
    }
    
    // Clear interval when fully complete or failed
    if (job.status === 'done') {
      addLog(`✨ SUCCESS: Complete Akira Flow video pipeline rendered successfully!`);
      if (pollInterval) clearInterval(pollInterval);
      if (simulatedLogInterval) clearInterval(simulatedLogInterval);
    } else if (job.status === 'failed') {
      addLog(`❌ FAILED: ${job.error_message || 'Pipeline crashed'}`);
      if (pollInterval) clearInterval(pollInterval);
      if (simulatedLogInterval) clearInterval(simulatedLogInterval);
    }
    
  } catch (e) {
    console.error("Polling error:", e);
    addLog(`⚠️ Connection delay: Re-syncing cloud logs...`);
  }
}

// Update step highlights
function updateTrackerUI(currentStep, status) {
  const steps = ['script', 'voice', 'image', 'video', 'review'];
  const curIdx = steps.indexOf(currentStep);
  
  steps.forEach((step, idx) => {
    const node = document.getElementById(`node-${step}`);
    if (!node) return;
    
    node.className = 'step-node';
    if (idx < curIdx) {
      node.classList.add('completed');
    } else if (idx === curIdx) {
      if (status === 'paused') {
        node.classList.add('active');
        node.querySelector('.step-circle').style.borderColor = 'var(--accent-pink)';
        node.querySelector('.step-circle').style.color = 'var(--accent-pink)';
      } else {
        node.classList.add('active');
        node.querySelector('.step-circle').style.borderColor = '';
        node.querySelector('.step-circle').style.color = '';
      }
    }
    
    // Handle lines highlight
    if (idx > 0) {
      const line = document.getElementById(`line-${idx}`);
      if (line) {
        line.className = 'step-line';
        if (idx <= curIdx) {
          line.classList.add('completed');
        }
      }
    }
  });
}

// Render available script, voice, images and video elements on workspace
function renderDataAssets(job) {
  // 1. Script & scenes list
  if (job.data.script && job.data.script.scenes) {
    workspaceScenesContainer.innerHTML = '';
    
    job.data.script.scenes.forEach(scene => {
      const card = document.createElement('div');
      card.className = 'scene-item';
      
      // Determine if image is ready
      let imgTag = `<div class="scene-thumb" style="display:flex;align-items:center;justify-content:center;font-size:0.6rem;color:var(--text-muted);text-align:center;">No Frame</div>`;
      if (job.data.images && job.data.images.scenes) {
        const matchingImg = job.data.images.scenes.find(s => String(s.scene_id) === String(scene.id));
        if (matchingImg && matchingImg.image_url) {
          imgTag = `<img src="${matchingImg.image_url}" class="scene-thumb" alt="Scene Frame" onclick="window.open('${matchingImg.image_url}')">`;
        }
      }
      
      // Compact timestamp representation
      const tsText = `<span class="scene-time" style="font-size: 0.6rem;">⏱️ ${formatTime(scene.start_sec)} - ${formatTime(scene.end_sec)}</span>`;
      
      card.innerHTML = `
        ${imgTag}
        <div class="scene-details">
          <div class="scene-top">
            <span class="scene-num">SCENE ${scene.id}</span>
            <span class="scene-char">${escapeHTML(scene.character)}</span>
          </div>
          <div class="scene-text" title="${escapeHTML(scene.text)}">${escapeHTML(scene.text)}</div>
          <div class="scene-time">
            ${tsText}
          </div>
        </div>
      `;
      
      workspaceScenesContainer.appendChild(card);
    });
  }
  
  // 2. Video Player
  if (job.data.video && job.data.video.video_url) {
    videoRenderingOverlay.style.display = 'none';
    masterVideoPlayer.style.display = 'block';
    
    const absoluteVideoUrl = job.data.video.video_url;
    if (masterVideoPlayer.getAttribute('data-loaded-src') !== absoluteVideoUrl) {
      masterVideoPlayer.src = absoluteVideoUrl;
      masterVideoPlayer.setAttribute('data-loaded-src', absoluteVideoUrl);
      masterVideoPlayer.load();
    }
    
    exportDownloadBtn.classList.remove('disabled-item');
    exportDownloadBtn.href = absoluteVideoUrl;
  } else {
    masterVideoPlayer.style.display = 'none';
    videoRenderingOverlay.style.display = 'flex';
    if (job.current_step === 'video') {
      videoPlayerStatus.textContent = 'FFmpeg rendering master video...';
    } else {
      videoPlayerStatus.textContent = `Pending Step: ${job.current_step.toUpperCase()}`;
    }
  }
  
  // 3. Review Score
  if (job.data.review && (job.data.review.overall_score !== undefined || job.data.review.score !== undefined)) {
    const activeScore = job.data.review.overall_score !== undefined ? job.data.review.overall_score : job.data.review.score;
    reviewScoreBadge.style.display = 'inline-block';
    reviewScoreBadge.textContent = `QA: ${activeScore}/100`;
    
    // Unlock thumbnails when review is completed
    generateThumbnailsBtn.classList.remove('disabled-item');
  }
  
  // 4. Thumbnails
  if (job.data.thumbnails && job.data.thumbnails.length > 0) {
    thumbnailsContainer.innerHTML = '';
    job.data.thumbnails.forEach((thumb, index) => {
      const thumbCard = document.createElement('div');
      thumbCard.className = 'thumbnail-card';
      thumbCard.innerHTML = `
        <img src="${thumb}" alt="YouTube Thumbnail template">
        <a href="${thumb}" download="thumbnail_${index}.jpg" class="thumbnail-dl-overlay">
          <span class="thumbnail-dl-btn">⬇️</span>
        </a>
      `;
      thumbnailsContainer.appendChild(thumbCard);
    });
  }
}

// Resume Paused Job
async function resumeActiveJob() {
  if (!activeJobId) return;
  
  addLog(`🔄 Initiating cloud pipeline resume for Job ID: ${activeJobId}`);
  
  try {
    const res = await fetch(`/api/jobs/${activeJobId}/resume`, {
      method: 'POST'
    });
    
    const data = await res.json();
    if (!res.ok) {
      throw new Error(data.error || 'Failed to resume pipeline');
    }
    
    addLog(`🚀 Cloud pipeline resumed successfully! Continuing background worker...`);
    creditPauseAlert.style.display = 'none';
    startPollingJob(activeJobId);
    
  } catch (error) {
    console.error("Resume error:", error);
    addLog(`❌ Resume failed: ${error.message}`);
  }
}

resumeJobBtn.addEventListener('click', resumeActiveJob);

// Generate thumbnails trigger
generateThumbnailsBtn.addEventListener('click', async () => {
  if (!activeJobId || generateThumbnailsBtn.classList.contains('disabled-item')) return;
  
  generateThumbnailsBtn.disabled = true;
  generateThumbnailsBtn.textContent = 'Generating...';
  addLog('🎨 Instantiating YouTube Thumbnail Generator Agents...');
  
  try {
    const res = await fetch(`/api/jobs/${activeJobId}/thumbnail`, {
      method: 'POST'
    });
    
    const data = await res.json();
    if (!res.ok) {
      throw new Error(data.error || 'Thumbnail rendering failed');
    }
    
    addLog('✨ Successfully generated 3 customized viral YouTube thumbnail frames!');
    
  } catch (e) {
    console.error("Thumbnail failed:", e);
    addLog(`❌ Thumbnail error: ${e.message}`);
  } finally {
    generateThumbnailsBtn.disabled = false;
    generateThumbnailsBtn.textContent = 'Generate Templates';
  }
});

// Logs monitor helpers
function addLog(line) {
  const lineEl = document.createElement('div');
  lineEl.className = 'console-line';
  
  const d = new Date();
  const timeStr = d.toTimeString().split(' ')[0];
  lineEl.innerHTML = `<span style="color: var(--text-muted); font-size: 0.65rem;">[${timeStr}]</span> ${escapeHTML(line)}`;
  
  consoleLogsContainer.appendChild(lineEl);
  consoleLogsContainer.scrollTop = consoleLogsContainer.scrollHeight;
}

function escapeHTML(str) {
  if (!str) return '';
  return str.replace(/[&<>'"]/g, 
    tag => ({
      '&': '&amp;',
      '<': '&lt;',
      '>': '&gt;',
      "'": '&#39;',
      '"': '&quot;'
    }[tag] || tag)
  );
}
