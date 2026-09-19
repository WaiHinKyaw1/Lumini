import React, { useEffect, useMemo, useState } from 'react';
import type { User as FirebaseUser } from 'firebase/auth';
import { auth } from '../services/firebase';

interface ProfileProps {
  stats: { credits: number; totalGenerated: number };
  isDarkMode: boolean;
  onToggleTheme: () => void;
  onLogout?: () => void;
}

const Icon: React.FC<{ path: string; className?: string }> = ({ path, className = 'h-4 w-4' }) => (
  <svg className={className} fill="none" stroke="currentColor" viewBox="0 0 24 24" aria-hidden="true">
    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.8} d={path} />
  </svg>
);

const Profile: React.FC<ProfileProps> = ({
  stats,
  isDarkMode,
  onToggleTheme,
  onLogout,
}) => {
  const [user, setUser] = useState<FirebaseUser | null>(null);

  useEffect(() => {
    setUser(auth.currentUser);
  }, []);

  const initials = useMemo(() => {
    const source = user?.displayName || user?.email || 'U';
    return source.trim().charAt(0).toUpperCase();
  }, [user]);


  return (
    <div className="module-page mx-auto w-full max-w-5xl space-y-4 pb-8 animate-in fade-in duration-300">
      <header className="flex flex-col gap-2 sm:flex-row sm:items-end sm:justify-between">
        <div>
          <p className="text-[10px] font-bold uppercase tracking-[0.18em] text-slate-400 dark:text-zinc-400 !mb-1">Account center</p>
          <h1 className="text-2xl font-bold text-slate-900 dark:text-white !mb-0">Profile &amp; Settings</h1>
          <p className="text-xs text-slate-500 dark:text-zinc-300 !mb-0 mt-1 max-w-xl">သင့်အကောင့်၊ credit balance နဲ့ app preferences တွေကို တစ်နေရာတည်းမှာ စီမံပါ။</p>
        </div>
        <div className="inline-flex w-fit items-center gap-2 rounded-full border border-emerald-500/20 bg-emerald-500/10 px-3 py-1.5 text-xs font-semibold text-emerald-600 dark:text-emerald-400">
          <span className="h-1.5 w-1.5 rounded-full bg-emerald-500" aria-hidden="true" />
          Account active
        </div>
      </header>

      <section className="overflow-hidden rounded-2xl bg-white dark:bg-[#0c0c0e] border border-gray-200 dark:border-white/10">
        <div className="flex flex-col gap-5 p-4 sm:p-5 sm:flex-row sm:items-center sm:justify-between">
          <div className="flex min-w-0 items-center gap-4 sm:gap-5">
            {user?.photoURL ? (
              <img
                src={user.photoURL}
                alt="Profile avatar"
                className="h-14 w-14 shrink-0 rounded-2xl border border-orange-500/30 object-cover sm:h-16 sm:w-16"
                referrerPolicy="no-referrer"
              />
            ) : (
              <div className="flex h-14 w-14 shrink-0 items-center justify-center rounded-2xl bg-orange-500/15 text-2xl font-bold text-orange-600 dark:text-orange-400 sm:h-16 sm:w-16">
                {initials}
              </div>
            )}
            <div className="min-w-0">
              <p className="text-[10px] font-bold uppercase tracking-[0.16em] text-slate-400 dark:text-zinc-400 !mb-1">Your workspace</p>
              <h2 className="truncate !mb-1 text-lg font-bold text-slate-900 dark:text-white">{user?.displayName || 'Studio Creator'}</h2>
              <p className="truncate text-xs text-slate-500 dark:text-zinc-400">{user?.email || 'No email address'}</p>
            </div>
          </div>
          {onLogout && (
            <button
              type="button"
              onClick={onLogout}
              aria-label="Sign out လုပ်ရန်"
              className="inline-flex w-full items-center justify-center gap-2 rounded-lg border border-red-500/20 bg-red-500/5 px-4 py-2 text-xs font-bold text-red-600 transition hover:bg-red-500/10 focus:outline-none focus:ring-2 focus:ring-red-500/40 sm:w-auto"
            >
              <Icon path="M17 16l4-4m0 0l-4-4m4 4H7m6 4v1a3 3 0 01-3 3H6a3 3 0 01-3-3V7a3 3 0 013-3h4a3 3 0 013 3v1" />
              Sign out
            </button>
          )}
        </div>
        <div className="grid grid-cols-1 border-t border-gray-200 dark:border-white/10 sm:grid-cols-3">
          <div className="border-b border-gray-200 dark:border-white/10 px-5 py-3.5 sm:border-b-0 sm:border-r sm:px-7">
            <p className="text-[10px] font-bold uppercase tracking-wider text-slate-400 dark:text-zinc-400 !mb-1">Available credits</p>
            <p className="text-2xl font-bold tracking-tight text-orange-600 dark:text-orange-400">{stats.credits} <span className="text-xs font-semibold tracking-wide">CR</span></p>
          </div>
          <div className="border-b border-gray-200 dark:border-white/10 px-5 py-3.5 sm:border-b-0 sm:border-r sm:px-7">
            <p className="text-[10px] font-bold uppercase tracking-wider text-slate-400 dark:text-zinc-400 !mb-1">Generated assets</p>
            <p className="text-2xl font-bold tracking-tight text-slate-900 dark:text-zinc-100">{stats.totalGenerated}</p>
          </div>
          <div className="px-5 py-3.5 sm:px-7">
              <p className="text-[10px] font-bold uppercase tracking-wider text-slate-400 dark:text-zinc-400 !mb-1">Workspace</p>
              <div className="flex items-center gap-2 text-xs font-bold text-slate-700 dark:text-zinc-200">
              <span className="h-2 w-2 rounded-full bg-emerald-500" aria-hidden="true" />
              Active
            </div>
          </div>
        </div>
      </section>

      <div className="grid gap-4">
        <section className="rounded-2xl bg-white dark:bg-[#0c0c0e] border border-gray-200 dark:border-white/10 p-4 sm:p-5" aria-labelledby="preferences-title">
          <div className="mb-4 flex items-start gap-3">
            <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-slate-500/10 text-slate-600 dark:text-zinc-300">
              <Icon path="M12 3v1m0 16v1m9-9h-1M4 12H3m15.364 6.364l-.707-.707M6.343 6.343l-.707-.707m12.728 0l-.707.707M6.343 17.657l-.707.707M16 12a4 4 0 11-8 0 4 4 0 018 0z" className="h-5 w-5" />
            </div>
            <div>
              <h2 id="preferences-title" className="!mb-1 text-base font-bold text-slate-900 dark:text-white">Appearance</h2>
              <p className="text-xs text-slate-500 dark:text-zinc-300 !mb-0">App ရဲ့ အရောင်ပုံစံကို ရွေးချယ်ပါ။</p>
            </div>
          </div>
          <button
            type="button"
            onClick={onToggleTheme}
            aria-label={isDarkMode ? 'Light mode ပြောင်းရန်' : 'Dark mode ပြောင်းရန်'}
            className="flex w-full items-center justify-between rounded-2xl border border-slate-200 bg-white/60 px-4 py-3 text-left transition hover:border-orange-500/40 hover:bg-orange-500/5 dark:border-white/10 dark:bg-black/20 dark:hover:bg-orange-500/10"
          >
            <span>
              <span className="block text-sm font-semibold text-slate-800 dark:text-zinc-100">{isDarkMode ? 'Dark mode' : 'Light mode'}</span>
              <span className="mt-0.5 block text-xs text-slate-500 dark:text-zinc-400">သင်ရွေးထားသော theme</span>
            </span>
            <span className="rounded-lg bg-slate-100 p-2 text-orange-600 dark:bg-white/10 dark:text-orange-400">
              <Icon path={isDarkMode ? 'M21 12.79A9 9 0 1111.21 3 7 7 0 0021 12.79z' : 'M12 3v1m0 16v1m9-9h-1M4 12H3m15.364 6.364l-.707-.707M6.343 6.343l-.707-.707m12.728 0l-.707.707M6.343 17.657l-.707.707M16 12a4 4 0 11-8 0 4 4 0 018 0z'} />
            </span>
          </button>
          <div className="mt-4 rounded-2xl border border-slate-200/80 bg-slate-50/70 p-4 dark:border-white/10 dark:bg-white/[0.03]">
            <p className="text-xs font-semibold text-slate-700 dark:text-zinc-200">Privacy note</p>
            <p className="mt-1 text-xs leading-relaxed text-slate-500 dark:text-zinc-400">Theme preference ကို ဒီ browser မှာ သိမ်းထားပါတယ်။</p>
          </div>
        </section>
      </div>
    </div>
  );
};

export default React.memo(Profile);
