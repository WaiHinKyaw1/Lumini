
import React, { useState, useEffect } from 'react';
import { GoogleGenAI } from "@google/genai";
import { CREDIT_COSTS, ContentType } from '../types';

interface AIAvatarProps {
  onSpendCredits: (amount: number) => boolean;
}

const AIAvatar: React.FC<AIAvatarProps> = ({ onSpendCredits }) => {
  const [prompt, setPrompt] = useState('');
  const [isGenerating, setIsGenerating] = useState(false);
  const [videoUrl, setVideoUrl] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [hasKey, setHasKey] = useState(false);

  useEffect(() => {
    checkApiKey();
  }, []);

  const checkApiKey = async () => {
    const selected = await (window as any).aistudio.hasSelectedApiKey();
    setHasKey(selected);
  };

  const handleOpenKey = async () => {
    await (window as any).aistudio.openSelectKey();
    setHasKey(true);
  };

  const generateAvatar = async () => {
    if (!prompt.trim()) return;
    setError(null);

    if (!onSpendCredits(CREDIT_COSTS[ContentType.AI_AVATAR])) {
      setError("Insufficient credits!");
      return;
    }

    setIsGenerating(true);
    try {
      const ai = new GoogleGenAI({ apiKey: (process.env as any).API_KEY });
      
      let operation = await ai.models.generateVideos({
        model: 'veo-3.1-fast-generate-preview',
        prompt: `A professional talking head avatar, close-up shot, speaking clearly: ${prompt}`,
        config: {
          numberOfVideos: 1,
          resolution: '720p',
          aspectRatio: '16:9'
        }
      });

      // Poll for completion
      while (!operation.done) {
        await new Promise(resolve => setTimeout(resolve, 10000));
        operation = await ai.operations.getVideosOperation({ operation: operation });
      }

      const downloadLink = operation.response?.generatedVideos?.[0]?.video?.uri;
      if (downloadLink) {
        const response = await fetch(downloadLink, {
          method: 'GET',
          headers: {
            'x-goog-api-key': (process.env as any).API_KEY,
          },
        });
        const blob = await response.blob();
        setVideoUrl(URL.createObjectURL(blob));
      } else {
        throw new Error("Failed to retrieve generated video.");
      }

    } catch (err: any) {
      if (err.message?.includes("Requested entity was not found")) {
        setHasKey(false);
        setError("API Key session expired. Please re-select your key.");
      } else {
        setError(err.message || "Avatar generation failed");
      }
    } finally {
      setIsGenerating(false);
    }
  };

  if (!hasKey) {
    return (
      <div className="max-w-md mx-auto py-20 text-center space-y-6">
        <div className="w-20 h-20 bg-violet-600/10 rounded-3xl flex items-center justify-center mx-auto text-violet-600">
          <svg className="w-10 h-10" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 7a2 2 0 012 2m4 0a6 6 0 01-7.743 5.743L11 17H9v2H7v2H4a1 1 0 01-1-1v-2.586a1 1 0 01.293-.707l5.964-5.964A6 6 0 1121 9z" /></svg>
        </div>
        <div className="space-y-2">
          <h2 className="text-2xl font-black uppercase tracking-tighter text-slate-900 dark:text-white">API Key Required</h2>
          <p className="text-sm text-slate-500 dark:text-zinc-400">To use high-quality Veo video generation, you must select a paid Google Cloud API key.</p>
        </div>
        <button 
          onClick={handleOpenKey}
          className="w-full py-4 bg-violet-600 hover:bg-violet-500 text-white rounded-2xl font-black text-xs uppercase tracking-[0.2em] shadow-xl shadow-violet-600/20 transition-all"
        >
          Select API Key
        </button>
        <p className="text-[10px] text-slate-400 uppercase tracking-widest">
          See <a href="https://ai.google.dev/gemini-api/docs/billing" target="_blank" rel="noreferrer" className="underline">billing documentation</a> for details.
        </p>
      </div>
    );
  }

  return (
    <div className="max-w-4xl mx-auto pb-10">
      <div className="flex items-center gap-2 mb-6">
        <div className="w-8 h-8 bg-violet-600 rounded-lg flex items-center justify-center shadow-lg">
          <svg className="w-5 h-5 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M14.828 14.828a4 4 0 01-5.656 0M9 10h.01M15 10h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
          </svg>
        </div>
        <div>
          <h1 className="text-xl font-bold text-slate-900 dark:text-white">AI Talking Avatar</h1>
          <p className="text-slate-500 dark:text-zinc-400 text-[10px] font-bold uppercase tracking-widest">Digital Human Synthesis • {CREDIT_COSTS[ContentType.AI_AVATAR]} Credits</p>
        </div>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
        <div className="space-y-4">
          <div className="glass p-6 rounded-2xl border border-white/5 space-y-4">
            <h3 className="text-xs font-black uppercase tracking-widest text-slate-400 dark:text-zinc-500">Avatar Configuration</h3>
            
            <div className="space-y-2">
              <label className="block text-[10px] font-bold text-slate-500 uppercase tracking-widest">Talking Script / Prompt</label>
              <textarea 
                value={prompt}
                onChange={(e) => setPrompt(e.target.value)}
                placeholder="Describe the avatar and what they should say..."
                className="w-full h-40 bg-slate-50 dark:bg-black/20 border border-slate-200 dark:border-white/10 rounded-2xl p-4 text-sm text-slate-900 dark:text-white outline-none focus:ring-2 focus:ring-violet-500 transition-all resize-none"
              />
            </div>

            <button 
              onClick={generateAvatar}
              disabled={isGenerating || !prompt.trim()}
              className={`w-full py-4 rounded-xl font-black text-xs uppercase tracking-[0.2em] transition-all shadow-xl ${
                isGenerating || !prompt.trim()
                  ? 'bg-slate-100 dark:bg-white/5 text-slate-400 cursor-not-allowed'
                  : 'bg-violet-600 hover:bg-violet-500 text-white shadow-violet-600/20 active:scale-95'
              }`}
            >
              {isGenerating ? 'Synthesizing Digital Human...' : 'Generate AI Avatar'}
            </button>
          </div>

          {error && <div className="p-4 bg-rose-500/10 border border-rose-500/20 rounded-xl text-rose-500 text-xs font-bold text-center uppercase tracking-widest">{error}</div>}
        </div>

        <div className="space-y-4">
          <div className="glass p-4 rounded-2xl border border-white/5 aspect-video flex items-center justify-center bg-black overflow-hidden relative">
            {isGenerating ? (
              <div className="text-center space-y-4">
                <div className="w-12 h-12 border-4 border-violet-500/20 border-t-violet-500 rounded-full animate-spin mx-auto"></div>
                <div className="space-y-1">
                  <p className="text-[10px] text-white font-black uppercase tracking-widest">Generating Video...</p>
                  <p className="text-[8px] text-slate-500 uppercase tracking-widest">This may take up to 2 minutes</p>
                </div>
              </div>
            ) : videoUrl ? (
              <video src={videoUrl} controls className="w-full h-full object-contain" />
            ) : (
              <div className="text-center space-y-2 opacity-20">
                <svg className="w-16 h-16 mx-auto" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1} d="M15 10l4.553-2.276A1 1 0 0121 8.618v6.764a1 1 0 01-1.447.894L15 14M5 18h8a2 2 0 002-2V8a2 2 0 00-2-2H5a2 2 0 00-2 2v12a2 2 0 002 2z" /></svg>
                <p className="text-[10px] font-black uppercase tracking-widest">Avatar Output</p>
              </div>
            )}
          </div>

          {videoUrl && (
            <div className="flex justify-center">
              <a href={videoUrl} download="ai_avatar.mp4" className="px-6 py-2 bg-emerald-600 text-white rounded-xl text-[10px] font-black uppercase tracking-widest hover:bg-emerald-500 transition-all shadow-lg">
                Download Avatar Video
              </a>
            </div>
          )}
        </div>
      </div>
    </div>
  );
};

export default AIAvatar;
