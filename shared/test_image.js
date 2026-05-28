const axios = require('axios');
const fs = require('fs');
const PROXY_BASE_URL = 'https://ciel.sryze.cc/v1';
const PROXY_CLIENT_KEY = 'ciel_sk_afba29f2e6defe1cdfbe057f85b1ecda';

async function test() {
  try {
    const promptText = "vibrant anime key visual of a black hole time dilation, highly detailed";
    const url = `${PROXY_BASE_URL}/image/${encodeURIComponent(promptText)}?model=flux`;
    
    console.log("Calling Proxy Image Gen...");
    console.log("URL:", url);

    const res = await axios({
      url: url,
      method: 'GET',
      headers: {
        'Authorization': `Bearer ${PROXY_CLIENT_KEY}`
      },
      responseType: 'arraybuffer'
    });

    console.log("Status:", res.status);
    console.log("Headers:", res.headers);
    const buffer = Buffer.from(res.data);
    console.log("Response Length:", buffer.length);
    console.log("First 20 bytes (hex):", buffer.slice(0, 20).toString('hex'));
    
    // Check if it starts with Brotli / Gzip / Zlib compression!
    const zlib = require('zlib');
    try {
      const decompBr = zlib.brotliDecompressSync(buffer);
      console.log("Successfully decompressed via Brotli! Decoded length:", decompBr.length);
      console.log("Decompressed First 20 bytes (hex):", decompBr.slice(0, 20).toString('hex'));
      fs.writeFileSync('test_decomp_br.jpg', decompBr);
    } catch (e) {
      console.log("Brotli decompress failed:", e.message);
    }

    try {
      const decompGz = zlib.gunzipSync(buffer);
      console.log("Successfully decompressed via Gzip! Decoded length:", decompGz.length);
      console.log("Decompressed First 20 bytes (hex):", decompGz.slice(0, 20).toString('hex'));
      fs.writeFileSync('test_decomp_gz.jpg', decompGz);
    } catch (e) {
      console.log("Gzip decompress failed:", e.message);
    }

    fs.writeFileSync('test_raw.jpg', buffer);

  } catch (error) {
    console.error("Test failed:", error.message);
    if (error.response) {
      console.error("Response error:", error.response.status, error.response.data.toString());
    }
  }
}

test();
