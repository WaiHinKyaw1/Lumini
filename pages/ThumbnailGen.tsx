
import React, { useState, useRef } from 'react';
import { generateImage, generateText } from '../services/geminiService';
import { CREDIT_COSTS, ContentType, GenerationResult } from '../types';
import HistoryList from '../components/HistoryList';

interface ThumbnailGenProps {
  onSpendCredits: (amount: number) => boolean;
  onSaveResult: (result: Omit<GenerationResult, 'id' | 'timestamp'>) => void;
  history: GenerationResult[];
  onDelete: (id: string) => void;
}

const ThumbnailGen: React.FC<ThumbnailGenProps> = ({ onSpendCredits, onSaveResult, history, onDelete }) => {
  const [topic, setTopic] = useState('');
  const [titleText, setTitleText] = useState('');
  const [style, setStyle] = useState('Gaming');
  const [isGenerating, setIsGenerating] = useState(false);
  const [result, setResult] = useState<string | null>(null);
  const [hooks, setHooks] = useState<string[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [file, setFile] = useState<File | null>(null);

  const fileInputRef = useRef<HTMLInputElement>(null);

  const styles = [
    { name: 'Gaming', prompt: 'high contrast, saturated, gaming background, dramatic lighting, epic character focus' },
    { name: 'Vlog', prompt: 'bright, cheerful, real-life aesthetic, high quality photography, soft shadows' },
    { name: 'Mystery', prompt: 'dark, moody, curiosity-gap, silhouette focus, glowing highlights, high tension' },
    { name: 'Educational', prompt: 'clean, professional, diagram-style elements, high readability, solid background colors' },
    { name: 'Cinematic', prompt: 'movie poster aesthetic, 8k resolution, photorealistic, cinematic depth of field' }
  ];

  const handleHistorySelect = (item: GenerationResult) => {
    if (item.url) setResult(item.url);
    if (item.prompt) {
        // Prompt includes "Thumbnail: " prefix, we can try to clean it or just set it
        const cleanTopic = item.prompt.replace(/^Thumbnail: /, '');
        setTopic(cleanTopic);
    }
    if (item.metadata?.style) setStyle(item.metadata.style);
    if (item.metadata?.title) setTitleText(item.metadata.title);
    
    // Attempt to extract hooks from content if possible, though exact parsing depends on save format
    if (item.content) {
        const extractedHooks = item.content.split('\n').filter(line => line.match(/^\d\.|^-/));
        if (extractedHooks.length > 0) {
            setHooks(extractedHooks);
        }
    }
    
    window.scrollTo({ top: 0, behavior: 'smooth' });
  };

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

  const containsMyanmar = (text: string) => /[\u1000-\u109F]/.test(text);

  const handleGenerate = async () => {
    if (!topic.trim()) return;
    setError(null);
    setResult(null);
    setHooks([]);

    if (!onSpendCredits(CREDIT_COSTS[ContentType.THUMBNAIL])) {
      setError("Insufficient credits!");
      return;
    }

    setIsGenerating(true);
    try {
      const isMyanmar = containsMyanmar(topic) || containsMyanmar(titleText);
      const selectedStyle = styles.find(s => s.name === style);
      
      let thumbPrompt = `Professional YouTube Thumbnail for: "${topic}". Style: ${style}. Attributes: ${selectedStyle?.prompt}. Include a vibrant focal point, high-contrast text area, and viral appeal.`;
      
      if (titleText) {
          const fontNote = isMyanmar ? "Use clean, bold Myanmar Unicode typography." : "Use bold, readable modern font.";
          thumbPrompt += ` The text "${titleText}" should be prominently displayed on the thumbnail. ${fontNote}`;
      }
      
      let imageBase64: string | undefined = undefined;
      let mimeType: string | undefined = undefined;

      if (file) {
          imageBase64 = await fileToBase64(file);
          mimeType = file.type;
          thumbPrompt += " Use the provided image as the main reference or composition base.";
      }

      if (isMyanmar) {
          thumbPrompt += " Ensure all Myanmar characters are rendered according to Unicode standards without broken circles or overlapping glyphs.";
      }
      
      const hookSystemPrompt = isMyanmar 
        ? "You are a YouTube viral growth expert. Respond only in Burmese Unicode. Use natural, modern phrasing." 
        : "You are a YouTube viral growth expert.";

      const [imageUrl, hooksText] = await Promise.all([
        generateImage(thumbPrompt, "16:9", imageBase64, mimeType),
        generateText(`Generate 3 viral, high-CTR YouTube title hooks for a video about: ${topic}. Format as a simple list.`, hookSystemPrompt)
      ]);

      setResult(imageUrl);
      const hookList = hooksText.split('\n').filter(h => h.trim().match(/^\d\.|^-/)).map(h => h.replace(/^\d\.\s*|^- \s*/, ''));
      setHooks(hookList);

      // Save to History Database
      onSaveResult({
        type: ContentType.THUMBNAIL,
        prompt: `Thumbnail: ${topic}`,
        url: imageUrl,
        content: `Viral Hooks:\n${hookList.join('\n')}`,
        metadata: { style: style, title: titleText }
      });

    } catch (err: any) {
      setError(err.message || "Failed to generate thumbnail");
    } finally {
      setIsGenerating(false);
    }
  };

  return (
    <div className="max-w-5xl mx-auto pb-20">
      <div className="flex items-center gap-3 mb-5">
        <div className="w-10 h-10 bg-amber-500 rounded-xl flex items-center justify-center shadow-lg shadow-amber-500/20">
          <svg className="w-5 h-5 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 5a1 1 0 011-1h14a1 1 0 011 1v14a1 1 0 01-1 1H5a1 1 0 01-1-1V5z M4 13h16 M13 4v9 M4 9h9" />
          </svg>
        </div>
        <div>
          <h1 className="text-xl font-bold text-slate-900 dark:text-white">Thumbnail Studio</h1>
          <p className="text-slate-500 dark:text-zinc-400 text-xs">Design high-CTR viral thumbnails • {CREDIT_COSTS[ContentType.THUMBNAIL]} Credits</p>
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-12 gap-5">
        <div className="lg:col-span-5 space-y-3">
          <div className="glass p-4 rounded-2xl border border-white/5 space-y-3">
            <div className="flex gap-3">
                <div 
                    onClick={() => fileInputRef.current?.click()}
                    className={`w-20 h-20 rounded-xl border border-dashed flex flex-col items-center justify-center cursor-pointer transition-all flex-shrink-0 ${file ? 'border-amber-500 bg-amber-500/10' : 'border-slate-300 dark:border-white/20 hover:bg-slate-50 dark:hover:bg-white/5'}`}
                >
                     {file ? (
                         <div className="relative w-full h-full p-1">
                             <div className="w-full h-full bg-amber-500 rounded-lg flex items-center justify-center text-white font-bold text-[8px]">
                                IMG
                             </div>
                             <div className="absolute top-0 right-0 -mt-1 -mr-1 w-3 h-3 bg-rose-500 rounded-full border border-white"></div>
                         </div>
                     ) : (
                         <>
                            <svg className="w-5 h-5 text-slate-400" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 16l4.586-4.586a2 2 0 012.828 0L16 16m-2-2l1.586-1.586a2 2 0 012.828 0L20 14m-6-6h.01M6 20h12a2 2 0 002-2V6a2 2 0 00-2-2H6a2 2 0 00-2 2v12a2 2 0 002 2z" /></svg>
                            <span className="text-[8px] font-bold text-slate-400 mt-1 uppercase">Upload</span>
                         </>
                     )}
                     <input ref={fileInputRef} type="file" accept="image/*" onChange={handleFileChange} className="hidden" />
                </div>
                
                <div className="flex-1 space-y-1">
                     <label className="block text-[9px] font-black uppercase tracking-[0.2em] text-slate-400 dark:text-zinc-500">Thumbnail Title</label>
                     <input
                        type="text"
                        value={titleText}
                        onChange={(e) => setTitleText(e.target.value)}
                        placeholder="e.g. I WON $1,000,000!"
                        className="w-full h-12 bg-slate-50 dark:bg-black/20 border border-slate-200 dark:border-white/10 rounded-xl px-3 text-xs font-bold text-slate-900 dark:text-white focus:ring-1 focus:ring-amber-500 outline-none"
                     />
                </div>
            </div>

            <div>
              <label className="block text-[9px] font-black uppercase tracking-[0.2em] text-slate-400 dark:text-zinc-500 mb-1.5">Video Topic / Concept</label>
              <textarea
                value={topic}
                onChange={(e) => setTopic(e.target.value)}
                placeholder="e.g. Minecraft survival challenge..."
                className="w-full h-20 bg-slate-50 dark:bg-black/20 border border-slate-200 dark:border-white/10 rounded-xl p-3 text-xs text-slate-900 dark:text-white focus:ring-1 focus:ring-amber-500 outline-none transition-all resize-none"
              />
            </div>

            <div>
              <label className="block text-[9px] font-black uppercase tracking-[0.2em] text-slate-400 dark:text-zinc-500 mb-1.5">Visual Style</label>
              <div className="grid grid-cols-3 gap-1.5">
                {styles.map((s) => (
                  <button
                    key={s.name}
                    onClick={() => setStyle(s.name)}
                    className={`py-1.5 rounded-lg text-[9px] font-black uppercase tracking-wider transition-all border ${
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
              className={`w-full py-2.5 rounded-xl text-[10px] font-black uppercase tracking-widest transition-all shadow-lg ${
                isGenerating || !topic 
                  ? 'bg-slate-200 dark:bg-white/5 text-slate-400 dark:text-zinc-600 cursor-not-allowed' 
                  : 'bg-amber-600 hover:bg-amber-500 text-white shadow-amber-600/20 active:scale-95'
              }`}
            >
              {isGenerating ? 'Designing...' : 'Generate Thumbnail'}
            </button>
          </div>

          {hooks.length > 0 && (
            <div className="glass p-4 rounded-2xl border border-white/5 animate-in slide-in-from-left-4">
              <h3 className="text-[9px] font-black uppercase tracking-[0.2em] text-amber-500 mb-2">CTR Title Hooks</h3>
              <div className="space-y-1.5">
                {hooks.map((hook, i) => (
                  <div key={i} className="bg-slate-50 dark:bg-white/5 p-2 rounded-lg text-[10px] font-bold text-slate-700 dark:text-zinc-300 border border-slate-100 dark:border-white/5">
                    {hook}
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>

        <div className="lg:col-span-7">
          {isGenerating ? (
            <div className="glass aspect-video rounded-2xl border border-white/5 flex flex-col items-center justify-center animate-pulse">
              <div className="w-10 h-10 border-4 border-amber-500/20 border-t-amber-500 rounded-full animate-spin mb-4"></div>
              <p className="text-slate-400 dark:text-zinc-500 font-black uppercase tracking-widest text-[10px]">Processing Design...</p>
            </div>
          ) : result ? (
            <div className="space-y-3">
              <div className="glass p-1.5 rounded-2xl border border-white/10 shadow-xl overflow-hidden animate-in zoom-in duration-500">
                <div className="relative aspect-video rounded-xl overflow-hidden bg-black group">
                  <img src={result} alt="Generated Thumbnail" className="w-full h-full object-cover transition-transform duration-700 group-hover:scale-105" />
                  <div className="absolute inset-0 bg-gradient-to-t from-black/60 to-transparent opacity-0 group-hover:opacity-100 transition-opacity flex items-end p-6">
                    <p className="text-white text-[10px] font-bold uppercase tracking-widest">Master Studio Render • 16:9 4K Optimized</p>
                  </div>
                </div>
              </div>
              <div className="flex justify-between items-center px-1">
                <div className="flex gap-3">
                  <button onClick={() => window.open(result, '_blank')} className="text-amber-500 hover:underline text-[9px] font-black uppercase tracking-widest">Full Res</button>
                  <a href={result} download="viral_thumbnail.png" className="text-emerald-500 hover:underline text-[9px] font-black uppercase tracking-widest">Download</a>
                </div>
                <div className="flex items-center gap-1.5">
                   <div className="w-1.5 h-1.5 bg-emerald-500 rounded-full animate-pulse"></div>
                   <span className="text-[9px] font-black text-slate-400 dark:text-zinc-500 uppercase tracking-widest">Ready</span>
                </div>
              </div>
            </div>
          ) : (
            <div className="glass aspect-video rounded-2xl border border-dashed border-slate-300 dark:border-white/10 flex flex-col items-center justify-center text-center p-8 bg-slate-50/50 dark:bg-white/[0.01]">
              <div className="w-10 h-10 bg-slate-100 dark:bg-white/5 rounded-2xl flex items-center justify-center mb-3 text-slate-400 dark:text-zinc-600">
                <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M4 16l4.586-4.586a2 2 0 012.828 0L16 16m-2-2l1.586-1.586a2 2 0 012.828 0L20 14m-6-6h.01M6 20h12a2 2 0 002-2V6a2 2 0 00-2-2H6a2 2 0 00-2 2v12a2 2 0 002 2z" />
                </svg>
              </div>
              <h3 className="text-xs font-black text-slate-700 dark:text-white uppercase tracking-tight mb-1">Thumbnail Canvas</h3>
              <p className="text-slate-500 dark:text-zinc-500 text-[10px] max-w-xs mx-auto font-medium">Describe your video content to generate a viral master-grade thumbnail design.</p>
            </div>
          )}
        </div>
      </div>
      
      {error && (
        <div className="fixed bottom-10 left-1/2 -translate-x-1/2 bg-rose-500 text-white px-6 py-3 rounded-xl font-bold text-[10px] shadow-xl z-50 animate-in slide-in-from-bottom-10">
          {error}
        </div>
      )}
      <HistoryList history={history} onDelete={onDelete} onSelect={handleHistorySelect} />
    </div>
  );
};

export default ThumbnailGen;
