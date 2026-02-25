
import React, { useState, useEffect } from 'react';
import Layout from './components/Layout';
import Dashboard from './pages/Dashboard';
import Transcription from './pages/Transcription';
import Translation from './pages/Translation';
import Voiceover from './pages/Voiceover';
import SpeechMaster from './pages/SpeechMaster';
import MovieRecap from './pages/MovieRecap';
import VideoInsights from './pages/VideoInsights';
import ThumbnailGen from './pages/ThumbnailGen';
import SubtitleStudio from './pages/SubtitleStudio';
import CreditModal from './components/CreditModal';
import { UserStats, ContentType } from './types';

const INITIAL_STATS: UserStats = {
  credits: 100,
  totalGenerated: 0
};

const App: React.FC = () => {
  const [stats, setStats] = useState<UserStats>(INITIAL_STATS);
  const [hasApiKey, setHasApiKey] = useState(true);
  
  const [currentPath, setCurrentPath] = useState('dashboard');
  const [isDarkMode, setIsDarkMode] = useState(true);
  const [isCreditModalOpen, setIsCreditModalOpen] = useState(false);

  // Initialize User and Load Data
  useEffect(() => {
    // On initial load, we can check for an API key if needed for pro features,
    // but we avoid creating a refresh loop.
    const checkApiKey = async () => {
      if (typeof window !== 'undefined' && (window as any).aistudio?.hasSelectedApiKey) {
        const keySelected = await (window as any).aistudio.hasSelectedApiKey();
        // We only block if the user is trying to access a pro feature without a key.
        // For now, we let them in and features will handle credit checks.
        setHasApiKey(keySelected);
      } else {
        // Default to true for free-tier access.
        setHasApiKey(true);
      }
    };
    // We are removing the call to checkApiKey() to prevent any potential refresh loops.
    // initData();
  }, []);

  // Theme Toggle Logic
  useEffect(() => {
    const html = document.documentElement;
    if (isDarkMode) {
      html.classList.add('dark');
    } else {
      html.classList.remove('dark');
    }
  }, [isDarkMode]);

  const toggleTheme = () => setIsDarkMode(!isDarkMode);

  const handleOpenKeySelector = async () => {
    await (window as any).aistudio.openSelectKey();
    setHasApiKey(true); // Assume success as per guidelines
  };

  const spendCredits = (amount: number): boolean => {
    if (stats.credits < amount) {
      setIsCreditModalOpen(true);
      return false;
    }
    
    setStats(prev => {
      if (prev.credits < amount) return prev; // Double-check
      const newCredits = prev.credits - amount;
      const newTotal = prev.totalGenerated + 1;
      return { ...prev, credits: newCredits, totalGenerated: newTotal };
    });
    return true;
  };

  const addCredits = (amount: number) => {
    setStats(prev => {
      const newCredits = prev.credits + amount;
      return { ...prev, credits: newCredits };
    });
  };

  const renderPage = () => {
    switch (currentPath) {
      case 'dashboard':
        return <Dashboard onAction={setCurrentPath} stats={stats} onOpenCredits={() => setIsCreditModalOpen(true)} />;
      case 'subtitle':
        return <SubtitleStudio onSpendCredits={spendCredits} />;
      case 'insights':
        return <VideoInsights onSpendCredits={spendCredits} />;
      case 'transcription':
        return <Transcription onSpendCredits={spendCredits} />;
      case 'translation':
        return <Translation onSpendCredits={spendCredits} />;
      case 'thumbnail':
        return <ThumbnailGen onSpendCredits={spendCredits} />;
      case 'voiceover':
        return <Voiceover onSpendCredits={spendCredits} />;
      case 'speech':
        return <SpeechMaster onSpendCredits={spendCredits} />;
      case 'recap':
        return <MovieRecap onSpendCredits={spendCredits} />;
      default:
        return <Dashboard onAction={setCurrentPath} stats={stats} onOpenCredits={() => setIsCreditModalOpen(true)} />;
    }
  };

  if (!hasApiKey) {
    return (
      <div className="min-h-screen bg-[#09090b] flex items-center justify-center p-6">
        <div className="max-w-md w-full glass p-8 rounded-[2.5rem] border border-white/10 text-center space-y-6">
          <div className="w-16 h-16 bg-indigo-600/20 rounded-2xl flex items-center justify-center mx-auto text-indigo-500">
            <svg className="w-8 h-8" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 7a2 2 0 012 2m4 0a6 6 0 01-7.743 5.743L11 17H9v2H7v2H4a1 1 0 01-1-1v-2.586a1 1 0 01.293-.707l5.964-5.964A6 6 0 1121 9z" />
            </svg>
          </div>
          <div className="space-y-2">
            <h1 className="text-2xl font-bold text-white uppercase tracking-tighter italic">API Key Required</h1>
            <p className="text-zinc-400 text-sm">To use advanced features like Video Generation and Pro Image Design, you must select a paid Gemini API key.</p>
          </div>
          <div className="space-y-4">
            <button 
              onClick={handleOpenKeySelector}
              className="w-full py-4 bg-indigo-600 hover:bg-indigo-500 text-white font-black uppercase tracking-widest rounded-2xl shadow-lg shadow-indigo-600/20 transition-all active:scale-95"
            >
              Select API Key
            </button>
            <p className="text-[10px] text-zinc-500 uppercase tracking-widest">
              Requires a Google Cloud project with billing enabled. 
              <a href="https://ai.google.dev/gemini-api/docs/billing" target="_blank" rel="noopener noreferrer" className="text-indigo-400 hover:underline ml-1">Learn more</a>
            </p>
          </div>
        </div>
      </div>
    );
  }

  return (
    <>
      <Layout 
        credits={stats.credits} 
        currentPath={currentPath} 
        setPath={setCurrentPath}
        isDarkMode={isDarkMode}
        toggleTheme={toggleTheme}
        onOpenCredits={() => setIsCreditModalOpen(true)}
      >
        {renderPage()}
      </Layout>
      <CreditModal 
        isOpen={isCreditModalOpen} 
        onClose={() => setIsCreditModalOpen(false)} 
        onAddCredits={addCredits} 
      />
    </>
  );
};

export default App;
