const axios = require('axios');
const PROXY_BASE_URL = 'https://ciel.sryze.cc/v1';
const PROXY_CLIENT_KEY = 'ciel_sk_afba29f2e6defe1cdfbe057f85b1ecda';
const zlib = require('zlib');

async function test() {
  try {
    const res = await axios({
      url: `${PROXY_BASE_URL}/models`,
      method: 'GET',
      headers: {
        'Authorization': `Bearer ${PROXY_CLIENT_KEY}`
      },
      responseType: 'arraybuffer'
    });

    const buffer = Buffer.from(res.data);
    let decompressed;
    try {
      decompressed = zlib.brotliDecompressSync(buffer);
    } catch (e) {
      try {
        decompressed = zlib.gunzipSync(buffer);
      } catch (e) {
        decompressed = buffer;
      }
    }

    const data = JSON.parse(decompressed.toString('utf8'));
    console.log("Total models returned:", data.data.length);
    console.log("Model attributes keys:", Object.keys(data.data[0]));
    console.log("First 5 models details:");
    data.data.forEach(m => {
      console.log(`- ID: ${m.id}, Price/Premium/Type:`, {
        input_modalities: m.input_modalities,
        output_modalities: m.output_modalities,
        price: m.price || m.cost || m.premium || undefined,
        // Let's print the entire object keys and values except very long strings
        keys: Object.keys(m)
      });
    });

    // Let's print one complete model object to see all properties
    console.log("Full representation of first model object:\n", JSON.stringify(data.data[0], null, 2));

  } catch (error) {
    console.error("Test failed:", error.message);
  }
}

test();
