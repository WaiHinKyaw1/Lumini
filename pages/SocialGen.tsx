
import React, { useState } from 'react';
import { generateText } from '../services/geminiService';
import { CREDIT_COSTS, ContentType } from '../types';

interface SocialGenProps {
  onSpendCredits: (amount: number) => boolean;
}

const SocialGen: React.FC<SocialGenProps> = ({ onSpendCredits }) => {
  const [input, setInput] = useState('');
  const [platform, setPlatform] = useState<'TIKTOK' | 'INSTAGRAM' | 'FACEBOOK' | 'TWITTER'>('TIKTOK');
  const [isGenerating, setIsGenerating] = useState(false);
  const [result, setResult] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const handleGenerate = async () => {
    if (!input.trim()) return;
    setError(null);

    if (!onSpendCredits(CREDIT_COSTS[ContentType.SOCIAL_GEN])) {
      setError("Insufficient credits!");
      return;
    }

    setIsGenerating(true);
    try {
      const systemInstruction = `You are a viral social media strategist. Your goal is to create high-engagement posts for ${platform}.`;
      const prompt = `Create a viral post for ${platform} based on the following content:
      
      CONTENT: ${input}
      
      REQUIREMENTS:
      - Use platform-specific formatting (e.g. hashtags for Instagram, hooks for TikTok).
      - Include a strong Call to Action (CTA).
      - Keep the tone engaging and relevant to the content.
      - If the content is in Burmese, respond in Burmese. Otherwise, use English.`;

      const text = await generateText(prompt, systemInstruction);
      setResult(text);
    } catch (err: any) {
      setError(err.message || "Generation failed");
    } finally {
      setIsGenerating(false);
    }
  };

  return (
    <div className="max-w-2xl mx-auto pb-10">
      <div className="flex items-center gap-2 mb-6">
        <div className="w-8 h-8 bg-pink-600 rounded-lg flex items-center justify-center shadow-lg">
          <svg className="w-5 h-5 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M11 5.882V19.24a1.76 1.76 0 01-3.417.592l-2.147-6.15M18 13a3 3 0 100-6M5.436 13.683A4.001 4.001 0 017 6h1.832c4.1 0 7.625-1.234 9.168-3v14c-1.543-1.766-5.067-3-9.168-3H7a3.988 3.988 0 01-1.564-.317z" />
          </svg>
        </div>
        <div>
          <h1 className="text-xl font-bold text-slate-900 dark:text-white">Social Post Generator</h1>
          <p className="text-slate-500 dark:text-zinc-400 text-[10px] font-bold uppercase tracking-widest">Viral Content Strategy • {CREDIT_COSTS[ContentType.SOCIAL_GEN]} Credits</p>
        </div>
      </div>

      <div className="glass p-6 rounded-2xl border border-white/5 space-y-6">
        <div className="space-y-2">
          <label className="block text-[10px] font-bold text-slate-500 uppercase tracking-widest">Source Content / Topic</label>
          <textarea 
            value={input}
            onChange={(e) => setInput(e.target.value)}
            placeholder="Paste your script, recap, or just a topic here..."
            className="w-full h-40 bg-slate-50 dark:bg-black/20 border border-slate-200 dark:border-white/10 rounded-2xl p-4 text-sm text-slate-900 dark:text-white outline-none focus:ring-2 focus:ring-pink-500 transition-all resize-none"
          />
        </div>

        <div className="space-y-2">
          <label className="block text-[10px] font-bold text-slate-500 uppercase tracking-widest">Target Platform</label>
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
            {(['TIKTOK', 'INSTAGRAM', 'FACEBOOK', 'TWITTER'] as const).map((p) => (
              <button
                key={p}
                onClick={() => setPlatform(p)}
                className={`py-3 rounded-xl text-[10px] font-black uppercase tracking-widest border transition-all ${
                  platform === p 
                    ? 'bg-pink-600 border-pink-500 text-white shadow-lg shadow-pink-600/20' 
                    : 'bg-transparent border-slate-200 dark:border-white/10 text-slate-500 dark:text-zinc-500 hover:border-pink-500/50'
                }`}
              >
                {p}
              </button>
            ))}
          </div>
        </div>

        <button 
          onClick={handleGenerate}
          disabled={isGenerating || !input.trim()}
          className={`w-full py-4 rounded-2xl font-black text-xs uppercase tracking-[0.2em] transition-all shadow-xl ${
            isGenerating || !input.trim()
              ? 'bg-slate-100 dark:bg-white/5 text-slate-400 cursor-not-allowed'
              : 'bg-pink-600 hover:bg-pink-500 text-white shadow-pink-600/20 active:scale-95'
          }`}
        >
          {isGenerating ? 'Strategizing...' : 'Generate Viral Post'}
        </button>
      </div>

      {result && (
        <div className="mt-8 animate-in slide-in-from-bottom-6 duration-500">
          <div className="glass p-6 rounded-3xl border border-white/10 shadow-2xl relative overflow-hidden">
            <div className="absolute top-0 right-0 p-6">
              <button 
                onClick={() => navigator.clipboard.writeText(result)}
                className="px-4 py-2 bg-pink-600 text-white rounded-xl text-[10px] font-black uppercase tracking-widest hover:bg-pink-500 transition-all shadow-lg"
              >
                Copy Post
              </button>
            </div>
            <div className="mb-6">
              <h3 className="text-sm font-black text-slate-900 dark:text-white uppercase tracking-widest mb-1">{platform} Strategy</h3>
              <div className="h-1 w-12 bg-pink-600 rounded-full"></div>
            </div>
            <div className="whitespace-pre-wrap text-sm text-slate-700 dark:text-zinc-300 leading-relaxed font-medium">
              {result}
            </div>
          </div>
        </div>
      )}

      {error && (
        <div className="mt-4 p-4 bg-rose-500/10 border border-rose-500/20 rounded-2xl text-rose-500 text-xs font-bold text-center uppercase tracking-widest">
          {error}
        </div>
      )}
    </div>
  );
};

export default SocialGen;
