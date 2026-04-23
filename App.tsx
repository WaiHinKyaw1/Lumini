
import React, { useState, useEffect, lazy, Suspense } from 'react';
import Layout from './components/Layout';
import CreditModal from './components/CreditModal';
import { UserStats } from './types';
import { Toaster } from 'react-hot-toast';

// Performance: Lazy loading pages
const Dashboard = lazy(() => import('./pages/Dashboard'));
const Transcription = lazy(() => import('./pages/Transcription'));
const Translation = lazy(() => import('./pages/Translation'));
const Voiceover = lazy(() => import('./pages/Voiceover'));
const MovieRecap = lazy(() => import('./pages/MovieRecap'));
const VideoInsights = lazy(() => import('./pages/VideoInsights'));
const ThumbnailGen = lazy(() => import('./pages/ThumbnailGen'));
const SubtitleStudio = lazy(() => import('./pages/SubtitleStudio'));
const BrandKit = lazy(() => import('./pages/BrandKit'));
const Profile = lazy(() => import('./pages/Profile'));

const INITIAL_STATS: UserStats = {
  credits: 100,
  totalGenerated: 0
};

const App: React.FC = () => {
  const [session, setSession] = useState<any>({
    user: {
      email: 'creator@lumina.studio',
      id: 'lumina-creator',
      user_metadata: { full_name: 'Lumina Creator' }
    }
  });
  const [stats, setStats] = useState<UserStats>(INITIAL_STATS);
  const [hasApiKey, setHasApiKey] = useState(true);
  const [currentPath, setCurrentPath] = useState('dashboard');
  const [isDarkMode, setIsDarkMode] = useState(true);
  const [isCreditModalOpen, setIsCreditModalOpen] = useState(false);

  // API Key Check
  useEffect(() => {
    const checkKey = async () => {
      // Check for AI Studio key selector first
      const hasKey = await (window as any).aistudio?.hasSelectedApiKey?.();
      if (hasKey) {
        setHasApiKey(true);
      } else {
        // Fallback to checking environment variable for deployed apps
        const envKey = process.env.GEMINI_API_KEY || process.env.API_KEY;
        setHasApiKey(!!envKey);
      }
    };
    checkKey();
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
    const hasKey = await (window as any).aistudio?.hasSelectedApiKey?.();
    setHasApiKey(!!hasKey);
  };

  const spendCredits = (amount: number): boolean => {
    if (stats.credits < amount) {
      setIsCreditModalOpen(true);
      return false;
    }
    
    setStats(prev => {
      if (prev.credits < amount) return prev;
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
    // If no API key, only allow Dashboard and Profile
    if (!hasApiKey && currentPath !== 'dashboard' && currentPath !== 'profile' && currentPath !== 'brandkit') {
      return (
        <div className="flex items-center justify-center h-[60vh]">
          <div className="max-w-md w-full glass p-8 rounded-[2.5rem] border border-white/10 text-center space-y-6">
            <div className="w-16 h-16 bg-accent/20 rounded-2xl flex items-center justify-center mx-auto text-accent">
              <svg className="w-8 h-8" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 7a2 2 0 012 2m4 0a6 6 0 01-7.743 5.743L11 17H9v2H7v2H4a1 1 0 01-1-1v-2.586a1 1 0 01.293-.707l5.964-5.964A6 6 0 1121 9z" />
              </svg>
            </div>
            <div className="space-y-2">
              <h1 className="text-2xl font-bold text-white uppercase tracking-tighter">API Key Required</h1>
              <p className="text-zinc-400 text-sm">To use this AI tool, you must select a paid Gemini API key.</p>
            </div>
            <button 
              onClick={handleOpenKeySelector}
              className="w-full py-4 bg-accent hover:bg-accent-hover text-white font-black uppercase tracking-widest rounded-2xl shadow-lg shadow-accent/20 transition-all active:scale-95"
            >
              Select API Key
            </button>
          </div>
        </div>
      );
    }

    return (
      <Suspense fallback={
        <div className="flex items-center justify-center h-[60vh]">
          <div className="w-8 h-8 border-4 border-accent border-t-transparent rounded-full animate-spin"></div>
        </div>
      }>
        {(() => {
          switch (currentPath) {
            case 'dashboard': return <Dashboard onAction={setCurrentPath} stats={stats} onOpenCredits={() => setIsCreditModalOpen(true)} />;
            case 'subtitle': return <SubtitleStudio onSpendCredits={spendCredits} />;
            case 'insights': return <VideoInsights onSpendCredits={spendCredits} />;
            case 'transcription': return <Transcription onSpendCredits={spendCredits} />;
            case 'translation': return <Translation onSpendCredits={spendCredits} />;
            case 'thumbnail': return <ThumbnailGen onSpendCredits={spendCredits} />;
            case 'voiceover': return <Voiceover onSpendCredits={spendCredits} />;
            case 'recap': return <MovieRecap onSpendCredits={spendCredits} />;
            case 'brandkit': return <BrandKit />;
            case 'profile': return <Profile session={session} />;
            default: return <Dashboard onAction={setCurrentPath} stats={stats} onOpenCredits={() => setIsCreditModalOpen(true)} />;
          }
        })()}
      </Suspense>
    );
  };

  return (
    <>
      <Toaster position="top-right" />
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
