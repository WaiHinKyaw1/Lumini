import { isMediaWorkerConfigured } from './mediaWorkerApi';

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

const voxcpmBaseUrl = () => (import.meta.env.VITE_VOXCPM_URL || import.meta.env.VITE_MEDIA_WORKER_URL || '').replace(/\/$/, '');
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
  try {
    const url = voxcpmBaseUrl();
    if (!url) return null;
    const res = await fetch(`${url}/api/voxcpm/status`, { signal: AbortSignal.timeout(8000) });
    if (!res.ok) return null;
    return await res.json();
  } catch {
    return null;
  }
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

  const response = await fetch(`${requireVoxcpmBaseUrl()}/api/voxcpm/clone`, { method: 'POST', body });
  if (!response.ok) {
    const err = await response.json().catch(() => null);
    throw new Error(err?.detail || err?.error || 'VoxCPM Voice registration failed.');
  }
  return response.json();
}

export async function synthesizeVoxCPMSpeech(
  voiceId: string,
  text: string,
  instruction?: string,
  speed = 1.0
): Promise<Blob> {
  const body = new FormData();
  body.append('voice_id', voiceId);
  body.append('text', text);
  if (instruction) body.append('instruction', instruction);
  body.append('speed', String(speed));

  const response = await fetch(`${requireVoxcpmBaseUrl()}/api/voxcpm/synthesize`, {
    method: 'POST',
    body,
  });
  if (!response.ok) {
    const err = await response.json().catch(() => null);
    throw new Error(err?.detail || err?.error || 'VoxCPM speech synthesis failed.');
  }
  return response.blob();
}
