
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
      <div className="flex items-center gap-2 mb-6">
        <div className="w-8 h-8 bg-indigo-600 rounded-lg flex items-center justify-center shadow-lg">
          <svg className="w-5 h-5 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M7 21a4 4 0 01-4-4V5a2 2 0 012-2h4a2 2 0 012 2v12a4 4 0 01-4 4zm0 0h12a2 2 0 002-2v-4a2 2 0 00-2-2h-2.343M11 7.343l1.657-1.657a2 2 0 012.828 0l2.829 2.829a2 2 0 010 2.828l-8.486 8.485M7 17h.01" />
          </svg>
        </div>
        <div>
          <h1 className="text-xl font-bold text-slate-900 dark:text-white">Brand Kit Manager</h1>
          <p className="text-slate-500 dark:text-zinc-400 text-[10px] font-bold uppercase tracking-widest">Identity & Consistency</p>
        </div>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
        <div className="space-y-6">
          <div className="glass p-6 rounded-2xl border border-white/5 space-y-4">
            <h3 className="text-xs font-black uppercase tracking-widest text-slate-400 dark:text-zinc-500">Core Identity</h3>
            
            <div className="space-y-2">
              <label className="block text-[10px] font-bold text-slate-500 uppercase tracking-widest">Brand Name</label>
              <input 
                type="text" 
                value={brandData.brandName}
                onChange={(e) => setBrandData({...brandData, brandName: e.target.value})}
                placeholder="e.g. Lumina Studio"
                className="w-full bg-slate-50 dark:bg-black/20 border border-slate-200 dark:border-white/10 rounded-xl px-4 py-3 text-sm text-slate-900 dark:text-white outline-none focus:ring-2 focus:ring-indigo-500 transition-all"
              />
            </div>

            <div className="space-y-2">
              <label className="block text-[10px] font-bold text-slate-500 uppercase tracking-widest">Brand Logo</label>
              <div className="flex items-center gap-4">
                <div className="w-20 h-20 rounded-xl border-2 border-dashed border-slate-200 dark:border-white/10 flex items-center justify-center overflow-hidden bg-slate-50 dark:bg-black/20">
                  {brandData.logo ? (
                    <img src={brandData.logo} alt="Logo" className="w-full h-full object-contain p-2" />
                  ) : (
                    <svg className="w-8 h-8 text-slate-300" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 16l4.586-4.586a2 2 0 012.828 0L16 16m-2-2l1.586-1.586a2 2 0 012.828 0L20 14m-6-6h.01M6 20h12a2 2 0 002-2V6a2 2 0 00-2-2H6a2 2 0 00-2 2v12a2 2 0 002 2z" /></svg>
                  )}
                </div>
                <input type="file" id="logo-upload" className="hidden" accept="image/*" onChange={handleLogoUpload} />
                <label htmlFor="logo-upload" className="px-4 py-2 bg-slate-100 dark:bg-white/5 hover:bg-slate-200 dark:hover:bg-white/10 rounded-lg text-[10px] font-bold uppercase tracking-widest cursor-pointer transition-all">
                  Upload Logo
                </label>
              </div>
            </div>
          </div>

          <div className="glass p-6 rounded-2xl border border-white/5 space-y-4">
            <h3 className="text-xs font-black uppercase tracking-widest text-slate-400 dark:text-zinc-500">Visual Palette</h3>
            
            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-2">
                <label className="block text-[10px] font-bold text-slate-500 uppercase tracking-widest">Primary Color</label>
                <div className="flex items-center gap-2">
                  <input 
                    type="color" 
                    value={brandData.primaryColor}
                    onChange={(e) => setBrandData({...brandData, primaryColor: e.target.value})}
                    className="w-10 h-10 rounded-lg border-none cursor-pointer bg-transparent"
                  />
                  <span className="text-xs font-mono text-slate-400 uppercase">{brandData.primaryColor}</span>
                </div>
              </div>
              <div className="space-y-2">
                <label className="block text-[10px] font-bold text-slate-500 uppercase tracking-widest">Secondary Color</label>
                <div className="flex items-center gap-2">
                  <input 
                    type="color" 
                    value={brandData.secondaryColor}
                    onChange={(e) => setBrandData({...brandData, secondaryColor: e.target.value})}
                    className="w-10 h-10 rounded-lg border-none cursor-pointer bg-transparent"
                  />
                  <span className="text-xs font-mono text-slate-400 uppercase">{brandData.secondaryColor}</span>
                </div>
              </div>
            </div>

            <div className="space-y-2">
              <label className="block text-[10px] font-bold text-slate-500 uppercase tracking-widest">Preferred Font</label>
              <select 
                value={brandData.fontFamily}
                onChange={(e) => setBrandData({...brandData, fontFamily: e.target.value})}
                className="w-full bg-slate-50 dark:bg-black/20 border border-slate-200 dark:border-white/10 rounded-xl px-4 py-3 text-sm text-slate-900 dark:text-white outline-none focus:ring-2 focus:ring-indigo-500 transition-all"
              >
                <option value="Inter">Inter (Modern Sans)</option>
                <option value="Public Sans">Public Sans (Clean)</option>
                <option value="Playfair Display">Playfair Display (Elegant Serif)</option>
                <option value="JetBrains Mono">JetBrains Mono (Technical)</option>
                <option value="Space Grotesk">Space Grotesk (Tech Forward)</option>
              </select>
            </div>
          </div>

          <button 
            onClick={handleSave}
            className="w-full py-4 bg-indigo-600 hover:bg-indigo-500 text-white rounded-2xl font-black text-xs uppercase tracking-[0.2em] shadow-xl shadow-indigo-600/20 transition-all active:scale-95"
          >
            {saveSuccess ? 'Brand Kit Saved!' : 'Save Brand Configuration'}
          </button>
        </div>

        <div className="space-y-6">
          <div className="glass p-6 rounded-2xl border border-white/5 h-full flex flex-col">
            <h3 className="text-xs font-black uppercase tracking-widest text-slate-400 dark:text-zinc-500 mb-6">Live Preview</h3>
            
            <div className="flex-1 flex flex-col items-center justify-center space-y-8 p-8 bg-slate-50 dark:bg-black/40 rounded-3xl border border-slate-200 dark:border-white/5">
              <div className="text-center space-y-4">
                {brandData.logo && (
                  <img src={brandData.logo} alt="Preview Logo" className="w-16 h-16 mx-auto object-contain mb-4" />
                )}
                <h2 
                  style={{ color: brandData.primaryColor, fontFamily: brandData.fontFamily }}
                  className="text-3xl font-black uppercase tracking-tighter"
                >
                  {brandData.brandName || 'Your Brand Name'}
                </h2>
                <p className="text-slate-500 dark:text-zinc-400 text-sm max-w-xs mx-auto">
                  This is how your brand elements will appear across the Lumina Studio ecosystem.
                </p>
              </div>

              <div className="flex gap-3">
                <button 
                  style={{ backgroundColor: brandData.primaryColor }}
                  className="px-6 py-2.5 rounded-xl text-white text-[10px] font-black uppercase tracking-widest shadow-lg"
                >
                  Primary Action
                </button>
                <button 
                  style={{ borderColor: brandData.secondaryColor, color: brandData.secondaryColor }}
                  className="px-6 py-2.5 rounded-xl border-2 text-[10px] font-black uppercase tracking-widest"
                >
                  Secondary
                </button>
              </div>

              <div className="w-full space-y-2">
                <div className="h-2 w-full bg-slate-200 dark:bg-white/5 rounded-full overflow-hidden">
                  <div style={{ width: '65%', backgroundColor: brandData.primaryColor }} className="h-full"></div>
                </div>
                <div className="flex justify-between text-[8px] font-bold text-slate-400 uppercase tracking-widest">
                  <span>Brand Consistency</span>
                  <span>65% Optimized</span>
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
