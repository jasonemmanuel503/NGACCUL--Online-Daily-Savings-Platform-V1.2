import React from "react";
import { AlertOctagon, RotateCcw } from "lucide-react";

interface Props {
  children: React.ReactNode;
  fallback?: React.ReactNode;
}

interface State {
  hasError: boolean;
  error: Error | null;
}

export class ErrorBoundary extends React.Component<Props, State> {
  public override state: State = {
    hasError: false,
    error: null
  };

  public static getDerivedStateFromError(error: Error): State {
    return { hasError: true, error };
  }

  public override componentDidCatch(error: Error, errorInfo: React.ErrorInfo) {
    console.error("[NGACCUL][ErrorBoundary] Uncaught React Error:", error, errorInfo);
  }

  private handleReset = () => {
    this.setState({ hasError: false, error: null });
    window.location.reload();
  };

  public override render() {
    if (this.state.hasError) {
      if (this.props.fallback) {
        return this.props.fallback;
      }

      return (
        <div className="min-h-screen bg-[#120F1A] flex flex-col items-center justify-center p-6 text-white font-sans">
          <div className="max-w-md w-full bg-slate-900 border border-slate-800 rounded-2xl p-8 shadow-2xl text-center space-y-6">
            <div className="mx-auto w-16 h-16 bg-rose-950/40 border border-rose-500/20 text-rose-400 rounded-2xl flex items-center justify-center">
              <AlertOctagon className="w-8 h-8" />
            </div>

            <div className="space-y-2">
              <h1 className="text-xl font-display font-black tracking-tight text-white">
                Application Error
              </h1>
              <p className="text-xs text-slate-400 leading-relaxed">
                An unexpected exception has occurred in the component tree. Don't worry, your data and connection status are safe.
              </p>
            </div>

            {this.state.error && (
              <div className="p-3 bg-slate-950 rounded-xl border border-slate-800 text-left">
                <span className="text-[9px] uppercase tracking-wider text-rose-400 font-mono font-bold block mb-1">
                  Exception Stack Trace
                </span>
                <p className="text-[10px] font-mono text-rose-300 break-words line-clamp-3">
                  {this.state.error.toString()}
                </p>
              </div>
            )}

            <button
              onClick={this.handleReset}
              className="w-full py-3 bg-violet-700 hover:bg-violet-800 active:scale-95 text-white font-extrabold text-xs rounded-2xl cursor-pointer shadow-md flex items-center justify-center gap-2 transition-all uppercase tracking-wider"
            >
              <RotateCcw className="w-3.5 h-3.5" />
              Refresh & Reload Workspace
            </button>
          </div>
        </div>
      );
    }

    return this.props.children;
  }
}
