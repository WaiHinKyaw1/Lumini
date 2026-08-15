import React, { Component } from 'react';
import { toast } from 'react-hot-toast';
import { AlertTriangle } from 'lucide-react';

export interface ErrorBoundaryState {
  hasError: boolean;
  error: Error | null;
}

/**
 * ErrorBoundary — catches render crashes inside any module page and keeps
 * the rest of the app (nav, credits, other modules) alive. The user sees a
 * friendly recovery card instead of a blank white screen, and can retry.
 *
 * Usage: <ErrorBoundary><SomePageOrWidget /></ErrorBoundary>
 */
export class ErrorBoundary extends Component<
  { children: React.ReactNode; moduleName?: string },
  ErrorBoundaryState
> {
  state: ErrorBoundaryState = { hasError: false, error: null };

  static getDerivedStateFromError(error: Error): ErrorBoundaryState {
    return { hasError: true, error };
  }

  componentDidCatch(error: Error, info: React.ErrorInfo) {
    // Surface the crash to the notification system for visibility
    const name = this.props.moduleName || 'application';
    toast.error(`${name} တွင် ပြဿနာတစ်ချို့ ဖြစ်ပေါ်နေပါတယ်။ စာနာပေးပါ။`);
    console.error(`[ErrorBoundary] ${name}:`, error, info);
  }

  handleRetry = () => {
    this.setState({ hasError: false, error: null });
    toast.success('ပြန်လည်စမ်းသပ်နေပါတယ်…');
  };

  render() {
    if (!this.state.hasError) return this.props.children;

    const name = this.props.moduleName || 'application';
    return (
      <div className="flex items-center justify-center h-[60vh]">
        <div className="max-w-md w-full glass p-8 rounded-[2.5rem] border border-white/10 text-center space-y-5">
          <div className="w-16 h-16 bg-red-500/20 rounded-2xl flex items-center justify-center mx-auto text-red-400">
            <AlertTriangle className="w-8 h-8" />
          </div>
          <div className="space-y-2">
            <h2 className="text-xl font-black text-white uppercase tracking-tight">
              {name} တွင် ပြဿနာဖြစ်နေပါသည်
            </h2>
            <p className="text-zinc-400 text-xs leading-relaxed px-2">
              ဤ module ကို load လုပ်ရာတွင် အခြားပြဿနာတစ်ချို့ တွေ့ရှိရပါသည်။
              ကျန်းမာသော app အခွင်းအရေးများသည် ဆက်လက်အလုပ်လုပ်နိုင်ပါသည်။
            </p>
          </div>
          <button
            type="button"
            onClick={this.handleRetry}
            className="w-full py-3.5 bg-accent hover:bg-accent-hover text-white font-black uppercase tracking-widest text-[11px] rounded-xl shadow-lg shadow-accent/20 transition-all active:scale-95"
          >
            ပြန်လည်စမ်းသပ်မည် (Retry)
          </button>
        </div>
      </div>
    );
  }
}
