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
