const axios = require("axios");

const MODEL = "gemini-flash-lite-latest";

function getGeminiKey() {
  return process.env.GOOGLE_API_KEY || process.env.GEMINI_API_KEY || null;
}

async function callGemini(prompt, systemInstruction, temperature) {
  if (temperature === undefined) temperature = 0.8;
  const apiKey = getGeminiKey();
  if (!apiKey) {
    const err = new Error("Gemini API key not configured");
    err.statusCode = 503;
    throw err;
  }

  const url = "https://generativelanguage.googleapis.com/v1beta/models/" + MODEL + ":generateContent?key=" + apiKey;

  const body = {
    contents: [
      {
        role: "user",
        parts: [{ text: prompt }]
      }
    ],
    systemInstruction: {
      parts: [{ text: systemInstruction }]
    },
    generationConfig: {
      temperature: temperature,
      response_mime_type: "application/json"
    }
  };

  const res = await axios.post(url, body, {
    headers: { "Content-Type": "application/json" },
    timeout: 30000
  });

  const data = res.data;
  if (!data.candidates || !data.candidates[0]) {
    throw new Error("Gemini returned no candidates");
  }

  const text = data.candidates[0].content?.parts?.[0]?.text;
  if (!text) {
    throw new Error("Gemini returned empty response");
  }

  return text;
}

module.exports = { callGemini, getGeminiKey, MODEL };
