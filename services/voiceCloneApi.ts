import { isMediaWorkerConfigured } from './mediaWorkerApi';
import { splitTextIntoChunks, concatenateAudioBuffers, audioBufferToWav } from './geminiService';
const baseUrl = () => (import.meta.env.VITE_MEDIA_WORKER_URL || '').replace(/\/$/, '');
const requireBaseUrl = () => {
  const url = baseUrl();
  if (!url) throw new Error('Media worker is not configured.');
  return url;
};

export const isVoiceCloneBackendConfigured = (): boolean => isMediaWorkerConfigured();

export async function createBackendVoiceClone(name: string, audioFile: File): Promise<{ voiceId: string; name: string }> {
  const body = new FormData();
  body.append('name', name);
  body.append('file', audioFile, audioFile.name || 'voice-sample.webm');
  const response = await fetch(`${requireBaseUrl()}/api/voice-clones`, { method: 'POST', body });
  if (!response.ok) throw new Error((await response.json().catch(() => null))?.error || 'Could not create the voice clone.');
  return response.json() as Promise<{ voiceId: string; name: string }>;
}

export async function synthesizeBackendVoiceClone(voiceId: string, text: string, speed = 1): Promise<Blob> {
  const response = await fetch(`${requireBaseUrl()}/api/voice-clones/${encodeURIComponent(voiceId)}/synthesize`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ text, speed }),
  });
  if (!response.ok) throw new Error((await response.json().catch(() => null))?.error || 'Could not synthesize cloned speech.');
  return response.blob();
}

export async function deleteBackendVoiceClone(voiceId: string): Promise<void> {
  await fetch(`${requireBaseUrl()}/api/voice-clones/${encodeURIComponent(voiceId)}`, { method: 'DELETE' });
}

export const getActiveVoxCPMUrl = (): string => {
  if (typeof window !== 'undefined') {
    const saved = localStorage.getItem('LUMINI_VOXCPM_URL');
    if (saved && saved.trim()) return saved.trim().replace(/\/$/, '');
  }
  return (import.meta.env.VITE_VOXCPM_URL || import.meta.env.VITE_MEDIA_WORKER_URL || '').replace(/\/$/, '');
};

export const setCustomVoxCPMUrl = (url: string) => {
  if (typeof window !== 'undefined') {
    if (url && url.trim()) {
      localStorage.setItem('LUMINI_VOXCPM_URL', url.trim().replace(/\/$/, ''));
    } else {
      localStorage.removeItem('LUMINI_VOXCPM_URL');
    }
  }
};

const voxcpmBaseUrl = () => getActiveVoxCPMUrl();
const requireVoxcpmBaseUrl = () => {
  const url = voxcpmBaseUrl();
  if (!url) throw new Error('VoxCPM Voice Worker is not configured.');
  return url;
};

export interface VoxCPMStatus {
  online: boolean;
  engine: string;
  cuda: boolean;
  device: string;
  sample_rate: number;
  supports_zero_shot: boolean;
  supports_style_prompting: boolean;
}

export async function getVoxCPMStatus(): Promise<VoxCPMStatus | null> {
  const envUrl = (import.meta.env.VITE_VOXCPM_URL || '').replace(/\/$/, '');
  const currentUrl = voxcpmBaseUrl();

  if (currentUrl) {
    try {
      const res = await fetch(`${currentUrl}/api/voxcpm/status`, { 
        signal: AbortSignal.timeout(15000),
        headers: { 'ngrok-skip-browser-warning': 'true' }
      });
      if (res.ok) return await res.json();
    } catch {
      // If current active URL fails and envUrl is available and different, test and auto-switch to envUrl!
      if (envUrl && envUrl !== currentUrl) {
        try {
          const resEnv = await fetch(`${envUrl}/api/voxcpm/status`, { 
            signal: AbortSignal.timeout(15000),
            headers: { 'ngrok-skip-browser-warning': 'true' }
          });
          if (resEnv.ok) {
            setCustomVoxCPMUrl(envUrl);
            return await resEnv.json();
          }
        } catch {
          // ignore
        }
      }
    }
  } else if (envUrl) {
    try {
      const resEnv = await fetch(`${envUrl}/api/voxcpm/status`, { 
        signal: AbortSignal.timeout(15000),
        headers: { 'ngrok-skip-browser-warning': 'true' }
      });
      if (resEnv.ok) {
        setCustomVoxCPMUrl(envUrl);
        return await resEnv.json();
      }
    } catch {
      // ignore
    }
  }
  return null;
}

export async function createVoxCPMVoiceClone(
  name: string,
  audioFile: File | Blob,
  instruction = "Energetic movie recap narration style with fast pace",
  transcript?: string
): Promise<{ voiceId: string; name: string; instruction: string }> {
  const body = new FormData();
  body.append('name', name);
  body.append('instruction', instruction);
  if (transcript) body.append('transcript', transcript);
  body.append('file', audioFile, (audioFile as File).name || 'voice-sample.wav');

  let baseUrl = requireVoxcpmBaseUrl();
  const envUrl = (import.meta.env.VITE_VOXCPM_URL || '').replace(/\/$/, '');
  let response: Response;

  try {
    response = await fetch(`${baseUrl}/api/voxcpm/clone`, { 
      method: 'POST', 
      body,
      headers: { 'ngrok-skip-browser-warning': 'true' }
    });
  } catch (netErr) {
    if (envUrl && envUrl !== baseUrl) {
      baseUrl = envUrl;
      setCustomVoxCPMUrl(envUrl);
      response = await fetch(`${baseUrl}/api/voxcpm/clone`, { 
        method: 'POST', 
        body,
        headers: { 'ngrok-skip-browser-warning': 'true' }
      });
    } else {
      throw netErr;
    }
  }

  if (!response.ok) {
    const err = await response.json().catch(() => null);
    throw new Error(err?.detail || err?.error || 'VoxCPM Voice registration failed.');
  }
  return response.json();
}

export async function synthesizeVoxCPMSpeech(
  voiceId?: string | null,
  text: string = '',
  instruction?: string,
  speed = 1.0
): Promise<Blob> {
  // Reduced chunk size to 200 to prevent Colab GPU Out-Of-Memory crashes
  const chunks = splitTextIntoChunks(text, 200);
  if (chunks.length === 0) return new Blob([], { type: 'audio/wav' });

  const fetchChunkWithRetry = async (chunkText: string, retries = 2): Promise<ArrayBuffer> => {
    let lastErr: any;
    for (let attempt = 0; attempt <= retries; attempt++) {
      try {
        const body = new FormData();
        if (voiceId && voiceId !== 'default') {
          body.append('voice_id', voiceId);
        }
        body.append('text', chunkText);
        if (instruction) body.append('instruction', instruction);
        body.append('speed', String(speed));

        let baseUrl = requireVoxcpmBaseUrl();
        const envUrl = (import.meta.env.VITE_VOXCPM_URL || '').replace(/\/$/, '');
        let response: Response;

        try {
          response = await fetch(`${baseUrl}/api/voxcpm/synthesize`, {
            method: 'POST',
            body,
            headers: { 'ngrok-skip-browser-warning': 'true' }
          });
        } catch (netErr) {
          if (envUrl && envUrl !== baseUrl) {
            baseUrl = envUrl;
            setCustomVoxCPMUrl(envUrl);
            response = await fetch(`${baseUrl}/api/voxcpm/synthesize`, {
              method: 'POST',
              body,
              headers: { 'ngrok-skip-browser-warning': 'true' }
            });
          } else {
            throw netErr;
          }
        }

        if (!response.ok) {
          const err = await response.json().catch(() => null);
          throw new Error(err?.detail || err?.error || `VoxCPM speech synthesis failed (HTTP ${response.status})`);
        }
        return await response.arrayBuffer();
      } catch (err) {
        lastErr = err;
        console.warn(`Chunk fetch failed (attempt ${attempt + 1}/${retries + 1}):`, err);
        if (attempt < retries) {
          await new Promise(res => setTimeout(res, 2000)); // wait 2s before retry
        }
      }
    }
    throw lastErr;
  };

  const AudioContextClass = window.AudioContext || (window as any).webkitAudioContext;
  const ctx = new AudioContextClass();
  const buffers: AudioBuffer[] = [];

  try {
    for (let i = 0; i < chunks.length; i++) {
      if (i > 0) {
        // Small delay between chunks to avoid overloading the Colab GPU
        await new Promise(resolve => setTimeout(resolve, 1000));
      }
      const arrayBuffer = await fetchChunkWithRetry(chunks[i]);
      const audioBuffer = await ctx.decodeAudioData(arrayBuffer);
      buffers.push(audioBuffer);
    }
    
    if (buffers.length === 0) {
      throw new Error("Failed to decode any generated VoxCPM speech chunks.");
    }
    const concatenatedBuffer = concatenateAudioBuffers(ctx, buffers);
    return audioBufferToWav(concatenatedBuffer);
  } finally {
    if (ctx.state !== 'closed') ctx.close();
  }
}
