from flask import Flask, request, jsonify
import fitz
import uuid, os, tempfile, traceback
from sentence_transformers import SentenceTransformer
import numpy as np
import faiss
from pathlib import Path

app = Flask(__name__)
UPLOAD_DIR = 'py_uploads'
os.makedirs(UPLOAD_DIR, exist_ok=True)

SESSIONS = {}
MODEL_NAME = 'sentence-transformers/paraphrase-multilingual-MiniLM-L12-v2'  

print('Loading embedding model:', MODEL_NAME)
embedder = SentenceTransformer(MODEL_NAME)

def extract_text_from_pdf(path):
    doc = fitz.open(path)
    pages = []
    for p in doc:
        pages.append(p.get_text())
    return "\n\n".join(pages)

def chunk_text(text, chunk_size=800, overlap=200):
    chunks = []
    start = 0
    L = len(text)
    while start < L:
        end = min(start + chunk_size, L)
        chunk = text[start:end].strip()
        if chunk:
            chunks.append(chunk)
        start += chunk_size - overlap
    return chunks

@app.route('/upload', methods=['POST'])
def upload_pdf():
    if 'file' not in request.files:
        return jsonify({'error':'no file part'}), 400
    f = request.files['file']
    filename = str(uuid.uuid4()) + '_' + f.filename
    path = os.path.join(UPLOAD_DIR, filename)
    f.save(path)

    try:
        text = extract_text_from_pdf(path)
    except Exception as e:
        traceback.print_exc()
        return jsonify({'error': 'pdf extract failed', 'details': str(e)}), 500

    chunks = chunk_text(text)
    if not chunks:
        return jsonify({'error':'no text found in PDF'}), 400

    embeddings = embedder.encode(chunks, convert_to_numpy=True, normalize_embeddings=True)
    dim = embeddings.shape[1]

    index = faiss.IndexFlatIP(dim)
    index.add(embeddings)

    session_id = str(uuid.uuid4())
    SESSIONS[session_id] = {
        'chunks': chunks,
        'embeddings': embeddings,
        'index': index
    }

    return jsonify({'session_id': session_id, 'num_chunks': len(chunks)})

@app.route('/query', methods=['POST'])
def query():
    data = request.get_json()
    session_id = data.get('session_id')
    question = data.get('question','')
    top_k = int(data.get('top_k', 4))
    if not session_id or session_id not in SESSIONS:
        return jsonify({'error':'invalid session_id'}), 400
    if not question:
        return jsonify({'error':'empty question'}), 400

    s = SESSIONS[session_id]
    chunks = s['chunks']
    index = s['index']

    q_emb = embedder.encode([question], convert_to_numpy=True, normalize_embeddings=True)
    D, I = index.search(q_emb, top_k)
    top_chunks = []
    sims = []
    for dist, idx in zip(D[0], I[0]):
        if idx < 0 or idx >= len(chunks): continue
        top_chunks.append(chunks[idx])
        sims.append(float(dist))

    return jsonify({'top_chunks': top_chunks, 'similarities': sims})

if __name__ == '__main__':
    app.run(port=5000, debug=True)
