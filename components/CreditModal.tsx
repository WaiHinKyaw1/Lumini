
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
    <div className="fixed inset-0 z-[100] flex items-center justify-center p-4 bg-slate-950/50 backdrop-blur-sm animate-in fade-in duration-300">
      <div className="absolute inset-0" onClick={onClose}></div>
      <div className="bg-white w-full max-w-2xl rounded-2xl border border-slate-100 shadow-xl overflow-hidden relative animate-in zoom-in-95 duration-300">
        
        {/* Header - Simple */}
        <div className="p-6 border-b border-slate-100 flex justify-between items-center bg-slate-50/50">
          <h2 className="text-xl font-semibold text-slate-900">Get More Credits</h2>
          <button onClick={onClose} className="p-2 rounded-full hover:bg-slate-200 text-slate-500 transition-colors">
            <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" /></svg>
          </button>
        </div>

        {/* Packs Grid */}
        <div className="max-h-[60vh] overflow-y-auto p-6 grid grid-cols-1 md:grid-cols-3 gap-4">
          {packs.map((pack) => (
            <button
              key={pack.name}
              onClick={() => { onAddCredits(pack.amount); onClose(); }}
              className="group relative p-5 rounded-xl border border-slate-200 hover:border-orange-500 hover:shadow-lg transition-all text-left flex flex-col h-full items-start"
            >
              {pack.popular && (
                <div className="absolute top-3 right-3 text-[10px] font-bold text-orange-600 bg-orange-100 px-2 py-0.5 rounded-full">
                  Popular
                </div>
              )}
              
              <div className="text-orange-500 mb-4">
                 <svg className="w-8 h-8" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d={pack.icon} /></svg>
              </div>

              <h3 className="font-semibold text-slate-700 text-sm mb-1">{pack.name}</h3>
              <div className="flex items-baseline gap-1 mb-4">
                <span className="text-3xl font-bold text-slate-900">{pack.amount}</span>
                <span className="text-xs text-slate-400 font-medium">Credits</span>
              </div>

              <div className="mt-auto w-full">
                 <div className={`w-full py-2 rounded-lg text-xs font-semibold text-center transition-all ${
                   pack.cost === 'CLAIM FREE' 
                     ? 'bg-emerald-50 text-emerald-700 hover:bg-emerald-100' 
                     : 'bg-slate-100 text-slate-700 hover:bg-slate-200'
                 }`}>
                    {pack.cost}
                 </div>
              </div>
            </button>
          ))}
        </div>
        
      </div>
    </div>
  );
};

export default React.memo(CreditModal);
