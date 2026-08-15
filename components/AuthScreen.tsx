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
import { motion, AnimatePresence } from 'motion/react';
import {
  Mail,
  Lock,
  User,
  Eye,
  EyeOff,
  ArrowRight,
  Sparkles,
  LogIn,
  UserPlus,
  AlertCircle,
  Chrome,
  KeyRound,
  CheckCircle2
} from 'lucide-react';
import { toast } from 'react-hot-toast';

interface AuthScreenProps {
  onLoginGoogle?: () => void;
}

const REMEMBER_KEY = 'lumini_remember_email';

/** Simple client-side password strength evaluator */
function passwordStrength(pw: string): { score: number; label: string; color: string } {
  let score = 0;
  if (pw.length >= 6) score++;
  if (pw.length >= 10) score++;
  if (/[A-Z]/.test(pw) && /[a-z]/.test(pw)) score++;
  if (/\d/.test(pw)) score++;
  if (/[^A-Za-z0-9]/.test(pw)) score++;
  if (score <= 1) return { score, label: 'အားနည်း (Weak)', color: 'bg-rose-500' };
  if (score <= 2) return { score, label: 'သင့်တင် (Fair)', color: 'bg-amber-500' };
  if (score <= 3) return { score, label: 'ကောင်း (Good)', color: 'bg-yellow-500' };
  if (score <= 4) return { score, label: 'ခိုင်မာ (Strong)', color: 'bg-emerald-500' };
  return { score, label: 'အလွန်ခိုင်မာ (Very Strong)', color: 'bg-emerald-400' };
}

export const AuthScreen: React.FC<AuthScreenProps> = ({ onLoginGoogle }) => {
  const [isLogin, setIsLogin] = useState(true);
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [displayName, setDisplayName] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [remember, setRemember] = useState(() => !!localStorage.getItem(REMEMBER_KEY));
  const [resetSent, setResetSent] = useState(false);

  // Pre-fill remembered email
  const rememberedEmail = localStorage.getItem(REMEMBER_KEY) || '';

  const handleAuthSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setIsLoading(true);
    setError(null);

    const cleanEmail = email.trim();
    const cleanPassword = password.trim();

    if (!cleanEmail || !cleanPassword) {
      setError('Please fill in all required fields.');
      setIsLoading(false);
      return;
    }

    if (!isLogin && !displayName.trim()) {
      setError('Please enter your full name to sign up.');
      setIsLoading(false);
      return;
    }

    // Remember-me persistence
    if (remember) {
      localStorage.setItem(REMEMBER_KEY, cleanEmail);
    } else {
      localStorage.removeItem(REMEMBER_KEY);
    }

    try {
      if (isLogin) {
        await signInWithEmailAndPassword(auth, cleanEmail, cleanPassword);
        toast.success('Welcome back to Lumini Studio!');
      } else {
        const userCredential = await createUserWithEmailAndPassword(auth, cleanEmail, cleanPassword);
        if (userCredential.user) {
          await updateProfile(userCredential.user, {
            displayName: displayName.trim()
          });
        }
        toast.success('Welcome! Your registration with Lumini Studio is complete.');
      }
    } catch (err: unknown) {
      console.error('Authentication Error:', err);
      const code = (err as { code?: string })?.code;
      let userFriendlyMsg = (err as { message?: string })?.message || 'Authentication failed.';

      if (code === 'auth/invalid-credential') {
        userFriendlyMsg = 'အီးမေးလ် သို့မဟုတ် လျှို့ဝှက်ကုဒ် မှားယွင်းနေပါသည်။ ပြန်လည်စစ်ဆေးပေးပါ။';
      } else if (code === 'auth/email-already-in-use') {
        userFriendlyMsg = 'ဤအီးမေးလ်လိပ်စာသည် အကောင့်ဖွင့်ပြီးသားဖြစ်နေပါသည်။ Login ဝင်ပါ။';
      } else if (code === 'auth/weak-password') {
        userFriendlyMsg = 'လျှို့ဝှက်ကုဒ်သည် အနည်းဆုံး စာလုံး ၆ လုံး ရှိရပါမည်။';
      } else if (code === 'auth/invalid-email') {
        userFriendlyMsg = 'အီးမေးလ်ပုံစံ မမှန်ကန်ပါ။ မှန်ကန်သော အီးမေးလ်လိပ်စာကို ရိုက်ထည့်ပေးပါ။';
      } else if (code === 'auth/user-not-found') {
        userFriendlyMsg = 'ဤအီးမေးလ်ဖြင့် ဖန်တီးထားသော အကောင့်မရှိသေးပါ။';
      } else if (code === 'auth/wrong-password') {
        userFriendlyMsg = 'လျှို့ဝှက်ကုဒ် မမှန်ကန်ပါ။ ပြန်လည်စစ်ဆေးပါ။';
      } else if (code === 'auth/operation-not-allowed') {
        userFriendlyMsg = 'Email/Password စနစ်ကို Firebase console တွင် မဖွင့်ရသေးပါ။ Google ဖြင့် ဝင်ရောက်ပါ။';
      }

      setError(userFriendlyMsg);
      toast.error(userFriendlyMsg);
    } finally {
      setIsLoading(false);
    }
  };

  const handleForgotPassword = async () => {
    const addr = email.trim();
    if (!addr) {
      setError('Password ပြန်ပြင်ရန် သင့်အီးမေးလ်ကို အရင်ရိုက်ထည့်ပေးပါ။');
      toast.error('Please enter your email first.');
      return;
    }
    setIsLoading(true);
    try {
      await sendPasswordResetEmail(auth, addr);
      setResetSent(true);
      toast.success('အီးမေးလ်ထဲသို့ password ပြန်လည်သတ်မှတ်လင့်ခ် ပို့ပြီးပါပြီ');
    } catch (err: unknown) {
      toast.error((err as { message?: string })?.message || 'Failed to send reset email.');
    } finally {
      setIsLoading(false);
    }
  };

  const executeGoogleLogin = async () => {
    if (onLoginGoogle) {
      onLoginGoogle();
    } else {
      setIsLoading(true);
      setError(null);
      const provider = new GoogleAuthProvider();
      try {
        await signInWithPopup(auth, provider);
        toast.success('Successfully authenticated via Google!');
      } catch (err: unknown) {
        console.error('Google Sign In Error:', err);
        const message = (err as { message?: string })?.message || 'Failed signing in with Google.';
        setError(message);
        toast.error(message);
      } finally {
        setIsLoading(false);
      }
    }
  };

  const strength = passwordStrength(password);

  return (
    <div className="auth-screen w-full min-h-[85vh] flex flex-col items-center justify-center p-4 relative">
      {/* Soft ambient glow */}
      <div className="absolute top-1/3 left-1/2 -translate-x-1/2 -translate-y-1/2 w-[380px] h-[380px] bg-accent/8 rounded-full blur-[120px] pointer-events-none" />

      <motion.div
        initial={{ opacity: 0, y: 24 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.5, ease: 'easeOut' }}
        className="w-full max-w-md bg-white dark:bg-[#0e0e11] border border-slate-200 dark:border-white/5 rounded-[2rem] p-8 sm:p-10 shadow-[0_25px_60px_-15px_rgba(0,0,0,0.35)] relative overflow-hidden z-10"
      >
        <div className="absolute top-0 inset-x-0 h-[2px] bg-gradient-to-r from-transparent via-accent to-transparent" />

        {/* Header */}
        <div className="text-center space-y-3 mb-8">
          <div className="inline-flex items-center justify-center w-14 h-14 rounded-2xl bg-accent/10 border border-accent/20 mb-2">
            <Sparkles className="w-6 h-6 text-accent" />
          </div>
          <h1 className="text-2xl font-black text-slate-900 dark:text-white uppercase tracking-tight">
            {isLogin ? 'Welcome Back' : 'Join Lumini'}
          </h1>
          <p className="text-xs text-slate-500 dark:text-zinc-400 leading-relaxed">
            {isLogin
              ? 'သင့် creative tools များကို ဆက်လက်အသုံးပြုပါ။'
              : 'အကောင့်ဖွင့်၍ ပရိုဖိုင်း tools အားလုံးကို ဖွင့်လောက်ပါ။'}
          </p>
        </div>

        {/* Tab Toggle */}
        <div className="grid grid-cols-2 p-1 bg-slate-100 dark:bg-white/5 rounded-xl mb-6 relative border border-slate-200/50 dark:border-zinc-800/40">
          <button
            type="button"
            onClick={() => { setIsLogin(true); setError(null); setResetSent(false); }}
            className={`py-2.5 text-[11px] font-black uppercase tracking-widest rounded-lg transition-all relative z-10 flex items-center justify-center gap-2 ${
              isLogin ? 'text-white' : 'text-slate-500 dark:text-zinc-300 hover:text-slate-900 dark:hover:text-zinc-200'
            }`}
          >
            {isLogin && (
              <motion.div
                layoutId="activeTabGlow"
                className="absolute inset-0 bg-accent rounded-lg -z-10 shadow-lg shadow-accent/25"
                transition={{ type: 'spring', stiffness: 350, damping: 25 }}
              />
            )}
            <LogIn className="w-3.5 h-3.5" />
            SignIn
          </button>
          <button
            type="button"
            onClick={() => { setIsLogin(false); setError(null); setResetSent(false); }}
            className={`py-2.5 text-[11px] font-black uppercase tracking-widest rounded-lg transition-all relative z-10 flex items-center justify-center gap-2 ${
              !isLogin ? 'text-white' : 'text-slate-500 dark:text-zinc-300 hover:text-slate-900 dark:hover:text-zinc-200'
            }`}
          >
            {!isLogin && (
              <motion.div
                layoutId="activeTabGlow"
                className="absolute inset-0 bg-accent rounded-lg -z-10 shadow-lg shadow-accent/25"
                transition={{ type: 'spring', stiffness: 350, damping: 25 }}
              />
            )}
            <UserPlus className="w-3.5 h-3.5" />
            Register
          </button>
        </div>

        {/* Google Sign In */}
        <button
          type="button"
          onClick={executeGoogleLogin}
          disabled={isLoading}
          className="w-full flex items-center justify-center gap-3 py-3 px-4 bg-slate-50 hover:bg-slate-100 dark:bg-white/5 dark:hover:bg-white/10 text-slate-800 dark:text-white border border-slate-200 dark:border-white/5 rounded-xl text-[10px] font-black uppercase tracking-widest transition-all disabled:opacity-50 mb-4"
        >
          <Chrome className="w-4 h-4 text-accent" />
          <span>Continue with Google</span>
        </button>

        <div className="flex items-center gap-3 mb-5">
          <div className="h-px flex-1 bg-slate-200 dark:bg-white/5" />
          <span className="text-[9px] font-bold text-slate-400 dark:text-zinc-500 uppercase tracking-widest">or email</span>
          <div className="h-px flex-1 bg-slate-200 dark:bg-white/5" />
        </div>

        <AnimatePresence mode="wait">
          {error && (
            <motion.div
              key="error"
              initial={{ opacity: 0, height: 0 }}
              animate={{ opacity: 1, height: 'auto' }}
              exit={{ opacity: 0, height: 0 }}
              className="mb-4"
            >
              <div className="p-3 bg-red-500/10 border border-red-500/20 rounded-xl flex items-start gap-2.5 text-red-500 text-xs">
                <AlertCircle className="w-4 h-4 flex-shrink-0 mt-0.5" />
                <span className="leading-normal font-medium">{error}</span>
              </div>
            </motion.div>
          )}

          {resetSent && (
            <motion.div
              key="reset"
              initial={{ opacity: 0, height: 0 }}
              animate={{ opacity: 1, height: 'auto' }}
              exit={{ opacity: 0, height: 0 }}
              className="mb-4"
            >
              <div className="p-3 bg-emerald-500/10 border border-emerald-500/20 rounded-xl flex items-start gap-2.5 text-emerald-500 text-xs">
                <CheckCircle2 className="w-4 h-4 flex-shrink-0 mt-0.5" />
                <span className="leading-normal font-medium">
                  Password ပြန်လည်သတ်မှတ်လင့်ခ်ကို အီးမေးလ်ထဲသို့ ပို့ပြီးပါပြီ။ Spam folder ကိုလည်း စစ်ပေးပါ။
                </span>
              </div>
            </motion.div>
          )}
        </AnimatePresence>

        <form onSubmit={handleAuthSubmit} className="space-y-4">
          {!isLogin && (
            <div className="space-y-1 text-left">
              <label className="text-[10px] font-black text-slate-500 dark:text-zinc-400 uppercase tracking-widest block ml-1">Full Name</label>
              <div className="relative">
                <div className="absolute inset-y-0 left-0 pl-3.5 flex items-center pointer-events-none text-slate-400 dark:text-zinc-500">
                  <User className="w-4 h-4" />
                </div>
                <input
                  type="text"
                  value={displayName}
                  onChange={(e) => setDisplayName(e.target.value)}
                  placeholder="Enter your profile name"
                  disabled={isLoading}
                  required
                  className="w-full pl-10 pr-4 py-3 bg-slate-50 dark:bg-zinc-950/60 border border-slate-200 dark:border-white/10 hover:border-slate-300 dark:hover:border-white/15 focus:border-accent rounded-xl text-slate-900 dark:text-white text-xs outline-none focus:ring-1 focus:ring-accent transition-all"
                />
              </div>
            </div>
          )}

          <div className="space-y-1 text-left">
            <label className="text-[10px] font-black text-slate-500 dark:text-zinc-400 uppercase tracking-widest block ml-1">Email Address</label>
            <div className="relative">
              <div className="absolute inset-y-0 left-0 pl-3.5 flex items-center pointer-events-none text-slate-400 dark:text-zinc-500">
                <Mail className="w-4 h-4" />
              </div>
              <input
                type="email"
                value={email}
                defaultValue={rememberedEmail}
                onChange={(e) => setEmail(e.target.value)}
                placeholder="your@email.com"
                disabled={isLoading}
                required
                className="w-full pl-10 pr-4 py-3 bg-slate-50 dark:bg-zinc-950/60 border border-slate-200 dark:border-white/10 hover:border-slate-300 dark:hover:border-white/15 focus:border-accent rounded-xl text-slate-900 dark:text-white text-xs outline-none focus:ring-1 focus:ring-accent transition-all"
              />
            </div>
          </div>

          <div className="space-y-1 text-left">
            <label className="text-[10px] font-black text-slate-500 dark:text-zinc-400 uppercase tracking-widest block ml-1">Password</label>
            <div className="relative">
              <div className="absolute inset-y-0 left-0 pl-3.5 flex items-center pointer-events-none text-slate-400 dark:text-zinc-500">
                <Lock className="w-4 h-4" />
              </div>
              <input
                type={showPassword ? 'text' : 'password'}
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                placeholder="••••••••••••"
                disabled={isLoading}
                required
                className="w-full pl-10 pr-10 py-3 bg-slate-50 dark:bg-zinc-950/60 border border-slate-200 dark:border-white/10 hover:border-slate-300 dark:hover:border-white/15 focus:border-accent rounded-xl text-slate-900 dark:text-white text-xs outline-none focus:ring-1 focus:ring-accent transition-all"
              />
              <button
                type="button"
                onClick={() => setShowPassword(!showPassword)}
                className="absolute inset-y-0 right-0 pr-3 flex items-center text-slate-400 dark:text-zinc-500 hover:text-slate-600 dark:hover:text-zinc-400"
                tabIndex={-1}
              >
                {showPassword ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
              </button>
            </div>

            {/* Password strength meter (sign up only) */}
            {!isLogin && password.length > 0 && (
              <motion.div
                initial={{ opacity: 0, y: -4 }}
                animate={{ opacity: 1, y: 0 }}
                className="flex items-center gap-2 px-1"
              >
                <div className="flex-1 flex gap-1">
                  {[1, 2, 3, 4, 5].map((step) => (
                    <div
                      key={step}
                      className={`h-1 flex-1 rounded-full transition-colors ${
                        step <= strength.score ? strength.color : 'bg-slate-200 dark:bg-white/10'
                      }`}
                    />
                  ))}
                </div>
                <span className="text-[9px] font-bold text-slate-500 dark:text-zinc-400">{strength.label}</span>
              </motion.div>
            )}
          </div>

          {/* Remember me + Forgot password */}
          <div className="flex items-center justify-between px-1">
            <label className="flex items-center gap-2 cursor-pointer select-none">
              <input
                type="checkbox"
                checked={remember}
                onChange={(e) => setRemember(e.target.checked)}
                className="w-3.5 h-3.5 rounded border-slate-300 dark:border-zinc-600 accent-[#F97316]"
              />
              <span className="text-[10px] font-bold text-slate-500 dark:text-zinc-400">Remember me</span>
            </label>
            {isLogin && (
              <button
                type="button"
                onClick={handleForgotPassword}
                disabled={isLoading}
                className="inline-flex items-center gap-1 text-[10px] font-bold text-accent hover:text-accent-hover transition-colors disabled:opacity-50"
              >
                <KeyRound className="w-3 h-3" />
                Forgot password?
              </button>
            )}
          </div>

          <button
            type="submit"
            disabled={isLoading}
            className="w-full py-3.5 bg-accent hover:bg-accent-hover text-white font-black uppercase tracking-widest text-[10px] rounded-xl shadow-lg shadow-accent/25 transition-all disabled:opacity-50 flex items-center justify-center gap-2 mt-2"
          >
            {isLoading ? (
              <div className="w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin" />
            ) : (
              <>
                <span>{isLogin ? 'Sign In' : 'Create Account'}</span>
                <ArrowRight className="w-3.5 h-3.5" />
              </>
            )}
          </button>
        </form>

      </motion.div>
    </div>
  );
};
