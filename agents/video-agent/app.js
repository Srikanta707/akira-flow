const express = require('express');
const cors = require('cors');
const path = require('path');
const fs = require('fs');
const { exec } = require('child_process');

const app = express();
const PORT = process.env.PORT || 3004;

app.use(cors());
app.use(express.json());
app.use(express.static(path.join(__dirname, 'public')));

// Ensure temp directory exists inside public
const tempDir = path.join(__dirname, 'public', 'temp');
if (!fs.existsSync(tempDir)) {
  fs.mkdirSync(tempDir, { recursive: true });
}

// Helper to resolve client relative URLs to absolute VPS file paths
function resolveAbsolutePath(urlPath) {
  if (!urlPath) return null;
  
  // Clean query parameters if any
  const cleanUrl = urlPath.split('?')[0];
  
  if (cleanUrl.startsWith('/temp/img_') || cleanUrl.startsWith('/temp/ref_')) {
    // Maps to Image Agent assets
    return path.join('/root/akira-flow/agents/image-agent/public', cleanUrl);
  } else if (cleanUrl.startsWith('/temp/voice_') || cleanUrl.startsWith('/temp/master_')) {
    // Maps to Voice Agent assets
    return path.join('/root/akira-flow/agents/voice-agent/public', cleanUrl);
  }
  
  return null;
}

// Promisified child process executor
function runCommand(cmd) {
  return new Promise((resolve, reject) => {
    exec(cmd, { maxBuffer: 1024 * 1024 * 256 }, (error, stdout, stderr) => {
      if (error) {
        return reject(new Error(`Command failed: ${cmd}\nError: ${error.message}`));
      }
      resolve(stdout);
    });
  });
}

// POST /api/compose-video - Synthesize Ken Burns video segments and merge them with FFmpeg
app.post('/api/compose-video', async (req, res) => {
  const { scenes, audio_timeline } = req.body;

  if (!scenes || !Array.isArray(scenes) || scenes.length === 0) {
    return res.status(400).json({ error: 'Scenes array is required.' });
  }
  if (!audio_timeline || !Array.isArray(audio_timeline) || audio_timeline.length === 0) {
    return res.status(400).json({ error: 'Audio timeline is required.' });
  }

  const jobId = `video_${Date.now()}`;
  const segmentFiles = [];
  let totalDuration = 0;

  try {
    for (let i = 0; i < scenes.length; i++) {
      const scene = scenes[i];
      const audioItem = audio_timeline.find(a => a.id === scene.scene_id);
      
      if (!audioItem) {
        throw new Error(`Missing audio timeline track for Scene ${scene.scene_id}`);
      }

      const imgPath = resolveAbsolutePath(scene.image_url);
      const audioPath = resolveAbsolutePath(audioItem.file_url);

      if (!imgPath || !fs.existsSync(imgPath)) {
        throw new Error(`Scene ${scene.scene_id} image file not found on disk at: ${imgPath}`);
      }
      if (!audioPath || !fs.existsSync(audioPath)) {
        throw new Error(`Scene ${scene.scene_id} audio file not found on disk at: ${audioPath}`);
      }

      const duration = audioItem.duration_sec || (audioItem.end_sec - audioItem.start_sec);
      const segmentFilename = `seg_${jobId}_scene_${scene.scene_id}.mp4`;
      const segmentPath = path.join(tempDir, segmentFilename);

      console.log(`Processing Scene ${scene.scene_id} (${duration.toFixed(1)}s): Image "${path.basename(imgPath)}" + Audio "${path.basename(audioPath)}"`);

      // 1. Simulate Video Generation (e.g. LXT Studio, Kling) -> Generate 5-second video clip
      const genVideoPath = path.join(tempDir, `gen_${jobId}_scene_${scene.scene_id}.mp4`);
      // Fallback: Since we don't have API keys, use ffmpeg to create a 5-second video clip from the image
      const fakeGenCmd = `ffmpeg -y -loglevel error -loop 1 -i "${imgPath}" -vf "scale=1920x1080,zoompan=z='min(zoom+0.0015,1.3)':d=125:x='iw/2-(iw/zoom/2)':y='ih/2-(ih/zoom/2)':s=1920x1080" -c:v libx264 -pix_fmt yuv420p -t 5 "${genVideoPath}"`;
      try {
        console.log(`Generating 5-second video clip for Scene ${scene.scene_id}...`);
        await runCommand(fakeGenCmd);
      } catch (e) {
        await runCommand(`ffmpeg -y -loglevel error -loop 1 -i "${imgPath}" -c:v libx264 -tune stillimage -pix_fmt yuv420p -t 5 "${genVideoPath}"`);
      }

      // 2. Read the EXACT millisecond duration of the corresponding scene's audio using ffprobe
      const getAudioDurationCmd = `ffprobe -i "${audioPath}" -show_entries format=duration -v quiet -of csv="p=0"`;
      const audioDurStr = await runCommand(getAudioDurationCmd);
      const exactAudioDuration = parseFloat(audioDurStr.trim());
      console.log(`Audio exact duration: ${exactAudioDuration}ms`);

      // 3. Trim or loop the 5-second generated video to perfectly match the audio duration
      console.log(`Looping/trimming generated video to perfectly sync with audio duration (${exactAudioDuration}s)...`);
      const syncCmd = `ffmpeg -y -loglevel error -stream_loop -1 -i "${genVideoPath}" -i "${audioPath}" -c:v libx264 -c:a aac -b:a 192k -shortest -t ${exactAudioDuration} "${segmentPath}"`;
      await runCommand(syncCmd);

      try { fs.unlinkSync(genVideoPath); } catch(e) {}

      segmentFiles.push(segmentPath);
      totalDuration += duration;
    }

    // 2. Concatenate all segments sequentially using FFmpeg concat copy
    const concatListPath = path.join(tempDir, `concat_${jobId}.txt`);
    const masterFilename = `master_${jobId}.mp4`;
    const masterPath = path.join(tempDir, masterFilename);

    const fileListContent = segmentFiles.map(fp => `file '${fp}'`).join('\n');
    fs.writeFileSync(concatListPath, fileListContent);

    console.log(`Merging ${segmentFiles.length} H.264 scenes into Master Video track...`);
    const mergeCmd = `ffmpeg -y -loglevel error -f concat -safe 0 -i "${concatListPath}" -c copy "${masterPath}"`;
    await runCommand(mergeCmd);

    // Clean up temporary text file and segment segments
    try { fs.unlinkSync(concatListPath); } catch (e) {}
    segmentFiles.forEach(fp => {
      try { fs.unlinkSync(fp); } catch (e) {}
    });

    res.json({
      video_url: `/temp/${masterFilename}`,
      duration_seconds: parseFloat(totalDuration.toFixed(2))
    });

  } catch (error) {
    console.error('Error composing video timeline:', error);
    // Cleanup generated segments on failure
    segmentFiles.forEach(fp => {
      try { fs.unlinkSync(fp); } catch (e) {}
    });
    res.status(500).json({ error: error.message || 'Failed to compose video timeline.' });
  }
});

// Periodic cleanup of temp video files older than 2 hours
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
    console.error("Error cleaning temp video files:", e);
  }
}, 30 * 60 * 1000);

app.listen(PORT, () => {
  console.log(`Video Agent microservice is running on port ${PORT}`);
});
