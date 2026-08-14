import React, { useState } from 'react';
import { CREDIT_COSTS, ContentType } from '../types';

interface DashboardItem {
  title: string;
  desc: string;
  cost: number;
  path: string;
  color: string;
  icon: React.ReactNode;
}

interface DashboardCategory {
  id: string;
  name: string;
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
      name: 'Video Studio',
      items: [
        { 
          title: 'AI Recapper', 
          desc: 'Analyze screenplays and create engaging viral recap drafts.', 
          cost: CREDIT_COSTS[ContentType.VIDEO_INSIGHTS], 
          path: 'insights', 
          color: 'text-orange-500', 
          icon: (
            <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.8} d="M15 10l4.553-2.276A1 1 0 0121 8.723v6.554a1 1 0 01-1.447.894L15 14M5 18h8a2 2 0 002-2V8a2 2 0 00-2-2H5a2 2 0 00-2 2v8a2 2 0 002 2z" />
            </svg>
          )
        },
        { 
          title: 'Movie Recap', 
          desc: 'Generate viral narration structures and cinematic scenes.', 
          cost: CREDIT_COSTS[ContentType.MOVIE_RECAP], 
          path: 'recap', 
          color: 'text-red-500', 
          icon: (
            <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.8} d="M7 4v16M17 4v16M3 8h4m10 0h4M3 12h18M3 16h4m10 0h4M4 21h16a1 1 0 001-1V4a1 1 0 00-1-1H4a1 1 0 00-1 1v16a1 1 0 001 1z" />
            </svg>
          )
        },
        { 
          title: 'Video Studio', 
          desc: 'Subtitles, voiceover and video outputs in one place.', 
          cost: CREDIT_COSTS[ContentType.VIDEO] || 15, 
          path: 'video', 
          color: 'text-indigo-500', 
          icon: (
            <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.8} d="M15 15l-2 5L9 9l11 4-5 2zm0 0l5 5M7.188 2.239l.777 2.897M5.136 7.965l-2.898-.777M13.95 4.05l-2.122 2.122m-5.657 5.656l-2.12 2.122" />
            </svg>
          )
        }
      ]
    },
    {
      id: 'voice',
      name: 'Voice & Audio',
      items: [
        { 
          title: 'Voiceover', 
          desc: 'High-quality voice synthesis with native accents.', 
          cost: CREDIT_COSTS[ContentType.VOICEOVER], 
          path: 'voiceover', 
          color: 'text-fuchsia-500', 
          icon: (
            <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.8} d="M19 11a7 7 0 01-7 7m0 0a7 7 0 01-7-7m7 7v4m0 0H8m4 0h4m-4-8a3 3 0 01-3-3V5a3 3 0 116 0v6a3 3 0 01-3 3z" />
            </svg>
          )
        },
        { 
          title: 'Subtitle Studio', 
          desc: 'Transcribe, align captions and export subtitles.', 
          cost: CREDIT_COSTS[ContentType.SUBTITLE], 
          path: 'subtitle', 
          color: 'text-teal-500', 
          icon: (
            <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.8} d="M7 8h10M7 12h4m1 8l-4-4H5a2 2 0 01-2-2V6a2 2 0 012-2h14a2 2 0 012 2v8a2 2 0 01-2 2h-3l-4 4z" />
            </svg>
          )
        },
        { 
          title: 'Transcription', 
          desc: 'Accurate audio transcription with timestamps.', 
          cost: CREDIT_COSTS[ContentType.TRANSCRIPTION], 
          path: 'transcription', 
          color: 'text-sky-500', 
          icon: (
            <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.8} d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
            </svg>
          )
        }
      ]
    },
    {
      id: 'design',
      name: 'Design & Translate',
      items: [
        { 
          title: 'Thumbnail Generator', 
          desc: 'Click-worthy covers optimized for social media.', 
          cost: CREDIT_COSTS[ContentType.THUMBNAIL] || 8, 
          path: 'thumbnail', 
          color: 'text-pink-500', 
          icon: (
            <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.8} d="M4 16l4.586-4.586a2 2 0 012.828 0L16 16m-2-2l1.586-1.586a2 2 0 012.828 0L20 14m-6-6h.01M6 20h12a2 2 0 002-2V6a2 2 0 00-2-2H6a2 2 0 00-2 2v12a2 2 0 002 2z" />
            </svg>
          )
        },
        { 
          title: 'Translation', 
          desc: 'Translate between English and Burmese accurately.', 
          cost: CREDIT_COSTS[ContentType.TRANSLATION], 
          path: 'translation', 
          color: 'text-emerald-500', 
          icon: (
            <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.8} d="M3 5h12M9 3v2m1.048 9.516a3.303 3.303 0 01-3.352-3.352c0-1.85 1.502-3.352 3.352-3.352s3.352 1.502 3.352 3.352-1.502 3.352-3.352 3.352z" />
            </svg>
          )
        }
      ]
    }
  ];

  const filteredCategories = categories
    .filter(cat => activeCategoryFilter === 'all' || cat.id === activeCategoryFilter)
    .map(category => ({
      ...category,
      items: category.items.filter(item => {
        const query = searchTerm.toLowerCase();
        return item.title.toLowerCase().includes(query) || item.desc.toLowerCase().includes(query);
      })
    }))
    .filter(category => category.items.length > 0);

  return (
    <div className="space-y-8 pb-16 select-none">
      
      {/* Welcome & Stats */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold text-slate-900 dark:text-white">Welcome to Lumina Studio</h1>
          <p className="text-sm text-slate-500 dark:text-zinc-400 mt-1">
            Create videos, voiceovers and thumbnails with AI.
          </p>
        </div>

        <div className="flex items-center gap-3">
          <div className="bg-gray-100 dark:bg-white/5 border border-gray-200 dark:border-white/10 rounded-2xl px-5 py-3">
            <span className="text-[10px] uppercase tracking-wide text-slate-400 dark:text-zinc-500 block">Credits</span>
            <div className="flex items-baseline gap-1.5">
              <span className="text-2xl font-bold text-slate-900 dark:text-white">{stats.credits}</span>
              <button 
                onClick={onOpenCredits}
                className="text-[10px] font-semibold text-accent hover:underline uppercase"
              >
                Top up
              </button>
            </div>
          </div>

          <div className="bg-gray-100 dark:bg-white/5 border border-gray-200 dark:border-white/10 rounded-2xl px-5 py-3">
            <span className="text-[10px] uppercase tracking-wide text-slate-400 dark:text-zinc-500 block">Generated</span>
            <span className="text-2xl font-bold text-slate-900 dark:text-white">{stats.totalGenerated}</span>
          </div>
        </div>
      </div>

      {/* Filters */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
        <div className="flex flex-wrap items-center gap-2">
          {[
            { id: 'all', label: 'All' },
            { id: 'video', label: 'Video' },
            { id: 'voice', label: 'Voice & Audio' },
            { id: 'design', label: 'Design & Translate' }
          ].map((tab) => (
            <button
              key={tab.id}
              onClick={() => setActiveCategoryFilter(tab.id)}
              className={`px-3.5 py-1.5 text-xs font-semibold rounded-lg transition-colors border ${
                activeCategoryFilter === tab.id
                  ? 'bg-accent text-white border-accent'
                  : 'bg-white dark:bg-[#0c0c0e] border-gray-200 dark:border-white/10 text-slate-600 dark:text-zinc-400 hover:text-slate-900 dark:hover:text-white'
              }`}
            >
              {tab.label}
            </button>
          ))}
        </div>

        {/* Search */}
        <div className="relative w-full sm:w-64">
          <input
            type="text"
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
            placeholder="Search..."
            className="w-full bg-white dark:bg-[#0c0c0e] border border-gray-200 dark:border-white/10 focus:border-accent rounded-lg py-1.5 px-3 pl-9 text-xs text-slate-800 dark:text-white outline-none placeholder:text-slate-400 dark:placeholder:text-zinc-500"
          />
          <svg className="w-4 h-4 text-slate-400 absolute left-3 top-1/2 -translate-y-1/2" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.2} d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" />
          </svg>
        </div>
      </div>

      {/* Module Cards */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
        {filteredCategories.flatMap(category =>
          category.items.map((action) => (
            <button
              key={action.path}
              onClick={() => onAction(action.path)}
              className="group p-5 rounded-2xl bg-white dark:bg-[#0c0c0e] border border-gray-200 dark:border-white/10 hover:border-accent/50 hover:shadow-md transition-all text-left"
            >
              <div className="flex items-start justify-between mb-4">
                <div className={`p-2.5 rounded-xl bg-gray-50 dark:bg-white/5 border border-gray-100 dark:border-white/5 ${action.color}`}>
                  {action.icon}
                </div>
                <span className="text-[10px] font-bold text-slate-400 dark:text-zinc-500 uppercase">
                  {action.cost} CR
                </span>
              </div>

              <h4 className="text-sm font-bold text-slate-900 dark:text-white group-hover:text-accent transition-colors">
                {action.title}
              </h4>
              <p className="text-xs text-slate-500 dark:text-zinc-400 leading-relaxed mt-1.5">
                {action.desc}
              </p>
            </button>
          ))
        )}
      </div>

      {filteredCategories.length === 0 && (
        <div className="text-center py-16">
          <p className="text-sm text-slate-400 dark:text-zinc-500">No modules found.</p>
        </div>
      )}
    </div>
  );
};

export default React.memo(Dashboard);
