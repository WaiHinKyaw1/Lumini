import React, { useState, useMemo } from 'react';
import {
  claimDailyCheckIn,
  claimMission,
  getRefuelState,
  recordReferralGiven,
  redeemReferralCode,
  REFERRAL_REWARD,
  DAILY_REWARD_TABLE,
  MISSIONS,
  todayISO,
} from '../services/refuelEngine';

interface RefuelEngineProps {
  isOpen: boolean;
  onClose: () => void;
  onAddCredits: (amount: number) => void;
  onSyncFirestore?: (patch: Record<string, unknown>) => void;
}

/** Tiny toast for self-contained notifications */
const toast = (msg: string) => {
  if (typeof (window as any).toaster === 'function') {
    (window as any).toaster(msg);
  } else {
    console.info('[RefuelEngine]', msg);
  }
};

const RefuelEngine: React.FC<RefuelEngineProps> = ({ isOpen, onClose, onAddCredits, onSyncFirestore }) => {
  const [state, setState] = useState(() => getRefuelState());
  const [refCode, setRefCode] = useState('');
  const [refStatus, setRefStatus] = useState('');
  const claimedToday = state.lastCheckInDate === todayISO();

  const refresh = () => setState(getRefuelState());

  const streakDays = useMemo(() => [1, 2, 3, 4, 5, 6, 7], []);

  const doClaim = () => {
    const earned = claimDailyCheckIn(onAddCredits, onSyncFirestore);
    refresh();
    if (earned > 0) {
      toast(`အောင်မြင်ပါပြီ! +${earned} credits ရရှိပါပြီ`);
    } else {
      toast('ယနေ့ check-in ပြီးသားပါ — မနက်ဖြန် ပြန်လာပါ');
    }
  };

  const doRedeemReferral = () => {
    const code = refCode.trim();
    if (code.length < 5) {
      setRefStatus('မှန်ကန်သော referral code ထည့်ပါ (ဥပမာ LMN-1234)');
      return;
    }
    const earned = redeemReferralCode(code, onAddCredits, onSyncFirestore);
    refresh();
    if (earned > 0) {
      setRefStatus(`အောင်မြင်ပါပြီ! +${REFERRAL_REWARD} credits ရရှိပါပြီ`);
      setRefCode('');
    } else if (state.referredBy) {
      setRefStatus('Referral code တစ်ခုတည်းသာ သုံးလို့ရပါတယ်');
    } else {
      setRefStatus('မှန်ကန်တဲ့ code မဖြစ်ပါ (သို့) ကိုယ့် code ကို ထည့်မိပါတယ်');
    }
  };

  const doCopyReferral = async () => {
    try {
      const text = `Lumini AI Studio ကို ကျွန်တော်တို့နဲ့အတူ သုံးကြည့်ပါ! မင်း referral code: ${state.referralCode} — ဒီ code ကိုသုံးရင် ${REFERRAL_REWARD} credits အခမဲ့ရမယ်။`;
      await navigator.clipboard.writeText(text);
      toast('Referral link copy လုပ်ပြီးပါပြီ — သူငယ်ချင်းကို ပို့ပေးလိုက်ပါ!');
    } catch {
      toast(`သင့် code: ${state.referralCode} — မျှဝေပေးပါ`);
    }
    refresh();
  };

  const doShare = async () => {
    if (navigator.share) {
      try {
        await navigator.share({
          title: 'Lumini AI Studio',
          text: `Lumini AI Studio ကို သုံးကြည့်ပါ! မင်း referral code: ${state.referralCode}`,
          url: `https://lumini-app.vercel.app/?ref=${encodeURIComponent(state.referralCode)}`,
        });
      } catch {
        // user dismissed — ignore
      }
    } else {
      await doCopyReferral();
    }
  };

  const doCheckReferralGiven = () => {
    // Simulated friend entry: user confirms a friend used their code
    const earned = recordReferralGiven(onAddCredits, onSyncFirestore);
    refresh();
    if (earned > 0) {
      toast(`သူငယ်ချင်း +${REFERRAL_REWARD} credits ရပြီ — သင့်ထံလည်း +${REFERRAL_REWARD} ရပါပြီ!`);
    } else {
      toast('Referral limit ရောက်ပြီ (သို့) မရနိုင်ပါ');
    }
  };

  const doClaimMission = (id: string) => {
    const earned = claimMission(id, onAddCredits, onSyncFirestore);
    refresh();
    if (earned > 0) {
      toast(`Mission ပြီးပါပြီ! +${earned} credits`);
    }
  };

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-[110] flex items-center justify-center p-4 bg-slate-950/60 backdrop-blur-sm animate-in fade-in duration-300">
      <div className="absolute inset-0" onClick={onClose} />
      <div className="bg-white dark:bg-zinc-900 w-full max-w-2xl rounded-2xl border border-slate-200 dark:border-zinc-800 shadow-2xl overflow-hidden relative animate-in zoom-in-95 duration-300 max-h-[88vh] flex flex-col">
        <div className="p-6 border-b border-slate-200 dark:border-zinc-800 flex justify-between items-center">
          <div>
            <h2 className="text-xl font-bold text-slate-900 dark:text-white flex items-center gap-2">
              <svg className="w-6 h-6 text-orange-500" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M17.657 18.657A8 8 0 016.343 7.343S7 9 9 10c0-2 .5-5 2.986-7C14 5 16.09 5.777 17.656 7.343A7.975 7.975 0 0120 13a7.975 7.975 0 01-2.343 5.657z" />
              </svg>
              Refuel Engine
            </h2>
            <p className="text-xs text-slate-500 dark:text-zinc-400 mt-1">ငွေမပေးဘဲ credits ပြန်ရအောင် — နေ့စဉ် check-in + referral + missions</p>
          </div>
          <button onClick={onClose} className="p-2 rounded-full hover:bg-slate-100 dark:hover:bg-zinc-800 text-slate-500 transition-colors">
            <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" /></svg>
          </button>
        </div>

        <div className="overflow-y-auto p-6 space-y-6">
          {/* Daily Check-In */}
          <section>
            <div className="flex items-center justify-between mb-3">
              <h3 className="text-sm font-bold text-slate-700 dark:text-zinc-200 uppercase tracking-wider">နေ့စဉ် Check-In</h3>
              <span className="text-xs font-semibold text-orange-500 bg-orange-50 dark:bg-orange-500/10 px-2 py-1 rounded-full">🔥 {state.streak} ရက် streak</span>
            </div>
            <div className="grid grid-cols-7 gap-1.5 mb-3">
              {streakDays.map(d => {
                const done = state.streak >= d && d <= (state.lastCheckInDate === todayISO() ? state.streak : state.streak);
                const isToday = d === (state.streak % 8 || 7);
                return (
                  <div
                    key={d}
                    className={`rounded-lg py-2 text-center border transition-all ${
                      done
                        ? 'bg-gradient-to-b from-orange-400 to-orange-600 border-orange-500 text-white'
                        : isToday
                        ? 'bg-orange-50 dark:bg-orange-500/10 border-orange-300 dark:border-orange-500/40 text-orange-600 dark:text-orange-300'
                        : 'bg-slate-50 dark:bg-zinc-800 border-slate-200 dark:border-zinc-700 text-slate-400 dark:text-zinc-500'
                    }`}
                  >
                    <div className="text-[10px] font-bold">Day {d}</div>
                    <div className="text-xs font-black mt-0.5">+{DAILY_REWARD_TABLE[d]}</div>
                  </div>
                );
              })}
            </div>
            <button
              onClick={doClaim}
              disabled={claimedToday}
              className={`w-full py-3 rounded-xl text-sm font-bold transition-all ${
                claimedToday
                  ? 'bg-slate-100 dark:bg-zinc-800 text-slate-400 dark:text-zinc-500 cursor-not-allowed'
                  : 'bg-gradient-to-r from-orange-500 to-red-500 text-white hover:shadow-lg hover:shadow-orange-500/25 active:scale-[0.98]'
              }`}
            >
              {claimedToday ? `✓ ယနေ့ +${DAILY_REWARD_TABLE[state.streak]} ရပြီးပါပြီ — မနက်ဖြန် ပြန်လာပါ` : 'နေ့စဉ် Free Credits Claim လုပ်မယ်'}
            </button>
          </section>

          {/* Referral */}
          <section>
            <h3 className="text-sm font-bold text-slate-700 dark:text-zinc-200 uppercase tracking-wider mb-3">Referral — သူငယ်ချင်းခေါ် +${REFERRAL_REWARD} / တစ်ဖက်စီ</h3>
            <div className="flex items-center gap-2 bg-slate-50 dark:bg-zinc-800 rounded-xl p-3 mb-3">
              <div className="flex-1">
                <div className="text-[10px] text-slate-500 dark:text-zinc-400 uppercase tracking-wider mb-0.5">သင့် Referral Code</div>
                <div className="font-mono font-black text-lg text-slate-900 dark:text-white tracking-wide">{state.referralCode}</div>
              </div>
              <div className="flex flex-col gap-1.5">
                <button onClick={doShare} className="px-3 py-1.5 rounded-lg bg-orange-500 text-white text-xs font-bold hover:bg-orange-600 transition-colors">မျှဝေမယ်</button>
                <button onClick={doCopyReferral} className="px-3 py-1.5 rounded-lg border border-slate-300 dark:border-zinc-600 text-slate-600 dark:text-zinc-300 text-xs font-bold hover:bg-slate-100 dark:hover:bg-zinc-700 transition-colors">Copy</button>
              </div>
            </div>
            <div className="flex gap-2 mb-2">
              <input
                value={refCode}
                onChange={e => setRefCode(e.target.value.toUpperCase())}
                placeholder="သူငယ်ချင်း code ထည့်ပါ (LMN-XXXX)"
                className="flex-1 px-3 py-2 rounded-lg border border-slate-300 dark:border-zinc-600 bg-white dark:bg-zinc-800 text-slate-900 dark:text-white text-sm font-mono uppercase focus:ring-2 focus:ring-orange-500 outline-none"
              />
              <button onClick={doRedeemReferral} className="px-4 py-2 rounded-lg bg-emerald-500 text-white text-xs font-bold hover:bg-emerald-600 transition-colors">Redeem</button>
            </div>
            {refStatus && <p className="text-xs text-slate-500 dark:text-zinc-400 mb-2">{refStatus}</p>}
            <p className="text-[11px] text-slate-400 dark:text-zinc-500">
              သင့် code ကို သူငယ်ချင်း တစ်ယောက် သုံးတိုင်း သင့်ထံ +{REFERRAL_REWARD} ရပါတယ် (စုစုပေါင်း {state.referralsGiven} ဦး).
              သူငယ်ချင်း code သုံးတိုင်း {state.referralsGiven > 0 ? '✓' : '—'} <button onClick={doCheckReferralGiven} className="underline text-orange-500">နောက်ထပ် +{REFERRAL_REWARD} မှတ်တမ်းတင်မယ်</button>
            </p>
          </section>

          {/* Missions */}
          <section>
            <h3 className="text-sm font-bold text-slate-700 dark:text-zinc-200 uppercase tracking-wider mb-3">Missions — လုပ်ပြီးရင် credits</h3>
            <div className="space-y-2">
              {MISSIONS.map(m => {
                const done = !!state.redeemed[m.id];
                return (
                  <div key={m.id} className={`flex items-center gap-3 p-3 rounded-xl border transition-all ${done ? 'bg-slate-50 dark:bg-zinc-800/60 border-slate-200 dark:border-zinc-700 opacity-70' : 'bg-white dark:bg-zinc-800 border-slate-200 dark:border-zinc-700'}`}>
                    <div className={`w-8 h-8 rounded-full flex items-center justify-center text-xs font-black ${done ? 'bg-emerald-100 dark:bg-emerald-500/20 text-emerald-600' : 'bg-orange-100 dark:bg-orange-500/20 text-orange-600'}`}>
                      {done ? '✓' : `${m.reward}`}
                    </div>
                    <div className="flex-1">
                      <div className="text-sm font-semibold text-slate-800 dark:text-zinc-100">{m.titleMy}</div>
                      <div className="text-[11px] text-slate-500 dark:text-zinc-400">{m.title} • +{m.reward} CR</div>
                    </div>
                    {!done && (
                      <button onClick={() => doClaimMission(m.id)} className="px-3 py-1.5 rounded-lg bg-slate-900 dark:bg-white text-white dark:text-slate-900 text-xs font-bold hover:opacity-90 transition-opacity">
                        ပြီးပြီ — Claim
                      </button>
                    )}
                    {done && <span className="text-[11px] font-bold text-emerald-600">Claimed ✓</span>}
                  </div>
                );
              })}
            </div>
            <p className="text-[11px] text-slate-400 dark:text-zinc-500 mt-2">
              စုစုပေါင်း ယခုအချိန်ထိ <span className="font-bold text-orange-500">{state.totalEarned} CR</span> free credits ရရှိပြီးပါပြီ။
            </p>
          </section>
        </div>
      </div>
    </div>
  );
};

export default React.memo(RefuelEngine);
