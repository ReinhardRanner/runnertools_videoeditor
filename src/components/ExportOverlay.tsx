import React, { useEffect } from 'react';
import { CheckCircle2, Loader2, X, Film, Zap, ArrowRight } from 'lucide-react';

interface ExportOverlayProps {
  status: 'idle' | 'writing' | 'rendering' | 'done';
  progress: number;
  onCancel?: () => void;
  onClose: () => void; // Added this to let the parent reset the state
}

export const ExportOverlay: React.FC<ExportOverlayProps> = ({ status, progress, onCancel, onClose }) => {
  if (status === 'idle') return null;

  const isDone = status === 'done';

  // Optional: Auto-close after a few seconds if you want
  /*
  useEffect(() => {
    if (isDone) {
      const timer = setTimeout(onClose, 5000);
      return () => clearTimeout(timer);
    }
  }, [isDone, onClose]);
  */

  return (
    <div className="fixed inset-0 z-[1000] flex items-center justify-center bg-black/60 backdrop-blur-xl animate-in fade-in duration-500">
      {/* Background Glow */}
      <div 
        className={`absolute w-[500px] h-[500px] rounded-full blur-[120px] transition-colors duration-1000 opacity-20 
        ${isDone ? 'bg-emerald-500' : 'bg-indigo-600'}`} 
      />

      <div className="bg-[#0a0a0a]/80 border border-white/10 p-10 rounded-[3rem] shadow-2xl flex flex-col items-center max-w-sm w-full mx-4 relative overflow-hidden backdrop-blur-xl">
        
        {/* Status Icon Area */}
        <div className="relative mb-10">
          {isDone ? (
            <div className="w-24 h-24 bg-emerald-500 rounded-full flex items-center justify-center animate-in zoom-in shadow-[0_0_50px_rgba(16,185,129,0.4)]">
              <CheckCircle2 size={48} className="text-white" />
            </div>
          ) : (
            <div className="relative w-24 h-24">
              <div className="absolute inset-0 border-4 border-white/5 rounded-full" />
              <svg className="absolute inset-0 w-full h-full -rotate-90">
                <circle
                  cx="48"
                  cy="48"
                  r="44"
                  fill="transparent"
                  stroke="currentColor"
                  strokeWidth="4"
                  strokeDasharray={276}
                  strokeDashoffset={276 - (276 * progress) / 100}
                  className="text-indigo-500 transition-all duration-500 ease-out"
                />
              </svg>
              <div className="absolute inset-0 flex flex-col items-center justify-center">
                {status === 'writing' ? (
                  <Loader2 size={24} className="text-indigo-400 animate-spin" />
                ) : (
                  <span className="text-lg font-mono font-black text-white">{progress}%</span>
                )}
              </div>
            </div>
          )}
        </div>

        {/* Text Content */}
        <div className="text-center space-y-2 z-10">
          <h2 className="text-white font-black uppercase tracking-[0.3em] text-sm">
            {status === 'writing' && "Preparing Assets"}
            {status === 'rendering' && "Synthesizing Video"}
            {status === 'done' && "Export Complete"}
          </h2>
          <p className="text-gray-500 text-[10px] font-bold uppercase tracking-widest leading-relaxed whitespace-pre-line">
            {status !== 'done' 
              ? "Optimization in progress.\nPlease do not close this tab." 
              : "Your master file has been\nsaved to your directory."}
          </p>
        </div>

        {/* Progress Bar (Linear) */}
        <div className="w-full mt-10 space-y-6 flex flex-col items-center">
          <div className="w-full h-1.5 bg-white/5 rounded-full overflow-hidden border border-white/5 p-0.5">
            <div 
              className={`h-full transition-all duration-700 ease-out rounded-full shadow-[0_0_10px_rgba(99,102,241,0.5)]
              ${isDone ? 'bg-emerald-500' : 'bg-gradient-to-r from-indigo-600 to-indigo-400'}`}
              style={{ width: `${isDone ? 100 : progress}%` }} 
            />
          </div>

          {/* Action Buttons */}
          <div className="flex items-center gap-3">
            {status !== 'done' && onCancel && (
              <button 
                onClick={onCancel}
                className="group flex items-center gap-2 px-6 py-2.5 bg-white/5 hover:bg-red-500/10 border border-white/10 rounded-2xl text-[10px] font-black text-gray-400 hover:text-red-500 uppercase tracking-widest transition-all active:scale-95"
              >
                <X size={14} />
                Abort
              </button>
            )}
            
            {isDone && (
              <button 
                onClick={onClose}
                className="group flex items-center gap-2 px-8 py-3 bg-emerald-500 hover:bg-emerald-400 border border-emerald-400/20 rounded-2xl text-[10px] font-black text-white uppercase tracking-widest transition-all active:scale-95 shadow-[0_10px_20px_rgba(16,185,129,0.2)]"
              >
                Done
                <ArrowRight size={14} className="group-hover:translate-x-1 transition-transform" />
              </button>
            )}
          </div>
        </div>

        {/* Brand Decoration */}
        <div className="absolute -bottom-4 -right-4 opacity-5 pointer-events-none">
          <Film size={120} className="text-white" />
        </div>
      </div>
    </div>
  );
};