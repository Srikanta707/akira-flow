document.addEventListener('DOMContentLoaded', () => {
  // DOM Elements
  const form = document.getElementById('generator-form');
  const scriptJsonInput = document.getElementById('script-json-input');
  const apiKeyInput = document.getElementById('api-key-input');
  const submitBtn = document.getElementById('submit-btn');
  const loadTemplateBtn = document.getElementById('load-template-btn');
  const loadReelsBtn = document.getElementById('load-reels-btn');
  
  const charactersConfigWrapper = document.getElementById('characters-config-wrapper');
  
  const loadingOverlay = document.getElementById('loading-overlay');
  const loadingStatus = document.getElementById('loading-status');
  
  const emptyState = document.getElementById('empty-state');
  const voiceDashboard = document.getElementById('voice-dashboard');
  const masterDuration = document.getElementById('master-duration');
  const masterAudioPlayer = document.getElementById('master-audio-player');
  const scenesAudioContainer = document.getElementById('scenes-audio-container');
  
  const notificationBar = document.getElementById('notification-bar');
  const notificationMsg = document.getElementById('notification-msg');

  let voiceModels = { edge: [], pollinations: [] };
  let parsedScript = null;

  // Saved local storage config
  if (localStorage.getItem('akira_api_key')) {
    apiKeyInput.value = localStorage.getItem('akira_api_key');
  }

  apiKeyInput.addEventListener('change', () => {
    localStorage.setItem('akira_api_key', apiKeyInput.value.trim());
  });

  // Notification Banner
  const showNotification = (msg, type = 'success') => {
    notificationBar.style.display = 'flex';
    notificationMsg.textContent = msg;
    
    if (type === 'error') {
      notificationBar.classList.remove('success');
      notificationBar.style.borderColor = 'var(--accent-pink)';
      notificationBar.style.background = 'rgba(255, 45, 120, 0.15)';
    } else {
      notificationBar.classList.add('success');
      notificationBar.style.borderColor = 'var(--accent-cyan)';
      notificationBar.style.background = 'rgba(0, 212, 255, 0.15)';
    }

    setTimeout(() => {
      notificationBar.style.display = 'none';
    }, 6000);
  };

  // Load and cache voice options
  const loadVoices = async () => {
    try {
      const response = await fetch('/api/models');
      if (!response.ok) throw new Error();
      voiceModels = await response.json();
      console.log("Voices loaded successfully:", voiceModels);
    } catch (e) {
      console.error("Failed to load voices list", e);
      showNotification("Failed to fetch available voices from API, using local presets.", "error");
      
      voiceModels = {
        edge: [
          { id: 'hi-IN-SwaraNeural', name: 'Swara (Hindi Female)', provider: 'edge', gender: 'female', lang: 'hindi' },
          { id: 'hi-IN-MadhurNeural', name: 'Madhur (Hindi Male)', provider: 'edge', gender: 'male', lang: 'hindi' },
          { id: 'en-US-JennyNeural', name: 'Jenny (English Female)', provider: 'edge', gender: 'female', lang: 'english' },
          { id: 'en-US-GuyNeural', name: 'Guy (English Male)', provider: 'edge', gender: 'male', lang: 'english' }
        ],
        pollinations: [
          { id: 'elevenlabs', name: 'ElevenLabs Pro (AI TTS)', provider: 'pollinations', gender: 'neutral', lang: 'multi' },
          { id: 'elevenflash', name: 'ElevenLabs Flash (AI Fast)', provider: 'pollinations', gender: 'neutral', lang: 'multi' }
        ]
      };
    }
  };

  loadVoices();

  // Dynamic voice configuration card builder
  const buildCharacterConfigCards = (characters) => {
    charactersConfigWrapper.innerHTML = '';
    
    if (!characters || characters.length === 0) {
      charactersConfigWrapper.innerHTML = `
        <div style="color: var(--text-muted); text-align: center; padding: 1.5rem; border: 1px dashed var(--border-color); border-radius: 8px;">
          No characters found in script.
        </div>
      `;
      submitBtn.disabled = true;
      return;
    }

    characters.forEach(charName => {
      const card = document.createElement('div');
      card.className = 'character-card';
      card.setAttribute('data-character', charName);

      // Unique element IDs
      const providerId = `provider-${charName}`;
      const voiceId = `voice-${charName}`;
      const speedId = `speed-${charName}`;
      const speedValId = `speed-val-${charName}`;
      const previewBtnId = `preview-${charName}`;

      card.innerHTML = `
        <div class="char-card-header">
          <span class="char-card-name">${charName}</span>
          <span class="provider-pill" id="pill-${charName}">Edge Free</span>
        </div>
        <div class="card-grid">
          <!-- Voice Provider -->
          <div class="form-group" style="margin-bottom: 0.5rem;">
            <label style="font-size: 0.7rem;">Provider</label>
            <div class="input-glow-wrapper">
              <select id="${providerId}">
                <option value="edge">Edge (Free)</option>
                <option value="pollinations">Pollinations (AI)</option>
              </select>
            </div>
          </div>
          
          <!-- Voice Select -->
          <div class="form-group" style="margin-bottom: 0.5rem;">
            <label style="font-size: 0.7rem;">Voice Model</label>
            <div class="input-glow-wrapper">
              <select id="${voiceId}"></select>
            </div>
          </div>

          <!-- Speed Control -->
          <div class="form-group grid-col-full" style="margin-bottom: 0.5rem;">
            <label style="font-size: 0.7rem;">Speech Speed</label>
            <div class="slider-group">
              <input type="range" id="${speedId}" min="0.8" max="1.2" step="0.05" value="1.0">
              <span class="slider-val" id="${speedValId}">1.0x</span>
            </div>
          </div>

          <!-- Preview Clip -->
          <div class="grid-col-full" style="text-align: right; margin-top: 0.25rem;">
            <button type="button" class="preview-speaker-btn" id="${previewBtnId}">
              <svg xmlns="http://www.w3.org/2000/svg" width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><polygon points="11 5 6 9 2 9 2 15 6 15 11 19 11 5"/><path d="M15.54 8.46a5 5 0 0 1 0 7.07"/></svg>
              <span>Preview Voice 🔊</span>
            </button>
          </div>
        </div>
      `;

      charactersConfigWrapper.appendChild(card);

      const providerSelect = document.getElementById(providerId);
      const voiceSelect = document.getElementById(voiceId);
      const speedInput = document.getElementById(speedId);
      const speedVal = document.getElementById(speedValId);
      const previewBtn = document.getElementById(previewBtnId);
      const pill = document.getElementById(`pill-${charName}`);

      // Sync dropdown selections
      const populateVoices = () => {
        const provider = providerSelect.value;
        voiceSelect.innerHTML = '';
        
        if (provider === 'edge') {
          pill.textContent = 'Edge Free';
          pill.style.borderColor = 'rgba(123, 47, 255, 0.4)';
          pill.style.background = 'rgba(123, 47, 255, 0.2)';
          pill.style.color = '#c094ff';
          
          voiceModels.edge.forEach(v => {
            const opt = document.createElement('option');
            opt.value = v.id;
            opt.textContent = v.name;
            voiceSelect.appendChild(opt);
          });
        } else {
          pill.textContent = 'Pollinations AI';
          pill.style.borderColor = 'rgba(0, 212, 255, 0.4)';
          pill.style.background = 'rgba(0, 212, 255, 0.2)';
          pill.style.color = 'var(--accent-cyan)';
          
          voiceModels.pollinations.forEach(v => {
            const opt = document.createElement('option');
            opt.value = v.id;
            opt.textContent = v.name;
            voiceSelect.appendChild(opt);
          });
        }
      };

      populateVoices();

      providerSelect.addEventListener('change', populateVoices);
      
      speedInput.addEventListener('input', () => {
        speedVal.textContent = `${parseFloat(speedInput.value).toFixed(2)}x`;
      });

      // Handle individual speaker quick preview
      previewBtn.addEventListener('click', async () => {
        const text = `Testing speaker mapping for ${charName}. How do I sound?`;
        previewBtn.disabled = true;
        previewBtn.textContent = 'Generating...';

        try {
          const res = await fetch('/api/preview-voice', {
            method: 'POST',
            headers: {
              'Content-Type': 'application/json'
            },
            body: JSON.stringify({
              provider: providerSelect.value,
              voice: voiceSelect.value,
              speed: parseFloat(speedInput.value),
              text,
              api_key: apiKeyInput.value.trim()
            })
          });

          const data = await res.json();
          if (!res.ok) throw new Error(data.error);

          // Audio preview stream playback
          const audio = new Audio(data.sample_url);
          audio.play();

          previewBtn.textContent = 'Preview Voice 🔊';
          previewBtn.disabled = false;
          showNotification(`Playing voice preview for ${charName}!`, 'success');
        } catch (err) {
          console.error(err);
          previewBtn.textContent = 'Preview Voice 🔊';
          previewBtn.disabled = false;
          showNotification(err.message || 'Preview generation failed.', 'error');
        }
      });
    });

    submitBtn.disabled = false;
  };

  // Watch Script JSON Input for changes and auto-parse
  const parseScriptJsonInput = () => {
    const rawVal = scriptJsonInput.value.trim();
    if (!rawVal) {
      charactersConfigWrapper.innerHTML = `
        <div style="color: var(--text-muted); text-align: center; padding: 1.5rem; border: 1px dashed var(--border-color); border-radius: 8px;">
          Paste or load a script JSON to configure character voices.
        </div>
      `;
      submitBtn.disabled = true;
      parsedScript = null;
      return;
    }

    try {
      const parsed = JSON.parse(rawVal);
      if (!parsed.scenes || !Array.isArray(parsed.scenes)) {
        throw new Error('Missing "scenes" array in JSON.');
      }

      parsedScript = parsed;
      
      // Extract unique characters in script
      let characters = parsed.characters || [];
      if (characters.length === 0) {
        const uniqueSpeakers = new Set();
        parsed.scenes.forEach(s => {
          if (s.character) uniqueSpeakers.add(s.character);
        });
        characters = Array.from(uniqueSpeakers);
      }

      // Guarantee NARRATOR is present if scenes don't have speakers
      if (characters.length === 0) {
        characters = ['NARRATOR'];
      }

      buildCharacterConfigCards(characters);
      showNotification('Script JSON parsed and characters loaded!', 'success');

    } catch (e) {
      console.warn("JSON Parse Error:", e);
      charactersConfigWrapper.innerHTML = `
        <div style="color: var(--accent-pink); text-align: center; padding: 1.5rem; border: 1px dashed var(--accent-pink); border-radius: 8px; background: rgba(255, 45, 120, 0.03);">
          Error parsing JSON: ${e.message}. Ensure it is a valid Script Agent JSON.
        </div>
      `;
      submitBtn.disabled = true;
      parsedScript = null;
    }
  };

  scriptJsonInput.addEventListener('input', parseScriptJsonInput);

  // Template Load Buttons
  const sciFiTemplate = {
    "video_type": "story_anime",
    "language": "english",
    "characters": ["NARRATOR", "HERO_COSMO", "AI_ORION"],
    "scenes": [
      { "id": 1, "text": "Deep in the cyber-grid of Neo-Tokyo, a forgotten mainframe terminal begins to hum.", "character": "NARRATOR" },
      { "id": 2, "text": "Is anyone out there? The core is collapsing! Orion, respond!", "character": "HERO_COSMO" },
      { "id": 3, "text": "Warning. Quantum intrusion detected. Time dilation sequence initiated.", "character": "AI_ORION" }
    ]
  };

  const reelsTemplate = {
    "video_type": "reels_short",
    "language": "hindi",
    "characters": ["NARRATOR"],
    "scenes": [
      { "id": 1, "text": "Dosto, kya aap jaante hain ki universe mein ek aisi jagah hai jahan time bilkul ruk jaata hai?", "character": "NARRATOR" },
      { "id": 2, "text": "Haan, main baat kar raha hoon Black Hole ke Event Horizon ki, jahan gravity infinite ho jaati hai!", "character": "NARRATOR" },
      { "id": 3, "text": "Aise hi space facts ke liye Akira Flow ko abhi follow karein!", "character": "NARRATOR" }
    ]
  };

  loadTemplateBtn.addEventListener('click', () => {
    scriptJsonInput.value = JSON.stringify(sciFiTemplate, null, 2);
    parseScriptJsonInput();
  });

  loadReelsBtn.addEventListener('click', () => {
    scriptJsonInput.value = JSON.stringify(reelsTemplate, null, 2);
    parseScriptJsonInput);
    scriptJsonInput.value = JSON.stringify(reelsTemplate, null, 2);
    parseScriptJsonInput();
  });

  // Loading animation intervals
  let loadingInterval;
  const startLoadingStages = () => {
    const stages = [
      "Analyzing scene dialogues...",
      "Synthesizing dialogue track for NARRATOR...",
      "Running multi-character voice mapping...",
      "Merging dialogue tracks using FFmpeg concat engine...",
      "Validating output audio timelines...",
      "Finalizing master sound track..."
    ];
    let i = 0;
    loadingStatus.textContent = stages[0];
    
    loadingInterval = setInterval(() => {
      i = (i + 1) % stages.length;
      loadingStatus.textContent = stages[i];
    }, 3000);
  };

  const stopLoadingStages = () => {
    clearInterval(loadingInterval);
  };

  // Form submit
  form.addEventListener('submit', async (e) => {
    e.preventDefault();

    if (!parsedScript) return;

    // Show Loading
    loadingOverlay.style.display = 'flex';
    submitBtn.disabled = true;
    startLoadingStages();

    // Compile voice mappings from UI cards
    const voiceSettings = {};
    document.querySelectorAll('.character-card').forEach(card => {
      const charName = card.getAttribute('data-character');
      const provider = document.getElementById(`provider-${charName}`).value;
      const voice = document.getElementById(`voice-${charName}`).value;
      const speed = parseFloat(document.getElementById(`speed-${charName}`).value);

      voiceSettings[charName] = {
        provider,
        voice,
        speed
      };
    });

    try {
      const res = await fetch('/api/generate-voice', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({
          scenes: parsedScript.scenes,
          voice_settings: voiceSettings,
          api_key: apiKeyInput.value.trim()
        })
      });

      const data = await res.json();
      if (!res.ok) throw new Error(data.error);

      // Render Dashboard results
      emptyState.style.display = 'none';
      voiceDashboard.style.display = 'block';

      // Load master audio player
      masterDuration.textContent = `${data.total_duration_seconds.toFixed(1)}s`;
      masterAudioPlayer.src = data.master_audio_url;

      // Populate dialogue track breakdown list
      scenesAudioContainer.innerHTML = '';
      data.audio_timeline.forEach(item => {
        // Map the text description from our parsed script matching by ID
        const matchedScene = parsedScript.scenes.find(s => s.id === item.id) || { text: 'Dialogue audio generated.' };
        
        const card = document.createElement('div');
        card.className = 'scene-audio-card';
        card.innerHTML = `
          <div class="card-top">
            <span class="card-num">Scene ${item.id}</span>
            <span class="card-speaker">${item.character}</span>
          </div>
          <p class="card-text">"${matchedScene.text}"</p>
          <div class="card-bottom">
            <span class="card-duration">${item.start_sec.toFixed(1)}s – ${item.end_sec.toFixed(1)}s (${item.duration_sec.toFixed(1)}s)</span>
            <button class="mini-player-btn" onclick="playPreviewClip('${item.file_url}')">
              <svg xmlns="http://www.w3.org/2000/svg" width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><polygon points="5 3 19 12 5 21 5 3"/></svg>
              <span>Play Clip</span>
            </button>
          </div>
        `;
        scenesAudioContainer.appendChild(card);
      });

      showNotification('Voice timeline merged successfully with FFmpeg!', 'success');
      document.getElementById('preview-panel').scrollIntoView({ behavior: 'smooth' });

    } catch (err) {
      console.error(err);
      showNotification(err.message || 'Audio generation failed.', 'error');
    } finally {
      stopLoadingStages();
      loadingOverlay.style.display = 'none';
      submitBtn.disabled = false;
    }
  });
});

// Play individual scene audio preview clip
function playPreviewClip(url) {
  const audio = new Audio(url);
  audio.play();
}
