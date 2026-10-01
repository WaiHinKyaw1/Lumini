"""
Lumini VoxCPM2 — Modal.com Serverless GPU Deployment
=====================================================
- Auto cold-start: Request လာမှသာ GPU spin up
- Auto scale-to-zero: မသုံးရင် ချက်ချင်း shut down
- Pay-per-second: GPU run တဲ့ second အတိုင်းပဲ ကောက်
- Free: $30/month credit (ပထမဆုံး)

Deploy command:
  pip install modal
  modal deploy server/modal_voxcpm.py

Test command:
  modal run server/modal_voxcpm.py
"""

import io
import os
import re
import gc
import uuid
import tempfile
from pathlib import Path
from typing import Optional

import modal

# ── Docker Image (VoxCPM + dependencies) ─────────────────────────
voxcpm_image = (
    modal.Image.debian_slim(python_version="3.11")
    .apt_install("ffmpeg", "wget")
    .pip_install(
        "voxcpm",
        "fastapi",
        "uvicorn",
        "python-multipart",
        "soundfile",
        "torch",
        "torchaudio",
        "numpy",
    )
)

app = modal.App("lumini-voxcpm2", image=voxcpm_image)

# ── Persistent Volume for voice samples ──────────────────────────
voice_volume = modal.Volume.from_name("lumini-voice-samples", create_if_missing=True)

# ── GPU Inference Class ───────────────────────────────────────────
@app.cls(
    gpu="T4",                    # T4 GPU (~$0.000164/sec) — cheapest that works
    # gpu="A10G",               # Uncomment for faster inference
    container_idle_timeout=60,  # 60s idle = auto shutdown (ကြာလွန်းရင် ဈေးကုန်)
    volumes={"/voice_samples": voice_volume},
    secrets=[modal.Secret.from_name("lumini-secrets", required=False)],
)
class VoxCPMEngine:

    @modal.enter()
    def load_model(self):
        """Container start ဖြစ်တိုင်း model တစ်ကြိမ်သာ load"""
        from voxcpm import VoxCPM
        import torch

        print("⏳ Loading VoxCPM2 model into GPU...", flush=True)
        self.model = VoxCPM.from_pretrained("openbmb/VoxCPM2", load_denoiser=False)
        self.sample_rate = 48000
        if hasattr(self.model, "tts_model") and hasattr(self.model.tts_model, "sample_rate"):
            self.sample_rate = self.model.tts_model.sample_rate
        print(f"✅ VoxCPM2 ready! SR={self.sample_rate}Hz", flush=True)

    @modal.method()
    def synthesize(self, text: str, voice_id: Optional[str] = None) -> bytes:
        """Text → WAV bytes"""
        import numpy as np
        import soundfile as sf
        import torch

        audio_path = None
        if voice_id and voice_id != "default":
            for ext in [".wav", ".mp3", ".webm", ".m4a", ".ogg"]:
                p = Path(f"/voice_samples/{voice_id}{ext}")
                if p.exists():
                    audio_path = str(p)
                    break

        chunks = self._split_text(text)
        print(f"🎙️ Synthesizing {len(chunks)} chunks...", flush=True)

        pieces = []
        pause = np.zeros(int(self.sample_rate * 0.08), dtype=np.float32)

        try:
            for i, chunk in enumerate(chunks):
                if not chunk.strip():
                    continue
                kw = dict(text=chunk, cfg_value=2.0, inference_timesteps=10)
                if audio_path:
                    kw["reference_wav_path"] = audio_path
                wav = self.model.generate(**kw)
                if isinstance(wav, tuple):
                    wav = wav[0]
                if hasattr(wav, "cpu"):
                    wav = wav.cpu().numpy()
                if isinstance(wav, np.ndarray):
                    wav = wav.flatten().astype(np.float32)
                    pieces.append(wav)
                    if i < len(chunks) - 1:
                        pieces.append(pause)

            if not pieces:
                raise RuntimeError("No audio generated")

            full = np.concatenate(pieces)
            mx = np.max(np.abs(full))
            if mx > 1e-5:
                full = full / mx * 0.95

            buf = io.BytesIO()
            sf.write(buf, full, self.sample_rate, format="WAV", subtype="PCM_16")
            return buf.getvalue()
        finally:
            if torch.cuda.is_available():
                torch.cuda.empty_cache()
            gc.collect()

    @modal.method()
    def register_voice(self, audio_bytes: bytes, voice_id: str, ext: str = ".wav"):
        """Voice sample ကို persistent volume တွင် သိမ်းဆည်း"""
        path = Path(f"/voice_samples/{voice_id}{ext}")
        path.write_bytes(audio_bytes)
        # Convert to WAV if needed
        if ext != ".wav":
            wav_path = Path(f"/voice_samples/{voice_id}.wav")
            os.system(f"ffmpeg -y -i '{path}' -ar 48000 -ac 1 '{wav_path}' >/dev/null 2>&1")
        voice_volume.commit()
        return voice_id

    def _split_text(self, text: str, max_len: int = 140):
        text = re.sub(r"\s+", " ", text).strip()
        if not text:
            return []
        parts = re.split(r"(?<=[။!?\n])\s*", text)
        chunks, cur = [], ""
        for s in parts:
            s = s.strip()
            if not s:
                continue
            if len(cur) + len(s) + 1 <= max_len:
                cur = (cur + " " + s).strip() if cur else s
            else:
                if cur:
                    chunks.append(cur)
                cur = s
        if cur:
            chunks.append(cur)
        return chunks or [text]


# ── FastAPI Web Endpoint (Vercel ကနေ call မယ့် URL) ──────────────
from fastapi import FastAPI, UploadFile, File, Form, HTTPException
from fastapi.responses import Response
from fastapi.middleware.cors import CORSMiddleware

web_app = FastAPI(title="Lumini VoxCPM2 Serverless", version="2.0.0")
web_app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)


@web_app.get("/")
@web_app.get("/health")
@web_app.get("/api/voxcpm/status")
def status():
    return {
        "online": True,
        "ok": True,
        "engine": "VoxCPM2 (OpenBMB 48kHz) — Modal Serverless GPU",
        "mode": "serverless",
        "auto_scale": True,
        "sample_rate": 48000,
        "supports_zero_shot": True,
        "supports_style_prompting": True,
    }


@web_app.post("/api/voxcpm/clone")
async def register_voice_endpoint(
    name: str = Form(...),
    instruction: Optional[str] = Form("Energetic narration style"),
    transcript: Optional[str] = Form(None),
    file: UploadFile = File(...),
):
    voice_id = str(uuid.uuid4())
    ext = Path(file.filename or "sample.wav").suffix.lower() or ".wav"
    audio_bytes = await file.read()

    engine = VoxCPMEngine()
    engine.register_voice.remote(audio_bytes, voice_id, ext)

    return {
        "voiceId": voice_id,
        "name": name,
        "instruction": instruction,
        "message": "Voice registered for 48kHz Zero-Shot cloning.",
    }


@web_app.post("/api/voxcpm/synthesize")
async def synthesize_endpoint(
    voice_id: Optional[str] = Form(None),
    text: str = Form(...),
    instruction: Optional[str] = Form(None),
    speed: float = Form(1.0),
):
    if not text.strip():
        raise HTTPException(status_code=400, detail="Text cannot be empty")

    engine = VoxCPMEngine()
    try:
        wav_bytes = engine.synthesize.remote(text, voice_id)
        return Response(content=wav_bytes, media_type="audio/wav")
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))


# ── Mount FastAPI app onto Modal ──────────────────────────────────
@app.function()
@modal.asgi_app()
def fastapi_app():
    return web_app


# ── Local test ────────────────────────────────────────────────────
@app.local_entrypoint()
def test():
    engine = VoxCPMEngine()
    wav = engine.synthesize.remote("မင်္ဂလာပါ။ ဒါကို Modal GPU ပေါ်မှ ပြောဆိုနေပါတယ်။")
    with open("test_output.wav", "wb") as f:
        f.write(wav)
    print("✅ Test audio saved to test_output.wav")
