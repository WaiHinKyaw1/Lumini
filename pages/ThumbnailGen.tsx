
import React, { useState, useRef, useEffect } from 'react';
import { generateImage, generateText } from '../services/geminiService';
import { CREDIT_COSTS, ContentType } from '../types';
import { getBrandKit, BrandKitData } from '../src/utils/brandKit';

interface ThumbnailGenProps {
  onSpendCredits: (amount: number) => boolean;
}

const ThumbnailGen: React.FC<ThumbnailGenProps> = ({ onSpendCredits }) => {
  const [topic, setTopic] = useState('');
  const [titleText, setTitleText] = useState('');
  const [style, setStyle] = useState('Gaming');
  const [isGenerating, setIsGenerating] = useState(false);
  const [result, setResult] = useState<string | null>(null);
  const [hooks, setHooks] = useState<string[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [file, setFile] = useState<File | null>(null);
  const [useBrandKit, setUseBrandKit] = useState(false);
  const [brandKit, setBrandKit] = useState<BrandKitData | null>(null);
  const isMounted = useRef(true);

  useEffect(() => {
    const kit = getBrandKit();
    if (kit) {
      setBrandKit(kit);
      setUseBrandKit(true);
    }
  }, []);

  React.useEffect(() => {
    return () => {
      isMounted.current = false;
    };
  }, []);

  const fileInputRef = useRef<HTMLInputElement>(null);

  const styles = [
    { name: 'Gaming', prompt: 'high contrast, saturated, gaming background, dramatic lighting, epic character focus' },
    { name: 'Vlog', prompt: 'bright, cheerful, real-life aesthetic, high quality photography, soft shadows' },
    { name: 'Mystery', prompt: 'dark, moody, curiosity-gap, silhouette focus, glowing highlights, high tension' },
    { name: 'Educational', prompt: 'clean, professional, diagram-style elements, high readability, solid background colors' },
    { name: 'Cinematic', prompt: 'movie poster aesthetic, 8k resolution, photorealistic, cinematic depth of field' }
  ];

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    if (e.target.files && e.target.files[0]) {
      setFile(e.target.files[0]);
    }
  };

  const fileToBase64 = (file: File): Promise<string> => {
    return new Promise((resolve, reject) => {
      const reader = new FileReader();
      reader.readAsDataURL(file);
      reader.onload = () => {
        const base64 = (reader.result as string).split(',')[1];
        resolve(base64);
      };
      reader.onerror = (error) => reject(error);
    });
  };

  const containsMyanmar = (text: string) => /[\u1000-\u109F\uAA60-\uAA7F]/.test(text);

  const isMyanmarText = containsMyanmar(topic) || containsMyanmar(titleText);

  const handleGenerate = async () => {
    if (!topic.trim()) return;
    setError(null);
    setResult(null);
    setHooks([]);

    if (file && file.size > 10 * 1024 * 1024) {
      setError("Image is too large (Max 10MB). Please use a smaller file to prevent browser crashes.");
      return;
    }

    if (!onSpendCredits(CREDIT_COSTS[ContentType.THUMBNAIL])) {
      setError("Insufficient credits!");
      return;
    }

    setIsGenerating(true);
    try {
      const selectedStyle = styles.find(s => s.name === style);
      
      let thumbPrompt = `Professional YouTube Thumbnail for: "${topic}". Style: ${style}. Attributes: ${selectedStyle?.prompt}. Include a vibrant focal point, high-contrast text area, and viral appeal.`;
      
      if (useBrandKit && brandKit) {
          thumbPrompt += ` IMPORTANT: Use the brand colors: Primary (${brandKit.primaryColor}), Secondary (${brandKit.secondaryColor}). The brand name is "${brandKit.brandName}". Use a font style similar to "${brandKit.fontFamily}". The overall aesthetic should be consistent with this brand kit.`;
      }

      if (titleText) {
          const fontNote = isMyanmarText 
            ? "CRITICAL: Use high-quality, clean, bold Myanmar (Burmese) Unicode typography. Ensure characters are perfectly formed, properly spaced, and highly legible. The font must be a modern, thick sans-serif style suitable for thumbnails." 
            : "Use bold, readable modern font.";
          thumbPrompt += ` The text "${titleText}" should be prominently displayed on the thumbnail. ${fontNote}`;
      }
      
      let imageBase64: string | undefined = undefined;
      let mimeType: string | undefined = undefined;

      if (file) {
          imageBase64 = await fileToBase64(file);
          mimeType = file.type;
          thumbPrompt += " Use the provided image as the main reference or composition base.";
      }

      if (isMyanmarText) {
          thumbPrompt += " IMPORTANT: The text is in Myanmar (Burmese) script. Render it using standard Unicode glyphs. Avoid any distortion, overlapping, or broken circles in the characters. The typography must be professional, clear, and follow standard Burmese Unicode rendering rules.";
      }
      
      const hookSystemPrompt = isMyanmarText 
        ? "You are a YouTube viral growth expert. Respond only in Burmese Unicode. Use natural, modern phrasing." 
        : "You are a YouTube viral growth expert.";

      const [imageUrl, hooksText] = await Promise.all([
        generateImage(thumbPrompt, "16:9", imageBase64, mimeType),
        generateText(`Generate 3 viral, high-CTR YouTube title hooks for a video about: ${topic}. Format as a simple list.`, hookSystemPrompt)
      ]);

      if (isMounted.current) {
        setResult(imageUrl);
        const hookList = hooksText.split('\n').filter(h => h.trim().match(/^\d\.|^-/)).map(h => h.replace(/^\d\.\s*|^- \s*/, ''));
        setHooks(hookList);
      }

    } catch (err: any) {
      if (isMounted.current) {
        setError(err.message || "Failed to generate thumbnail");
      }
    } finally {
      if (isMounted.current) {
        setIsGenerating(false);
      }
    }
  };

  return (
    <div className="max-w-5xl mx-auto pb-6">
      <div className="flex items-center gap-3 mb-6">
        <div className="w-10 h-10 bg-accent rounded-xl flex items-center justify-center shadow-lg shadow-accent/20">
          <svg className="w-5 h-5 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 5a1 1 0 011-1h14a1 1 0 011 1v14a1 1 0 01-1 1H5a1 1 0 01-1-1V5z M4 13h16 M13 4v9 M4 9h9" />
          </svg>
        </div>
        <div>
          <h1 className="movie-h2 !text-xl !mb-0 uppercase tracking-tighter">Thumbnail Studio</h1>
          <p className="movie-meta !text-[10px] !mb-0 uppercase tracking-widest text-zinc-500">Viral Design • {CREDIT_COSTS[ContentType.THUMBNAIL]} Credits</p>
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-12 gap-4">
        <div className="lg:col-span-5 space-y-4">
          <div className="glass p-6 rounded-2xl border border-white/5 space-y-6 shadow-xl">
            <div className="flex gap-4">
                <div 
                    onClick={() => fileInputRef.current?.click()}
                    className={`w-16 h-16 rounded-xl border border-dashed flex flex-col items-center justify-center cursor-pointer transition-all flex-shrink-0 ${file ? 'border-accent bg-accent/10 shadow-[0_0_10px_rgba(225,29,72,0.2)]' : 'border-white/10 hover:bg-white/5'}`}
                >
                     {file ? (
                         <div className="relative w-full h-full p-1">
                             <div className="w-full h-full bg-accent rounded-lg flex items-center justify-center text-white font-black text-[9px] uppercase tracking-widest">
                                 IMG
                             </div>
                         </div>
                     ) : (
                         <>
                            <svg className="w-5 h-5 text-zinc-600 mb-1" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 16l4.586-4.586a2 2 0 012.828 0L16 16m-2-2l1.586-1.586a2 2 0 012.828 0L20 14m-6-6h.01M6 20h12a2 2 0 002-2V6a2 2 0 00-2-2H6a2 2 0 00-2 2v12a2 2 0 002 2z" /></svg>
                            <span className="movie-meta !text-[8px] text-zinc-600 uppercase tracking-widest !mb-0">Ref</span>
                         </>
                     )}
                     <input ref={fileInputRef} type="file" accept="image/*,.png,.jpg,.jpeg" onChange={handleFileChange} className="hidden" />
                </div>
                
                <div className="flex-1 space-y-2">
                     <div className="flex justify-between items-center px-1">
                        <label className="movie-meta !text-[10px] uppercase tracking-widest text-zinc-500 !mb-0">Headline Alpha</label>
                        {isMyanmarText && <span className="movie-meta !text-[8px] text-accent uppercase tracking-[0.2em] animate-pulse !mb-0">Unicode Active</span>}
                     </div>
                     <input
                        type="text"
                        value={titleText}
                        onChange={(e) => setTitleText(e.target.value)}
                        placeholder="Title Hook..."
                        className={`w-full h-11 bg-slate-50 dark:bg-black/20 border border-slate-200 dark:border-white/10 rounded-xl px-4 movie-body !text-[14px] text-slate-900 dark:text-white focus:ring-2 focus:ring-accent outline-none ${isMyanmarText ? 'tracking-normal' : ''}`}
                     />
                </div>
            </div>

            <div className="space-y-2">
              <label className="movie-meta !text-[10px] uppercase tracking-widest text-zinc-500 px-1 !mb-0">Topic Matrix</label>
              <textarea
                value={topic}
                onChange={(e) => setTopic(e.target.value)}
                placeholder="Describe your video core concepts..."
                className={`w-full h-24 bg-slate-50 dark:bg-black/20 border border-slate-200 dark:border-white/10 rounded-xl p-4 movie-body !text-[14px] text-slate-900 dark:text-white focus:ring-2 focus:ring-accent outline-none transition-all resize-none ${isMyanmarText ? 'tracking-normal' : ''} leading-relaxed`}
              />
            </div>

            <div className="space-y-3">
              <label className="movie-meta !text-[10px] uppercase tracking-widest text-zinc-500 px-1 !mb-0">Aesthetic Engine</label>
              <div className="grid grid-cols-5 gap-1.5">
                {styles.map((s) => (
                  <button
                    key={s.name}
                    onClick={() => setStyle(s.name)}
                    className={`py-2 rounded-lg movie-meta !text-[9px] uppercase tracking-wider transition-all border !mb-0 ${
                      style === s.name 
                        ? 'bg-accent border-accent text-white shadow-lg shadow-accent/20' 
                        : 'bg-transparent border-white/5 text-zinc-500 hover:bg-white/5'
                    }`}
                  >
                    {s.name}
                  </button>
                ))}
              </div>
            </div>

            {brandKit && (
              <div className="flex items-center justify-between p-3 bg-white/5 rounded-xl border border-white/10">
                <div className="flex items-center gap-3">
                  <div className="w-3 h-3 rounded-full" style={{ backgroundColor: brandKit.primaryColor }}></div>
                  <span className="movie-meta !text-[10px] uppercase tracking-widest text-zinc-400 !mb-0">Apply Brand Matrix: {brandKit.brandName}</span>
                </div>
                <button 
                  onClick={() => setUseBrandKit(!useBrandKit)}
                  className={`w-8 h-4 rounded-full transition-all relative ${useBrandKit ? 'bg-accent' : 'bg-white/10'}`}
                >
                  <div className={`absolute top-0.5 w-3 h-3 bg-white rounded-full transition-all ${useBrandKit ? 'right-0.5' : 'left-0.5'}`}></div>
                </button>
              </div>
            )}

            <button
              onClick={handleGenerate}
              disabled={isGenerating || !topic}
              className={`w-full py-4 rounded-xl movie-meta !text-[12px] uppercase tracking-[0.25em] transition-all shadow-2xl ${
                isGenerating || !topic 
                  ? 'bg-white/5 text-zinc-600 cursor-not-allowed' 
                  : 'bg-accent hover:bg-accent-hover text-white shadow-accent/20 active:scale-[0.98]'
              }`}
            >
              {isGenerating ? 'Designing Matrix...' : 'Generate Neural Thumbnail'}
            </button>
          </div>

          {hooks.length > 0 && (
            <div className="glass p-4 rounded-2xl border border-white/5 space-y-3 shadow-xl">
              <h3 className="movie-meta !text-[10px] uppercase tracking-[0.3em] text-accent !mb-0 px-1">Viral CTR Title Hooks</h3>
              <div className="space-y-2">
                {hooks.map((hook, i) => (
                  <div key={i} className={`bg-black/20 p-3 rounded-xl movie-body !text-[14px] text-zinc-300 border border-white/5 ${isMyanmarText ? 'tracking-normal' : ''} !leading-tight`}>
                    {hook}
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>

        <div className="lg:col-span-7">
          {isGenerating ? (
            <div className="glass aspect-video rounded-2xl border border-white/5 flex flex-col items-center justify-center animate-pulse shadow-2xl">
              <div className="w-10 h-10 border-4 border-accent/20 border-t-accent rounded-full animate-spin mb-4 shadow-[0_0_15px_rgba(225,29,72,0.3)]"></div>
              <p className="movie-meta !text-[12px] text-zinc-600 uppercase tracking-widest !mb-0">Processing Neural Design...</p>
            </div>
          ) : result ? (
            <div className="space-y-4">
              <div className="glass p-2 rounded-2xl border border-white/10 shadow-2xl overflow-hidden group relative">
                <div className="absolute inset-0 bg-gradient-to-t from-black/50 to-transparent pointer-events-none z-10 opacity-0 group-hover:opacity-100 transition-opacity"></div>
                <div className="relative aspect-video rounded-xl overflow-hidden bg-black shadow-inner">
                  <img src={result} alt="Generated Thumbnail" className="w-full h-full object-cover transition-transform duration-1000 group-hover:scale-105" />
                </div>
              </div>
              <div className="flex justify-between items-center px-4">
                <div className="flex gap-6">
                  <button onClick={() => window.open(result, '_blank')} className="movie-meta !text-[10px] text-accent hover:text-accent-hover uppercase tracking-widest !mb-0 transition-colors flex items-center gap-2">
                    <svg className="w-3 h-3" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" /><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M2.458 12C3.732 7.943 7.523 5 12 5c4.478 0 8.268 2.943 9.542 7-1.274 4.057-5.064 7-9.542 7-4.477 0-8.268-2.943-9.542-7z" /></svg>
                    Full Analysis
                  </button>
                  <a href={result} download="viral_thumbnail.png" className="movie-meta !text-[10px] text-emerald-500 hover:text-emerald-400 uppercase tracking-widest !mb-0 transition-colors flex items-center gap-2">
                    <svg className="w-3 h-3" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 16v1a2 2 0 002 2h12a2 2 0 002-2v-1m-4-4l-4 4m0 0l-4-4m4 4V4" /></svg>
                    Commit to Disk
                  </a>
                </div>
              </div>
            </div>
          ) : (
            <div className="glass aspect-video rounded-3xl border border-dashed border-white/10 flex flex-col items-center justify-center text-center p-10 bg-black/20 shadow-2xl shadow-black/50">
              <div className="w-12 h-12 bg-white/5 rounded-2xl flex items-center justify-center mb-6 text-zinc-800 shadow-inner">
                <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M4 16l4.586-4.586a2 2 0 012.828 0L16 16m-2-2l1.586-1.586a2 2 0 012.828 0L20 14m-6-6h.01M6 20h12a2 2 0 002-2V6a2 2 0 00-2-2H6a2 2 0 00-2 2v12a2 2 0 002 2z" />
                </svg>
              </div>
              <p className="movie-h2 !text-lg !text-zinc-600 uppercase tracking-[0.3em] !mb-2">Matrix Canvas</p>
              <p className="movie-meta !text-[10px] text-zinc-700 uppercase tracking-widest !mb-0">Neural Layout Engine Offline</p>
            </div>
          )}
        </div>
      </div>

      {error && (
        <div className="mt-6 p-4 bg-rose-500/10 border border-rose-500/20 text-rose-500 movie-meta !text-[11px] uppercase tracking-widest text-center rounded-xl animate-in fade-in transition-all !mb-0">
          <svg className="w-4 h-4 inline-block mr-2 -mt-0.5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 8v4m0 4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" /></svg>
          {error}
        </div>
      )}
}
    </div>
  );
};

export default ThumbnailGen;
