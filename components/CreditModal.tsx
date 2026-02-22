
import React from 'react';

interface CreditModalProps {
  isOpen: boolean;
  onClose: () => void;
  onAddCredits: (amount: number) => void;
}

const CreditModal: React.FC<CreditModalProps> = ({ isOpen, onClose, onAddCredits }) => {
  if (!isOpen) return null;

  const packs = [
    { 
      name: 'Daily Injection', 
      amount: 50, 
      cost: 'CLAIM FREE', 
      color: 'from-emerald-400 to-teal-600', 
      icon: 'M13 10V3L4 14h7v7l9-11h-7z',
      popular: false 
    },
    { 
      name: 'Creator Pack', 
      amount: 500, 
      cost: '$4.99', 
      color: 'from-indigo-400 to-blue-600', 
      icon: 'M19.428 15.428a2 2 0 00-1.022-.547l-2.384-.477a6 6 0 00-3.86.517l-.318.158a6 6 0 01-3.86.517L6.05 15.21a2 2 0 00-1.806.547M8 4h8l-1 1v5.172a2 2 0 00.586 1.414l5 5c1.26 1.26.367 3.414-1.415 3.414H4.828c-1.782 0-2.674-2.154-1.414-3.414l5-5A2 2 0 009 10.172V5L8 4z',
      popular: true 
    },
    { 
      name: 'Studio Master', 
      amount: 2500, 
      cost: '$19.99', 
      color: 'from-violet-400 to-fuchsia-600', 
      icon: 'M12 8c-1.657 0-3 .895-3 2s1.343 2 3 2 3 .895 3 2-1.343 2-3 2m0-8c1.11 0 2.08.402 2.599 1M12 8V7m0 1v8m0 0v1m0-1c-1.11 0-2.08-.402-2.599-1M21 12a9 9 0 11-18 0 9 9 0 0118 0z',
      popular: false 
    },
  ];

  return (
    <div className="fixed inset-0 z-[100] flex items-center justify-center p-4 bg-black/80 backdrop-blur-xl animate-in fade-in duration-300">
      <div className="absolute inset-0" onClick={onClose}></div>
      <div className="bg-[#09090b] w-full max-w-4xl rounded-[32px] border border-white/10 shadow-2xl overflow-hidden relative animate-in zoom-in-95 duration-300">
        
        {/* Background Ambient Glow */}
        <div className="absolute top-0 left-1/2 -translate-x-1/2 w-80 h-80 bg-indigo-500/10 rounded-full blur-[80px] pointer-events-none"></div>

        {/* Header */}
        <div className="p-6 md:p-8 border-b border-white/5 flex justify-between items-center bg-white/[0.01] relative z-10">
          <div>
            <h2 className="text-2xl font-black text-white uppercase tracking-tighter italic">Credit Store</h2>
            <p className="text-[9px] font-bold text-zinc-500 uppercase tracking-[0.3em] mt-1">Refuel your creative engine</p>
          </div>
          <button onClick={onClose} className="w-10 h-10 rounded-full bg-white/5 hover:bg-white/10 flex items-center justify-center text-zinc-400 hover:text-white transition-all">
            <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" /></svg>
          </button>
        </div>

        {/* Packs Grid */}
        <div className="p-6 md:p-8 grid grid-cols-1 md:grid-cols-3 gap-4 relative z-10">
          {packs.map((pack) => (
            <button
              key={pack.name}
              onClick={() => { onAddCredits(pack.amount); onClose(); }}
              className="group relative p-6 rounded-[24px] border border-white/5 bg-[#121214] hover:border-white/20 transition-all hover:-translate-y-2 overflow-hidden text-left flex flex-col h-full hover:shadow-2xl hover:shadow-indigo-500/10"
            >
              {pack.popular && (
                <div className="absolute top-0 right-0 bg-white text-black text-[8px] font-black uppercase tracking-widest px-3 py-1 rounded-bl-xl">
                  Best Value
                </div>
              )}
              
              <div className={`absolute top-0 right-0 w-32 h-32 bg-gradient-to-br ${pack.color} opacity-0 group-hover:opacity-10 blur-3xl rounded-full -mr-8 -mt-8 transition-opacity duration-700`}></div>
              
              <div className={`w-10 h-10 rounded-xl bg-gradient-to-br ${pack.color} flex items-center justify-center text-white shadow-lg mb-6 group-hover:scale-110 transition-transform duration-500`}>
                 <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d={pack.icon} /></svg>
              </div>

              <h3 className="text-lg font-black text-white uppercase tracking-tight mb-1 italic">{pack.name}</h3>
              <div className="flex items-baseline gap-1 mb-6">
                <span className="text-3xl font-black text-white tracking-tighter">{pack.amount}</span>
                <span className="text-[9px] font-bold text-zinc-500 uppercase tracking-widest">CR</span>
              </div>

              <div className="mt-auto pt-4 border-t border-white/5 w-full">
                 <div className={`w-full py-2.5 rounded-xl font-black text-[10px] uppercase tracking-[0.2em] text-center transition-all ${
                   pack.cost === 'CLAIM FREE' 
                     ? 'bg-emerald-500/10 text-emerald-400 group-hover:bg-emerald-500 group-hover:text-black' 
                     : 'bg-white/5 text-zinc-400 group-hover:bg-white group-hover:text-black'
                 }`}>
                    {pack.cost}
                 </div>
              </div>
            </button>
          ))}
        </div>
        
        {/* Footer */}
        <div className="p-5 bg-zinc-950/50 border-t border-white/5 flex justify-center items-center gap-6 relative z-10">
           <div className="flex items-center gap-2">
              <svg className="w-4 h-4 text-emerald-500" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 15v2m-6 4h12a2 2 0 002-2v-6a2 2 0 00-2-2H6a2 2 0 00-2 2v6a2 2 0 002 2zm10-10V7a4 4 0 00-8 0v4h8z" /></svg>
              <span className="text-[9px] text-zinc-500 uppercase tracking-widest font-bold">Secure Stripe Encryption</span>
           </div>
           <div className="h-4 w-px bg-white/10"></div>
           <div className="flex items-center gap-2">
              <svg className="w-4 h-4 text-indigo-500" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 10V3L4 14h7v7l9-11h-7z" /></svg>
              <span className="text-[9px] text-zinc-500 uppercase tracking-widest font-bold">Instant Activation</span>
           </div>
        </div>
      </div>
    </div>
  );
};

export default CreditModal;
