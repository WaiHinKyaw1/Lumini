
  import React from 'react';
  import { CREDIT_COSTS, ContentType } from '../types';

  interface DashboardProps {
    onAction: (path: string) => void;
    stats: { credits: number, totalGenerated: number };
    onOpenCredits: () => void;
  }

  const Dashboard: React.FC<DashboardProps> = ({ onAction, stats, onOpenCredits }) => {
    const quickActions = [
      { title: 'Subtitle Studio', desc: 'Viral captions & overlays.', cost: CREDIT_COSTS[ContentType.SUBTITLE], path: 'subtitle', color: 'bg-cyan-600', icon: 'M7 8h10M7 12h4m1 8l-4-4H5a2 2 0 01-2-2V6a2 2 0 012-2h14a2 2 0 012 2v8a2 2 0 01-2 2h-3l-4 4z' },
      { title: 'Speech Master', desc: 'Gemini 2.5 TTS audio.', cost: CREDIT_COSTS[ContentType.SPEECH], path: 'speech', color: 'bg-indigo-600', icon: 'M11 5.882V19.24a1.76 1.76 0 01-3.417.592l-2.147-6.15M18 13a3 3 0 100-6M5.436 13.683A4.001 4.001 0 017 6h1.832c4.1 0 7.625-1.234 9.168-3v14c-1.543-1.766-5.067-3-9.168-3H7a3.988-3.988 0 01-1.564-.317z' },
      { title: 'AI Recapper', desc: 'Video to viral script.', cost: CREDIT_COSTS[ContentType.VIDEO_INSIGHTS], path: 'insights', color: 'bg-indigo-600', icon: 'M9 5H7a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2V7a2 2 0 00-2-2h-2M9 5a2 2 0 002 2h2a2 2 0 002-2M9 5a2 2 0 012-2h2a2 2 0 012 2m-3 7h3m-3 4h3m-6-4h.01M9 16h.01' },
      { title: 'Movie Recap', desc: 'Viral cinema summaries.', cost: CREDIT_COSTS[ContentType.MOVIE_RECAP], path: 'recap', color: 'bg-purple-600', icon: 'M7 4v16M17 4v16M3 8h4m10 0h4M3 12h18M3 16h4m10 0h4M4 21h16a1 1 0 001-1V4a1 1 0 00-1-1H4a1 1 0 00-1 1v16a1 1 0 001 1z' },
      { title: 'Thumbnail Gen', desc: 'Viral CTR design.', cost: CREDIT_COSTS[ContentType.THUMBNAIL], path: 'thumbnail', color: 'bg-amber-600', icon: 'M4 5a1 1 0 011-1h14a1 1 0 011 1v14a1 1 0 01-1 1H5a1 1 0 01-1-1V5z M4 13h16 M13 4v9 M4 9h9' },
      { title: 'Voice Synth', desc: 'Multi-speaker audio.', cost: CREDIT_COSTS[ContentType.VOICEOVER], path: 'voiceover', color: 'bg-emerald-600', icon: 'M19 11a7 7 0 01-7 7m0 0a7 7 0 01-7-7m7 7v4m0 0H8m4 0h4m-4-8a3 3 0 01-3-3V5a3 3 0 116 0v6a3 3 0 01-3 3z' },
      { title: 'Translate', desc: 'Global translation engine.', cost: CREDIT_COSTS[ContentType.TRANSLATION], path: 'translation', color: 'bg-amber-500', icon: 'M3 5h12M9 3v2m1.048 9.516a3.303 3.303 0 01-3.352-3.352c0-1.85 1.502-3.352 3.352-3.352s3.352 1.502 3.352 3.352-1.502 3.352-3.352 3.352z' },
    ];

    return (
      <div className="space-y-3 animate-in fade-in slide-in-from-bottom-4 duration-700">
        {/* Header Section */}
        <header className="py-0.5">
          <h1 className="text-xl md:text-2xl font-black tracking-tighter text-slate-900 dark:text-white mb-1">
            Lumina <span className="gradient-text">Studio.</span>
          </h1>
          <p className="text-slate-500 dark:text-zinc-500 text-[10px] font-medium leading-relaxed max-w-xl uppercase tracking-widest">
            High-performance generative tools.
          </p>
        </header>

        {/* Stats Grid - Compacted */}
        <div className="grid grid-cols-2 md:grid-cols-3 gap-1.5">
          <div className="glass p-2 rounded-lg relative overflow-hidden group transition-all">
            <p className="text-[8px] font-black text-slate-400 dark:text-zinc-500 uppercase tracking-widest mb-0.5">Credits</p>
            <div className="flex items-baseline gap-1">
              <h3 className="text-lg font-black text-slate-800 dark:text-white">{stats.credits}</h3>
              <span className="text-indigo-500 dark:text-indigo-400 font-bold text-[9px]">CR</span>
            </div>
          </div>
          
          <div className="glass p-2 rounded-lg relative overflow-hidden group transition-all">
            <p className="text-[8px] font-black text-slate-400 dark:text-zinc-500 uppercase tracking-widest mb-0.5">Generated</p>
            <div className="flex items-baseline gap-1">
              <h3 className="text-lg font-black text-slate-800 dark:text-white">{stats.totalGenerated}</h3>
              <span className="text-slate-400 dark:text-zinc-500 font-bold text-[9px]">Assets</span>
            </div>
          </div>

          <div className="glass p-2 rounded-lg flex items-center justify-between col-span-2 md:col-span-1">
            <div>
              <p className="text-[8px] font-black text-indigo-500 dark:text-indigo-400 uppercase tracking-widest mb-0.5">Plan</p>
              <h3 className="text-sm font-black text-slate-800 dark:text-white">Pro</h3>
            </div>
            <button 
              onClick={onOpenCredits}
              className="bg-indigo-600 hover:bg-indigo-500 text-white px-2 py-1 rounded-md text-[8px] font-black uppercase tracking-widest shadow-md shadow-indigo-600/10 active:scale-95 transition-all"
            >
              Top Up
            </button>
          </div>
        </div>

        {/* Tools Section - Compacted */}
        <div className="space-y-2">
          <div className="flex items-center gap-2">
            <h2 className="text-[8px] font-black uppercase tracking-[0.2em] text-slate-500 dark:text-zinc-600">Available Tools</h2>
            <div className="h-px flex-1 bg-slate-200 dark:bg-white/5"></div>
          </div>

          <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-1.5">
            {quickActions.map((action) => (
              <button
                key={action.path}
                onClick={() => onAction(action.path)}
                className="group glass p-2.5 rounded-lg text-left border border-transparent dark:border-white/5 hover:border-indigo-500/30 transition-all duration-300 flex flex-col h-full bg-white/50 dark:bg-transparent"
              >
                <div className="flex justify-between items-start mb-1.5">
                  <div className={`w-6 h-6 ${action.color} rounded-md flex items-center justify-center shadow-md group-hover:scale-105 transition-all`}>
                    <svg className="w-3 h-3 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d={action.icon} />
                    </svg>
                  </div>
                </div>
                
                <h3 className="text-[10px] font-black text-slate-800 dark:text-white mb-0.5 group-hover:text-indigo-600 dark:group-hover:text-indigo-400 transition-colors">{action.title}</h3>
                <p className="text-slate-500 dark:text-zinc-500 text-[8px] font-medium leading-tight mb-1.5 flex-1">{action.desc}</p>
                
                <div className="flex items-center justify-between mt-auto">
                  <span className="text-[8px] font-bold text-slate-400 dark:text-zinc-600 bg-slate-100 dark:bg-white/5 px-1 py-0.5 rounded-md">{action.cost} CR</span>
                  <svg className="w-2.5 h-2.5 text-slate-300 dark:text-zinc-700 group-hover:text-indigo-500 dark:group-hover:text-indigo-400 transition-all" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={3} d="M9 5l7 7-7 7" /></svg>
                </div>
              </button>
            ))}
          </div>
        </div>
        
        <footer className="pt-4 flex gap-4 opacity-40">
          <p className="text-[8px] font-black uppercase tracking-widest text-slate-400 dark:text-zinc-600">© 2025 Lumina Studio</p>
        </footer>
      </div>
    );
  };

  export default React.memo(Dashboard);
