const axios = require('axios');
require('dotenv').config();

const BASE_URL = 'https://contact-solomon.onrender.com';
const sessionId = 'smoketest-session-' + Date.now();

async function runSmokeTest() {
  try {
    // 1. Check homepage
    const root = await axios.get(BASE_URL);
    console.log("✅ GET / =>", root.status);

    // 2. Send a message to AI
    const message = await axios.post(`${BASE_URL}/message`, {
      message: "Hi I'm testing"
    }, {
      headers: { 'x-session-id': sessionId }
    });
    console.log("✅ POST /message =>", message.data.reply);

    // 3. Submit fake intake
    const submit = await axios.post(`${BASE_URL}/submit-final-intake`, {}, {
      headers: { 'x-session-id': sessionId }
    });
    console.log("✅ POST /submit-final-intake =>", submit.data.show_summary ? "Success" : "Missing fields");

    // 4. Check required env vars
    if (!process.env.EMAIL_USERNAME || !process.env.EMAIL_PASSWORD) {
      throw new Error("❌ EMAIL credentials missing in .env");
    }

    console.log("✅ ENV variables check passed");

  } catch (err) {
    console.error("❌ Smoke test failed:", err.message);
  }
}

runSmokeTest();
