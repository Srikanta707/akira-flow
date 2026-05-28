const axios = require('axios');
const zlib = require('zlib');

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
    
    console.log(`Sending Axios POST to ${url}...`);
    const response = await axios(axiosConfig);
    const buffer = Buffer.from(response.data);
    
    console.log(`Response status: ${response.status}`);
    console.log(`Response length: ${buffer.length} bytes`);
    console.log(`First 30 bytes raw (hex): ${buffer.slice(0, 30).toString('hex')}`);
    console.log(`First 30 bytes raw (ascii): ${buffer.slice(0, 30).toString('ascii')}`);

    let decodedString = '';
    
    // 1. Try Brotli Decompression
    try {
      const decompressed = zlib.brotliDecompressSync(buffer);
      decodedString = decompressed.toString('utf8');
      console.log("Decompressed via Brotli successfully!");
    } catch (brErr) {
      console.log(`Brotli decompress failed: ${brErr.message}`);
      // 2. Try Gzip Decompression
      try {
        const decompressed = zlib.gunzipSync(buffer);
        decodedString = decompressed.toString('utf8');
        console.log("Decompressed via Gzip successfully!");
      } catch (gzErr) {
        console.log(`Gzip decompress failed: ${gzErr.message}`);
        // 3. Try Inflate
        try {
          const decompressed = zlib.inflateSync(buffer);
          decodedString = decompressed.toString('utf8');
          console.log("Decompressed via Inflate successfully!");
        } catch (infErr) {
          console.log(`Inflate decompress failed: ${infErr.message}`);
          try {
            const decompressed = zlib.inflateRawSync(buffer);
            decodedString = decompressed.toString('utf8');
            console.log("Decompressed via InflateRaw successfully!");
          } catch (infRawErr) {
            console.log(`InflateRaw decompress failed: ${infRawErr.message}`);
            // 4. Plain UTF-8 fallback
            decodedString = buffer.toString('utf8');
            console.log("Fallback to plain UTF-8 string.");
          }
        }
      }
    }

    try {
      return JSON.parse(decodedString);
    } catch (parseError) {
      console.error("JSON parse error. Decoded string start:", decodedString.substring(0, 300));
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

async function run() {
  const systemInstruction = "You are a helpful assistant. Respond with RAW valid JSON containing a simple message field.";
  const prompt = "Hello! Write a 1-sentence welcome message.";

  await safeFetchJSON(`${PROXY_BASE_URL}/chat/completions`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${PROXY_CLIENT_KEY}`
    },
    body: JSON.stringify({
      model: 'openai-fast',
      messages: [
        { role: 'system', content: systemInstruction },
        { role: 'user', content: prompt }
      ],
      response_format: { type: 'json_object' }
    })
  });
}

run();
