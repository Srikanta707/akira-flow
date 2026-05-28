const axios = require('axios');
const PROXY_BASE_URL = 'https://ciel.sryze.cc/v1';
const PROXY_CLIENT_KEY = 'ciel_sk_afba29f2e6defe1cdfbe057f85b1ecda';
const zlib = require('zlib');

async function test() {
  try {
    const res = await axios({
      url: `${PROXY_BASE_URL}/models`,
      method: 'GET',
      headers: { 'Authorization': `Bearer ${PROXY_CLIENT_KEY}` },
      responseType: 'arraybuffer'
    });

    const buffer = Buffer.from(res.data);
    let decomp;
    try { decomp = zlib.brotliDecompressSync(buffer); } catch (e) { decomp = zlib.gunzipSync(buffer); }
    const data = JSON.parse(decomp.toString('utf8'));
    
    // Find flux and inspect supported_endpoints
    const fluxModel = data.data.find(m => m.id === 'flux');
    console.log("Flux Model metadata:", JSON.stringify(fluxModel, null, 2));

    const gptImageModel = data.data.find(m => m.id === 'gptimage');
    console.log("GPT Image Model metadata:", JSON.stringify(gptImageModel, null, 2));

  } catch (error) {
    console.error("Failed:", error.message);
  }
}

test();
