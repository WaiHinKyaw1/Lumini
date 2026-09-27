/**
 * Fast Whisper Subtitle Transcription Service
 * -------------------------------------------
 * High-speed speech-to-text (STT) and millisecond-accurate SRT generation.
 * Powered by Groq Whisper (whisper-large-v3-turbo / whisper-large-v3) & OpenAI Whisper.
 *
 * Typical transcription speed:
 * - 1-2 min audio: ~0.8s to 1.5s
 * - 5 min audio: ~2.5s
 */

export interface WhisperSegment {
  id: number;
  seek: number;
  start: number;
  end: number;
  text: string;
  tokens?: number[];
  temperature?: number;
  avg_logprob?: number;
  compression_ratio?: number;
  no_speech_prob?: number;
}

export interface WhisperVerboseResponse {
  task: string;
  language: string;
  duration: number;
  text: string;
  segments: WhisperSegment[];
}

export interface SrtCueItem {
  index: number;
  start: string;
  end: string;
  text: string;
}

const GROQ_API_KEY_STORAGE = 'lumini_groq_api_key';
const OPENAI_API_KEY_STORAGE = 'lumini_openai_api_key';
const DEFAULT_WHISPER_ENGINE_STORAGE = 'lumini_whisper_engine'; // 'groq' | 'openai' | 'server' | 'gemini'

export const getGroqApiKey = (): string => {
  return localStorage.getItem(GROQ_API_KEY_STORAGE) || (import.meta.env.VITE_GROQ_API_KEY as string) || '';
};

export const setGroqApiKey = (key: string): void => {
  if (key) {
    localStorage.setItem(GROQ_API_KEY_STORAGE, key.trim());
  } else {
    localStorage.removeItem(GROQ_API_KEY_STORAGE);
  }
};

export const getOpenAIApiKey = (): string => {
  return localStorage.getItem(OPENAI_API_KEY_STORAGE) || (import.meta.env.VITE_OPENAI_API_KEY as string) || '';
};

export const setOpenAIApiKey = (key: string): void => {
  if (key) {
    localStorage.setItem(OPENAI_API_KEY_STORAGE, key.trim());
  } else {
    localStorage.removeItem(OPENAI_API_KEY_STORAGE);
  }
};

export const getWhisperEngine = (): 'groq' | 'server' | 'openai' | 'gemini' => {
  const saved = localStorage.getItem(DEFAULT_WHISPER_ENGINE_STORAGE);
  if (saved === 'groq' || saved === 'server' || saved === 'openai' || saved === 'gemini') {
    return saved;
  }
  return 'groq';
};

export const setWhisperEngine = (engine: 'groq' | 'server' | 'openai' | 'gemini'): void => {
  localStorage.setItem(DEFAULT_WHISPER_ENGINE_STORAGE, engine);
};

export const formatSecondsToSrtTime = (totalSeconds: number): string => {
  const safe = Math.max(0, totalSeconds);
  const hrs = Math.floor(safe / 3600);
  const mins = Math.floor((safe % 3600) / 60);
  const secs = Math.floor(safe % 60);
  const ms = Math.floor((safe % 1) * 1000);
  return `${hrs.toString().padStart(2, '0')}:${mins.toString().padStart(2, '0')}:${secs.toString().padStart(2, '0')},${ms.toString().padStart(3, '0')}`;
};

export const parseSrtToCues = (srtText: string): SrtCueItem[] => {
  if (!srtText || !srtText.trim()) return [];
  const blocks = srtText.replace(/\r\n/g, '\n').replace(/\r/g, '\n').trim().split(/\n\s*\n/);
  const cues: SrtCueItem[] = [];

  for (const block of blocks) {
    const lines = block.trim().split('\n').map(l => l.trim()).filter(Boolean);
    if (lines.length < 2) continue;
    const timeIdx = lines.findIndex(l => l.includes('-->'));
    if (timeIdx === -1) continue;

    const idxNum = parseInt(lines[0], 10);
    const timeParts = lines[timeIdx].split('-->');
    if (timeParts.length !== 2) continue;

    const text = lines.slice(timeIdx + 1).join('\n').replace(/<[^>]*>/g, '').trim();
    if (!text) continue;

    cues.push({
      index: isNaN(idxNum) ? cues.length + 1 : idxNum,
      start: timeParts[0].trim(),
      end: timeParts[1].trim(),
      text
    });
  }
  return cues;
};

export const cuesToSrtString = (cues: SrtCueItem[]): string => {
  return cues
    .map((c, i) => `${i + 1}\n${c.start} --> ${c.end}\n${c.text}`)
    .join('\n\n') + '\n';
};

/**
 * Maps common language names or codes to ISO 639-1 codes for Whisper
 */
export const mapLanguageToWhisperCode = (lang: string): string => {
  const upper = (lang || '').toUpperCase().trim();
  switch (upper) {
    case 'BURMESE':
    case 'MYANMAR':
    case 'MY':
      return 'my';
    case 'ENGLISH':
    case 'EN':
      return 'en';
    case 'THAI':
    case 'TH':
      return 'th';
    case 'CHINESE':
    case 'ZH':
      return 'zh';
    case 'JAPANESE':
    case 'JA':
      return 'ja';
    case 'KOREAN':
    case 'KO':
      return 'ko';
    default:
      return 'my';
  }
};

/**
 * Converts Whisper segment array to clean SRT string
 */
export const segmentsToSrt = (segments: WhisperSegment[]): string => {
  if (!segments || segments.length === 0) return '';
  const cues: SrtCueItem[] = [];

  segments.forEach((seg, idx) => {
    const text = (seg.text || '').replace(/<[^>]*>/g, '').trim();
    if (!text) return;

    // Guard against identical start and end timestamps
    const startSec = Math.max(0, seg.start);
    const endSec = Math.max(startSec + 0.3, seg.end);

    cues.push({
      index: idx + 1,
      start: formatSecondsToSrtTime(startSec),
      end: formatSecondsToSrtTime(endSec),
      text
    });
  });

  return cuesToSrtString(cues);
};

export interface FastWhisperOptions {
  language?: string;
  model?: string; // 'whisper-large-v3-turbo' | 'whisper-large-v3' | 'whisper-1'
  apiKey?: string;
  onProgress?: (statusText: string, progressPct: number) => void;
}

/**
 * Transcribe Audio directly via Groq Whisper API (Lightning Fast ~1s)
 */
export const transcribeWithGroq = async (
  audioFileOrBlob: File | Blob,
  options: FastWhisperOptions = {}
): Promise<string> => {
  const apiKey = options.apiKey || getGroqApiKey();
  if (!apiKey) {
    throw new Error('Groq API Key မထည့်ရသေးပါ။ Settings တွင် Groq API Key (Free) ကို ထည့်သွင်းပေးပါ သို့မဟုတ် Gemini စနစ်ကို ရွေးချယ်ပါ။');
  }

  const langCode = mapLanguageToWhisperCode(options.language || 'BURMESE');
  const model = options.model || 'whisper-large-v3-turbo';

  options.onProgress?.('⚡ Groq Fast Whisper သို့ အသံဖိုင် ပေးပို့နေပါသည်...', 35);

  const formData = new FormData();
  const filename = (audioFileOrBlob as File).name || 'audio.wav';
  formData.append('file', audioFileOrBlob, filename);
  formData.append('model', model);
  formData.append('response_format', 'verbose_json');
  formData.append('temperature', '0.0');
  if (langCode) {
    formData.append('language', langCode);
  }

  options.onProgress?.('⚡ Fast Whisper AI အသံလှိုင်းများကို 1s အတွင်း စာတန်းပြောင်းနေပါသည်...', 65);

  const res = await fetch('https://api.groq.com/openai/v1/audio/transcriptions', {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${apiKey}`
    },
    body: formData
  });

  if (!res.ok) {
    let errorDetail = '';
    try {
      const errJson = await res.json();
      errorDetail = errJson?.error?.message || JSON.stringify(errJson);
    } catch {
      errorDetail = await res.text().catch(() => res.statusText);
    }
    throw new Error(`Groq Whisper API Error (${res.status}): ${errorDetail}`);
  }

  options.onProgress?.('✨ စာတန်းများကို SRT Format သို့ အချောသတ် စစ်ဆေးနေပါသည်...', 90);

  const data: WhisperVerboseResponse = await res.json();
  if (data.segments && data.segments.length > 0) {
    return segmentsToSrt(data.segments);
  }

  if (data.text) {
    // Fallback if no segments: single cue
    const dur = data.duration || 5;
    return `1\n00:00:00,000 --> ${formatSecondsToSrtTime(dur)}\n${data.text.trim()}\n`;
  }

  throw new Error('အသံဖိုင်တွင် စကားပြောသံ ရှင်းလင်းစွာ မပါရှိပါ သို့မဟုတ် Subtitle စာတန်း မထွက်ရှိပါ။');
};

/**
 * Transcribe Audio via OpenAI Whisper API
 */
export const transcribeWithOpenAI = async (
  audioFileOrBlob: File | Blob,
  options: FastWhisperOptions = {}
): Promise<string> => {
  const apiKey = options.apiKey || getOpenAIApiKey();
  if (!apiKey) {
    throw new Error('OpenAI API Key မထည့်ရသေးပါ။ API Key ထည့်သွင်းပေးပါ။');
  }

  const langCode = mapLanguageToWhisperCode(options.language || 'BURMESE');

  options.onProgress?.('OpenAI Whisper သို့ အသံဖိုင် ပေးပို့နေပါသည်...', 35);

  const formData = new FormData();
  const filename = (audioFileOrBlob as File).name || 'audio.wav';
  formData.append('file', audioFileOrBlob, filename);
  formData.append('model', 'whisper-1');
  formData.append('response_format', 'verbose_json');
  formData.append('temperature', '0.0');
  if (langCode) {
    formData.append('language', langCode);
  }

  const res = await fetch('https://api.openai.com/v1/audio/transcriptions', {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${apiKey}`
    },
    body: formData
  });

  if (!res.ok) {
    let errorDetail = '';
    try {
      const errJson = await res.json();
      errorDetail = errJson?.error?.message || JSON.stringify(errJson);
    } catch {
      errorDetail = await res.text().catch(() => res.statusText);
    }
    throw new Error(`OpenAI Whisper Error (${res.status}): ${errorDetail}`);
  }

  const data: WhisperVerboseResponse = await res.json();
  if (data.segments && data.segments.length > 0) {
    return segmentsToSrt(data.segments);
  }

  if (data.text) {
    const dur = data.duration || 5;
    return `1\n00:00:00,000 --> ${formatSecondsToSrtTime(dur)}\n${data.text.trim()}\n`;
  }

  throw new Error('အသံဖိုင်တွင် စကားပြောသံ မထွက်ရှိပါ။');
};

/**
 * Transcribe Audio via AWS EC2 Media Worker server proxy
 */
export const transcribeWithServerWorker = async (
  audioFileOrBlob: File | Blob,
  options: FastWhisperOptions = {}
): Promise<string> => {
  const baseUrl = (import.meta.env.VITE_MEDIA_WORKER_URL || '').replace(/\/$/, '');
  if (!baseUrl) {
    throw new Error('Media Worker Server မချိတ်ဆက်ထားပါ။');
  }

  const langCode = mapLanguageToWhisperCode(options.language || 'BURMESE');
  const formData = new FormData();
  const filename = (audioFileOrBlob as File).name || 'audio.wav';
  formData.append('file', audioFileOrBlob, filename);
  formData.append('language', langCode);

  options.onProgress?.('Cloud Server တွင် Whisper ဖြင့် စာတန်းပြောင်းနေပါသည်...', 45);

  const res = await fetch(`${baseUrl}/api/transcribe`, {
    method: 'POST',
    body: formData
  });

  if (!res.ok) {
    const err = await res.json().catch(() => ({ error: res.statusText }));
    throw new Error(err.error || `Server Error ${res.status}`);
  }

  const data = await res.json();
  if (data.srt) {
    return data.srt;
  }
  if (data.segments) {
    return segmentsToSrt(data.segments);
  }

  throw new Error('ဆာဗာမှ Subtitle စာတန်း ပြန်လည်မရရှိပါ။');
};
