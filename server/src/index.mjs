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
const MAX_UPLOAD_BYTES = Number(process.env.MAX_UPLOAD_BYTES || 1024 * 1024 * 1024);
const JOB_TTL_MS = Number(process.env.JOB_TTL_MS || 2 * 60 * 60 * 1000);
const ELEVENLABS_API_KEY = process.env.ELEVENLABS_API_KEY || '';
const ELEVENLABS_MODEL = process.env.ELEVENLABS_MODEL || 'eleven_multilingual_v2';
const MAX_CLONE_TEXT_CHARS = Number(process.env.MAX_CLONE_TEXT_CHARS || 15000);
const jobs = new Map();
const allowedVideo = new Set(['video/mp4', 'video/webm', 'video/quicktime', 'video/x-matroska']);
const allowedAudio = new Set(['audio/mpeg', 'audio/wav', 'audio/x-wav', 'audio/mp4', 'audio/webm', 'audio/ogg']);
const videoExtensions = /\.(mp4|webm|mov|mkv)$/i;
const audioExtensions = /\.(mp3|wav|m4a|webm|ogg)$/i;

const app = Fastify({ logger: true, bodyLimit: MAX_UPLOAD_BYTES });
await app.register(cors, { origin: process.env.CORS_ORIGIN || true });
await app.register(multipart, { limits: { fileSize: MAX_UPLOAD_BYTES, files: 1 } });
await fs.mkdir(INPUT_DIR, { recursive: true });
await fs.mkdir(OUTPUT_DIR, { recursive: true });

const jsonError = (reply, status, message) => reply.code(status).send({ error: message });
const safeName = (name) => path.basename(name).replace(/[^a-zA-Z0-9._-]/g, '_');

app.get('/health', async () => ({ ok: true, service: 'lumini-media-worker' }));

app.get('/api/voice-clones/status', async () => ({ configured: Boolean(ELEVENLABS_API_KEY) }));

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
  const provider = await fetch(`https://api.elevenlabs.io/v1/text-to-speech/${encodeURIComponent(request.params.voiceId)}`, {
    method: 'POST',
    headers: { 'xi-api-key': ELEVENLABS_API_KEY, 'Content-Type': 'application/json', Accept: 'audio/mpeg' },
    body: JSON.stringify({ text, model_id: ELEVENLABS_MODEL, voice_settings: { stability: 0.45, similarity_boost: 0.8, style: 0.2 } }),
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

app.post('/api/media/upload', async (request, reply) => {
  const part = await request.file();
  if (!part) return jsonError(reply, 400, 'A media file is required.');
  const isVideo = allowedVideo.has(part.mimetype) || (part.mimetype === 'application/octet-stream' && videoExtensions.test(part.filename || ''));
  const isAudio = allowedAudio.has(part.mimetype) || (part.mimetype === 'application/octet-stream' && audioExtensions.test(part.filename || ''));
  if (!isVideo && !isAudio) return jsonError(reply, 415, 'Unsupported media type.');
  const fileId = randomUUID();
  const filename = `${fileId}-${safeName(part.filename || 'media')}`;
  const destination = path.join(INPUT_DIR, filename);
  await pipeline(part.file, createWriteStream(destination));
  if (part.file.truncated) {
    await fs.rm(destination, { force: true });
    return jsonError(reply, 413, 'File exceeds the configured upload limit.');
  }
  const stat = await fs.stat(destination);
  return { fileId, filename, size: stat.size, mimeType: part.mimetype, kind: isVideo ? 'video' : 'audio' };
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
    blurIntensity: number(raw.blurIntensity, 20, 0, 50),
  };
}

app.post('/api/sync/jobs', async (request, reply) => {
  const { fileId, audioFileId, settings } = request.body || {};
  if (!fileId) return jsonError(reply, 400, 'fileId is required.');
  const input = await findInput(fileId);
  if (!input) return jsonError(reply, 404, 'Input video was not found.');
  if (audioFileId && !(await findInput(audioFileId))) return jsonError(reply, 404, 'Audio file was not found.');
  const jobId = randomUUID();
  jobs.set(jobId, { jobId, status: 'queued', progress: 0, createdAt: Date.now() });
  processJob(jobId, fileId, audioFileId, validateSettings(settings)).catch((error) => {
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

async function processJob(jobId, fileId, audioFileId, settings) {
  const job = jobs.get(jobId);
  const input = await findInput(fileId);
  const audio = audioFileId ? await findInput(audioFileId) : null;
  const outputFileId = randomUUID();
  const output = path.join(OUTPUT_DIR, `${outputFileId}.mp4`);
  Object.assign(job, { status: 'processing', progress: 5 });
  const args = ['-i', input];
  if (audio) args.push('-i', audio);
  if (audio) {
    args.push('-filter_complex', `[1:a]${buildAudioFilter(settings.audioSpeed)}[syncaudio]`, '-map', '0:v:0', '-map', '[syncaudio]', '-shortest');
  }
  args.push('-vf', buildVideoFilter(settings), '-c:v', 'libx264', '-preset', 'veryfast', '-crf', '23', ...(audio ? [] : ['-an']), '-c:a', 'aac', '-movflags', '+faststart', output);
  await runFfmpeg(args, (progress) => { if (!job.cancelled) job.progress = progress; });
  if (job.cancelled) { await fs.rm(output, { force: true }); return; }
  Object.assign(job, { status: 'completed', progress: 100, outputFileId, finishedAt: Date.now() });
}

function buildVideoFilter(settings) {
  const canvas = settings.aspectRatio === '9:16'
    ? { width: 1080, height: 1920 }
    : settings.aspectRatio === '1:1'
      ? { width: 1080, height: 1080 }
      : settings.aspectRatio === '4:5'
        ? { width: 1080, height: 1350 }
        : { width: 1920, height: 1080 };
  const filters = [
    `scale=${canvas.width}:${canvas.height}:force_original_aspect_ratio=decrease`,
    `pad=${canvas.width}:${canvas.height}:(ow-iw)/2:(oh-ih)/2:color=black`,
  ];
  if (settings.videoSpeed !== 1) filters.push(`setpts=${(1 / settings.videoSpeed).toFixed(4)}*PTS`);
  const base = filters.join(',');
  if (!settings.blurEnabled) return base;

  const thickness = (settings.blurThickness / 100).toFixed(4);
  const topValue = Math.max(0, Math.min(1 - Number(thickness), (settings.blurPosition - settings.blurThickness / 2) / 100));
  const top = topValue.toFixed(4);
  const radius = Math.max(1, Math.round(settings.blurIntensity / 5));
  return `${base},split=2[base][blurSource];[blurSource]crop=iw:ih*${thickness}:0:ih*${top},boxblur=luma_radius=${radius}:luma_power=1[blurBand];[base][blurBand]overlay=0:main_h*${top},drawbox=x=0:y=ih*${top}:w=iw:h=ih*${thickness}:color=black@0.4:t=fill`;
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
