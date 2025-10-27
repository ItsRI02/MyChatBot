
require('dotenv').config();
const express = require('express');
const multer = require('multer');
const axios = require('axios');
const FormData = require('form-data');
const fs = require('fs');
const path = require('path');

const app = express();
const upload = multer({ dest: 'uploads/' });

app.use(express.json());
app.use(express.static('.'));

const PY_URL = process.env.PY_URL || 'http://localhost:5000';

// Gemini via OpenRouter
const GEMINI_API_KEY = process.env.GEMINI_API_KEY;
const GEMINI_ENDPOINT = process.env.GEMINI_ENDPOINT || 'https://openrouter.ai/api/v1/chat/completions';
const GEMINI_MODEL = process.env.GEMINI_MODEL || 'google/gemini-2.0-flash-exp';

app.get('/', (req, res) => {
  res.sendFile(path.join(__dirname, 'index.html'));
});

app.post('/upload', upload.single('file'), async (req, res) => {
  if (!req.file) return res.status(400).json({ error: 'No file uploaded' });

  try {
    const form = new FormData();
    form.append('file', fs.createReadStream(req.file.path), req.file.originalname);

    const pyResp = await axios.post(`${PY_URL}/upload`, form, {
      headers: { ...form.getHeaders() },
      maxContentLength: Infinity,
      maxBodyLength: Infinity,
    });

    fs.unlink(req.file.path, () => {});
    return res.json(pyResp.data);
  } catch (err) {
    console.error('Upload error:', err?.response?.data || err.message);
    fs.unlink(req.file.path, () => {});
    return res.status(500).json({ error: 'Failed to forward to Python service', details: err?.message });
  }
});

app.post('/chat', async (req, res) => {
  const { session_id, question } = req.body;
  if (!session_id || !question) return res.status(400).json({ error: 'session_id and question are required' });

  try {
    const pyResp = await axios.post(`${PY_URL}/query`, { session_id, question });
    const contextChunks = (pyResp.data && pyResp.data.top_chunks) || [];

    const systemInstruction = `You are a helpful assistant. Answer the user's question ONLY using the provided CONTEXT. 
Reply in Arabic. If the answer cannot be found in the context, say:
"عذرًا، لا أستطيع العثور على معلومات كافية في الملف."`;

    const contextText = contextChunks.map((c, i) => `[CONTEXT ${i + 1}]\n${c}`).join('\n\n');

    const prompt = `${systemInstruction}\n\nCONTEXT:\n${contextText}\n\nUSER QUESTION:\n${question}\n\nAnswer only from the context above.`;

    const geminiPayload = {
      model: GEMINI_MODEL,
      messages: [
        { role: "system", content: "You are a helpful assistant that answers in Arabic using only the provided context." },
        { role: "user", content: prompt }
      ]
    };

    const gemResp = await axios.post(GEMINI_ENDPOINT, geminiPayload, {
      headers: {
        'Authorization': `Bearer ${GEMINI_API_KEY}`,
        'Content-Type': 'application/json'
      },
      timeout: 20000
    });

    let answer = '';
    if (gemResp.data?.choices?.[0]?.message?.content) {
      answer = gemResp.data.choices[0].message.content;
    } else {
      answer = JSON.stringify(gemResp.data);
    }

    return res.json({ answer: answer });
  } catch (err) {
    console.error('Chat error:', err?.response?.data || err.message);
    return res.status(500).json({ error: 'Chat failed', details: err?.message });
  }
});

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => console.log(`🚀 Node server running on http://localhost:${PORT}`));
