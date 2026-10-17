"""
OneClick Recap — English to Myanmar Auto-Narrator Service
===========================================================
Full pipeline running on AWS EC2 (FastAPI):
  1. Whisper (small.en) — English transcription with word-level timestamps
  2. Gemini — Burmese translation with story-context memory
  3. Edge TTS — Myanmar voice synthesis (Thiha / Nilar)
  4. FFmpeg — Smart Sync: Myanmar voice leads, video re-timed to it

Reference: https://github.com/tharlaimar/recap-en-to-mm
Adapted for headless server (no tkinter GUI) by Lumini AI Studio.
"""

from __future__ import annotations

import asyncio
import hashlib
import json
import os
import io
import re
import shutil
import subprocess
import sys
import tempfile
import time
import traceback
import unicodedata
import uuid
from dataclasses import dataclass, field
from pathlib import Path
from typing import Any, Optional

try:
    from fastapi import FastAPI, UploadFile, File, Form, HTTPException, BackgroundTasks
    from fastapi.responses import FileResponse, JSONResponse, Response
    from fastapi.middleware.cors import CORSMiddleware
    import uvicorn
except ImportError:
    print("FastAPI / Uvicorn not installed. Run: pip install fastapi uvicorn python-multipart")

try:
    from dotenv import load_dotenv
    load_dotenv()
except ImportError:
    pass

# ─────────────────────────── App Init ───────────────────────────

app = FastAPI(title="Lumini OneClick Recap EN→MM Service", version="1.0.0")

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# Paths
DATA_DIR = Path(os.environ.get("ONECLICK_DATA_DIR", tempfile.gettempdir())) / "lumini_oneclick"
JOBS_DIR = DATA_DIR / "jobs"
JOBS_DIR.mkdir(parents=True, exist_ok=True)

# Job status tracking
_job_store: dict[str, dict[str, Any]] = {}

# ─────────────────────────── Utility ───────────────────────────

def find_ffmpeg() -> str:
    """Find ffmpeg binary."""
    for candidate in ["/usr/bin/ffmpeg", "/usr/local/bin/ffmpeg"]:
        if os.path.isfile(candidate):
            return candidate
    found = shutil.which("ffmpeg")
    if found:
        return found
    raise FileNotFoundError("ffmpeg not found on this server. Install it: apt install ffmpeg")


def find_ffprobe() -> str:
    """Find ffprobe binary."""
    for candidate in ["/usr/bin/ffprobe", "/usr/local/bin/ffprobe"]:
        if os.path.isfile(candidate):
            return candidate
    found = shutil.which("ffprobe")
    if found:
        return found
    raise FileNotFoundError("ffprobe not found on this server.")


def probe_duration(path: Path) -> float:
    """Get media duration in seconds."""
    ffprobe = find_ffprobe()
    result = subprocess.run(
        [ffprobe, "-v", "error", "-show_entries", "format=duration",
         "-of", "default=noprint_wrappers=1:nokey=1", str(path)],
        capture_output=True, text=True, encoding="utf-8", errors="replace",
    )
    if result.returncode != 0:
        raise RuntimeError(f"ffprobe failed: {result.stderr[-2000:]}")
    return float(result.stdout.strip())


def probe_dimensions(path: Path) -> tuple[int, int]:
    """Get video width and height."""
    ffprobe = find_ffprobe()
    result = subprocess.run(
        [ffprobe, "-v", "error", "-select_streams", "v:0",
         "-show_entries", "stream=width,height",
         "-of", "csv=s=x:p=0", str(path)],
        capture_output=True, text=True,
    )
    try:
        parts = result.stdout.strip().split("x")
        return int(parts[0]), int(parts[1])
    except Exception:
        return 1920, 1080


def update_job(job_id: str, **kwargs):
    """Update job status in memory store."""
    if job_id in _job_store:
        _job_store[job_id].update(kwargs)


# ─────────────────────────── Step 1: Whisper Transcription ───────────────────────────

def transcribe_with_whisper(audio_path: Path, job_dir: Path, job_id: str) -> list[dict]:
    """Extract English speech from audio using Groq Whisper (ultra-fast ~2s) or local Whisper fallback."""
    update_job(job_id, step="transcription", progress=10, message="Speech recognition starting...")

    groq_api_key = os.environ.get("GROQ_API_KEY", "").strip()
    segments = []

    # 1. Groq Whisper (Fastest: ~2 seconds)
    if groq_api_key:
        try:
            update_job(job_id, progress=12, message="Transcribing with ultra-fast Whisper AI...")
            from groq import Groq
            groq_client = Groq(api_key=groq_api_key)

            # Compress audio to 16kHz mono mp3 for fast upload (<5MB)
            ffmpeg = find_ffmpeg()
            fast_audio = job_dir / "groq_audio.mp3"
            subprocess.run(
                [ffmpeg, "-y", "-hide_banner", "-loglevel", "error",
                 "-i", str(audio_path), "-ar", "16000", "-ac", "1", "-b:a", "32k", str(fast_audio)],
                capture_output=True,
            )
            upload_target = fast_audio if fast_audio.is_file() else audio_path

            with open(upload_target, "rb") as af:
                resp = groq_client.audio.transcriptions.create(
                    file=af,
                    model="whisper-large-v3-turbo",
                    response_format="verbose_json",
                    language="en",
                )

            raw_segs = getattr(resp, "segments", [])
            for seg in raw_segs:
                start = round(float(seg.get("start", 0.0) if isinstance(seg, dict) else getattr(seg, "start", 0.0)), 3)
                end = round(float(seg.get("end", 0.0) if isinstance(seg, dict) else getattr(seg, "end", 0.0)), 3)
                text = str(seg.get("text", "") if isinstance(seg, dict) else getattr(seg, "text", "")).strip()
                if text:
                    segments.append({"start": start, "end": end, "text": text})

            try:
                fast_audio.unlink(missing_ok=True)
            except Exception:
                pass
        except Exception as e:
            print(f"Groq Whisper fallback to local: {e}")
            segments = []

    # 2. Local Whisper Fallback
    if not segments:
        update_job(job_id, progress=15, message="Transcribing with local Whisper...")
        try:
            import whisper
        except ImportError:
            raise RuntimeError("Whisper not installed. Run: pip install openai-whisper")

        model = whisper.load_model("base.en")
        result = model.transcribe(
            str(audio_path),
            word_timestamps=True,
            language="en",
            verbose=False,
        )

        for seg in result.get("segments", []):
            segments.append({
                "start": round(seg["start"], 3),
                "end": round(seg["end"], 3),
                "text": seg["text"].strip(),
            })

    # Save transcript
    transcript_path = job_dir / "whisper_transcript.json"
    transcript_path.write_text(json.dumps(segments, ensure_ascii=False, indent=2), encoding="utf-8")

    # Plain text
    plain = "\n".join(s["text"] for s in segments)
    (job_dir / "whisper_transcript.txt").write_text(plain, encoding="utf-8")

    update_job(job_id, progress=25, message=f"Transcription complete — {len(segments)} segments")
    return segments


# ─────────────────────────── Step 2: Smart Segmentation ───────────────────────────

def split_long_segment(seg: dict, max_dur: float = 3.0) -> list[dict]:
    """Split long Whisper segment into short, sentence-level narration units."""
    text = seg.get("text", "").strip()
    total_dur = max(0.2, float(seg["end"]) - float(seg["start"]))
    if not text:
        return []

    # If already short, keep it
    if total_dur <= max_dur and len(text.split()) <= 7:
        return [seg]

    # Split on sentence boundaries and strong pauses (. ! ? ; ,)
    parts = re.split(r'(?<=[.!?])\s+|(?<=[,;])\s+', text)
    parts = [p.strip() for p in parts if p.strip()]
    if not parts or len(parts) == 1:
        words = text.split()
        if len(words) <= 7 and total_dur <= max_dur:
            return [seg]
        # Chunk by 5-6 words
        parts = []
        chunk = []
        for w in words:
            chunk.append(w)
            if len(chunk) >= 6:
                parts.append(" ".join(chunk))
                chunk = []
        if chunk:
            parts.append(" ".join(chunk))

    total_words = sum(max(1, len(p.split())) for p in parts)
    res = []
    curr = float(seg["start"])
    for p in parts:
        w_cnt = max(1, len(p.split()))
        d = (w_cnt / total_words) * total_dur
        s_end = round(curr + d, 3)
        res.append({
            "start": round(curr, 3),
            "end": s_end,
            "text": p,
        })
        curr = s_end
    return res


def segment_for_narration(segments: list[dict], max_chunk_sec: float = 3.0, hard_max: float = 3.8) -> list[dict]:
    """Split Whisper segments into narration-friendly short chunks (prevents huge stacked subtitles)."""
    # Step 1: Break down any long segments first
    broken = []
    for s in segments:
        dur = float(s["end"]) - float(s["start"])
        if dur > hard_max or len(s.get("text", "").split()) > 7:
            broken.extend(split_long_segment(s, max_dur=max_chunk_sec))
        else:
            broken.append(s)

    # Step 2: Merge only very tiny fragments (< 1.4s) if adjacent in time
    chunks = []
    current_text = ""
    current_start = 0.0
    current_end = 0.0

    for seg in broken:
        seg_text = seg.get("text", "").strip()
        if not seg_text:
            continue

        if not current_text:
            current_text = seg_text
            current_start = float(seg["start"])
            current_end = float(seg["end"])
            continue

        gap = float(seg["start"]) - current_end
        combined_dur = float(seg["end"]) - current_start

        # If previous was very short (< 1.4s) and gap is small (< 0.6s) and combined fits:
        if (current_end - current_start) < 1.4 and gap < 0.6 and combined_dur <= max_chunk_sec:
            current_text += " " + seg_text
            current_end = float(seg["end"])
        else:
            chunks.append({
                "start": round(current_start, 3),
                "end": round(current_end, 3),
                "text": current_text.strip(),
            })
            current_text = seg_text
            current_start = float(seg["start"])
            current_end = float(seg["end"])

    if current_text.strip():
        chunks.append({
            "start": round(current_start, 3),
            "end": round(current_end, 3),
            "text": current_text.strip(),
        })

    return chunks


# ─────────────────────────── Step 3: Gemini Translation ───────────────────────────

def translate_with_gemini(
    chunks: list[dict],
    job_dir: Path,
    job_id: str,
    batch_size: int = 40,
) -> list[dict]:
    """Translate English segments to Myanmar Burmese using Gemini."""
    update_job(job_id, step="translation", progress=30, message="Gemini translation starting...")

    api_key = os.environ.get("GEMINI_API_KEY") or os.environ.get("VITE_GEMINI_API_KEY", "")
    if not api_key:
        raise RuntimeError("GEMINI_API_KEY not set. Cannot translate.")

    try:
        from google import genai
        client = genai.Client(api_key=api_key)
    except ImportError:
        raise RuntimeError("google-genai not installed. Run: pip install google-genai")

    # Build full story context for Gemini
    full_text = "\n".join(f"[{i+1}] {c['text']}" for i, c in enumerate(chunks))

    system_prompt = """သင်သည် မြန်မာ Movie Recap Channel (ဥပမာ- Channel 99, Movie Guide, Reviewer) များတွင် အသံသွင်းနေသော ပရော်ဖက်ရှင်နယ် ဇာတ်လမ်းပြောပြသူ (Professional Burmese Recap Narrator) ဖြစ်သည်။

ရုပ်ရှင်ကို ပရိသတ် စိတ်ဝင်တစား နားထောင်နိုင်မည့် သဘာဝကျပြီး ဆွဲဆောင်မှုရှိသော "ဇာတ်ကြောင်းပြန် မြန်မာစကားပြော (Burmese Narrator Voiceover)" အဖြစ် ပြန်ဆိုပေးရမည်။

အလွန် အရေးကြီးသော စည်းမျဉ်းများ (တိကျစွာ လိုက်နာပါ):
1. "ပေါ့"၊ "ဗျာ"၊ "ဗျ"၊ "ပေါ့ဗျာ" စသည့် စကားလုံးများကို ဝါကျတိုင်းတွင် ထပ်ခါတလဲလဲ အလွန်အကျွံ မသုံးရ။ (အထူးသတိပြုပါ - နားထောင်ရ ရိုးအီစေသောကြောင့် မလိုအပ်ဘဲ လုံးဝမထည့်ပါနှင့်)။
2. စာအုပ်ကြီး စာစကားများဖြစ်သော "သည်"၊ "၏"၊ "၌"၊ "၍"၊ "သောကြောင့်"၊ "ဖြစ်သည်"၊ "လျက်ရှိသည်"၊ "ရာတွင်"၊ "ခဲ့သည်" များကို လုံးဝ (လုံးဝ) မသုံးရ။
3. သဘာဝကျပြီး တည်ကြည်သော Movie Narrator စကားပြောဟန်ဖြင့် ရေးပါ။
   - ဥပမာကောင်း: "အဲ့ဒီအချိန်မှာ ဂျွန်က အခန်းထဲ ဝင်လာခဲ့ပါတယ်။ သူ့သူငယ်ချင်းကို တွေ့လိုက်ရတဲ့အခါ အရမ်း အံ့သြသွားခဲ့ပါတယ်။"
   - ဥပမာကောင်း: "ရဲအရာရှိလည်း အခြေအနေကို ရိပ်မိပြီး သေနတ်ကို ချက်ချင်း ဆွဲထုတ်လိုက်ပါတယ်။"
4. အလွန်အရေးကြီးသည်- ဝါကျကို တိုတိုရှင်းရှင်းနှင့် လိုရင်းသာ ရေးပါ! စာတန်းထိုး ၂ ကြောင်းထက် လုံးဝ ပိုမရှည်စေရန် အပိုင်းတစ်ပိုင်းစီအတွက် စာလုံးရေ ၂၀ မှ ၃၀ အထိသာ အတိအကျ ကွက်တိရေးရမည် (၃ ကြောင်း ၄ ကြောင်း လုံးဝ မဖြစ်စေရ)။
5. ဇာတ်ကောင်အမည်များကို မြန်မာလို အသံထွက်မှန်အတိုင်း သုံးပါ။
6. Output format: Return ONLY a valid JSON array of objects: [{"id": 1, "mm": "တိုရှင်း လိုရင်း မြန်မာစကားပြော စာသား"}, ...]"""

    translated_chunks = []

    # Process in batches
    for batch_start in range(0, len(chunks), batch_size):
        batch_end = min(batch_start + batch_size, len(chunks))
        batch = chunks[batch_start:batch_end]

        batch_text = "\n".join(f"[{batch_start + i + 1}] {c['text']}" for i, c in enumerate(batch))

        prompt = f"""Here is the full story context (for name consistency):
---
{full_text}
---

Now translate these segments (#{batch_start + 1} to #{batch_end}):
{batch_text}

Return ONLY valid JSON array: [{{"id": {batch_start + 1}, "mm": "..."}}, ...]"""

        progress_pct = 30 + int((batch_start / len(chunks)) * 25)
        update_job(job_id, progress=progress_pct,
                   message=f"Translating segments {batch_start + 1}-{batch_end} of {len(chunks)}...")

        candidate_models = [
            os.environ.get("GEMINI_MODEL", "gemini-3.5-flash-lite"),
            "gemini-3.8-flash",
            "gemini-3.5-flash",
            "gemini-3.1-flash-lite",
            "gemini-flash-latest",
        ]

        last_error = None
        for attempt, chosen_model in enumerate(candidate_models):
            try:
                response = client.models.generate_content(
                    model=chosen_model,
                    contents=prompt,
                    config={
                        "system_instruction": system_prompt,
                        "temperature": 0.3,
                    }
                )
                raw_text = response.text.strip()

                # Extract JSON from response (may have ```json ... ```)
                json_match = re.search(r'\[[\s\S]*\]', raw_text)
                if not json_match:
                    raise ValueError(f"No JSON array found in Gemini response from {chosen_model}")

                translations = json.loads(json_match.group())

                for t in translations:
                    idx = int(t["id"]) - 1
                    if 0 <= idx < len(chunks):
                        translated_chunks.append({
                            **chunks[idx],
                            "narration": t["mm"],
                        })
                last_error = None
                break
            except Exception as e:
                last_error = e
                if attempt < len(candidate_models) - 1:
                    time.sleep(1.5)
                    continue

        if last_error:
            raise RuntimeError(f"Gemini translation failed after retries: {last_error}")

    # Validate — audit for missing/corrupted translations
    audit_pass = True
    for i, chunk in enumerate(chunks):
        has_translation = any(tc["start"] == chunk["start"] and tc.get("narration") for tc in translated_chunks)
        if not has_translation:
            audit_pass = False
            translated_chunks.append({
                **chunk,
                "narration": chunk["text"],  # fallback to English
            })

    # Sort by start time
    translated_chunks.sort(key=lambda x: x["start"])

    # Save translations
    translations_path = job_dir / "timestamp_translations.json"
    translations_path.write_text(
        json.dumps(translated_chunks, ensure_ascii=False, indent=2),
        encoding="utf-8",
    )

    update_job(job_id, progress=55,
               message=f"Translation complete — {len(translated_chunks)} segments" +
                       (" (some fallbacks)" if not audit_pass else ""))
    return translated_chunks


# ─────────────────────────── Step 4: Edge TTS Myanmar Voice ───────────────────────────

def normalize_edge_rate(speed_input: Any) -> str:
    """Safely convert any speed format (e.g. 1.25, '1.25x', '+25%', 1.35) into calibrated Edge TTS rate string (+XX%).
    Because Microsoft Myanmar TTS (Nilar/Thiha) default speed is very slow and formal,
    we calibrate the speed factor so that 1.25x and 1.35x truly sound energetic, fast, and snappy for movie recaps.
    """
    if not speed_input:
        return "+25%"
    s = str(speed_input).strip()

    # If already formatted like +XX% or -XX%
    if re.match(r'^[+-]\d+%$', s):
        pct = int(s[1:-1])
        if s.startswith("+"):
            # Boost the percentage because raw Edge-TTS Myanmar is inherently sluggish
            # +15% -> +25%, +25% -> +40%, +35% -> +55%, +50% -> +72%
            boosted = max(pct, int(pct * 1.55))
            return f"+{min(100, boosted)}%"
        return s

    # If given as multiplier like '1.25', '1.25x', '1.35', 1.5
    s_clean = s.lower().replace('x', '').strip()
    try:
        val = float(s_clean)
        if val <= 1.0:
            pct = int((val - 1.0) * 100)
            return f"{pct}%" if pct < 0 else "+15%"
        else:
            # Calibrate multiplier: 1.25x -> +38%, 1.35x -> +53%, 1.50x -> +75%
            pct = int((val - 1.0) * 155)
            return f"+{min(100, max(15, pct))}%"
    except (ValueError, TypeError):
        return "+30%"


async def _edge_tts_save(text: str, voice: str, rate: str, output_path: Path):
    """Async Edge TTS synthesis to MP3."""
    import edge_tts
    communicate = edge_tts.Communicate(text, voice=voice, rate=rate)
    await communicate.save(str(output_path))


def synthesize_edge_tts(
    translated_chunks: list[dict],
    job_dir: Path,
    job_id: str,
    voice: str = "my-MM-ThihaNeural",
    speed: str = "+25%",
) -> list[dict]:
    """Generate Myanmar voice audio for each translated segment using Edge TTS."""
    update_job(job_id, step="voice_synthesis", progress=58, message="Edge TTS voice synthesis starting...")

    tts_dir = job_dir / "tts_audio"
    tts_dir.mkdir(parents=True, exist_ok=True)

    calibrated_rate = normalize_edge_rate(speed)
    print(f"[EdgeTTS] Speed input: {speed} -> Calibrated rate: {calibrated_rate}")

    ffmpeg = find_ffmpeg()
    results = []

    for i, chunk in enumerate(translated_chunks):
        narration = chunk.get("narration", "").strip()
        if not narration:
            continue

        # Clean text for TTS
        clean = unicodedata.normalize("NFC", narration)
        clean = re.sub(r'\s+', ' ', clean).strip()
        if not clean or not any(ch.isalnum() for ch in clean):
            continue

        stem = f"tts_{i+1:04d}"
        mp3_path = tts_dir / f"{stem}.mp3"
        wav_path = tts_dir / f"{stem}.wav"

        progress_pct = 58 + int((i / len(translated_chunks)) * 20)
        update_job(job_id, progress=progress_pct,
                   message=f"Voice synthesis {i+1}/{len(translated_chunks)}...")

        # Retry logic (direct + proxy) like recap-en-to-mm
        success = False
        for attempt in range(3):
            try:
                asyncio.run(_edge_tts_save(clean, voice, calibrated_rate, mp3_path))

                if mp3_path.is_file() and mp3_path.stat().st_size > 256:
                    # Convert MP3 → WAV & remove awkward silence padding for tight, fast pacing
                    conv = subprocess.run(
                        [ffmpeg, "-y", "-hide_banner", "-loglevel", "error",
                         "-i", str(mp3_path),
                         "-af", "silenceremove=start_periods=1:start_duration=0.03:start_threshold=-40dB:detection=peak,areverse,silenceremove=start_periods=1:start_duration=0.03:start_threshold=-40dB:detection=peak,areverse",
                         "-ac", "1", "-ar", "24000",
                         "-c:a", "pcm_s16le", str(wav_path)],
                        capture_output=True, text=True,
                    )
                    if conv.returncode == 0 and wav_path.is_file():
                        mp3_path.unlink(missing_ok=True)
                        success = True
                        break

            except Exception as e:
                if attempt < 2:
                    time.sleep(1.5 * (attempt + 1))
                    continue

        if success:
            # Get WAV duration
            try:
                dur = probe_duration(wav_path)
            except Exception:
                dur = 0.0
            results.append({
                **chunk,
                "tts_audio": str(wav_path),
                "tts_duration": round(dur, 3),
            })

    update_job(job_id, progress=78, message=f"Voice synthesis complete — {len(results)} clips")
    return results


# ─────────────────────────── Step 4b: ElevenLabs Voice Cloning ───────────────────────────

ELEVENLABS_API_KEY = os.environ.get("ELEVENLABS_API_KEY", "sk_3a19cf4561057c4724a2c7b67ac5845d08a3f5fdbc6a48b4")


def clone_voice_sample(voice_sample_path: Path, api_key: str) -> Optional[str]:
    """Clone a custom voice sample with ElevenLabs to get a reusable voice_id."""
    import urllib.request
    try:
        boundary = f"----WebKitFormBoundary{uuid.uuid4().hex}"
        body = []
        body.append(f"--{boundary}\r\nContent-Disposition: form-data; name=\"name\"\r\n\r\nOneClick_Narrator_{int(time.time())}\r\n".encode("utf-8"))
        body.append(f"--{boundary}\r\nContent-Disposition: form-data; name=\"description\"\r\n\r\nOneClick Recap Cloned Voice\r\n".encode("utf-8"))
        file_bytes = voice_sample_path.read_bytes()
        filename = voice_sample_path.name
        body.append(f"--{boundary}\r\nContent-Disposition: form-data; name=\"files\"; filename=\"{filename}\"\r\nContent-Type: audio/mpeg\r\n\r\n".encode("utf-8") + file_bytes + b"\r\n")
        body.append(f"--{boundary}--\r\n".encode("utf-8"))
        payload = b"".join(body)

        req = urllib.request.Request(
            "https://api.elevenlabs.io/v1/voices/add",
            data=payload,
            headers={
                "xi-api-key": api_key,
                "Content-Type": f"multipart/form-data; boundary={boundary}"
            }
        )
        with urllib.request.urlopen(req, timeout=35) as resp:
            data = json.loads(resp.read().decode("utf-8"))
            voice_id = data.get("voice_id")
            if voice_id:
                print(f"[VoiceClone] Created ElevenLabs voice: {voice_id}")
                return voice_id
    except Exception as e:
        print(f"[VoiceClone] Clone error: {e}")
    return None


def synthesize_elevenlabs_tts(
    translated_chunks: list[dict],
    job_dir: Path,
    job_id: str,
    voice_id: str,
    api_key: str,
) -> list[dict]:
    """Synthesize Burmese chunks using ElevenLabs Multilingual v2 with the cloned voice."""
    import urllib.request
    update_job(job_id, step="voice_synthesis", progress=58, message="Narrating with Cloned Voice (ElevenLabs Multilingual v2)...")
    tts_dir = job_dir / "tts_audio"
    tts_dir.mkdir(parents=True, exist_ok=True)
    ffmpeg = find_ffmpeg()
    results = []

    for i, chunk in enumerate(translated_chunks):
        narration = chunk.get("narration", "").strip()
        if not narration:
            continue
        stem = f"tts_{i+1:04d}"
        mp3_path = tts_dir / f"{stem}.mp3"
        wav_path = tts_dir / f"{stem}.wav"

        progress_pct = 58 + int((i / len(translated_chunks)) * 20)
        update_job(job_id, progress=progress_pct, message=f"Cloned voice synthesis {i+1}/{len(translated_chunks)}...")

        success = False
        try:
            req_data = json.dumps({
                "text": narration,
                "model_id": "eleven_multilingual_v2",
                "voice_settings": {
                    "stability": 0.45,
                    "similarity_boost": 0.8,
                    "style": 0.25,
                    "speed": 1.05
                }
            }).encode("utf-8")

            req = urllib.request.Request(
                f"https://api.elevenlabs.io/v1/text-to-speech/{voice_id}",
                data=req_data,
                headers={
                    "xi-api-key": api_key,
                    "Content-Type": "application/json",
                    "Accept": "audio/mpeg"
                }
            )
            with urllib.request.urlopen(req, timeout=40) as resp:
                content = resp.read()
                if len(content) > 256:
                    mp3_path.write_bytes(content)
                    conv = subprocess.run(
                        [ffmpeg, "-y", "-hide_banner", "-loglevel", "error",
                         "-i", str(mp3_path), "-ac", "1", "-ar", "24000",
                         "-c:a", "pcm_s16le", str(wav_path)],
                        capture_output=True, text=True,
                    )
                    if conv.returncode == 0 and wav_path.is_file():
                        mp3_path.unlink(missing_ok=True)
                        success = True
        except Exception as e:
            print(f"[ElevenLabs] Segment {i} synthesis error: {e}")

        # Fallback to Edge TTS if ElevenLabs single chunk failed
        if not success:
            try:
                asyncio.run(_edge_tts_save(narration, "my-MM-NilarNeural", "+0%", mp3_path))
                if mp3_path.is_file():
                    conv = subprocess.run(
                        [ffmpeg, "-y", "-hide_banner", "-loglevel", "error",
                         "-i", str(mp3_path), "-ac", "1", "-ar", "24000",
                         "-c:a", "pcm_s16le", str(wav_path)],
                        capture_output=True, text=True,
                    )
                    if conv.returncode == 0 and wav_path.is_file():
                        mp3_path.unlink(missing_ok=True)
                        success = True
            except Exception:
                pass

        if success:
            dur = probe_duration(wav_path)
            results.append({
                **chunk,
                "tts_audio": str(wav_path),
                "tts_duration": round(dur, 3),
            })

    update_job(job_id, progress=78, message=f"Voice synthesis complete — {len(results)} clips")
    return results


# ─────────────────────────── Step 5: Smart Sync + FFmpeg Render ───────────────────────────

def format_ass_time(seconds: float) -> str:
    """Format seconds to ASS timestamp (H:MM:SS.CC)."""
    h = int(seconds // 3600)
    m = int((seconds % 3600) // 60)
    s = int(seconds % 60)
    cs = int(round((seconds - int(seconds)) * 100))
    if cs >= 100:
        cs = 99
    return f"{h}:{m:02d}:{s:02d}.{cs:02d}"


def assign_midpoint_boundaries(units: list[dict], video_duration: float) -> list[dict]:
    """Exact midpoint boundary allocation from recap-en-to-mm:
    Assigns contiguous video_start and video_end across the entire video timeline without gaps.
    """
    if not units:
        return []
    out = [dict(x) for x in units]
    out[0]["video_start"] = 0.0
    for i in range(len(out) - 1):
        le = float(out[i]["end"])
        rs = float(out[i + 1]["start"])
        boundary = (le + rs) / 2.0 if rs >= le else max(le, rs)
        boundary = max(0.0, min(float(video_duration), boundary))
        out[i]["video_end"] = round(boundary, 3)
        out[i + 1]["video_start"] = round(boundary, 3)
    out[-1]["video_end"] = round(float(video_duration), 3)
    return out


def format_burmese_two_lines(raw_text: str, base_font_size: int, is_portrait: bool) -> tuple[str, int]:
    """Format Burmese subtitle text strictly into AT MOST 2 balanced lines.
    - Strips all existing breaks (\\r, \\n, \\N).
    - If short enough, keeps as 1 line.
    - If longer, splits once at natural midpoint boundary (punctuation, space, or consonant).
    - Dynamically scales font size to guarantee that libass NEVER wraps into a 3rd or 4th line!
    Returns: (formatted_ass_text, scaled_font_size)
    """
    clean_text = raw_text.replace("\r\n", " ").replace("\r", " ").replace("\n", " ").replace("\\N", " ").replace("\\n", " ")
    clean_text = re.sub(r'\s+', ' ', clean_text).strip()
    if not clean_text:
        return "", base_font_size

    # Target safe line length (characters) before requiring font scaling
    safe_max_chars = 18 if is_portrait else 24
    single_line_threshold = 14 if is_portrait else 20

    # If already short enough, keep as 1 single line
    if len(clean_text) <= single_line_threshold:
        return clean_text, base_font_size

    # Find the best split index near the midpoint for EXACTLY 2 lines
    half = len(clean_text) // 2
    split_idx = -1

    # 1. Look for Burmese punctuation (၊ or ။) near middle (30% to 70%)
    puncts = [i + 1 for i in range(int(len(clean_text) * 0.30), int(len(clean_text) * 0.70) + 1) if clean_text[i] in ("၊", "။")]
    if puncts:
        split_idx = min(puncts, key=lambda p: abs(p - half))
    else:
        # 2. Look for space near middle (30% to 70%)
        spaces = [i for i in range(int(len(clean_text) * 0.30), int(len(clean_text) * 0.70) + 1) if clean_text[i] == " "]
        if spaces:
            split_idx = min(spaces, key=lambda s: abs(s - half))
        else:
            # 3. Look for consonant / syllable start (avoid splitting medial/vowel marks)
            burmese_consonants = set("ကခဂဃငစဆဇဈဉညဋဌဍဎဏတထဒဓနပဖဗဘမယရလဝသဟဠအ")
            consonant_indices = [
                i for i in range(int(len(clean_text) * 0.35), int(len(clean_text) * 0.65) + 1)
                if clean_text[i] in burmese_consonants
            ]
            if consonant_indices:
                split_idx = min(consonant_indices, key=lambda c: abs(c - half))
            else:
                split_idx = half

    line1 = clean_text[:split_idx].strip()
    line2 = clean_text[split_idx:].strip()

    # Re-verify that neither line contains any stray break
    line1 = line1.replace("\\N", "").replace("\n", "").strip()
    line2 = line2.replace("\\N", "").replace("\n", "").strip()

    if not line2:
        return line1, base_font_size

    # Check max line length to calculate dynamic font scale
    max_line_len = max(len(line1), len(line2))
    scaled_font_size = base_font_size

    if max_line_len > safe_max_chars:
        # Scale font down proportionally so libass will NEVER auto-wrap into a 3rd line
        ratio = safe_max_chars / max_line_len
        scaled_font_size = max(24, int(base_font_size * ratio))

    if scaled_font_size < base_font_size:
        formatted = f"{{\\fs{scaled_font_size}}}{line1}\\N{line2}"
    else:
        formatted = f"{line1}\\N{line2}"

    return formatted, scaled_font_size


def generate_burmese_ass(
    tts_results: list[dict],
    output_ass: Path,
    canvas_w: int = 1920,
    canvas_h: int = 1080,
    blur_enabled: bool = False,
    blur_position: float = 78.0,
    subtitle_style: str = "font-akkhayar",
) -> Path:
    """Generate ASS subtitle file with Akkhayar21 font in clean Movie Recap style (strictly max 2 lines)."""
    font_name = "Akkhayar21"
    if subtitle_style in ("font-kunheing", "kunheing"):
        font_name = "A J Kunheing E-T-M 01"
    elif subtitle_style in ("font-jojar", "jojar"):
        font_name = "Myanmar Jojar"
    elif subtitle_style in ("font-myanmaros", "myanmaros"):
        font_name = "Myanmar OS"

    is_portrait = canvas_h > canvas_w
    font_size = int(canvas_h * 0.026) if is_portrait else int(canvas_h * 0.046)
    font_size = max(36, min(56, font_size))

    try:
        b_pos = float(blur_position)
    except (ValueError, TypeError):
        if str(blur_position) == "center":
            b_pos = 60.0
        elif str(blur_position) == "bottom":
            b_pos = 86.0
        else:
            b_pos = 78.0

    if blur_enabled:
        strip_center_from_bottom = ((100.0 - b_pos) / 100.0) * canvas_h
        margin_v = max(10, int(strip_center_from_bottom - (font_size * 0.72)))
    else:
        margin_v = int(canvas_h * 0.08 if is_portrait else canvas_h * 0.10)

    margin_lr = int(canvas_w * 0.11)  # safe 11% padding on both sides

    # WrapStyle: 2 = strictly NO auto-wrapping by libass (guarantees max 2 lines!)
    header = f"""[Script Info]
ScriptType: v4.00+
PlayResX: {canvas_w}
PlayResY: {canvas_h}
WrapStyle: 2
ScaledBorderAndShadow: yes

[V4+ Styles]
Format: Name, Fontname, Fontsize, PrimaryColour, SecondaryColour, OutlineColour, BackColour, Bold, Italic, Underline, StrikeOut, ScaleX, ScaleY, Spacing, Angle, BorderStyle, Outline, Shadow, Alignment, MarginL, MarginR, MarginV, Encoding
Style: Default,{font_name},{font_size},&H0015CCFA,&H000000FF,&H00000000,&HB0000000,-1,0,0,0,100,100,0,0,1,3.8,1.6,2,{margin_lr},{margin_lr},{margin_v},1

[Events]
Format: Layer, Start, End, Style, Name, MarginL, MarginR, MarginV, Effect, Text
"""
    events = []

    for r in tts_results:
        text = str(r.get("narration", "")).strip()
        if not text:
            continue
        start_time = float(r.get("sub_start", r.get("start", 0.0)))
        end_time = float(r.get("sub_end", start_time + float(r.get("tts_duration", 2.0))))

        s_str = format_ass_time(start_time)
        e_str = format_ass_time(end_time)

        # Format strictly to at most 2 lines with dynamic font scaling
        formatted_dialogue, _ = format_burmese_two_lines(text, font_size, is_portrait)
        if formatted_dialogue:
            events.append(f"Dialogue: 0,{s_str},{e_str},Default,,0,0,{margin_v},,{formatted_dialogue}")

    output_ass.write_text(header + "\n".join(events) + "\n", encoding="utf-8")
    return output_ass


def render_smart_sync_video(
    source_video: Path,
    tts_results: list[dict],
    job_dir: Path,
    job_id: str,
    ratio: str = "original",
    voice_volume: float = 1.0,
    enable_subtitles: bool = True,
    enable_blur: bool = False,
    blur_position: Any = 78.0,
    blur_thickness: float = 14.0,
    blur_intensity: float = 30.0,
    subtitle_style: str = "font-akkhayar",
    watermark_text: str = "",
    logo_path: Optional[Path] = None,
    logo_y: float = 8.0,
    logo_align: str = "right",
    logo_scale: float = 12.0,
    logo_opacity: float = 1.0,
    include_original_audio: bool = False,
) -> Path:
    """Render final video using the exact Git Recap-style Smart Sync:
    Every video segment is cut and retimed to match its corresponding Myanmar TTS audio 1:1.
    """
    update_job(job_id, step="rendering", progress=80, message="Smart Sync video rendering...")

    ffmpeg = find_ffmpeg()
    render_dir = job_dir / "render"
    render_dir.mkdir(parents=True, exist_ok=True)
    parts_dir = render_dir / "parts"
    parts_dir.mkdir(parents=True, exist_ok=True)

    src_w, src_h = probe_dimensions(source_video)
    is_portrait = src_h > src_w

    # Layout dimensions
    canvas_w, canvas_h = src_w, src_h
    ratio_filter = ""
    if ratio == "16:9":
        canvas_w, canvas_h = 1920, 1080
        ratio_filter = "scale=1920:1080:force_original_aspect_ratio=decrease,pad=1920:1080:(ow-iw)/2:(oh-ih)/2:black"
    elif ratio == "9:16":
        canvas_w, canvas_h = 1080, 1920
        ratio_filter = "scale=1080:1920:force_original_aspect_ratio=decrease,pad=1080:1920:(ow-iw)/2:(oh-ih)/2:black"
    elif ratio == "1:1":
        canvas_w, canvas_h = 1080, 1080
        ratio_filter = "scale=1080:1080:force_original_aspect_ratio=decrease,pad=1080:1080:(ow-iw)/2:(oh-ih)/2:black"
    elif ratio == "4:5":
        canvas_w, canvas_h = 1080, 1350
        ratio_filter = "scale=1080:1350:force_original_aspect_ratio=decrease,pad=1080:1350:(ow-iw)/2:(oh-ih)/2:black"

    # Step A: Render each video part retimed to its audio duration (Exact Git Sync)
    video_parts = []
    audio_parts = []
    subtitles_timing = []
    current_timeline = 0.0
    audio_cursor = 0.0
    frames_done = 0

    total_segs = len(tts_results)
    for idx, seg in enumerate(tts_results, 1):
        v_start = float(seg.get("video_start", seg.get("start", 0.0)))
        v_end = float(seg.get("video_end", seg.get("end", v_start + 3.0)))
        src_dur = max(0.1, v_end - v_start)

        audio_file = Path(seg.get("tts_audio", ""))
        if not audio_file.is_file():
            continue
        audio_dur = float(seg.get("tts_duration", 0.0))
        if audio_dur <= 0:
            audio_dur = probe_duration(audio_file)
            seg["tts_duration"] = audio_dur

        # Git EdgeSmartSync cumulative frame lock:
        # Each part gets round(audio_cursor * 30) - frames_done frames,
        # ensuring absolute frame-perfect sync with zero micro-drift over many segments.
        audio_cursor += audio_dur
        frame_count = max(1, int(round(audio_cursor * 30)) - frames_done)
        frames_done += frame_count

        # Calculate applied speed factor (like Git EdgeSmartSync)
        applied = audio_dur / src_dur
        part_video = parts_dir / f"part_{idx:04d}.mp4"

        # Retime video clip to match audio duration exactly with locked frame count
        clip_vf = f"setpts={applied:.6f}*(PTS-STARTPTS),fps=30"
        cmd_clip = [
            ffmpeg, "-y", "-hide_banner", "-loglevel", "error",
            "-accurate_seek",
            "-ss", f"{v_start:.4f}",
            "-t", f"{src_dur:.4f}",
            "-i", str(source_video),
            "-vf", clip_vf,
            "-frames:v", str(frame_count),
            "-c:v", "libx264", "-preset", "ultrafast", "-crf", "22",
            "-an",
            str(part_video),
        ]
        res = subprocess.run(cmd_clip, capture_output=True)
        if res.returncode == 0 and part_video.is_file():
            video_parts.append(part_video)
            audio_parts.append(audio_file)

            # Subtitle timing locked to this exact segment
            subtitles_timing.append({
                **seg,
                "sub_start": current_timeline,
                "sub_end": current_timeline + audio_dur,
            })
            current_timeline += audio_dur

        pct = 80 + int((idx / max(1, total_segs)) * 10)
        update_job(job_id, progress=pct, message=f"Syncing scene {idx}/{total_segs}...")

    if not video_parts:
        raise RuntimeError("No synchronized video parts could be rendered.")

    # Step B: Concat video parts and audio parts
    video_concat_txt = render_dir / "video_concat.txt"
    video_lines = [f"file '{str(p.resolve()).replace('\\', '/').replace('\'', '\'\\\'\'')}'" for p in video_parts]
    video_concat_txt.write_text("\n".join(video_lines) + "\n", encoding="utf-8")

    audio_concat_txt = render_dir / "audio_concat.txt"
    audio_lines = [f"file '{str(p.resolve()).replace('\\', '/').replace('\'', '\'\\\'\'')}'" for p in audio_parts]
    audio_concat_txt.write_text("\n".join(audio_lines) + "\n", encoding="utf-8")

    full_video = render_dir / "merged_video.mp4"
    subprocess.run(
        [ffmpeg, "-y", "-hide_banner", "-loglevel", "error",
         "-f", "concat", "-safe", "0", "-i", str(video_concat_txt),
         "-c", "copy", str(full_video)],
        capture_output=True, check=True
    )

    full_audio = render_dir / "merged_audio.wav"
    subprocess.run(
        [ffmpeg, "-y", "-hide_banner", "-loglevel", "error",
         "-f", "concat", "-safe", "0", "-i", str(audio_concat_txt),
         "-ar", "48000", "-ac", "2", "-c:a", "pcm_s16le", str(full_audio)],
        capture_output=True, check=True
    )

    update_job(job_id, progress=92, message="Applying blur, subtitles and final polish...")

    # Step C: Final Post-Processing (Ratio, Accurate Blur directly over original subtitles, Watermark, ASS)
    output_path = job_dir / "final_oneclick_recap.mp4"
    vol_filter = f"volume={voice_volume}" if voice_volume != 1.0 else "volume=1.0"

    try:
        b_pos = float(blur_position)
    except (ValueError, TypeError):
        if str(blur_position) == "center":
            b_pos = 60.0
        elif str(blur_position) == "bottom":
            b_pos = 86.0
        elif str(blur_position) == "auto":
            b_pos = 78.0 if is_portrait else 84.0
        else:
            b_pos = 78.0

    try:
        b_thick = float(blur_thickness)
    except (ValueError, TypeError):
        b_thick = 14.0

    try:
        b_intense = float(blur_intensity)
    except (ValueError, TypeError):
        b_intense = 30.0

    filter_chains = []
    current_v = "[0:v]"

    # 1. Ratio Scaling & Padding to canvas
    if ratio_filter:
        filter_chains.append(f"{current_v}{ratio_filter}[vbase]")
        current_v = "[vbase]"

    # 2. Natural frosted glass blur directly covering original subtitle area
    if enable_blur:
        thickness = max(0.06, min(0.35, b_thick / 100.0))
        top = max(0.0, min(1.0 - thickness, (b_pos - b_thick / 2.0) / 100.0))
        bottom = min(1.0, top + thickness)
        luma_rad = max(10, min(36, int(b_intense * 0.75)))
        chroma_rad = max(5, int(luma_rad * 0.5))

        blur_chain = (
            f"{current_v}split=2[vmain][vblur];"
            f"[vblur]crop=w=iw:h=trunc(ih*{thickness:.4f}/2)*2:x=0:y=trunc(ih*{top:.4f}/2)*2,"
            f"boxblur=luma_radius={luma_rad}:luma_power=3:chroma_radius={chroma_rad}:chroma_power=3[blurBand];"
            f"[vmain][blurBand]overlay=x=0:y=trunc(main_h*{top:.4f}/2)*2,"
            f"drawbox=x=0:y=trunc(ih*{top:.4f}/2)*2:w=iw:h=trunc(ih*{thickness:.4f}/2)*2:color=black@0.12:t=fill,"
            f"drawbox=x=0:y=trunc(ih*{top:.4f}/2)*2:w=iw:h=2:color=white@0.20:t=fill,"
            f"drawbox=x=0:y=trunc(ih*{bottom:.4f}/2)*2-2:w=iw:h=2:color=white@0.20:t=fill[vblurred]"
        )
        filter_chains.append(blur_chain)
        current_v = "[vblurred]"

    # 3. Subtitles burn-in directly over the blurred zone
    if enable_subtitles and subtitles_timing:
        ass_path = job_dir / "burmese_subtitles.ass"
        generate_burmese_ass(subtitles_timing, ass_path, canvas_w, canvas_h, blur_enabled=enable_blur, blur_position=b_pos, subtitle_style=subtitle_style)
        escaped_ass = str(ass_path.resolve()).replace("\\", "/").replace(":", "\\:")
        filter_chains.append(f"{current_v}ass='{escaped_ass}'[vsubbed]")
        current_v = "[vsubbed]"

    # 4. Logo Watermark or Text Watermark
    has_logo_file = bool(logo_path and Path(logo_path).is_file())
    cmd_inputs = [
        ffmpeg, "-y", "-hide_banner", "-loglevel", "warning",
        "-i", str(full_video),
        "-i", str(full_audio),
    ]

    if has_logo_file:
        cmd_inputs.extend(["-i", str(logo_path)])
        scale_pct = max(0.04, min(0.40, float(logo_scale) / 100.0))
        target_w = max(48, int(canvas_w * scale_pct))
        opacity = max(0.1, min(1.0, float(logo_opacity)))
        align = str(logo_align).lower()
        y_pct = max(0.0, min(1.0, float(logo_y) / 100.0))
        pad = int(canvas_w * 0.02)
        edge_x = int(canvas_w * 0.05)
        if align == "left":
            x_expr = f"{edge_x}"
        elif align == "center":
            x_expr = "(main_w-overlay_w)/2"
        else:
            x_expr = f"main_w-overlay_w-{edge_x}"
        y_expr = f"{pad}+((main_h-overlay_h-{pad*2})*{y_pct:.4f})"

        logo_chain = (
            f"[2:v]scale={target_w}:-2,format=rgba,colorchannelmixer=aa={opacity:.2f}[vlogo];"
            f"{current_v}[vlogo]overlay=x='{x_expr}':y='{y_expr}'[vout]"
        )
        filter_chains.append(logo_chain)
        current_v = "[vout]"
    elif watermark_text and watermark_text.strip():
        safe_wm = watermark_text.strip().replace("'", "").replace(":", "")
        wm_size = 32 if not is_portrait else 26
        filter_chains.append(f"{current_v}drawtext=font='Akkhayar21':text='{safe_wm}':fontcolor=white@0.85:fontsize={wm_size}:x=w-tw-30:y=30[vout]")
        current_v = "[vout]"
    else:
        if current_v != "[vout]":
            filter_chains.append(f"{current_v}null[vout]")
            current_v = "[vout]"

    filter_complex = ";\n".join(filter_chains) + f";\n[1:a]{vol_filter}[aout]"

    cmd_final = [
        *cmd_inputs,
        "-filter_complex", filter_complex,
        "-map", "[vout]", "-map", "[aout]",
        "-c:v", "libx264", "-preset", "veryfast", "-crf", "22", "-threads", "2",
        "-c:a", "aac", "-b:a", "192k",
        "-movflags", "+faststart",
        str(output_path),
    ]

    subprocess.run(cmd_final, capture_output=True, text=True, check=True)

    final_duration = probe_duration(output_path)
    file_size_mb = output_path.stat().st_size / (1024 * 1024)

    update_job(job_id, progress=100,
               message=f"Complete! {final_duration:.1f}s, {file_size_mb:.1f}MB",
               status="completed",
               output_file=str(output_path),
               output_duration=round(final_duration, 1),
               output_size_mb=round(file_size_mb, 1))

    return output_path


# ─────────────────────────── Full Pipeline ───────────────────────────

def download_media_from_url(url: str, job_dir: Path, job_id: str) -> Path:
    """Download video from YouTube, TikTok, Facebook or direct URL using yt-dlp."""
    update_job(job_id, step="download", progress=3,
               message="Downloading video from link (YouTube / TikTok)...")

    ffmpeg_bin = find_ffmpeg()
    ffmpeg_dir = str(Path(ffmpeg_bin).parent)

    ytdlp_bin = "/opt/lumini-oneclick/venv/bin/yt-dlp"
    if not os.path.isfile(ytdlp_bin):
        ytdlp_bin = shutil.which("yt-dlp") or "yt-dlp"

    out_template = job_dir / "source.%(ext)s"

    cmd = [
        ytdlp_bin,
        "--no-warnings",
        "--ffmpeg-location", ffmpeg_dir,
        "-f", "bestvideo[ext=mp4]+bestaudio[ext=m4a]/best[ext=mp4]/best",
        "--merge-output-format", "mp4",
        "--max-filesize", "500M",
        "-o", str(out_template),
        url.strip(),
    ]

    result = subprocess.run(
        cmd, capture_output=True, text=True, encoding="utf-8", errors="replace", timeout=300
    )

    if result.returncode != 0:
        err = (result.stderr or result.stdout or "Download failed").strip()
        raise RuntimeError(f"Video download failed: {err[-600:]}")

    # Check for downloaded file
    mp4_path = job_dir / "source.mp4"
    if mp4_path.is_file():
        return mp4_path

    candidates = list(job_dir.glob("source.*"))
    for c in candidates:
        if c.suffix.lower() in [".mp4", ".mkv", ".webm", ".mov"]:
            return c

    raise FileNotFoundError("Downloaded video file not found in job directory.")


def run_oneclick_pipeline(
    job_id: str,
    video_path: Optional[Path],
    video_url: Optional[str],
    voice: str,
    speed: str,
    ratio: str,
    enable_subtitles: bool = True,
    enable_blur: bool = False,
    blur_position: Any = 78.0,
    blur_thickness: float = 14.0,
    blur_intensity: float = 30.0,
    subtitle_style: str = "font-akkhayar",
    watermark_text: str = "",
    logo_path: Optional[Path] = None,
    logo_y: float = 8.0,
    logo_align: str = "right",
    logo_scale: float = 12.0,
    logo_opacity: float = 1.0,
    include_original_audio: bool = False,
    voice_sample_path: Optional[Path] = None,
    voice_id: Optional[str] = None,
):
    """Run the complete OneClick Recap pipeline."""
    job_dir = JOBS_DIR / job_id
    job_dir.mkdir(parents=True, exist_ok=True)

    try:
        update_job(job_id, status="processing", step="init", progress=3,
                   message="Pipeline starting...")

        # Step 0: Download from URL if URL was provided
        if not video_path or not video_path.is_file():
            if not video_url:
                raise ValueError("No video file or URL provided.")
            video_path = download_media_from_url(video_url, job_dir, job_id)
            size_mb = video_path.stat().st_size / (1024 * 1024)
            update_job(job_id, source_file=video_path.name, source_size_mb=round(size_mb, 1),
                       message=f"Video downloaded ({size_mb:.1f}MB). Starting processing...")

        # Step 1: Extract audio for Whisper
        update_job(job_id, step="audio_extract", progress=8,
                   message="Extracting audio from video...")

        ffmpeg = find_ffmpeg()
        audio_path = job_dir / "source_audio.wav"

        subprocess.run(
            [ffmpeg, "-y", "-hide_banner", "-loglevel", "error",
             "-i", str(video_path), "-vn", "-ac", "1", "-ar", "16000",
             "-c:a", "pcm_s16le", str(audio_path)],
            capture_output=True, check=True,
        )

        # Step 2: Whisper transcription
        segments = transcribe_with_whisper(audio_path, job_dir, job_id)

        # Step 3: Smart segmentation & Contiguous Timeline Division (Exact Git Algorithm)
        update_job(job_id, step="segmentation", progress=28,
                   message="Segmenting for narration & timeline synchronization...")
        raw_chunks = segment_for_narration(segments)
        video_dur = probe_duration(video_path)
        chunks = assign_midpoint_boundaries(raw_chunks, video_dur)

        # Step 4: Gemini translation (Spoken storytelling style)
        translated = translate_with_gemini(chunks, job_dir, job_id)

        # Step 5: Voice synthesis (Custom Cloned Voice or Natural Edge TTS)
        tts_results = []
        if voice_sample_path and voice_sample_path.is_file() and ELEVENLABS_API_KEY:
            update_job(job_id, step="voice_synthesis", progress=56, message="Cloning voice sample with ElevenLabs...")
            cloned_id = clone_voice_sample(voice_sample_path, ELEVENLABS_API_KEY)
            if cloned_id:
                tts_results = synthesize_elevenlabs_tts(translated, job_dir, job_id, cloned_id, ELEVENLABS_API_KEY)

        if not tts_results and voice_id and ELEVENLABS_API_KEY:
            tts_results = synthesize_elevenlabs_tts(translated, job_dir, job_id, voice_id, ELEVENLABS_API_KEY)

        if not tts_results:
            tts_results = synthesize_edge_tts(translated, job_dir, job_id,
                                              voice=voice, speed=speed or "+0%")

        # Step 6: Smart Sync render with Subtitles, Blur & Clean Audio
        output = render_smart_sync_video(
            video_path, tts_results, job_dir, job_id,
            ratio=ratio,
            enable_subtitles=enable_subtitles,
            enable_blur=enable_blur,
            blur_position=blur_position,
            blur_thickness=blur_thickness,
            blur_intensity=blur_intensity,
            subtitle_style=subtitle_style,
            watermark_text=watermark_text,
            logo_path=logo_path,
            logo_y=logo_y,
            logo_align=logo_align,
            logo_scale=logo_scale,
            logo_opacity=logo_opacity,
            include_original_audio=include_original_audio,
        )

        update_job(job_id, status="completed", progress=100)

    except Exception as e:
        traceback.print_exc()
        update_job(job_id, status="failed", progress=-1,
                   message=f"Error: {str(e)[:500]}",
                   error=str(e))


# ─────────────────────────── API Endpoints ───────────────────────────

@app.get("/api/oneclick/health")
async def health():
    """Health check for OneClick service."""
    # Check dependencies
    deps = {}
    try:
        find_ffmpeg()
        deps["ffmpeg"] = True
    except Exception:
        deps["ffmpeg"] = False

    try:
        import whisper
        deps["whisper"] = True
    except ImportError:
        deps["whisper"] = False

    try:
        from google import genai
        deps["gemini"] = bool(os.environ.get("GEMINI_API_KEY") or os.environ.get("VITE_GEMINI_API_KEY"))
    except ImportError:
        deps["gemini"] = False

    try:
        import edge_tts
        deps["edge_tts"] = True
    except ImportError:
        deps["edge_tts"] = False

    all_ok = all(deps.values())

    return {
        "online": True,
        "service": "OneClick Recap EN→MM",
        "version": "1.0.0",
        "ready": all_ok,
        "dependencies": deps,
    }


@app.post("/api/oneclick/start")
async def start_job(
    background_tasks: BackgroundTasks,
    file: Optional[UploadFile] = File(default=None),
    video_url: Optional[str] = Form(default=None),
    voice: str = Form("my-MM-NilarNeural"),
    speed: str = Form("+0%"),
    ratio: str = Form("original"),
    enable_subtitles: bool = Form(True),
    enable_blur: bool = Form(True),
    blur_position: Any = Form(78.0),
    blur_thickness: float = Form(14.0),
    blur_intensity: float = Form(30.0),
    subtitle_style: str = Form("font-akkhayar"),
    watermark_text: str = Form(""),
    logo_file: Optional[UploadFile] = File(default=None),
    logo_y: float = Form(8.0),
    logo_align: str = Form("right"),
    logo_scale: float = Form(12.0),
    logo_opacity: float = Form(1.0),
    include_original_audio: bool = Form(False),
    voice_sample: Optional[UploadFile] = File(default=None),
    voice_id: Optional[str] = Form(default=None),
):
    """Upload video or provide YouTube/TikTok URL and start OneClick pipeline."""
    job_id = str(uuid.uuid4())[:12]
    job_dir = JOBS_DIR / job_id
    job_dir.mkdir(parents=True, exist_ok=True)

    video_path = None
    source_name = "URL Download"
    source_size = 0.0

    if file and file.filename:
        ext = Path(file.filename or "video.mp4").suffix or ".mp4"
        video_path = job_dir / f"source{ext}"

        content = await file.read()
        if len(content) < 1024:
            raise HTTPException(status_code=400, detail="Video file too small or empty.")

        file_size_mb = len(content) / (1024 * 1024)
        if file_size_mb > 500:
            raise HTTPException(status_code=400, detail="Video file exceeds 500MB limit.")

        with open(video_path, "wb") as f:
            f.write(content)

        source_name = file.filename
        source_size = round(file_size_mb, 1)
    elif video_url and video_url.strip():
        source_name = video_url.strip()[:60]
    else:
        raise HTTPException(
            status_code=400,
            detail="ဗီဒီယိုဖိုင် သို့မဟုတ် YouTube / TikTok Link တစ်ခုခု ထည့်သွင်းပေးပါ",
        )

    voice_sample_path = None
    if voice_sample and voice_sample.filename:
        s_ext = Path(voice_sample.filename).suffix or ".mp3"
        voice_sample_path = job_dir / f"voice_sample{s_ext}"
        s_content = await voice_sample.read()
        if len(s_content) > 512:
            with open(voice_sample_path, "wb") as sf:
                sf.write(s_content)

    logo_path = None
    if logo_file and logo_file.filename:
        l_ext = Path(logo_file.filename).suffix or ".png"
        logo_path = job_dir / f"logo{l_ext}"
        l_content = await logo_file.read()
        if len(l_content) > 100:
            with open(logo_path, "wb") as lf:
                lf.write(l_content)

    # Initialize job status
    _job_store[job_id] = {
        "job_id": job_id,
        "status": "queued",
        "step": "upload",
        "progress": 0,
        "message": f"Queued ({source_name})...",
        "voice": voice,
        "speed": speed,
        "ratio": ratio,
        "enable_subtitles": enable_subtitles,
        "enable_blur": enable_blur,
        "blur_position": blur_position,
        "blur_thickness": blur_thickness,
        "blur_intensity": blur_intensity,
        "subtitle_style": subtitle_style,
        "watermark_text": watermark_text,
        "has_logo": bool(logo_path),
        "include_original_audio": include_original_audio,
        "has_voice_sample": bool(voice_sample_path),
        "source_file": source_name,
        "source_size_mb": source_size,
        "created_at": time.time(),
    }

    # Start pipeline in background
    background_tasks.add_task(
        run_oneclick_pipeline,
        job_id,
        video_path,
        video_url,
        voice,
        speed,
        ratio,
        enable_subtitles,
        enable_blur,
        blur_position,
        blur_thickness,
        blur_intensity,
        subtitle_style,
        watermark_text,
        logo_path,
        logo_y,
        logo_align,
        logo_scale,
        logo_opacity,
        include_original_audio,
        voice_sample_path,
        voice_id,
    )

    return {
        "job_id": job_id,
        "status": "queued",
        "message": "Pipeline started. Poll /api/oneclick/status/{job_id} for progress.",
    }


@app.get("/api/oneclick/status/{job_id}")
async def get_status(job_id: str):
    """Get job status and progress."""
    job = _job_store.get(job_id)
    if not job:
        raise HTTPException(status_code=404, detail=f"Job {job_id} not found.")
    return job


@app.get("/api/oneclick/download/{job_id}")
async def download_result(job_id: str):
    """Download the completed video."""
    job = _job_store.get(job_id)
    if not job:
        raise HTTPException(status_code=404, detail=f"Job {job_id} not found.")

    if job.get("status") != "completed":
        raise HTTPException(status_code=400, detail="Job is not completed yet.")

    output_file = job.get("output_file")
    if not output_file or not Path(output_file).is_file():
        raise HTTPException(status_code=404, detail="Output file not found.")

    source_name = job.get("source_file", "video.mp4")
    stem = Path(source_name).stem
    download_name = f"{stem}_myanmar_recap.mp4"

    return FileResponse(
        output_file,
        media_type="video/mp4",
        filename=download_name,
    )


@app.get("/api/oneclick/transcript/{job_id}")
async def get_transcript(job_id: str):
    """Get the English transcript and Myanmar translations."""
    job_dir = JOBS_DIR / job_id
    if not job_dir.is_dir():
        raise HTTPException(status_code=404, detail=f"Job {job_id} not found.")

    result = {}

    transcript_path = job_dir / "whisper_transcript.json"
    if transcript_path.is_file():
        result["english_segments"] = json.loads(transcript_path.read_text(encoding="utf-8"))

    translations_path = job_dir / "timestamp_translations.json"
    if translations_path.is_file():
        result["myanmar_segments"] = json.loads(translations_path.read_text(encoding="utf-8"))

    return result


@app.delete("/api/oneclick/job/{job_id}")
async def delete_job(job_id: str):
    """Clean up a completed/failed job."""
    job_dir = JOBS_DIR / job_id
    if job_dir.is_dir():
        shutil.rmtree(job_dir, ignore_errors=True)
    _job_store.pop(job_id, None)
    return {"message": f"Job {job_id} cleaned up."}


@app.get("/api/oneclick/voices")
async def list_voices():
    """List available Myanmar Edge TTS voices."""
    return {
        "voices": [
            {"id": "my-MM-ThihaNeural", "name": "Thiha", "gender": "Male",
             "description": "ယောက်ျားသံ — Movie recap narration ပုံစံ"},
            {"id": "my-MM-NilarNeural", "name": "Nilar", "gender": "Female",
             "description": "မိန်းမသံ — ညင်သာတဲ့ narration ပုံစံ"},
        ],
        "speeds": [
            {"value": "-50%", "label": "Slow (0.5x)"},
            {"value": "-25%", "label": "Slightly Slow (0.75x)"},
            {"value": "+0%", "label": "Normal (1x)"},
            {"value": "+25%", "label": "Slightly Fast (1.25x)"},
            {"value": "+50%", "label": "Fast (1.5x)"},
            {"value": "+100%", "label": "Very Fast (2x)"},
        ],
        "ratios": [
            {"value": "original", "label": "Original"},
            {"value": "16:9", "label": "Landscape (16:9)"},
            {"value": "9:16", "label": "Portrait (9:16)"},
            {"value": "1:1", "label": "Square (1:1)"},
        ],
    }


# ─────────────────────────── Main ───────────────────────────

if __name__ == "__main__":
    port = int(os.environ.get("ONECLICK_PORT", 8090))
    print(f"🎬 Starting Lumini OneClick Recap EN→MM Service on port {port}...")
    uvicorn.run(app, host="0.0.0.0", port=port)
