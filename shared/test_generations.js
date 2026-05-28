const axios = require('axios');
const fs = require('fs');
const PROXY_BASE_URL = 'https://ciel.sryze.cc/v1';
const PROXY_CLIENT_KEY = 'ciel_sk_afba29f2e6defe1cdfbe057f85b1ecda';

async function testDirectGet() {
  try {
    const promptText = "vibrant anime key visual of a black hole time dilation, highly detailed";
    const url = `https://ciel.sryze.cc/image/${encodeURIComponent(promptText)}?model=flux`;
    
    console.log("1. Testing GET on:", url);
    const res = await axios({
      url: url,
      method: 'GET',
      headers: { 'Authorization': `Bearer ${PROXY_CLIENT_KEY}` },
      responseType: 'arraybuffer'
    });

    console.log("Status:", res.status);
    console.log("Content-Type:", res.headers['content-type']);
    const buffer = Buffer.from(res.data);
    console.log("Response Length:", buffer.length);
    console.log("First 10 bytes:", buffer.slice(0, 10).toString('hex'));
    if (buffer.length > 500) {
      fs.writeFileSync('test_direct_get.jpg', buffer);
      console.log("Successfully wrote test_direct_get.jpg!");
    }
  } catch (error) {
    console.error("GET test failed:", error.message);
  }
}

async function testPostGenerations() {
  try {
    const promptText = "vibrant anime key visual of a black hole time dilation, highly detailed";
    const url = `${PROXY_BASE_URL}/images/generations`;
    
    console.log("2. Testing POST on:", url);
    const res = await axios({
      url: url,
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${PROXY_CLIENT_KEY}`,
        'Content-Type': 'application/json'
      },
      data: {
        model: 'flux',
        prompt: promptText
      }
    });

    console.log("POST Status:", res.status);
    console.log("POST Headers:", res.headers);
    console.log("POST Response Body:", JSON.stringify(res.data, null, 2));
  } catch (error) {
    console.error("POST test failed:", error.message);
    if (error.response) {
      console.error("POST error response:", error.response.status, error.response.data.toString());
    }
  }
}

async function run() {
  await testDirectGet();
  console.log("----------------------------------------");
  await testPostGenerations();
}

run();
