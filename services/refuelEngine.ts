/**
 * Refuel Engine — Free credit top-up system (client-side, no payment needed)
 *
 * Features:
 * 1. Daily Check-In: claim free credits once per calendar day.
 *    Streak bonus — consecutive days increase the reward (up to day 7 reset to a loop).
 * 2. Referral Code: every user gets a short referral code. Sharing it with friends
 *    and entering their code grants bonus credits both ways (stored in Firestore
 *    when online, with localStorage offline fallback).
 * 3. Mission Rewards: earn credits by completing onboarding missions.
 *
 * All rewards are also persisted to the Firestore `users` doc under
 * `rewardsRefuel` (cloud source of truth) while keeping localStorage as
 * offline fallback — mirroring the app's existing stats sync pattern.
 */

const LS_KEY = 'lumina_refuel';

export interface RefuelState {
  lastCheckInDate: string; // yyyy-mm-dd local
  streak: number;
  totalEarned: number;
  referralCode: string; // this user's shareable code
  referredBy: string | null; // code that this user entered
  referralsGiven: number; // number of friends who entered this user's code
  redeemed: Record<string, boolean>; // mission ids already redeemed
  missions: Record<string, number>; // mission id -> claimed credits
}

export const DAILY_REWARD_TABLE: Record<number, number> = {
  1: 20,
  2: 25,
  3: 30,
  4: 40,
  5: 50,
  6: 75,
  7: 120, // weekly reset day — big reward
};

export const REFERRAL_REWARD = 75; // credits per side
export const REFERRAL_MAX_REDEEM = 20; // cap to prevent abuse

export const MISSIONS: Array<{
  id: string;
  title: string;
  titleMy: string;
  reward: number;
}> = [
  { id: 'first_transcription', title: 'Complete your first transcription', titleMy: 'ပထမဆုံး transcription အပြည့်အစုံ ပြီးအောင်', reward: 30 },
  { id: 'first_voiceover', title: 'Generate your first voiceover', titleMy: 'ပထမဆုံး voiceover ထုတ်ပါ', reward: 40 },
  { id: 'first_recap', title: 'Create your first movie recap', titleMy: 'ပထမဆုံး movie recap ဖန်တီးပါ', reward: 60 },
  { id: 'seven_day_streak', title: '7-day check-in streak', titleMy: 'နေ့တိုင်း ၇ ရက်ဆက်တိုက် check-in', reward: 150 },
  { id: 'share_referral', title: 'Share your referral code', titleMy: 'Referral code မျှဝေပါ', reward: 50 },
];

export const getRefuelState = (): RefuelState => {
  try {
    const raw = localStorage.getItem(LS_KEY);
    if (raw) return JSON.parse(raw);
  } catch {
    // fall through
  }
  const uidSuffix = (() => {
    try {
      const cached = localStorage.getItem('lumina_user_stats');
      return cached ? Math.abs(hashStr(cached)) % 10000 : Math.floor(Math.random() * 9000) + 1000;
    } catch {
      return Math.floor(Math.random() * 9000) + 1000;
    }
  })();
  const state: RefuelState = {
    lastCheckInDate: '',
    streak: 0,
    totalEarned: 0,
    referralCode: `LMN-${uidSuffix}`,
    referredBy: null,
    referralsGiven: 0,
    redeemed: {},
    missions: {},
  };
  saveRefuelState(state);
  return state;
};

export const saveRefuelState = (state: RefuelState): void => {
  try {
    localStorage.setItem(LS_KEY, JSON.stringify(state));
  } catch {
    // storage full or unavailable — ignore
  }
};

export const todayISO = (): string => new Date().toISOString().slice(0, 10);

export const getDailyReward = (nextStreak: number): number =>
  DAILY_REWARD_TABLE[nextStreak] ?? DAILY_REWARD_TABLE[7];

/**
 * Claim today's daily check-in. Returns the credits earned, or 0 if already claimed today.
 */
export const claimDailyCheckIn = (onAddCredits?: (amount: number) => void, onSyncFirestore?: (patch: Record<string, unknown>) => void): number => {
  const state = getRefuelState();
  const today = todayISO();
  if (state.lastCheckInDate === today) return 0;

  const isConsecutive = (() => {
    if (!state.lastCheckInDate) return true;
    const last = new Date(state.lastCheckInDate + 'T00:00:00');
    const now = new Date(today + 'T00:00:00');
    const diffDays = Math.round((now.getTime() - last.getTime()) / 86400000);
    return diffDays === 1 || diffDays === 0;
  })();

  const newStreak = (isConsecutive ? state.streak + 1 : 1) % 8 || 7; // 7-day loop
  const reward = getDailyReward(newStreak);

  state.lastCheckInDate = today;
  state.streak = newStreak;
  state.totalEarned += reward;
  saveRefuelState(state);

  if (onAddCredits) onAddCredits(reward);
  if (onSyncFirestore) {
    onSyncFirestore({
      creditsRefuelLastDate: today,
      creditsRefuelStreak: newStreak,
      creditsRefuelEarned: state.totalEarned,
      updatedAt: new Date().toISOString(),
    });
  }
  return reward;
};

/**
 * Enter a friend's referral code. Returns earned credits (this side) or 0 if invalid/already used.
 * The other side's reward is recorded for when they next sync (simplified model).
 */
export const redeemReferralCode = (
  code: string,
  onAddCredits?: (amount: number) => void,
  onSyncFirestore?: (patch: Record<string, unknown>) => void,
): number => {
  const state = getRefuelState();
  const normalized = code.trim().toUpperCase();
  if (!normalized || normalized === state.referralCode) return 0;
  if (state.referredBy) return 0; // only one referral per user
  if (state.referralsGiven >= REFERRAL_MAX_REDEEM) return 0;

  state.referredBy = normalized;
  state.totalEarned += REFERRAL_REWARD;
  saveRefuelState(state);

  if (onAddCredits) onAddCredits(REFERRAL_REWARD);
  if (onSyncFirestore) {
    onSyncFirestore({
      referredByCode: normalized,
      referralRedeemedAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    });
  }
  return REFERRAL_REWARD;
};

/**
 * Record that a friend used this user's referral code (called when the app
 * detects a `?ref=` URL param or the user manually logs it).
 */
export const recordReferralGiven = (
  onAddCredits?: (amount: number) => void,
  onSyncFirestore?: (patch: Record<string, unknown>) => void,
): number => {
  const state = getRefuelState();
  if (state.referralsGiven >= REFERRAL_MAX_REDEEM) return 0;
  state.referralsGiven += 1;
  state.totalEarned += REFERRAL_REWARD;
  saveRefuelState(state);

  if (onAddCredits) onAddCredits(REFERRAL_REWARD);
  if (onSyncFirestore) {
    onSyncFirestore({
      referralsGiven: state.referralsGiven,
      updatedAt: new Date().toISOString(),
    });
  }
  return REFERRAL_REWARD;
};

/** Claim a mission reward. Returns the reward or 0 if already redeemed. */
export const claimMission = (
  missionId: string,
  onAddCredits?: (amount: number) => void,
  onSyncFirestore?: (patch: Record<string, unknown>) => void,
): number => {
  const mission = MISSIONS.find(m => m.id === missionId);
  if (!mission) return 0;
  const state = getRefuelState();
  if (state.redeemed[missionId]) return 0;
  state.redeemed[missionId] = true;
  state.missions[missionId] = mission.reward;
  state.totalEarned += mission.reward;
  saveRefuelState(state);

  if (onAddCredits) onAddCredits(mission.reward);
  if (onSyncFirestore) {
    onSyncFirestore({
      redeemedMissions: Object.keys(state.redeemed),
      updatedAt: new Date().toISOString(),
    });
  }
  return mission.reward;
};

/** Simple string hasher for deterministic short referral codes. */
const hashStr = (s: string): number => {
  let hash = 0;
  for (let i = 0; i < s.length; i++) {
    hash = (hash * 31 + s.charCodeAt(i)) | 0;
  }
  return Math.abs(hash);
};
