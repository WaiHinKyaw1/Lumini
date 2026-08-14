import React, { useState } from 'react';
import { 
  signInWithEmailAndPassword, 
  createUserWithEmailAndPassword, 
  updateProfile, 
  signInWithPopup, 
  GoogleAuthProvider 
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
  HelpCircle,
  ChevronDown,
  ChevronUp,
  Chrome
} from 'lucide-react';
import { toast } from 'react-hot-toast';

interface AuthScreenProps {
  onLoginGoogle?: () => void;
}

export const AuthScreen: React.FC<AuthScreenProps> = ({ onLoginGoogle }) => {
  const [isLogin, setIsLogin] = useState(true);
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [displayName, setDisplayName] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [showFirebaseGuide, setShowFirebaseGuide] = useState(false);

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

    try {
      if (isLogin) {
        // Sign In
        await signInWithEmailAndPassword(auth, cleanEmail, cleanPassword);
        toast.success('Welcome back to Lumina Studio!');
      } else {
        // Sign Up
        const userCredential = await createUserWithEmailAndPassword(auth, cleanEmail, cleanPassword);
        
        // Update user display profile
        if (userCredential.user) {
          await updateProfile(userCredential.user, {
            displayName: displayName.trim()
          });
        }
        toast.success('Welcome! Your registration with Lumina Studio is complete.');
      }
    } catch (err: any) {
      console.error('Authentication Error:', err);
      let userFriendlyMsg = err.message;
      
      // Translate complex Firebase codes for a superior UX in Burmese
      if (err.code === 'auth/invalid-credential') {
        userFriendlyMsg = 'အီးမေးလ် သို့မဟုတ် လျှို့ဝှက်ကုဒ် မှားယွင်းနေပါသည်။ ပြန်လည်စစ်ဆေးပေးပါ။';
      } else if (err.code === 'auth/email-already-in-use') {
        userFriendlyMsg = 'ဤအီးမေးလ်လိပ်စာသည် အကောင့်ဖွင့်ပြီးသားဖြစ်နေပါသည်။ အခြားစနစ်ဖြင့် ဝင်ရောက်ပါ သို့မဟုတ် login ဝင်ပါ။';
      } else if (err.code === 'auth/weak-password') {
        userFriendlyMsg = 'လျှို့ဝှက်ကုဒ်သည် အနည်းဆုံး စာလုံး ၆ လုံး ရှိရပါမည်။';
      } else if (err.code === 'auth/invalid-email') {
        userFriendlyMsg = 'အီးမေးလ်ပုံစံ မမှန်ကန်ပါ။ မှန်ကန်သော အီးမေးလ်လိပ်စာကို ရိုက်ထည့်ပေးပါ။';
      } else if (err.code === 'auth/user-not-found') {
        userFriendlyMsg = 'ဤအီးမေးလ်ဖြင့် ဖန်တီးထားသော အကောင့်မရှိသေးပါ။';
      } else if (err.code === 'auth/wrong-password') {
        userFriendlyMsg = 'လျှို့ဝှက်ကုဒ် မမှန်ကန်ပါ။ ပြန်လည်စစ်ဆေးပါ။';
      } else if (err.code === 'auth/operation-not-allowed') {
        userFriendlyMsg = 'အီးမေးလ်နှင့် လျှို့ဝှက်ကုဒ် (Email & Password) စနစ်ကို Firebase console တွင် မဖွင့်ရသေးပါ။';
        setShowFirebaseGuide(true);
      }
      
      setError(userFriendlyMsg);
      toast.error(userFriendlyMsg);
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
      } catch (err: any) {
        console.error('Google Sign In Error:', err);
        setError(err.message || 'Failed signing in with Google.');
        toast.error(err.message || 'Google Sign In failed.');
      } finally {
        setIsLoading(false);
      }
    }
  };

  return (
    <div className="w-full min-h-[85vh] flex flex-col items-center justify-center p-4">
      {/* Decorative ambient visual background blur effects */}
      <div className="absolute top-1/4 left-1/2 -translate-x-1/2 -translate-y-1/2 w-[340px] h-[340px] bg-accent/10 rounded-full blur-[100px] pointer-events-none" />
      <div className="absolute bottom-1/4 left-1/3 w-[260px] h-[260px] bg-[#9333ea]/5 rounded-full blur-[120px] pointer-events-none" />

      <motion.div 
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        className="w-full max-w-md bg-white dark:bg-[#0e0e11] border border-slate-200 dark:border-white/5 rounded-[2.5rem] p-6 sm:p-8 shadow-[0_25px_60px_-15px_rgba(0,0,0,0.35)] relative overflow-hidden z-10"
      >
        {/* Glow accent indicator top panel */}
        <div className="absolute top-0 inset-x-0 h-[2px] bg-gradient-to-r from-transparent via-accent to-transparent" />

        <div className="text-center space-y-2 mb-8">
          <div className="inline-flex items-center gap-1.5 px-3 py-1 bg-accent/10 border border-accent/20 rounded-full text-[10px] font-black uppercase tracking-[0.25em] text-accent mb-2">
            <Sparkles className="w-3 h-3 animate-pulse" />
            <span>Premium Creative Space</span>
          </div>
          <h1 className="text-3xl font-black text-slate-900 dark:text-white uppercase tracking-tighter">
            {isLogin ? 'Welcome Back' : 'Join Lumina'}
          </h1>
          <p className="text-xs text-slate-500 dark:text-zinc-400 max-w-[280px] mx-auto leading-relaxed">
            {isLogin 
              ? 'Access your cinematic creation tools, multi-speaker voiceover synthesizer, and viral captions.' 
              : 'Register your account to unlock professional automation, transcription engines, and credits.'}
          </p>
        </div>

        {/* Tab Toggle */}
        <div className="grid grid-cols-2 p-1 bg-slate-100 dark:bg-white/5 rounded-2xl mb-6 relative border border-slate-200/50 dark:border-zinc-800/40">
          <button
            type="button"
            onClick={() => { setIsLogin(true); setError(null); }}
            className={`py-3 text-[11px] font-black uppercase tracking-widest rounded-xl transition-all relative z-10 flex items-center justify-center gap-2 ${
              isLogin ? 'text-white' : 'text-slate-500 dark:text-zinc-300 hover:text-slate-900 dark:hover:text-zinc-200'
            }`}
          >
            {isLogin && (
              <motion.div 
                layoutId="activeTabGlow"
                className="absolute inset-0 bg-accent rounded-xl -z-10 shadow-lg shadow-accent/25"
                transition={{ type: "spring", stiffness: 350, damping: 25 }}
              />
            )}
            <LogIn className="w-3.5 h-3.5" />
            SignIn
          </button>
          <button
            type="button"
            onClick={() => { setIsLogin(false); setError(null); }}
            className={`py-3 text-[11px] font-black uppercase tracking-widest rounded-xl transition-all relative z-10 flex items-center justify-center gap-2 ${
              !isLogin ? 'text-white' : 'text-slate-500 dark:text-zinc-300 hover:text-slate-900 dark:hover:text-zinc-200'
            }`}
          >
            {!isLogin && (
              <motion.div 
                layoutId="activeTabGlow"
                className="absolute inset-0 bg-accent rounded-xl -z-10 shadow-lg shadow-accent/25"
                transition={{ type: "spring", stiffness: 350, damping: 25 }}
              />
            )}
            <UserPlus className="w-3.5 h-3.5" />
            Register
          </button>
        </div>

        {/* Social Integration */}
        <div className="space-y-4">
          <button
            type="button"
            onClick={executeGoogleLogin}
            disabled={isLoading}
            className="w-full flex items-center justify-center gap-3 py-3.5 px-4 bg-slate-50 hover:bg-slate-100 dark:bg-white/5 dark:hover:bg-white/10 text-slate-800 dark:text-white border border-slate-200 dark:border-white/5 rounded-2xl text-[10px] font-black uppercase tracking-widest transition-all active:scale-98"
          >
            <Chrome className="w-4 h-4 text-accent" />
            <span>Continue with Google</span>
          </button>

          <div className="flex items-center gap-3">
            <div className="h-px flex-1 bg-slate-200 dark:bg-white/5" />
            <span className="text-[9px] font-bold text-slate-400 dark:text-zinc-500 uppercase tracking-widest">or email credentials</span>
            <div className="h-px flex-1 bg-slate-200 dark:bg-white/5" />
          </div>

          <form onSubmit={handleAuthSubmit} className="space-y-4">
            <AnimatePresence mode="wait">
              {error && (
                <motion.div 
                  initial={{ opacity: 0, height: 0 }}
                  animate={{ opacity: 1, height: 'auto' }}
                  exit={{ opacity: 0, height: 0 }}
                  className="space-y-3"
                >
                  <div className="p-3.5 bg-red-500/10 border border-red-500/20 rounded-2xl flex items-start gap-2.5 text-red-500 text-xs text-left">
                    <AlertCircle className="w-4 h-4 flex-shrink-0 mt-0.5" />
                    <span className="leading-normal font-medium">{error}</span>
                  </div>

                  {/* High-visibility Action-oriented Guide for operation-not-allowed */}
                  {(error.includes('not enabled') || error.includes('မဖွင့်ရသေးပါ') || error.includes('not-allowed')) && (
                    <motion.div 
                      initial={{ opacity: 0, y: 10 }}
                      animate={{ opacity: 1, y: 0 }}
                      className="p-4 bg-amber-500/5 dark:bg-amber-500/10 border border-amber-500/20 rounded-2xl text-left space-y-3"
                    >
                      <div className="flex items-center gap-2 text-amber-600 dark:text-amber-400 font-black text-[10px] uppercase tracking-wider">
                        <Sparkles className="w-3.5 h-3.5" />
                        <span>ဖြေရှင်းနည်းလမ်းညွှန် (Instant Solution)</span>
                      </div>
                      <p className="text-[10px] text-zinc-600 dark:text-zinc-300 leading-relaxed font-semibold animate-fade-in">
                        Firebase တွင် အီးမေးလ်ဖြင့် အကောင့်သစ်ဖွင့်ခြင်း (Email Registration) ကို စတင်အသုံးပြုနိုင်ရန် Manual ဖွင့်ပေးရန်လိုအပ်ပါသည်။ အောက်ပါ ရွေးချယ်စရာတစ်ခုခုဖြင့် ၁ စက္ကန့်အတွင်း အလွယ်တကူ ကျော်ဖြတ်နိုင်ပါသည် -
                      </p>
                      
                      <div className="space-y-2">
                        {/* Option 1: Google Login (One-click default) */}
                        <div className="p-2.5 bg-white dark:bg-black/40 border border-amber-500/10 rounded-xl">
                          <p className="text-[9px] font-black uppercase text-amber-600 dark:text-amber-400 mb-1.5">⚡ နည်းလမ်း (က) - Google ဖြင့် တိုက်ရိုက်ဝင်ရန် (အထူးအကြံပြုချက်)</p>
                          <button
                            type="button"
                            onClick={executeGoogleLogin}
                            className="w-full flex items-center justify-center gap-2 py-2 px-3 bg-accent hover:bg-accent-hover text-white rounded-lg text-[9px] font-black uppercase tracking-wider transition-all"
                          >
                            <Chrome className="w-3.5 h-3.5" />
                            <span>Google ဖြင့် ချက်ချင်းဝင်မည်</span>
                          </button>
                        </div>

                        {/* Option 2: Step Guide Link */}
                        <div className="p-2.5 bg-white dark:bg-black/40 border border-amber-500/10 rounded-xl space-y-1">
                          <p className="text-[9px] font-black uppercase text-zinc-500 dark:text-zinc-300">⚙️ နည်းလမ်း (ခ) - Email/Password စနစ်ကို Activate လုပ်ရန်</p>
                          <p className="text-[9px] text-zinc-500 leading-normal font-medium">
                            Firebase Console တွင် Email စနစ်ကို ဖွင့်လိုပါက အောက်နားရှိ <strong>"Firebase Activation Help (မြန်မာဘာသာ)"</strong> ခလုတ်ကို နှိပ်၍ အဆင့်ဆင့်လုပ်ဆောင်ပုံ လမ်းညွှန်ချက်ကို ကြည့်ရှုနိုင်ပါသည်။
                          </p>
                        </div>
                      </div>
                    </motion.div>
                  )}
                </motion.div>
              )}
            </AnimatePresence>

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
                    className="w-full pl-10 pr-4 py-3 bg-slate-50 dark:bg-zinc-950/60 border border-slate-200 dark:border-white/10 hover:border-slate-300 dark:hover:border-white/15 focus:border-accent rounded-2xl text-slate-900 dark:text-white text-xs outline-none focus:ring-1 focus:ring-accent transition-all"
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
                  onChange={(e) => setEmail(e.target.value)}
                  placeholder="your@email.com"
                  disabled={isLoading}
                  required
                  className="w-full pl-10 pr-4 py-3 bg-slate-50 dark:bg-zinc-950/60 border border-slate-200 dark:border-white/10 hover:border-slate-300 dark:hover:border-white/15 focus:border-accent rounded-2xl text-slate-900 dark:text-white text-xs outline-none focus:ring-1 focus:ring-accent transition-all"
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
                  type={showPassword ? "text" : "password"}
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  placeholder="••••••••••••"
                  disabled={isLoading}
                  required
                  className="w-full pl-10 pr-10 py-3 bg-slate-50 dark:bg-zinc-950/60 border border-slate-200 dark:border-white/10 hover:border-slate-300 dark:hover:border-white/15 focus:border-accent rounded-2xl text-slate-900 dark:text-white text-xs outline-none focus:ring-1 focus:ring-accent transition-all"
                />
                <button
                  type="button"
                  onClick={() => setShowPassword(!showPassword)}
                  className="absolute inset-y-0 right-0 pr-3 flex items-center text-slate-400 dark:text-zinc-500 hover:text-slate-600 dark:hover:text-zinc-400"
                >
                  {showPassword ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                </button>
              </div>
            </div>

            <button
              type="submit"
              disabled={isLoading}
              className="w-full py-4 bg-accent hover:bg-accent-hover text-white font-black uppercase tracking-widest text-[10px] rounded-2xl shadow-lg shadow-accent/25 transition-all active:scale-98 flex items-center justify-center gap-2 mt-4 disabled:opacity-50"
            >
              {isLoading ? (
                <div className="w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin" />
              ) : (
                <>
                  <span>{isLogin ? 'Sign In Engine' : 'Activate Account'}</span>
                  <ArrowRight className="w-3.5 h-3.5" />
                </>
              )}
            </button>
          </form>
        </div>

        {/* Toggle setup tutorial guide if requested */}
        <div className="mt-8 pt-6 border-t border-slate-200/50 dark:border-zinc-900 text-center">
          <button
            type="button"
            onClick={() => setShowFirebaseGuide(!showFirebaseGuide)}
            className="inline-flex items-center gap-1.5 text-[9px] font-black uppercase tracking-widest text-slate-400 hover:text-slate-600 dark:text-zinc-500 dark:hover:text-zinc-400 transition-colors"
          >
            <HelpCircle className="w-3.5 h-3.5" />
            <span>Firebase Activation Help (မြန်မာဘာသာ)</span>
            {showFirebaseGuide ? <ChevronUp className="w-3 h-3" /> : <ChevronDown className="w-3 h-3" />}
          </button>

          <AnimatePresence>
            {showFirebaseGuide && (
              <motion.div
                initial={{ opacity: 0, height: 0 }}
                animate={{ opacity: 1, height: 'auto' }}
                exit={{ opacity: 0, height: 0 }}
                className="mt-4 text-left p-4 rounded-2xl bg-slate-50 dark:bg-zinc-950/60 border border-slate-200/50 dark:border-white/5 space-y-3 overflow-hidden"
              >
                <div className="space-y-1">
                  <h4 className="text-[10px] font-extrabold uppercase text-slate-800 dark:text-white flex items-center gap-1">
                    <span className="w-1.5 h-1.5 rounded-full bg-accent animate-pulse" />
                    Email/Password အကောင့်စနစ်အား ဖွင့်နည်းလမ်းညွှန် -
                  </h4>
                  <p className="text-[9px] text-slate-500 dark:text-zinc-400 leading-normal font-medium">
                    Firebase စနစ်သည် မူလကနဦးတွင် Google ဖြင့်ဝင်ခြင်းကိုသာ ခွင့်ပြုထားသဖြင့် အီးမေးလ်ဖြင့် အကောင့်သစ်များ ဖွင့်နိုင်ရန် Console ထဲတွင် ဖွင့်ပေးရန် လိုအပ်ပါသည် -
                  </p>
                </div>
                
                <ol className="list-decimal list-inside text-[9px] text-slate-600 dark:text-zinc-300 space-y-2 leading-relaxed font-semibold">
                  <li>
                    ဦးစွာ{' '}
                    <a 
                      href="https://console.firebase.google.com/" 
                      target="_blank" 
                      rel="noopener noreferrer" 
                      className="text-accent underline font-black"
                    >
                      Firebase Console
                    </a>{' '}
                    သို့ သွားပါ။
                  </li>
                  <li>သင်၏ Firebase Project ဖြစ်သော <code className="font-mono bg-slate-200 dark:bg-white/5 px-1 py-0.5 rounded text-[8px] text-slate-700 dark:text-zinc-300">ai-studio-4c6d9</code> သို့ ဝင်ပါ။</li>
                  <li>ဘယ်ဘက် Sidebar မီနူးရှိ <strong>Authentication</strong> ကို နှိပ်ပါ။</li>
                  <li>ထို့နောက် အပေါ်ရှိ <strong>Sign-in method</strong> tab သို့ သွားပါ။</li>
                  <li><strong>Add new provider</strong> ခလုတ်ကို နှိပ်ပြီး <strong>Email/Password</strong> ကို ရွေးကာ <strong>Enable / Save</strong> သတ်မှတ်ပေးပါ။</li>
                  <li>ယခုဆိုလျှင် အီးမေးလ်နှင့် စိတ်ကြိုက်အကောင့်သစ်များကို လွယ်ကူစွာ စတင်ဖန်တီးနိုင်ပါပြီ! 🎉</li>
                </ol>
              </motion.div>
            )}
          </AnimatePresence>
        </div>
      </motion.div>
    </div>
  );
};
