
import React from 'react';
import { GenerationResult } from '../types';

interface HistoryListProps {
  history: GenerationResult[];
  onDelete: (id: string) => void;
  onSelect?: (item: GenerationResult) => void;
  title?: string;
}

const HistoryList: React.FC<HistoryListProps> = ({ history, onDelete, onSelect, title = "Recent History" }) => {
  if (history.length === 0) return null;

  return (
    <div className="mt-12 animate-in fade-in slide-in-from-bottom-8 duration-700">
      <h3 className="text-sm font-black text-slate-400 dark:text-zinc-600 uppercase tracking-widest mb-6 px-1">
        {title}
      </h3>
      <div className="grid gap-4">
        {history.map((item) => (
          <div 
            key={item.id} 
            className="glass p-4 rounded-2xl border border-white/5 flex gap-4 items-start group hover:border-indigo-500/30 transition-all relative"
          >
            {/* Clickable Area for Restoration */}
            <div 
                onClick={() => onSelect && onSelect(item)}
                className="absolute inset-0 z-0 cursor-pointer"
                title="Click to load this result"
            ></div>

            {/* Icon/Image */}
            <div className="w-16 h-16 shrink-0 bg-slate-100 dark:bg-white/5 rounded-xl overflow-hidden flex items-center justify-center relative z-10 pointer-events-none">
              {item.url && item.type === 'THUMBNAIL' ? (
                <img src={item.url} alt="History" className="w-full h-full object-cover" />
              ) : item.url && (item.type === 'VOICEOVER' || item.type === 'SPEECH') ? (
                <div className="text-2xl">🎙️</div>
              ) : item.url && (item.type === 'MOVIE_RECAP' || item.type === 'VIDEO_INSIGHTS') ? (
                <div className="text-2xl">🎬</div>
              ) : (
                <div className="text-xl text-slate-400">📄</div>
              )}
            </div>

            {/* Content */}
            <div className="flex-1 min-w-0 py-1 relative z-10 pointer-events-none">
              <div className="flex justify-between items-start">
                <p className="text-[10px] font-bold text-indigo-500 dark:text-indigo-400 uppercase tracking-wider mb-1">
                  {new Date(item.timestamp).toLocaleDateString()}
                </p>
              </div>
              <p className="text-xs font-bold text-slate-800 dark:text-zinc-200 line-clamp-1 mb-1 group-hover:text-indigo-500 transition-colors">
                {item.prompt || "Generated Content"}
              </p>
              {item.content && (
                <p className="text-[10px] text-slate-500 dark:text-zinc-500 line-clamp-2 leading-relaxed">
                  {item.content}
                </p>
              )}
            </div>

            {/* Actions (Buttons must be z-20 to sit above the card click area) */}
            <div className="flex flex-col gap-2 relative z-20">
                <button 
                  onClick={(e) => { e.stopPropagation(); onDelete(item.id); }}
                  className="p-2 text-slate-400 hover:text-rose-500 hover:bg-rose-500/10 rounded-lg transition-all opacity-0 group-hover:opacity-100"
                  title="Delete from History"
                >
                  <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" /></svg>
                </button>
                <div className="flex gap-2 opacity-0 group-hover:opacity-100 transition-opacity">
                     {item.url && (
                        <a href={item.url} download target="_blank" rel="noreferrer" onClick={(e) => e.stopPropagation()} className="p-2 text-indigo-500 hover:bg-indigo-500/10 rounded-lg" title="Download">
                            <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 16v1a2 2 0 002 2h12a2 2 0 002-2v-1m-4-4l-4 4m0 0l-4-4m4 4V4" /></svg>
                        </a>
                     )}
                     <button 
                        onClick={(e) => { e.stopPropagation(); navigator.clipboard.writeText(item.content || item.prompt || '') }}
                        className="p-2 text-slate-500 hover:bg-slate-500/10 rounded-lg"
                        title="Copy Text"
                     >
                        <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8 5H6a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2v-1M8 5a2 2 0 002 2h2a2 2 0 002-2M8 5a2 2 0 012-2h2a2 2 0 012 2" /></svg>
                     </button>
                </div>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
};

export default HistoryList;
