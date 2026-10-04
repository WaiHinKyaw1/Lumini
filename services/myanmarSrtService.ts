/**
 * Myanmar Intelligent SRT Generation Service (6-Step Flow)
 * ========================================================
 * 1. File Input (Audio/Video up to 10MB recommended)
 * 2. In-Browser Audio Extraction & Resampling to 16,000 Hz Mono (Zero server upload for step 2)
 * 3. Browser-Side Voice Activity & Silence Detection (0.01s frame, 0.25s silence split, 4.0s max split at quietest point, merge short, non-overlapping gap)
 * 4. Gemini AI Segment Transcription (3 concurrent workers, 3x auto-retry on rate limit, live "စာတန်း X / Y ပြီးပါပြီ" progress)
 * 5. SRT Composition & Myanmar 2-Line Smart Splitting (avoids syllable break)
 * 6. Real-time Result Preview & .my.srt Download with UTF-8 BOM + Clipboard Copy
 */

import { getAIClient, CANDIDATE_FLASH_MODELS } from './geminiService';

export interface SrtCueItem {
  index: number;
  start: string;
  end: string;
  text: string;
  startSec?: number;
  endSec?: number;
}

export interface MyanmarSpeechSegment {
  index: number;
  startSec: number;
  endSec: number;
  samples: Float32Array;
  text?: string;
  status: 'pending' | 'processing' | 'completed' | 'failed';
  error?: string;
}

export interface MyanmarSrtProgress {
  step: 1 | 2 | 3 | 4 | 5 | 6;
  message: string;
  completedCount: number;
  totalCount: number;
  percent: number;
  currentCues: SrtCueItem[];
  rawSrtText: string;
}

/**
 * Format total seconds into standard SRT timestamp: HH:MM:SS,mmm
 */
export function formatSrtTime(totalSeconds: number): string {
  const safe = Math.max(0, totalSeconds);
  const hrs = Math.floor(safe / 3600);
  const mins = Math.floor((safe % 3600) / 60);
  const secs = Math.floor(safe % 60);
  const ms = Math.floor((safe % 1) * 1000);
  return `${hrs.toString().padStart(2, '0')}:${mins.toString().padStart(2, '0')}:${secs.toString().padStart(2, '0')},${ms.toString().padStart(3, '0')}`;
}

/**
 * Splits Myanmar subtitle text into at most 2 lines, splitting near the center.
 * Respects Myanmar phonetics and syllable clusters: never breaks inside combining marks,
 * virama, or asat.
 */
export function splitMyanmarTextIntoTwoLines(rawText: string, maxCharsPerLine = 34): string {
  const text = (rawText || '').replace(/\r\n/g, ' ').replace(/\n+/g, ' ').trim();
  if (!text) return '';
  if (text.length <= maxCharsPerLine) return text;

  const mid = Math.floor(text.length / 2);
  const searchRadius = Math.min(18, Math.floor(text.length / 3));

  // 1. Try finding natural delimiters (spaces, commas, Burmese punctuation ၊ and ။)
  let bestSplit = -1;
  let minDistance = Infinity;

  for (let i = mid - searchRadius; i <= mid + searchRadius; i++) {
    if (i <= 0 || i >= text.length) continue;
    const char = text[i];
    if (char === ' ' || char === '၊' || char === '။' || char === ',' || char === '?' || char === '!') {
      const dist = Math.abs(i - mid);
      if (dist < minDistance) {
        minDistance = dist;
        bestSplit = char === ' ' ? i : i + 1; // split after punctuation, or at space
      }
    }
  }

  // 2. If no punctuation near center, find a valid Burmese consonant/syllable boundary
  if (bestSplit === -1) {
    const isCombiningMark = (code: number) => {
      // Burmese combining vowel signs, medials, tones, asat, virama
      return (code >= 0x102b && code <= 0x103e) || code === 0x1037 || code === 0x1038 || code === 0x1039 || code === 0x103a;
    };

    for (let i = mid - searchRadius; i <= mid + searchRadius; i++) {
      if (i <= 1 || i >= text.length) continue;
      const code = text.charCodeAt(i);
      const prevCode = text.charCodeAt(i - 1);

      // Safe split: current char is NOT a combining mark, and previous char is NOT virama (\u1039)
      if (!isCombiningMark(code) && prevCode !== 0x1039) {
        const dist = Math.abs(i - mid);
        if (dist < minDistance) {
          minDistance = dist;
          bestSplit = i;
        }
      }
    }
  }

  // Fallback to midpoint if no clean boundary found
  if (bestSplit === -1) {
    bestSplit = mid;
  }

  const line1 = text.slice(0, bestSplit).trim();
  const line2 = text.slice(bestSplit).trim();
  return `${line1}\n${line2}`;
}

/**
 * Encodes Float32Array PCM audio into a standard 16-bit Mono WAV Blob and Base64 string
 */
export function encodeMonoWav(samples: Float32Array, sampleRate = 16000): { blob: Blob; base64: string } {
  const numSamples = samples.length;
  const buffer = new ArrayBuffer(44 + numSamples * 2);
  const view = new DataView(buffer);

  const writeString = (offset: number, str: string) => {
    for (let i = 0; i < str.length; i++) {
      view.setUint8(offset + i, str.charCodeAt(i));
    }
  };

  // RIFF header
  writeString(0, 'RIFF');
  view.setUint32(4, 36 + numSamples * 2, true);
  writeString(8, 'WAVE');

  // fmt subchunk
  writeString(12, 'fmt ');
  view.setUint32(16, 16, true); // 16 for PCM
  view.setUint16(20, 1, true); // Linear quantization (PCM)
  view.setUint16(22, 1, true); // Mono (1 channel)
  view.setUint32(24, sampleRate, true); // Sample rate
  view.setUint32(28, sampleRate * 2, true); // Byte rate (16000 * 1 * 2)
  view.setUint16(32, 2, true); // Block align (1 * 16/8)
  view.setUint16(34, 16, true); // Bits per sample (16-bit)

  // data subchunk
  writeString(36, 'data');
  view.setUint32(40, numSamples * 2, true);

  // PCM data conversion
  let offset = 44;
  for (let i = 0; i < numSamples; i++) {
    const s = Math.max(-1, Math.min(1, samples[i]));
    view.setInt16(offset, s < 0 ? s * 0x8000 : s * 0x7fff, true);
    offset += 2;
  }

  const blob = new Blob([buffer], { type: 'audio/wav' });

  // Convert buffer to Base64 in safe chunks
  const uint8 = new Uint8Array(buffer);
  let binary = '';
  const chunkSize = 0x8000;
  for (let i = 0; i < uint8.length; i += chunkSize) {
    binary += String.fromCharCode.apply(null, uint8.subarray(i, i + chunkSize) as unknown as number[]);
  }
  const base64 = btoa(binary);

  return { blob, base64 };
}

/**
 * Step 2: Read audio/video in the browser, decode and resample to 16,000 Hz Mono.
 * No server upload needed!
 */
export async function extractMonoAudioInBrowser(
  mediaFile: File,
  targetSampleRate = 16000
): Promise<{ channelData: Float32Array; duration: number; sampleRate: number }> {
  const AudioCtx = window.AudioContext || (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext || AudioContext;
  const audioCtx = new AudioCtx();

  try {
    const arrayBuffer = await mediaFile.arrayBuffer();
    const decodedBuffer = await audioCtx.decodeAudioData(arrayBuffer);
    const duration = decodedBuffer.duration;
    const totalRenderSamples = Math.max(1, Math.ceil(duration * targetSampleRate));

    const offlineCtx = new OfflineAudioContext(1, totalRenderSamples, targetSampleRate);
    const source = offlineCtx.createBufferSource();
    source.buffer = decodedBuffer;
    source.connect(offlineCtx.destination);
    source.start(0);

    const rendered = await offlineCtx.startRendering();
    const channelData = rendered.getChannelData(0);
    return { channelData, duration, sampleRate: targetSampleRate };
  } finally {
    if (audioCtx.state !== 'closed') {
      audioCtx.close().catch(() => {});
    }
  }
}

/**
 * Step 3: Silence & Speech Segmentation Algorithm
 * - 0.01s (10ms) analysis window
 * - 0.25s silence marks a speech break ("စကားရပ်တယ်")
 * - Maximum speech segment duration is 4.0s; if continuous, split at the quietest moment (minimum RMS)
 * - Merges very short segments (< 0.6s) with nearest neighbor
 * - Enforces small non-overlapping gaps between cues (50ms - 80ms)
 */
export function detectSpeechSegments(
  channelData: Float32Array,
  sampleRate = 16000
): MyanmarSpeechSegment[] {
  const frameSec = 0.01; // 0.01 seconds (10ms) per evaluation frame
  const frameSamples = Math.round(sampleRate * frameSec); // 160 samples per frame at 16kHz
  const totalFrames = Math.floor(channelData.length / frameSamples);

  if (totalFrames <= 0) return [];

  // Compute RMS energy for each 10ms frame
  const rmsArray = new Float32Array(totalFrames);
  for (let f = 0; f < totalFrames; f++) {
    const start = f * frameSamples;
    const end = start + frameSamples;
    let sum = 0;
    for (let i = start; i < end; i++) {
      const v = channelData[i];
      sum += v * v;
    }
    rmsArray[f] = Math.sqrt(sum / frameSamples);
  }

  // Calculate dynamic silence threshold based on noise floor
  const sampleFrames = Math.min(1500, totalFrames);
  const sampleRms: number[] = [];
  const step = Math.max(1, Math.floor(totalFrames / sampleFrames));
  for (let i = 0; i < totalFrames; i += step) {
    sampleRms.push(rmsArray[i]);
  }
  sampleRms.sort((a, b) => a - b);
  const p15 = sampleRms[Math.floor(sampleRms.length * 0.15)] || 0.005;
  const silenceThreshold = Math.max(0.012, Math.min(0.045, p15 * 2.2 + 0.006));

  const silenceFramesNeeded = Math.round(0.25 / frameSec); // 25 frames = 0.25s silence
  const maxSpeechFrames = Math.round(4.0 / frameSec); // 400 frames = 4.0s max duration
  const minSpeechFrames = Math.round(0.6 / frameSec); // 60 frames = 0.6s min duration

  interface RawSegment {
    startFrame: number;
    endFrame: number;
  }
  const rawSegments: RawSegment[] = [];

  let inSpeech = false;
  let speechStartFrame = 0;
  let silentFrameCount = 0;

  for (let f = 0; f < totalFrames; f++) {
    const isSilent = rmsArray[f] < silenceThreshold;

    if (!inSpeech) {
      if (!isSilent) {
        inSpeech = true;
        speechStartFrame = f;
        silentFrameCount = 0;
      }
    } else {
      if (isSilent) {
        silentFrameCount++;
        // Rule: 0.25s silence marks a speech break ("စကားရပ်တယ်")
        if (silentFrameCount >= silenceFramesNeeded) {
          const speechEndFrame = Math.max(speechStartFrame + 1, f - silentFrameCount + 1);
          rawSegments.push({ startFrame: speechStartFrame, endFrame: speechEndFrame });
          inSpeech = false;
          silentFrameCount = 0;
        }
      } else {
        silentFrameCount = 0;
        const currentLength = f - speechStartFrame;

        // Rule: Do not exceed 4.0s ("စကားမရပ်ဘဲ ရှိနေတာကို ၄ စက္ကန့်ထက် မထားတော့ပါ — အရင်ဆုံးအချိန် (အတိတ်ဆုံးအသံ) မှာ ခွဲပါ")
        if (currentLength >= maxSpeechFrames) {
          // Look back in the window [speechStartFrame + 220, f] to find the quietest instant (minimum RMS)
          const searchStart = Math.min(f - 10, speechStartFrame + Math.floor(maxSpeechFrames * 0.55));
          let quietestFrame = f;
          let lowestEnergy = Infinity;

          for (let sf = searchStart; sf <= f; sf++) {
            if (rmsArray[sf] < lowestEnergy) {
              lowestEnergy = rmsArray[sf];
              quietestFrame = sf;
            }
          }

          rawSegments.push({ startFrame: speechStartFrame, endFrame: quietestFrame });
          // Start the next speech chunk right after the quietest frame
          speechStartFrame = quietestFrame + 1;
          silentFrameCount = 0;
        }
      }
    }
  }

  // If ended while in speech
  if (inSpeech) {
    const speechEndFrame = Math.max(speechStartFrame + 1, totalFrames - silentFrameCount);
    rawSegments.push({ startFrame: speechStartFrame, endFrame: speechEndFrame });
  }

  if (rawSegments.length === 0) {
    // If no speech detected above threshold, treat whole audio or first 4s as a segment
    const endFrame = Math.min(totalFrames, maxSpeechFrames);
    rawSegments.push({ startFrame: 0, endFrame });
  }

  // Rule: Merge very short segments ("အလွန်တိုတွေက အနီးစပ်ဆုံးနဲ့ ပေါင်းပါ")
  const mergedSegments: RawSegment[] = [];
  for (let i = 0; i < rawSegments.length; i++) {
    const seg = rawSegments[i];
    const durFrames = seg.endFrame - seg.startFrame;

    if (durFrames < minSpeechFrames) {
      if (mergedSegments.length > 0) {
        const prev = mergedSegments[mergedSegments.length - 1];
        const combinedLen = seg.endFrame - prev.startFrame;
        if (combinedLen <= maxSpeechFrames) {
          prev.endFrame = seg.endFrame;
          continue;
        }
      }
      if (i + 1 < rawSegments.length) {
        const next = rawSegments[i + 1];
        const combinedLen = next.endFrame - seg.startFrame;
        if (combinedLen <= maxSpeechFrames) {
          next.startFrame = seg.startFrame;
          continue;
        }
      }
    }
    mergedSegments.push({ startFrame: seg.startFrame, endFrame: seg.endFrame });
  }

  // Rule: Keep non-overlapping gap between segments ("စာတန်းတခုနဲ့ တခု အချိန်မတိုက်အောင် ခြားနားခွာ ထားပါ")
  const gapFrames = Math.max(1, Math.round(0.06 / frameSec)); // 60ms gap

  const finalSegments: MyanmarSpeechSegment[] = [];
  for (let i = 0; i < mergedSegments.length; i++) {
    const curr = mergedSegments[i];
    let startFrame = curr.startFrame;
    let endFrame = curr.endFrame;

    if (i + 1 < mergedSegments.length) {
      const nextStart = mergedSegments[i + 1].startFrame;
      if (endFrame >= nextStart - gapFrames) {
        endFrame = Math.max(startFrame + 10, nextStart - gapFrames);
      }
    }

    const startSec = Number((startFrame * frameSec).toFixed(3));
    const endSec = Number(Math.max(startSec + 0.3, endFrame * frameSec).toFixed(3));

    const sampleStart = Math.min(channelData.length, startFrame * frameSamples);
    const sampleEnd = Math.min(channelData.length, endFrame * frameSamples);
    const slice = channelData.slice(sampleStart, sampleEnd);

    finalSegments.push({
      index: i + 1,
      startSec,
      endSec,
      samples: slice,
      status: 'pending'
    });
  }

  return finalSegments;
}

/**
 * Step 4: AI Transcription for a single audio segment with 3x retry on rate limit
 */
export async function transcribeSegmentWithRetry(
  audioBase64: string,
  maxRetries = 3
): Promise<string> {
  const ai = getAIClient();
  const models = CANDIDATE_FLASH_MODELS;

  const systemInstruction = `You are a high-precision Burmese audio transcription AI.
Transcribe the spoken Burmese in this short audio segment into natural Burmese Unicode text.
CRITICAL RULES:
1. Output ONLY the Burmese transcript text.
2. Do NOT add timestamps, sequence numbers, markdown tags, quotes, or notes.
3. If only background noise or unintelligible speech is heard, return an empty string.`;

  const prompt = `Transcribe the Burmese speech in this audio slice. Output Burmese text only.`;

  let lastError: unknown = null;

  for (let attempt = 1; attempt <= maxRetries; attempt++) {
    for (const model of models) {
      try {
        const response = await ai.models.generateContent({
          model,
          contents: [
            { inlineData: { data: audioBase64, mimeType: 'audio/wav' } },
            { text: prompt }
          ],
          config: {
            systemInstruction,
            temperature: 0.1
          }
        });

        const raw = (response.text || '').trim();
        // Clean out quotes, markdown, and labels if any
        const cleaned = raw
          .replace(/```(?:srt|text)?/gi, '')
          .replace(/```/g, '')
          .replace(/^(Burmese|မြန်မာ|Transcript|Translation):\s*/i, '')
          .trim();

        return cleaned;
      } catch (err: unknown) {
        lastError = err;
        const msg = String((err as { message?: string })?.message || err);
        const isRateLimit = /429|resource_exhausted|quota|rate limit/i.test(msg);

        if (isRateLimit && attempt < maxRetries) {
          // Rule: rate limit တိုက်ရင် အလိုအလျောက် ၃ ကြိမ် ပြန်ကြိုးစားတာ
          const backoffMs = attempt * 1500;
          await new Promise(res => setTimeout(res, backoffMs));
          break; // Break model loop and retry with attempt + 1
        }
      }
    }
  }

  console.warn('Segment transcription warning:', lastError);
  return '';
}

/**
 * Converts cues to full SRT text
 */
export function cuesToSrtContent(cues: SrtCueItem[]): string {
  return cues
    .map((c, i) => `${i + 1}\n${c.start} --> ${c.end}\n${c.text}`)
    .join('\n\n') + '\n';
}

/**
 * Main Orchestrator: Complete 6-Step Myanmar SRT Generation Flow
 */
export async function runMyanmarSrtFlow(
  file: File,
  options: {
    onProgress?: (progress: MyanmarSrtProgress) => void;
    signal?: AbortSignal;
  } = {}
): Promise<{ srt: string; cues: SrtCueItem[]; fileName: string }> {
  const { onProgress, signal } = options;

  // Step 1: File Validation (10MB limit recommended)
  if (file.size > 12 * 1024 * 1024) {
    throw new Error('ဖိုင်ဆိုဒ် 10MB ထက် မကျော်လွန်ရပါ (ဖိုင်အကြီးအငယ် ၁၀MB အထိ သုံးလို့ရပါ)');
  }

  onProgress?.({
    step: 2,
    message: 'အသံကို Browser ထဲတွင် ဖတ်နေပါသည် (၁၆,၀၀၀ Hz mono ပြောင်းနေသည်)...',
    completedCount: 0,
    totalCount: 0,
    percent: 10,
    currentCues: [],
    rawSrtText: ''
  });

  // Step 2: Browser Audio Resampling to 16,000 Hz Mono (Zero server upload)
  const { channelData } = await extractMonoAudioInBrowser(file, 16000);

  if (signal?.aborted) throw new Error('Canceled');

  // Step 3: Silence and Speech Segmentation
  onProgress?.({
    step: 3,
    message: 'စကားရပ်သည့်နေရာများ ခွဲထုတ်နေပါသည် (၀.၀၁s စစ်ဆေးခြင်း)...',
    completedCount: 0,
    totalCount: 0,
    percent: 25,
    currentCues: [],
    rawSrtText: ''
  });

  const segments = detectSpeechSegments(channelData, 16000);
  const totalSegments = segments.length;

  if (totalSegments === 0) {
    throw new Error('အသံဖိုင်တွင် စကားပြောသံ ရှာမတွေ့ပါ');
  }

  // Step 4: AI Transcription per Segment with Concurrency = 3 & 3x Retry
  const cues: SrtCueItem[] = segments.map((seg, i) => ({
    index: i + 1,
    start: formatSrtTime(seg.startSec),
    end: formatSrtTime(seg.endSec),
    text: '',
    startSec: seg.startSec,
    endSec: seg.endSec
  }));

  let completedCount = 0;
  const concurrency = 3; // ၃ ပိုင်းတစ်ပြိုင်နက် အလုပ်လုပ်ပါ

  const executeSegmentTask = async (segIdx: number) => {
    if (signal?.aborted) return;
    const seg = segments[segIdx];
    seg.status = 'processing';

    const { base64 } = encodeMonoWav(seg.samples, 16000);
    const transcribedText = await transcribeSegmentWithRetry(base64, 3);

    // Step 5: Format Myanmar text to at most 2 lines
    const formattedText = splitMyanmarTextIntoTwoLines(transcribedText);
    seg.text = formattedText;
    seg.status = 'completed';
    cues[segIdx].text = formattedText;

    completedCount++;
    const percent = Math.min(98, Math.round(25 + (completedCount / totalSegments) * 70));

    // Live update so Step 6 buttons can immediately download / copy partial results
    const validCues = cues.filter(c => c.text && c.text.trim().length > 0);
    const currentSrt = cuesToSrtContent(validCues);

    onProgress?.({
      step: 4,
      message: `စာတန်း ${completedCount} / ${totalSegments} ပြီးပါပြီ (${Math.round((completedCount / totalSegments) * 100)}%)`,
      completedCount,
      totalCount: totalSegments,
      percent,
      currentCues: validCues,
      rawSrtText: currentSrt
    });
  };

  // Run with Concurrency Pool of 3
  let nextIndex = 0;
  const workers = Array.from({ length: concurrency }).map(async () => {
    while (nextIndex < totalSegments) {
      if (signal?.aborted) break;
      const currentIndex = nextIndex++;
      await executeSegmentTask(currentIndex);
    }
  });

  await Promise.all(workers);

  if (signal?.aborted) throw new Error('Canceled');

  // Step 5: Finalize Cues & SRT Assembly
  const validCues = cues.filter(c => c.text && c.text.trim().length > 0);
  const finalSrt = cuesToSrtContent(validCues.length > 0 ? validCues : cues);

  const baseName = file.name.replace(/\.[^.]+$/, '');
  const outFileName = `${baseName}.my.srt`;

  onProgress?.({
    step: 6,
    message: `အောင်မြင်ပါသည်! စာတန်းပေါင်း ${validCues.length} ခု ထွက်ရှိပါပြီ`,
    completedCount: totalSegments,
    totalCount: totalSegments,
    percent: 100,
    currentCues: validCues.length > 0 ? validCues : cues,
    rawSrtText: finalSrt
  });

  return {
    srt: finalSrt,
    cues: validCues.length > 0 ? validCues : cues,
    fileName: outFileName
  };
}

/**
 * Step 6: Download SRT with UTF-8 BOM so media players render Burmese properly
 */
export function downloadMyanmarSrtFile(srtContent: string, fileName: string): void {
  const finalName = fileName.endsWith('.my.srt')
    ? fileName
    : `${fileName.replace(/\.[^.]+$/, '')}.my.srt`;

  // Prepend UTF-8 BOM (\uFEFF)
  const blob = new Blob(['\uFEFF' + srtContent], { type: 'text/plain;charset=utf-8' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = finalName;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(url);
}
