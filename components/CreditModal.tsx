
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
    <div className="fixed inset-0 z-[100] flex items-center justify-center p-4 bg-black/90 backdrop-blur-3xl animate-in fade-in duration-500">
      <div className="absolute inset-0" onClick={onClose}></div>
      <div className="bg-[#0A0A0A] w-full max-w-4xl rounded-[40px] border border-white/10 shadow-[0_0_100px_rgba(0,0,0,1)] overflow-hidden relative animate-in zoom-in-95 duration-500">
        
        {/* Background Ambient Glow */}
        <div className="absolute top-0 left-1/2 -translate-x-1/2 w-[500px] h-80 bg-accent/5 rounded-full blur-[120px] pointer-events-none"></div>

        {/* Header */}
        <div className="p-8 md:p-12 border-b border-white/5 flex justify-between items-center bg-white/[0.01] relative z-10">
          <div>
            <h2 className="movie-h1 !text-4xl !mb-0 uppercase tracking-tighter">Credit Matrix</h2>
            <p className="movie-meta !text-[11px] !mb-0 uppercase tracking-[0.4em] text-accent/80 mt-2 font-black">Refuel your creative architecture</p>
          </div>
          <button onClick={onClose} className="w-12 h-12 rounded-2xl bg-white/5 hover:bg-accent/10 flex items-center justify-center text-zinc-600 hover:text-accent transition-all border border-white/5 hover:border-accent/20">
            <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" /></svg>
          </button>
        </div>

        {/* Packs Grid */}
        <div className="p-8 md:p-12 grid grid-cols-1 md:grid-cols-3 gap-6 relative z-10">
          {packs.map((pack) => (
            <button
              key={pack.name}
              onClick={() => { onAddCredits(pack.amount); onClose(); }}
              className="group relative p-8 rounded-[32px] border border-white/5 bg-black hover:border-accent/30 transition-all hover:-translate-y-2 overflow-hidden text-left flex flex-col h-full hover:shadow-[0_20px_50px_rgba(225,29,72,0.15)]"
            >
              {pack.popular && (
                <div className="absolute top-0 right-0 bg-accent text-white movie-meta !text-[9px] !mb-0 uppercase tracking-widest px-4 py-2 rounded-bl-2xl font-black shadow-lg">
                  Optimal Choice
                </div>
              )}
              
              <div className={`absolute top-0 right-0 w-48 h-48 bg-accent opacity-0 group-hover:opacity-10 blur-[60px] rounded-full -mr-12 -mt-12 transition-opacity duration-1000`}></div>
              
              <div className={`w-14 h-14 rounded-2xl bg-accent flex items-center justify-center text-white shadow-[0_0_20px_rgba(225,29,72,0.4)] mb-8 group-hover:scale-110 transition-transform duration-700`}>
                 <svg className="w-7 h-7" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d={pack.icon} /></svg>
              </div>

              <h3 className="movie-h2 !text-xl !mb-0 uppercase tracking-tight mb-2 text-white group-hover:text-accent transition-colors">{pack.name}</h3>
              <div className="flex items-baseline gap-2 mb-8">
                <span className="movie-h1 !text-5xl !mb-0 tracking-tighter">{pack.amount}</span>
                <span className="movie-meta !text-[10px] text-accent uppercase tracking-widest font-black !mb-0">CR UNITS</span>
              </div>

              <div className="mt-auto pt-6 border-t border-white/5 w-full">
                 <div className={`w-full py-3.5 rounded-2xl movie-meta !text-[11px] uppercase tracking-[0.3em] text-center transition-all border shadow-lg !mb-0 font-black ${
                   pack.cost === 'CLAIM FREE' 
                     ? 'bg-emerald-500/10 border-emerald-500/20 text-emerald-400 group-hover:bg-emerald-500 group-hover:text-black' 
                     : 'bg-white/5 border-white/10 text-zinc-500 group-hover:bg-white group-hover:text-black group-hover:border-white'
                 }`}>
                    {pack.cost}
                 </div>
              </div>
            </button>
          ))}
        </div>
        
        {/* Footer */}
        <div className="p-8 bg-black/40 border-t border-white/5 flex justify-center items-center gap-10 relative z-10">
           <div className="flex items-center gap-3">
              <svg className="w-5 h-5 text-emerald-500" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 15v2m-6 4h12a2 2 0 002-2v-6a2 2 0 00-2-2H6a2 2 0 00-2 2v6a2 2 0 002 2zm10-10V7a4 4 0 00-8 0v4h8z" /></svg>
              <span className="movie-meta !text-[10px] text-zinc-600 uppercase tracking-widest !mb-0 font-black">Secure Stripe Logic Matrix</span>
           </div>
           <div className="h-6 w-px bg-white/10"></div>
           <div className="flex items-center gap-3">
              <svg className="w-5 h-5 text-accent" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 10V3L4 14h7v7l9-11h-7z" /></svg>
              <span className="movie-meta !text-[10px] text-zinc-600 uppercase tracking-widest !mb-0 font-black">Instant Unit Deployment</span>
           </div>
        </div>
      </div>
    </div>
  );
};

export default React.memo(CreditModal);
