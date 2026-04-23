
import React, { useState, useEffect } from 'react';

interface BrandKitData {
  logo: string | null;
  primaryColor: string;
  secondaryColor: string;
  fontFamily: string;
  brandName: string;
}

const BrandKit: React.FC = () => {
  const [brandData, setBrandData] = useState<BrandKitData>({
    logo: null,
    primaryColor: '#4f46e5',
    secondaryColor: '#10b981',
    fontFamily: 'Inter',
    brandName: '',
  });
  const [saveSuccess, setSaveSuccess] = useState(false);

  useEffect(() => {
    const saved = localStorage.getItem('lumina_brand_kit');
    if (saved) {
      setBrandData(JSON.parse(saved));
    }
  }, []);

  const handleSave = () => {
    localStorage.setItem('lumina_brand_kit', JSON.stringify(brandData));
    setSaveSuccess(true);
    setTimeout(() => setSaveSuccess(false), 2000);
  };

  const handleLogoUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    if (e.target.files && e.target.files[0]) {
      const reader = new FileReader();
      reader.onload = () => {
        setBrandData({ ...brandData, logo: reader.result as string });
      };
      reader.readAsDataURL(e.target.files[0]);
    }
  };

  return (
    <div className="max-w-4xl mx-auto pb-10">
      <div className="flex items-center gap-4 mb-8">
        <div className="w-10 h-10 bg-accent rounded-xl flex items-center justify-center shadow-lg shadow-accent/20">
          <svg className="w-5 h-5 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M7 21a4 4 0 01-4-4V5a2 2 0 012-2h4a2 2 0 012 2v12a4 4 0 01-4 4zm0 0h12a2 2 0 002-2v-4a2 2 0 00-2-2h-2.343M11 7.343l1.657-1.657a2 2 0 012.828 0l2.829 2.829a2 2 0 010 2.828l-8.486 8.485M7 17h.01" />
          </svg>
        </div>
        <div>
          <h1 className="movie-h1 !text-2xl !mb-0 uppercase tracking-tighter">Brand Kit Manager</h1>
          <p className="movie-meta !text-[10px] !mb-0 uppercase tracking-widest text-zinc-500">Identity & Consistency</p>
        </div>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        <div className="space-y-4">
          <div className="glass p-6 rounded-2xl border border-white/5 space-y-6 shadow-xl">
            <h3 className="movie-meta uppercase tracking-widest !mb-0">Core Identity</h3>
            
            <div className="space-y-2">
              <label className="movie-meta !text-[10px] uppercase tracking-widest px-1">Brand Name</label>
              <input 
                type="text" 
                value={brandData.brandName}
                onChange={(e) => setBrandData({...brandData, brandName: e.target.value})}
                placeholder="e.g. Lumina Studio"
                className="w-full bg-slate-50 dark:bg-black/20 border border-slate-200 dark:border-white/10 rounded-xl px-4 py-3 movie-body !text-[14px] text-slate-900 dark:text-white outline-none focus:ring-2 focus:ring-accent transition-all"
              />
            </div>

            <div className="space-y-2">
              <label className="movie-meta !text-[10px] uppercase tracking-widest px-1">Brand Logo</label>
              <div className="flex items-center gap-6">
                <div className="w-24 h-24 rounded-2xl border-2 border-dashed border-white/10 flex items-center justify-center overflow-hidden bg-black/20">
                  {brandData.logo ? (
                    <img src={brandData.logo} alt="Logo" className="w-full h-full object-contain p-2" />
                  ) : (
                    <div className="text-center space-y-1">
                        <svg className="w-8 h-8 text-zinc-700 mx-auto" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 16l4.586-4.586a2 2 0 012.828 0L16 16m-2-2l1.586-1.586a2 2 0 012.828 0L20 14m-6-6h.01M6 20h12a2 2 0 002-2V6a2 2 0 00-2-2H6a2 2 0 00-2 2v12a2 2 0 002 2z" /></svg>
                    </div>
                  )}
                </div>
                <input type="file" id="logo-upload" className="hidden" accept="image/*" onChange={handleLogoUpload} />
                <label htmlFor="logo-upload" className="px-6 py-3 bg-white/5 border border-white/10 hover:border-accent/40 rounded-xl movie-meta !text-[10px] uppercase tracking-widest cursor-pointer transition-all">
                  Upload Alpha Logo
                </label>
              </div>
            </div>
          </div>

          <div className="glass p-6 rounded-2xl border border-white/5 space-y-6 shadow-xl">
            <h3 className="movie-meta uppercase tracking-widest !mb-0">Visual Palette</h3>
            
            <div className="grid grid-cols-2 gap-6">
              <div className="space-y-2">
                <label className="movie-meta !text-[10px] uppercase tracking-widest px-1">Primary Color</label>
                <div className="flex items-center gap-3">
                  <input 
                    type="color" 
                    value={brandData.primaryColor}
                    onChange={(e) => setBrandData({...brandData, primaryColor: e.target.value})}
                    className="w-10 h-10 rounded-lg border-none cursor-pointer bg-transparent"
                  />
                  <span className="movie-meta !text-[11px] uppercase text-zinc-500 font-mono !mb-0">{brandData.primaryColor}</span>
                </div>
              </div>
              <div className="space-y-2">
                <label className="movie-meta !text-[10px] uppercase tracking-widest px-1">Secondary Color</label>
                <div className="flex items-center gap-3">
                  <input 
                    type="color" 
                    value={brandData.secondaryColor}
                    onChange={(e) => setBrandData({...brandData, secondaryColor: e.target.value})}
                    className="w-10 h-10 rounded-lg border-none cursor-pointer bg-transparent"
                  />
                  <span className="movie-meta !text-[11px] uppercase text-zinc-500 font-mono !mb-0">{brandData.secondaryColor}</span>
                </div>
              </div>
            </div>

            <div className="space-y-2">
              <label className="movie-meta !text-[10px] uppercase tracking-widest px-1">Preferred Typography</label>
              <select 
                value={brandData.fontFamily}
                onChange={(e) => setBrandData({...brandData, fontFamily: e.target.value})}
                className="w-full bg-slate-50 dark:bg-black/20 border border-slate-200 dark:border-white/10 rounded-xl px-4 py-3 movie-body !text-[14px] text-slate-900 dark:text-white outline-none focus:ring-2 focus:ring-accent transition-all cursor-pointer"
              >
                <option value="Inter">Inter (Global Cinema Standard)</option>
                <option value="Public Sans">Public Sans (Modern Clean)</option>
                <option value="Playfair Display">Playfair Display (Editorial Elegance)</option>
                <option value="JetBrains Mono">JetBrains Mono (Technical Analysis)</option>
                <option value="Space Grotesk">Space Grotesk (Neo-Brutalist)</option>
              </select>
            </div>
          </div>

          <button 
            onClick={handleSave}
            className="w-full py-4 bg-accent hover:bg-accent-hover text-white rounded-2xl movie-meta !text-[12px] uppercase tracking-[0.25em] shadow-xl shadow-accent/20 transition-all active:scale-95"
          >
            {saveSuccess ? 'Configuration Locked' : 'Commit Brand Matrix'}
          </button>
        </div>

        <div className="space-y-4">
          <div className="glass p-8 rounded-2xl border border-white/5 h-full flex flex-col relative overflow-hidden">
            <div className="absolute -top-10 -right-10 w-40 h-40 bg-accent/5 rounded-full blur-3xl pointer-events-none"></div>
            <h3 className="movie-meta uppercase tracking-widest mb-10 !mb-10">Live Production Preview</h3>
            
            <div className="flex-1 flex flex-col items-center justify-center space-y-10 p-10 bg-black/40 rounded-3xl border border-white/5">
              <div className="text-center space-y-6">
                {brandData.logo && (
                  <img src={brandData.logo} alt="Preview Logo" className="w-20 h-20 mx-auto object-contain mb-6 drop-shadow-2xl" />
                )}
                <h2 
                  style={{ color: brandData.primaryColor, fontFamily: brandData.fontFamily }}
                  className="text-4xl font-black uppercase tracking-tighter"
                >
                  {brandData.brandName || 'STUDIO TITLE'}
                </h2>
                <p className="movie-body !text-[14px] text-zinc-500 max-w-xs mx-auto leading-relaxed">
                  Real-time preview of how your brand identity translates into cinematic production assets.
                </p>
              </div>

              <div className="flex gap-4">
                <button 
                  style={{ backgroundColor: brandData.primaryColor }}
                  className="px-8 py-3 rounded-xl text-white movie-meta !text-[11px] uppercase tracking-widest shadow-2xl transition-all hover:brightness-110"
                >
                  Action Alpha
                </button>
                <button 
                  style={{ borderColor: brandData.secondaryColor, color: brandData.secondaryColor }}
                  className="px-8 py-3 rounded-xl border-2 movie-meta !text-[11px] uppercase tracking-widest transition-all hover:bg-white/5"
                >
                  Action Beta
                </button>
              </div>

              <div className="w-full space-y-3">
                 <div className="flex justify-between movie-meta !text-[10px] uppercase tracking-widest text-zinc-500 !mb-0">
                  <span>Production Accuracy</span>
                  <span>94% Verified</span>
                </div>
                <div className="h-1.5 w-full bg-white/5 rounded-full overflow-hidden">
                  <div style={{ width: '94%', backgroundColor: brandData.primaryColor }} className="h-full shadow-[0_0_10px_rgba(255,255,255,0.2)]"></div>
                </div>
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};

export default BrandKit;
