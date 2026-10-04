import Fastify from 'fastify';
import cors from '@fastify/cors';
import multipart from '@fastify/multipart';
import { createReadStream, createWriteStream, promises as fs } from 'node:fs';
import { spawn } from 'node:child_process';
import { randomUUID } from 'node:crypto';
import { pipeline } from 'node:stream/promises';
import path from 'node:path';

const PORT = Number(process.env.PORT || 8080);
const HOST = process.env.HOST || '0.0.0.0';
const DATA_DIR = path.resolve(process.env.MEDIA_DATA_DIR || './data');
const INPUT_DIR = path.join(DATA_DIR, 'inputs');
const OUTPUT_DIR = path.join(DATA_DIR, 'outputs');
const FONTS_DIR = path.join(DATA_DIR, 'fonts');
const MAX_UPLOAD_BYTES = Number(process.env.MAX_UPLOAD_BYTES || 1024 * 1024 * 1024);
const JOB_TTL_MS = Number(process.env.JOB_TTL_MS || 2 * 60 * 60 * 1000);
const ELEVENLABS_API_KEY = process.env.ELEVENLABS_API_KEY || '';
const ELEVENLABS_MODEL = process.env.ELEVENLABS_MODEL || 'eleven_multilingual_v2';
const GROQ_API_KEY = process.env.GROQ_API_KEY || '';
const OPENAI_API_KEY = process.env.OPENAI_API_KEY || '';
const MAX_CLONE_TEXT_CHARS = Number(process.env.MAX_CLONE_TEXT_CHARS || 15000);
const jobs = new Map();
const allowedVideo = new Set(['video/mp4', 'video/webm', 'video/quicktime', 'video/x-matroska']);
const allowedAudio = new Set(['audio/mpeg', 'audio/wav', 'audio/x-wav', 'audio/mp4', 'audio/webm', 'audio/ogg']);
const allowedImage = new Set(['image/png', 'image/jpeg', 'image/jpg', 'image/webp', 'image/gif', 'image/svg+xml']);
const videoExtensions = /\.(mp4|m4v|webm|mov|mkv|avi|wmv|flv|3gp|3g2|ts|mts|mpeg|mpg)$/i;
const audioExtensions = /\.(mp3|wav|wave|m4a|m4b|aac|flac|ogg|oga|opus|wma|amr|aif|aiff|aifc|caf|ac3|eac3|mka|weba|webm)$/i;
const imageExtensions = /\.(png|jpe?g|webp|gif|svg)$/i;

const app = Fastify({ logger: true, bodyLimit: MAX_UPLOAD_BYTES });
await app.register(cors, { origin: process.env.CORS_ORIGIN || true });
await app.register(multipart, { limits: { fileSize: MAX_UPLOAD_BYTES, files: 1 } });
await fs.mkdir(INPUT_DIR, { recursive: true });
await fs.mkdir(OUTPUT_DIR, { recursive: true });
await fs.mkdir(FONTS_DIR, { recursive: true });

const jsonError = (reply, status, message) => reply.code(status).send({ error: message });
const safeName = (name) => path.basename(name).replace(/[^a-zA-Z0-9._-]/g, '_');

app.get('/health', async () => ({ ok: true, service: 'lumini-media-worker' }));

app.get('/api/voice-clones/status', async () => ({ configured: Boolean(ELEVENLABS_API_KEY) }));

const VOXCPM_URL = process.env.VOXCPM_URL || 'http://127.0.0.1:8080';

app.get('/api/voxcpm/status', async (request, reply) => {
  try {
    const res = await fetch(`${VOXCPM_URL}/api/voxcpm/status`, { signal: AbortSignal.timeout(2000) });
    if (res.ok) return await res.json();
  } catch { }
  return {
    online: false,
    engine: 'VoxCPM2 (OpenBMB 48kHz)',
    message: 'VoxCPM service is not running. Start it with: python server/voxcpm_service.py'
  };
});

app.post('/api/voxcpm/clone', async (request, reply) => {
  try {
    const part = await request.file();
    if (!part || !part.filename) return jsonError(reply, 400, 'A voice sample file is required.');
    const name = String(part.fields?.name?.value || 'VoxCPM Voice').trim();
    const instruction = String(part.fields?.instruction?.value || 'Energetic movie recap narration style').trim();
    const transcript = String(part.fields?.transcript?.value || '').trim();

    const sample = await part.toBuffer();
    const form = new FormData();
    form.append('name', name);
    form.append('instruction', instruction);
    if (transcript) form.append('transcript', transcript);
    form.append('file', new Blob([sample], { type: part.mimetype || 'audio/wav' }), part.filename);

    const voxRes = await fetch(`${VOXCPM_URL}/api/voxcpm/clone`, { method: 'POST', body: form });
    if (!voxRes.ok) return jsonError(reply, voxRes.status, 'VoxCPM registration failed.');
    return reply.send(await voxRes.json());
  } catch (err) {
    return jsonError(reply, 502, `VoxCPM Connection Error: ${err.message}`);
  }
});

app.post('/api/voxcpm/synthesize', async (request, reply) => {
  try {
    const body = request.body || {};
    const form = new FormData();
    form.append('voice_id', String(body.voice_id || ''));
    form.append('text', String(body.text || ''));
    if (body.instruction) form.append('instruction', String(body.instruction));
    if (body.speed) form.append('speed', String(body.speed));

    const voxRes = await fetch(`${VOXCPM_URL}/api/voxcpm/synthesize`, { method: 'POST', body: form });
    if (!voxRes.ok) return jsonError(reply, voxRes.status, 'VoxCPM synthesis failed.');
    return reply.type('audio/wav').send(Buffer.from(await voxRes.arrayBuffer()));
  } catch (err) {
    return jsonError(reply, 502, `VoxCPM Connection Error: ${err.message}`);
  }
});

app.post('/api/voice-clones', async (request, reply) => {
  if (!ELEVENLABS_API_KEY) return jsonError(reply, 503, 'Voice clone provider is not configured on the server.');
  const part = await request.file();
  if (!part || !part.filename) return jsonError(reply, 400, 'A voice sample file is required.');
  if (part.file.truncated) return jsonError(reply, 413, 'Voice sample is too large.');
  const name = String(part.fields?.name?.value || '').trim().slice(0, 80);
  if (!name) return jsonError(reply, 400, 'Voice clone name is required.');
  const sample = await part.toBuffer();
  const form = new FormData();
  form.append('name', name);
  form.append('files', new Blob([sample], { type: part.mimetype || 'audio/webm' }), part.filename);
  form.append('description', `Lumini voice clone: ${name}`);
  const provider = await fetch('https://api.elevenlabs.io/v1/voices', { method: 'POST', headers: { 'xi-api-key': ELEVENLABS_API_KEY }, body: form });
  if (!provider.ok) return providerError(reply, provider, 'Voice clone creation failed.');
  const data = await provider.json();
  return reply.code(201).send({ voiceId: data.voice_id, name });
});

app.post('/api/voice-clones/:voiceId/synthesize', async (request, reply) => {
  if (!ELEVENLABS_API_KEY) return jsonError(reply, 503, 'Voice clone provider is not configured on the server.');
  const text = String(request.body?.text || '').trim();
  if (!text) return jsonError(reply, 400, 'Text is required.');
  if (text.length > MAX_CLONE_TEXT_CHARS) return jsonError(reply, 413, `Text exceeds ${MAX_CLONE_TEXT_CHARS} characters.`);
  const requestedSpeed = Number(request.body?.speed);
  const speed = Number.isFinite(requestedSpeed) ? Math.min(1.3, Math.max(0.7, requestedSpeed)) : 1;
  const provider = await fetch(`https://api.elevenlabs.io/v1/text-to-speech/${encodeURIComponent(request.params.voiceId)}`, {
    method: 'POST',
    headers: { 'xi-api-key': ELEVENLABS_API_KEY, 'Content-Type': 'application/json', Accept: 'audio/mpeg' },
    body: JSON.stringify({ text, model_id: ELEVENLABS_MODEL, voice_settings: { stability: 0.45, similarity_boost: 0.8, style: 0.2, speed } }),
  });
  if (!provider.ok) return providerError(reply, provider, 'Voice synthesis failed.');
  return reply.type('audio/mpeg').send(Buffer.from(await provider.arrayBuffer()));
});

app.delete('/api/voice-clones/:voiceId', async (request, reply) => {
  if (!ELEVENLABS_API_KEY) return reply.code(204).send();
  const provider = await fetch(`https://api.elevenlabs.io/v1/voices/${encodeURIComponent(request.params.voiceId)}`, { method: 'DELETE', headers: { 'xi-api-key': ELEVENLABS_API_KEY } });
  if (!provider.ok && provider.status !== 404) return providerError(reply, provider, 'Voice clone deletion failed.');
  return reply.code(204).send();
});

async function providerError(reply, response, fallback) {
  const data = await response.json().catch(() => null);
  const message = data?.detail?.message || data?.detail || fallback;
  return jsonError(reply, response.status >= 400 && response.status < 600 ? response.status : 502, String(message));
}

function formatWhisperSecondsToSrt(totalSec) {
  const safe = Math.max(0, Number(totalSec) || 0);
  const hrs = Math.floor(safe / 3600);
  const mins = Math.floor((safe % 3600) / 60);
  const secs = Math.floor(safe % 60);
  const ms = Math.floor((safe % 1) * 1000);
  return `${hrs.toString().padStart(2, '0')}:${mins.toString().padStart(2, '0')}:${secs.toString().padStart(2, '0')},${ms.toString().padStart(3, '0')}`;
}

function whisperSegmentsToSrt(segments) {
  if (!Array.isArray(segments) || segments.length === 0) return '';
  return segments
    .map((seg, idx) => {
      const text = String(seg.text || '').replace(/<[^>]*>/g, '').trim();
      if (!text) return null;
      const startSec = Math.max(0, Number(seg.start) || 0);
      const endSec = Math.max(startSec + 0.3, Number(seg.end) || startSec + 1);
      return `${idx + 1}\n${formatWhisperSecondsToSrt(startSec)} --> ${formatWhisperSecondsToSrt(endSec)}\n${text}`;
    })
    .filter(Boolean)
    .join('\n\n') + '\n';
}

app.post('/api/transcribe', async (request, reply) => {
  try {
    const part = await request.file();
    if (!part) return jsonError(reply, 400, 'An audio file is required for transcription.');
    const buffer = await part.toBuffer();
    const language = String(part.fields?.language?.value || 'my').trim();
    const customGroqKey = String(request.headers['x-groq-api-key'] || '').trim();
    const activeGroqKey = customGroqKey || GROQ_API_KEY;

    if (activeGroqKey) {
      const form = new FormData();
      form.append('file', new Blob([buffer], { type: part.mimetype || 'audio/wav' }), part.filename || 'audio.wav');
      form.append('model', 'whisper-large-v3-turbo');
      form.append('response_format', 'verbose_json');
      form.append('temperature', '0.0');
      if (language) form.append('language', language);

      const groqRes = await fetch('https://api.groq.com/openai/v1/audio/transcriptions', {
        method: 'POST',
        headers: { Authorization: `Bearer ${activeGroqKey}` },
        body: form,
      });

      if (groqRes.ok) {
        const groqData = await groqRes.json();
        const srt = groqData.segments ? whisperSegmentsToSrt(groqData.segments) : (groqData.text ? `1\n00:00:00,000 --> 00:00:05,000\n${groqData.text.trim()}\n` : '');
        return reply.send({ ok: true, engine: 'groq-whisper-large-v3-turbo', srt, duration: groqData.duration, segments: groqData.segments });
      }
    }

    if (OPENAI_API_KEY) {
      const form = new FormData();
      form.append('file', new Blob([buffer], { type: part.mimetype || 'audio/wav' }), part.filename || 'audio.wav');
      form.append('model', 'whisper-1');
      form.append('response_format', 'verbose_json');
      if (language) form.append('language', language);

      const oaiRes = await fetch('https://api.openai.com/v1/audio/transcriptions', {
        method: 'POST',
        headers: { Authorization: `Bearer ${OPENAI_API_KEY}` },
        body: form,
      });

      if (oaiRes.ok) {
        const oaiData = await oaiRes.json();
        const srt = oaiData.segments ? whisperSegmentsToSrt(oaiData.segments) : '';
        return reply.send({ ok: true, engine: 'openai-whisper-1', srt, duration: oaiData.duration, segments: oaiData.segments });
      }
    }

    return jsonError(reply, 503, 'Whisper transcription provider is not configured. Please set GROQ_API_KEY on the server or in client settings.');
  } catch (err) {
    return jsonError(reply, 500, `Transcription failed: ${err.message}`);
  }
});

app.post('/api/media/upload', async (request, reply) => {
  const part = await request.file();
  if (!part) return jsonError(reply, 400, 'A media file is required.');
  const mime = String(part.mimetype || '').toLowerCase();
  const fname = part.filename || '';
  const genericMime = !mime || mime === 'application/octet-stream' || mime === 'application/ogg';
  const isVideo = allowedVideo.has(mime) || mime.startsWith('video/') || (genericMime && videoExtensions.test(fname));
  const isAudio = allowedAudio.has(mime) || mime.startsWith('audio/') || (genericMime && audioExtensions.test(fname));
  const isImage = allowedImage.has(mime) || (genericMime && imageExtensions.test(fname));
  if (!isVideo && !isAudio && !isImage) return jsonError(reply, 415, 'Unsupported media type.');
  const fileId = randomUUID();
  const filename = `${fileId}-${safeName(part.filename || 'media')}`;
  const destination = path.join(INPUT_DIR, filename);
  try {
    await pipeline(part.file, createWriteStream(destination));
  } catch (error) {
    await fs.rm(destination, { force: true });
    if (error?.code === 'ERR_STREAM_PREMATURE_CLOSE' || request.raw.aborted) {
      request.log.warn({ code: error?.code }, 'media upload interrupted by client');
      return jsonError(reply, 499, 'Media upload was interrupted. Please retry the upload.');
    }
    request.log.error(error, 'media upload failed');
    return jsonError(reply, 500, 'Media upload failed while saving the file.');
  }
  if (part.file.truncated) {
    await fs.rm(destination, { force: true });
    return jsonError(reply, 413, 'File exceeds the configured upload limit.');
  }
  const stat = await fs.stat(destination);
  const kind = isVideo ? 'video' : (isAudio ? 'audio' : 'image');
  return { fileId, filename, size: stat.size, mimeType: part.mimetype, kind };
});

app.post('/api/media/:fileId/extract-audio', async (request, reply) => {
  const { fileId } = request.params;
  const input = await findInput(fileId);
  if (!input) return jsonError(reply, 404, 'Input file not found.');

  const tempAudio = path.join(OUTPUT_DIR, `${fileId}-extracted.mp3`);
  try {
    // Ultra-fast audio extraction (16kHz mono, 48kbps MP3 - ideal for speech AI)
    await new Promise((resolve, reject) => {
      const child = spawn(process.env.FFMPEG_BIN || 'ffmpeg', [
        '-y',
        '-i', input,
        '-vn',
        '-ac', '1',
        '-ar', '16000',
        '-c:a', 'libmp3lame',
        '-b:a', '48k',
        tempAudio
      ], { stdio: ['ignore', 'ignore', 'pipe'] });

      let stderr = '';
      child.stderr.on('data', d => { stderr += d.toString(); });
      child.on('error', reject);
      child.on('close', code => code === 0 ? resolve() : reject(new Error(`FFmpeg audio extract failed (${code}): ${stderr.slice(-300)}`)));
    });

    const audioBuffer = await fs.readFile(tempAudio);
    const audioBase64 = audioBuffer.toString('base64');
    await fs.rm(tempAudio, { force: true }).catch(() => {});

    return {
      audioBase64,
      mimeType: 'audio/mp3',
      size: audioBuffer.length
    };
  } catch (err) {
    await fs.rm(tempAudio, { force: true }).catch(() => {});
    return jsonError(reply, 500, err.message || 'Audio extraction failed');
  }
});

const number = (value, fallback, min, max) => {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? Math.min(max, Math.max(min, parsed)) : fallback;
};

function validateSettings(raw = {}) {
  const aspectRatio = ['16:9', '9:16', '1:1', '4:5'].includes(raw.aspectRatio) ? raw.aspectRatio : '16:9';
  return {
    videoSpeed: number(raw.videoSpeed, 1, 0.25, 4),
    audioSpeed: number(raw.audioSpeed, 1, 0.25, 4),
    aspectRatio,
    blurEnabled: Boolean(raw.blurEnabled),
    blurPosition: number(raw.blurPosition, 80, 0, 100),
    blurThickness: number(raw.blurThickness, 15, 5, 50),
    blurIntensity: number(raw.blurIntensity, 25, 0, 50),
    subtitleEnabled: Boolean(raw.subtitleEnabled),
    subtitleText: typeof raw.subtitleText === 'string' ? raw.subtitleText.trim() : '',
    subtitleStyle: typeof raw.subtitleStyle === 'string' ? raw.subtitleStyle : 'font-akkhayar',
    subtitleOffset: number(raw.subtitleOffset, 0, -30, 30),
    logoFileId: typeof raw.logoFileId === 'string' ? raw.logoFileId.trim() : '',
    logoY: number(raw.logoY, 8, 0, 100),
    logoAlign: ['left', 'center', 'right'].includes(raw.logoAlign) ? raw.logoAlign : 'right',
    logoScale: number(raw.logoScale, 14, 4, 40),
    logoOpacity: number(raw.logoOpacity, 1.0, 0.1, 1.0),
  };
}

app.post('/api/sync/jobs', async (request, reply) => {
  const { fileId, audioFileId, logoFileId, settings } = request.body || {};
  if (!fileId) return jsonError(reply, 400, 'fileId is required.');
  const input = await findInput(fileId);
  if (!input) return jsonError(reply, 404, 'Input video was not found.');
  if (audioFileId && !(await findInput(audioFileId))) return jsonError(reply, 404, 'Audio file was not found.');

  const validatedSettings = validateSettings(settings);
  const effectiveLogoId = logoFileId || validatedSettings.logoFileId;

  const jobId = randomUUID();
  jobs.set(jobId, { jobId, status: 'queued', progress: 0, createdAt: Date.now() });
  processJob(jobId, fileId, audioFileId, validatedSettings, effectiveLogoId).catch((error) => {
    const job = jobs.get(jobId);
    if (job) Object.assign(job, { status: 'failed', error: error.message, finishedAt: Date.now() });
  });
  return reply.code(202).send({ jobId, status: 'queued' });
});

app.get('/api/jobs/:jobId', async (request, reply) => {
  const job = jobs.get(request.params.jobId);
  return job ? job : jsonError(reply, 404, 'Job was not found.');
});

app.get('/api/files/:fileId/download', async (request, reply) => {
  const file = await findOutput(request.params.fileId);
  if (!file) return jsonError(reply, 404, 'Output file was not found or expired.');
  return reply.type('video/mp4').send(createReadStream(file));
});

app.delete('/api/jobs/:jobId', async (request, reply) => {
  const job = jobs.get(request.params.jobId);
  if (!job) return jsonError(reply, 404, 'Job was not found.');
  job.cancelled = true;
  job.status = 'cancelled';
  return { ok: true };
});

async function findInput(fileId) {
  const entries = await fs.readdir(INPUT_DIR);
  const filename = entries.find((entry) => entry.startsWith(`${fileId}-`));
  return filename ? path.join(INPUT_DIR, filename) : null;
}
async function findOutput(fileId) {
  const candidate = path.join(OUTPUT_DIR, `${fileId}.mp4`);
  try { await fs.access(candidate); return candidate; } catch { return null; }
}

function runFfmpeg(args, onProgress) {
  return new Promise((resolve, reject) => {
    const child = spawn(process.env.FFMPEG_BIN || 'ffmpeg', ['-y', ...args], { stdio: ['ignore', 'ignore', 'pipe'] });
    let stderr = '';
    child.stderr.on('data', (chunk) => {
      stderr += chunk.toString();
      const match = stderr.match(/time=(\d+):(\d+):(\d+).(\d+)/g);
      if (match) onProgress(Math.min(95, 10 + match.length));
      if (stderr.length > 6000) stderr = stderr.slice(-6000);
    });
    child.on('error', reject);
    child.on('close', (code) => code === 0 ? resolve() : reject(new Error(`FFmpeg exited with code ${code}: ${stderr.slice(-500)}`)));
  });
}

async function processJob(jobId, fileId, audioFileId, settings, logoFileId) {
  const job = jobs.get(jobId);
  const input = await findInput(fileId);
  const audio = audioFileId ? await findInput(audioFileId) : null;
  const targetLogoId = logoFileId || settings.logoFileId;
  const logo = targetLogoId ? await findInput(targetLogoId) : null;
  const outputFileId = randomUUID();
  const output = path.join(OUTPUT_DIR, `${outputFileId}.mp4`);
  Object.assign(job, { status: 'processing', progress: 5 });

  const subSpeedMultiplier = audio ? settings.audioSpeed : settings.videoSpeed;

  let subFilePath = null;
  if (settings.subtitleEnabled && settings.subtitleText && settings.subtitleText.trim()) {
    const canvas = settings.aspectRatio === '9:16'
      ? { width: 1080, height: 1920 }
      : settings.aspectRatio === '1:1'
        ? { width: 1080, height: 1080 }
        : settings.aspectRatio === '4:5'
          ? { width: 1080, height: 1350 }
          : { width: 1920, height: 1080 };
    const assContent = generateAssSubtitle(canvas, settings, subSpeedMultiplier);
    if (assContent) {
      subFilePath = path.join(INPUT_DIR, `${jobId}-sub.ass`);
      await fs.writeFile(subFilePath, assContent, 'utf8');
    }
  }

  const args = ['-i', input];
  let audioInputIdx = -1;
  let logoInputIdx = -1;
  let currentIdx = 1;

  if (audio) {
    args.push('-i', audio);
    audioInputIdx = currentIdx++;
  }
  if (logo) {
    args.push('-i', logo);
    logoInputIdx = currentIdx++;
  }

  const filterComplex = buildFilterComplex(
    settings,
    subFilePath,
    Boolean(audio),
    settings.audioSpeed,
    settings.videoSpeed,
    Boolean(logo),
    logoInputIdx
  );

  args.push(
    '-filter_complex',
    filterComplex,
    '-map',
    '[vout]'
  );

  if (audio) {
    args.push('-map', '[aout]', '-shortest');
  } else if (settings.videoSpeed && settings.videoSpeed !== 1) {
    args.push('-map', '[aout]?');
  } else {
    args.push('-map', '0:a?');
  }

  args.push(
    '-c:v',
    'libx264',
    '-pix_fmt',
    'yuv420p',
    '-preset',
    'veryfast',
    '-crf',
    '23',
    '-c:a',
    'aac',
    '-b:a',
    '192k',
    '-movflags',
    '+faststart',
    output
  );

  try {
    await runFfmpeg(args, (progress) => { if (!job.cancelled) job.progress = progress; });
  } finally {
    if (subFilePath) await fs.rm(subFilePath, { force: true }).catch(() => {});
  }

  if (job.cancelled) { await fs.rm(output, { force: true }); return; }
  Object.assign(job, { status: 'completed', progress: 100, outputFileId, finishedAt: Date.now() });
}

function srtTimeToSeconds(srtTime) {
  if (!srtTime) return 0;
  const clean = srtTime.trim().replace(',', '.');
  const parts = clean.split(':');
  if (parts.length === 3) {
    const h = parseFloat(parts[0]) || 0;
    const m = parseFloat(parts[1]) || 0;
    const s = parseFloat(parts[2]) || 0;
    return h * 3600 + m * 60 + s;
  }
  if (parts.length === 2) {
    const m = parseFloat(parts[0]) || 0;
    const s = parseFloat(parts[1]) || 0;
    return m * 60 + s;
  }
  return parseFloat(clean) || 0;
}

function secondsToAssTime(seconds) {
  const safe = Math.max(0, seconds);
  const h = Math.floor(safe / 3600);
  const m = Math.floor((safe % 3600) / 60);
  const s = Math.floor(safe % 60);
  const cs = Math.floor((safe - Math.floor(safe)) * 100);
  const mStr = String(m).padStart(2, '0');
  const sStr = String(s).padStart(2, '0');
  const csStr = String(cs).padStart(2, '0');
  return `${h}:${mStr}:${sStr}.${csStr}`;
}

// Strictly format into at most 2 lines (never 3 lines)
function findBestBurmeseSplitPoint(text) {
  const mid = text.length / 2;

  // 1. If spaces exist, split at space closest to midpoint
  const spaces = [];
  for (let i = 0; i < text.length; i++) {
    if (text[i] === ' ') spaces.push(i);
  }
  if (spaces.length > 0) {
    let best = spaces[0];
    let minDiff = Math.abs(best - mid);
    for (const sp of spaces) {
      const diff = Math.abs(sp - mid);
      if (diff < minDiff) {
        minDiff = diff;
        best = sp;
      }
    }
    return best;
  }

  // 2. If Burmese punctuation marks exist (၊ or ။), split after punctuation closest to midpoint
  const puncts = [];
  for (let i = 0; i < text.length; i++) {
    if (text[i] === '၊' || text[i] === '။') puncts.push(i + 1);
  }
  if (puncts.length > 0) {
    let best = puncts[0];
    let minDiff = Math.abs(best - mid);
    for (const p of puncts) {
      const diff = Math.abs(p - mid);
      if (diff < minDiff) {
        minDiff = diff;
        best = p;
      }
    }
    return best;
  }

  // 3. Burmese syllable boundary: look for a consonant [\u1000-\u1021] NOT preceded by virama \u1039
  const syllableStarts = [];
  const minBound = Math.floor(text.length * 0.25);
  const maxBound = Math.floor(text.length * 0.75);
  for (let i = minBound; i <= maxBound; i++) {
    const code = text.charCodeAt(i);
    if (code >= 0x1000 && code <= 0x1021) {
      const prevCode = i > 0 ? text.charCodeAt(i - 1) : 0;
      if (prevCode !== 0x1039) {
        syllableStarts.push(i);
      }
    }
  }
  if (syllableStarts.length > 0) {
    let best = syllableStarts[0];
    let minDiff = Math.abs(best - mid);
    for (const s of syllableStarts) {
      const diff = Math.abs(s - mid);
      if (diff < minDiff) {
        minDiff = diff;
        best = s;
      }
    }
    return best;
  }

  return Math.floor(mid);
}

// Strictly format into at most 2 lines (never 3 lines, wider margins)
function wrapSubtitleText(text, maxCharsPerLine = 42) {
  if (!text) return '';
  const clean = text
    .replace(/\\N/gi, ' ')
    .replace(/[\r\n\t]+/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();

  if (clean.length <= maxCharsPerLine) return clean;

  const splitIdx = findBestBurmeseSplitPoint(clean);
  const line1 = clean.slice(0, splitIdx).trim();
  const line2 = clean.slice(splitIdx).trim();

  if (!line1) return line2;
  if (!line2) return line1;
  return `${line1}\\N${line2}`;
}

function parseSrtToAssEvents(srtText, marginV, speedMultiplier = 1, offsetSec = 0, canvas = { width: 1080, height: 1920 }) {
  const clean = srtText.replace(/^\uFEFF/, '').replace(/\r\n/g, '\n').replace(/\r/g, '\n').trim();
  const rawCues = [];
  const speed = Number.isFinite(speedMultiplier) && speedMultiplier > 0 ? speedMultiplier : 1;
  const offset = Number.isFinite(offsetSec) ? offsetSec : 0;

  const blocks = clean.split(/\n\s*\n/);
  for (const block of blocks) {
    const lines = block.trim().split('\n').map((l) => l.trim()).filter(Boolean);
    if (lines.length < 2) continue;

    const timeLineIdx = lines.findIndex((l) => l.includes('-->'));
    if (timeLineIdx === -1) continue;

    const timeParts = lines[timeLineIdx].split('-->');
    if (timeParts.length !== 2) continue;

    const rawStart = srtTimeToSeconds(timeParts[0]);
    const rawEnd = srtTimeToSeconds(timeParts[1]);

    const startSec = Math.max(0, (rawStart / speed) + offset);
    let endSec = Math.max(startSec + 0.25, (rawEnd / speed) + offset);

    const cueLines = lines.slice(timeLineIdx + 1);
    const cueText = cueLines
      .join(' ')
      .replace(/<[^>]*>/g, '')
      .replace(/[{}]/g, '')
      .trim();

    if (cueText) {
      if (endSec <= startSec) endSec = startSec + (2.5 / speed);
      const wrapped = wrapSubtitleText(cueText, 32);
      rawCues.push({ startSec, endSec, cueText: wrapped });
    }
  }

  if (rawCues.length === 0) return [];

  // Sort cues chronologically by start time
  rawCues.sort((a, b) => a.startSec - b.startSec);

  // CLAMP OVERLAPPING TIMESTAMPS: Prevents ASS vertical stacking collisions completely!
  for (let i = 0; i < rawCues.length - 1; i++) {
    const nextStart = rawCues[i + 1].startSec;
    if (rawCues[i].endSec > nextStart) {
      rawCues[i].endSec = Math.max(rawCues[i].startSec + 0.3, nextStart - 0.04);
    }
  }

  const isPortrait = canvas.height > canvas.width;
  const baseFontSize = isPortrait
    ? Math.max(48, Math.round(canvas.height * 0.028))
    : Math.max(54, Math.round(canvas.height * 0.052));
  const availableWidth = canvas.width * 0.95;

  const events = [];
  for (const cue of rawCues) {
    const start = secondsToAssTime(cue.startSec);
    const end = secondsToAssTime(cue.endSec);

    // Calculate maximum line length to dynamically scale font size
    const parts = cue.cueText.split('\\N');
    const maxLineLen = Math.max(...parts.map((p) => p.length));

    // Burmese letters average ~0.72 of font size in width
    const maxFitFontSize = Math.floor(availableWidth / Math.max(1, maxLineLen * 0.72));
    const cueFontSize = Math.max(42, Math.min(baseFontSize, maxFitFontSize));

    const formattedText = cueFontSize < baseFontSize
      ? `{\\fs${cueFontSize}}${cue.cueText}`
      : cue.cueText;

    events.push(`Dialogue: 0,${start},${end},Default,,0,0,${marginV},,${formattedText}`);
  }

  return events;
}

function generateAssSubtitle(canvas, settings, speedMultiplier = 1) {
  const text = (settings.subtitleText || '').trim();
  if (!text) return null;

  const isPortrait = canvas.height > canvas.width;
  const fontSize = isPortrait
    ? Math.max(48, Math.round(canvas.height * 0.028))
    : Math.max(54, Math.round(canvas.height * 0.052));

  const blurPos = Number.isFinite(settings.blurPosition) ? settings.blurPosition : 82;
  const stripCenterFromBottom = ((100 - blurPos) / 100) * canvas.height;

  // In ASS Alignment: 2 (Bottom-Center), MarginV is distance from bottom edge to bottom of text.
  // To center a 2-line text block (approx 2.4 * fontSize high) perfectly in the strip:
  // Subtract 0.72 * fontSize from the strip center.
  const marginV = settings.blurEnabled
    ? Math.max(10, Math.round(stripCenterFromBottom - (fontSize * 0.72)))
    : Math.round(isPortrait ? canvas.height * 0.08 : canvas.height * 0.10);

  const marginLR = isPortrait ? 18 : 24;

  let fontName = 'Akkhayar21';
  if (settings.subtitleStyle === 'font-kunheing' || settings.subtitleStyle === 'kunheing') {
    fontName = 'A J Kunheing E-T-M 01';
  } else if (settings.subtitleStyle === 'font-jojar' || settings.subtitleStyle === 'jojar') {
    fontName = 'Myanmar Jojar';
  } else if (settings.subtitleStyle === 'font-myanmaros' || settings.subtitleStyle === 'myanmaros') {
    fontName = 'Myanmar OS';
  } else {
    fontName = 'Akkhayar21';
  }

  // Style configurations in ASS format (&HAABBGGRR in hex) - Signature Yellow Highlight Recap Style
  let primaryColor = '&H0015CCFA'; // Yellow (#FACC15) in ASS &HAABBGGRR
  let outlineColor = '&H00000000'; // Black
  let backColor = '&H80000000';
  let borderStyle = 1; // 1 = outline + shadow
  let outlineWidth = 4.5;
  let shadowWidth = 0;
  let bold = 1;

  let dialogueEvents = [];
  if (text.includes('-->')) {
    dialogueEvents = parseSrtToAssEvents(text, marginV, speedMultiplier, settings.subtitleOffset || 0, canvas);
  }

  if (dialogueEvents.length === 0) {
    if (text.includes('-->') || /^\d+\s*$/m.test(text)) {
      return null;
    }
    const escapedText = wrapSubtitleText(text, 32);
    const parts = escapedText.split('\\N');
    const maxLineLen = Math.max(...parts.map((p) => p.length));
    const availableWidth = canvas.width * 0.88;
    const maxFitFontSize = Math.floor(availableWidth / Math.max(1, maxLineLen * 0.72));
    const cueFontSize = Math.max(22, Math.min(fontSize, maxFitFontSize));
    const formattedText = cueFontSize < fontSize ? `{\\fs${cueFontSize}}${escapedText}` : escapedText;

    dialogueEvents.push(`Dialogue: 0,0:00:00.00,5:00:00.00,Default,,0,0,${marginV},,${formattedText}`);
  }

  return `[Script Info]
Title: Burmese Recap Subtitle
ScriptType: v4.00+
PlayResX: ${canvas.width}
PlayResY: ${canvas.height}
WrapStyle: 2
ScaledBorderAndShadow: yes

[V4+ Styles]
Format: Name, Fontname, Fontsize, PrimaryColour, SecondaryColour, OutlineColour, BackColour, Bold, Italic, Underline, StrikeOut, ScaleX, ScaleY, Spacing, Angle, BorderStyle, Outline, Shadow, Alignment, MarginL, MarginR, MarginV, Encoding
Style: Default,${fontName},${fontSize},${primaryColor},&H000000FF,${outlineColor},${backColor},${bold},0,0,0,100,100,0,0,${borderStyle},${outlineWidth},${shadowWidth},2,${marginLR},${marginLR},${marginV},1

[Events]
Format: Layer, Start, End, Style, Name, MarginL, MarginR, MarginV, Effect, Text
${dialogueEvents.join('\n')}
`;
}

function buildFilterComplex(settings, assFilePath, hasAudio, audioSpeed, videoSpeed, hasLogo = false, logoInputIdx = -1) {
  const canvas = settings.aspectRatio === '9:16'
    ? { width: 1080, height: 1920 }
    : settings.aspectRatio === '1:1'
      ? { width: 1080, height: 1080 }
      : settings.aspectRatio === '4:5'
        ? { width: 1080, height: 1350 }
        : { width: 1920, height: 1080 };

  const vFilters = [];
  if (settings.videoSpeed && settings.videoSpeed !== 1) {
    vFilters.push(`setpts=${(1 / settings.videoSpeed).toFixed(4)}*PTS`);
  }
  vFilters.push(`scale=${canvas.width}:${canvas.height}:force_original_aspect_ratio=decrease`);
  vFilters.push(`pad=${canvas.width}:${canvas.height}:(ow-iw)/2:(oh-ih)/2:color=black`);

  let vChain = `[0:v]${vFilters.join(',')}`;

  // 1. True Frosted Glass Blur Band (natural video blur without opaque black block)
  if (settings.blurEnabled) {
    const rawThickness = Number(settings.blurThickness) || 16;
    const rawPos = Number(settings.blurPosition) || 82;
    const thickness = (rawThickness / 100).toFixed(4);
    const topValue = Math.max(0, Math.min(1 - Number(thickness), (rawPos - rawThickness / 2) / 100));
    const top = topValue.toFixed(4);
    const bottom = (topValue + Number(thickness)).toFixed(4);
    const lumaRad = Math.min(32, Math.max(10, Math.round((Number(settings.blurIntensity) || 35) * 0.75)));
    const chromaRad = Math.min(16, Math.max(5, Math.round(lumaRad * 0.5)));

    // Frosted glass overlay: blurred video band + subtle 12% tint + delicate glass edge borders
    vChain = `${vChain}[vscaled];` +
      `[vscaled]split=2[vbase][vblur];` +
      `[vblur]crop=w=iw:h=trunc(ih*${thickness}/2)*2:x=0:y=trunc(ih*${top}/2)*2,boxblur=luma_radius=${lumaRad}:luma_power=3:chroma_radius=${chromaRad}:chroma_power=3[blurBand];` +
      `[vbase][blurBand]overlay=x=0:y=trunc(main_h*${top}/2)*2,` +
      `drawbox=x=0:y=trunc(ih*${top}/2)*2:w=iw:h=trunc(ih*${thickness}/2)*2:color=black@0.12:t=fill,` +
      `drawbox=x=0:y=trunc(ih*${top}/2)*2:w=iw:h=2:color=white@0.22:t=fill,` +
      `drawbox=x=0:y=trunc(ih*${bottom}/2)*2-2:w=iw:h=2:color=white@0.22:t=fill`;
  }

  // 2. Burmese Akkhayar 21 ASS Subtitle Filter
  if (settings.subtitleEnabled && assFilePath) {
    const escapedAssPath = assFilePath.replace(/\\/g, '/').replace(/'/g, "'\\''");
    const escapedFontsDir = FONTS_DIR.replace(/\\/g, '/').replace(/'/g, "'\\''");
    vChain = `${vChain},ass='${escapedAssPath}':fontsdir='${escapedFontsDir}'`;
  }

  // 3. Logo Watermark Overlay Filter (with vertical Y slider, alignment, scaling and opacity)
  if (hasLogo && logoInputIdx > 0) {
    const scalePct = (Number(settings.logoScale) || 14) / 100;
    const targetW = Math.max(48, Math.round(canvas.width * scalePct));
    const opacity = Number(settings.logoOpacity) || 1.0;
    const align = settings.logoAlign || 'right';
    const yPct = (Number(settings.logoY) || 8) / 100;
    const pad = Math.round(canvas.width * 0.02);
    const edgeX = Math.round(canvas.width * 0.05); // horizontal margin for left/right logos (5% in from edge)

    let xExpr = `main_w-overlay_w-${edgeX}`;
    if (align === 'left') xExpr = `${edgeX}`;
    if (align === 'center') xExpr = `(main_w-overlay_w)/2`;

    const yExpr = `${pad}+((main_h-overlay_h-${pad * 2})*${yPct.toFixed(4)})`;

    vChain = `${vChain}[vsubbed];` +
      `[${logoInputIdx}:v]scale=${targetW}:-2,format=rgba,colorchannelmixer=aa=${opacity.toFixed(2)}[vlogo];` +
      `[vsubbed][vlogo]overlay=x='${xExpr}':y='${yExpr}'`;
  }

  vChain = `${vChain}[vout]`;

  const filterParts = [vChain];
  if (hasAudio) {
    const aFilter = buildAudioFilter(audioSpeed || 1);
    filterParts.push(`[1:a]${aFilter}[aout]`);
  } else if (videoSpeed && videoSpeed !== 1) {
    const aFilter = buildAudioFilter(videoSpeed || 1);
    filterParts.push(`[0:a]${aFilter}[aout]`);
  }

  return filterParts.join(';');
}

function buildAudioFilter(speed) {
  if (speed === 1) return 'anull';
  const filters = [];
  let remaining = speed;
  while (remaining < 0.5) { filters.push('atempo=0.5'); remaining /= 0.5; }
  while (remaining > 2) { filters.push('atempo=2'); remaining /= 2; }
  filters.push(`atempo=${remaining.toFixed(4)}`);
  return filters.join(',');
}

setInterval(async () => {
  const expiry = Date.now() - JOB_TTL_MS;
  for (const [jobId, job] of jobs) {
    if (job.finishedAt && job.finishedAt < expiry) {
      if (job.outputFileId) await fs.rm(path.join(OUTPUT_DIR, `${job.outputFileId}.mp4`), { force: true });
      jobs.delete(jobId);
    }
  }
}, 15 * 60 * 1000).unref();

await app.listen({ port: PORT, host: HOST });
