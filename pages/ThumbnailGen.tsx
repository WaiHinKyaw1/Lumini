
import React, { useState, useRef } from 'react';
import { generateImage, generateText } from '../services/geminiService';
import { CREDIT_COSTS, ContentType } from '../types';

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
  const isMounted = useRef(true);

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
      <div className="flex items-center gap-2 mb-3">
        <div className="w-7 h-7 bg-amber-500 rounded-lg flex items-center justify-center shadow-lg shadow-amber-500/20">
          <svg className="w-4 h-4 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 5a1 1 0 011-1h14a1 1 0 011 1v14a1 1 0 01-1 1H5a1 1 0 01-1-1V5z M4 13h16 M13 4v9 M4 9h9" />
          </svg>
        </div>
        <div>
          <h1 className="text-lg font-bold text-slate-900 dark:text-white">Thumbnail Studio</h1>
          <p className="text-slate-500 dark:text-zinc-400 text-[9px] font-bold uppercase tracking-widest">Viral Design • {CREDIT_COSTS[ContentType.THUMBNAIL]} Credits</p>
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-12 gap-3">
        <div className="lg:col-span-5 space-y-2">
          <div className="glass p-3 rounded-lg border border-white/5 space-y-3">
            <div className="flex gap-2">
                <div 
                    onClick={() => fileInputRef.current?.click()}
                    className={`w-14 h-14 rounded-lg border border-dashed flex flex-col items-center justify-center cursor-pointer transition-all flex-shrink-0 ${file ? 'border-amber-500 bg-amber-500/10' : 'border-slate-300 dark:border-white/20 hover:bg-slate-50 dark:hover:bg-white/5'}`}
                >
                     {file ? (
                         <div className="relative w-full h-full p-1">
                             <div className="w-full h-full bg-amber-500 rounded-md flex items-center justify-center text-white font-bold text-[7px]">
                                 IMG
                             </div>
                         </div>
                     ) : (
                         <>
                            <svg className="w-3.5 h-3.5 text-slate-400" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 16l4.586-4.586a2 2 0 012.828 0L16 16m-2-2l1.586-1.586a2 2 0 012.828 0L20 14m-6-6h.01M6 20h12a2 2 0 002-2V6a2 2 0 00-2-2H6a2 2 0 00-2 2v12a2 2 0 002 2z" /></svg>
                            <span className="text-[6px] font-bold text-slate-400 mt-0.5 uppercase">Upload</span>
                         </>
                     )}
                     <input ref={fileInputRef} type="file" accept="image/*,.png,.jpg,.jpeg" onChange={handleFileChange} className="hidden" />
                </div>
                
                <div className="flex-1 space-y-1">
                     <div className="flex justify-between items-center">
                        <label className="block text-[8px] font-black uppercase tracking-widest text-slate-400 dark:text-zinc-500">Thumbnail Title</label>
                        {isMyanmarText && <span className="text-[7px] font-black text-amber-500 uppercase tracking-widest animate-pulse">Unicode Active</span>}
                     </div>
                     <input
                        type="text"
                        value={titleText}
                        onChange={(e) => setTitleText(e.target.value)}
                        placeholder="Title..."
                        className={`w-full h-9 bg-slate-50 dark:bg-black/20 border border-slate-200 dark:border-white/10 rounded-lg px-2 text-[10px] font-bold text-slate-900 dark:text-white focus:ring-1 focus:ring-amber-500 outline-none ${isMyanmarText ? 'tracking-normal' : ''}`}
                     />
                </div>
            </div>

            <div>
              <label className="block text-[8px] font-black uppercase tracking-widest text-slate-400 dark:text-zinc-500 mb-1">Topic / Concept</label>
              <textarea
                value={topic}
                onChange={(e) => setTopic(e.target.value)}
                placeholder="Topic..."
                className={`w-full h-14 bg-slate-50 dark:bg-black/20 border border-slate-200 dark:border-white/10 rounded-lg p-2 text-[10px] text-slate-900 dark:text-white focus:ring-1 focus:ring-amber-500 outline-none transition-all resize-none ${isMyanmarText ? 'tracking-normal' : ''}`}
              />
            </div>

            <div>
              <label className="block text-[8px] font-black uppercase tracking-widest text-slate-400 dark:text-zinc-500 mb-1">Visual Style</label>
              <div className="grid grid-cols-3 gap-1">
                {styles.map((s) => (
                  <button
                    key={s.name}
                    onClick={() => setStyle(s.name)}
                    className={`py-1 rounded-md text-[7px] font-black uppercase tracking-wider transition-all border ${
                      style === s.name 
                        ? 'bg-amber-600 border-amber-500 text-white' 
                        : 'bg-transparent border-slate-200 dark:border-white/10 text-slate-500 dark:text-zinc-500 hover:bg-slate-50 dark:hover:bg-white/5'
                    }`}
                  >
                    {s.name}
                  </button>
                ))}
              </div>
            </div>

            <button
              onClick={handleGenerate}
              disabled={isGenerating || !topic}
              className={`w-full py-2 rounded-lg text-[8px] font-black uppercase tracking-widest transition-all ${
                isGenerating || !topic 
                  ? 'bg-slate-200 dark:bg-white/5 text-slate-400 dark:text-zinc-600 cursor-not-allowed' 
                  : 'bg-amber-600 hover:bg-amber-500 text-white shadow-md shadow-amber-600/10 active:scale-95'
              }`}
            >
              {isGenerating ? 'Designing...' : 'Generate Thumbnail'}
            </button>
          </div>

          {hooks.length > 0 && (
            <div className="glass p-2 rounded-lg border border-white/5">
              <h3 className="text-[8px] font-black uppercase tracking-widest text-amber-500 mb-1">CTR Title Hooks</h3>
              <div className="space-y-1">
                {hooks.map((hook, i) => (
                  <div key={i} className={`bg-slate-50 dark:bg-white/5 p-1 rounded-md text-[8px] font-bold text-slate-700 dark:text-zinc-300 border border-slate-100 dark:border-white/5 ${isMyanmarText ? 'tracking-normal' : ''}`}>
                    {hook}
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>

        <div className="lg:col-span-7">
          {isGenerating ? (
            <div className="glass aspect-video rounded-lg border border-white/5 flex flex-col items-center justify-center animate-pulse">
              <div className="w-6 h-6 border-4 border-amber-500/20 border-t-amber-500 rounded-full animate-spin mb-2"></div>
              <p className="text-slate-400 dark:text-zinc-500 font-black uppercase tracking-widest text-[8px]">Processing...</p>
            </div>
          ) : result ? (
            <div className="space-y-1.5">
              <div className="glass p-1 rounded-lg border border-white/10 shadow-lg overflow-hidden">
                <div className="relative aspect-video rounded-md overflow-hidden bg-black group">
                  <img src={result} alt="Generated Thumbnail" className="w-full h-full object-cover transition-transform duration-700 group-hover:scale-105" />
                </div>
              </div>
              <div className="flex justify-between items-center px-1">
                <div className="flex gap-2">
                  <button onClick={() => window.open(result, '_blank')} className="text-amber-500 hover:underline text-[7px] font-black uppercase tracking-widest">Full Res</button>
                  <a href={result} download="viral_thumbnail.png" className="text-emerald-500 hover:underline text-[7px] font-black uppercase tracking-widest">Download</a>
                </div>
              </div>
            </div>
          ) : (
            <div className="glass aspect-video rounded-lg border border-dashed border-slate-300 dark:border-white/10 flex flex-col items-center justify-center text-center p-4 bg-slate-50/50 dark:bg-white/[0.01]">
              <div className="w-7 h-7 bg-slate-100 dark:bg-white/5 rounded-lg flex items-center justify-center mb-2 text-slate-400 dark:text-zinc-600">
                <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M4 16l4.586-4.586a2 2 0 012.828 0L16 16m-2-2l1.586-1.586a2 2 0 012.828 0L20 14m-6-6h.01M6 20h12a2 2 0 002-2V6a2 2 0 00-2-2H6a2 2 0 00-2 2v12a2 2 0 002 2z" />
                </svg>
              </div>
              <p className="text-slate-500 dark:text-zinc-500 text-[8px] font-bold uppercase tracking-widest">Thumbnail Canvas</p>
            </div>
          )}
        </div>
      </div>

      {error && (
        <div className="mt-3 p-2 bg-rose-500/10 border border-rose-500/20 text-rose-500 text-[8px] font-bold text-center rounded-lg animate-in fade-in">
          {error}
        </div>
      )}
    </div>
  );
};

export default ThumbnailGen;
