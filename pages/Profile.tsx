
import React, { useState, useEffect } from 'react';
import { motion } from 'motion/react';
import { User, Mail, Shield, Save, Loader2, UserCircle } from 'lucide-react';
import { supabase, isSupabaseConfigured } from '../services/supabase';

interface ProfileProps {
  session: any;
}

const Profile: React.FC<ProfileProps> = ({ session }) => {
  const [loading, setLoading] = useState(false);
  const [message, setMessage] = useState<{ type: 'success' | 'error', text: string } | null>(null);
  const [fullName, setFullName] = useState(session?.user?.user_metadata?.full_name || '');
  const [email] = useState(session?.user?.email || '');

  const handleUpdateProfile = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    setMessage(null);

    if (!isSupabaseConfigured) {
      // Demo mode
      setTimeout(() => {
        const demoSession = JSON.parse(localStorage.getItem('lumina_demo_session') || '{}');
        if (demoSession.user) {
          demoSession.user.user_metadata = { ...demoSession.user.user_metadata, full_name: fullName };
          localStorage.setItem('lumina_demo_session', JSON.stringify(demoSession));
        }
        setLoading(false);
        setMessage({ type: 'success', text: 'Profile updated successfully (Demo Mode)' });
      }, 1000);
      return;
    }

    try {
      const { error } = await supabase.auth.updateUser({
        data: { full_name: fullName }
      });

      if (error) throw error;
      setMessage({ type: 'success', text: 'Profile updated successfully' });
    } catch (error: any) {
      setMessage({ type: 'error', text: error.message || 'Failed to update profile' });
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="max-w-4xl mx-auto space-y-8">
      <header className="space-y-2">
        <h1 className="text-4xl font-black uppercase tracking-tighter italic text-white">Account Settings</h1>
        <p className="text-zinc-400 font-medium">Manage your profile information and account security.</p>
      </header>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">
        {/* Profile Card */}
        <motion.div 
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          className="lg:col-span-1 space-y-6"
        >
          <div className="glass p-8 rounded-[2.5rem] border border-white/10 text-center space-y-6">
            <div className="relative inline-block">
              <div className="w-24 h-24 bg-indigo-600/20 rounded-3xl flex items-center justify-center mx-auto border border-indigo-500/30">
                <UserCircle className="w-12 h-12 text-indigo-500" />
              </div>
              <div className="absolute -bottom-2 -right-2 w-8 h-8 bg-emerald-500 rounded-xl border-4 border-[#09090b] flex items-center justify-center">
                <div className="w-2 h-2 bg-white rounded-full animate-pulse" />
              </div>
            </div>
            
            <div className="space-y-1">
              <h2 className="text-xl font-bold text-white tracking-tight">{fullName || 'User'}</h2>
              <p className="text-zinc-500 text-xs font-mono uppercase tracking-widest">{email}</p>
            </div>

            <div className="pt-6 border-t border-white/5 flex justify-center gap-4">
              <div className="text-center">
                <p className="text-lg font-bold text-white">Pro</p>
                <p className="text-[10px] font-black uppercase tracking-widest text-zinc-500">Plan</p>
              </div>
              <div className="w-px h-8 bg-white/5" />
              <div className="text-center">
                <p className="text-lg font-bold text-white">Active</p>
                <p className="text-[10px] font-black uppercase tracking-widest text-zinc-500">Status</p>
              </div>
            </div>
          </div>

          <div className="glass p-6 rounded-[2rem] border border-white/10 space-y-4">
            <h3 className="text-xs font-black uppercase tracking-widest text-zinc-500 px-2">Account Security</h3>
            <div className="space-y-2">
              <button className="w-full p-4 rounded-2xl bg-white/5 border border-white/5 flex items-center gap-4 hover:bg-white/10 transition-all text-left group">
                <Shield className="w-5 h-5 text-indigo-500 group-hover:scale-110 transition-transform" />
                <div>
                  <p className="text-sm font-bold text-white">Password</p>
                  <p className="text-[10px] text-zinc-500">Last changed 2 months ago</p>
                </div>
              </button>
              <button className="w-full p-4 rounded-2xl bg-white/5 border border-white/5 flex items-center gap-4 hover:bg-white/10 transition-all text-left group">
                <Mail className="w-5 h-5 text-indigo-500 group-hover:scale-110 transition-transform" />
                <div>
                  <p className="text-sm font-bold text-white">Email Notifications</p>
                  <p className="text-[10px] text-zinc-500">Enabled for all updates</p>
                </div>
              </button>
            </div>
          </div>
        </motion.div>

        {/* Edit Form */}
        <motion.div 
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.1 }}
          className="lg:col-span-2"
        >
          <div className="glass p-8 rounded-[2.5rem] border border-white/10 space-y-8">
            <div className="flex items-center justify-between">
              <h2 className="text-xl font-bold text-white tracking-tight">Personal Information</h2>
              <div className="px-3 py-1 bg-indigo-600/10 border border-indigo-500/20 rounded-full">
                <span className="text-[10px] font-black uppercase tracking-widest text-indigo-500">Profile Details</span>
              </div>
            </div>

            <form onSubmit={handleUpdateProfile} className="space-y-6">
              {message && (
                <div className={`p-4 rounded-2xl border ${
                  message.type === 'success' 
                    ? 'bg-emerald-500/10 border-emerald-500/20 text-emerald-500' 
                    : 'bg-rose-500/10 border-rose-500/20 text-rose-500'
                } text-sm font-medium`}>
                  {message.text}
                </div>
              )}

              <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                <div className="space-y-2">
                  <label className="text-[10px] font-black uppercase tracking-widest text-zinc-500 px-2">Full Name</label>
                  <div className="relative group">
                    <User className="absolute left-4 top-1/2 -translate-y-1/2 w-5 h-5 text-zinc-500 group-focus-within:text-indigo-500 transition-colors" />
                    <input
                      type="text"
                      value={fullName}
                      onChange={(e) => setFullName(e.target.value)}
                      className="w-full bg-white/5 border border-white/10 rounded-2xl py-4 pl-12 pr-4 text-white placeholder:text-zinc-600 focus:outline-none focus:ring-2 focus:ring-indigo-500/50 focus:border-indigo-500 transition-all"
                      placeholder="Enter your full name"
                    />
                  </div>
                </div>

                <div className="space-y-2">
                  <label className="text-[10px] font-black uppercase tracking-widest text-zinc-500 px-2">Email Address</label>
                  <div className="relative group opacity-60">
                    <Mail className="absolute left-4 top-1/2 -translate-y-1/2 w-5 h-5 text-zinc-500" />
                    <input
                      type="email"
                      value={email}
                      disabled
                      className="w-full bg-white/5 border border-white/10 rounded-2xl py-4 pl-12 pr-4 text-white cursor-not-allowed"
                    />
                  </div>
                  <p className="text-[10px] text-zinc-600 px-2 italic">Email cannot be changed directly for security reasons.</p>
                </div>
              </div>

              <div className="pt-6 border-t border-white/5 flex justify-end">
                <button
                  type="submit"
                  disabled={loading}
                  className="bg-indigo-600 hover:bg-indigo-500 disabled:opacity-50 disabled:cursor-not-allowed text-white px-8 py-4 rounded-2xl font-bold flex items-center gap-3 transition-all active:scale-95 shadow-lg shadow-indigo-600/20"
                >
                  {loading ? (
                    <Loader2 className="w-5 h-5 animate-spin" />
                  ) : (
                    <Save className="w-5 h-5" />
                  )}
                  Save Changes
                </button>
              </div>
            </form>
          </div>
        </motion.div>
      </div>
    </div>
  );
};

export default Profile;
