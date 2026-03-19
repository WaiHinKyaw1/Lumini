
import React, { useState } from 'react';
import { motion, AnimatePresence } from 'motion/react';
import { Mail, Lock, Eye, EyeOff, ArrowRight, User, ShieldCheck, Sparkles, Loader2 } from 'lucide-react';
import { supabase, isSupabaseConfigured } from '../services/supabase';
import toast from 'react-hot-toast';

interface LoginProps {
  onAuthSuccess: (session: any) => void;
}

const Login: React.FC<LoginProps> = ({ onAuthSuccess }) => {
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [fullName, setFullName] = useState('');
  const [loading, setLoading] = useState(false);
  const [isSignUp, setIsSignUp] = useState(false);
  const [showPassword, setShowPassword] = useState(false);

  const handleAuth = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);

    try {
      if (!isSupabaseConfigured) {
        // Demo mode: Auto-login
        const demoSession = { 
          user: { 
            email: email || 'demo@lumina.studio', 
            id: 'demo-user', 
            user_metadata: { full_name: fullName || 'Demo User' } 
          } 
        };
        localStorage.setItem('lumina_demo_session', JSON.stringify(demoSession));
        toast.success('Welcome to Lumina Studio (Demo Mode)');
        onAuthSuccess(demoSession);
        return;
      }

      if (isSignUp) {
        const { error } = await supabase.auth.signUp({ 
          email, 
          password,
          options: {
            data: {
              full_name: fullName
            }
          }
        });
        if (error) throw error;
        toast.success('Check your email for the confirmation link!');
      } else {
        const { data, error } = await supabase.auth.signInWithPassword({ email, password });
        if (error) throw error;
        toast.success('Successfully logged in');
        onAuthSuccess(data.session);
      }
    } catch (err: any) {
      toast.error(err.message || 'Authentication failed');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="min-h-screen flex bg-[#09090b] text-white overflow-hidden font-sans">
      {/* Background Effects */}
      <div className="absolute inset-0 overflow-hidden pointer-events-none">
        <div className="absolute top-[-10%] left-[-10%] w-[60%] h-[60%] bg-indigo-600/10 rounded-full blur-[120px]"></div>
        <div className="absolute bottom-[-10%] right-[-10%] w-[60%] h-[60%] bg-fuchsia-600/10 rounded-full blur-[120px]"></div>
      </div>

      {/* Left Side - Visual/Branding (Hidden on mobile) */}
      <div className="hidden lg:flex lg:w-1/2 relative flex-col justify-between p-16 border-r border-white/5 overflow-hidden">
        <div className="relative z-10">
          <motion.div 
            initial={{ opacity: 0, x: -20 }}
            animate={{ opacity: 1, x: 0 }}
            className="flex items-center gap-3 mb-16"
          >
            <div className="w-12 h-12 bg-indigo-600 rounded-2xl flex items-center justify-center shadow-2xl shadow-indigo-600/40 border border-white/10">
              <Sparkles className="w-6 h-6 text-white" />
            </div>
            <span className="text-2xl font-black uppercase tracking-tighter italic text-white">Lumina Studio</span>
          </motion.div>

          <motion.div
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: 0.2 }}
            className="space-y-6"
          >
            <h1 className="text-8xl font-black uppercase tracking-tighter leading-[0.85] italic">
              Create <br />
              <span className="text-indigo-500">Without</span> <br />
              Limits.
            </h1>
            <p className="text-zinc-400 max-w-md text-lg font-medium leading-relaxed">
              The ultimate AI-powered workspace for modern creators. Transcribe, translate, and transform your media in seconds.
            </p>
          </motion.div>
        </div>

        <motion.div 
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          transition={{ delay: 0.4 }}
          className="relative z-10 flex items-center gap-8"
        >
          <div className="flex -space-x-4">
            {[1,2,3,4].map(i => (
              <div key={i} className="w-12 h-12 rounded-2xl border-4 border-[#09090b] bg-zinc-800 flex items-center justify-center overflow-hidden shadow-xl">
                <img src={`https://picsum.photos/seed/user${i}/100/100`} alt="User" referrerPolicy="no-referrer" />
              </div>
            ))}
          </div>
          <div className="space-y-0.5">
            <p className="text-xs font-black text-white uppercase tracking-widest">10,000+ Creators</p>
            <p className="text-[10px] font-bold text-zinc-500 uppercase tracking-widest">Already joined the revolution</p>
          </div>
        </motion.div>
      </div>

      {/* Right Side - Login Form */}
      <div className="w-full lg:w-1/2 flex items-center justify-center p-8 relative z-10">
        <motion.div 
          initial={{ opacity: 0, scale: 0.95 }}
          animate={{ opacity: 1, scale: 1 }}
          className="max-w-md w-full glass p-10 md:p-12 rounded-[3rem] border border-white/10 shadow-2xl space-y-10"
        >
          {/* Logo for mobile */}
          <div className="lg:hidden flex justify-center mb-8">
            <div className="w-12 h-12 bg-indigo-600 rounded-2xl flex items-center justify-center shadow-xl border border-white/10">
              <Sparkles className="w-6 h-6 text-white" />
            </div>
          </div>

          <div className="space-y-3 text-center lg:text-left">
            <h2 className="text-4xl font-black uppercase tracking-tighter italic text-white">
              {isSignUp ? 'Join Studio' : 'Please Enter Login'}
            </h2>
            <p className="text-zinc-500 text-sm font-medium">
              {isSignUp ? 'Start your creative journey with Lumina.' : 'Welcome back! Enter your credentials to continue.'}
            </p>
          </div>

          <form onSubmit={handleAuth} className="space-y-6">
            <div className="space-y-4">
              <AnimatePresence mode="wait">
                {isSignUp && (
                  <motion.div 
                    initial={{ opacity: 0, height: 0 }}
                    animate={{ opacity: 1, height: 'auto' }}
                    exit={{ opacity: 0, height: 0 }}
                    className="space-y-1.5"
                  >
                    <label className="text-[10px] font-black text-zinc-500 uppercase tracking-widest ml-2">Full Name</label>
                    <div className="relative group">
                      <User className="absolute left-4 top-1/2 -translate-y-1/2 w-5 h-5 text-zinc-600 group-focus-within:text-indigo-500 transition-colors" />
                      <input
                        type="text"
                        value={fullName}
                        onChange={(e) => setFullName(e.target.value)}
                        className="w-full bg-white/5 border border-white/10 rounded-2xl py-4 pl-12 pr-4 text-sm focus:ring-2 focus:ring-indigo-500/50 focus:border-indigo-500 outline-none transition-all placeholder:text-zinc-700"
                        placeholder="Your Name"
                        required={isSignUp}
                      />
                    </div>
                  </motion.div>
                )}
              </AnimatePresence>

              <div className="space-y-1.5">
                <label className="text-[10px] font-black text-zinc-500 uppercase tracking-widest ml-2">Email Address</label>
                <div className="relative group">
                  <Mail className="absolute left-4 top-1/2 -translate-y-1/2 w-5 h-5 text-zinc-600 group-focus-within:text-indigo-500 transition-colors" />
                  <input
                    type="email"
                    value={email}
                    onChange={(e) => setEmail(e.target.value)}
                    className="w-full bg-white/5 border border-white/10 rounded-2xl py-4 pl-12 pr-4 text-sm focus:ring-2 focus:ring-indigo-500/50 focus:border-indigo-500 outline-none transition-all placeholder:text-zinc-700"
                    placeholder="name@example.com"
                    required
                  />
                </div>
              </div>

              <div className="space-y-1.5">
                <div className="flex justify-between items-center px-2">
                  <label className="text-[10px] font-black text-zinc-500 uppercase tracking-widest">Password</label>
                  {!isSignUp && (
                    <button type="button" className="text-[10px] font-black text-indigo-500 uppercase tracking-widest hover:text-indigo-400 transition-colors">Forgot?</button>
                  )}
                </div>
                <div className="relative group">
                  <Lock className="absolute left-4 top-1/2 -translate-y-1/2 w-5 h-5 text-zinc-600 group-focus-within:text-indigo-500 transition-colors" />
                  <input
                    type={showPassword ? 'text' : 'password'}
                    value={password}
                    onChange={(e) => setPassword(e.target.value)}
                    className="w-full bg-white/5 border border-white/10 rounded-2xl py-4 pl-12 pr-12 text-sm focus:ring-2 focus:ring-indigo-500/50 focus:border-indigo-500 outline-none transition-all placeholder:text-zinc-700"
                    placeholder="••••••••"
                    required
                  />
                  <button
                    type="button"
                    onClick={() => setShowPassword(!showPassword)}
                    className="absolute right-4 top-1/2 -translate-y-1/2 text-zinc-600 hover:text-white transition-colors"
                  >
                    {showPassword ? <EyeOff className="w-5 h-5" /> : <Eye className="w-5 h-5" />}
                  </button>
                </div>
              </div>
            </div>

            <button
              type="submit"
              disabled={loading}
              className="w-full py-5 bg-white text-black font-black uppercase tracking-widest rounded-2xl hover:bg-indigo-600 hover:text-white transition-all active:scale-[0.98] disabled:opacity-50 shadow-2xl shadow-white/5 flex items-center justify-center gap-3"
            >
              {loading ? (
                <Loader2 className="w-5 h-5 animate-spin" />
              ) : (
                <>
                  {isSignUp ? 'Create Account' : 'Enter Studio'}
                  <ArrowRight className="w-5 h-5" />
                </>
              )}
            </button>
          </form>

          <div className="pt-6 border-t border-white/5 text-center space-y-6">
            <p className="text-[11px] font-bold text-zinc-500 uppercase tracking-widest">
              {isSignUp ? 'Already have an account?' : "Don't have an account yet?"}
              <button 
                onClick={() => setIsSignUp(!isSignUp)}
                className="ml-2 text-indigo-500 hover:text-indigo-400 transition-colors underline underline-offset-4"
              >
                {isSignUp ? 'Sign In' : 'Register Now'}
              </button>
            </p>

            {!isSupabaseConfigured && (
              <div className="p-4 rounded-2xl bg-amber-500/5 border border-amber-500/10 flex items-center gap-3 text-left">
                <ShieldCheck className="w-5 h-5 text-amber-500 shrink-0" />
                <p className="text-[10px] text-zinc-500 font-bold uppercase tracking-tight leading-tight">
                  Demo Mode Active. Use any credentials to explore.
                </p>
              </div>
            )}
          </div>
        </motion.div>
      </div>
    </div>
  );
};

export default Login;
