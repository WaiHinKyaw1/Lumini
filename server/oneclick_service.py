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
"ပေါ့"၊ "ဗျာ"၊ "ဗျ"၊ "ပေါ့ဗျာ" စသည့် စကားလုံးများကို ဝါကျတိုင်းတွင် ထပ်ခါတလဲလဲ အလွန်အကျွံ မသုံးရ။ (အထူးသတိပြုပါ - နားထောင်ရ ရိုးအီစေသောကြောင့် မလိုအပ်ဘဲ လုံးဝမထည့်ပါနှင့်)။
စာအုပ်ကြီး စာစကားများဖြစ်သော "သည်"၊ "၏"၊ "၌"၊ "၍"၊ "သောကြောင့်"၊ "ဖြစ်သည်"၊ "လျက်ရှိသည်"၊ "ရာတွင်"၊ "ခဲ့သည်" များကို လုံးဝ (လုံးဝ) မသုံးရ။
စက်ရုပ်ဆန်ဆန် စကားတိုများ ဖြတ်ပြောသလို မဖြစ်စေရ။ သဘာဝကျပြီး စီးဆင်းမှုရှိသော (smooth flow) လူစစ်စစ် ပြောနေသည့်ဟန်ဖြင့် ရေးပါ။ ဝါကျများ ဆက်စပ်မှုရှိစေရန် "အဲဒီနောက်"၊ "ဒါပေမဲ့"၊ "ရုတ်တရက်" စသည့် စကားဆက်များနှင့် "တော့"၊ "ပါတော့တယ်"၊ "လိုက်ပါတယ်" စသည့် အဆုံးသတ်များကို သဘာဝကျကျ ထည့်သုံးပါ။
ဥပမာကောင်း: "အဲဒီအချိန်မှာ ဂျွန်တစ်ယောက် အခန်းထဲ ဝင်လာခဲ့ပါတယ်။ သူ့သူငယ်ချင်းကို မြင်လိုက်ရတဲ့အခါမှာတော့ သူ အရမ်းကို အံ့ဩသွားခဲ့ပါတယ်။"
ဥပမာကောင်း: "ရဲအရာရှိလည်း အခြေအနေကို ရိပ်မိသွားပြီး သေနတ်ကို ချက်ချင်း ဆွဲထုတ်လိုက်ပါတော့တယ်။"
အလွန်အရေးကြီးသည်- စကားပြော သဘာဝကျရမည်ဆိုသော်လည်း ဝါကျကို မလိုအပ်ဘဲ မဆွဲဆန့်ရ။ စာတန်းထိုး ၂ ကြောင်းထက် လုံးဝ ပိုမရှည်စေရန် အပိုင်းတစ်ပိုင်းစီအတွက် စာလုံးရေ ၂၀ မှ ၃၀ အထိသာ အတိအကျ ကွက်တိရေးရမည် (၃ ကြောင်း ၄ ကြောင်း လုံးဝ မဖြစ်စေရ)။
ဇာတ်ကောင်အမည်များကို မြန်မာလို အသံထွက်မှန်အတိုင်း သုံးပါ။
Output format: Return ONLY a valid JSON array of objects: [{"id": 1, "mm": "တိုရှင်း လိုရင်း မြန်မာစကားပြော စာသား"}, ...]"""

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
    def has_burmese_chars(text: str) -> bool:
        return bool(re.search(r'[\u1000-\u109F]', text or ''))

    final_translated = []
    for i, chunk in enumerate(chunks):
        matched = next((tc for tc in translated_chunks if tc["start"] == chunk["start"]), None)
        if matched and has_burmese_chars(matched.get("narration", "")):
            final_translated.append(matched)
            continue

        # Missing or non-Burmese translation — retry single chunk translation with Gemini
        clean_en = str(chunk.get("text", "")).strip()
        translated_mm = ""
        if clean_en:
            try:
                single_prompt = (
                    "Translate this English sentence into natural spoken Myanmar movie recap narration (ဇာတ်ကြောင်းပြန် မြန်မာစကားပြော):\n"
                    f"\"{clean_en}\"\n"
                    "Rules: Return ONLY the natural spoken Myanmar narration. Strictly NO English words. NO quotes."
                )
                r = client.models.generate_content(
                    model="gemini-2.5-flash",
                    contents=single_prompt,
                    config={"temperature": 0.3}
                )
                res_txt = r.text.strip().replace('"', '').replace("'", "")
                if has_burmese_chars(res_txt):
                    translated_mm = res_txt
            except Exception as e:
                print(f"[GeminiAudit] Single chunk translation note: {e}")

        # Strictly NEVER fallback to raw English text! If translation fails, leave empty to prevent English voice cut-in
        if translated_mm:
            final_translated.append({
                **chunk,
                "narration": translated_mm,
            })
        else:
            print(f"[GeminiAudit] Warning: Segment {i+1} has no Burmese translation; skipping to prevent English audio leak.")

    # Sort by start time and only keep segments with valid Burmese narration
    translated_chunks = [tc for tc in final_translated if has_burmese_chars(tc.get("narration", ""))]
    translated_chunks.sort(key=lambda x: x["start"])

    # Save translations
    translations_path = job_dir / "timestamp_translations.json"
    translations_path.write_text(
        json.dumps(translated_chunks, ensure_ascii=False, indent=2),
        encoding="utf-8",
    )

    update_job(job_id, progress=55,
               message=f"Translation complete — {len(translated_chunks)} pure Burmese segments")
    return translated_chunks


def generate_story_hook_title(full_story_text: str, client) -> str:
    """Generate a captivating 1-line recap thumbnail hook question or statement in Burmese.
    Strictly ONE line, concise, click-worthy, matching user's reference photo.
    """
    system_prompt = (
        "သင်သည် မြန်မာ Movie Recap Channel (ဥပမာ- Channel 99, Movie Guide) များအတွက် ဗီဒီယိုအစ Cover/Thumbnail ပေါ်တွင် "
        "ပရိသတ်ကို ဆွဲဆောင်မည့် Hook ခေါင်းစဉ် (Captivating Video Hook Title) ရေးပေးရမည်။\n"
        "စည်းမျဉ်းများ (တိကျစွာလိုက်နာပါ):\n"
        "1. စာတန်းသည် တစ်ကြောင်းတည်း (STRICTLY ONE SINGLE LINE) သာ ဖြစ်ရမည်။ လုံးဝ (၂) ကြောင်းမခွဲရ။\n"
        "2. မြန်မာစာလုံးရေ (၁၅) လုံးမှ (၂၈) လုံးကြားသာ တိုတိုရှင်းရှင်း ထိထိမိမိ ရေးရမည်။\n"
        "3. ပရိသတ် ချက်ချင်း ဝင်ကြည့်ချင်လာစေမည့် မေးခွန်း သို့မဟုတ် ထူးဆန်းသော စာသားဖြစ်ရမည် (ဥပမာ- 'ဒီနေ့ကျောင်းကဘာကြောင့်ထူးဆန်းနေရတာလဲ?', 'သူ့အဖေကဘာကြောင့်ဓားနဲ့လိုက်သတ်နေတာလဲ?')။\n"
        "4. Output တွင် မြန်မာစာတန်း ၁ ကြောင်းတည်းသာ ပြန်ပေးပါ (quotes သို့မဟုတ် explanation မပါရ)။"
    )
    prompt = f"ဒီဇာတ်လမ်းအကျဉ်းကို ဖတ်ပြီး ဗီဒီယိုအစ Thumbnail အတွက် ဆွဲဆောင်မှုအရှိဆုံး ၁ ကြောင်းတည်းသော မြန်မာ Hook ခေါင်းစဉ်တစ်ခု ရေးပေးပါ:\n\n{full_story_text[:1200]}"
    candidate_models = [
        os.environ.get("GEMINI_MODEL", "gemini-2.5-flash"),
        "gemini-2.5-flash",
        "gemini-1.5-flash",
    ]
    for model in candidate_models:
        try:
            resp = client.models.generate_content(
                model=model,
                contents=prompt,
                config={"system_instruction": system_prompt, "temperature": 0.4}
            )
            title = resp.text.strip().replace("\r", " ").replace("\n", " ").strip()
            title = re.sub(r'[\"\'\`]', '', title).strip()
            title = re.sub(r'\s+', ' ', title)
            if title and len(title) >= 3:
                return title[:35]
        except Exception as e:
            print(f"[HookTitle] {model} note: {e}")
    return "ဒီနေ့ဘာတွေထူးဆန်းတာဖြစ်သွားတာလဲ?"



# ─────────────────────────── Step 4: Edge TTS Myanmar Voice ───────────────────────────

def normalize_edge_rate(speed_input: Any) -> str:
    """Convert speed input into an optimal Edge TTS rate string (+XX%).
    Ensures natural, adult movie narrator pacing (crisp, mature, energetic)
    without sounding like an accelerated child or chipmunk.
    """
    if not speed_input:
        return "+18%"
    s = str(speed_input).strip().lower().replace('x', '')

    # If formatted like +XX% or XX% or -XX%
    m = re.match(r'^[+-]?(\d+)%?$', s)
    if m:
        val = int(m.group(1))
        if s.startswith("-"):
            return f"-{min(30, val)}%"
        # Map percentages safely to natural narrator pacing:
        # +35% -> +22%, +25% -> +18%, +15% -> +12%, 0% -> +0%
        if val >= 30:
            return "+22%"
        elif val >= 20:
            return "+18%"
        elif val >= 10:
            return "+12%"
        elif val > 0:
            return "+6%"
        else:
            return "+0%"

    # If formatted as float multiplier (e.g. 1.25, 1.35)
    try:
        fval = float(s)
        if fval >= 1.30:
            return "+22%"
        elif fval >= 1.20:
            return "+18%"
        elif fval >= 1.10:
            return "+12%"
        elif fval <= 0.85:
            return "-10%"
        elif fval <= 1.0:
            return "+0%"
        else:
            return "+6%"
    except (ValueError, TypeError):
        return "+18%"



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
        if not clean or not re.search(r'[\u1000-\u109F]', clean):
            print(f"[EdgeTTS] Skipping non-Burmese text chunk #{i+1}: '{clean}'")
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

# ─────────────────────────── Step 4b: Voice Cloning Engine (Acoustic + ElevenLabs) ───────────────────────────

ELEVENLABS_API_KEY = os.environ.get("ELEVENLABS_API_KEY", "sk_219a1341d802e55ab02509adffa20bbdc8c1489070b1dfa4").strip()


def analyze_voice_sample(sample_path: Path) -> dict:
    """Analyze pitch and vocal characteristics from voice sample to enable genuine voice cloning.
    Uses autocorrelation on raw PCM samples (zero external dependencies).
    """
    ffmpeg = find_ffmpeg()
    clean_wav = sample_path.parent / "sample_analysis.wav"
    try:
        subprocess.run(
            [ffmpeg, "-y", "-hide_banner", "-loglevel", "error",
             "-i", str(sample_path), "-vn", "-ac", "1", "-ar", "16000",
             "-c:a", "pcm_s16le", str(clean_wav)],
            capture_output=True, check=True
        )
    except Exception:
        clean_wav = sample_path

    est_pitch = 145.0
    try:
        if clean_wav.is_file():
            raw_bytes = clean_wav.read_bytes()[44:]
            if len(raw_bytes) >= 32000:
                import struct
                num_samples = min(48000, len(raw_bytes) // 2)
                samples = struct.unpack(f"<{num_samples}h", raw_bytes[:num_samples * 2])
                min_lag = int(16000 / 300)
                max_lag = int(16000 / 70)
                chunk_size = 1024
                detected = []
                for start in range(0, min(len(samples) - chunk_size - max_lag, 32000), 2048):
                    window = samples[start:start + chunk_size]
                    energy = sum(x * x for x in window)
                    if energy < 1000000:
                        continue
                    best_corr = 0
                    best_lag = 0
                    for lag in range(min_lag, max_lag):
                        corr = sum(window[j] * samples[start + j + lag] for j in range(chunk_size))
                        if corr > best_corr:
                            best_corr = corr
                            best_lag = lag
                    if best_lag > 0 and best_corr > 0.4 * energy:
                        p = 16000.0 / best_lag
                        if 70.0 <= p <= 320.0:
                            detected.append(p)
                if detected:
                    detected.sort()
                    est_pitch = detected[len(detected) // 2]
    except Exception as e:
        print(f"[VoiceClone] Sample analysis note: {e}")

    is_male = est_pitch < 170.0
    base_voice = "my-MM-ThihaNeural" if is_male else "my-MM-NilarNeural"
    base_pitch = 125.0 if is_male else 210.0
    # Dynamic pitch ratio matching the sample's pitch naturally (up to +/- 20%)
    pitch_ratio = max(0.82, min(1.25, est_pitch / base_pitch))

    print(f"[VoiceClone] Analyzed sample: Pitch={est_pitch:.1f}Hz, Gender={'Male' if is_male else 'Female'}, Base={base_voice}, ShiftRatio={pitch_ratio:.4f}")
    return {
        "pitch": round(est_pitch, 1),
        "is_male": is_male,
        "base_voice": base_voice,
        "pitch_ratio": round(pitch_ratio, 4)
    }


def synthesize_acoustic_cloned_voice(
    translated_chunks: list[dict],
    job_dir: Path,
    job_id: str,
    voice_sample_path: Path,
    speed: str = "+0%",
) -> list[dict]:
    """Smart Acoustic Voice Clone:
    Analyzes the user's reference voice sample, selects matching baseline model,
    synthesizes Burmese narration, and applies acoustic tone & warmth morphing to match the user's voice.
    """
    analysis = analyze_voice_sample(voice_sample_path)
    base_voice = analysis["base_voice"]
    pitch_ratio = analysis["pitch_ratio"]
    pitch_hz = analysis["pitch"]
    gender_str = "Male" if analysis["is_male"] else "Female"

    update_job(
        job_id,
        step="voice_synthesis",
        progress=58,
        message=f"Acoustic Voice Cloning ({gender_str}, ~{pitch_hz}Hz) matching your audio sample..."
    )

    tts_dir = job_dir / "tts_audio"
    tts_dir.mkdir(parents=True, exist_ok=True)
    ffmpeg = find_ffmpeg()
    calibrated_rate = normalize_edge_rate(speed)

    results = []
    total = len(translated_chunks)

    # Build audio morph filter matching the sample's acoustic profile
    af_filters = []
    if abs(pitch_ratio - 1.0) > 0.02:
        af_filters.extend([
            f"asetrate=24000*{pitch_ratio:.4f}",
            f"atempo={1.0 / pitch_ratio:.4f}",
        ])

    if analysis["is_male"]:
        # Warm, deep chest resonance + clear vocal definition
        af_filters.extend([
            "equalizer=f=120:width_type=o:width=1.5:g=3.8",
            "equalizer=f=2800:width_type=o:width=1.5:g=1.8"
        ])
    else:
        # Smooth, clear feminine articulation
        af_filters.extend([
            "equalizer=f=220:width_type=o:width=1.5:g=2.2",
            "equalizer=f=3400:width_type=o:width=1.5:g=2.2"
        ])

    af_filters.append("silenceremove=start_periods=1:start_duration=0.03:start_threshold=-40dB:detection=peak,areverse,silenceremove=start_periods=1:start_duration=0.03:start_threshold=-40dB:detection=peak,areverse")
    morph_filter = ",".join(af_filters)

    for i, chunk in enumerate(translated_chunks):
        narration = chunk.get("narration", "").strip()
        if not narration:
            continue

        clean = unicodedata.normalize("NFC", narration)
        clean = re.sub(r'\s+', ' ', clean).strip()
        if not clean or not re.search(r'[\u1000-\u109F]', clean):
            print(f"[VoiceClone] Skipping non-Burmese text chunk #{i+1}: '{clean}'")
            continue

        stem = f"tts_{i+1:04d}"
        raw_mp3 = tts_dir / f"{stem}_raw.mp3"
        wav_path = tts_dir / f"{stem}.wav"

        pct = 58 + int((i / max(1, total)) * 20)
        update_job(job_id, progress=pct, message=f"Acoustic cloned synthesis {i+1}/{total}...")

        success = False
        for attempt in range(3):
            try:
                asyncio.run(_edge_tts_save(clean, base_voice, calibrated_rate, raw_mp3))
                if raw_mp3.is_file() and raw_mp3.stat().st_size > 256:
                    conv = subprocess.run(
                        [ffmpeg, "-y", "-hide_banner", "-loglevel", "error",
                         "-i", str(raw_mp3),
                         "-af", morph_filter,
                         "-ac", "1", "-ar", "24000",
                         "-c:a", "pcm_s16le", str(wav_path)],
                        capture_output=True, text=True
                    )
                    if conv.returncode == 0 and wav_path.is_file():
                        raw_mp3.unlink(missing_ok=True)
                        success = True
                        break
            except Exception as e:
                if attempt < 2:
                    time.sleep(1.0)

        if success:
            dur = probe_duration(wav_path)
            results.append({
                **chunk,
                "tts_audio": str(wav_path),
                "tts_duration": round(dur, 3),
            })

    update_job(job_id, progress=78, message=f"Cloned voice synthesis complete — {len(results)} clips")
    return results


def clone_voice_sample(voice_sample_path: Path, api_key: str) -> Optional[str]:
    """Clone a custom voice sample with ElevenLabs to get a reusable voice_id."""
    if not api_key:
        return None
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
        print(f"[VoiceClone] ElevenLabs clone error: {e}")
    return None


def synthesize_elevenlabs_tts(
    translated_chunks: list[dict],
    job_dir: Path,
    job_id: str,
    voice_id: str,
    api_key: str,
) -> list[dict]:
    """Synthesize Burmese chunks using ElevenLabs Multilingual v2 with the cloned voice."""
    if not api_key:
        return []
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
        update_job(job_id, progress=progress_pct, message=f"ElevenLabs voice synthesis {i+1}/{len(translated_chunks)}...")

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

        if success:
            dur = probe_duration(wav_path)
            results.append({
                **chunk,
                "tts_audio": str(wav_path),
                "tts_duration": round(dur, 3),
            })

    if results:
        update_job(job_id, progress=78, message=f"ElevenLabs voice synthesis complete — {len(results)} clips")
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

    # Target safe line length (characters) before requiring font scaling (wider for movie recap flow)
    safe_max_chars = 26 if is_portrait else 34
    single_line_threshold = 20 if is_portrait else 28

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
        scaled_font_size = max(30, int(base_font_size * ratio))

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
    hook_title: str = "",
) -> Path:
    """Generate ASS subtitle file with Akkhayar21 font in clean Movie Recap style.
    Supports 1-line captivating intro thumbnail hook at video start (0s-2.8s) matching user's ref photo.
    """
    font_name = "Akkhayar21"
    if subtitle_style in ("font-kunheing", "kunheing"):
        font_name = "A J Kunheing E-T-M 01"
    elif subtitle_style in ("font-jojar", "jojar"):
        font_name = "Myanmar Jojar"
    elif subtitle_style in ("font-myanmaros", "myanmaros"):
        font_name = "Myanmar OS"

    is_portrait = canvas_h > canvas_w
    font_size = int(canvas_h * 0.042) if is_portrait else int(canvas_h * 0.054)
    font_size = max(44, min(70, font_size))

    hook_font_size = max(46, int(font_size * 1.30))
    hook_margin_v = int(canvas_h * 0.28 if is_portrait else canvas_h * 0.20)

    try:
        b_pos = float(blur_position)
    except (ValueError, TypeError):
        if str(blur_position) == "center":
            b_pos = 60.0
        elif str(blur_position) == "drama":
            b_pos = 66.0
        elif str(blur_position) == "bottom":
            b_pos = 86.0
        else:
            b_pos = 78.0

    if blur_enabled:
        strip_center_from_bottom = ((100.0 - b_pos) / 100.0) * canvas_h
        margin_v = max(10, int(strip_center_from_bottom - (font_size * 1.05)))
    else:
        margin_v = int(canvas_h * 0.08 if is_portrait else canvas_h * 0.10)

    margin_lr = int(canvas_w * 0.05)  # Wide 5% padding on sides (allows 90% full subtitle width)

    # WrapStyle: 2 = strictly NO auto-wrapping by libass (guarantees max 2 lines!)
    header = f"""[Script Info]
ScriptType: v4.00+
PlayResX: {canvas_w}
PlayResY: {canvas_h}
WrapStyle: 2
ScaledBorderAndShadow: yes

[V4+ Styles]
Format: Name, Fontname, Fontsize, PrimaryColour, SecondaryColour, OutlineColour, BackColour, Bold, Italic, Underline, StrikeOut, ScaleX, ScaleY, Spacing, Angle, BorderStyle, Outline, Shadow, Alignment, MarginL, MarginR, MarginV, Encoding
Style: Default,{font_name},{font_size},&H0015CCFA,&H000000FF,&H00000000,&HB0000000,-1,0,0,0,100,100,0,0,1,4.2,1.8,2,{margin_lr},{margin_lr},{margin_v},1
Style: IntroHook,{font_name},{hook_font_size},&H0015CCFA,&H000000FF,&H00000000,&HB0000000,-1,0,0,0,100,100,0,0,1,5.5,2.8,2,{margin_lr},{margin_lr},{hook_margin_v},1

[Events]
Format: Layer, Start, End, Style, Name, MarginL, MarginR, MarginV, Effect, Text
"""
    events = []

    # 1. Add Intro Thumbnail Hook (Strictly 1 line, exactly matching ref photo, 0s to 2.8s)
    if hook_title:
        clean_hook = str(hook_title).replace("\r", " ").replace("\n", " ").strip()
        clean_hook = re.sub(r'[\"\'\`]', '', clean_hook)
        clean_hook = re.sub(r'\s+', ' ', clean_hook).strip()
        if clean_hook:
            # Strictly ONE single line only:
            single_line_hook = clean_hook.split("||")[0].strip()
            events.append(f"Dialogue: 2,0:00:00.00,0:00:02.80,IntroHook,,0,0,0,,{{\\fad(100,250)}}{single_line_hook}")

    # 2. Add Narration Subtitles
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


def format_srt_time(seconds: float) -> str:
    """Format seconds into standard SRT timestamp: hh:mm:ss,mmm"""
    total_ms = max(0, int(round(seconds * 1000)))
    hrs = total_ms // 3600000
    mins = (total_ms % 3600000) // 60000
    secs = (total_ms % 60000) // 1000
    ms = total_ms % 1000
    return f"{hrs:02d}:{mins:02d}:{secs:02d},{ms:03d}"


def generate_burmese_srt(subtitles_timing: list[dict], output_srt: Path) -> Path:
    """Generate standard .srt subtitle file with clean Myanmar narration text and timings."""
    blocks = []
    idx = 1
    for seg in subtitles_timing:
        text = str(seg.get("narration", seg.get("translated", ""))).strip()
        if not text:
            continue
        start_t = float(seg.get("sub_start", seg.get("start", 0.0)))
        end_t = float(seg.get("sub_end", start_t + float(seg.get("tts_duration", 2.2))))
        if end_t <= start_t:
            end_t = start_t + 1.8

        # Strip any formatting tags like {\fs...} or \N
        clean = re.sub(r'\{[^\}]*\}', '', text)
        clean = clean.replace('\\N', '\n').replace('\\n', '\n')
        clean = re.sub(r'\s+', ' ', clean).strip()

        s_str = format_srt_time(start_t)
        e_str = format_srt_time(end_t)
        blocks.append(f"{idx}\n{s_str} --> {e_str}\n{clean}\n")
        idx += 1

    output_srt.write_text("\n".join(blocks) + "\n", encoding="utf-8")
    return output_srt


def detect_subtitle_zone(video_path: Path) -> dict:
    """Accurately detect subtitle vertical center (%) and thickness (%) in video frames.
    Detects drama square subtitles (64-67% Y), portrait reels (74-78% Y), and widescreen (80-85% Y).
    """
    try:
        vw, vh = probe_dimensions(video_path)
    except Exception:
        vw, vh = 720, 720

    is_square = (0.80 <= (vw / vh) <= 1.20)
    is_portrait = vh > vw and not is_square
    default_pos = 66.0 if is_square else (76.0 if is_portrait else 83.0)
    default_thick = 15.0 if is_square else 14.5

    try:
        duration = probe_duration(video_path)
    except Exception:
        duration = 60.0

    # Try frame-based detection using Pillow + numpy
    try:
        from PIL import Image
        import numpy as np

        y_min_pct = 0.50 if is_square else (0.58 if is_portrait else 0.68)
        y_max_pct = 0.82 if is_square else (0.88 if is_portrait else 0.94)

        start_t = min(3.0, duration * 0.05)
        end_t = max(start_t + 1.0, duration * 0.90)
        sample_times = np.linspace(start_t, end_t, 8)

        peaks = []
        with tempfile.TemporaryDirectory(prefix="sub_detect_") as tmp_dir:
            tmp = Path(tmp_dir)
            ffmpeg = find_ffmpeg()
            for idx, t in enumerate(sample_times):
                frame_png = tmp / f"frame_{idx}.png"
                subprocess.run(
                    [ffmpeg, "-y", "-ss", f"{t:.2f}", "-i", str(video_path),
                     "-vframes", "1", "-f", "image2", str(frame_png)],
                    capture_output=True
                )
                if not frame_png.is_file():
                    continue

                im = Image.open(frame_png).convert("L")
                arr = np.array(im, dtype=np.float32)
                h, w = arr.shape

                y_start = int(h * y_min_pct)
                y_end = int(h * y_max_pct)
                crop = arr[y_start:y_end, :]

                # Horizontal line gradient (detects top & bottom strokes of text characters)
                dy = np.abs(np.diff(crop, axis=0))
                # High luminance text filter (white / yellow subtitles are bright >= 165)
                bright = (crop[:-1, :] > 165).astype(np.float32)
                score = dy * bright

                row_energy = np.sum(score, axis=1)
                win = max(7, int(h * 0.015))
                kernel = np.ones(win, dtype=np.float32) / win
                smoothed = np.convolve(row_energy, kernel, mode="same")

                max_val = float(np.max(smoothed))
                if max_val > 150.0:
                    peak_idx = int(np.argmax(smoothed))
                    actual_y = y_start + peak_idx
                    pct = (actual_y / h) * 100.0
                    peaks.append(pct)

            if peaks:
                median_y = float(np.median(peaks))
                detected_y = round(median_y, 1)
                if is_square:
                    detected_y = max(58.0, min(72.0, detected_y))
                elif is_portrait:
                    detected_y = max(68.0, min(82.0, detected_y))
                else:
                    detected_y = max(75.0, min(88.0, detected_y))

                print(f"[BlurDetect] Auto-detected subtitle at {detected_y}% Y for {vw}x{vh}")
                return {"position": detected_y, "thickness": default_thick, "detected": True}
    except Exception as e:
        print(f"[BlurDetect] Frame detection note: {e}")

    print(f"[BlurDetect] Using aspect ratio default {default_pos}% Y for {vw}x{vh} (square={is_square})")
    return {"position": default_pos, "thickness": default_thick, "detected": False}


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
    logo_x: Optional[float] = None,
    logo_y: float = 8.0,
    logo_align: str = "right",
    logo_scale: float = 12.0,
    logo_opacity: float = 1.0,
    include_original_audio: bool = False,
    hook_title: str = "",
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
    canvas_w, canvas_h = (src_w // 2) * 2, (src_h // 2) * 2
    ratio_filter = ""
    if ratio == "16:9":
        canvas_w, canvas_h = 1920, 1080
        ratio_filter = "scale=1920:1080:force_original_aspect_ratio=decrease:force_divisible_by=2,pad=1920:1080:(ow-iw)/2:(oh-ih)/2:black"
    elif ratio == "9:16":
        canvas_w, canvas_h = 1080, 1920
        ratio_filter = "scale=1080:1920:force_original_aspect_ratio=decrease:force_divisible_by=2,pad=1080:1920:(ow-iw)/2:(oh-ih)/2:black"
    elif ratio == "1:1":
        canvas_w, canvas_h = 1080, 1080
        ratio_filter = "scale=1080:1080:force_original_aspect_ratio=decrease:force_divisible_by=2,pad=1080:1080:(ow-iw)/2:(oh-ih)/2:black"
    elif ratio == "4:5":
        canvas_w, canvas_h = 1080, 1350
        ratio_filter = "scale=1080:1350:force_original_aspect_ratio=decrease:force_divisible_by=2,pad=1080:1350:(ow-iw)/2:(oh-ih)/2:black"
    elif canvas_w != src_w or canvas_h != src_h:
        ratio_filter = f"scale={canvas_w}:{canvas_h}"

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

    is_auto = str(blur_position).strip().lower() in ("auto", "none", "0", "")
    if is_auto:
        det = detect_subtitle_zone(source_video)
        b_pos = det["position"]
        b_thick = det["thickness"]
        b_intense = 38.0 if is_portrait else 35.0
    else:
        try:
            b_pos = float(blur_position)
        except (ValueError, TypeError):
            if str(blur_position) == "center":
                b_pos = 60.0
            elif str(blur_position) == "drama":
                b_pos = 66.0
            elif str(blur_position) == "bottom":
                b_pos = 86.0
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

    # 1. Ratio Scaling & Padding to canvas FIRST (ensures blur, subtitles & logo share 100% exact preview canvas coordinates)
    if ratio_filter:
        filter_chains.append(f"{current_v}{ratio_filter}[vbase]")
        current_v = "[vbase]"

    # 2. Natural frosted glass blur directly covering original subtitle area
    if enable_blur:
        b_pos_f = float(b_pos)
        b_thick_f = float(b_thick)
        thickness_pct = max(0.04, min(0.40, b_thick_f / 100.0))
        top_pct = max(0.0, min(1.0 - thickness_pct, (b_pos_f - b_thick_f / 2.0) / 100.0))

        # Compute exact integer pixel coordinates directly from canvas dimensions
        blur_y = int(round(canvas_h * top_pct / 2.0)) * 2
        blur_h = max(8, int(round(canvas_h * thickness_pct / 2.0)) * 2)
        if blur_y + blur_h > canvas_h:
            blur_h = max(8, canvas_h - blur_y)
        blur_bottom = blur_y + blur_h

        luma_rad = max(16, min(42, int(b_intense * 0.95)))
        chroma_rad = max(8, int(luma_rad * 0.6))
        tint_opacity = min(0.78, max(0.40, (b_intense / 100.0) * 0.85))

        blur_chain = (
            f"{current_v}split=2[vmain][vblur];"
            f"[vblur]crop=w={canvas_w}:h={blur_h}:x=0:y={blur_y},"
            f"boxblur=luma_radius={luma_rad}:luma_power=3:chroma_radius={chroma_rad}:chroma_power=3[blurBand];"
            f"[vmain][blurBand]overlay=x=0:y={blur_y},"
            f"drawbox=x=0:y={blur_y}:w={canvas_w}:h={blur_h}:color=black@{tint_opacity:.2f}:t=fill,"
            f"drawbox=x=0:y={blur_y}:w={canvas_w}:h=2:color=white@0.30:t=fill,"
            f"drawbox=x=0:y={blur_bottom - 2}:w={canvas_w}:h=2:color=white@0.30:t=fill[vblurred]"
        )
        filter_chains.append(blur_chain)
        current_v = "[vblurred]"

    # 3. Subtitles burn-in directly over the blurred zone & export .srt
    if enable_subtitles and subtitles_timing:
        ass_path = job_dir / "burmese_subtitles.ass"
        generate_burmese_ass(subtitles_timing, ass_path, canvas_w, canvas_h, blur_enabled=enable_blur, blur_position=b_pos, subtitle_style=subtitle_style, hook_title=hook_title)
        srt_path = job_dir / "burmese_subtitles.srt"
        generate_burmese_srt(subtitles_timing, srt_path)
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
        scale_pct = max(0.04, min(0.50, float(logo_scale) / 100.0))
        target_w = max(40, int(canvas_w * scale_pct))
        opacity = max(0.1, min(1.0, float(logo_opacity)))
        y_pct = max(0.0, min(1.0, float(logo_y) / 100.0))
        if logo_x is not None:
            x_pct = max(0.0, min(1.0, float(logo_x) / 100.0))
            # Exact 1:1 match with CSS left: ${logoX}% and top: ${logoY}%
            x_expr = f"min(main_w-overlay_w,max(0,main_w*{x_pct:.4f}))"
            y_expr = f"min(main_h-overlay_h,max(0,main_h*{y_pct:.4f}))"
        else:
            align = str(logo_align).lower()
            edge_x = int(canvas_w * 0.05)
            pad = int(canvas_w * 0.02)
            if align == "left":
                x_expr = f"{edge_x}"
            elif align == "center":
                x_expr = "(main_w-overlay_w)/2"
            else:
                x_expr = f"main_w-overlay_w-{edge_x}"
            y_expr = f"min(main_h-overlay_h,max(0,main_h*{y_pct:.4f}))"

        logo_chain = (
            f"[2:v]scale={target_w}:-2,format=rgba,colorchannelmixer=aa={opacity:.2f}[vlogo];"
            f"{current_v}[vlogo]overlay=x='{x_expr}':y='{y_expr}'[vout]"
        )
        filter_chains.append(logo_chain)
        current_v = "[vout]"
    elif watermark_text and watermark_text.strip():
        safe_wm = watermark_text.strip().replace("'", "").replace(":", "")
        wm_size = 32 if not is_portrait else 26
        if logo_x is not None:
            x_pct = max(0.0, min(1.0, float(logo_x) / 100.0))
            y_pct = max(0.0, min(1.0, float(logo_y) / 100.0))
            x_pos = f"min(w-tw-20,max(20,w*{x_pct:.4f}))"
            y_pos = f"min(h-th-20,max(20,h*{y_pct:.4f}))"
        else:
            x_pos = "w-tw-30"
            y_pos = "30"
        filter_chains.append(f"{current_v}drawtext=font='Akkhayar21':text='{safe_wm}':fontcolor=white@0.85:fontsize={wm_size}:x='{x_pos}':y='{y_pos}'[vout]")
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

    # Generate standalone intro thumbnail cover with hook title burned in (t=0.6s)
    thumb_path = job_dir / "thumbnail_cover.jpg"
    try:
        subprocess.run(
            [ffmpeg, "-y", "-ss", "00:00:00.600", "-i", str(output_path),
             "-vframes", "1", "-q:v", "2", str(thumb_path)],
            capture_output=True, check=True
        )
    except Exception as e:
        print(f"[Thumbnail] Cover extract note: {e}")

    update_job(job_id, progress=100,
               message=f"Complete! {final_duration:.1f}s, {file_size_mb:.1f}MB",
               status="completed",
               output_file=str(output_path),
               output_duration=round(final_duration, 1),
               output_size_mb=round(file_size_mb, 1),
               thumbnail_file=str(thumb_path) if thumb_path.is_file() else None,
               hook_title=hook_title if hook_title else None)

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
    logo_x: Optional[float] = None,
    logo_y: float = 8.0,
    logo_align: str = "right",
    logo_scale: float = 12.0,
    logo_opacity: float = 1.0,
    include_original_audio: bool = False,
    voice_sample_path: Optional[Path] = None,
    voice_id: Optional[str] = None,
    elevenlabs_api_key: Optional[str] = None,
    enable_intro_hook: bool = True,
    intro_hook_text: Optional[str] = None,
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

        # Only auto-calibrate blur if user explicitly set 'auto'
        vw, vh = probe_dimensions(video_path)
        is_port = vh > vw
        if str(blur_position).strip().lower() in ("auto", "none", "0", ""):
            det = detect_subtitle_zone(video_path)
            blur_position = det["position"]
            blur_thickness = det["thickness"]
            blur_intensity = 38.0 if is_port else 36.0
            update_job(job_id, blur_position=blur_position, blur_thickness=blur_thickness,
                       message=f"Auto-configured blur at {blur_position}% Y for {vw}x{vh} video...")
            print(f"[BlurAuto] Set blur position {blur_position}% Y for {vw}x{vh} (detected={det.get('detected', False)})")
        else:
            try:
                blur_position = float(blur_position)
            except Exception:
                blur_position = 82.0
            try:
                blur_thickness = float(blur_thickness)
            except Exception:
                blur_thickness = 14.0

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

        # Step 4b: Generate 1-line recap intro hook title (Thumbnail Title Hook)
        hook_title = ""
        if enable_intro_hook:
            if intro_hook_text and str(intro_hook_text).strip():
                hook_title = str(intro_hook_text).strip()
            else:
                try:
                    from google import genai
                    api_key = os.environ.get("GEMINI_API_KEY") or os.environ.get("VITE_GEMINI_API_KEY", "")
                    if api_key:
                        client = genai.Client(api_key=api_key)
                        full_context = " ".join([c.get("narration", c.get("text", "")) for c in translated[:15]])
                        hook_title = generate_story_hook_title(full_context, client)
                        print(f"[IntroHook] Generated 1-line title hook: {hook_title}")
                except Exception as e:
                    print(f"[IntroHook] Generation note: {e}")
                    hook_title = "ဒီနေ့ဘာတွေထူးဆန်းတာဖြစ်သွားတာလဲ?"

        # Step 5: Voice synthesis (Smart Acoustic Cloned Voice, ElevenLabs, or Natural Edge TTS)
        tts_results = []
        if voice_sample_path and voice_sample_path.is_file():
            # 1. Try ElevenLabs if user or server provided an API key
            el_key = (elevenlabs_api_key or ELEVENLABS_API_KEY or os.environ.get("ELEVENLABS_API_KEY", "")).strip()
            if el_key:
                update_job(job_id, step="voice_synthesis", progress=56, message="Cloning voice sample with ElevenLabs...")
                cloned_id = clone_voice_sample(voice_sample_path, el_key)
                if cloned_id:
                    tts_results = synthesize_elevenlabs_tts(translated, job_dir, job_id, cloned_id, el_key)
                    if not tts_results:
                        print("[VoiceClone] ElevenLabs synthesis failed, falling back to Acoustic Clone...")

            # 2. If ElevenLabs not configured or failed, use Smart Acoustic Voice Clone (Free & 100% Guaranteed to Work!)
            if not tts_results:
                update_job(job_id, step="voice_synthesis", progress=56, message="Applying Acoustic Voice Cloning from your sample...")
                tts_results = synthesize_acoustic_cloned_voice(translated, job_dir, job_id, voice_sample_path, speed=speed or "+0%")

        if not tts_results and voice_id:
            el_key = (elevenlabs_api_key or ELEVENLABS_API_KEY or os.environ.get("ELEVENLABS_API_KEY", "")).strip()
            if el_key:
                tts_results = synthesize_elevenlabs_tts(translated, job_dir, job_id, voice_id, el_key)

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
            logo_x=logo_x,
            logo_y=logo_y,
            logo_align=logo_align,
            logo_scale=logo_scale,
            logo_opacity=logo_opacity,
            include_original_audio=include_original_audio,
            hook_title=hook_title,
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


@app.post("/api/oneclick/fetch-video")
async def fetch_video_url(url: str = Form(...)):
    """Pre-download video from YouTube or TikTok link and return preview stream URL."""
    clean_url = url.strip()
    if not clean_url:
        raise HTTPException(status_code=400, detail="URL cannot be empty")
    temp_id = str(uuid.uuid4())[:10]
    temp_dir = JOBS_DIR / f"temp_{temp_id}"
    temp_dir.mkdir(parents=True, exist_ok=True)
    try:
        video_path = download_media_from_url(clean_url, temp_dir, temp_id)
        dur = probe_duration(video_path)
        w, h = probe_dimensions(video_path)
        return {
            "success": True,
            "temp_id": temp_id,
            "duration": dur,
            "width": w,
            "height": h,
            "filename": video_path.name,
            "preview_url": f"/api/oneclick/stream-temp/{temp_id}",
        }
    except Exception as e:
        shutil.rmtree(temp_dir, ignore_errors=True)
        raise HTTPException(status_code=400, detail=f"Download failed: {str(e)[:300]}")


@app.get("/api/oneclick/stream-temp/{temp_id}")
async def stream_temp_video(temp_id: str):
    """Serve pre-downloaded temp video for live client preview & calibration."""
    temp_dir = JOBS_DIR / f"temp_{temp_id}"
    candidates = list(temp_dir.glob("source.*"))
    if not candidates:
        raise HTTPException(status_code=404, detail="Temp video not found")
    return FileResponse(str(candidates[0]), media_type="video/mp4")


@app.post("/api/oneclick/start")
async def start_job(
    background_tasks: BackgroundTasks,
    file: Optional[UploadFile] = File(default=None),
    video_url: Optional[str] = Form(default=None),
    temp_id: Optional[str] = Form(default=None),
    voice: str = Form("my-MM-NilarNeural"),
    speed: str = Form("+0%"),
    ratio: str = Form("original"),
    enable_subtitles: bool = Form(True),
    enable_blur: bool = Form(True),
    blur_position: Any = Form(82.0),
    blur_thickness: float = Form(14.0),
    blur_intensity: float = Form(30.0),
    subtitle_style: str = Form("font-akkhayar"),
    watermark_text: str = Form(""),
    logo_file: Optional[UploadFile] = File(default=None),
    logo_x: Optional[float] = Form(None),
    logo_y: float = Form(8.0),
    logo_align: str = Form("right"),
    logo_scale: float = Form(12.0),
    logo_opacity: float = Form(1.0),
    include_original_audio: bool = Form(False),
    voice_sample: Optional[UploadFile] = File(default=None),
    voice_id: Optional[str] = Form(default=None),
    elevenlabs_api_key: Optional[str] = Form(default=None),
    enable_intro_hook: bool = Form(False),
    intro_hook_text: Optional[str] = Form(default=None),
):
    """Upload video, use pre-downloaded temp_id, or provide YouTube/TikTok URL and start OneClick pipeline."""
    job_id = str(uuid.uuid4())[:12]
    job_dir = JOBS_DIR / job_id
    job_dir.mkdir(parents=True, exist_ok=True)

    video_path = None
    source_name = "Video"
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
    elif temp_id and temp_id.strip():
        t_dir = JOBS_DIR / f"temp_{temp_id.strip()}"
        cands = list(t_dir.glob("source.*"))
        if cands:
            ext = cands[0].suffix or ".mp4"
            video_path = job_dir / f"source{ext}"
            shutil.copy2(cands[0], video_path)
            source_name = f"URL Video ({cands[0].name})"
            source_size = round(video_path.stat().st_size / (1024 * 1024), 1)
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
        "enable_intro_hook": enable_intro_hook,
        "intro_hook_text": intro_hook_text,
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
        logo_x,
        logo_y,
        logo_align,
        logo_scale,
        logo_opacity,
        include_original_audio,
        voice_sample_path,
        voice_id,
        elevenlabs_api_key,
        enable_intro_hook,
        intro_hook_text,
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


@app.get("/api/oneclick/subtitles/{job_id}")
async def download_subtitles(job_id: str):
    """Download standard .srt Myanmar subtitle file for the completed recap."""
    job_dir = JOBS_DIR / job_id
    srt_path = job_dir / "burmese_subtitles.srt"
    if not srt_path.is_file():
        # Fallback: try generating from timestamp_translations.json
        json_path = job_dir / "timestamp_translations.json"
        if json_path.is_file():
            try:
                data = json.loads(json_path.read_text(encoding="utf-8"))
                generate_burmese_srt(data, srt_path)
            except Exception:
                pass

    if not srt_path.is_file():
        raise HTTPException(status_code=404, detail="Subtitle file (.srt) not found for this job.")

    return FileResponse(
        str(srt_path),
        media_type="text/plain; charset=utf-8",
        filename=f"oneclick_subtitles_{job_id[:8]}_myanmar.srt",
        headers={"Content-Disposition": f'attachment; filename="oneclick_subtitles_{job_id[:8]}_myanmar.srt"'}
    )


@app.get("/api/oneclick/thumbnail/{job_id}")
async def download_thumbnail(job_id: str):
    """Download intro thumbnail cover image with hook title (.jpg)."""
    job_dir = JOBS_DIR / job_id
    thumb_path = job_dir / "thumbnail_cover.jpg"
    if not thumb_path.is_file():
        out_vid = job_dir / "final_oneclick_recap.mp4"
        if out_vid.is_file():
            try:
                ffmpeg = find_ffmpeg()
                subprocess.run([ffmpeg, "-y", "-ss", "00:00:00.600", "-i", str(out_vid), "-vframes", "1", "-q:v", "2", str(thumb_path)], capture_output=True)
            except Exception:
                pass

    if not thumb_path.is_file():
        raise HTTPException(status_code=404, detail="Thumbnail cover not found for this job.")

    return FileResponse(
        str(thumb_path),
        media_type="image/jpeg",
        filename=f"oneclick_thumbnail_{job_id[:8]}.jpg",
        headers={"Content-Disposition": f'attachment; filename="oneclick_thumbnail_{job_id[:8]}.jpg"'}
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
