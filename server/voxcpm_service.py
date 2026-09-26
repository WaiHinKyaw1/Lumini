"""
VoxCPM Voice Cloning & Expressive Speech Synthesis Service
-----------------------------------------------------------
OpenBMB VoxCPM / VoxCPM2 integration for Lumini AI Studio.
Supports:
- Zero-Shot Voice Cloning (3-10s reference audio)
- Controllable Style & Emotion Prompting (Movie Recap, Energetic, Suspense)
- 48kHz Studio Quality Output
- FastAPI endpoints for seamless frontend integration
"""

import os
import io
import sys
import uuid
import tempfile
from typing import Optional
from pathlib import Path

try:
    from fastapi import FastAPI, UploadFile, File, Form, HTTPException
    from fastapi.responses import Response, JSONResponse
    from fastapi.middleware.cors import CORSMiddleware
    import uvicorn
except ImportError:
    print("FastAPI / Uvicorn not installed. Run: pip install fastapi uvicorn")

app = FastAPI(title="Lumini VoxCPM Speech Engine", version="1.0.0")

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

VOICE_PROMPTS_DIR = Path(tempfile.gettempdir()) / "lumini_voxcpm_prompts"
VOICE_PROMPTS_DIR.mkdir(parents=True, exist_ok=True)

# Lazy model loader
_voxcpm_model = None

def get_model():
    global _voxcpm_model
    if _voxcpm_model is None:
        try:
            from voxcpm import VoxCPM
            print("Loading OpenBMB VoxCPM2 model...")
            _voxcpm_model = VoxCPM.from_pretrained("openbmb/VoxCPM2", load_denoiser=False)
            print("VoxCPM2 loaded successfully!")
        except Exception as e:
            print(f"VoxCPM could not be initialized directly: {e}")
            _voxcpm_model = False
    return _voxcpm_model

@app.get("/api/voxcpm/status")
async def get_status():
    import torch
    cuda_available = torch.cuda.is_available() if "torch" in sys.modules or __import__("torch") else False
    device_name = torch.cuda.get_device_name(0) if cuda_available else "CPU"
    return {
        "online": True,
        "engine": "VoxCPM2 (OpenBMB 48kHz)",
        "cuda": cuda_available,
        "device": device_name,
        "sample_rate": 48000,
        "supports_zero_shot": True,
        "supports_style_prompting": True
    }

@app.post("/api/voxcpm/clone")
async def register_voice_sample(
    name: str = Form(...),
    instruction: Optional[str] = Form("Energetic movie recap narration style"),
    transcript: Optional[str] = Form(None),
    file: UploadFile = File(...)
):
    voice_id = str(uuid.uuid4())
    ext = Path(file.filename or "sample.wav").suffix or ".wav"
    target_path = VOICE_PROMPTS_DIR / f"{voice_id}{ext}"
    
    content = await file.read()
    with open(target_path, "wb") as f:
        f.write(content)

    meta_path = VOICE_PROMPTS_DIR / f"{voice_id}.json"
    import json
    with open(meta_path, "w", encoding="utf-8") as f:
        json.dump({
            "voiceId": voice_id,
            "name": name,
            "instruction": instruction,
            "transcript": transcript,
            "audioPath": str(target_path)
        }, f, ensure_ascii=False)

    return {
        "voiceId": voice_id,
        "name": name,
        "instruction": instruction,
        "message": "Voice sample registered successfully with VoxCPM engine."
    }

def split_burmese_text(text: str, max_chunk_len: int = 140) -> list[str]:
    import re
    text = re.sub(r'\s+', ' ', text).strip()
    if not text:
        return []
    
    # Split by Burmese full stop (။), newline, exclamation, question mark
    raw_sentences = re.split(r'(?<=[။!?\n])\s*', text)
    chunks = []
    current = ""
    
    for s in raw_sentences:
        s = s.strip()
        if not s:
            continue
        if len(current) + len(s) <= max_chunk_len:
            current = (current + " " + s).strip() if current else s
        else:
            if current:
                chunks.append(current)
            if len(s) > max_chunk_len:
                sub_parts = re.split(r'(?<=[၊,])\s*', s)
                sub_curr = ""
                for sp in sub_parts:
                    sp = sp.strip()
                    if not sp:
                        continue
                    if len(sub_curr) + len(sp) <= max_chunk_len:
                        sub_curr = (sub_curr + " " + sp).strip() if sub_curr else sp
                    else:
                        if sub_curr:
                            chunks.append(sub_curr)
                        sub_curr = sp
                if sub_curr:
                    current = sub_curr
                else:
                    current = ""
            else:
                current = s
                
    if current:
        chunks.append(current)
        
    return chunks if chunks else [text]

@app.post("/api/voxcpm/synthesize")
async def synthesize_speech(
    voice_id: Optional[str] = Form(None),
    text: str = Form(...),
    instruction: Optional[str] = Form(None),
    speed: float = Form(1.0)
):
    audio_path = None
    if voice_id and voice_id != "default":
        for ext in [".wav", ".mp3", ".webm", ".m4a", ".ogg"]:
            candidate = VOICE_PROMPTS_DIR / f"{voice_id}{ext}"
            if candidate.exists():
                audio_path = candidate
                break

    model = get_model()
    
    if model:
        import soundfile as sf
        import numpy as np
        import torch

        try:
            chunks = split_burmese_text(text, max_chunk_len=240)
            print(f"🎙️ Synthesizing {len(chunks)} Burmese sentence chunks with high-fidelity diffusion...")

            audio_pieces = []
            sample_rate = 48000
            if hasattr(model, 'tts_model') and hasattr(model.tts_model, 'sample_rate'):
                sample_rate = model.tts_model.sample_rate

            pause_samples = int(sample_rate * 0.08) # 80ms natural sentence pause
            pause_array = np.zeros(pause_samples, dtype=np.float32)

            for idx, chunk in enumerate(chunks):
                if not chunk.strip():
                    continue

                # Run VoxCPM inference per chunk with high guidance scale & fine diffusion steps
                if audio_path and os.path.exists(audio_path) and os.path.getsize(audio_path) > 100:
                    wav_chunk = model.generate(
                        text=chunk,
                        reference_wav_path=str(audio_path),
                        cfg_value=2.0,
                        inference_timesteps=10
                    )
                else:
                    wav_chunk = model.generate(
                        text=chunk,
                        cfg_value=2.0,
                        inference_timesteps=10
                    )

                # Convert PyTorch Tensor to numpy for soundfile
                if isinstance(wav_chunk, torch.Tensor):
                    wav_chunk = wav_chunk.detach().cpu().numpy()
                
                if isinstance(wav_chunk, np.ndarray):
                    wav_chunk = wav_chunk.squeeze()

                if hasattr(wav_chunk, 'dtype') and wav_chunk.dtype == np.float64:
                    wav_chunk = wav_chunk.astype(np.float32)

                audio_pieces.append(wav_chunk)
                if idx < len(chunks) - 1:
                    audio_pieces.append(pause_array)

            if not audio_pieces:
                raise HTTPException(status_code=400, detail="No audio chunks generated.")

            # Concatenate all sentence chunks seamlessly
            full_audio = np.concatenate(audio_pieces)

            # Peak loudness normalization (prevents clipping & muffled distortion)
            max_val = np.max(np.abs(full_audio))
            if max_val > 0.01:
                full_audio = (full_audio / max_val) * 0.95

            buf = io.BytesIO()
            sf.write(buf, full_audio, sample_rate, format='WAV')
            buf.seek(0)
            return Response(content=buf.read(), media_type="audio/wav")
        except Exception as gen_err:
            import traceback
            traceback.print_exc()
            raise HTTPException(status_code=500, detail=f"VoxCPM Generation Error: {str(gen_err)}")
    else:
        # Fallback response when model package is still downloading
        raise HTTPException(
            status_code=503, 
            detail="VoxCPM model is loading or dependencies missing. Ensure 'pip install voxcpm soundfile torch' is executed on the server."
        )

if __name__ == "__main__":
    port = int(os.environ.get("VOXCPM_PORT", 8080))
    print(f"Starting Lumini VoxCPM Voice Cloning Server on port {port}...")
    uvicorn.run(app, host="0.0.0.0", port=port)
