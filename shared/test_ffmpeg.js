const { exec } = require('child_process');
const fs = require('fs');

const cmd = `ffmpeg -y -loglevel error -loop 1 -i "/root/akira-flow/agents/image-agent/public/temp/img_job_1779941349945_scene_1.jpg" -i "/root/akira-flow/agents/voice-agent/public/temp/voice_job_1779941339313_scene_1.mp3" -c:v libx264 -tune stillimage -pix_fmt yuv420p -c:a aac -b:a 192k -shortest -t 28.39 "/root/akira-flow/agents/video-agent/public/temp/test_out.mp4"`;

console.log("Running FFmpeg command...");

exec(cmd, { maxBuffer: 1024 * 1024 * 64 }, (error, stdout, stderr) => {
  console.log("Command finished.");
  if (error) {
    console.error("Error encountered:", error.message);
    console.error("Error keys:", Object.keys(error));
  }
  console.log("Stdout length:", stdout.length);
  console.log("Stderr length:", stderr.length);
  console.log("Stderr sample:", stderr.substring(0, 500));
});
