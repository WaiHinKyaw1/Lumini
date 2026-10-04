import React, { useState } from 'react';
import {
  signInWithEmailAndPassword,
  createUserWithEmailAndPassword,
  updateProfile,
  signInWithPopup,
  GoogleAuthProvider,
  sendPasswordResetEmail
} from 'firebase/auth';
import { auth } from '../services/firebase';
import { Mail, Lock, User, Eye, EyeOff, AlertCircle, CheckCircle2 } from 'lucide-react';
import { toast } from 'react-hot-toast';

interface AuthScreenProps {
  onLoginGoogle?: () => void;
}

const REMEMBER_KEY = 'lumini_remember_email';

export const AuthScreen: React.FC<AuthScreenProps> = ({ onLoginGoogle }) => {
  const [isLogin, setIsLogin] = useState(true);
  const [email, setEmail] = useState(() => localStorage.getItem(REMEMBER_KEY) || '');
  const [password, setPassword] = useState('');
  const [displayName, setDisplayName] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [remember, setRemember] = useState(() => Boolean(localStorage.getItem(REMEMBER_KEY)));
  const [resetSent, setResetSent] = useState(false);

  const handleAuthSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setIsLoading(true);
    setError(null);

    const cleanEmail = email.trim();
    const cleanPassword = password.trim();

    if (!cleanEmail || !cleanPassword) {
      setError('အီးမေးလ်နှင့် စကားဝှက်ကို ဖြည့်သွင်းပေးပါ။');
      setIsLoading(false);
      return;
    }

    if (!isLogin && !displayName.trim()) {
      setError('နာမည် အပြည့်အစုံ ရိုက်ထည့်ပေးပါ။');
      setIsLoading(false);
      return;
    }

    if (remember) {
      localStorage.setItem(REMEMBER_KEY, cleanEmail);
    } else {
      localStorage.removeItem(REMEMBER_KEY);
    }

    try {
      if (isLogin) {
        await signInWithEmailAndPassword(auth, cleanEmail, cleanPassword);
        toast.success('Login အောင်မြင်ပါသည်');
      } else {
        const userCredential = await createUserWithEmailAndPassword(auth, cleanEmail, cleanPassword);
        if (userCredential.user) {
          await updateProfile(userCredential.user, {
            displayName: displayName.trim()
          });
        }
        toast.success('အကောင့်အသစ် ဖွင့်ပြီးပါပြီ');
      }
    } catch (err: unknown) {
      const code = (err as { code?: string })?.code;
      let msg = (err as { message?: string })?.message || 'လုပ်ဆောင်ချက် မအောင်မြင်ပါ။';

      if (code === 'auth/invalid-credential') {
        msg = 'အီးမေးလ် သို့မဟုတ် လျှို့ဝှက်ကုဒ် မှားယွင်းနေပါသည်။';
      } else if (code === 'auth/email-already-in-use') {
        msg = 'ဤအီးမေးလ်ဖြင့် အကောင့်ရှိပြီးသား ဖြစ်ပါသည်။ Login ဝင်ပါ။';
      } else if (code === 'auth/weak-password') {
        msg = 'လျှို့ဝှက်ကုဒ်သည် အနည်းဆုံး စာလုံး ၆ လုံး ရှိရပါမည်။';
      } else if (code === 'auth/invalid-email') {
        msg = 'အီးမေးလ်ပုံစံ မမှန်ကန်ပါ။';
      } else if (code === 'auth/user-not-found') {
        msg = 'ဤအီးမေးလ်ဖြင့် အကောင့်မရှိသေးပါ။';
      } else if (code === 'auth/wrong-password') {
        msg = 'လျှို့ဝှက်ကုဒ် မှားယွင်းနေပါသည်။';
      }

      setError(msg);
      toast.error(msg);
    } finally {
      setIsLoading(false);
    }
  };

  const handleForgotPassword = async () => {
    const addr = email.trim();
    if (!addr) {
      setError('Password ပြန်လည်ပြင်ဆင်ရန် အီးမေးလ် အရင်ရိုက်ထည့်ပါ။');
      return;
    }
    setIsLoading(true);
    try {
      await sendPasswordResetEmail(auth, addr);
      setResetSent(true);
      toast.success('Password ပြန်လည်သတ်မှတ်လင့်ခ် ပို့ပြီးပါပြီ');
    } catch (err: unknown) {
      setError((err as { message?: string })?.message || 'အီးမေးလ် ပို့မရပါ။');
    } finally {
      setIsLoading(false);
    }
  };

  const executeGoogleLogin = async () => {
    if (onLoginGoogle) {
      onLoginGoogle();
      return;
    }
    setIsLoading(true);
    setError(null);
    try {
      const provider = new GoogleAuthProvider();
      await signInWithPopup(auth, provider);
      toast.success('Google ဖြင့် ဝင်ရောက်ပြီးပါပြီ');
    } catch (err: unknown) {
      const msg = (err as { message?: string })?.message || 'Google Sign In မအောင်မြင်ပါ။';
      setError(msg);
      toast.error(msg);
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <div className="min-h-screen w-full flex items-center justify-center p-4 bg-slate-100 dark:bg-[#09090b] text-slate-800 dark:text-zinc-100">
      <div className="w-full max-w-sm bg-white dark:bg-[#111113] border border-slate-200 dark:border-white/10 rounded-2xl p-6 sm:p-8 shadow-sm">
        
        {/* Brand Header */}
        <div className="text-center mb-6">
          <div className="inline-flex items-center justify-center w-10 h-10 rounded-xl bg-amber-500 text-white font-bold text-lg mb-2 shadow-sm">
            L
          </div>
          <h1 className="text-lg font-bold text-slate-900 dark:text-white">
            Lumina Studio
          </h1>
          <p className="text-xs text-slate-500 dark:text-zinc-400 mt-0.5">
            {isLogin ? 'အကောင့်သို့ ဝင်ရောက်ပါ' : 'အကောင့်အသစ် ဖန်တီးပါ'}
          </p>
        </div>

        {/* Login / Register Tab */}
        <div className="grid grid-cols-2 p-1 bg-slate-100 dark:bg-white/5 rounded-lg mb-5 text-xs font-semibold">
          <button
            type="button"
            onClick={() => { setIsLogin(true); setError(null); setResetSent(false); }}
            className={`py-1.5 rounded-md transition-all ${
              isLogin
                ? 'bg-white dark:bg-white/10 text-slate-900 dark:text-white shadow-sm'
                : 'text-slate-500 dark:text-zinc-400 hover:text-slate-800 dark:hover:text-zinc-200'
            }`}
          >
            Login
          </button>
          <button
            type="button"
            onClick={() => { setIsLogin(false); setError(null); setResetSent(false); }}
            className={`py-1.5 rounded-md transition-all ${
              !isLogin
                ? 'bg-white dark:bg-white/10 text-slate-900 dark:text-white shadow-sm'
                : 'text-slate-500 dark:text-zinc-400 hover:text-slate-800 dark:hover:text-zinc-200'
            }`}
          >
            Register
          </button>
        </div>

        {/* Google Sign In Button */}
        <button
          type="button"
          onClick={executeGoogleLogin}
          disabled={isLoading}
          className="w-full flex items-center justify-center gap-2.5 py-2.5 px-3 bg-white dark:bg-white/5 hover:bg-slate-50 dark:hover:bg-white/10 border border-slate-200 dark:border-white/10 rounded-xl text-xs font-semibold text-slate-700 dark:text-zinc-200 transition-all disabled:opacity-50"
        >
          <svg className="w-4 h-4 shrink-0" viewBox="0 0 24 24">
            <path fill="#4285F4" d="M23.745 12.27c0-.7-.06-1.4-.19-2.07H12v4.51h6.6c-.29 1.52-1.14 2.8-2.4 3.65v3.05h3.88c2.27-2.09 3.665-5.17 3.665-9.14z"/>
            <path fill="#34A853" d="M12 24c3.24 0 5.95-1.08 7.93-2.91l-3.88-3.05c-1.08.72-2.45 1.16-4.05 1.16-3.12 0-5.77-2.1-6.72-4.93H1.24v3.15C3.26 21.36 7.33 24 12 24z"/>
            <path fill="#FBBC05" d="M5.28 14.27c-.25-.72-.38-1.49-.38-2.27s.13-1.55.38-2.27V6.58H1.24C.45 8.15 0 9.92 0 12s.45 3.85 1.24 5.42l4.04-3.15z"/>
            <path fill="#EA4335" d="M12 4.75c1.77 0 3.35.61 4.6 1.8l3.42-3.42C17.95 1.19 15.24 0 12 0 7.33 0 3.26 2.64 1.24 6.58l4.04 3.15c.95-2.83 3.6-4.93 6.72-4.93z"/>
          </svg>
          <span>Continue with Google</span>
        </button>

        {/* Divider */}
        <div className="flex items-center gap-3 my-4">
          <div className="h-px flex-1 bg-slate-200 dark:border-white/10" />
          <span className="text-[10px] text-slate-400 dark:text-zinc-500 uppercase">or</span>
          <div className="h-px flex-1 bg-slate-200 dark:border-white/10" />
        </div>

        {/* Notifications */}
        {error && (
          <div className="mb-3.5 p-2.5 rounded-lg bg-rose-500/10 border border-rose-500/20 text-rose-500 text-xs flex items-start gap-2">
            <AlertCircle className="w-4 h-4 shrink-0 mt-0.5" />
            <span className="leading-snug">{error}</span>
          </div>
        )}

        {resetSent && (
          <div className="mb-3.5 p-2.5 rounded-lg bg-emerald-500/10 border border-emerald-500/20 text-emerald-500 text-xs flex items-start gap-2">
            <CheckCircle2 className="w-4 h-4 shrink-0 mt-0.5" />
            <span className="leading-snug">Password ပြန်လည်သတ်မှတ်လင့်ခ်ကို အီးမေးလ်ထဲ ပို့ထားပါသည်။</span>
          </div>
        )}

        {/* Form */}
        <form onSubmit={handleAuthSubmit} className="space-y-3">
          {!isLogin && (
            <div>
              <label className="text-[11px] font-semibold text-slate-600 dark:text-zinc-300 block mb-1">
                နာမည် (Name)
              </label>
              <div className="relative">
                <User className="w-4 h-4 text-slate-400 absolute left-3 top-1/2 -translate-y-1/2" />
                <input
                  type="text"
                  value={displayName}
                  onChange={(e) => setDisplayName(e.target.value)}
                  placeholder="သင့်နာမည် ရိုက်ထည့်ပါ"
                  disabled={isLoading}
                  required
                  className="w-full pl-9 pr-3 py-2 bg-slate-50 dark:bg-white/5 border border-slate-200 dark:border-white/10 rounded-lg text-xs text-slate-900 dark:text-white outline-none focus:border-amber-500 transition-colors"
                />
              </div>
            </div>
          )}

          <div>
            <label className="text-[11px] font-semibold text-slate-600 dark:text-zinc-300 block mb-1">
              အီးမေးလ် (Email)
            </label>
            <div className="relative">
              <Mail className="w-4 h-4 text-slate-400 absolute left-3 top-1/2 -translate-y-1/2" />
              <input
                type="email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                placeholder="name@email.com"
                disabled={isLoading}
                required
                className="w-full pl-9 pr-3 py-2 bg-slate-50 dark:bg-white/5 border border-slate-200 dark:border-white/10 rounded-lg text-xs text-slate-900 dark:text-white outline-none focus:border-amber-500 transition-colors"
              />
            </div>
          </div>

          <div>
            <label className="text-[11px] font-semibold text-slate-600 dark:text-zinc-300 block mb-1">
              လျှို့ဝှက်ကုဒ် (Password)
            </label>
            <div className="relative">
              <Lock className="w-4 h-4 text-slate-400 absolute left-3 top-1/2 -translate-y-1/2" />
              <input
                type={showPassword ? 'text' : 'password'}
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                placeholder="••••••••"
                disabled={isLoading}
                required
                className="w-full pl-9 pr-9 py-2 bg-slate-50 dark:bg-white/5 border border-slate-200 dark:border-white/10 rounded-lg text-xs text-slate-900 dark:text-white outline-none focus:border-amber-500 transition-colors"
              />
              <button
                type="button"
                onClick={() => setShowPassword(!showPassword)}
                className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-600 dark:hover:text-zinc-300"
                tabIndex={-1}
              >
                {showPassword ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
              </button>
            </div>
          </div>

          {/* Options */}
          <div className="flex items-center justify-between text-[11px] pt-1">
            <label className="flex items-center gap-1.5 cursor-pointer text-slate-500 dark:text-zinc-400">
              <input
                type="checkbox"
                checked={remember}
                onChange={(e) => setRemember(e.target.checked)}
                className="rounded border-slate-300 dark:border-zinc-700 text-amber-500 focus:ring-0"
              />
              <span>Remember me</span>
            </label>
            {isLogin && (
              <button
                type="button"
                onClick={handleForgotPassword}
                disabled={isLoading}
                className="text-amber-500 hover:underline"
              >
                Forgot password?
              </button>
            )}
          </div>

          {/* Submit Button */}
          <button
            type="submit"
            disabled={isLoading}
            className="w-full py-2.5 rounded-lg bg-amber-500 hover:bg-amber-600 text-white font-bold text-xs shadow-sm transition-all disabled:opacity-50 mt-2"
          >
            {isLoading ? 'စောင့်ဆိုင်းပါ...' : isLogin ? 'Login ဝင်မည်' : 'အကောင့်သစ် ဖွင့်မည်'}
          </button>
        </form>
      </div>
    </div>
  );
};
