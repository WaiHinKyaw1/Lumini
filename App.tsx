
import React, { useState, useEffect, lazy, Suspense } from 'react';
import Layout from './components/Layout';
import CreditModal from './components/CreditModal';
import RefuelEngine from './components/RefuelEngine';
import {
  claimMission,
  getRefuelState,
  recordReferralGiven,
  redeemReferralCode,
  REFERRAL_REWARD,
} from './services/refuelEngine';
import { AuthScreen } from './components/AuthScreen';
import { UserStats } from './types';
import { Toaster, toast } from 'react-hot-toast';
import { auth, db, OperationType, handleFirestoreError, testConnection } from './services/firebase';
import { onAuthStateChanged, signInWithPopup, GoogleAuthProvider, signOut } from 'firebase/auth';
import { doc, getDoc, setDoc, updateDoc, serverTimestamp, onSnapshot } from 'firebase/firestore';

// Performance: Lazy loading pages
const Dashboard = lazy(() => import('./pages/Dashboard'));
const Transcription = lazy(() => import('./pages/Transcription'));
const Translation = lazy(() => import('./pages/Translation'));
const Voiceover = lazy(() => import('./pages/Voiceover'));
const MovieRecap = lazy(() => import('./pages/MovieRecap'));
const VideoInsights = lazy(() => import('./pages/VideoInsights'));
const ThumbnailGen = lazy(() => import('./pages/ThumbnailGen'));
const SubtitleStudio = lazy(() => import('./pages/SubtitleStudio'));
const VideoStudio = lazy(() => import('./pages/VideoStudio'));
const Profile = lazy(() => import('./pages/Profile'));

const INITIAL_STATS: UserStats = {
  credits: 100,
  totalGenerated: 0
};

const getInitialStats = (): UserStats => {
  try {
    const cachedStats = localStorage.getItem('lumina_user_stats');
    if (cachedStats) {
      const parsed = JSON.parse(cachedStats);
      if (typeof parsed.credits === 'number' && typeof parsed.totalGenerated === 'number') {
        return parsed;
      }
    }
  } catch (err) {
    console.warn("Failed to read local stats fallback: ", err);
  }
  return INITIAL_STATS;
};

const App: React.FC = () => {
  const [stats, setStatsState] = useState<UserStats>(getInitialStats());
  const [hasApiKey, setHasApiKey] = useState(true);
  const [currentPath, setCurrentPath] = useState('dashboard');
  const [isDarkMode, setIsDarkMode] = useState(true);
  const [isCreditModalOpen, setIsCreditModalOpen] = useState(false);
  const [isRefuelOpen, setIsRefuelOpen] = useState(false);
  const [user, setUser] = useState<any>(null);

  const [manualKey, setManualKey] = useState('');

  // Local storage synchronized wrapper
  const setStats = (newStats: UserStats | ((prev: UserStats) => UserStats)) => {
    setStatsState(prev => {
      const updated = typeof newStats === 'function' ? newStats(prev) : newStats;
      try {
        localStorage.setItem('lumina_user_stats', JSON.stringify(updated));
      } catch (err) {
        // Ignore
      }
      return updated;
    });
  };

  // Connection diagnostics validation upon startup
  useEffect(() => {
    testConnection();
  }, []);

  // Refuel Engine: handle ?ref= URL param (friend shared their code) + mission auto-detection
  useEffect(() => {
    if (!user) return;
    try {
      const params = new URLSearchParams(window.location.search);
      const refCode = params.get('ref');
      const refuel = getRefuelState();
      if (refCode && !refuel.referredBy && refCode.trim().toUpperCase() !== refuel.referralCode) {
        const earned = redeemReferralCode(refCode.trim(), addCredits, firestoreRefuelSync);
        if (earned > 0) {
          toast.success(`Referral code သုံးလို့ +${REFERRAL_REWARD} credits ရရှိပါပြီ!`);
        }
      }
      // Clean URL after processing
      if (refCode) {
        const cleanUrl = `${window.location.pathname}${window.location.hash}`;
        window.history.replaceState({}, document.title, cleanUrl);
      }
    } catch {
      // ignore
    }
  }, [user]);

  // Mission auto-detection — when visiting modules, claim related mission rewards
  useEffect(() => {
    if (!user) return;
    const missionMap: Record<string, string> = {
      transcription: 'first_transcription',
      voiceover: 'first_voiceover',
      recap: 'first_recap',
    };
    const missionId = missionMap[currentPath];
    if (!missionId) return;
    const state = getRefuelState();
    if (!state.redeemed[missionId]) {
      const earned = claimMission(missionId, addCredits, firestoreRefuelSync);
      if (earned > 0) {
        toast.success(`Mission ပြီး! +${earned} credits ရရှိပါပြီ`);
      }
    }
  }, [currentPath, user]);

  const firestoreRefuelSync = (patch: Record<string, unknown>) => {
    if (!auth.currentUser) return;
    updateDoc(doc(db, 'users', auth.currentUser.uid), patch).catch((error) => {
      handleFirestoreError(error, OperationType.UPDATE, `users/${auth.currentUser?.uid}`);
    });
  };

  // Firebase Authentication Listener
  useEffect(() => {
    const unsubscribeAuth = onAuthStateChanged(auth, (currentUser) => {
      setUser(currentUser);
    });
    return () => unsubscribeAuth();
  }, []);

  // Real-time Profile & Stats Synchronization Listener
  useEffect(() => {
    if (!user) {
      setStats(INITIAL_STATS);
      return;
    }

    let isMounted = true;
    let unsubscribeSnapshot: (() => void) | null = null;

    const syncUserData = async () => {
      const userDocRef = doc(db, 'users', user.uid);
      
      try {
        const docSnap = await getDoc(userDocRef);
        if (!docSnap.exists() && isMounted) {
          // First time user registration - bootstrap initial persistent stats
          await setDoc(userDocRef, {
            id: user.uid,
            email: user.email || '',
            credits: INITIAL_STATS.credits,
            totalGenerated: INITIAL_STATS.totalGenerated,
            createdAt: serverTimestamp(),
            updatedAt: serverTimestamp()
          });
          toast.success('Successfully registered on Cloud Firestore!');
        }
      } catch (error: any) {
        const isOffline = error?.code === 'unavailable' || String(error).toLowerCase().includes('offline');
        if (isOffline) {
          console.warn("Connection offline: utilizing local fallback.");
          toast('Running in local mode. Stats are cached locally.', { icon: '📡' });
        }
        if (isMounted) {
          handleFirestoreError(error, OperationType.CREATE, `users/${user.uid}`);
        }
      }

      if (!isMounted) return;

      // Maintain responsive real-time state synchronization via Firestore Stream
      unsubscribeSnapshot = onSnapshot(userDocRef, (snapshot) => {
        if (snapshot.exists() && isMounted) {
          const data = snapshot.data();
          setStats({
            credits: data.credits ?? INITIAL_STATS.credits,
            totalGenerated: data.totalGenerated ?? INITIAL_STATS.totalGenerated
          });
        }
      }, (error) => {
        const isOffline = (error as any)?.code === 'unavailable' || String(error).toLowerCase().includes('offline');
        if (isOffline) {
          console.warn("onSnapshot disconnected context in offline mode.");
          return;
        }
        // Only report error if user is still logged in to avoid race condition on logout
        if (isMounted && auth.currentUser) {
          handleFirestoreError(error, OperationType.GET, `users/${user.uid}`);
        }
      });
    };

    syncUserData();

    return () => {
      isMounted = false;
      if (unsubscribeSnapshot) {
        unsubscribeSnapshot();
      }
    };
  }, [user]);

  // API Key Check
  useEffect(() => {
    const checkKey = async () => {
      // Check for AI Studio key selector first
      const hasKey = await (window as any).aistudio?.hasSelectedApiKey?.();
      if (hasKey) {
        setHasApiKey(true);
      } else {
        // Fallback to checking environment variable or localStorage for deployed apps
        let envKey = '';
        try {
          envKey = localStorage.getItem('VITE_GEMINI_API_KEY') || (import.meta.env.VITE_GEMINI_API_KEY) || (typeof process !== 'undefined' ? (process.env.GEMINI_API_KEY || process.env.API_KEY) : '');
        } catch (e) {
          // Ignore
        }
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

  const handleSaveManualKey = () => {
    if (!manualKey.trim()) {
      toast.error("Please enter a valid Gemini API Key.");
      return;
    }
    try {
      localStorage.setItem('VITE_GEMINI_API_KEY', manualKey.trim());
      setHasApiKey(true);
      toast.success("API key stored successfully! Module activated.");
    } catch (e) {
      toast.error("Failed to save the key locally.");
    }
  };

  const handleOpenKeySelector = async () => {
    if ((window as any).aistudio?.openSelectKey) {
      await (window as any).aistudio.openSelectKey();
      const hasKey = await (window as any).aistudio?.hasSelectedApiKey?.();
      setHasApiKey(!!hasKey);
    } else {
      toast.error("Google AI Studio environment not detected here. Please use the manual input box below.");
    }
  };

  const handleLoginGoogle = async () => {
    const provider = new GoogleAuthProvider();
    try {
      await signInWithPopup(auth, provider);
      toast.success('Welcome back to Lumina Studio!');
    } catch (error: any) {
      toast.error(error.message || 'Authentication failed.');
    }
  };

  const handleLogout = async () => {
    try {
      await signOut(auth);
      toast.success('Signed out successfully.');
    } catch (error: any) {
      toast.error(error.message || 'Logout failed.');
    }
  };

  const spendCredits = (amount: number): boolean => {
    if (stats.credits < amount) {
      setIsCreditModalOpen(true);
      return false;
    }
    
    const newCredits = stats.credits - amount;
    const newTotal = stats.totalGenerated + 1;
    
    // Quick optimistic interface sync
    setStats({ credits: newCredits, totalGenerated: newTotal });

    if (auth.currentUser) {
      const userDocRef = doc(db, 'users', auth.currentUser.uid);
      updateDoc(userDocRef, {
        credits: newCredits,
        totalGenerated: newTotal,
        updatedAt: serverTimestamp()
      }).catch((error) => {
        handleFirestoreError(error, OperationType.UPDATE, `users/${auth.currentUser?.uid}`);
      });
    }
    
    return true;
  };

  const addCredits = (amount: number) => {
    const newCredits = stats.credits + amount;
    setStats(prev => ({ ...prev, credits: newCredits }));

    if (auth.currentUser) {
      const userDocRef = doc(db, 'users', auth.currentUser.uid);
      updateDoc(userDocRef, {
        credits: newCredits,
        updatedAt: serverTimestamp()
      }).catch((error) => {
        handleFirestoreError(error, OperationType.UPDATE, `users/${auth.currentUser?.uid}`);
      });
    }
  };

  const renderPage = () => {
    // If not authenticated, require registering or logging in first
    if (!user) {
      return <AuthScreen onLoginGoogle={handleLoginGoogle} />;
    }

    // If no API key, only allow Dashboard and Profile
    if (!hasApiKey && currentPath !== 'dashboard' && currentPath !== 'profile' && currentPath !== 'brandkit') {
      const isAiStudioEnv = typeof (window as any).aistudio !== 'undefined';
      return (
        <div className="flex items-center justify-center h-[60vh]">
          <div className="max-w-md w-full glass p-8 rounded-[2.5rem] border border-white/10 text-center space-y-6">
            <div className="w-16 h-16 bg-accent/20 rounded-2xl flex items-center justify-center mx-auto text-accent">
              <svg className="w-8 h-8" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 7a2 2 0 012 2m4 0a6 6 0 01-7.743 5.743L11 17H9v2H7v2H4a1 1 0 01-1-1v-2.586a1 1 0 01.293-.707l5.964-5.964A6 6 0 1121 9z" />
              </svg>
            </div>
            <div className="space-y-2">
              <h1 className="text-2xl font-bold text-white uppercase tracking-tighter">Gemini API Key</h1>
              <p className="text-zinc-400 text-xs leading-relaxed px-2">
                {isAiStudioEnv 
                  ? "To run this application, select your Gemini API key from Google AI Studio."
                  : "To run your deployed app, enter your Gemini API key below. Your key is stored securely in your local browser storage."}
              </p>
            </div>

            {isAiStudioEnv ? (
              <button 
                onClick={handleOpenKeySelector}
                className="w-full py-4 bg-accent hover:bg-accent-hover text-white font-black uppercase tracking-widest rounded-2xl shadow-lg shadow-accent/20 transition-all active:scale-95"
              >
                Select API Key
              </button>
            ) : (
              <div className="space-y-3 pt-2 text-left">
                <label className="text-[10px] font-bold text-zinc-400 uppercase tracking-wider block ml-1 text-center">PASTE YOUR GEMINI API KEY</label>
                <div className="relative">
                  <input
                    type="password"
                    value={manualKey}
                    onChange={(e) => setManualKey(e.target.value)}
                    placeholder="AIzaSy..."
                    className="w-full px-4 py-3 bg-zinc-950/60 border border-white/15 focus:border-accent rounded-xl text-white text-xs outline-none focus:ring-1 focus:ring-accent font-mono text-center"
                  />
                </div>
                <button 
                  onClick={handleSaveManualKey}
                  className="w-full py-3 bg-accent hover:bg-accent-hover text-white font-black uppercase tracking-widest text-[10px] rounded-xl shadow-lg shadow-accent/10 transition-all active:scale-95 mt-2"
                >
                  Activate & Save Key
                </button>
                <p className="text-[9px] text-zinc-500 text-center leading-relaxed mt-2">
                  Key saved locally in your own browser's localStorage. Alternatively, set <code className="text-zinc-450 font-mono bg-zinc-900 border border-white/5 p-0.5 rounded">VITE_GEMINI_API_KEY</code> on Vercel dashboard.
                </p>
              </div>
            )}
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
            case 'video': return <VideoStudio onSpendCredits={spendCredits} />;
            case 'profile': return <Profile stats={stats} onApiKeyChange={(hasKey) => setHasApiKey(hasKey)} />;
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
        onOpenRefuel={() => setIsRefuelOpen(true)}
        user={user}
        onLoginGoogle={handleLoginGoogle}
        onLogout={handleLogout}
      >
        <main role="main" className="min-h-[calc(100vh-56px)]">{renderPage()}</main>
      </Layout>
      <CreditModal 
        isOpen={isCreditModalOpen} 
        onClose={() => setIsCreditModalOpen(false)} 
        onAddCredits={addCredits} 
      />
      <RefuelEngine
        isOpen={isRefuelOpen}
        onClose={() => setIsRefuelOpen(false)}
        onAddCredits={addCredits}
        onSyncFirestore={firestoreRefuelSync}
      />
    </>
  );
};

export default App;
