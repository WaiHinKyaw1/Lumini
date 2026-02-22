
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
import { UserStats, GenerationResult, ContentType } from './types';
import { db } from './services/db';

const INITIAL_STATS: UserStats = {
  credits: 100,
  totalGenerated: 0,
  history: []
};

const App: React.FC = () => {
  const [stats, setStats] = useState<UserStats>(INITIAL_STATS);
  const [userId, setUserId] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  
  const [currentPath, setCurrentPath] = useState('dashboard');
  const [isDarkMode, setIsDarkMode] = useState(true);
  const [isCreditModalOpen, setIsCreditModalOpen] = useState(false);

  // Initialize User and Load Data from Supabase
  useEffect(() => {
    const initData = async () => {
      let currentId = localStorage.getItem('lumina_user_id');
      if (!currentId) {
        currentId = crypto.randomUUID();
        localStorage.setItem('lumina_user_id', currentId);
      }
      setUserId(currentId);

      // Check if user exists in DB
      let { data: user, error } = await db.getUser(currentId);
      
      if (error || !user) {
        // Create new user if not found
        const res = await db.createUser(currentId);
        user = res.data;
      }

      if (user) {
        const { data: history } = await db.getHistory(currentId);
        setStats({
          credits: user.credits,
          totalGenerated: user.total_generated,
          history: history || []
        });
      }
      setIsLoading(false);
    };

    initData();
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

  const spendCredits = (amount: number): boolean => {
    if (stats.credits >= amount) {
      const newCredits = stats.credits - amount;
      const newTotal = stats.totalGenerated + 1;
      
      // Optimistic Update
      setStats(prev => ({
        ...prev,
        credits: newCredits,
        totalGenerated: newTotal
      }));

      // Async DB Update
      if (userId) {
        db.updateUser(userId, newCredits, newTotal);
      }
      return true;
    }
    setIsCreditModalOpen(true);
    return false;
  };

  const saveResult = (result: Omit<GenerationResult, 'id' | 'timestamp'>) => {
    const newEntry: GenerationResult = {
      ...result,
      id: Math.random().toString(36).substr(2, 9),
      timestamp: Date.now()
    };

    // Optimistic Update
    setStats(prev => ({
      ...prev,
      history: [newEntry, ...prev.history].slice(0, 50)
    }));

    // Async DB Update
    if (userId) {
      db.addHistory(userId, newEntry);
      // Ensure stats are synced (totalGenerated was already incremented in spendCredits)
      db.updateUser(userId, stats.credits, stats.totalGenerated); 
    }
  };

  const deleteResult = (id: string) => {
    setStats(prev => ({
      ...prev,
      history: prev.history.filter(item => item.id !== id)
    }));

    if (userId) {
      db.deleteHistory(id);
    }
  };

  const addCredits = (amount: number) => {
    const newCredits = stats.credits + amount;
    
    setStats(prev => ({
      ...prev,
      credits: newCredits
    }));

    if (userId) {
      db.updateUser(userId, newCredits, stats.totalGenerated);
    }
  };

  // Helper to filter history for pages
  const getHistory = (type: ContentType) => stats.history.filter(h => h.type === type);

  const renderPage = () => {
    switch (currentPath) {
      case 'dashboard':
        return <Dashboard onAction={setCurrentPath} stats={stats} onOpenCredits={() => setIsCreditModalOpen(true)} />;
      case 'subtitle':
        return <SubtitleStudio onSpendCredits={spendCredits} onSaveResult={saveResult} history={getHistory(ContentType.SUBTITLE)} onDelete={deleteResult} />;
      case 'insights':
        return <VideoInsights onSpendCredits={spendCredits} onSaveResult={saveResult} history={getHistory(ContentType.VIDEO_INSIGHTS)} onDelete={deleteResult} />;
      case 'transcription':
        return <Transcription onSpendCredits={spendCredits} onSaveResult={saveResult} history={getHistory(ContentType.TRANSCRIPTION)} onDelete={deleteResult} />;
      case 'translation':
        return <Translation onSpendCredits={spendCredits} onSaveResult={saveResult} history={getHistory(ContentType.TRANSLATION)} onDelete={deleteResult} />;
      case 'thumbnail':
        return <ThumbnailGen onSpendCredits={spendCredits} onSaveResult={saveResult} history={getHistory(ContentType.THUMBNAIL)} onDelete={deleteResult} />;
      case 'voiceover':
        return <Voiceover onSpendCredits={spendCredits} onSaveResult={saveResult} history={getHistory(ContentType.VOICEOVER)} onDelete={deleteResult} />;
      case 'speech':
        return <SpeechMaster onSpendCredits={spendCredits} onSaveResult={saveResult} history={getHistory(ContentType.SPEECH)} onDelete={deleteResult} />;
      case 'recap':
        return <MovieRecap onSpendCredits={spendCredits} onSaveResult={saveResult} history={getHistory(ContentType.MOVIE_RECAP)} onDelete={deleteResult} />;
      default:
        return <Dashboard onAction={setCurrentPath} stats={stats} onOpenCredits={() => setIsCreditModalOpen(true)} />;
    }
  };

  if (isLoading) {
    return (
      <div className="min-h-screen bg-[#09090b] flex items-center justify-center">
        <div className="flex flex-col items-center gap-4">
          <div className="w-12 h-12 border-4 border-indigo-600/30 border-t-indigo-600 rounded-full animate-spin"></div>
          <p className="text-zinc-500 text-xs font-black uppercase tracking-widest">Connecting to Database...</p>
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
