# PDF Gemini Chat

This project provides a local chatbot that:

- accepts a PDF upload from the browser
- extracts and embeds the PDF with **FAISS** (using sentence-transformers multilingual model)
- answers user questions by retrieving top relevant chunks and sending them to Gemini (you add your API key)

## Structure
- `index.html` — frontend (plain HTML + JS)
- `server.js` — Node.js server (Express) — serves frontend, forwards uploads and chat to Python
- `app.py` — Python core (Flask) — PDF processing, embeddings, FAISS search
- `.env.example` — copy to `.env` and fill GEMINI keys

## Quick start (local)
1. Python service
```bash
python -m venv venv
source venv/bin/activate   
pip install -r requirements.txt
python app.py
```

2. Node server
```bash
npm install
node server.js
```

3. Open http://localhost:3000 in your browser, upload a PDF, and ask questions.

## Notes
- The Node server contains a placeholder Gemini call — replace the `GEMINI_ENDPOINT` and headers with your provider's API shape.
- The Python model (`paraphrase-multilingual-MiniLM-L12-v2`) will be downloaded automatically by sentence-transformers on first run.
