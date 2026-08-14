import React, { useState, useEffect } from 'react';
import { auth } from '../services/firebase';
import { toast } from 'react-hot-toast';

interface ProfileProps {
  stats: { credits: number; totalGenerated: number };
  onApiKeyChange?: (hasKey: boolean) => void;
}

const Profile: React.FC<ProfileProps> = ({ stats, onApiKeyChange }) => {
  const [user, setUser] = useState<any>(null);
  const [apiKey, setApiKey] = useState('');
  const [showKey, setShowKey] = useState(false);
  const [isTesting, setIsTesting] = useState(false);
  const [isSaved, setIsSaved] = useState(false);

  useEffect(() => {
    setUser(auth.currentUser);
    const storedKey = localStorage.getItem('VITE_GEMINI_API_KEY') || '';
    setApiKey(storedKey);
    if (storedKey) {
      setIsSaved(true);
    }
  }, []);

  const handleSaveKey = () => {
    if (!apiKey.trim()) {
      toast.error('ကျေးဇူးပြု၍ API Key အား မှန်ကန်စွာ ထည့်သွင်းပါ (Please enter a valid API Key).');
      return;
    }

    try {
      localStorage.setItem('VITE_GEMINI_API_KEY', apiKey.trim());
      setIsSaved(true);
      toast.success('API Key သိမ်းဆည်းပြီးပါပြီ။ (API Key Saved successfully!)');
      if (onApiKeyChange) {
        onApiKeyChange(true);
      }
    } catch (e) {
      toast.error('သိမ်းဆည်းရန်အတွက် အခက်အခဲရှိနေပါသည် (Failed to save API key locally).');
    }
  };

  const handleClearKey = () => {
    if (window.confirm('ကျိန်းသေပါသလား? သင်၏ကိုယ်ပိုင် API Key အား ဖျက်ပါမည်။ (Are you sure you want to remove your custom API Key?)')) {
      try {
        localStorage.removeItem('VITE_GEMINI_API_KEY');
        setApiKey('');
        setIsSaved(false);
        toast.success('ကိုယ်ပိုင် Key အား ဖျက်ပြီးပါပြီ။ Applet build parameters သို့ ပြန်ပြောင်းလိုက်ပါသည်။ (Custom key cleared. Default restored.)');
        if (onApiKeyChange) {
          onApiKeyChange(false);
        }
      } catch (e) {
        toast.error('Failed to clear key.');
      }
    }
  };

  const handleTestKey = async () => {
    if (!apiKey.trim()) {
      toast.error('ပထမဦးစွာ API Key ရိုက်ထည့်ပါ (Please input a key first).');
      return;
    }

    setIsTesting(true);
    try {
      // Direct validation ping
      const response = await fetch(`https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash:generateContent?key=${apiKey.trim()}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ contents: [{ parts: [{ text: 'Hello, respond with OK if you are working.' }] }] })
      });

      const resData = await response.json();
      if (response.ok && resData?.candidates?.[0]?.content?.parts?.[0]?.text) {
        toast.success('ကိုယ်ပိုင် API Key သည် အပြည့်အဝ အလုပ်လုပ်ပါသည်။ (API Key is live & working!)', {
          duration: 4000
        });
      } else {
        const errMsg = resData?.error?.message || 'Invalid Response';
        toast.error(`ချိတ်ဆက်မှု မအောင်မြင်ပါ: ${errMsg} (Status Error)`);
      }
    } catch (err: any) {
      toast.error(`ချိတ်ဆက်ရန် အခက်အခဲရှိနေပါသည်: ${err.message || err}`);
    } finally {
      setIsTesting(false);
    }
  };

  return (
    <div className="space-y-8 animate-in fade-in duration-500 max-w-4xl mx-auto pb-16">
      <div className="flex flex-col md:flex-row items-start md:items-center justify-between gap-4 px-2">
        <div className="space-y-1">
          <h1 className="movie-h2 !text-lg uppercase tracking-[0.2em] !mb-0 font-black text-white">
            Profile & Settings
          </h1>
          <p className="movie-meta !text-[9px] uppercase tracking-widest text-zinc-500">
            Manage your account details, credits, and custom Gemini credentials
          </p>
        </div>
      </div>

      {/* Profile Info Details Card */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
        <div className="col-span-1 md:col-span-2 rounded-3xl bg-zinc-950 border border-white/5 p-6 flex flex-col md:flex-row gap-6 items-center">
          <div className="relative group shrink-0">
            {user?.photoURL ? (
              <img 
                src={user.photoURL} 
                alt="user pfp" 
                className="w-24 h-24 rounded-[2rem] border-2 border-accent object-cover shadow-2xl transition-transform duration-500 group-hover:scale-105"
                referrerPolicy="no-referrer"
              />
            ) : (
              <div className="w-24 h-24 rounded-[2rem] bg-accent/20 border-2 border-accent flex items-center justify-center text-accent text-3xl font-black shadow-2xl">
                {user?.email?.[0].toUpperCase() || 'U'}
              </div>
            )}
            <div className="absolute -bottom-1 -right-1 bg-green-500 w-4 h-4 rounded-full border-2 border-zinc-950 animate-pulse" />
          </div>

          <div className="space-y-3 text-center md:text-left flex-1 min-w-0">
            <div>
              <span className="px-2.5 py-1 rounded-md bg-accent/10 border border-accent/20 text-accent text-[8px] font-black uppercase tracking-widest inline-block">
                STUDIO PRO MEMBER
              </span>
              <h3 className="text-xl font-bold text-white mt-1.5 truncate">
                {user?.displayName || 'Studio Creator'}
              </h3>
              <p className="text-xs text-zinc-400 font-mono truncate">{user?.email}</p>
            </div>

            <div className="pt-2 border-t border-white/5 flex flex-wrap gap-x-6 gap-y-2 text-[10px] uppercase text-zinc-500 font-bold tracking-widest">
              <div>
                User ID: <span className="font-mono text-zinc-300 font-medium lowercase select-all">{user?.uid || 'N/A'}</span>
              </div>
            </div>
          </div>
        </div>

        {/* Dynamic Compact Stats Grid */}
        <div className="rounded-3xl bg-zinc-950 border border-white/5 p-6 flex flex-col justify-between space-y-4">
          <div>
            <span className="movie-meta !text-[9px] uppercase tracking-[0.2em] text-zinc-500">Available Balance</span>
            <div className="flex items-baseline gap-1 mt-1">
              <span className="text-4xl font-black text-accent tracking-tighter">{stats.credits}</span>
              <span className="text-[10px] font-black text-accent uppercase tracking-widest">CR</span>
            </div>
          </div>
          <div className="pt-4 border-t border-white/5 flex gap-6">
            <div>
              <p className="text-[9px] uppercase tracking-widest text-zinc-600 font-bold">Generated</p>
              <p className="text-xl font-black text-white">{stats.totalGenerated} <span className="text-[9px] font-medium text-zinc-500">assets</span></p>
            </div>
            <div>
              <p className="text-[9px] uppercase tracking-widest text-zinc-600 font-bold">Quota Level</p>
              <p className="text-xl font-black text-green-400">UNLIMITED</p>
            </div>
          </div>
        </div>
      </div>

      {/* API Key configuration Section */}
      <div className="rounded-[2.5rem] bg-zinc-950 border border-white/5 p-8 space-y-8 relative overflow-hidden text-left">
        <div className="space-y-2">
          <div className="flex items-center gap-2 text-white">
            <svg className="w-5 h-5 text-accent" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 7a2 2 0 012 2m4 0a6 6 0 01-7.743 5.743L11 17H9v2H7v2H4a1 1 0 01-1-1v-2.586a1 1 0 01.293-.707l5.964-5.964A6 6 0 1121 9z" />
            </svg>
            <h2 className="text-md uppercase tracking-widest font-black">ကိုယ်ပိုင် Gemini API Key ထည့်သွင်းရန် (Dynamic Custom Key)</h2>
          </div>
          <p className="text-xs text-zinc-400 leading-relaxed max-w-3xl">
            Lumina TTS (အသံဖန်တီးမှု) စနစ်ကို Shared Quota (အခမဲ့အသုံးပြုခွင့်) ဖြင့် မိနစ်အလိုက် အကန့်အသတ် ဆောက်ရွက်ထားပါသည်။ 
            ၎င်းအကန့်အသတ်များကို ကျော်ဖြတ်ပြီး မည်သည့်ကန့်သတ်ချက်မှမရှိဘဲ စိတ်ကြိုက်မြန်ဆန်စွာ အသုံးပြုနိုင်ရန် သင်၏ကိုယ်ပိုင် Gemini API Key အား ထည့်သွင်းအသုံးပြုနိုင်ပါသည်။
          </p>
        </div>

        <div className="space-y-4">
          <div className="space-y-1.5">
            <label className="text-[10px] font-bold text-zinc-400 uppercase tracking-widest ml-1 block">
              YOUR GEMINI API KEY
            </label>
            <div className="flex flex-col sm:flex-row gap-3">
              <div className="relative flex-1">
                <input
                  type={showKey ? 'text' : 'password'}
                  value={apiKey}
                  onChange={(e) => setApiKey(e.target.value)}
                  placeholder="AIzaSy..."
                  className="w-full bg-zinc-950 border border-white/10 focus:border-accent rounded-xl py-3 px-4 text-xs font-mono text-white outline-none focus:ring-1 focus:ring-accent tracking-widest transition-all placeholder:text-zinc-700"
                />
                <button
                  type="button"
                  onClick={() => setShowKey(!showKey)}
                  className="absolute right-3.5 top-1/2 -translate-y-1/2 text-zinc-500 hover:text-white transition-colors"
                >
                  {showKey ? (
                    <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13.875 18.825A10.05 10.05 0 0112 19c-4.478 0-8.268-2.943-9.543-7a9.97 9.97 0 011.563-3.029m5.858.908a3 3 0 114.243 4.243M9.878 9.878l4.242 4.242M9.88 9.88l-3.29-3.29m7.532 7.532l3.29 3.29M3 3l18 18" />
                    </svg>
                  ) : (
                    <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" />
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M2.458 12C3.732 7.943 7.523 5 12 5c4.478 0 8.268 2.943 9.542 7-1.274 4.057-5.064 7-9.542 7-4.477 0-8.268-2.943-9.542-7z" />
                    </svg>
                  )}
                </button>
              </div>

              <div className="flex gap-2">
                <button
                  onClick={handleTestKey}
                  disabled={isTesting || !apiKey.trim()}
                  className="px-5 py-3 bg-white/5 border border-white/10 hover:bg-white/10 disabled:opacity-40 disabled:hover:bg-white/5 text-white font-black uppercase tracking-widest text-[10px] rounded-xl flex items-center justify-center gap-2 transition-all active:scale-95"
                >
                  {isTesting ? (
                    <svg className="w-3.5 h-3.5 animate-spin" fill="none" viewBox="0 0 24 24">
                      <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"></circle>
                      <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z"></path>
                    </svg>
                  ) : (
                    <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z" />
                    </svg>
                  )}
                  Test Active Status
                </button>
                <button
                  onClick={handleSaveKey}
                  className="px-6 py-3 bg-accent hover:bg-accent-hover text-white font-black uppercase tracking-widest text-[10px] rounded-xl shadow-lg shadow-accent/10 transition-all active:scale-95"
                >
                  Save & Apply
                </button>
              </div>
            </div>
          </div>

          {isSaved && (
            <div className="flex items-center justify-between p-4 bg-green-500/10 border border-green-500/20 rounded-2xl text-xs text-green-400">
              <div className="flex items-center gap-2.5">
                <svg className="w-4 h-4 shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M9 12l2 2 4-4m5.618-4.016A11.955 11.955 0 0112 2.944a11.955 11.955 0 01-8.618 3.04A12.02 12.02 0 003 9c0 5.591 3.824 10.29 9 11.622 5.176-1.332 9-6.03 9-11.622 0-1.042-.133-2.052-.382-3.016z" />
                </svg>
                <span className="font-bold">✓ သင်၏ကိုယ်ပိုင် API Key အား အောင်မြင်စွာ သိမ်းဆည်းထားပြီးပါပြီ (Current key active)</span>
              </div>
              <button
                type="button"
                onClick={handleClearKey}
                className="text-[9px] font-black uppercase tracking-widest text-zinc-400 hover:text-red-400 transition-colors"
                title="Disconnect your API Key"
              >
                Clear Custom Key
              </button>
            </div>
          )}
        </div>

        {/* Step-by-step Burmese API Key acquisition Tutorial */}
        <div className="pt-6 border-t border-white/5 space-y-4">
          <h4 className="text-[11px] font-black uppercase text-accent tracking-widest">
            အဆင့်ဆင့်လုပ်ဆောင်ရန် လမ်းညွှန်ချက် (How to get free API Key for free)
          </h4>
          <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
            {[
              {
                step: '01',
                title: 'Google AI Studio သို့ သွားပါ',
                desc: 'ကိုယ်ပိုင် Web browser ဖြင့် aistudio.google.com သို့ ဝင်ရောက်ပြီး ဂျီမေးလ်ဖြင့် အခမဲ့ Sign in ပြုလုပ်ပါ။'
              },
              {
                step: '02',
                title: 'Create API Key နှိပ်ပါ',
                desc: '"Create API Key" ခလုတ်အားနှိပ်၍ "Create API Key in new project" ကို ရွေးချယ်ပြီး အခမဲ့ ရယူပါ။'
              },
              {
                step: '03',
                title: 'သိမ်းဆည်းပြီး စတင်သုံးပါ',
                desc: 'ရရှိလာသော API Key အား Copy ကူးယူပြီး အပေါ်ရှိ Input Box တွင် ထည့်သွင်းသိမ်းဆည်းကာ စတင် အသုံးပြုပါ။'
              }
            ].map((tut) => (
              <div key={tut.step} className="p-4.5 rounded-2xl bg-white/5 border border-white/5 flex gap-3.5 relative overflow-hidden group">
                <span className="font-mono text-xl font-bold text-accent/20 group-hover:text-accent/40 transition-colors select-none mt-1">
                  {tut.step}
                </span>
                <div className="space-y-1">
                  <h5 className="text-[11px] font-black uppercase text-zinc-200">{tut.title}</h5>
                  <p className="text-[10px] text-zinc-500 leading-relaxed font-bold">{tut.desc}</p>
                </div>
              </div>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
};

export default React.memo(Profile);
