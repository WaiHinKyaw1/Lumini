
import React, { useState, useEffect, lazy, Suspense } from 'react';
import Layout from './components/Layout';
import CreditModal from './components/CreditModal';
import RefuelEngine from './components/RefuelEngine';
import {
  claimMission,
  getRefuelState,
  redeemReferralCode,
  REFERRAL_REWARD,
} from './services/refuelEngine';
import { AuthScreen } from './components/AuthScreen';
import { UserStats, FirestoreUserDoc } from './types';
import { Toaster, toast } from 'react-hot-toast';
import { auth, db, OperationType, handleFirestoreError, testConnection } from './services/firebase';
import { spendCreditsOp, addCreditsOp } from './services/firestoreOps';
import { STORAGE_KEYS, readJson, writeJson } from './services/storage';
import { ErrorBoundary } from './components/ErrorBoundary';
import { LoadingSpinner } from './components/LoadingSpinner';
import { MISSION_ROUTE_MAP } from './services/refuelEngine';
import { onAuthStateChanged, signInWithPopup, GoogleAuthProvider, signOut } from 'firebase/auth';
import type { User as FirebaseUser } from 'firebase/auth';
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
  const cachedStats = readJson<UserStats | null>(STORAGE_KEYS.userStats, null);
  if (
    cachedStats &&
    typeof cachedStats.credits === 'number' &&
    typeof cachedStats.totalGenerated === 'number'
  ) {
    return cachedStats;
  }
  return INITIAL_STATS;
};

const App: React.FC = () => {
  const [stats, setStatsState] = useState<UserStats>(getInitialStats());
  const [currentPath, setCurrentPath] = useState('dashboard');
  const [isDarkMode, setIsDarkMode] = useState(true);
  const [isCreditModalOpen, setIsCreditModalOpen] = useState(false);
  const [isRefuelOpen, setIsRefuelOpen] = useState(false);
  const [user, setUser] = useState<FirebaseUser | null>(null);


  // Local storage synchronized wrapper (centralized via services/storage.ts)
  const setStats = (newStats: UserStats | ((prev: UserStats) => UserStats)) => {
    setStatsState(prev => {
      const updated = typeof newStats === 'function' ? newStats(prev) : newStats;
      writeJson(STORAGE_KEYS.userStats, updated);
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
      } catch (error) {
        const isOffline = (error as { code?: string })?.code === 'unavailable' || String(error).toLowerCase().includes('offline');
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
          const data = snapshot.data() as FirestoreUserDoc;
          setStats({
            credits: typeof data.credits === 'number' ? data.credits : INITIAL_STATS.credits,
            totalGenerated: typeof data.totalGenerated === 'number' ? data.totalGenerated : INITIAL_STATS.totalGenerated
          });
        }
      }, (error) => {
        const isOffline = (error as { code?: string })?.code === 'unavailable' || String(error).toLowerCase().includes('offline');
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

  // Theme Toggle Logic (persisted across page reloads)
  useEffect(() => {
    const html = document.documentElement;
    if (isDarkMode) {
      html.classList.add('dark');
    } else {
      html.classList.remove('dark');
    }
    writeJson('lumina_theme_dark', isDarkMode);
  }, [isDarkMode]);

  const toggleTheme = () => setIsDarkMode((prev) => !prev);

  const handleLoginGoogle = async () => {
    const provider = new GoogleAuthProvider();
    try {
      await signInWithPopup(auth, provider);
      toast.success('Welcome back to Lumina Studio!');
    } catch (error: unknown) {
      toast.error((error as { message?: string })?.message || 'Authentication failed.');
    }
  };

  const handleLogout = async () => {
    try {
      await signOut(auth);
      toast.success('Signed out successfully.');
    } catch (error: unknown) {
      toast.error((error as { message?: string })?.message || 'Logout failed.');
    }
  };

  const spendCredits = (amount: number): boolean => {
    const result = spendCreditsOp(stats.credits, stats.totalGenerated, amount);
    if (!result) {
      setIsCreditModalOpen(true);
      return false;
    }
    // Quick optimistic interface sync (Firestore reconciles later via onSnapshot)
    setStats(result);
    return true;
  };

  const addCredits = (amount: number) => {
    const result = addCreditsOp(stats.credits, amount);
    setStats((prev) => ({ ...prev, ...result }));
  };

  const renderPage = () => {
    // If not authenticated, require registering or logging in first
    if (!user) {
      return <AuthScreen onLoginGoogle={handleLoginGoogle} />;
    }

    return (
      <ErrorBoundary moduleName="Lumini">
      <Suspense fallback={<div className="flex min-h-[calc(100vh-56px)] items-center justify-center"><LoadingSpinner size="lg" showLabel={false} /></div>}>
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
            case 'profile': return <Profile stats={stats} isDarkMode={isDarkMode} onToggleTheme={toggleTheme} onLogout={handleLogout} />;
            default: return <Dashboard onAction={setCurrentPath} stats={stats} onOpenCredits={() => setIsCreditModalOpen(true)} />;
          }
        })()}
      </Suspense>
      </ErrorBoundary>
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
        <main role="main" className="app-main min-h-[calc(100vh-56px)]">{renderPage()}</main>
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
