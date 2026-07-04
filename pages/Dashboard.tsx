import React, { useState } from 'react';
import { CREDIT_COSTS, ContentType } from '../types';

interface DashboardItem {
  title: string;
  desc: string;
  cost: number;
  path: string;
  color: string;
  icon: React.ReactNode;
  badge?: string;
}

interface DashboardCategory {
  id: string;
  name: string;
  desc: string;
  items: DashboardItem[];
}

interface DashboardProps {
  onAction: (path: string) => void;
  stats: { credits: number, totalGenerated: number };
  onOpenCredits: () => void;
}

const Dashboard: React.FC<DashboardProps> = ({ onAction, stats, onOpenCredits }) => {
  const [activeCategoryFilter, setActiveCategoryFilter] = useState<string>('all');
  const [searchTerm, setSearchTerm] = useState<string>('');

  const categories: DashboardCategory[] = [
    {
      id: 'video',
      name: 'Cinema & Video Studio',
      desc: 'Professional grade video analyzers, narrative scripting tools, and custom creators',
      items: [
        { 
          title: 'AI Movie Recapper', 
          desc: 'Analyze cinematic screenplays, transcribe footage points, and structure engaging viral recap drafts.', 
          cost: CREDIT_COSTS[ContentType.VIDEO_INSIGHTS], 
          path: 'insights', 
          color: 'from-amber-500/10 to-orange-600/10 text-orange-500 border-orange-500/20 dark:border-orange-500/10', 
          icon: (
            <svg className="w-5 h-5 text-orange-500" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.8} d="M15 10l4.553-2.276A1 1 0 0121 8.723v6.554a1 1 0 01-1.447.894L15 14M5 18h8a2 2 0 002-2V8a2 2 0 00-2-2H5a2 2 0 00-2 2v8a2 2 0 002 2z" />
            </svg>
          ),
          badge: 'Most Popular'
        },
        { 
          title: 'Movie Recap Studio', 
          desc: 'Generate viral narration structures, dialogue highlights, and cinematic scenes with perfect accuracy.', 
          cost: CREDIT_COSTS[ContentType.MOVIE_RECAP], 
          path: 'recap', 
          color: 'from-red-500/10 to-rose-600/10 text-red-500 border-red-500/20 dark:border-red-500/10', 
          icon: (
            <svg className="w-5 h-5 text-red-500" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.8} d="M7 4v16M17 4v16M3 8h4m10 0h4M3 12h18M3 16h4m10 0h4M4 21h16a1 1 0 001-1V4a1 1 0 00-1-1H4a1 1 0 00-1 1v16a1 1 0 001 1z" />
            </svg>
          ),
          badge: 'Cinema Specialized'
        },
        { 
          title: 'All-in-One Video Studio', 
          desc: 'Harmonize automated subtitles, voiceover backtracks, and video outputs in a unified video workshop.', 
          cost: CREDIT_COSTS[ContentType.VIDEO] || 15, 
          path: 'video', 
          color: 'from-blue-500/10 to-indigo-600/10 text-indigo-500 border-indigo-500/20 dark:border-indigo-500/10', 
          icon: (
            <svg className="w-5 h-5 text-indigo-500" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.8} d="M15 15l-2 5L9 9l11 4-5 2zm0 0l5 5M7.188 2.239l.777 2.897M5.136 7.965l-2.898-.777M13.95 4.05l-2.122 2.122m-5.657 5.656l-2.12 2.122" />
            </svg>
          ),
          badge: 'Power Engine'
        }
      ]
    },
    {
      id: 'voice',
      name: 'Vocal Audio Synthesis',
      desc: 'Convert Burmese or English script dialogues into premium broadcast voiceover audios',
      items: [
        { 
          title: 'Premium Voice Synth', 
          desc: 'High-fidelity voice synthesis utilizing modern speaker tones, custom speeds, and native accents.', 
          cost: CREDIT_COSTS[ContentType.VOICEOVER], 
          path: 'voiceover', 
          color: 'from-violet-500/10 to-fuchsia-600/10 text-fuchsia-500 border-fuchsia-500/20 dark:border-fuchsia-500/10', 
          icon: (
            <svg className="w-5 h-5 text-fuchsia-500" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.8} d="M19 11a7 7 0 01-7 7m0 0a7 7 0 01-7-7m7 7v4m0 0H8m4 0h4m-4-8a3 3 0 01-3-3V5a3 3 0 116 0v6a3 3 0 01-3 3z" />
            </svg>
          ),
          badge: 'Trending Voices'
        },
        { 
          title: 'Subtitle Studio', 
          desc: 'Transcribe recordings, auto-align captions, and export stylized subtitles for viral short videos.', 
          cost: CREDIT_COSTS[ContentType.SUBTITLE], 
          path: 'subtitle', 
          color: 'from-teal-500/10 to-emerald-600/10 text-teal-500 border-teal-500/20 dark:border-teal-500/10', 
          icon: (
            <svg className="w-5 h-5 text-teal-500" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.8} d="M7 8h10M7 12h4m1 8l-4-4H5a2 2 0 01-2-2V6a2 2 0 012-2h14a2 2 0 012 2v8a2 2 0 01-2 2h-3l-4 4z" />
            </svg>
          )
        },
        { 
          title: 'Transcription Engine', 
          desc: 'High-accuracy audio transcribing with timestamps, multi-speaker detection, and translation options.', 
          cost: CREDIT_COSTS[ContentType.TRANSCRIPTION], 
          path: 'transcription', 
          color: 'from-sky-500/10 to-cyan-600/10 text-sky-500 border-sky-500/20 dark:border-sky-500/10', 
          icon: (
            <svg className="w-5 h-5 text-sky-500" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.8} d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
            </svg>
          )
        }
      ]
    },
    {
      id: 'design',
      name: 'Creative Assets & Translators',
      desc: 'Maximize engagement, translate dialogue, and elevate thumbnail CTR instantly',
      items: [
        { 
          title: 'Thumbnail Generator', 
          desc: 'Generate click-worthy, cinematic, high CTR covers optimized for social media platforms.', 
          cost: CREDIT_COSTS[ContentType.THUMBNAIL] || 8, 
          path: 'thumbnail', 
          color: 'from-pink-500/10 to-rose-600/10 text-pink-500 border-pink-500/20 dark:border-pink-500/10', 
          icon: (
            <svg className="w-5 h-5 text-pink-500" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.8} d="M4 16l4.586-4.586a2 2 0 012.828 0L16 16m-2-2l1.586-1.586a2 2 0 012.828 0L20 14m-6-6h.01M6 20h12a2 2 0 002-2V6a2 2 0 00-2-2H6a2 2 0 00-2 2v12a2 2 0 002 2z" />
            </svg>
          ),
          badge: 'CTR Booster'
        },
        { 
          title: 'Intelligent Translation', 
          desc: 'Translate natural dialogue script between English and Burmese with flawless flow, context and accuracy.', 
          cost: CREDIT_COSTS[ContentType.TRANSLATION], 
          path: 'translation', 
          color: 'from-emerald-500/10 to-green-600/10 text-emerald-500 border-emerald-500/20 dark:border-emerald-500/10', 
          icon: (
            <svg className="w-5 h-5 text-emerald-500" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.8} d="M3 5h12M9 3v2m1.048 9.516a3.303 3.303 0 01-3.352-3.352c0-1.85 1.502-3.352 3.352-3.352s3.352 1.502 3.352 3.352-1.502 3.352-3.352 3.352z" />
            </svg>
          )
        }
      ]
    }
  ];

  return (
    <div className="space-y-10 animate-in fade-in duration-500 pb-20 select-none">
      
      {/* Premium Header / Welcome Billboard */}
      <div className="relative rounded-[2rem] bg-gradient-to-r from-slate-900 via-slate-800 to-zinc-950 text-white border border-slate-800 p-8 md:p-10 overflow-hidden text-left shadow-2xl dark:border-white/5">
        <div className="absolute top-0 right-0 w-96 h-96 bg-gradient-to-bl from-accent/20 via-transparent to-transparent rounded-full blur-[80px] pointer-events-none" />
        <div className="absolute -left-10 -bottom-10 w-80 h-80 bg-gradient-to-tr from-accent/5 via-transparent to-transparent rounded-full blur-[60px] pointer-events-none" />
        
        <div className="relative z-10 flex flex-col lg:flex-row lg:items-center justify-between gap-8">
          <div className="space-y-4 max-w-xl">
            <span className="px-3 py-1 rounded-full bg-accent/15 border border-accent/30 text-accent text-[9px] font-black uppercase tracking-widest inline-block animate-pulse">
              SYSTEM LIVE & ACCELERATED
            </span>
            <h1 className="text-3xl md:text-4xl font-black tracking-tight text-white leading-tight">
              Create Stunning Content with <span className="text-transparent bg-clip-text bg-gradient-to-r from-white via-accent to-accent">Lumina Studio</span>
            </h1>
            <p className="text-xs text-slate-300 leading-relaxed font-medium">
              Your comprehensive content creator station. Craft mesmerizing movie recaps, synthesize high-fidelity trending Burmese voiceovers, auto-sync video subtitles, and generate stunning custom thumbnails effortlessly.
            </p>
          </div>

          {/* Premium Balance Card */}
          <div className="relative bg-black/40 backdrop-blur-md border border-white/10 rounded-2xl p-6 flex flex-wrap sm:flex-nowrap gap-8 items-center min-w-[280px]">
            <div className="flex-1 space-y-1">
              <span className="text-[9px] uppercase tracking-widest text-slate-400 font-extrabold block">STUDIO CREDITS</span>
              <div className="flex items-baseline gap-1.5">
                <span className="text-3xl font-black text-white tracking-wider">{stats.credits}</span>
                <span className="text-[10px] font-black text-accent tracking-widest uppercase">Credits</span>
              </div>
              <button 
                onClick={onOpenCredits}
                className="text-[9px] font-black text-accent hover:text-accent-hover uppercase tracking-widest flex items-center gap-1.5 group transition-colors pt-2 border-t border-white/5 mt-2 w-full text-left"
              >
                Top up Balance
                <svg className="w-2.5 h-2.5 transform group-hover:translate-x-1 transition-transform" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={3} d="M9 5l7 7-7 7" />
                </svg>
              </button>
            </div>

            <div className="w-px h-16 bg-white/10 hidden sm:block" />

            <div className="flex-1 space-y-1">
              <span className="text-[9px] uppercase tracking-widest text-slate-450 font-extrabold block">Total Generated</span>
              <div className="flex items-baseline gap-1">
                <span className="text-2xl font-black text-slate-200 tracking-tight">{stats.totalGenerated}</span>
                <span className="text-[8px] font-bold text-slate-400 uppercase tracking-widest">assets</span>
              </div>
              <div className="flex items-center gap-1.5 pt-2 border-t border-white/5 mt-2">
                <span className="w-2 h-2 bg-emerald-500 rounded-full animate-pulse" />
                <span className="text-[8px] text-emerald-400 uppercase tracking-widest font-black">Cloud Synced</span>
              </div>
            </div>
          </div>
        </div>
      </div>

      {/* Modern Filter Navigation */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 border-b border-gray-200 dark:border-white/10 pb-6">
        <div className="flex flex-wrap items-center gap-2">
          {[
            { id: 'all', label: 'All Modules' },
            { id: 'video', label: 'Video Studio' },
            { id: 'voice', label: 'Voice Synth & Audio' },
            { id: 'design', label: 'Design & Translators' }
          ].map((tab) => (
            <button
              key={tab.id}
              onClick={() => setActiveCategoryFilter(tab.id)}
              className={`px-4 py-2 text-[10px] uppercase tracking-widest font-black rounded-xl transition-all duration-300 border ${
                activeCategoryFilter === tab.id
                  ? 'bg-accent/10 border-accent/40 text-accent shadow-lg shadow-accent/5'
                  : 'bg-white dark:bg-[#0c0c0e] hover:bg-gray-50 dark:hover:bg-zinc-900 border-gray-200 dark:border-white/5 text-slate-500 dark:text-zinc-400 hover:text-slate-900 dark:hover:text-white'
              }`}
            >
              {tab.label}
            </button>
          ))}
        </div>

        {/* Dynamic Search */}
        <div className="relative w-full sm:w-80">
          <input
            type="text"
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
            placeholder="Search studio modules..."
            className="w-full bg-white dark:bg-[#0c0c0e] border border-gray-200 dark:border-white/5 focus:border-accent/40 rounded-xl py-2 px-3 pl-10 text-xs text-slate-800 dark:text-white outline-none focus:ring-1 focus:ring-accent/20 tracking-wide placeholder:text-slate-400 dark:placeholder:text-zinc-550 transition-all shadow-inner"
          />
          <svg className="w-4 h-4 text-slate-400 dark:text-zinc-650 absolute left-3.5 top-1/2 -translate-y-1/2" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.2} d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" />
          </svg>
        </div>
      </div>

      {/* Main Bento Modular Content */}
      <div className="space-y-12 text-left">
        {categories
          .filter(cat => activeCategoryFilter === 'all' || cat.id === activeCategoryFilter)
          .map((category) => {
            const matchedItems = category.items.filter(item => {
              const query = searchTerm.toLowerCase();
              return item.title.toLowerCase().includes(query) || item.desc.toLowerCase().includes(query);
            });

            if (matchedItems.length === 0) return null;

            return (
              <div key={category.id} className="space-y-6">
                <div className="flex flex-col sm:flex-row sm:items-baseline justify-between gap-1 border-l-3 border-accent pl-4">
                  <h3 className="text-xs uppercase font-extrabold tracking-widest text-slate-900 dark:text-white">{category.name}</h3>
                  <span className="text-[9px] uppercase tracking-widest font-semibold text-slate-450 dark:text-zinc-500">{category.desc}</span>
                </div>

                <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
                  {matchedItems.map((action) => (
                    <button
                      key={action.path}
                      onClick={() => onAction(action.path)}
                      className="group relative p-6 rounded-2xl bg-white dark:bg-[#0c0c0e] border border-gray-200 dark:border-white/5 hover:border-accent/40 dark:hover:border-accent/40 hover:bg-slate-50/50 dark:hover:bg-zinc-950/40 transition-all duration-300 text-left flex flex-col justify-between h-full shadow-sm hover:shadow-xl hover:shadow-black/5"
                    >
                      <div>
                        {/* Upper Card Info and Badge */}
                        <div className="flex items-start justify-between gap-4 mb-4">
                          <div className={`p-3 rounded-xl bg-gradient-to-br ${action.color} border flex items-center justify-center transition-transform group-hover:scale-105 duration-300`}>
                            {action.icon}
                          </div>
                          <div className="flex flex-col items-end gap-1">
                            {action.badge && (
                              <span className="px-2 py-0.5 rounded-full bg-accent/10 border border-accent/25 text-accent text-[7px] font-black uppercase tracking-widest">
                                {action.badge}
                              </span>
                            )}
                            <div className="flex items-baseline gap-1 mt-1 bg-gray-100 dark:bg-white/5 px-2.5 py-0.5 rounded-full border border-gray-200/50 dark:border-white/5">
                              <span className="text-[9.5px] font-black text-slate-800 dark:text-white">{action.cost}</span>
                              <span className="text-[7.5px] font-bold text-slate-400 dark:text-zinc-500 uppercase tracking-widest">CR</span>
                            </div>
                          </div>
                        </div>

                        {/* Title and Descriptions */}
                        <h4 className="text-xs font-black uppercase tracking-wide text-slate-900 dark:text-zinc-100 group-hover:text-accent transition-colors">
                          {action.title}
                        </h4>
                        <p className="text-xs text-slate-500 dark:text-zinc-400 leading-relaxed font-medium mt-2 pb-5">
                          {action.desc}
                        </p>
                      </div>

                      {/* Launch Trigger Button Bar */}
                      <div className="flex items-center justify-between pt-3.5 border-t border-gray-100 dark:border-white/5 mt-auto w-full">
                        <span className="text-[8.5px] font-black uppercase tracking-[0.2em] text-slate-400 dark:text-zinc-500 group-hover:text-slate-800 dark:group-hover:text-zinc-300 transition-colors">
                          Open studio module
                        </span>
                        <div className="w-7 h-7 rounded-lg border border-gray-200 dark:border-white/5 flex items-center justify-center bg-gray-50 dark:bg-white/5 group-hover:bg-accent group-hover:text-white group-hover:border-accent transition-all duration-300">
                          <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M14 5l7 7m0 0l-7 7m7-7H3" />
                          </svg>
                        </div>
                      </div>
                    </button>
                  ))}
                </div>
              </div>
            );
          })}
      </div>

    </div>
  );
};

export default React.memo(Dashboard);
