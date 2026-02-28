
  import React from 'react';
  import { CREDIT_COSTS, ContentType } from '../types';

  interface DashboardProps {
    onAction: (path: string) => void;
    stats: { credits: number, totalGenerated: number };
    onOpenCredits: () => void;
  }

  const Dashboard: React.FC<DashboardProps> = ({ onAction, stats, onOpenCredits }) => {
    const categories = [
      {
        name: 'Video & Motion',
        items: [
          { title: 'AI Recapper', desc: 'Video to viral script.', cost: CREDIT_COSTS[ContentType.VIDEO_INSIGHTS], path: 'insights', color: 'bg-indigo-600', icon: 'M9 5H7a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2V7a2 2 0 00-2-2h-2M9 5a2 2 0 002 2h2a2 2 0 002-2M9 5a2 2 0 012-2h2a2 2 0 012 2m-3 7h3m-3 4h3m-6-4h.01M9 16h.01' },
          { title: 'Movie Recap', desc: 'Viral cinema summaries.', cost: CREDIT_COSTS[ContentType.MOVIE_RECAP], path: 'recap', color: 'bg-purple-600', icon: 'M7 4v16M17 4v16M3 8h4m10 0h4M3 12h18M3 16h4m10 0h4M4 21h16a1 1 0 001-1V4a1 1 0 00-1-1H4a1 1 0 00-1 1v16a1 1 0 001 1z' },
          { title: 'Video Trimmer', desc: 'AI highlight clips.', cost: CREDIT_COSTS[ContentType.VIDEO_TRIMMER], path: 'trimmer', color: 'bg-orange-600', icon: 'M14.121 14.121L19 19m-7-7l7-7m-7 7l-2.879 2.879M12 12L9.121 9.121m0 5.758L5 19m0-14l4.121 4.121' },
          { title: 'AI Avatar', desc: 'Talking head synth.', cost: CREDIT_COSTS[ContentType.AI_AVATAR], path: 'avatar', color: 'bg-violet-600', icon: 'M14.828 14.828a4 4 0 01-5.656 0M9 10h.01M15 10h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z' },
        ]
      },
      {
        name: 'Audio & Text',
        items: [
          { title: 'Subtitle Studio', desc: 'Viral captions & overlays.', cost: CREDIT_COSTS[ContentType.SUBTITLE], path: 'subtitle', color: 'bg-cyan-600', icon: 'M7 8h10M7 12h4m1 8l-4-4H5a2 2 0 01-2-2V6a2 2 0 012-2h14a2 2 0 012 2v8a2 2 0 01-2 2h-3l-4 4z' },
          { title: 'Auto Caption', desc: 'Hardcode subtitles.', cost: CREDIT_COSTS[ContentType.AUTO_CAPTION], path: 'autocaption', color: 'bg-emerald-600', icon: 'M7 8h10M7 12h4m1 8l-4-4H5a2 2 0 01-2-2V6a2 2 0 012-2h14a2 2 0 012 2v8a2 2 0 01-2 2h-3l-4 4z' },
          { title: 'Voice Synth', desc: 'Multi-speaker audio.', cost: CREDIT_COSTS[ContentType.VOICEOVER], path: 'voiceover', color: 'bg-emerald-600', icon: 'M19 11a7 7 0 01-7 7m0 0a7 7 0 01-7-7m7 7v4m0 0H8m4 0h4m-4-8a3 3 0 01-3-3V5a3 3 0 116 0v6a3 3 0 01-3 3z' },
          { title: 'Transcription', desc: 'Media to text.', cost: CREDIT_COSTS[ContentType.TRANSCRIPTION], path: 'transcription', color: 'bg-blue-600', icon: 'M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z' },
        ]
      },
      {
        name: 'Design & Strategy',
        items: [
          { title: 'Thumbnail Gen', desc: 'Viral CTR design.', cost: CREDIT_COSTS[ContentType.THUMBNAIL], path: 'thumbnail', color: 'bg-amber-600', icon: 'M4 5a1 1 0 011-1h14a1 1 0 011 1v14a1 1 0 01-1 1H5a1 1 0 01-1-1V5z M4 13h16 M13 4v9 M4 9h9' },
          { title: 'Social Gen', desc: 'Viral post strategy.', cost: CREDIT_COSTS[ContentType.SOCIAL_GEN], path: 'social', color: 'bg-pink-600', icon: 'M11 5.882V19.24a1.76 1.76 0 01-3.417.592l-2.147-6.15M18 13a3 3 0 100-6M5.436 13.683A4.001 4.001 0 017 6h1.832c4.1 0 7.625-1.234 9.168-3v14c-1.543-1.766-5.067-3-9.168-3H7a3.988 3.988 0 01-1.564-.317z' },
          { title: 'Translate', desc: 'Global translation.', cost: CREDIT_COSTS[ContentType.TRANSLATION], path: 'translation', color: 'bg-amber-500', icon: 'M3 5h12M9 3v2m1.048 9.516a3.303 3.303 0 01-3.352-3.352c0-1.85 1.502-3.352 3.352-3.352s3.352 1.502 3.352 3.352-1.502 3.352-3.352 3.352z' },
        ]
      }
    ];

    return (
      <div className="space-y-6 animate-in fade-in slide-in-from-bottom-4 duration-700 pb-12">
        {/* Hero Section */}
        <header className="relative py-8 px-8 rounded-3xl bg-gradient-to-br from-indigo-600 to-violet-700 overflow-hidden shadow-2xl shadow-indigo-500/20">
          <div className="absolute top-0 right-0 w-64 h-64 bg-white/10 rounded-full blur-[80px] -mr-32 -mt-32"></div>
          <div className="absolute bottom-0 left-0 w-48 h-48 bg-black/20 rounded-full blur-[60px] -ml-24 -mb-24"></div>
          
          <div className="relative z-10 max-w-2xl">
            <div className="inline-flex items-center gap-2 px-2 py-0.5 rounded-full bg-white/10 border border-white/10 backdrop-blur-md mb-4">
              <span className="w-1 h-1 rounded-full bg-emerald-400 animate-pulse"></span>
              <span className="text-[8px] font-black text-white uppercase tracking-widest">System Operational</span>
            </div>
            <h1 className="text-3xl md:text-4xl font-black tracking-tighter text-white mb-2 leading-tight">
              Lumina <span className="text-indigo-200">Studio.</span>
            </h1>
            <p className="text-indigo-100 text-xs md:text-sm font-medium leading-relaxed max-w-lg opacity-80">
              The ultimate high-performance engine for viral content creation. Powered by Gemini.
            </p>
          </div>
        </header>

        {/* Stats Grid */}
        <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
          <div className="glass p-4 rounded-2xl border border-white/5 flex flex-col justify-between">
            <div className="flex justify-between items-start mb-2">
              <p className="text-[9px] font-black text-slate-400 dark:text-zinc-500 uppercase tracking-widest">Available Credits</p>
              <div className="w-6 h-6 rounded-lg bg-indigo-500/10 flex items-center justify-center text-indigo-500">
                <svg className="w-3 h-3" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 10V3L4 14h7v7l9-11h-7z" /></svg>
              </div>
            </div>
            <div className="flex items-baseline gap-1.5">
              <h3 className="text-2xl font-black text-slate-800 dark:text-white tracking-tighter">{stats.credits}</h3>
              <span className="text-indigo-500 dark:text-indigo-400 font-bold text-[10px] uppercase tracking-widest">Credits</span>
            </div>
            <button 
              onClick={onOpenCredits}
              className="mt-4 w-full py-2 bg-indigo-600 hover:bg-indigo-500 text-white rounded-xl text-[9px] font-black uppercase tracking-widest shadow-lg shadow-indigo-600/20 transition-all active:scale-95"
            >
              Refuel
            </button>
          </div>
          
          <div className="glass p-4 rounded-2xl border border-white/5 flex flex-col justify-between">
            <div className="flex justify-between items-start mb-2">
              <p className="text-[9px] font-black text-slate-400 dark:text-zinc-500 uppercase tracking-widest">Total Assets</p>
              <div className="w-6 h-6 rounded-lg bg-emerald-500/10 flex items-center justify-center text-emerald-500">
                <svg className="w-3 h-3" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 3v4M3 5h4M6 17v4m-2-2h4m5-16l2.286 6.857L21 12l-5.714 2.143L13 21l-2.286-6.857L5 12l5.714-2.143L13 3z" /></svg>
              </div>
            </div>
            <div className="flex items-baseline gap-1.5">
              <h3 className="text-2xl font-black text-slate-800 dark:text-white tracking-tighter">{stats.totalGenerated}</h3>
              <span className="text-slate-400 dark:text-zinc-500 font-bold text-[10px] uppercase tracking-widest">Generated</span>
            </div>
            <div className="mt-4 h-1 w-full bg-slate-100 dark:bg-white/5 rounded-full overflow-hidden">
              <div className="h-full bg-emerald-500 w-[75%]"></div>
            </div>
          </div>

          <div className="glass p-4 rounded-2xl border border-white/5 flex flex-col justify-between bg-zinc-900 dark:bg-white text-white dark:text-zinc-900">
            <div className="flex justify-between items-start mb-2">
              <p className="text-[9px] font-black opacity-50 uppercase tracking-widest">Subscription</p>
              <div className="w-6 h-6 rounded-lg bg-white/10 dark:bg-black/10 flex items-center justify-center">
                <svg className="w-3 h-3" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 3v4M3 5h4M6 17v4m-2-2h4m5-16l2.286 6.857L21 12l-5.714 2.143L13 21l-2.286-6.857L5 12l5.714-2.143L13 3z" /></svg>
              </div>
            </div>
            <div>
              <h3 className="text-xl font-black tracking-tighter uppercase italic">Studio Pro</h3>
              <div className="mt-2 flex items-center gap-1.5">
                <span className="w-1.5 h-1.5 rounded-full bg-emerald-500"></span>
                <span className="text-[8px] font-black uppercase tracking-widest opacity-60">Active Session</span>
              </div>
            </div>
          </div>
        </div>

        {/* Tools Section */}
        <div className="space-y-8 pt-4">
          {categories.map((category) => (
            <div key={category.name} className="space-y-4">
              <div className="flex items-center gap-3">
                <h2 className="text-[10px] font-black uppercase tracking-[0.3em] text-slate-400 dark:text-zinc-600 whitespace-nowrap">{category.name}</h2>
                <div className="h-px w-full bg-slate-200 dark:bg-white/5"></div>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3">
                {category.items.map((action) => (
                  <button
                    key={action.path}
                    onClick={() => onAction(action.path)}
                    className="group relative glass p-4 rounded-2xl text-left border border-transparent dark:border-white/5 hover:border-indigo-500/30 transition-all duration-500 flex flex-col h-full bg-white dark:bg-zinc-900/50 hover:shadow-xl hover:shadow-indigo-500/10 hover:-translate-y-0.5"
                  >
                    <div className="flex justify-between items-start mb-4">
                      <div className={`w-10 h-10 ${action.color} rounded-xl flex items-center justify-center shadow-lg shadow-indigo-500/10 group-hover:scale-105 transition-all duration-500`}>
                        <svg className="w-5 h-5 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d={action.icon} />
                        </svg>
                      </div>
                      <div className="opacity-0 group-hover:opacity-100 transition-opacity duration-500">
                        <svg className="w-4 h-4 text-indigo-500" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M17 8l4 4m0 0l-4 4m4-4H3" /></svg>
                      </div>
                    </div>
                    
                    <h3 className="text-sm font-black text-slate-800 dark:text-white mb-1 group-hover:text-indigo-600 dark:group-hover:text-indigo-400 transition-colors tracking-tight uppercase">{action.title}</h3>
                    <p className="text-slate-500 dark:text-zinc-500 text-[10px] font-medium leading-relaxed mb-4 flex-1">{action.desc}</p>
                    
                    <div className="flex items-center justify-between mt-auto pt-3 border-t border-slate-100 dark:border-white/5">
                      <div className="flex items-center gap-1">
                        <span className="text-[9px] font-black text-slate-900 dark:text-white">{action.cost}</span>
                        <span className="text-[7px] font-bold text-slate-400 dark:text-zinc-600 uppercase tracking-widest">CR</span>
                      </div>
                      <span className="text-[7px] font-black text-indigo-500 dark:text-indigo-400 uppercase tracking-widest opacity-0 group-hover:opacity-100 transition-opacity">Launch</span>
                    </div>
                  </button>
                ))}
              </div>
            </div>
          ))}
        </div>
        
        <footer className="pt-12 border-t border-slate-100 dark:border-white/5 flex flex-col md:flex-row justify-between items-center gap-4">
          <div className="flex items-center gap-4">
            <p className="text-[10px] font-black uppercase tracking-widest text-slate-400 dark:text-zinc-600">© 2025 Lumina Studio Engine</p>
            <div className="h-4 w-px bg-slate-200 dark:bg-white/10"></div>
            <p className="text-[10px] font-black uppercase tracking-widest text-indigo-500 dark:text-indigo-400">v2.5.0-PRO</p>
          </div>
          <div className="flex gap-6">
            <button className="text-[10px] font-black uppercase tracking-widest text-slate-400 hover:text-indigo-500 transition-colors">Documentation</button>
            <button className="text-[10px] font-black uppercase tracking-widest text-slate-400 hover:text-indigo-500 transition-colors">API Status</button>
            <button className="text-[10px] font-black uppercase tracking-widest text-slate-400 hover:text-indigo-500 transition-colors">Support</button>
          </div>
        </footer>
      </div>
    );
  };

  export default React.memo(Dashboard);

