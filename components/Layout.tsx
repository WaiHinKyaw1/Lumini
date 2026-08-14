
import React, { useState, useRef, useEffect } from 'react';
import type { User as FirebaseUser } from 'firebase/auth';

interface LayoutProps {
  children: React.ReactNode;
  credits: number;
  currentPath: string;
  setPath: (path: string) => void;
  isDarkMode: boolean;
  toggleTheme: () => void;
  onOpenCredits: () => void;
  onOpenRefuel?: () => void;
  user: FirebaseUser | null;
  onLoginGoogle?: () => void;
  onLogout?: () => void;
}

const Layout: React.FC<LayoutProps> = React.memo(({ children, credits, currentPath, setPath, isDarkMode, toggleTheme, onOpenCredits, onOpenRefuel, user, onLoginGoogle, onLogout }) => {
  const [isSidebarOpen, setIsSidebarOpen] = useState(false);
  const [searchQuery, setSearchQuery] = useState('');
  const [isSearchFocused, setIsSearchFocused] = useState(false);
  const searchRef = useRef<HTMLDivElement>(null);

  const navItems = [
    { name: 'Dashboard', path: 'dashboard', icon: 'M3 12l2-2m0 0l7-7 7 7M5 10v10a1 1 0 001 1h3m10-11l2 2m-2-2v10a1 1 0 01-1 1h-3m-6 0a1 1 0 001-1v-4a1 1 0 011-1h2a1 1 0 011 1v4a1 1 0 001 1m-6 0h6' },
    { name: 'Subtitle Studio', path: 'subtitle', icon: 'M7 8h10M7 12h4m1 8l-4-4H5a2 2 0 01-2-2V6a2 2 0 012-2h14a2 2 0 012 2v8a2 2 0 01-2 2h-3l-4 4z' },
    { name: 'AI Recapper', path: 'insights', icon: 'M9 5H7a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2V7a2 2 0 00-2-2h-2M9 5a2 2 0 002 2h2a2 2 0 002-2M9 5a2 2 0 012-2h2a2 2 0 012 2m-3 7h3m-3 4h3m-6-4h.01M9 16h.01' },
    { name: 'Movie Recap', path: 'recap', icon: 'M7 4v16M17 4v16M3 8h4m10 0h4M3 12h18M3 16h4m10 0h4M4 21h16a1 1 0 001-1V4a1 1 0 00-1-1H4a1 1 0 00-1 1v16a1 1 0 001 1z' },
    { name: 'Thumbnails', path: 'thumbnail', icon: 'M4 5a1 1 0 011-1h14a1 1 0 011 1v14a1 1 0 01-1 1H5a1 1 0 01-1-1V5z M4 13h16 M13 4v9 M4 9h9' },
    { name: 'Translate', path: 'translation', icon: 'M3 5h12M9 3v2m1.048 9.516a3.303 3.303 0 01-3.352-3.352c0-1.85 1.502-3.352 3.352-3.352s3.352 1.502 3.352 3.352-1.502 3.352-3.352 3.352z' },
    { name: 'Transcription', path: 'transcription', icon: 'M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z' },
    { name: 'Voiceover', path: 'voiceover', icon: 'M19 11a7 7 0 01-7 7m0 0a7 7 0 01-7-7m7 7v4m0 0H8m4 0h4m-4-8a3 3 0 01-3-3V5a3 3 0 116 0v6a3 3 0 01-3 3z' },
    { name: 'Video Studio', path: 'video', icon: 'M15 10l4.553-2.276A1 1 0 0121 8.723v6.554a1 1 0 01-1.447.894L15 14M5 18h8a2 2 0 002-2V8a2 2 0 00-2-2H5a2 2 0 00-2 2v8a2 2 0 002 2z' },
    { name: 'Profile & Settings', path: 'profile', icon: 'M16 7a4 4 0 11-8 0 4 4 0 018 0zM12 14a7 7 0 00-7 7h14a7 7 0 00-7-7z' },
  ];

  const handleNavClick = (path: string) => {
    setPath(path);
    setIsSidebarOpen(false);
    setSearchQuery('');
    setIsSearchFocused(false);
  };

  const filteredItems = searchQuery.trim() === '' 
    ? [] 
    : navItems.filter(item => 
        item.name.toLowerCase().includes(searchQuery.toLowerCase())
      );

  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (searchRef.current && !searchRef.current.contains(event.target as Node)) {
        setIsSearchFocused(false);
      }
    };
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  return (
    <div className="min-h-screen bg-paper dark:bg-obsidian text-slate-800 dark:text-zinc-100 transition-colors duration-300 flex flex-col font-sans">
      
      {/* Global Header */}
      <header className="sticky top-0 z-40 bg-white/80 dark:bg-obsidian/80 backdrop-blur-xl border-b border-gray-200 dark:border-white/5 px-4 py-2 flex items-center justify-between">
        <div className="flex items-center gap-4">
          <button 
            onClick={() => setIsSidebarOpen(true)}
            aria-label="Navigation menu ဖွင့်ရန်"
            className="p-1.5 -ml-2 rounded-xl text-slate-600 dark:text-zinc-300 hover:bg-gray-100 dark:hover:bg-white/5 transition-colors"
          >
            <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 6h16M4 12h16M4 18h16" />
            </svg>
          </button>
          
          <div className="flex items-center gap-2">
            <div className="w-6 h-6 bg-accent rounded-lg flex items-center justify-center shadow-lg shadow-accent/20">
              <span className="text-white font-black text-[10px]">L</span>
            </div>
            <span className="font-extrabold tracking-tighter text-base dark:text-white text-slate-900 hidden sm:block uppercase">Lumina Studio</span>
          </div>
        </div>

        {/* Search Bar */}
        <div className="flex-1 max-w-md mx-4 relative hidden md:block" ref={searchRef}>
          <div className="relative group">
            <div className="absolute inset-y-0 left-0 pl-3 flex items-center pointer-events-none">
              <svg className={`w-4 h-4 transition-colors ${isSearchFocused ? 'text-accent' : 'text-slate-400'}`} fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" />
              </svg>
            </div>
            <input
              type="text"
              placeholder="Search tools & features..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              onFocus={() => setIsSearchFocused(true)}
              className="w-full bg-gray-100 dark:bg-white/5 border border-transparent focus:border-accent/50 focus:bg-white dark:focus:bg-zinc-900 rounded-xl py-1.5 pl-10 pr-4 text-[11px] font-bold uppercase tracking-tight outline-none transition-all placeholder:text-slate-400 dark:placeholder:text-zinc-400"
            />
          </div>

          {/* Search Results Dropdown */}
          {isSearchFocused && searchQuery.trim() !== '' && (
            <div className="absolute top-full left-0 right-0 mt-2 bg-white dark:bg-zinc-900 border border-gray-200 dark:border-white/10 rounded-2xl shadow-2xl overflow-hidden animate-in fade-in slide-in-from-top-2 duration-200">
              {filteredItems.length > 0 ? (
                <div className="p-2 space-y-1">
                  {filteredItems.map((item) => (
                    <button
                      key={item.path}
                      onClick={() => handleNavClick(item.path)}
                      aria-label={`${item.name} module သို့သွားရန်`}
                      className="w-full flex items-center gap-3 px-3 py-2 rounded-xl hover:bg-indigo-50 dark:hover:bg-indigo-500/10 text-slate-600 dark:text-zinc-300 hover:text-indigo-600 dark:hover:text-indigo-400 transition-all group"
                    >
                      <div className="w-8 h-8 rounded-lg bg-gray-100 dark:bg-white/5 flex items-center justify-center group-hover:bg-indigo-100 dark:group-hover:bg-indigo-500/20 transition-colors">
                        <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d={item.icon} />
                        </svg>
                      </div>
                      <span className="text-[10px] font-black uppercase tracking-widest">{item.name}</span>
                    </button>
                  ))}
                </div>
              ) : (
                <div className="p-6 text-center">
                  <p className="text-[10px] font-black uppercase tracking-[0.2em] text-slate-400 dark:text-zinc-500">No tools found</p>
                </div>
              )}
            </div>
          )}
        </div>

        <div className="flex items-center gap-2">
            <button onClick={toggleTheme} aria-label={isDarkMode ? 'အလင်းမုဒ် ပြောင်းရန်' : 'Dark mode ပြောင်းရန်'} className="p-1.5 rounded-full bg-gray-100 dark:bg-white/5 text-gray-600 dark:text-gray-400 transition-colors hover:bg-gray-200 dark:hover:bg-white/10">
               {isDarkMode ? (
                   <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 3v1m0 16v1m9-9h-1M4 12H3m15.364 6.364l-.707-.707M6.343 6.343l-.707-.707m12.728 0l-.707.707M6.343 17.657l-.707.707M16 12a4 4 0 11-8 0 4 4 0 018 0z" /></svg>
               ) : (
                   <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M20.354 15.354A9 9 0 018.646 3.646 9.003 9.003 0 0012 21a9.003 9.003 0 008.354-5.646z" /></svg>
               )}
            </button>
            <button 
              onClick={onOpenCredits}
              aria-label={`Credit balance ဖြည့်ရန် (${credits} CR)`}
              className="flex items-center gap-2 px-3 py-1 bg-gray-100 dark:bg-zinc-900 border border-gray-200 dark:border-zinc-800 rounded-full hover:border-accent/50 hover:bg-accent/5 transition-all group"
            >
              <span className="text-[10px] font-black text-accent dark:text-accent uppercase tracking-widest">{credits} CR</span>
              <svg className="w-3 h-3 text-accent group-hover:scale-110 transition-transform" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={3} d="M12 6v6m0 0v6m0-6h6m-6 0H6" /></svg>
            </button>
            {onOpenRefuel && (
              <button 
                onClick={onOpenRefuel}
                aria-label="Refuel Engine — ငွေမပေးဘဲ free credits ရယူရန်"
                title="Refuel Engine — ငွေမပေးဘဲ free credits ရယူမယ့်"
                className="flex items-center gap-1.5 px-3 py-1 bg-gradient-to-r from-orange-500 to-red-500 text-white rounded-full hover:shadow-lg hover:shadow-orange-500/25 transition-all group"
              >
                <svg className="w-3 h-3 group-hover:scale-110 transition-transform" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M17.657 18.657A8 8 0 016.343 7.343S7 9 9 10c0-2 .5-5 2.986-7C14 5 16.09 5.777 17.656 7.343A7.975 7.975 0 0120 13a7.975 7.975 0 01-2.343 5.657z" /></svg>
                <span className="text-[10px] font-black uppercase tracking-widest">Refuel</span>
              </button>
            )}

            {user ? (
              <div className="flex items-center gap-1.5 ml-1">
                <button 
                  onClick={() => setPath('profile')}
                  aria-label="Profile & Settings ဖွင့်ရန်"
                  title="View Profile & Settings"
                  className="flex items-center gap-1.5 p-1 px-2.5 bg-gray-100 dark:bg-zinc-900 border border-gray-200 dark:border-zinc-800 rounded-full text-[10px] font-bold text-zinc-600 dark:text-zinc-300 hover:border-accent/50 hover:bg-accent/5 transition-all outline-none"
                >
                  {user.photoURL ? (
                    <img src={user.photoURL} alt="pfp" className="w-4 h-4 rounded-full" referrerPolicy="no-referrer" />
                  ) : (
                    <div className="w-4 h-4 rounded-full bg-accent flex items-center justify-center text-white text-[8px] font-black">
                      {user.email?.[0].toUpperCase() || 'U'}
                    </div>
                  )}
                  <span className="hidden md:inline max-w-[100px] truncate">{user.displayName || user.email || 'User'}</span>
                </button>
                <button 
                  onClick={onLogout}
                  aria-label="Sign out လုပ်ရန်"
                  title="Sign Out"
                  className="p-1.5 rounded-full bg-red-500/10 hover:bg-red-500/25 text-red-500 transition-all"
                >
                  <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M17 16l4-4m0 0l-4-4m4 4H7m6 4v1a3 3 0 01-3 3H6a3 3 0 01-3-3V7a3 3 0 013-3h4a3 3 0 013 3v1" />
                  </svg>
                </button>
              </div>
            ) : (
              <button
                onClick={onLoginGoogle}
                aria-label="Google account ဖြင့် Sign in လုပ်ရန်"
                className="flex items-center gap-1.5 px-3 py-1 ml-1 bg-accent/10 border border-accent/20 rounded-full hover:bg-accent hover:text-white transition-all text-[9px] font-black uppercase tracking-widest text-accent"
              >
                <span>Google Sign In</span>
                <svg className="w-3 h-3" viewBox="0 0 24 24" fill="currentColor">
                  <path d="M12.24 10.285V13.4h6.887C18.2 15.614 15.645 18 12.24 18c-3.86 0-7-3.14-7-7s3.14-7 7-7c1.7 0 3.25.61 4.47 1.615l2.45-2.45C17.385 1.575 14.935 1 12.24 1C6.72 1 2.24 5.48 2.24 11s4.48 10 10 10c5.76 0 9.55-4.05 9.55-9.715 0-.585-.05-1.155-.15-1.7H12.24z"/>
                </svg>
              </button>
            )}
        </div>
      </header>

      {/* Sidebar Drawer & Backdrop */}
      <div 
        className={`fixed inset-0 z-50 bg-black/60 backdrop-blur-sm transition-opacity duration-300 ${isSidebarOpen ? 'opacity-100' : 'opacity-0 pointer-events-none'}`}
        onClick={() => setIsSidebarOpen(false)}
      />

      <aside 
        className={`fixed top-0 left-0 z-50 h-full w-64 bg-white dark:bg-[#0c0c0e] border-r border-gray-200 dark:border-white/5 shadow-2xl transform transition-transform duration-300 ease-in-out ${isSidebarOpen ? 'translate-x-0' : '-translate-x-full'}`}
      >
        <div className="flex flex-col h-full py-4">
          <div className="px-5 mb-6 flex justify-between items-center">
            <div className="flex items-center gap-2">
              <div className="w-7 h-7 bg-accent rounded-lg flex items-center justify-center shadow-lg shadow-accent/30">
                <span className="text-white font-black text-xs leading-none">L</span>
              </div>
              <span className="text-lg font-black tracking-tighter text-slate-900 dark:text-white uppercase">Lumina</span>
            </div>
            <button 
              onClick={() => setIsSidebarOpen(false)}
              aria-label="Navigation menu ပိတ်ရန်"
              className="p-1.5 rounded-lg text-slate-400 hover:text-slate-600 dark:hover:text-white hover:bg-gray-100 dark:hover:bg-white/5 transition-colors"
            >
              <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" /></svg>
            </button>
          </div>

          <nav className="flex-1 px-3 space-y-1 overflow-y-auto custom-scrollbar">
            <div className="mb-2 px-2">
              <p className="text-[9px] font-black uppercase tracking-widest text-slate-400 dark:text-zinc-500 mb-1">Navigation Hub</p>
            </div>
            {navItems.map((item) => (
              <button
                key={item.path}
                onClick={() => handleNavClick(item.path)}
                aria-label={`${item.name} module သို့သွားရန်`}
                aria-current={currentPath === item.path ? 'page' : undefined}
                className={`w-full flex items-center gap-3 px-3 py-2.5 rounded-xl transition-all group ${
                  currentPath === item.path 
                    ? 'bg-accent text-white shadow-lg shadow-accent/20' 
                    : 'text-slate-500 dark:text-zinc-400 hover:text-slate-900 dark:hover:text-zinc-100 hover:bg-gray-50 dark:hover:bg-white/5'
                }`}
              >
                <svg className={`w-4 h-4 transition-transform group-hover:scale-110 ${currentPath === item.path ? 'text-white' : ''}`} fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d={item.icon} />
                </svg>
                <span className="text-[11px] font-black uppercase tracking-tight">{item.name}</span>
              </button>
            ))}
          </nav>

          <div className="px-5 mt-4 pt-4 border-t border-gray-100 dark:border-white/5 space-y-3">
             <div className="p-3 rounded-2xl bg-accent-muted/20 border border-accent/10 relative overflow-hidden">
               <div className="relative z-10">
                 <p className="text-[9px] font-black text-accent uppercase tracking-widest mb-1">Balance</p>
                 <div className="flex items-baseline gap-1 mb-3">
                   <span className="text-2xl font-black text-accent dark:text-white">{credits}</span>
                   <span className="text-[9px] font-bold text-accent dark:text-zinc-400">CR</span>
                 </div>
                 <button 
                  onClick={onOpenCredits}
                  aria-label="Refuel Engine ဖွင့်ရန်"
                  className="w-full py-2 bg-accent text-white rounded-xl text-[9px] font-black uppercase tracking-widest hover:bg-accent-hover transition-colors shadow-lg shadow-accent/20"
                 >
                   Refuel Engine
                 </button>
               </div>
             </div>
             <p className="text-[9px] text-center text-slate-400 dark:text-zinc-500 font-bold uppercase tracking-widest mt-6">Lumina Studio v2.5</p>
          </div>
        </div>
      </aside>

      <section className="flex-1 px-4 py-4 w-full max-w-7xl mx-auto transition-all">
        {children}
      </section>

    </div>
  );
});

export default Layout;
