const axios = require('axios');

async function sleep(ms) {
  return new Promise(resolve => setTimeout(resolve, ms));
}

async function trigger() {
  const payload = {
    topic: "A mind-blowing fact about neutron stars density in Roman Hinglish",
    video_type: "youtube_hook",
    sub_genre: "",
    duration_target: "1 min",
    language: "hindi", // Will generate in beautiful Roman Hinglish
    model_script: "openai-fast",
    model_image: "flux",
    enable_research: true,
    voice_profile: "hi-IN-MadhurNeural"
  };

  try {
    console.log("🚀 Step 1: Triggering new Akira Flow Job...");
    const triggerRes = await axios.post('http://localhost:3008/api/jobs', payload);
    const jobId = triggerRes.data.job_id;
    console.log(`✅ Job created successfully! Job ID: ${jobId}`);

    console.log("\n📈 Step 2: Polling job status in real-time...");
    let done = false;
    let attempts = 0;
    const maxAttempts = 120; // 6 minutes max

    while (!done && attempts < maxAttempts) {
      attempts++;
      const statusRes = await axios.get(`http://localhost:3008/api/jobs/${jobId}`);
      const job = statusRes.data;

      console.log(`[Attempt ${attempts}] Status: ${job.status.toUpperCase()} | Step: ${job.current_step.toUpperCase()} | Progress: ${job.progress_percent}%`);

      if (job.status === 'done') {
        console.log("\n🎉 EXCELLENT! Job completed successfully!");
        console.log("Master Video URL:", job.data.video.video_url);
        console.log("Duration:", job.data.video.duration_seconds, "seconds");
        console.log("QA Score:", job.data.review ? job.data.review.overall_score || job.data.review.score : "N/A");
        done = true;
        break;
      }

      if (job.status === 'failed') {
        console.error("\n❌ Job failed with error:", job.error_message);
        done = true;
        break;
      }

      if (job.status === 'paused') {
        console.log("⚠️ Job is paused (waiting for balance reset/resume). Retrying in 10s...");
        await sleep(10000);
      } else {
        await sleep(4000); // Poll every 4 seconds
      }
    }

    if (!done) {
      console.error("\n❌ Polling timed out after 6 minutes.");
    }

  } catch (err) {
    console.error("❌ E2E Trigger failed:", err.message);
    if (err.response) {
      console.error("Response:", err.response.status, err.response.data);
    }
  }
}

trigger();
