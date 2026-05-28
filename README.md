# Akira Flow

**AI-Powered Multi-Agent Video Factory Platform**

Akira Flow is an advanced, autonomous orchestration system that chains together specialized AI microservices to generate high-retention video content, stories, and YouTube hooks. By routing prompt concepts through distinct agent pipelines, it automates scriptwriting, voiceover generation, image synthesis, and final video composition with millisecond precision.

## Architecture Overview

The system architecture utilizes a robust graph-based state machine logic for autonomous multi-agent conditional routing, ensuring zero-loss background processing. The ecosystem consists of a centralized Hub and 5 decoupled microservice agents running concurrently:

*   **Frontend Orchestrator Hub (Port `:3008`)**  
    A pure 3D Claymorphic light-themed UI that manages global state, user configurations, Pollinations proxy routing, and real-time job persistence.
*   **Agent 1: Script Agent (Port `:3001`)**  
    Processes structural logic, web-research parsing, and script formatting for cinematic timing.
*   **Agent 2: Voice Agent (Port `:3002`)**  
    Integrates dynamic EdgeTTS and premium API voices, passing raw audio through an FFmpeg Humanizer filter (`silenceremove`, `anequalizer`, `loudnorm`) for studio-clarity results.
*   **Agent 3: Image Agent (Port `:3003`)**  
    Generates highly consistent scene frames and contextual thumbnails using advanced text-to-image models (Flux/SD).
*   **Agent 4: Video Composer Agent (Port `:3004`)**  
    Uses cinematic Pan & Zoom filters and programmatic `ffprobe` polling to trim/loop video segments, perfectly syncing the visual cuts to the exact millisecond duration of the corresponding audio track.
*   **Agent 5: Review Agent (Port `:3005`)**  
    A QA agent designed to evaluate visual-verbal consistency and store quality metrics.

## Current Status

The platform is actively under development, debugging, and optimization. Currently implemented and functional core features include:
- **Dynamic Model Selection:** Fetching live AI models (ElevenLabs, Edge-TTS, Flux) dynamically.
- **Voice Tuning Dashboard:** On-the-fly "Auto-Magic Enhance" toggle and manual sliders (Speed, Pitch, Bass).
- **FFmpeg Humanizer Engine:** Active post-processing of all synthesized TTS generation.
- **Millisecond-Precise Synchronization:** Guaranteed seamless audio-visual alignment.
- **Zero-Loss Persistence:** Live jobs survive UI reloads via integrated cookie/localStorage restoration.

## Setup & Deployment Instructions

The entire microservice ecosystem is managed via **PM2**.

1.  **Install PM2** (if not already installed):
    ```bash
    npm install -g pm2
    ```
2.  **Start the Services**:
    Navigate to each agent directory and start the apps, or use an existing PM2 ecosystem file.
    ```bash
    pm2 start agents/script-agent/app.js --name "akira-script-agent"
    pm2 start agents/voice-agent/app.js --name "akira-voice-agent"
    pm2 start agents/image-agent/app.js --name "akira-image-agent"
    pm2 start agents/video-agent/app.js --name "akira-video-agent"
    pm2 start agents/review-agent/app.js --name "akira-review-agent"
    pm2 start frontend/app.js --name "akira-frontend"
    ```
3.  **Manage and Monitor**:
    -   To view the live dashboard logs: `pm2 logs`
    -   To check the operational status: `pm2 list`
    -   To restart the platform after an update: `pm2 restart all`

Access the main dashboard on `http://localhost:3008`.

---

## 🌺 Powered by Pollinations.ai (Flower Tier Aspirant)

The core generative magic behind **Akira Flow** is fundamentally driven by the incredible infrastructure of **[Pollinations.ai](https://pollinations.ai/)**. 

By utilizing Pollinations' seamless, fast, and highly reliable endpoints, Akira Flow is capable of executing complex generative tasks simultaneously without infrastructure bottlenecks. Specifically, we heavily rely on Pollinations for:
*   **State-of-the-Art Image Synthesis**: Feeding our Image Agent with rapid, high-fidelity Flux generation capabilities.
*   **Dynamic Video Generation**: Empowering our Video Composer Agent with cutting-edge cinematic AI sequences.
*   **Diverse TTS & Audio Generation**: Routing our Voice Agent through Pollinations for diverse, realistic, and premium text-to-speech models.

We are deeply grateful for the open, accessible, and powerful API ecosystem that Pollinations has created. **Akira Flow is proud to be a heavy integrator of Pollinations.ai and aspires to secure the coveted "Flower Tier" approval to scale our multi-agent pipelines to the absolute maximum.**
