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

def split_long_segment(seg: dict, max_dur: float = 4.5) -> list[dict]:
    """Split long Whisper segment into short, sentence-level narration units."""
    text = seg.get("text", "").strip()
    total_dur = max(0.2, float(seg["end"]) - float(seg["start"]))
    if not text:
        return []

    # If already short, keep it
    if total_dur <= max_dur and len(text.split()) <= 10:
        return [seg]

    # Split on sentence boundaries and strong pauses (. ! ? ; ,)
    parts = re.split(r'(?<=[.!?])\s+|(?<=[,;])\s+', text)
    parts = [p.strip() for p in parts if p.strip()]
    if not parts or len(parts) == 1:
        words = text.split()
        if len(words) <= 10 and total_dur <= max_dur:
            return [seg]
        # Chunk by 7-9 words
        parts = []
        chunk = []
        for w in words:
            chunk.append(w)
            if len(chunk) >= 8:
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


def segment_for_narration(segments: list[dict], max_chunk_sec: float = 4.2, hard_max: float = 5.2) -> list[dict]:
    """Split Whisper segments into narration-friendly short chunks (prevents huge stacked subtitles)."""
    # Step 1: Break down any long segments first
    broken = []
    for s in segments:
        dur = float(s["end"]) - float(s["start"])
        if dur > hard_max or len(s.get("text", "").split()) > 10:
            broken.extend(split_long_segment(s, max_dur=max_chunk_sec))
        else:
            broken.append(s)

    # Step 2: Merge only very tiny fragments (< 1.8s) if adjacent in time
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

        # If previous was very short (< 2.0s) and gap is small (< 0.8s) and combined fits:
        if (current_end - current_start) < 2.0 and gap < 0.8 and combined_dur <= max_chunk_sec:
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
4. ဝါကျကို တိုတိုရှင်းရှင်းနှင့် လိုရင်းသာ ရေးပါ (အသံသွင်းချိန် တိုတောင်းပြီး ဗီဒီယိုပြကွက်နှင့် ကွက်တိကျစေရန်)။
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
    speed: str = "+0%",
) -> list[dict]:
    """Generate Myanmar voice audio for each translated segment using Edge TTS."""
    update_job(job_id, step="voice_synthesis", progress=58, message="Edge TTS voice synthesis starting...")

    tts_dir = job_dir / "tts_audio"
    tts_dir.mkdir(parents=True, exist_ok=True)

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
                asyncio.run(_edge_tts_save(clean, voice, speed, mp3_path))

                if mp3_path.is_file() and mp3_path.stat().st_size > 256:
                    # Convert MP3 → WAV
                    conv = subprocess.run(
                        [ffmpeg, "-y", "-hide_banner", "-loglevel", "error",
                         "-i", str(mp3_path), "-ac", "1", "-ar", "24000",
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


def generate_burmese_ass(
    tts_results: list[dict],
    output_ass: Path,
    canvas_w: int = 1920,
    canvas_h: int = 1080,
    blur_enabled: bool = False,
    blur_position: str = "lower",
) -> Path:
    """Generate ASS subtitle file with Akkhayar21 font in clean Movie Recap style."""
    font_name = "Akkhayar21"
    is_portrait = canvas_h > canvas_w

    if is_portrait:
        font_size = int(canvas_w * 0.046)
        font_size = max(30, min(48, font_size))
        # When blur is enabled over English subs, position Burmese subtitle directly in blur zone
        if blur_enabled:
            if blur_position == "center":
                margin_v = int(canvas_h * 0.40)
            elif blur_position == "bottom":
                margin_v = int(canvas_h * 0.10)
            else:  # lower (TikTok standard: covers 68% to 88% from top)
                margin_v = int(canvas_h * 0.22)
        else:
            margin_v = int(canvas_h * 0.14)
    else:
        font_size = int(canvas_h * 0.048)
        font_size = max(34, min(52, font_size))
        if blur_enabled:
            if blur_position == "center":
                margin_v = int(canvas_h * 0.40)
            elif blur_position == "bottom":
                margin_v = int(canvas_h * 0.10)
            else:  # lower
                margin_v = int(canvas_h * 0.16)
        else:
            margin_v = int(canvas_h * 0.08)

    header = f"""[Script Info]
ScriptType: v4.00+
PlayResX: {canvas_w}
PlayResY: {canvas_h}
ScaledBorderAndShadow: yes

[V4+ Styles]
Format: Name, Fontname, Fontsize, PrimaryColour, SecondaryColour, OutlineColour, BackColour, Bold, Italic, Underline, StrikeOut, ScaleX, ScaleY, Spacing, Angle, BorderStyle, Outline, Shadow, Alignment, MarginL, MarginR, MarginV, Encoding
Style: Default,{font_name},{font_size},&H0015CCFA,&H000000FF,&H00000000,&HB0000000,-1,0,0,0,100,100,0,0,1,3.8,1.6,2,24,24,{margin_v},1

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

        clean_text = text.replace("\r\n", " ").replace("\n", " ").strip()
        if len(clean_text) > 36:
            half = len(clean_text) // 2
            split_idx = -1
            for offset in range(12):
                for cand in [half - offset, half + offset]:
                    if 0 < cand < len(clean_text) and clean_text[cand] in [" ", "၊", "။"]:
                        split_idx = cand + 1
                        break
                if split_idx != -1:
                    break
            if split_idx != -1:
                clean_text = clean_text[:split_idx].strip() + "\\N" + clean_text[split_idx:].strip()

        events.append(f"Dialogue: 0,{s_str},{e_str},Default,,0,0,0,,{clean_text}")

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
    blur_position: str = "lower",
    watermark_text: str = "",
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

    v_filters = []
    if ratio_filter:
        v_filters.append(ratio_filter)

    # 1. Blur directly covering original subtitle area
    # - "lower": TikTok / Shorts standard captions at Y: 68% to 88%
    # - "center": Middle captions at Y: 48% to 70%
    # - "bottom": Extreme bottom captions at Y: 78% to 96%
    if enable_blur:
        if is_portrait or ratio == "9:16":
            if blur_position == "center":
                v_filters.append("split[vbase][vsub];[vsub]crop=iw:ih*0.22:0:ih*0.48,boxblur=28:5[vblurred];[vbase][vblurred]overlay=0:main_h*0.48")
            elif blur_position == "bottom":
                v_filters.append("split[vbase][vsub];[vsub]crop=iw:ih*0.18:0:ih*0.80,boxblur=28:5[vblurred];[vbase][vblurred]overlay=0:main_h*0.80")
            else:  # "lower" (TikTok Auto-captions standard)
                v_filters.append("split[vbase][vsub];[vsub]crop=iw:ih*0.20:0:ih*0.68,boxblur=28:5[vblurred];[vbase][vblurred]overlay=0:main_h*0.68")
        else:
            if blur_position == "center":
                v_filters.append("split[vbase][vsub];[vsub]crop=iw:ih*0.20:0:ih*0.48,boxblur=28:5[vblurred];[vbase][vblurred]overlay=0:main_h*0.48")
            elif blur_position == "bottom":
                v_filters.append("split[vbase][vsub];[vsub]crop=iw:ih*0.18:0:ih*0.78,boxblur=28:5[vblurred];[vbase][vblurred]overlay=0:main_h*0.78")
            else:  # "lower"
                v_filters.append("split[vbase][vsub];[vsub]crop=iw:ih*0.18:0:ih*0.72,boxblur=28:5[vblurred];[vbase][vblurred]overlay=0:main_h*0.72")

    # 2. Watermark
    if watermark_text and watermark_text.strip():
        safe_wm = watermark_text.strip().replace("'", "").replace(":", "")
        wm_size = 32 if not is_portrait else 26
        v_filters.append(f"drawtext=font='Akkhayar21':text='{safe_wm}':fontcolor=white@0.85:fontsize={wm_size}:x=w-tw-30:y=30")

    # 3. Subtitles burn-in directly over the blurred zone
    if enable_subtitles and subtitles_timing:
        ass_path = job_dir / "burmese_subtitles.ass"
        generate_burmese_ass(subtitles_timing, ass_path, canvas_w, canvas_h, blur_enabled=enable_blur, blur_position=blur_position)
        escaped_ass = str(ass_path.resolve()).replace("\\", "/").replace(":", "\\:")
        v_filters.append(f"ass='{escaped_ass}'")

    vf = ",".join(v_filters) if v_filters else "null"

    cmd_final = [
        ffmpeg, "-y", "-hide_banner", "-loglevel", "warning",
        "-i", str(full_video),
        "-i", str(full_audio),
        "-filter_complex", f"[0:v]{vf}[v];[1:a]{vol_filter}[a]",
        "-map", "[v]", "-map", "[a]",
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
    blur_position: str = "lower",
    watermark_text: str = "",
    include_original_audio: bool = False,
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

        # Step 5: Edge TTS synthesis
        tts_results = synthesize_edge_tts(translated, job_dir, job_id,
                                          voice=voice, speed=speed or "+0%")

        # Step 6: Smart Sync render with Subtitles, Blur & Clean Audio
        output = render_smart_sync_video(
            video_path, tts_results, job_dir, job_id,
            ratio=ratio,
            enable_subtitles=enable_subtitles,
            enable_blur=enable_blur,
            blur_position=blur_position,
            watermark_text=watermark_text,
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
    voice: str = Form("my-MM-ThihaNeural"),
    speed: str = Form("+0%"),
    ratio: str = Form("original"),
    enable_subtitles: bool = Form(True),
    enable_blur: bool = Form(False),
    blur_position: str = Form("lower"),
    watermark_text: str = Form(""),
    include_original_audio: bool = Form(False),
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
        "watermark_text": watermark_text,
        "include_original_audio": include_original_audio,
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
        watermark_text,
        include_original_audio,
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
