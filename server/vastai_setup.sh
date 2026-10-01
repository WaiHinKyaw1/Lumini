#!/bin/bash
# ================================================================
# Lumini VoxCPM2 — Vast.ai One-Click Setup Script
# ================================================================
# Usage: paste this into Vast.ai SSH terminal or Web Terminal
# Cost:  ~$0.10-0.20/hr (RTX 3090), pay only when running
# ================================================================

set -e

echo ""
echo "================================================================"
echo "  🚀 Lumini VoxCPM2 — Vast.ai GPU Server Setup"
echo "================================================================"
echo ""

# ── Step 1: System packages ───────────────────────────────────────
echo "⏳ [1/5] Installing system packages (ffmpeg, wget, screen)..."
apt-get update -qq
apt-get install -y -qq ffmpeg wget curl screen python3-pip 2>/dev/null
echo "✅ System packages installed."

# ── Step 2: Python packages ───────────────────────────────────────
echo ""
echo "⏳ [2/5] Installing Python packages (voxcpm, fastapi, torch)..."
echo "   This may take 3-5 minutes on first run..."
pip install -q --upgrade pip
pip install -q voxcpm fastapi uvicorn soundfile torch torchaudio \
    python-multipart numpy
echo "✅ Python packages installed."

# ── Step 3: Cloudflare Tunnel ─────────────────────────────────────
echo ""
echo "⏳ [3/5] Installing Cloudflare Tunnel (no timeout, stable URL)..."
if [ ! -f /usr/local/bin/cloudflared ]; then
    wget -q https://github.com/cloudflare/cloudflared/releases/latest/download/cloudflared-linux-amd64 \
        -O /usr/local/bin/cloudflared
    chmod +x /usr/local/bin/cloudflared
    echo "✅ Cloudflare Tunnel installed."
else
    echo "✅ Cloudflare Tunnel already installed."
fi

# ── Step 4: Write FastAPI Server ──────────────────────────────────
echo ""
echo "⏳ [4/5] Writing VoxCPM2 FastAPI Server (app.py)..."
cat > /root/app.py << 'PYEOF'
import os, io, gc, sys, uuid, re, tempfile
from pathlib import Path
from typing import Optional
import numpy as np
import soundfile as sf
import torch
from fastapi import FastAPI, UploadFile, File, Form, HTTPException
from fastapi.responses import Response, JSONResponse
from fastapi.middleware.cors import CORSMiddleware
import uvicorn

app = FastAPI(title="Lumini VoxCPM2 Vast.ai GPU Engine", version="2.0.0")
app.add_middleware(CORSMiddleware, allow_origins=["*"], allow_credentials=True,
                   allow_methods=["*"], allow_headers=["*"])

VOICE_DIR = Path(tempfile.gettempdir()) / "lumini_voxcpm_prompts"
VOICE_DIR.mkdir(parents=True, exist_ok=True)

model = None
model_error = None
sample_rate = 48000

print("⏳ Loading OpenBMB VoxCPM2 Model into GPU...", flush=True)
try:
    from voxcpm import VoxCPM
    model = VoxCPM.from_pretrained("openbmb/VoxCPM2", load_denoiser=False)
    if hasattr(model, 'tts_model') and hasattr(model.tts_model, 'sample_rate'):
        sample_rate = model.tts_model.sample_rate
    print(f"✅ VoxCPM2 loaded! Sample Rate: {sample_rate}Hz", flush=True)
except Exception as e:
    import traceback; traceback.print_exc()
    model_error = str(e)
    print(f"❌ Model load failed: {e}", flush=True)

@app.get("/")
@app.get("/health")
@app.get("/api/voxcpm/status")
def status():
    cuda = torch.cuda.is_available()
    device = torch.cuda.get_device_name(0) if cuda else "CPU"
    vram_used = round(torch.cuda.memory_allocated(0)/1024**3, 2) if cuda else 0
    vram_total = round(torch.cuda.get_device_properties(0).total_memory/1024**3, 2) if cuda else 0
    return {
        "online": model is not None,
        "ok": model is not None,
        "engine": "VoxCPM2 (OpenBMB 48kHz) — Vast.ai GPU",
        "cuda": cuda,
        "device": f"{device} ({vram_used}GB / {vram_total}GB VRAM)",
        "sample_rate": sample_rate,
        "error": model_error if model is None else None,
        "supports_zero_shot": True,
        "supports_style_prompting": True
    }

@app.post("/api/voxcpm/clone")
def register_voice(name: str = Form(...),
                   instruction: Optional[str] = Form("Energetic narration style"),
                   transcript: Optional[str] = Form(None),
                   file: UploadFile = File(...)):
    voice_id = str(uuid.uuid4())
    ext = Path(file.filename or "sample.wav").suffix.lower() or ".wav"
    path = VOICE_DIR / f"{voice_id}{ext}"
    path.write_bytes(file.file.read())
    if ext != ".wav":
        os.system(f"ffmpeg -y -i '{path}' -ar 48000 -ac 1 '{VOICE_DIR}/{voice_id}.wav' >/dev/null 2>&1")
    return {"voiceId": voice_id, "name": name, "instruction": instruction,
            "message": "Voice registered for 48kHz Zero-Shot cloning."}

def split_text(text: str, max_len: int = 140):
    text = re.sub(r'\s+', ' ', text).strip()
    if not text: return []
    parts = re.split(r'(?<=[။!?\n])\s*', text)
    chunks, cur = [], ""
    for s in parts:
        s = s.strip()
        if not s: continue
        if len(cur) + len(s) + 1 <= max_len:
            cur = (cur + " " + s).strip() if cur else s
        else:
            if cur: chunks.append(cur)
            cur = s
    if cur: chunks.append(cur)
    return chunks or [text]

@app.post("/api/voxcpm/synthesize")
def synthesize(voice_id: Optional[str] = Form(None), text: str = Form(...),
               instruction: Optional[str] = Form(None), speed: float = Form(1.0)):
    if model is None:
        raise HTTPException(503, detail=f"VoxCPM2 not ready: {model_error or 'Initializing'}")
    if not text.strip():
        raise HTTPException(400, detail="Text cannot be empty")
    audio_path = None
    if voice_id and voice_id != "default":
        for ext in [".wav", ".mp3", ".webm", ".m4a", ".ogg"]:
            p = VOICE_DIR / f"{voice_id}{ext}"
            if p.exists(): audio_path = str(p); break
    chunks = split_text(text)
    print(f"🎙️ Synthesizing {len(chunks)} chunks...", flush=True)
    pieces, pause = [], np.zeros(int(sample_rate * 0.08), dtype=np.float32)
    try:
        for i, chunk in enumerate(chunks):
            if not chunk.strip(): continue
            try:
                kw = dict(text=chunk, cfg_value=2.0, inference_timesteps=10)
                if audio_path and os.path.exists(audio_path):
                    kw["reference_wav_path"] = audio_path
                wav = model.generate(**kw)
                if isinstance(wav, tuple): wav = wav[0]
                if hasattr(wav, 'cpu'): wav = wav.cpu().numpy()
                if isinstance(wav, np.ndarray):
                    wav = wav.flatten().astype(np.float32)
                    pieces.append(wav)
                    if i < len(chunks) - 1: pieces.append(pause)
            except Exception as e:
                print(f"⚠️ Chunk {i} error: {e}", flush=True)
        if not pieces: raise HTTPException(500, detail="No audio generated")
        full = np.concatenate(pieces)
        mx = np.max(np.abs(full))
        if mx > 1e-5: full = full / mx * 0.95
        buf = io.BytesIO()
        sf.write(buf, full, sample_rate, format='WAV', subtype='PCM_16')
        buf.seek(0)
        return Response(content=buf.read(), media_type="audio/wav")
    finally:
        if torch.cuda.is_available(): torch.cuda.empty_cache()
        gc.collect()

if __name__ == "__main__":
    port = int(os.environ.get("PORT", 8000))
    uvicorn.run(app, host="0.0.0.0", port=port, log_level="info")
PYEOF
echo "✅ app.py written successfully."

# ── Step 5: Start Server + Cloudflare Tunnel ──────────────────────
echo ""
echo "⏳ [5/5] Starting VoxCPM2 Server + Cloudflare Tunnel..."

# Kill any existing sessions
screen -S voxcpm -X quit 2>/dev/null || true
screen -S tunnel -X quit 2>/dev/null || true
rm -f /tmp/tunnel.log /tmp/app.log
sleep 1

# Start FastAPI server in screen
screen -dmS voxcpm bash -c "python3 /root/app.py 2>&1 | tee /tmp/app.log"
sleep 3

# Start Cloudflare tunnel in screen
screen -dmS tunnel bash -c "cloudflared tunnel --url http://127.0.0.1:8000 2>&1 | tee /tmp/tunnel.log"

# Wait and extract URL
echo ""
echo "⏳ VoxCPM2 Model ကို GPU ပေါ် တင်နေပါသည် (မိနစ် ၂-၅ ကြာနိုင်သည်)..."
echo "   (Model download ပြီးနောက် နောက်ကြိမ် run ရင် ပိုမြန်ပါမည်)"
echo ""

URL=""
for i in $(seq 1 30); do
    if [ -f /tmp/tunnel.log ]; then
        URL=$(grep -o 'https://[a-zA-Z0-9-]*\.trycloudflare\.com' /tmp/tunnel.log 2>/dev/null | tail -1)
        [ -n "$URL" ] && break
    fi
    sleep 2
done

# Wait for model to load
READY=false
for attempt in $(seq 1 120); do
    HTTP=$(curl -s -o /dev/null -w "%{http_code}" http://127.0.0.1:8000/api/voxcpm/status 2>/dev/null)
    if [ "$HTTP" = "200" ]; then
        STATUS=$(curl -s http://127.0.0.1:8000/api/voxcpm/status 2>/dev/null)
        ONLINE=$(echo "$STATUS" | python3 -c "import sys,json; d=json.load(sys.stdin); print(d.get('online','false'))" 2>/dev/null)
        if [ "$ONLINE" = "True" ]; then
            DEVICE=$(echo "$STATUS" | python3 -c "import sys,json; d=json.load(sys.stdin); print(d.get('device','GPU'))" 2>/dev/null)
            READY=true
            break
        fi
    fi
    sleep 3
done

echo ""
echo "================================================================"
if $READY && [ -n "$URL" ]; then
    echo "🎉 🟢 VOXCPM2 VAST.AI GPU SERVER IS ONLINE!"
    echo "⚡ Device : $DEVICE"
    echo "================================================================"
    echo ""
    echo "👉 ဒီ URL ကို Lumini (Voiceover Studio) ထဲ Paste လုပ်ပါ:"
    echo ""
    echo "   $URL"
    echo ""
    echo "================================================================"
    echo "💡 Server screen session ကြည့်ရန်: screen -r voxcpm"
    echo "💡 ဈေးနှုန်း: vast.ai dashboard တွင် ကြည့်နိုင်သည်"
    echo "💡 Instance ရပ်ရန် (ဈေး ကောက်ချင်မှ): vast.ai → Stop Instance"
else
    echo "⚠️ Setup အချိန်ကြာနေသည် သို့မဟုတ် Error ဖြစ်ပါသည်"
    echo ""
    echo "Server logs ကြည့်ရန်:"
    echo "  cat /tmp/app.log"
    echo "Tunnel logs ကြည့်ရန်:"
    echo "  cat /tmp/tunnel.log"
fi
echo "================================================================"
