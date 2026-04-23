
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
        { title: 'AI Recapper', desc: 'Video to viral script.', cost: CREDIT_COSTS[ContentType.VIDEO_INSIGHTS], path: 'insights', color: 'bg-accent', icon: 'M9 5H7a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2V7a2 2 0 00-2-2h-2M9 5a2 2 0 002 2h2a2 2 0 002-2M9 5a2 2 0 012-2h2a2 2 0 012 2m-3 7h3m-3 4h3m-6-4h.01M9 16h.01' },
        { title: 'Movie Recap', desc: 'Viral cinema summaries.', cost: CREDIT_COSTS[ContentType.MOVIE_RECAP], path: 'recap', color: 'bg-accent/80', icon: 'M7 4v16M17 4v16M3 8h4m10 0h4M3 12h18M3 16h4m10 0h4M4 21h16a1 1 0 001-1V4a1 1 0 00-1-1H4a1 1 0 00-1 1v16a1 1 0 001 1z' },
      ]
    },
    {
      name: 'Audio & Text',
      items: [
        { title: 'Subtitle Studio', desc: 'Viral captions & overlays.', cost: CREDIT_COSTS[ContentType.SUBTITLE], path: 'subtitle', color: 'bg-white/10', icon: 'M7 8h10M7 12h4m1 8l-4-4H5a2 2 0 01-2-2V6a2 2 0 012-2h14a2 2 0 012 2v8a2 2 0 01-2 2h-3l-4 4z' },
        { title: 'Voice Synth', desc: 'Multi-speaker audio.', cost: CREDIT_COSTS[ContentType.VOICEOVER], path: 'voiceover', color: 'bg-white/10', icon: 'M19 11a7 7 0 01-7 7m0 0a7 7 0 01-7-7m7 7v4m0 0H8m4 0h4m-4-8a3 3 0 01-3-3V5a3 3 0 116 0v6a3 3 0 01-3 3z' },
        { title: 'Transcription', desc: 'Media to text.', cost: CREDIT_COSTS[ContentType.TRANSCRIPTION], path: 'transcription', color: 'bg-white/10', icon: 'M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z' },
      ]
    },
    {
      name: 'Design & Strategy',
      items: [
        { title: 'Thumbnail Gen', desc: 'Viral CTR design.', cost: CREDIT_COSTS[ContentType.THUMBNAIL], path: 'thumbnail', costLabel: '8 CR', color: 'bg-accent/60', icon: 'M4 5a1 1 0 011-1h14a1 1 0 011 1v14a1 1 0 01-1 1H5a1 1 0 01-1-1V5z M4 13h16 M13 4v9 M4 9h9' },
        { title: 'Translate', desc: 'Global translation.', cost: CREDIT_COSTS[ContentType.TRANSLATION], path: 'translation', color: 'bg-white/10', icon: 'M3 5h12M9 3v2m1.048 9.516a3.303 3.303 0 01-3.352-3.352c0-1.85 1.502-3.352 3.352-3.352s3.352 1.502 3.352 3.352-1.502 3.352-3.352 3.352z' },
      ]
    }
  ];

  return (
    <div className="space-y-8 animate-in fade-in duration-700 pb-12">
      {/* Stats Grid - Compact */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        {[
          { label: 'Available Credits', value: stats.credits, unit: 'CR', color: 'text-accent', icon: 'M13 10V3L4 14h7v7l9-11h-7z' },
          { label: 'Assets Generated', value: stats.totalGenerated, unit: 'FILES', color: 'text-zinc-100', icon: 'M5 3v4M3 5h4M6 17v4m-2-2h4m5-16l2.286 6.857L21 12l-5.714 2.143L13 21l-2.286-6.857L5 12l5.714-2.143L13 3z' },
          { label: 'Studio Status', value: 'PRO', unit: 'ACTIVE', color: 'text-zinc-100', icon: 'M9 12l2 2 4-4m5.618-4.016A11.955 11.955 0 0112 2.944a11.955 11.955 0 01-8.618 3.04A12.02 12.02 0 003 9c0 5.591 3.824 10.29 9 11.622 5.176-1.332 9-6.03 9-11.622 0-1.042-.133-2.052-.382-3.016z' }
        ].map((stat, i) => (
          <div key={i} className="group relative p-5 rounded-2xl bg-white/5 border border-white/10 hover:border-white/20 transition-all overflow-hidden">
            <div className="absolute top-0 right-0 p-4 opacity-20 group-hover:opacity-40 transition-opacity">
              <svg className={`w-8 h-8 ${stat.color}`} fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d={stat.icon} />
              </svg>
            </div>
            <p className="movie-meta !mb-2 uppercase tracking-[0.2em]">{stat.label}</p>
            <div className="flex items-baseline gap-1.5">
              <h3 className="text-3xl font-black tracking-tighter text-white">{stat.value}</h3>
              <span className={`text-[9px] font-black uppercase tracking-widest ${stat.color}`}>{stat.unit}</span>
            </div>
          </div>
        ))}
      </div>

      {/* Tools Section - Refined Grid */}
      <div className="space-y-20">
        {categories.map((category) => (
          <div key={category.name} className="space-y-8">
            <div className="flex items-center justify-between px-2">
              <div className="flex items-center gap-4">
                <h2 className="movie-h2 !text-lg uppercase tracking-[0.2em] !mb-0 font-black text-white">{category.name}</h2>
                <div className="h-px w-24 bg-gradient-to-r from-accent/60 via-accent/20 to-transparent"></div>
              </div>
              <p className="movie-meta !text-[10px] !mb-0 uppercase tracking-[0.3em] text-zinc-600 font-black">{category.items.length} MODULES AVAILABLE</p>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-5">
              {category.items.map((action) => (
                <button
                  key={action.path}
                  onClick={() => onAction(action.path)}
                  className="group relative p-6 rounded-3xl bg-[#121212] border border-white/5 hover:border-accent/40 transition-all duration-500 text-left flex flex-col h-full hover:shadow-[0_20px_40px_rgba(225,29,72,0.1)] hover:-translate-y-1"
                >
                  <div className={`w-12 h-12 ${action.color} rounded-xl flex items-center justify-center shadow-lg mb-6 group-hover:scale-110 group-hover:rotate-3 transition-all duration-500 shadow-black/50`}>
                    <svg className="w-6 h-6 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d={action.icon} />
                    </svg>
                  </div>
                  
                  <h3 className="movie-h2 !text-[15px] !mb-2 uppercase tracking-tight text-white group-hover:text-accent transition-colors">{action.title}</h3>
                  <p className="movie-body !text-[12px] !mb-6 flex-1 text-zinc-500 leading-relaxed group-hover:text-zinc-400 transition-colors">{action.desc}</p>
                  
                  <div className="flex items-center justify-between pt-5 border-t border-white/5 mt-auto">
                    <div className="flex items-center gap-2">
                      <span className="movie-meta !text-[11px] font-black text-white !mb-0">{action.cost}</span>
                      <span className="movie-meta !text-[9px] font-bold text-zinc-700 uppercase tracking-widest !mb-0">UNITS</span>
                    </div>
                    <div className="w-8 h-8 rounded-xl border border-white/5 flex items-center justify-center group-hover:bg-accent group-hover:text-white group-hover:border-accent transition-all shadow-inner">
                      <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M17 8l4 4m0 0l-4 4m4-4H3" /></svg>
                    </div>
                  </div>
                </button>
              ))}
            </div>
          </div>
        ))}
      </div>
      
      {/* Footer - Minimal Luxury */}
      <footer className="pt-12 border-t border-white/5 flex flex-col md:flex-row justify-between items-center gap-4">
        <div className="space-y-1">
          <div className="flex items-center gap-2">
            <div className="w-5 h-5 bg-accent rounded-md flex items-center justify-center">
              <svg className="w-3 h-3 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 15v2m-6 4h12a2 2 0 002-2v-6a2 2 0 00-2-2H6a2 2 0 00-2 2v6a2 2 0 00-2 2zm10-10V7a4 4 0 00-8 0v4h8z" /></svg>
            </div>
            <span className="text-xs font-black uppercase tracking-tighter text-white">Lumina Studio</span>
          </div>
          <p className="movie-meta !text-[9px] uppercase tracking-widest">© 2025 Lumina Studio.</p>
        </div>

        <div className="flex flex-wrap justify-center gap-4">
          {['Documentation', 'API Status', 'Privacy Policy', 'Support'].map(link => (
            <button key={link} className="text-[9px] font-black uppercase tracking-widest text-zinc-500 hover:text-white transition-colors">{link}</button>
          ))}
        </div>
      </footer>
    </div>
  );
};

export default React.memo(Dashboard);

