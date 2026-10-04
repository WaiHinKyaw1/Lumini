import React, { useState, useRef, useEffect, useCallback } from 'react';
import { generateImage, generateText, ImageAspectRatio } from '../services/geminiService';
import { CREDIT_COSTS, ContentType } from '../types';
import { auth } from '../services/firebase';
import { logGeneration } from '../services/supabase';
import { LoadingSpinner } from '../components/LoadingSpinner';
import {
  Sparkles,
  Download,
  Copy,
  Type,
  Wand2,
  Check,
  RefreshCw,
  ImageIcon,
  Sliders,
  X,
  History
} from 'lucide-react';
import toast from 'react-hot-toast';
import { saveModuleHistory } from '../services/moduleHistory';
import { ModuleHistoryModal } from '../components/ModuleHistoryModal';

interface ThumbnailGenProps {
  onSpendCredits: (amount: number) => boolean;
}

export type BurmeseFontOption = 'font-akkhayar' | 'font-kunheing' | 'font-jojar' | 'font-myanmaros' | 'font-notosans';
export type TextColorTheme = 'yellow' | 'white' | 'orange' | 'cyan' | 'lime';

const STYLES = [
  { name: 'Cinematic', prompt: 'blockbuster cinematic movie scene, hyper-realistic, dramatic rim lighting, 8k resolution, depth of field, anamorphic lens flare, movie still photography' },
  { name: 'Horror', prompt: 'dark eerie horror atmosphere, mysterious foggy night, glowing high-contrast focal point, dramatic chiaroscuro shadow, cinematic suspense' },
  { name: 'Action', prompt: 'explosive high-octane action moment, vivid neon and fire reflections, intense hero expression, dynamic motion particles, 8k movie still' },
  { name: 'Drama', prompt: 'deep emotional storytelling still, poignant close-up lighting, cinematic film grain, raw authentic human expression' },
  { name: 'Viral High-Contrast', prompt: 'vibrant saturated colors, extreme high-contrast lighting, shocking viral focal element, clean separation between subject and background' },
  { name: 'Anime', prompt: 'epic anime movie aesthetic, Makoto Shinkai lighting style, magical glowing embers, vibrant fantasy landscape' }
];

const RATIOS: { id: ImageAspectRatio; label: string }[] = [
  { id: '16:9', label: '16:9 (YouTube)' },
  { id: '9:16', label: '9:16 (TikTok/Shorts)' },
  { id: '1:1', label: '1:1 (Square)' },
  { id: '4:3', label: '4:3 (Standard)' },
];

const FONTS: { id: BurmeseFontOption; name: string }[] = [
  { id: 'font-akkhayar', name: 'Akkhayar 21' },
  { id: 'font-kunheing', name: 'AJ Kunheing' },
  { id: 'font-jojar', name: 'Myanmar Jojar' },
  { id: 'font-myanmaros', name: 'Myanmar OS' },
  { id: 'font-notosans', name: 'Noto Sans' },
];

const COLOR_THEMES: { id: TextColorTheme; color: string }[] = [
  { id: 'yellow', color: '#FACC15' },
  { id: 'white', color: '#FFFFFF' },
  { id: 'orange', color: '#F97316' },
  { id: 'cyan', color: '#06B6D4' },
  { id: 'lime', color: '#84CC16' },
];

const ThumbnailGen: React.FC<ThumbnailGenProps> = ({ onSpendCredits }) => {
  const [topic, setTopic] = useState('');
  const [titleText, setTitleText] = useState('');
  const [aspectRatio, setAspectRatio] = useState<ImageAspectRatio>('16:9');
  const [style, setStyle] = useState('Cinematic');
  const [file, setFile] = useState<File | null>(null);

  // Typography Customization
  const [burmeseFont, setBurmeseFont] = useState<BurmeseFontOption>('font-akkhayar');
  const [textColorPreset, setTextColorPreset] = useState<TextColorTheme>('yellow');
  const [textY, setTextY] = useState<number>(84);
  const [textSize, setTextSize] = useState<number>(20);
  const [backdropEnabled, setBackdropEnabled] = useState<boolean>(true);
  const [backdropOpacity, setBackdropOpacity] = useState<number>(65);

  // Generation & Output
  const [isGenerating, setIsGenerating] = useState(false);
  const [isSuggestingHooks, setIsSuggestingHooks] = useState(false);
  const [rawImageUrl, setRawImageUrl] = useState<string | null>(null);
  const [compositeUrl, setCompositeUrl] = useState<string | null>(null);
  const [suggestedHooks, setSuggestedHooks] = useState<string[]>([]);
  const [copied, setCopied] = useState(false);
  const [showHistory, setShowHistory] = useState(false);

  const isMounted = useRef(true);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);

  useEffect(() => {
    return () => {
      isMounted.current = false;
    };
  }, []);

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    if (e.target.files && e.target.files[0]) {
      setFile(e.target.files[0]);
    }
  };

  const fileToBase64 = (f: File): Promise<string> => {
    return new Promise((resolve, reject) => {
      const reader = new FileReader();
      reader.readAsDataURL(f);
      reader.onload = () => {
        const base64 = (reader.result as string).split(',')[1];
        resolve(base64);
      };
      reader.onerror = (err) => reject(err);
    });
  };

  // Wrap Burmese text gracefully into at most 2 lines
  const wrapBurmeseText = (text: string, ctx: CanvasRenderingContext2D, maxWidth: number): string[] => {
    const clean = text.replace(/\\N/gi, ' ').replace(/[\r\n\t]+/g, ' ').replace(/\s+/g, ' ').trim();
    if (!clean) return [];
    if (ctx.measureText(clean).width <= maxWidth) return [clean];

    if (clean.includes(' ')) {
      const words = clean.split(' ');
      const mid = Math.ceil(words.length / 2);
      return [words.slice(0, mid).join(' '), words.slice(mid).join(' ')];
    }

    const punctIdx = clean.search(/[၊။]/);
    if (punctIdx !== -1 && punctIdx < clean.length - 1) {
      return [clean.slice(0, punctIdx + 1).trim(), clean.slice(punctIdx + 1).trim()];
    }

    const mid = Math.floor(clean.length / 2);
    let splitAt = mid;
    for (let i = Math.max(1, mid - 4); i < Math.min(clean.length, mid + 5); i++) {
      const code = clean.charCodeAt(i);
      if (code >= 0x1000 && code <= 0x1021 && (i === 0 || clean.charCodeAt(i - 1) !== 0x1039)) {
        splitAt = i;
        break;
      }
    }
    return [clean.slice(0, splitAt).trim(), clean.slice(splitAt).trim()];
  };

  // Render Canvas
  const renderThumbnailCanvas = useCallback(() => {
    const canvas = canvasRef.current;
    if (!canvas || !rawImageUrl) return;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    const img = new Image();
    img.crossOrigin = 'anonymous';
    img.src = rawImageUrl;
    img.onload = () => {
      let baseW = 1920;
      let baseH = 1080;
      if (aspectRatio === '9:16') { baseW = 1080; baseH = 1920; }
      else if (aspectRatio === '1:1') { baseW = 1080; baseH = 1080; }
      else if (aspectRatio === '4:3') { baseW = 1440; baseH = 1080; }

      canvas.width = img.naturalWidth || baseW;
      canvas.height = img.naturalHeight || baseH;
      const w = canvas.width;
      const h = canvas.height;

      // 1. Draw raw thumbnail image
      ctx.drawImage(img, 0, 0, w, h);

      const activeText = titleText.trim();
      if (!activeText) {
        setCompositeUrl(canvas.toDataURL('image/png'));
        return;
      }

      // 2. Select Burmese Font
      let fontName = 'Akkhayar21';
      if (burmeseFont === 'font-kunheing') fontName = 'AJKunheing';
      else if (burmeseFont === 'font-jojar') fontName = 'MyanmarJojar';
      else if (burmeseFont === 'font-myanmaros') fontName = 'MyanmarOS';
      else if (burmeseFont === 'font-notosans') fontName = 'Noto Sans Myanmar';

      let baseFontSize = Math.max(28, Math.round(h * (textSize / 280)));
      ctx.font = `900 ${baseFontSize}px ${fontName}, "Noto Sans Myanmar", sans-serif`;

      const maxTextW = w * 0.90;
      let lines = wrapBurmeseText(activeText, ctx, maxTextW);

      const maxMeasured = Math.max(...lines.map((l) => ctx.measureText(l).width));
      if (maxMeasured > maxTextW) {
        baseFontSize = Math.max(22, Math.floor(baseFontSize * (maxTextW / maxMeasured)));
        ctx.font = `900 ${baseFontSize}px ${fontName}, "Noto Sans Myanmar", sans-serif`;
        lines = wrapBurmeseText(activeText, ctx, maxTextW);
      }

      const lineHeight = baseFontSize * 1.35;
      const totalTextH = lines.length * lineHeight;

      const centerY = (h * (textY / 100));
      const startY = centerY - (totalTextH / 2) + (lineHeight / 2);

      // 3. Backdrop Strip
      if (backdropEnabled) {
        const padY = Math.max(20, Math.round(h * 0.03));
        const stripTop = Math.max(0, startY - (lineHeight * 0.72) - padY);
        const stripHeight = totalTextH + (padY * 2) + (lineHeight * 0.25);

        const grad = ctx.createLinearGradient(0, stripTop, 0, stripTop + stripHeight);
        const alpha = (backdropOpacity / 100);
        grad.addColorStop(0, `rgba(0, 0, 0, 0)`);
        grad.addColorStop(0.2, `rgba(0, 0, 0, ${alpha * 0.85})`);
        grad.addColorStop(0.5, `rgba(0, 0, 0, ${alpha})`);
        grad.addColorStop(0.8, `rgba(0, 0, 0, ${alpha * 0.85})`);
        grad.addColorStop(1, `rgba(0, 0, 0, 0)`);

        ctx.save();
        ctx.fillStyle = grad;
        ctx.fillRect(0, stripTop, w, stripHeight);
        ctx.restore();
      }

      // 4. Color
      let primaryColor = '#FACC15';
      if (textColorPreset === 'white') primaryColor = '#FFFFFF';
      else if (textColorPreset === 'orange') primaryColor = '#FB923C';
      else if (textColorPreset === 'cyan') primaryColor = '#38BDF8';
      else if (textColorPreset === 'lime') primaryColor = '#A3E635';

      // 5. Draw text
      ctx.save();
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      const textX = w / 2;

      lines.forEach((line, idx) => {
        const lineY = startY + (idx * lineHeight);

        ctx.lineWidth = Math.max(7, Math.floor(baseFontSize * 0.17));
        ctx.lineJoin = 'round';
        ctx.miterLimit = 2;
        ctx.strokeStyle = '#000000';
        ctx.strokeText(line, textX, lineY);

        ctx.shadowColor = 'rgba(0, 0, 0, 0.95)';
        ctx.shadowBlur = Math.max(8, Math.floor(baseFontSize * 0.22));
        ctx.shadowOffsetX = 0;
        ctx.shadowOffsetY = Math.max(3, Math.floor(baseFontSize * 0.06));

        ctx.fillStyle = primaryColor;
        ctx.fillText(line, textX, lineY);
      });

      ctx.restore();
      setCompositeUrl(canvas.toDataURL('image/png'));
    };
  }, [rawImageUrl, titleText, burmeseFont, textSize, textY, textColorPreset, backdropEnabled, backdropOpacity, aspectRatio]);

  useEffect(() => {
    if (rawImageUrl) {
      renderThumbnailCanvas();
    }
  }, [renderThumbnailCanvas, rawImageUrl]);

  // AI Hook suggestions
  const handleSuggestAiHooks = async () => {
    if (!topic.trim()) {
      toast.error('ဇာတ်လမ်း သို့မဟုတ် အကြောင်းအရာ ထည့်ပေးပါ');
      return;
    }
    setIsSuggestingHooks(true);
    try {
      const prompt = `Write 3 short, catchy Burmese (Myanmar Unicode) headline hooks (2-4 words) for this video topic: "${topic}". Output only numbered list without extra text.`;
      const response = await generateText(prompt, "Respond strictly in Burmese Unicode.");
      const list = response
        .split('\n')
        .map((l) => l.replace(/^\d+[\.\)]\s*|^- \s*/, '').trim())
        .filter((l) => l.length > 1);

      if (list.length > 0) {
        setSuggestedHooks(list);
        if (!titleText.trim()) setTitleText(list[0]);
      }
    } catch {
      toast.error('AI Hook ရေးဆွဲခြင်း မအောင်မြင်ပါ');
    } finally {
      setIsSuggestingHooks(false);
    }
  };

  // Generate Thumbnail
  const handleGenerate = async () => {
    if (!topic.trim()) {
      toast.error('ဇာတ်လမ်း သို့မဟုတ် အကြောင်းအရာ ထည့်ပေးပါ');
      return;
    }

    if (!onSpendCredits(CREDIT_COSTS[ContentType.THUMBNAIL])) {
      toast.error('Credits မလုံလောက်ပါ');
      return;
    }

    setRawImageUrl(null);
    setCompositeUrl(null);
    setIsGenerating(true);

    try {
      const selectedStyleObj = STYLES.find((s) => s.name === style) || STYLES[0];

      const promptInstruction = `You are a YouTube thumbnail photographer.
Transform the concept into a dramatic 8k cinematic thumbnail photo prompt.
Style: ${style} (${selectedStyleObj.prompt})
Rules: Dramatic close-up/action scene, high-contrast cinematic lighting, 8k resolution, movie still, leave space for text overlay, no text/watermarks in image. Output 2 English sentences only.`;

      let activeBurmeseText = titleText.trim();

      const [refinedPrompt, generatedHook] = await Promise.all([
        generateText(`Concept: "${topic}"\nGenerate viral thumbnail image prompt.`, promptInstruction),
        !activeBurmeseText
          ? generateText(`Write 1 short catchy Burmese 2-4 words hook for: "${topic}". Output only Burmese text.`, "Respond strictly in Burmese Unicode.")
          : Promise.resolve('')
      ]);

      if (!activeBurmeseText && generatedHook && generatedHook.trim()) {
        const cleanHook = generatedHook.trim().replace(/["'\r\n]/g, '');
        activeBurmeseText = cleanHook;
        if (isMounted.current) setTitleText(cleanHook);
      }

      let finalPrompt = refinedPrompt.trim();
      let imageBase64: string | undefined = undefined;
      let mimeType: string = 'image/png';
      if (file) {
        imageBase64 = await fileToBase64(file);
        mimeType = file.type || 'image/png';
        finalPrompt += ' Incorporate the subject from the reference image.';
      }

      const generatedImageUrl = await generateImage(finalPrompt, aspectRatio, imageBase64, mimeType);

      if (isMounted.current) {
        setRawImageUrl(generatedImageUrl);
        toast.success('Thumbnail ထွက်ရှိပါပြီ');
      }

      await saveModuleHistory({
        module: 'thumbnail',
        title: topic || activeBurmeseText || 'Thumbnail Image',
        outputType: 'image',
        outputData: generatedImageUrl,
        input: { topic, titleText: activeBurmeseText, style, aspectRatio },
        extra: { style, aspectRatio, burmeseFont, textColorPreset }
      });

      const currentUser = auth.currentUser;
      if (currentUser) {
        await logGeneration(
          currentUser.uid,
          currentUser.email || '',
          'thumbnail',
          { topic, titleText: activeBurmeseText, style, aspectRatio },
          { imageUrl: generatedImageUrl.substring(0, 200) + "..." }
        );
      }
    } catch (err: unknown) {
      if (isMounted.current) {
        const msg = (err as { message?: string })?.message || 'Thumbnail ထုတ်လုပ်ခြင်း မအောင်မြင်ပါ';
        toast.error(msg);
      }
    } finally {
      if (isMounted.current) {
        setIsGenerating(false);
      }
    }
  };

  const handleDownload = () => {
    const activeUrl = compositeUrl || rawImageUrl;
    if (!activeUrl) return;
    const a = document.createElement('a');
    a.href = activeUrl;
    a.download = `thumbnail_${aspectRatio.replace(':', 'x')}_${Date.now()}.png`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
  };

  const handleCopyImage = async () => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    try {
      canvas.toBlob(async (blob) => {
        if (blob) {
          await navigator.clipboard.write([
            new ClipboardItem({ 'image/png': blob })
          ]);
          setCopied(true);
          toast.success('Copied to Clipboard!');
          setTimeout(() => setCopied(false), 2000);
        }
      }, 'image/png');
    } catch {
      toast.error('Copy မရပါ။ Download ခလုတ်ကို သုံးပါ။');
    }
  };

  return (
    <div className="module-page max-w-6xl mx-auto pb-10 space-y-4">
      {/* Title */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-xl font-bold text-slate-900 dark:text-white">
            Thumbnail Studio
          </h1>
          <p className="text-xs text-slate-500 dark:text-zinc-400">
            {CREDIT_COSTS[ContentType.THUMBNAIL]} Credits
          </p>
        </div>
        <button
          type="button"
          onClick={() => setShowHistory(true)}
          className="px-3 py-1.5 rounded-xl border border-amber-500/20 bg-amber-500/10 hover:bg-amber-500/20 text-amber-500 text-xs font-bold flex items-center gap-1.5 transition-all shadow-sm"
        >
          <History className="w-3.5 h-3.5" />
          <span>History</span>
        </button>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-12 gap-5">
        {/* LEFT COLUMN: SIMPLE CONTROLS */}
        <div className="lg:col-span-5 space-y-3.5">
          <div className="p-4 rounded-2xl bg-white dark:bg-[#0c0c0e] border border-gray-200 dark:border-white/10 space-y-3 shadow-sm">
            {/* Topic Input */}
            <div className="space-y-1">
              <label className="text-xs font-semibold text-slate-700 dark:text-zinc-300">
                ဇာတ်လမ်း / အကြောင်းအရာ
              </label>
              <textarea
                value={topic}
                onChange={(e) => setTopic(e.target.value)}
                rows={3}
                placeholder="ဗီဒီယို သို့မဟုတ် ဇာတ်လမ်း အကြောင်းအရာ ရေးပါ..."
                className="w-full bg-gray-50 dark:bg-white/5 border border-gray-200 dark:border-white/10 rounded-xl p-2.5 text-sm text-slate-900 dark:text-white placeholder:text-slate-400 dark:placeholder:text-zinc-500 focus:ring-2 focus:ring-amber-500 outline-none resize-none"
              />
            </div>

            {/* Custom Text / Hook */}
            <div className="space-y-1">
              <div className="flex items-center justify-between">
                <label className="text-xs font-semibold text-slate-700 dark:text-zinc-300">
                  စာသား (Text Hook)
                </label>
                <button
                  type="button"
                  onClick={handleSuggestAiHooks}
                  disabled={isSuggestingHooks || !topic.trim()}
                  className="text-[11px] font-bold text-amber-500 hover:text-amber-400 flex items-center gap-1 disabled:opacity-40"
                >
                  <Wand2 className={`w-3 h-3 ${isSuggestingHooks ? 'animate-spin' : ''}`} />
                  <span>AI Hook</span>
                </button>
              </div>
              <input
                type="text"
                value={titleText}
                onChange={(e) => setTitleText(e.target.value)}
                placeholder="ဥပမာ- အသက်ရှင်ဖို့အတွက်..."
                className="w-full bg-gray-50 dark:bg-white/5 border border-gray-200 dark:border-white/10 rounded-xl px-3 py-2 text-sm font-semibold text-slate-900 dark:text-white placeholder:text-slate-400 dark:placeholder:text-zinc-500 focus:ring-2 focus:ring-amber-500 outline-none"
              />

              {suggestedHooks.length > 0 && (
                <div className="flex flex-wrap gap-1 pt-1">
                  {suggestedHooks.map((h, i) => (
                    <button
                      key={i}
                      type="button"
                      onClick={() => setTitleText(h)}
                      className={`px-2 py-0.5 rounded-lg text-xs border transition-all ${
                        titleText === h
                          ? 'border-amber-500 bg-amber-500/15 text-amber-400 font-bold'
                          : 'border-gray-200 dark:border-white/10 text-slate-600 dark:text-zinc-300 hover:border-amber-500/40'
                      }`}
                    >
                      {h}
                    </button>
                  ))}
                </div>
              )}
            </div>

            {/* Ratio */}
            <div className="space-y-1">
              <label className="text-xs font-semibold text-slate-700 dark:text-zinc-300">
                Aspect Ratio
              </label>
              <div className="grid grid-cols-2 gap-1.5">
                {RATIOS.map((r) => (
                  <button
                    key={r.id}
                    type="button"
                    onClick={() => setAspectRatio(r.id)}
                    className={`py-1.5 px-2 rounded-lg text-xs font-semibold border transition-all ${
                      aspectRatio === r.id
                        ? 'border-amber-500 bg-amber-500/15 text-amber-400 font-bold'
                        : 'border-gray-200 dark:border-white/10 text-slate-600 dark:text-zinc-400 hover:border-amber-500/30'
                    }`}
                  >
                    {r.label}
                  </button>
                ))}
              </div>
            </div>

            {/* Style */}
            <div className="space-y-1">
              <label className="text-xs font-semibold text-slate-700 dark:text-zinc-300">
                Style
              </label>
              <div className="grid grid-cols-3 gap-1.5">
                {STYLES.map((s) => (
                  <button
                    key={s.name}
                    type="button"
                    onClick={() => setStyle(s.name)}
                    className={`py-1.5 px-2 rounded-lg text-xs font-semibold border transition-all ${
                      style === s.name
                        ? 'border-amber-500 bg-amber-500/15 text-amber-400 font-bold'
                        : 'border-gray-200 dark:border-white/10 text-slate-600 dark:text-zinc-400 hover:border-amber-500/30'
                    }`}
                  >
                    {s.name}
                  </button>
                ))}
              </div>
            </div>

            {/* Optional Image */}
            <div className="pt-1">
              {file ? (
                <div className="flex items-center justify-between p-2 rounded-xl bg-gray-50 dark:bg-white/5 border border-gray-200 dark:border-white/10 text-xs">
                  <span className="truncate text-slate-800 dark:text-zinc-200 font-medium">{file.name}</span>
                  <button
                    type="button"
                    onClick={() => { setFile(null); if (fileInputRef.current) fileInputRef.current.value = ''; }}
                    className="text-rose-400 p-1 hover:bg-rose-500/10 rounded-lg"
                  >
                    <X className="w-3.5 h-3.5" />
                  </button>
                </div>
              ) : (
                <button
                  type="button"
                  onClick={() => fileInputRef.current?.click()}
                  className="w-full py-2 border border-dashed border-gray-200 dark:border-white/10 hover:border-amber-500/40 rounded-xl text-xs text-slate-500 dark:text-zinc-400 flex items-center justify-center gap-1.5"
                >
                  <ImageIcon className="w-3.5 h-3.5" />
                  <span>Reference Image (Optional)</span>
                </button>
              )}
              <input ref={fileInputRef} type="file" accept="image/*" onChange={handleFileChange} className="hidden" />
            </div>

            {/* Generate Button */}
            <button
              onClick={handleGenerate}
              disabled={isGenerating || !topic.trim()}
              className={`w-full py-2.5 px-4 rounded-xl text-xs font-bold uppercase tracking-wider text-white transition-all flex items-center justify-center gap-2 ${
                isGenerating || !topic.trim()
                  ? 'bg-gray-300 dark:bg-zinc-800 text-slate-400 dark:text-zinc-600 cursor-not-allowed'
                  : 'bg-amber-500 hover:bg-amber-600 active:scale-[0.98]'
              }`}
            >
              {isGenerating ? (
                <>
                  <RefreshCw className="w-3.5 h-3.5 animate-spin" />
                  <span>Generating...</span>
                </>
              ) : (
                <>
                  <Sparkles className="w-3.5 h-3.5" />
                  <span>Generate Thumbnail</span>
                </>
              )}
            </button>
          </div>
        </div>

        {/* RIGHT COLUMN: PREVIEW & MINIMAL CONTROLS */}
        <div className="lg:col-span-7 space-y-3">
          <div className="p-4 rounded-2xl bg-white dark:bg-[#0c0c0e] border border-gray-200 dark:border-white/10 space-y-3 shadow-sm">
            <div className="flex items-center justify-between">
              <span className="text-xs font-bold text-slate-700 dark:text-zinc-300">
                Preview
              </span>
              {compositeUrl && (
                <div className="flex items-center gap-2">
                  <button
                    type="button"
                    onClick={handleCopyImage}
                    className="p-1.5 px-2.5 rounded-lg text-xs font-semibold bg-gray-100 dark:bg-white/10 hover:bg-gray-200 dark:hover:bg-white/15 text-slate-700 dark:text-zinc-200 flex items-center gap-1"
                  >
                    {copied ? <Check className="w-3.5 h-3.5 text-emerald-400" /> : <Copy className="w-3.5 h-3.5" />}
                    <span>{copied ? 'Copied' : 'Copy'}</span>
                  </button>
                  <button
                    type="button"
                    onClick={handleDownload}
                    className="p-1.5 px-3 rounded-lg text-xs font-bold bg-amber-500 hover:bg-amber-600 text-white flex items-center gap-1.5"
                  >
                    <Download className="w-3.5 h-3.5" />
                    <span>Download</span>
                  </button>
                </div>
              )}
            </div>

            {/* Canvas Box */}
            <div className="relative rounded-xl overflow-hidden bg-black/90 border border-gray-200 dark:border-white/10 flex items-center justify-center min-h-[300px] max-h-[480px]">
              {isGenerating ? (
                <div className="p-8 text-center space-y-2">
                  <LoadingSpinner size="lg" showLabel={false} />
                  <p className="text-xs font-medium text-amber-500 animate-pulse">
                    Generating thumbnail...
                  </p>
                </div>
              ) : rawImageUrl ? (
                <div className="relative w-full h-full flex items-center justify-center p-2">
                  <canvas ref={canvasRef} className="hidden" />
                  {compositeUrl ? (
                    <img
                      src={compositeUrl}
                      alt="Thumbnail"
                      className="max-h-[440px] w-auto object-contain rounded-lg"
                    />
                  ) : (
                    <img
                      src={rawImageUrl}
                      alt="Background"
                      className="max-h-[440px] w-auto object-contain rounded-lg"
                    />
                  )}
                </div>
              ) : (
                <div className="p-8 text-center space-y-1 text-slate-400 dark:text-zinc-600">
                  <ImageIcon className="w-8 h-8 mx-auto mb-2 opacity-50" />
                  <p className="text-xs font-semibold">Thumbnail Canvas</p>
                </div>
              )}
            </div>

            {/* MINIMAL TEXT ADJUSTER (When image is present) */}
            {rawImageUrl && (
              <div className="p-3 rounded-xl bg-gray-50 dark:bg-white/5 border border-gray-200 dark:border-white/10 space-y-3">
                {/* Row 1: Font & Color */}
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <div className="flex items-center gap-2">
                    <span className="text-xs font-medium text-slate-600 dark:text-zinc-400">Font:</span>
                    <select
                      value={burmeseFont}
                      onChange={(e) => setBurmeseFont(e.target.value as BurmeseFontOption)}
                      className="bg-white dark:bg-[#121214] border border-gray-200 dark:border-white/10 rounded-lg px-2 py-1 text-xs font-semibold text-slate-900 dark:text-white outline-none"
                    >
                      {FONTS.map((f) => (
                        <option key={f.id} value={f.id}>{f.name}</option>
                      ))}
                    </select>
                  </div>

                  <div className="flex items-center gap-1.5">
                    <span className="text-xs font-medium text-slate-600 dark:text-zinc-400 mr-1">Color:</span>
                    {COLOR_THEMES.map((c) => (
                      <button
                        key={c.id}
                        type="button"
                        onClick={() => setTextColorPreset(c.id)}
                        className={`w-5 h-5 rounded-full border transition-transform ${
                          textColorPreset === c.id ? 'scale-125 ring-2 ring-amber-500' : 'opacity-70 hover:opacity-100'
                        }`}
                        style={{ backgroundColor: c.color }}
                      />
                    ))}
                  </div>
                </div>

                {/* Row 2: Position Slider */}
                <div className="space-y-1">
                  <div className="flex justify-between text-xs text-slate-600 dark:text-zinc-400 font-medium">
                    <span>စာသားနေရာ (Vertical Position)</span>
                    <span>{textY}%</span>
                  </div>
                  <input
                    type="range"
                    min="10"
                    max="92"
                    value={textY}
                    onChange={(e) => setTextY(Number(e.target.value))}
                    className="w-full accent-amber-500 cursor-pointer"
                  />
                </div>

                {/* Row 3: Size & Backdrop */}
                <div className="grid grid-cols-2 gap-3 pt-1">
                  <div className="space-y-1">
                    <div className="flex justify-between text-xs text-slate-600 dark:text-zinc-400">
                      <span>Size</span>
                      <span>{textSize}</span>
                    </div>
                    <input
                      type="range"
                      min="12"
                      max="32"
                      value={textSize}
                      onChange={(e) => setTextSize(Number(e.target.value))}
                      className="w-full accent-amber-500 cursor-pointer"
                    />
                  </div>

                  <div className="flex items-center justify-between p-2 rounded-lg bg-white dark:bg-black/30 border border-gray-200 dark:border-white/10">
                    <span className="text-xs text-slate-600 dark:text-zinc-400">Backdrop</span>
                    <input
                      type="checkbox"
                      checked={backdropEnabled}
                      onChange={(e) => setBackdropEnabled(e.target.checked)}
                      className="accent-amber-500 cursor-pointer w-4 h-4"
                    />
                  </div>
                </div>
              </div>
            )}
          </div>
        </div>
      </div>

      <ModuleHistoryModal
        isOpen={showHistory}
        onClose={() => setShowHistory(false)}
        module="thumbnail"
        moduleTitle="Thumbnail Studio"
        onRestore={(rec) => {
          setRawImageUrl(rec.outputData);
          if (rec.input && typeof rec.input === 'object') {
            const inp = rec.input as Record<string, unknown>;
            if (inp.topic) setTopic(String(inp.topic));
            if (inp.titleText) setTitleText(String(inp.titleText));
            if (inp.style) setStyle(String(inp.style));
            if (inp.aspectRatio) setAspectRatio(inp.aspectRatio as ImageAspectRatio);
          }
        }}
      />
    </div>
  );
};

export default ThumbnailGen;
