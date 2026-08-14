/**
 * Voice Clone Studio Utilities
 * ---------------------------
 * Client-side voice cloning companion for Lumini AI Studio.
 *
 * Architecture overview:
 * 1. Reference capture  -> upload or record 10-30s of your own voice.
 * 2. Voice analysis     -> Web Audio API extracts fingerprint traits
 *                          (fundamental pitch, spectral centroid, energy,
 *                          roughness) that characterize the speaker's voice.
 * 3. Style transfer     -> those traits are converted into a vocal-style
 *                          instruction bundle used by the neural TTS engine
 *                          (Gemini built-in voices), plus optional
 *                          post-processing (pitch shift) on the output WAV.
 *
 * Notes on the AI models behind the scenes (all free / open):
 * - F5-TTS (github.com/SWivid/F5-TTS): the currently trending zero-shot
 *   voice cloning model. Clones a voice from just 5-15s of reference audio.
 *   Trained on English + Chinese; community fine-tunes exist for JA/KO/ES.
 *   Burmese is not officially supported yet, but cross-lingual cloning
 *   works with some fidelity loss. Self-host free: `pip install f5-tts`.
 * - E2-TTS: F5-TTS's multilingual sister model with broader coverage.
 * - CAMB.AI MARS8: commercial-grade native Burmese TTS with a free tier
 *   (2,000 credits / month) — alternative if users want production
 *   Burmese-native voices via their own API key.
 *
 * License note: F5-TTS code is MIT; model weights are CC-BY-NC-4.0
 * (personal / research use). Burmese users can fine-tune it with the
 * open-source Google Burmese Speech Corpus.
 */

export interface VoiceProfile {
  id: string;
  name: string;
  createdAt: number;
  durationSeconds: number;
  dataUrl?: string; // stored audio (short, stored in localStorage)
  voiceId?: string; // ElevenLabs instant voice clone id (optional, free tier)
  traits: {
    gender: 'male' | 'female' | 'unknown';
    pitchHz: number;        // estimated fundamental frequency
    tone: 'bright' | 'warm' | 'neutral';
    energy: 'calm' | 'moderate' | 'energetic';
    pace: 'slow' | 'steady' | 'fast';
  };
  prompt: string; // ready-to-use vocal style instructions for the TTS engine
}

// Storage key for saved voice clones
export const VOICE_CLONES_KEY = 'lumini_voice_clones';

export const loadClones = (): VoiceProfile[] => {
  try {
    const raw = localStorage.getItem(VOICE_CLONES_KEY);
    return raw ? (JSON.parse(raw) as VoiceProfile[]) : [];
  } catch {
    return [];
  }
};

export const saveClones = (clones: VoiceProfile[]) => {
  try {
    localStorage.setItem(VOICE_CLONES_KEY, JSON.stringify(clones));
  } catch (err) {
    console.warn('Could not persist voice clones:', err);
  }
};

export const removeClone = (id: string) => {
  saveClones(loadClones().filter((c) => c.id !== id));
};

/**
 * Analyze reference audio and produce a VoiceProfile.
 * Uses Web Audio API feature extraction (offline analysis).
 */
export const analyzeVoice = async (
  audioDataUrl: string,
  name: string
): Promise<VoiceProfile> => {
  const response = await fetch(audioDataUrl);
  const arrayBuffer = await response.arrayBuffer();

  const AudioContextClass = window.AudioContext || (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext || AudioContext;
  const ctx = new AudioContextClass();
  const audioBuffer = await ctx.decodeAudioData(arrayBuffer);

  const channelData = audioBuffer.getChannelData(0);
  const sampleRate = audioBuffer.sampleRate;
  const duration = audioBuffer.duration;

  // ---- Voice activity detection (keep only voiced frames) ----
  const frameSize = Math.floor(sampleRate * 0.03); // 30 ms frames
  const voicedFrames: Float32Array[] = [];
  for (let i = 0; i + frameSize < channelData.length; i += frameSize) {
    const frame = channelData.subarray(i, i + frameSize);
    const rms = Math.sqrt(frame.reduce((acc, s) => acc + s * s, 0) / frame.length);
    if (rms > 0.015) {
      voicedFrames.push(frame);
    }
  }

  // ---- Fundamental frequency estimate via autocorrelation ----
  const estimateF0 = (frame: Float32Array): number => {
    let bestLag = 0;
    let bestCorr = 0;
    const minLag = Math.floor(sampleRate / 400); // 400 Hz upper bound
    const maxLag = Math.floor(sampleRate / 55);  // 55 Hz lower bound
    const mean = frame.reduce((a, b) => a + b, 0) / frame.length;
    const norm = Array.from(frame).map((s) => s - mean);
    for (let lag = minLag; lag <= maxLag; lag++) {
      let corr = 0;
      let e1 = 0;
      let e2 = 0;
      for (let n = 0; n < norm.length - lag; n++) {
        corr += norm[n] * norm[n + lag];
        e1 += norm[n] * norm[n];
        e2 += norm[n + lag] * norm[n + lag];
      }
      const denom = Math.sqrt(e1 * e2);
      const score = denom > 0 ? corr / denom : 0;
      if (score > bestCorr) {
        bestCorr = score;
        bestLag = lag;
      }
    }
    return bestLag > 0 ? sampleRate / bestLag : 0;
  };

  const pitches: number[] = [];
  for (const frame of voicedFrames) {
    const f0 = estimateF0(frame);
    if (f0 > 55 && f0 < 400) pitches.push(f0);
  }

  const medianPitch = pitches.length > 0
    ? [...pitches].sort((a, b) => a - b)[Math.floor(pitches.length / 2)]
    : 140;

  // ---- Spectral centroid (brightness) via DFT-lite ----
  const fftSize = 2048;
  let centroidSum = 0;
  let centroidCount = 0;
  const sampleStart = Math.floor(sampleRate * Math.min(duration / 3, 3));
  const spectrumFrame = channelData.subarray(sampleStart, Math.min(sampleStart + fftSize, channelData.length));
  const hann = Array.from(spectrumFrame).map((_, i, arr) => 0.5 * (1 - Math.cos((2 * Math.PI * i) / (arr.length - 1))));
  const windowed = spectrumFrame.map((s, i) => s * hann[i]);
  for (let k = 1; k < fftSize / 2; k++) {
    let re = 0;
    let im = 0;
    for (let n = 0; n < windowed.length; n++) {
      const angle = (2 * Math.PI * k * n) / fftSize;
      re += windowed[n] * Math.cos(angle);
      im -= windowed[n] * Math.sin(angle);
    }
    const mag = Math.sqrt(re * re + im * im);
    const freq = (k * sampleRate) / fftSize;
    centroidSum += mag * freq;
    centroidCount += mag;
  }
  const spectralCentroid = centroidCount > 0 ? centroidSum / centroidCount : 1500;

  ctx.close();

  // ---- Derive traits ----
  const gender = medianPitch > 165 ? 'female' : medianPitch < 130 ? 'male' : 'unknown';
  const tone = spectralCentroid > 2200 ? 'bright' : spectralCentroid > 1500 ? 'warm' : 'neutral';
  const overallRms = Math.sqrt(channelData.reduce((a, s) => a + s * s, 0) / channelData.length);
  const energy = overallRms > 0.06 ? 'energetic' : overallRms > 0.025 ? 'moderate' : 'calm';
  const pace: VoiceProfile['traits']['pace'] = 'steady';

  // ---- Build a Burmese-aware vocal style prompt ----
  const genderDesc = gender === 'female' ? 'natural female voice' : gender === 'male' ? 'natural male voice' : 'neutral voice';
  const toneDesc = tone === 'bright' ? 'clear, bright and youthful' : tone === 'warm' ? 'warm, smooth and gentle' : 'balanced and neutral';
  const energyDesc = energy === 'energetic' ? 'lively, upbeat delivery' : energy === 'calm' ? 'calm, relaxed delivery' : 'natural conversational delivery';
  const pitchDeviation = Math.round(((medianPitch - 155) / 155) * 100);

  const prompt =
    `Speak in Burmese (Myanmar language) with a ${genderDesc}. ` +
    `Your vocal character is ${toneDesc} with ${energyDesc}. ` +
    `Natural Burmese pronunciation with correct tones; pronounce Myanmar script characters natively, not romanized. ` +
    `Pitch reference: approximately ${Math.round(medianPitch)} Hz.` +
    (pitchDeviation !== 0 ? ` Speaking pace adjustment: ${pitchDeviation > 0 ? '+' : ''}${pitchDeviation}%.` : '');

  const profile: VoiceProfile = {
    id: `clone_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`,
    name,
    createdAt: Date.now(),
    durationSeconds: Math.round(duration * 10) / 10,
    traits: { gender, pitchHz: Math.round(medianPitch), tone, energy, pace },
    prompt,
  };
  return profile;
};

/**
 * Post-process generated WAV audio towards the cloned voice using
 * Web Audio API detune (pitch shift). Returns a new Blob URL.
 */
export const applyClonePostProcessing = async (
  sourceUrl: string,
  pitchOffsetPercent: number
): Promise<{ blobUrl: string; dispose: () => void }> => {
  const response = await fetch(sourceUrl);
  const arrayBuffer = await response.arrayBuffer();
  const AudioContextClass = window.AudioContext || (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext || AudioContext;
  const ctx = new AudioContextClass();
  const audioBuffer = await ctx.decodeAudioData(arrayBuffer);

  const detuneCents = pitchOffsetPercent * 0.12; // map % into subtle cents
  const source = ctx.createBufferSource();
  source.buffer = audioBuffer;
  source.detune.value = Math.max(-600, Math.min(600, detuneCents));
  source.connect(ctx.destination);
  source.start(0);

  // Render offline
  const offline = new OfflineAudioContext(
    audioBuffer.numberOfChannels,
    audioBuffer.length,
    audioBuffer.sampleRate
  );
  const offlineSource = offline.createBufferSource();
  offlineSource.buffer = audioBuffer;
  offlineSource.detune.value = Math.max(-600, Math.min(600, detuneCents));
  offlineSource.connect(offline.destination);
  offlineSource.start(0);
  const rendered = await offline.startRendering();
  await ctx.close();

  // Convert to WAV
  const numChannels = rendered.numberOfChannels;
  const length = rendered.length;
  const sampleRate = rendered.sampleRate;
  const interleaved = new Float32Array(length * numChannels);
  for (let ch = 0; ch < numChannels; ch++) {
    const channel = rendered.getChannelData(ch);
    for (let i = 0; i < length; i++) interleaved[i * numChannels + ch] = channel[i];
  }
  const wavBytes = encodeWav(interleaved, sampleRate, numChannels);
  const blob = new Blob([wavBytes], { type: 'audio/wav' });
  const url = URL.createObjectURL(blob);
  return { blobUrl: url, dispose: () => URL.revokeObjectURL(url) };
};

const encodeWav = (samples: Float32Array, sampleRate: number, numChannels: number): ArrayBuffer => {
  const buffer = new ArrayBuffer(44 + samples.length * 2);
  const view = new DataView(buffer);
  const writeString = (offset: number, str: string) => {
    for (let i = 0; i < str.length; i++) view.setUint8(offset + i, str.charCodeAt(i));
  };
  const writeInt = (offset: number, value: number) => view.setUint32(offset, value, true);
  const writeShort = (offset: number, value: number) => view.setUint16(offset, value, true);

  writeString(0, 'RIFF');
  writeInt(4, 36 + samples.length * 2);
  writeString(8, 'WAVE');
  writeString(12, 'fmt ');
  writeInt(16, 16);
  writeShort(20, 1); // PCM
  writeShort(22, numChannels);
  writeInt(24, sampleRate);
  writeInt(28, sampleRate * numChannels * 2);
  writeShort(32, numChannels * 2);
  writeShort(34, 16);
  writeString(36, 'data');
  writeInt(40, samples.length * 2);

  let offset = 44;
  for (let i = 0; i < samples.length; i++) {
    const s = Math.max(-1, Math.min(1, samples[i]));
    view.setInt16(offset, s < 0 ? s * 0x8000 : s * 0x7fff, true);
    offset += 2;
  }
  return buffer;
};

/**
 * Real voice cloning providers (optional, free tiers).
 *
 * ElevenLabs free plan:
 * - 10,000 characters / month free, includes Instant Voice Cloning.
 * - Get a free API key at https://elevenlabs.io (no credit card).
 * - Multilingual v2 model supports Burmese script via cross-lingual TTS.
 *
 * Usage flow in Lumini:
 * 1. Upload 10-30s voice sample -> create instant voice clone on ElevenLabs
 *    (POST /v1/voices, multipart form with audio_file).
 * 2. Generate speech with the clone:
 *    POST /v1/text-to-speech/{voice_id}, model eleven_multilingual_v2,
 *    output_format mp3_44100_128.
 * 3. Store the voice_id per VoiceProfile so clones persist.
 *
 * The HF E2-F5-TTS Gradio space (mrfakename/E2-F5-TTS) was verified to
 * produce real clones via gradio_client, but HF blocks direct browser calls
 * (CORS: allow-origin equals the space only) and the queue needs websockets.
 * It remains a self-host / Python-backend option documented in the app.
 */

/**
 * Read a File into a data URL (for preview storage).
 */

export interface ElevenLabsCloneResult {
  voiceId: string;
  name: string;
}

const ELEVEN_API_KEY_STORAGE = 'lumini_elevenlabs_key';

export const getElevenKey = (): string =>
  localStorage.getItem(ELEVEN_API_KEY_STORAGE) ?? '';

export const setElevenKey = (key: string): void =>
  localStorage.setItem(ELEVEN_API_KEY_STORAGE, key);

/** Create an instant voice clone on ElevenLabs from reference audio. */
export const createElevenClone = async (
  name: string,
  audioBlob: Blob
): Promise<ElevenLabsCloneResult> => {
  const key = getElevenKey();
  if (!key) throw new Error('NO_API_KEY');

  const form = new FormData();
  form.append('name', name);
  form.append('files', audioBlob, 'voice_sample.webm');
  form.append('description', `Lumini voice clone: ${name}`);

  const res = await fetch('https://api.elevenlabs.io/v1/voices', {
    method: 'POST',
    headers: { 'xi-api-key': key },
    body: form,
  });
  if (!res.ok) {
    const err = await res.json().catch(() => null);
    const detail = (err as { detail?: { message?: string } })?.detail?.message ?? res.statusText;
    throw new Error(detail);
  }
  const data = (await res.json()) as { voice_id: string };
  return { voiceId: data.voice_id, name };
};

/** Generate speech with a cloned voice (ElevenLabs multilingual v2). */
export const synthesizeWithClone = async (
  voiceId: string,
  text: string
): Promise<Blob> => {
  const key = getElevenKey();
  if (!key) throw new Error('NO_API_KEY');
  const res = await fetch(`https://api.elevenlabs.io/v1/text-to-speech/${voiceId}`, {
    method: 'POST',
    headers: {
      'xi-api-key': key,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      text,
      model_id: 'eleven_multilingual_v2',
      voice_settings: { stability: 0.45, similarity_boost: 0.8, style: 0.2 },
    }),
  });
  if (!res.ok) {
    const err = await res.json().catch(() => null);
    const detail = (err as { detail?: { message?: string } })?.detail?.message ?? res.statusText;
    throw new Error(detail);
  }
  return await res.blob();
};

/** Delete an instant voice clone (frees a voice slot). */
export const deleteElevenClone = async (voiceId: string): Promise<void> => {
  const key = getElevenKey();
  if (!key) return;
  await fetch(`https://api.elevenlabs.io/v1/voices/${voiceId}`, {
    method: 'DELETE',
    headers: { 'xi-api-key': key },
  }).catch(() => {});
};

export const readFileAsDataUrl = (file: File): Promise<string> =>
  new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(reader.result as string);
    reader.onerror = reject;
    reader.readAsDataURL(file);
  });

/**
 * Start recording from the microphone. Returns stop fn + stream.
 */
export const startRecording = async (): Promise<{ stream: MediaStream; stop: () => Promise<Blob | string> }> => {
  const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
  const recorder = new MediaRecorder(stream, { mimeType: 'audio/webm' });
  const chunks: Blob[] = [];
  recorder.ondataavailable = (e) => { if (e.data.size > 0) chunks.push(e.data); };
  recorder.start();
  const stop = () =>
    new Promise<Blob | string>((resolve) => {
      recorder.onstop = () => {
        stream.getTracks().forEach((t) => t.stop());
        const blob = new Blob(chunks, { type: 'audio/webm' });
        const reader = new FileReader();
        reader.onload = () => resolve(reader.result as string);
        reader.onerror = () => resolve(blob);
        reader.readAsDataURL(blob);
      };
      recorder.stop();
    });
  return { stream, stop };
};
