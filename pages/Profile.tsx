
import React, { useState, useEffect } from 'react';
import { motion } from 'motion/react';
import { User, Mail, Shield, Save, Loader2, UserCircle } from 'lucide-react';
import { supabase, isSupabaseConfigured } from '../services/supabase';

interface ProfileProps {
  session: any;
}

const Profile: React.FC<ProfileProps> = ({ session }) => {
  const [fullName] = useState(session?.user?.user_metadata?.full_name || 'Lumina Creator');
  const [email] = useState(session?.user?.email || 'creator@lumina.studio');

  return (
    <div className="max-w-4xl mx-auto space-y-8">
      <header className="space-y-2">
        <h1 className="text-4xl font-black uppercase tracking-tighter text-white">Account Settings</h1>
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
              <div className="w-24 h-24 bg-accent/20 rounded-3xl flex items-center justify-center mx-auto border border-accent/30">
                <UserCircle className="w-12 h-12 text-accent" />
              </div>
              <div className="absolute -bottom-2 -right-2 w-8 h-8 bg-emerald-500 rounded-xl border-4 border-obsidian flex items-center justify-center">
                <div className="w-2 h-2 bg-white rounded-full animate-pulse" />
              </div>
            </div>
            
            <div className="space-y-1">
              <h2 className="movie-h1 !mb-0">{fullName || 'User'}</h2>
              <p className="movie-meta !text-[10px] !mb-0 uppercase tracking-widest">{email}</p>
            </div>

            <div className="pt-6 border-t border-white/5 flex justify-center gap-4">
              <div className="text-center">
                <p className="movie-h2 !text-lg !mb-0">Pro</p>
                <p className="movie-meta !text-[10px] !mb-0 uppercase tracking-widest">Plan</p>
              </div>
              <div className="w-px h-8 bg-white/5" />
              <div className="text-center">
                <p className="movie-h2 !text-lg !mb-0">Active</p>
                <p className="movie-meta !text-[10px] !mb-0 uppercase tracking-widest">Status</p>
              </div>
            </div>
          </div>

          <div className="glass p-6 rounded-[2rem] border border-white/10 space-y-4">
            <h3 className="movie-meta uppercase tracking-widest !mb-0 px-2">Account Security</h3>
            <div className="space-y-2">
              <button className="w-full p-4 rounded-2xl bg-white/5 border border-white/5 flex items-center gap-4 hover:bg-white/10 transition-all text-left group">
                <Shield className="w-5 h-5 text-accent group-hover:scale-110 transition-transform" />
                <div>
                  <p className="movie-h2 !text-sm !mb-0">Password</p>
                  <p className="movie-meta !text-[10px] !mb-0">Last changed 2 months ago</p>
                </div>
              </button>
              <button className="w-full p-4 rounded-2xl bg-white/5 border border-white/5 flex items-center gap-4 hover:bg-white/10 transition-all text-left group">
                <Mail className="w-5 h-5 text-accent group-hover:scale-110 transition-transform" />
                <div>
                  <p className="movie-h2 !text-sm !mb-0">Email Notifications</p>
                  <p className="movie-meta !text-[10px] !mb-0">Enabled for all updates</p>
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
              <h2 className="movie-h2 !text-xl !mb-0">Personal Information</h2>
              <div className="px-3 py-1 bg-accent/10 border border-accent/20 rounded-full">
                <span className="movie-meta !text-[10px] uppercase tracking-widest text-accent !mb-0">Profile Details</span>
              </div>
            </div>

            <div className="space-y-6">
              <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                <div className="space-y-2">
                  <label className="movie-meta uppercase tracking-widest px-2 !mb-0">Full Name</label>
                  <div className="relative group opacity-60">
                    <User className="absolute left-4 top-1/2 -translate-y-1/2 w-5 h-5 text-zinc-500" />
                    <input
                      type="text"
                      value={fullName}
                      disabled
                      className="w-full bg-white/5 border border-white/10 rounded-2xl py-4 pl-12 pr-4 text-white highlight-none"
                    />
                  </div>
                </div>

                <div className="space-y-2">
                  <label className="movie-meta uppercase tracking-widest px-2 !mb-0">Email Address</label>
                  <div className="relative group opacity-60">
                    <Mail className="absolute left-4 top-1/2 -translate-y-1/2 w-5 h-5 text-zinc-500" />
                    <input
                      type="email"
                      value={email}
                      disabled
                      className="w-full bg-white/5 border border-white/10 rounded-2xl py-4 pl-12 pr-4 text-white cursor-not-allowed"
                    />
                  </div>
                  <p className="movie-meta !text-[9px] text-zinc-600 px-2 uppercase tracking-widest !mb-0">Email cannot be changed directly for security reasons.</p>
                </div>
              </div>

              <div className="pt-6 border-t border-white/5 flex justify-end">
                <p className="movie-meta !text-[10px] text-zinc-500 uppercase tracking-widest !mb-0">Lumina Creator Active</p>
              </div>
            </div>
          </div>
        </motion.div>
      </div>
    </div>
  );
};

export default Profile;
