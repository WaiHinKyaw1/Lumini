/**
 * SRT generation (Gemini)
 *
 * 1. Decode audio/video in the browser -> 16 kHz mono PCM
 * 2. Cut into ~60s chunks at the quietest point (never mid-word)
 * 3. Transcribe chunks in parallel with Gemini structured JSON output
 * 4. Offset, clean up and assemble one SRT
 *
 * A 10-minute file is ~10 requests instead of hundreds of tiny ones.
 */

import { Type } from '@google/genai';
import { getAIClient, CANDIDATE_FLASH_MODELS } from './geminiService';

const SAMPLE_RATE = 16000;
const CHUNK_MIN_SEC = 40;
const CHUNK_MAX_SEC = 75;
const CONCURRENCY = 4;
const REQUEST_TIMEOUT_MS = 90_000;
const MAX_ROUNDS = 3;
export const MAX_FILE_BYTES = 100 * 1024 * 1024;

export const SRT_LANGUAGES = [
  { value: 'BURMESE', label: 'မြန်မာ', prompt: 'Burmese (Myanmar Unicode script)' },
  { value: 'ENGLISH', label: 'English', prompt: 'English' },
  { value: 'THAI', label: 'ไทย', prompt: 'Thai' },
  { value: 'CHINESE', label: '中文', prompt: 'Simplified Chinese' },
  { value: 'JAPANESE', label: '日本語', prompt: 'Japanese' },
  { value: 'KOREAN', label: '한국어', prompt: 'Korean' },
] as const;

export type SrtLanguage = typeof SRT_LANGUAGES[number]['value'];

export interface SrtCue {
  start: number; // seconds
  end: number;   // seconds
  text: string;
}

export interface SrtProgress {
  percent: number;
  message: string;
  srt: string;
}

export interface SrtResult {
  srt: string;
  cueCount: number;
  failedChunks: number;
}

// ───────────────────────── Time helpers ─────────────────────────

export function formatSrtTime(sec: number): string {
  const ms = Math.max(0, Math.round(sec * 1000));
  const h = Math.floor(ms / 3_600_000);
  const m = Math.floor((ms % 3_600_000) / 60_000);
  const s = Math.floor((ms % 60_000) / 1000);
  const r = ms % 1000;
  const p = (n: number, l = 2) => String(n).padStart(l, '0');
  return `${p(h)}:${p(m)}:${p(s)},${p(r, 3)}`;
}

/** Accepts 12.5, "12.5", "00:12.500", "00:00:12,500". */
function parseTime(value: unknown): number {
  if (typeof value === 'number') return value;
  const str = String(value ?? '').trim().replace(',', '.');
  if (!str) return NaN;
  const parts = str.split(':').map(Number);
  if (parts.some(Number.isNaN)) return NaN;
  return parts.reduce((acc, n) => acc * 60 + n, 0);
}

export function cuesToSrt(cues: SrtCue[]): string {
  if (cues.length === 0) return '';
  return cues
    .map((c, i) => `${i + 1}\n${formatSrtTime(c.start)} --> ${formatSrtTime(c.end)}\n${c.text}`)
    .join('\n\n') + '\n';
}

// ───────────────────────── Text helpers ─────────────────────────

const isMyanmarMark = (code: number) => code >= 0x102b && code <= 0x103e;

/** Split a long line into two balanced lines at a safe boundary. */
function wrapTwoLines(raw: string, maxChars: number): string {
  const text = raw.replace(/\s+/g, ' ').trim();
  if (text.length <= maxChars) return text;

  const mid = Math.floor(text.length / 2);
  const radius = Math.floor(text.length / 3);
  let best = -1;

  // Prefer spaces / punctuation near the middle
  for (let d = 0; d <= radius && best === -1; d++) {
    for (const i of [mid - d, mid + d]) {
      if (i > 0 && i < text.length && /[\s၊။,.!?，。]/.test(text[i])) { best = i + 1; break; }
    }
  }
  // Otherwise a syllable boundary (not before a combining mark / after virama)
  for (let d = 0; d <= radius && best === -1; d++) {
    for (const i of [mid - d, mid + d]) {
      if (i > 1 && i < text.length && !isMyanmarMark(text.charCodeAt(i)) && text.charCodeAt(i - 1) !== 0x1039) {
        best = i; break;
      }
    }
  }
  if (best === -1) best = mid;
  return `${text.slice(0, best).trim()}\n${text.slice(best).trim()}`;
}

// ───────────────────────── Audio ─────────────────────────

async function decodeToMono16k(file: File): Promise<Float32Array> {
  const ctx = new AudioContext();
  try {
    const decoded = await ctx.decodeAudioData(await file.arrayBuffer());
    const length = Math.max(1, Math.ceil(decoded.duration * SAMPLE_RATE));
    const offline = new OfflineAudioContext(1, length, SAMPLE_RATE);
    const src = offline.createBufferSource();
    src.buffer = decoded;
    src.connect(offline.destination);
    src.start();
    return (await offline.startRendering()).getChannelData(0);
  } catch {
    throw new Error('ဖိုင်ထဲက အသံကို ဖတ်မရပါ။ MP3 / WAV / M4A / MP4 ဖိုင် သုံးပါ။');
  } finally {
    ctx.close().catch(() => {});
  }
}

/** Returns chunk boundaries (in samples), cutting at the quietest 300ms window. */
function findChunkBoundaries(pcm: Float32Array): number[] {
  const frame = SAMPLE_RATE / 20; // 50ms
  const frames = Math.floor(pcm.length / frame);
  const energy = new Float32Array(frames);
  for (let f = 0; f < frames; f++) {
    let sum = 0;
    for (let i = f * frame, end = i + frame; i < end; i++) sum += pcm[i] * pcm[i];
    energy[f] = sum;
  }

  const bounds = [0];
  const minF = CHUNK_MIN_SEC * 20;
  const maxF = CHUNK_MAX_SEC * 20;
  let pos = 0;

  while (frames - pos > maxF) {
    let bestFrame = pos + maxF;
    let bestEnergy = Infinity;
    for (let f = pos + minF; f <= pos + maxF - 6; f++) {
      const e = energy[f] + energy[f + 1] + energy[f + 2] + energy[f + 3] + energy[f + 4] + energy[f + 5];
      if (e < bestEnergy) { bestEnergy = e; bestFrame = f + 3; }
    }
    bounds.push(bestFrame * frame);
    pos = bestFrame;
  }
  bounds.push(pcm.length);
  return bounds;
}

function pcmToWavBase64(pcm: Float32Array): string {
  const buffer = new ArrayBuffer(44 + pcm.length * 2);
  const v = new DataView(buffer);
  const str = (o: number, s: string) => { for (let i = 0; i < s.length; i++) v.setUint8(o + i, s.charCodeAt(i)); };
  str(0, 'RIFF'); v.setUint32(4, 36 + pcm.length * 2, true); str(8, 'WAVE');
  str(12, 'fmt '); v.setUint32(16, 16, true); v.setUint16(20, 1, true); v.setUint16(22, 1, true);
  v.setUint32(24, SAMPLE_RATE, true); v.setUint32(28, SAMPLE_RATE * 2, true);
  v.setUint16(32, 2, true); v.setUint16(34, 16, true);
  str(36, 'data'); v.setUint32(40, pcm.length * 2, true);
  for (let i = 0, o = 44; i < pcm.length; i++, o += 2) {
    const s = Math.max(-1, Math.min(1, pcm[i]));
    v.setInt16(o, s < 0 ? s * 0x8000 : s * 0x7fff, true);
  }
  const bytes = new Uint8Array(buffer);
  let bin = '';
  for (let i = 0; i < bytes.length; i += 0x8000) {
    bin += String.fromCharCode.apply(null, bytes.subarray(i, i + 0x8000) as unknown as number[]);
  }
  return btoa(bin);
}

// ───────────────────────── Gemini ─────────────────────────

let preferredModel: string | null = null;
const unavailableModels = new Set<string>();

const RESPONSE_SCHEMA = {
  type: Type.ARRAY,
  items: {
    type: Type.OBJECT,
    properties: {
      start: { type: Type.STRING, description: 'MM:SS.mmm from the start of this clip' },
      end: { type: Type.STRING, description: 'MM:SS.mmm from the start of this clip' },
      text: { type: Type.STRING },
    },
    required: ['start', 'end', 'text'],
    propertyOrdering: ['start', 'end', 'text'],
  },
};

function buildInstruction(languagePrompt: string, maxChars: number): string {
  return `You are a professional subtitle editor.
Create subtitles for the audio clip in ${languagePrompt}.
- If the speech is in a different language, translate it naturally into ${languagePrompt}.
- Timestamps are relative to the start of THIS clip, format MM:SS.mmm, and must match when each phrase is actually spoken.
- One cue per short phrase: 1 to 6 seconds, at most ${maxChars * 2} characters.
- Cues are in chronological order and never overlap.
- Ignore music, noise and silence. If there is no speech, return [].
- Text only: no speaker names, sound descriptions, quotes or notes.`;
}

const errorText = (err: unknown) => String((err as { message?: string })?.message ?? err);

async function transcribeChunk(
  base64: string,
  instruction: string,
  signal?: AbortSignal,
): Promise<{ start: unknown; end: unknown; text: unknown }[]> {
  const ai = getAIClient();
  let lastError: unknown = null;

  for (let round = 0; round < MAX_ROUNDS; round++) {
    const models = [
      ...(preferredModel ? [preferredModel] : []),
      ...CANDIDATE_FLASH_MODELS.filter(m => m !== preferredModel && !unavailableModels.has(m)),
    ];

    for (const model of models) {
      if (signal?.aborted) throw new DOMException('Cancelled', 'AbortError');

      const timeout = new AbortController();
      const timer = setTimeout(() => timeout.abort(), REQUEST_TIMEOUT_MS);
      const onAbort = () => timeout.abort();
      signal?.addEventListener('abort', onAbort, { once: true });

      try {
        const response = await ai.models.generateContent({
          model,
          contents: [{
            role: 'user',
            parts: [
              { inlineData: { data: base64, mimeType: 'audio/wav' } },
              { text: 'Generate the subtitles for this clip.' },
            ],
          }],
          config: {
            systemInstruction: instruction,
            temperature: 0.2,
            responseMimeType: 'application/json',
            responseSchema: RESPONSE_SCHEMA,
            abortSignal: timeout.signal,
          },
        });
        const parsed = JSON.parse(response.text || '[]');
        if (!Array.isArray(parsed)) throw new Error('Invalid response format');
        preferredModel = model;
        return parsed;
      } catch (err) {
        if (signal?.aborted) throw new DOMException('Cancelled', 'AbortError');
        lastError = timeout.signal.aborted ? new Error('Gemini request timed out') : err;
        const msg = errorText(err);

        if (/\b404\b|not[ _]found|not supported|does not exist/i.test(msg)) {
          unavailableModels.add(model);
          if (preferredModel === model) preferredModel = null;
        } else if (/\b(401|403)\b|api key|permission|unauthenticated/i.test(msg)) {
          unavailableModels.add(model);
          if (preferredModel === model) preferredModel = null;
        } else if (/\b(429|500|503)\b|resource_exhausted|quota|overloaded|unavailable/i.test(msg)) {
          await new Promise(r => setTimeout(r, 1000 * (round + 1)));
        }
      } finally {
        clearTimeout(timer);
        signal?.removeEventListener('abort', onAbort);
      }
    }
  }

  const finalMsg = errorText(lastError);
  if (/\b(401|403)\b|api key|permission|unauthenticated/i.test(finalMsg)) {
    throw new Error('Gemini API key မှားနေပါသည် (သို့) ခွင့်ပြုချက် မရှိပါ။');
  }
  throw lastError ?? new Error('Gemini model တစ်ခုမှ အသုံးပြု၍ မရပါ။');
}

// ───────────────────────── Main ─────────────────────────

export async function generateSrt(
  file: File,
  language: SrtLanguage,
  options: { onProgress?: (p: SrtProgress) => void; signal?: AbortSignal } = {},
): Promise<SrtResult> {
  const { onProgress, signal } = options;
  const lang = SRT_LANGUAGES.find(l => l.value === language) ?? SRT_LANGUAGES[0];
  const maxChars = language === 'ENGLISH' ? 42 : language === 'BURMESE' ? 35 : 20;

  if (file.size > MAX_FILE_BYTES) throw new Error('ဖိုင်ဆိုဒ် 100MB ထက် မကျော်ရပါ။');

  onProgress?.({ percent: 5, message: 'အသံ ဖတ်နေပါသည်...', srt: '' });
  const pcm = await decodeToMono16k(file);
  if (signal?.aborted) throw new DOMException('Cancelled', 'AbortError');

  const bounds = findChunkBoundaries(pcm);
  const total = bounds.length - 1;
  const instruction = buildInstruction(lang.prompt, maxChars);
  const chunkCues: SrtCue[][] = Array.from({ length: total }, () => []);
  let done = 0;
  let failed = 0;
  let firstError: unknown = null;

  const assemble = (): SrtCue[] => {
    const all = chunkCues.flat().map(c => ({ ...c })).sort((a, b) => a.start - b.start);
    for (let i = 0; i < all.length - 1; i++) {
      if (all[i].end > all[i + 1].start - 0.04) {
        all[i].end = Math.max(all[i].start + 0.3, all[i + 1].start - 0.04);
      }
    }
    return all;
  };

  const report = () => onProgress?.({
    percent: Math.round(10 + (done / total) * 88),
    message: `စာတန်း ထုတ်နေပါသည်... (${done}/${total})`,
    srt: cuesToSrt(assemble()),
  });

  report();

  const runChunk = async (idx: number) => {
    const startSample = bounds[idx];
    const endSample = bounds[idx + 1];
    const offset = startSample / SAMPLE_RATE;
    const clipEnd = endSample / SAMPLE_RATE;

    try {
      const raw = await transcribeChunk(pcmToWavBase64(pcm.subarray(startSample, endSample)), instruction, signal);
      chunkCues[idx] = raw
        .map(r => {
          const text = String(r.text ?? '').trim();
          let start = parseTime(r.start) + offset;
          let end = parseTime(r.end) + offset;
          if (!text || !Number.isFinite(start)) return null;
          if (!Number.isFinite(end) || end <= start) end = start + 2;
          start = Math.min(Math.max(start, offset), clipEnd);
          end = Math.min(Math.max(end, start + 0.5), clipEnd + 0.5);
          return { start, end, text: wrapTwoLines(text, maxChars) };
        })
        .filter((c): c is SrtCue => c !== null);
    } catch (err) {
      if ((err as Error)?.name === 'AbortError') throw err;
      failed++;
      firstError ??= err;
      console.warn(`SRT chunk ${idx + 1}/${total} failed:`, err);
    } finally {
      done++;
      report();
    }
  };

  let next = 0;
  await Promise.all(
    Array.from({ length: Math.min(CONCURRENCY, total) }, async () => {
      while (next < total) await runChunk(next++);
    }),
  );

  if (failed === total) {
    throw new Error(`စာတန်း ထုတ်၍ မရပါ: ${errorText(firstError)}`);
  }

  const cues = assemble();
  const srt = cuesToSrt(cues);
  onProgress?.({ percent: 100, message: `ပြီးပါပြီ — စာတန်း ${cues.length} ခု`, srt });
  return { srt, cueCount: cues.length, failedChunks: failed };
}

export function downloadSrt(content: string, fileName: string): void {
  const name = `${fileName.replace(/\.[^.]+$/, '')}.srt`;
  // UTF-8 BOM so media players render Burmese correctly
  const url = URL.createObjectURL(new Blob(['\uFEFF' + content], { type: 'text/plain;charset=utf-8' }));
  const a = document.createElement('a');
  a.href = url;
  a.download = name;
  a.click();
  URL.revokeObjectURL(url);
}
