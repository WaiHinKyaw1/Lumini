import React, { useState, useEffect } from 'react';
import { CREDIT_COSTS, ContentType } from '../types';
import { supabase, GenerationRecord, deleteRecord } from '../services/supabase';
import { auth } from '../services/firebase';
import { toast } from 'react-hot-toast';

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
  const [logs, setLogs] = useState<GenerationRecord[]>([]);
  const [isLoadingLogs, setIsLoadingLogs] = useState(false);
  const [logError, setLogError] = useState<string | null>(null);
  const [showSqlSetup, setShowSqlSetup] = useState(false);
  const [expandedLogId, setExpandedLogId] = useState<string | null>(null);
  const [activeCategoryFilter, setActiveCategoryFilter] = useState<string>('all');
  const [searchTerm, setSearchTerm] = useState<string>('');

  const categories: DashboardCategory[] = [
    {
      id: 'video',
      name: 'Video & Film Studio',
      desc: 'High-end dynamic recappers & automated film studio controls',
      items: [
        { 
          title: 'AI Movie Recapper', 
          desc: 'Analyze source cinematic footage and produce custom, high-engagement viral scripting draft structures.', 
          cost: CREDIT_COSTS[ContentType.VIDEO_INSIGHTS], 
          path: 'insights', 
          color: 'from-amber-500/20 to-orange-600/20 text-orange-400 border-orange-500/20', 
          icon: (
            <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M15 10l4.553-2.276A1 1 0 0121 8.723v6.554a1 1 0 01-1.447.894L15 14M5 18h8a2 2 0 002-2V8a2 2 0 00-2-2H5a2 2 0 00-2 2v8a2 2 0 002 2z" />
            </svg>
          ),
          badge: 'Most Popular'
        },
        { 
          title: 'Movie Recap Studio', 
          desc: 'Create highly dramatic, thrilling, or sarcastic cinematic narrations with perfectly timed visual outlines.', 
          cost: CREDIT_COSTS[ContentType.MOVIE_RECAP], 
          path: 'recap', 
          color: 'from-red-500/20 to-crimson-600/20 text-red-400 border-red-500/20', 
          icon: (
            <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M7 4v16M17 4v16M3 8h4m10 0h4M3 12h18M3 16h4m10 0h4M4 21h16a1 1 0 001-1V4a1 1 0 00-1-1H4a1 1 0 00-1 1v16a1 1 0 001 1z" />
            </svg>
          ),
          badge: 'Cinema Specialized'
        },
        { 
          title: 'All-in-One Video Studio', 
          desc: 'Compile subtitles, automated translation loops, and natural AI vocal backtracks directly into a unified workspace.', 
          cost: CREDIT_COSTS[ContentType.VIDEO] || 15, 
          path: 'video', 
          color: 'from-blue-500/20 to-indigo-600/20 text-indigo-400 border-indigo-500/20', 
          icon: (
            <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M15 15l-2 5L9 9l11 4-5 2zm0 0l5 5M7.188 2.239l.777 2.897M5.136 7.965l-2.898-.777M13.95 4.05l-2.122 2.122m-5.657 5.656l-2.12 2.122" />
            </svg>
          ),
          badge: 'Power Engine'
        }
      ]
    },
    {
      id: 'voice',
      name: 'Vocal Audio Synthesis',
      desc: 'Convert any raw text script into cinematic Burmese or English speech',
      items: [
        { 
          title: 'Premium Voice Synth', 
          desc: 'High-fidelity voice announcer featuring prebuilt speaker profiles matched to precise narration tone adjustments.', 
          cost: CREDIT_COSTS[ContentType.VOICEOVER], 
          path: 'voiceover', 
          color: 'from-violet-500/20 to-fuchsia-600/20 text-fuchsia-400 border-fuchsia-500/20', 
          icon: (
            <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M19 11a7 7 0 01-7 7m0 0a7 7 0 01-7-7m7 7v4m0 0H8m4 0h4m-4-8a3 3 0 01-3-3V5a3 3 0 116 0v6a3 3 0 01-3 3z" />
            </svg>
          )
        },
        { 
          title: 'Subtitle Studio', 
          desc: 'Transcribe spoken audio, synchronize captions, and bake gorgeous viral subtitle overlays instantly.', 
          cost: CREDIT_COSTS[ContentType.SUBTITLE], 
          path: 'subtitle', 
          color: 'from-teal-500/20 to-emerald-600/20 text-teal-400 border-teal-500/20', 
          icon: (
            <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M7 8h10M7 12h4m1 8l-4-4H5a2 2 0 01-2-2V6a2 2 0 012-2h14a2 2 0 012 2v8a2 2 0 01-2 2h-3l-4 4z" />
            </svg>
          )
        },
        { 
          title: 'Transcription Engine', 
          desc: 'High-fidelity audio-to-text transcriber featuring automatic timestamps for clean translation output.', 
          cost: CREDIT_COSTS[ContentType.TRANSCRIPTION], 
          path: 'transcription', 
          color: 'from-sky-500/20 to-cyan-600/20 text-sky-400 border-sky-500/20', 
          icon: (
            <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
            </svg>
          )
        }
      ]
    },
    {
      id: 'design',
      name: 'Creative Tools',
      desc: 'Optimize dynamic assets to skyrocket CTR & audience retention metrics',
      items: [
        { 
          title: 'Thumbnail Generator', 
          desc: 'Incorporate eye-catching high CTR cover designs customized for YouTube and social feeds.', 
          cost: CREDIT_COSTS[ContentType.THUMBNAIL] || 8, 
          path: 'thumbnail', 
          color: 'from-amber-400/20 to-rose-600/20 text-rose-300 border-rose-500/20', 
          icon: (
            <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M4 16l4.586-4.586a2 2 0 012.828 0L16 16m-2-2l1.586-1.586a2 2 0 012.828 0L20 14m-6-6h.01M6 20h12a2 2 0 002-2V6a2 2 0 00-2-2H6a2 2 0 00-2 2v12a2 2 0 002 2z" />
            </svg>
          ),
          badge: 'CTR Booster'
        },
        { 
          title: 'Intelligent Translation', 
          desc: 'Context-aware dual dialect English-to-Burmese model translation built explicitly for film dialogue structures.', 
          cost: CREDIT_COSTS[ContentType.TRANSLATION], 
          path: 'translation', 
          color: 'from-emerald-500/20 to-green-600/20 text-emerald-400 border-emerald-500/25', 
          icon: (
            <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M3 5h12M9 3v2m1.048 9.516a3.303 3.303 0 01-3.352-3.352c0-1.85 1.502-3.352 3.352-3.352s3.352 1.502 3.352 3.352-1.502 3.352-3.352 3.352z" />
            </svg>
          )
        }
      ]
    }
  ];

  const fetchLogs = async () => {
    const user = auth.currentUser;
    if (!user || !supabase) {
      setLogError("Supabase logs are operating in dry run mode currently.");
      return;
    }

    setIsLoadingLogs(true);
    setLogError(null);
    try {
      const { data, error } = await supabase
        .from('user_records')
        .select('*')
        .eq('user_id', user.uid)
        .order('created_at', { ascending: false });

      if (error) {
        if (error.code === '42P01') {
          setShowSqlSetup(true);
        } else {
          setLogError(error.message);
        }
      } else {
        setLogs(data || []);
        setShowSqlSetup(false);
      }
    } catch (err: any) {
      setLogError(err.message || 'Failed to query Supabase log history tables.');
    } finally {
      setIsLoadingLogs(false);
    }
  };

  const handleDeleteLog = async (e: React.MouseEvent, id: string) => {
    e.stopPropagation();
    if (!id) return;
    if (!window.confirm("သေချာပါသလား? ဤသတင်းအချက်အလက်ကို ဖျက်ပါမည်။\n(Are you sure you want to delete this record?)")) {
      return;
    }
    
    try {
      const success = await deleteRecord(id);
      if (success) {
        toast.success("မှတ်တမ်းကို အောင်မြင်စွာ ဖျက်ပြီးပါပြီ (Record deleted)");
        setLogs((prev) => prev.filter((log) => log.id !== id));
      } else {
        toast.error("ဖျက်ရန် အဆင်မပြေပါ (Failed to delete record)");
      }
    } catch (err: any) {
      toast.error(err.message || "Error deleting log");
    }
  };

  useEffect(() => {
    fetchLogs();
  }, []);

  const handleCopySql = () => {
    const sqlCode = `create table user_records (
  id uuid default gen_random_uuid() primary key,
  user_id text not null,
  user_email text,
  module text not null,
  input_data text,
  output_data text,
  created_at timestamptz default now()
);

-- Enable Row Level Security (RLS)
alter table user_records enable row level security;

-- Create Open access policy for Anon users to read/insert
create policy "Allow public read and write" 
on user_records 
for all 
using (true) 
with check (true);`;

    navigator.clipboard.writeText(sqlCode);
    toast.success("SQL schema script copied successfully!");
  };

  const getModuleTitle = (mod: string) => {
    switch (mod) {
      case 'voiceover': return 'Premium Voice Synth';
      case 'translation': return 'Intelligent Translation';
      case 'transcription': return 'Transcription Engine';
      case 'insights': return 'AI Movie Recapper';
      case 'recap': return 'Movie recap Studio';
      case 'thumbnail': return 'Thumbnail Generator';
      case 'subtitle': return 'Subtitle Studio';
      case 'video': return 'Video Studio Applet';
      default: return mod.toUpperCase();
    }
  };

  return (
    <div className="space-y-10 animate-in fade-in duration-500 pb-20 select-none">
      
      {/* Dynamic Header & Welcome Area */}
      <div className="relative rounded-3xl bg-white dark:bg-[#0c0c0e] border border-gray-200 dark:border-white/5 p-6 md:p-8 overflow-hidden text-left shadow-sm">
        {/* Subtle decorative glow that supports both modes elegantly */}
        <div className="absolute top-0 right-0 w-80 h-80 bg-gradient-to-bl from-accent/5 dark:from-accent/10 via-transparent to-transparent rounded-full blur-3xl pointer-events-none" />
        
        <div className="relative z-10 flex flex-col lg:flex-row lg:items-center justify-between gap-6">
          <div className="space-y-3 max-w-xl">
            <span className="px-2.5 py-0.5 rounded-md bg-accent/10 border border-accent/20 text-accent text-[9px] font-black uppercase tracking-widest inline-block">
              SYSTEM ONLINE
            </span>
            <h1 className="text-2xl md:text-3xl font-extrabold tracking-tight text-slate-900 dark:text-white leading-tight">
              Create with <span className="text-accent">Lumina Studio</span>
            </h1>
            <p className="text-xs text-slate-500 dark:text-zinc-400 leading-relaxed font-medium">
              A streamlined creative suite. Instantly write recaps, generate high-fidelity voice synthesis, translate content with dual-dialect accuracy, transcribe audio, or craft optimized promotional thumbnails.
            </p>
          </div>

          {/* Model Styled Minimal Stats Panel */}
          <div className="relative bg-gray-50 dark:bg-zinc-950/60 border border-gray-200 dark:border-white/5 rounded-2xl p-5 flex flex-wrap sm:flex-nowrap gap-6 items-center min-w-[280px]">
            <div className="flex-1 space-y-1">
              <span className="text-[9px] uppercase tracking-widest text-slate-450 dark:text-zinc-500 font-bold">Studio Balance</span>
              <div className="flex items-baseline gap-1">
                <span className="text-2xl font-black text-slate-900 dark:text-white tracking-widest">{stats.credits}</span>
                <span className="text-[9px] font-black text-accent tracking-widest">CR</span>
              </div>
              <button 
                onClick={onOpenCredits}
                className="text-[9px] font-black text-accent hover:text-accent-hover uppercase tracking-widest flex items-center gap-1 group transition-colors pt-0.5"
              >
                Buy Credits
                <svg className="w-2.5 h-2.5 transform group-hover:translate-x-0.5 transition-transform" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={3} d="M9 5l7 7-7 7" />
                </svg>
              </button>
            </div>

            <div className="w-px h-10 bg-gray-200 dark:bg-white/5 hidden sm:block" />

            <div className="flex-1 space-y-1">
              <span className="text-[9px] uppercase tracking-widest text-slate-450 dark:text-zinc-500 font-bold">Total Activity</span>
              <div className="flex items-baseline gap-1">
                <span className="text-2xl font-black text-slate-800 dark:text-zinc-350 tracking-tight">{stats.totalGenerated}</span>
                <span className="text-[8px] font-black text-slate-400 dark:text-zinc-500 uppercase tracking-widest">Saved</span>
              </div>
              <p className="text-[8px] text-green-500 dark:text-green-400 uppercase tracking-widest font-black flex items-center gap-1 pt-0.5">
                <span className="w-1.5 h-1.5 bg-green-500 rounded-full animate-pulse" />
                Cloud Synced
              </p>
            </div>
          </div>
        </div>
      </div>

      {/* Model Filtering Controls - Interactive Swiss Navigation */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 border-b border-gray-200 dark:border-white/5 pb-5">
        <div className="flex flex-wrap items-center gap-1.5">
          {[
            { id: 'all', label: 'All Modules' },
            { id: 'video', label: 'Cinema & Video' },
            { id: 'voice', label: 'Voice & Transcribe' },
            { id: 'design', label: 'Creative Graphics' }
          ].map((tab) => (
            <button
              key={tab.id}
              onClick={() => setActiveCategoryFilter(tab.id)}
              className={`px-3.5 py-1.5 text-[9px] uppercase tracking-widest font-black rounded-lg transition-all duration-200 ${
                activeCategoryFilter === tab.id
                  ? 'bg-accent/10 border border-accent/35 text-accent shadow-sm'
                  : 'bg-white dark:bg-[#0c0c0e] hover:bg-gray-50 dark:hover:bg-zinc-900 border border-gray-200 dark:border-white/5 text-slate-500 dark:text-zinc-400 hover:text-slate-900 dark:hover:text-white'
              }`}
            >
              {tab.label}
            </button>
          ))}
        </div>

        {/* Minimal Search Field */}
        <div className="relative min-w-[240px]">
          <input
            type="text"
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
            placeholder="Search tools & recappers..."
            className="w-full bg-white dark:bg-[#0c0c0e] border border-gray-200 dark:border-white/5 focus:border-accent/40 rounded-xl py-2 px-3 pl-9 text-xs text-slate-800 dark:text-white outline-none focus:ring-1 focus:ring-accent/20 tracking-wider placeholder:text-slate-400 dark:placeholder:text-zinc-650 transition-all"
          />
          <svg className="w-4 h-4 text-slate-400 dark:text-zinc-650 absolute left-3 top-1/2 -translate-y-1/2" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" />
          </svg>
        </div>
      </div>

      {/* Modern Bento Category Presentation */}
      <div className="space-y-12 text-left">
        {categories
          .filter(cat => activeCategoryFilter === 'all' || cat.id === activeCategoryFilter)
          .map((category) => {
            const matchedItems = category.items.filter(item => {
              const str = `${item.title} ${item.desc}`.toLowerCase();
              return str.includes(searchTerm.toLowerCase());
            });

            if (matchedItems.length === 0) return null;

            return (
              <div key={category.id} className="space-y-5">
                <div className="flex flex-col sm:flex-row sm:items-baseline justify-between gap-1 border-l-2 border-accent pl-3">
                  <h3 className="text-xs uppercase font-black tracking-widest text-slate-900 dark:text-white">{category.name}</h3>
                  <span className="text-[9px] uppercase tracking-widest font-bold text-slate-400 dark:text-zinc-500">{category.desc}</span>
                </div>

                <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
                  {matchedItems.map((action) => (
                    <button
                      key={action.path}
                      onClick={() => onAction(action.path)}
                      className="group relative p-5.5 rounded-2xl bg-white dark:bg-[#0c0c0e] border border-gray-200 dark:border-white/5 hover:border-accent/35 dark:hover:border-accent/35 hover:bg-slate-50/50 dark:hover:bg-zinc-950/50 transition-all duration-300 text-left flex flex-col justify-between h-full shadow-sm hover:shadow-md hover:shadow-black/5"
                    >
                      <div>
                        {/* Upper Card Metadata Section */}
                        <div className="flex items-start justify-between gap-4 mb-4">
                          <div className={`p-2.5 rounded-xl bg-gradient-to-br ${action.color} border flex items-center justify-center transition-transform group-hover:scale-105 duration-200`}>
                            {action.icon}
                          </div>
                          <div className="flex flex-col items-end gap-1">
                            {action.badge && (
                              <span className="px-1.5 py-0.5 rounded bg-accent/10 border border-accent/25 text-accent text-[7.5px] font-black uppercase tracking-widest">
                                {action.badge}
                              </span>
                            )}
                            <div className="flex items-baseline gap-1 mt-0.5 bg-gray-100 dark:bg-white/5 px-2 py-0.5 rounded border border-gray-200/50 dark:border-white/5">
                              <span className="text-[9px] font-black text-slate-700 dark:text-white">{action.cost}</span>
                              <span className="text-[7px] font-bold text-slate-400 dark:text-zinc-500 uppercase tracking-widest">CR</span>
                            </div>
                          </div>
                        </div>

                        {/* Text Details Section */}
                        <h4 className="text-xs font-black uppercase tracking-wide text-slate-805 dark:text-zinc-100 group-hover:text-accent transition-colors">
                          {action.title}
                        </h4>
                        <p className="text-xs text-slate-500 dark:text-zinc-400 leading-relaxed font-medium mt-1.5 pb-5">
                          {action.desc}
                        </p>
                      </div>

                      {/* Launch Trigger Button Bar */}
                      <div className="flex items-center justify-between pt-3 border-t border-gray-100 dark:border-white/5 mt-auto w-full">
                        <span className="text-[8px] font-black uppercase tracking-[0.2em] text-slate-440 dark:text-zinc-500 group-hover:text-slate-700 dark:group-hover:text-zinc-355 transition-colors">
                          Open studio module
                        </span>
                        <div className="w-6.5 h-6.5 rounded-lg border border-gray-200 dark:border-white/5 flex items-center justify-center bg-gray-50 dark:bg-white/5 group-hover:bg-accent group-hover:text-white group-hover:border-accent transition-all duration-200">
                          <svg className="w-3 h-3" fill="none" stroke="currentColor" viewBox="0 0 24 24">
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

      {/* Supabase durable user log section - Model styling */}
      <div className="pt-8 border-t border-gray-200 dark:border-white/5 text-left">
        <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4 mb-5">
          <div className="space-y-1">
            <h3 className="text-xs uppercase font-black tracking-widest text-slate-900 dark:text-white">
              Generated Records Log
            </h3>
            <p className="text-[9px] text-slate-400 dark:text-zinc-500 font-bold uppercase tracking-widest">
              Live historical cache synced over secure Supabase backend
            </p>
          </div>
          <button
            onClick={fetchLogs}
            disabled={isLoadingLogs}
            className="px-3.5 py-1.5 bg-white dark:bg-[#0c0c0e] hover:bg-gray-50 dark:hover:bg-zinc-900 active:scale-95 disabled:opacity-50 text-[9px] font-black uppercase tracking-widest text-slate-600 dark:text-zinc-300 rounded-xl border border-gray-200 dark:border-white/5 flex items-center gap-1.5 transition-all shadow-sm"
          >
            {isLoadingLogs ? (
              <svg className="w-3 h-3 animate-spin" fill="none" viewBox="0 0 24 24">
                <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"></circle>
                <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z"></path>
              </svg>
            ) : (
              <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M4 4v5h.582m15.356 2A8.001 8.001 0 1121.21 8H18" />
              </svg>
            )}
            Refresh Sync
          </button>
        </div>

        {/* Database instructions box when RLS setup is required */}
        {showSqlSetup && (
          <div className="p-5.5 bg-amber-550/5 border border-amber-500/10 rounded-2xl space-y-4 mb-5 text-slate-805 dark:text-zinc-300">
            <div className="flex items-center gap-2 text-amber-500 dark:text-amber-400">
              <svg className="w-4 h-4 shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z" />
              </svg>
              <h4 className="text-[10px] font-black uppercase tracking-widest">Supabase Setup Required</h4>
            </div>
            <p className="text-xs text-slate-500 dark:text-zinc-400 max-w-3xl leading-relaxed font-medium">
              To store, view, and sync asset logs durably over Supabase, you must configure a PostgreSQL database table. 
              Please execute the follow SQL query inside your Supabase project's SQL Editor:
            </p>
            <div className="relative">
              <pre className="p-4 rounded-xl bg-gray-50 dark:bg-zinc-950 border border-gray-200 dark:border-white/5 text-[9.5px] font-mono text-slate-700 dark:text-zinc-300 overflow-x-auto max-h-48 whitespace-pre leading-relaxed select-all">
                {`create table user_records (
  id uuid default gen_random_uuid() primary key,
  user_id text not null,
  user_email text,
  module text not null,
  input_data text,
  output_data text,
  created_at timestamptz default now()
);

-- Enable Row Level Security (RLS)
alter table user_records enable row level security;

-- Create Open access policy for Anon users to read/insert
create policy "Allow public read and write" on user_records for all using (true) with check (true);`}
              </pre>
              <button
                onClick={handleCopySql}
                className="absolute right-3.5 top-3 px-2.5 py-1 bg-accent/10 border border-accent/30 hover:bg-accent hover:text-white text-accent rounded-lg text-[8.5px] font-black uppercase tracking-widest transition-colors shadow-none"
              >
                Copy SQL Script
              </button>
            </div>
          </div>
        )}

        {logError && (
          <div className="p-4 rounded-2xl bg-white dark:bg-[#0c0c0e] border border-gray-200 dark:border-white/5 text-xs text-slate-500 dark:text-zinc-400">
            {logError}
          </div>
        )}

        {/* Dynamic Log list */}
        {!isLoadingLogs && logs.length === 0 ? (
          <div className="p-10 rounded-2xl bg-white dark:bg-zinc-950/20 border border-gray-200 dark:border-white/5 text-center text-slate-400 dark:text-zinc-600">
            <svg className="w-7 h-7 mx-auto text-slate-300 dark:text-zinc-750 mb-2.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M12 6.042A8.967 8.967 0 006 3.75c-1.052 0-2.062.18-3 .512v14.25A8.987 8.987 0 016 18c2.305 0 4.408.867 6 2.292m0-14.25a8.966 8.966 0 016-2.292c1.052 0 2.062.18 3 .512v14.25A8.987 8.987 0 0018 18a8.967 8.967 0 00-6 2.292m0-14.25v14.25" />
            </svg>
            <p className="text-[9px] uppercase font-black tracking-widest">No previous asset records discovered</p>
            <p className="text-[8px] text-slate-400 dark:text-zinc-500 mt-0.5 uppercase tracking-widest font-bold">Your generated outputs will appear here when synced</p>
          </div>
        ) : (
          <div className="space-y-2.5">
            {logs.map((log) => {
              const isExpanded = expandedLogId === log.id;
              const title = getModuleTitle(log.module);
              const formattedDate = log.created_at ? new Date(log.created_at).toLocaleString() : 'N/A';

              return (
                <div
                  key={log.id}
                  onClick={() => setExpandedLogId(isExpanded ? null : log.id)}
                  className="p-4 rounded-xl bg-white dark:bg-[#0c0c0e] border border-gray-200 dark:border-white/5 hover:border-accent/25 dark:hover:border-accent/25 hover:bg-slate-50/50 dark:hover:bg-zinc-950/50 transition-all cursor-pointer text-left relative overflow-hidden shadow-sm"
                >
                  <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 relative z-10">
                    <div className="flex items-center gap-3">
                      <div className="w-1.5 h-1.5 rounded-full bg-accent" />
                      <div>
                        <h4 className="text-xs font-black uppercase text-slate-900 dark:text-white tracking-widest">{title}</h4>
                        <p className="text-[8px] text-slate-400 dark:text-zinc-500 font-bold uppercase tracking-widest mt-0.5">{formattedDate}</p>
                      </div>
                    </div>

                    <div className="flex items-center gap-2 self-end sm:self-auto">
                      <button
                        onClick={(e) => handleDeleteLog(e, log.id)}
                        className="p-1 px-2 border border-gray-200 dark:border-white/5 rounded-lg text-[8px] font-black uppercase tracking-widest text-slate-400 dark:text-zinc-550 hover:text-red-505 dark:hover:text-red-400 hover:bg-red-500/15 dark:hover:bg-red-500/10 hover:border-red-500/20 transition-all flex items-center gap-1"
                        title="Delete log record"
                      >
                        Delete
                      </button>
                      <span className="text-[8px] text-slate-400 dark:text-zinc-600 font-bold uppercase tracking-widest">
                        {isExpanded ? 'Hide ▲' : 'View ▼'}
                      </span>
                    </div>
                  </div>

                  {/* Expanded detail data fields */}
                  {isExpanded && (
                    <div className="mt-3.5 pt-3.5 border-t border-gray-100 dark:border-white/5 space-y-3 animate-in slide-in-from-top-2 duration-200">
                      {log.input_data && (
                        <div className="space-y-1">
                          <span className="text-[8px] font-bold text-slate-400 dark:text-zinc-500 uppercase tracking-widest ml-1 block">Input Request Script / Document payload</span>
                          <div className="p-3 bg-gray-50 dark:bg-zinc-950 border border-gray-200 dark:border-white/5 rounded-xl text-[10px] font-bold text-slate-700 dark:text-zinc-350 leading-relaxed max-h-36 overflow-y-auto whitespace-pre-wrap select-text">
                            {log.input_data}
                          </div>
                        </div>
                      )}
                      
                      {log.output_data && (
                        <div className="space-y-1">
                          <span className="text-[8px] font-bold text-slate-400 dark:text-zinc-500 uppercase tracking-widest ml-1 block">Successfully Generated Output</span>
                          <div className="p-3 bg-gray-50 dark:bg-zinc-950 border border-gray-200 dark:border-white/5 rounded-xl text-[10px] font-bold text-slate-800 dark:text-zinc-300 leading-relaxed max-h-48 overflow-y-auto whitespace-pre-wrap select-text">
                            {log.output_data}
                          </div>
                        </div>
                      )}
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        )}
      </div>

    </div>
  );
};

export default React.memo(Dashboard);
