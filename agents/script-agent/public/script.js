document.addEventListener('DOMContentLoaded', () => {
  // DOM Elements
  const form = document.getElementById('generator-form');
  const topicInput = document.getElementById('topic-input');
  const dropZone = document.getElementById('drop-zone');
  const fileInput = document.getElementById('file-input');
  const videoType = document.getElementById('video-type');
  const subGenreFormGroup = document.getElementById('sub-genre-form-group');
  const subGenreSelect = document.getElementById('sub-genre-select');
  const researchSwitch = document.getElementById('research-switch');
  const durationTarget = document.getElementById('duration-target');
  const languageSelect = document.getElementById('language-select');
  const modelSelect = document.getElementById('model-select');
  const apiKeyInput = document.getElementById('api-key-input');
  const submitBtn = document.getElementById('submit-btn');
  const loadingOverlay = document.getElementById('loading-overlay');
  const loadingStatus = document.getElementById('loading-status');
  
  const emptyState = document.getElementById('empty-state');
  const scriptDashboard = document.getElementById('script-dashboard');
  const notificationBar = document.getElementById('notification-bar');
  const notificationMsg = document.getElementById('notification-msg');
  
  // Dashboard stats
  const statWords = document.getElementById('stat-words');
  const statDuration = document.getElementById('stat-duration');
  const statLang = document.getElementById('stat-lang');
  const statType = document.getElementById('stat-type');
  const charactersListContainer = document.getElementById('characters-list-container');
  
  // Tab previews
  const scenesTimeline = document.getElementById('scenes-timeline');
  const plainScriptPre = document.getElementById('plain-script-pre');
  const jsonScriptPre = document.getElementById('json-script-pre');
  
  // New Research Report Tab
  const researchTabHeader = document.getElementById('research-tab-header');
  const researchReportPre = document.getElementById('research-report-pre');

  const DEFAULT_KEY = 'sk_WAF0YaqgB5NZ6IDI3VVnraG8YHirl2QY';

  // Load configuration from local storage
  const loadSavedSettings = () => {
    if (localStorage.getItem('akira_topic')) topicInput.value = localStorage.getItem('akira_topic');
    
    // Set default API key from user if not set in local storage
    if (localStorage.getItem('akira_api_key')) {
      apiKeyInput.value = localStorage.getItem('akira_api_key');
    } else {
      apiKeyInput.value = DEFAULT_KEY;
      localStorage.setItem('akira_api_key', DEFAULT_KEY);
    }
    
    if (localStorage.getItem('akira_video_type')) {
      videoType.value = localStorage.getItem('akira_video_type');
      toggleSubGenreVisibility();
    }
    
    if (localStorage.getItem('akira_duration')) durationTarget.value = localStorage.getItem('akira_duration');
    if (localStorage.getItem('akira_language')) languageSelect.value = localStorage.getItem('akira_language');
    if (localStorage.getItem('akira_enable_research') === 'true') {
      researchSwitch.checked = true;
    }
  };

  // Save configurations to local storage
  const saveSettings = () => {
    localStorage.setItem('akira_topic', topicInput.value);
    localStorage.setItem('akira_api_key', apiKeyInput.value.trim());
    localStorage.setItem('akira_video_type', videoType.value);
    localStorage.setItem('akira_duration', durationTarget.value);
    localStorage.setItem('akira_language', languageSelect.value);
    localStorage.setItem('akira_enable_research', researchSwitch.checked);
    
    if (subGenreSelect.value) {
      localStorage.setItem('akira_sub_genre', subGenreSelect.value);
    }
    if (modelSelect.value) {
      localStorage.setItem('akira_model', modelSelect.value);
    }
  };

  // Toggle sub-genre select based on video type
  const toggleSubGenreVisibility = () => {
    if (videoType.value === 'story_anime') {
      subGenreFormGroup.style.display = 'block';
    } else {
      subGenreFormGroup.style.display = 'none';
    }
  };

  videoType.addEventListener('change', () => {
    toggleSubGenreVisibility();
    saveSettings();
  });

  // Fetch cloned anime genres toolkits from backend
  const fetchAnimeGenres = async () => {
    try {
      const response = await fetch('/api/anime-genres');
      if (!response.ok) throw new Error();
      const genres = await response.json();
      
      subGenreSelect.innerHTML = '<option value="viral-story-framework">Universal Story Framework</option>';
      genres.forEach(genre => {
        const option = document.createElement('option');
        option.value = genre.id;
        option.textContent = genre.name;
        subGenreSelect.appendChild(option);
      });

      // Restore saved sub-genre
      const savedGenre = localStorage.getItem('akira_sub_genre');
      if (savedGenre && Array.from(subGenreSelect.options).some(opt => opt.value === savedGenre)) {
        subGenreSelect.value = savedGenre;
      }
    } catch (e) {
      console.warn("Failed to load anime genres list", e);
    }
  };

  // Fetch Pollinations text models
  const fetchModels = async () => {
    try {
      const response = await fetch('/api/models');
      if (!response.ok) throw new Error();
      const models = await response.json();
      
      modelSelect.innerHTML = '';
      models.forEach(model => {
        const option = document.createElement('option');
        option.value = model.name;
        option.textContent = `${model.name} — ${model.description}`;
        modelSelect.appendChild(option);
      });

      // Restore saved model
      const savedModel = localStorage.getItem('akira_model');
      if (savedModel && Array.from(modelSelect.options).some(opt => opt.value === savedModel)) {
        modelSelect.value = savedModel;
      }
    } catch (e) {
      console.error("Failed to load models list", e);
      modelSelect.innerHTML = `
        <option value="openai-fast">openai-fast — GPT-OSS 20B Reasoning LLM (Fast & Creative)</option>
        <option value="openai">openai — OpenAI GPT-4o Equivalent</option>
        <option value="gemini">gemini — Google Gemini Pro (Google Search, URL Fetch)</option>
        <option value="mistral">mistral — Mistral Large (Precise & Structured)</option>
        <option value="deepseek">deepseek — DeepSeek V3 (Advanced Logic & Context)</option>
      `;
    }
  };

  // Initialize
  loadSavedSettings();
  fetchAnimeGenres();
  fetchModels();

  // Save settings on input changes
  [topicInput, apiKeyInput, videoType, subGenreSelect, researchSwitch, durationTarget, languageSelect, modelSelect].forEach(element => {
    element.addEventListener('change', saveSettings);
  });
  topicInput.addEventListener('input', saveSettings);

  // Drag and Drop File Upload
  dropZone.addEventListener('click', () => fileInput.click());
  
  dropZone.addEventListener('dragover', (e) => {
    e.preventDefault();
    dropZone.style.borderColor = 'var(--accent-cyan)';
    dropZone.style.background = 'rgba(0, 212, 255, 0.05)';
  });

  dropZone.addEventListener('dragleave', () => {
    dropZone.style.borderColor = 'var(--border-color)';
    dropZone.style.background = 'rgba(123, 47, 255, 0.03)';
  });

  dropZone.addEventListener('drop', (e) => {
    e.preventDefault();
    dropZone.style.borderColor = 'var(--border-color)';
    dropZone.style.background = 'rgba(123, 47, 255, 0.03)';
    
    if (e.dataTransfer.files.length > 0) {
      handleFile(e.dataTransfer.files[0]);
    }
  });

  fileInput.addEventListener('change', (e) => {
    if (e.target.files.length > 0) {
      handleFile(e.target.files[0]);
    }
  });

  const handleFile = (file) => {
    if (file.type !== 'text/plain' && !file.name.endsWith('.txt')) {
      showNotification('Error: Please upload a plain text (.txt) file.', 'error');
      return;
    }

    const reader = new FileReader();
    reader.onload = (e) => {
      topicInput.value = e.target.result;
      saveSettings();
      showNotification('File loaded successfully!', 'success');
    };
    reader.onerror = () => {
      showNotification('Failed to read text file.', 'error');
    };
    reader.readAsText(file);
  };

  // Notification Handler
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

  // Tab switching
  const tabs = document.querySelectorAll('.tab');
  tabs.forEach(tab => {
    tab.addEventListener('click', () => {
      tabs.forEach(t => t.classList.remove('active'));
      document.querySelectorAll('.tab-content').forEach(c => c.classList.remove('active'));
      
      tab.classList.add('active');
      const contentId = tab.getAttribute('data-tab');
      document.getElementById(contentId).classList.add('active');
    });
  });

  // Simple Regex-based Markdown to HTML renderer for Research Report
  const renderMarkdown = (md) => {
    if (!md) return '';
    return md
      .replace(/### (.*?)\n/g, '<h3>$1</h3>')
      .replace(/## (.*?)\n/g, '<h2>$1</h2>')
      .replace(/# (.*?)\n/g, '<h1>$1</h1>')
      .replace(/\*\*(.*?)\*\*/g, '<strong>$1</strong>')
      .replace(/\*(.*?)\*/g, '<em>$1</em>')
      .replace(/^- (.*?)\n/gm, '<li>$1</li>')
      .replace(/(<li>.*?<\/li>)/g, '<ul>$1</ul>')
      .replace(/<\/ul>\s*<ul>/g, '') // Flatten nested lists
      .replace(/\n/g, '<br>');
  };

  // Loading animation intervals
  let loadingInterval;
  const startLoadingStages = () => {
    const isResearchActive = researchSwitch.checked;
    const stages = isResearchActive ? [
      "Analyzing topic outline...",
      "AGENT 1: Launching Gemini Search & Research...",
      "Gathering shocking facts and curiosity gaps...",
      "AGENT 1: Compiling Autonomous Research Report...",
      "AGENT 2: Ingesting specialized toolkit skills...",
      "Mapping pacing patterns and writing Roman script...",
      "Drafting narration and character dialogues...",
      "Structuring scenes and chained timings into JSON..."
    ] : [
      "Analyzing topic outline...",
      "Ingesting specialized toolkit skills...",
      "Connecting to Pollinations AI network...",
      "Writing Roman script outline...",
      "Drafting narration and dialogues...",
      "Structuring scenes into JSON..."
    ];
    let i = 0;
    loadingStatus.textContent = stages[0];
    
    loadingInterval = setInterval(() => {
      i = (i + 1) % stages.length;
      loadingStatus.textContent = stages[i];
    }, 3500);
  };

  const stopLoadingStages = () => {
    clearInterval(loadingInterval);
  };

  // Form Submission
  form.addEventListener('submit', async (e) => {
    e.preventDefault();
    
    const topic = topicInput.value.trim();
    if (!topic) return;

    // Show Loading
    loadingOverlay.style.display = 'flex';
    submitBtn.disabled = true;
    startLoadingStages();
    
    try {
      const response = await fetch('/api/generate-script', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({
          topic,
          duration_target: durationTarget.value,
          language: languageSelect.value,
          video_type: videoType.value,
          sub_genre: videoType.value === 'story_anime' ? subGenreSelect.value : '',
          model: modelSelect.value,
          enable_research: researchSwitch.checked,
          api_key: apiKeyInput.value.trim()
        })
      });

      const data = await response.json();

      if (!response.ok) {
        throw new Error(data.error || 'Server error generating script.');
      }

      // Hide empty state and show dashboard
      emptyState.style.display = 'none';
      scriptDashboard.style.display = 'block';

      // Populate Statistics
      statWords.textContent = data.word_count || 0;
      statDuration.textContent = `${data.estimated_duration_seconds || 0}s`;
      statLang.textContent = (data.language || 'english').toUpperCase();
      statType.textContent = (data.video_type || 'youtube_hook').replace('_', ' ').toUpperCase();

      // Render Character tags
      charactersListContainer.innerHTML = '';
      if (data.characters && data.characters.length > 0) {
        data.characters.forEach(char => {
          const badge = document.createElement('span');
          badge.className = 'char-tag';
          badge.textContent = char;
          charactersListContainer.appendChild(badge);
        });
      } else {
        charactersListContainer.innerHTML = '<span class="char-tag">NARRATOR</span>';
      }

      // Handle Research Tab conditional display
      if (data.research_report) {
        researchTabHeader.style.display = 'block';
        researchReportPre.innerHTML = renderMarkdown(data.research_report);
      } else {
        researchTabHeader.style.display = 'none';
        researchReportPre.innerHTML = '';
      }

      // Render Visual Timeline
      scenesTimeline.innerHTML = '';
      let plainNarrative = '';

      if (data.scenes && data.scenes.length > 0) {
        data.scenes.forEach(scene => {
          plainNarrative += `[${scene.character || 'NARRATOR'}]: ${scene.text}\n\n`;

          const item = document.createElement('div');
          item.className = 'timeline-item';
          item.innerHTML = `
            <div class="timeline-dot"></div>
            <div class="timeline-content">
              <div class="scene-header">
                <span class="scene-num">Scene ${scene.id}</span>
                <span class="scene-speaker">${scene.character || 'NARRATOR'}</span>
              </div>
              <p class="scene-text">${scene.text}</p>
              <div class="scene-footer">
                <span class="scene-time">${scene.start_sec}s – ${scene.end_sec}s (${(scene.end_sec - scene.start_sec).toFixed(1)}s)</span>
              </div>
            </div>
          `;
          scenesTimeline.appendChild(item);
        });
      } else {
        scenesTimeline.innerHTML = '<div style="color: var(--text-muted)">No scene breakdowns generated.</div>';
      }

      // Populate Plain Text Tab
      plainScriptPre.textContent = plainNarrative || data.script_text || '';

      // Populate JSON Tab
      jsonScriptPre.textContent = JSON.stringify(data, null, 2);

      showNotification('Script successfully generated by Akira Flow multi-agent team!', 'success');
      
      // Auto-scroll to results dashboard
      document.getElementById('preview-panel').scrollIntoView({ behavior: 'smooth' });

    } catch (err) {
      console.error(err);
      showNotification(err.message || 'Generation failed. Please check balance or try another model.', 'error');
    } finally {
      stopLoadingStages();
      loadingOverlay.style.display = 'none';
      submitBtn.disabled = false;
    }
  });
});

// Clipboard helper
function copyText(elementId) {
  const preElement = document.getElementById(elementId);
  if (!preElement) return;

  const text = preElement.innerText || preElement.textContent;
  navigator.clipboard.writeText(text).then(() => {
    const activeTab = document.querySelector('.tab.active').getAttribute('data-tab');
    let btn = document.querySelector('.copy-btn');
    
    if (activeTab === 'research-tab') {
      btn = document.querySelector('#research-tab .copy-btn');
    } else if (activeTab === 'text-tab') {
      btn = document.querySelector('#text-tab .copy-btn');
    } else if (activeTab === 'json-tab') {
      btn = document.querySelector('#json-tab .copy-btn');
    }

    if (btn) {
      const origHTML = btn.innerHTML;
      btn.innerHTML = `
        <svg xmlns="http://www.w3.org/2000/svg" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="#00d4ff" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><polyline points="20 6 9 17 4 12"/></svg>
        Copied!
      `;
      btn.style.color = 'var(--accent-cyan)';
      
      setTimeout(() => {
        btn.innerHTML = origHTML;
        btn.style.color = '';
      }, 2000);
    }
  }).catch(err => {
    console.error('Could not copy text: ', err);
  });
}
