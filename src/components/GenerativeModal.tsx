import React, { useState, useEffect } from 'react';
import { X, Send, Loader2, Code2, Sparkles, Terminal, History, Cpu, Timer, Maximize } from 'lucide-react';
import { Asset } from '../types';
import { VideoPlayer } from './UI/VideoPlayer';
import { ModelGrid } from './UI/ModelGrid';

interface ModelPricing {
  input: number;
  output: number;
}

interface Model {
  id: string;
  name: string;
  isThinking?: boolean;
  supportsFlex?: boolean;
  pricing?: ModelPricing;
}

interface Provider {
  provider: string;
  providerName: string;
  models: Model[];
}

interface GenerativeModalProps {
  modal: { open: boolean, type: 'html' | 'manim', asset?: Asset } | null;
  resolution: { w: number, h: number }; // Vom Canvas übergeben
  onClose: () => void;
  // Callback um duration und resolution erweitert
  onGenerate: (prompt: string, providerId: string, modelId: string, duration: number, res: { w: number, h: number }) => void;
  isGenerating: boolean;
  status: string;
}

export const GenerativeModal: React.FC<GenerativeModalProps> = ({ 
  modal, resolution, onClose, onGenerate, isGenerating, status 
}) => {
  const [localPrompt, setLocalPrompt] = useState("");
  const [availableProviders, setAvailableProviders] = useState<Provider[]>([]);
  const [selectedProvider, setSelectedProvider] = useState("");
  const [selectedModel, setSelectedModel] = useState("");
  
  // Neue Render-Parameter
  const [duration, setDuration] = useState(5);
  const [resW, setResW] = useState(resolution.w);
  const [resH, setResH] = useState(resolution.h);

  useEffect(() => {
    fetch('https://runnertools.demo3.at/api/webrenderer/models')
      .then(res => res.json())
      .then((data: Provider[]) => {
        setAvailableProviders(data);
        if (data.length > 0) {
          setSelectedProvider(data[0].provider);
          setSelectedModel(data[0].models[0].id);
        }
      })
      .catch(err => console.error("Failed to fetch models", err));
  }, []);

  useEffect(() => {
    setLocalPrompt(modal?.asset?.prompt || "");
    // Bei Reset oder neuem Modal Auflösung synchronisieren
    setResW(resolution.w);
    setResH(resolution.h);
  }, [modal, resolution]);

  if (!modal || !modal.open) return null;

  return (
    <div className="fixed inset-0 bg-black/70 backdrop-blur-xl z-[9999] flex items-center justify-center p-4 md:p-8 animate-in fade-in duration-300">
      <div className="bg-bg-elevated border border-border-default w-full max-w-5xl h-[85vh] rounded-[1.5rem] overflow-hidden flex flex-col shadow-2xl">

        {/* --- Header --- */}
        <div className="h-16 border-b border-border-default flex items-center justify-between px-8 bg-white/[0.02]">
          <div className="flex items-center gap-4">
            <div className={`p-2.5 rounded-xl ${modal.type === 'html' ? 'bg-sky-500/20 text-sky-400' : 'bg-purple-500/20 text-purple-400'}`}>
              {modal.type === 'html' ? <Code2 size={20} /> : <Sparkles size={20} />}
            </div>
            <div className="flex flex-col">
              <span className="text-[11px] font-black uppercase tracking-[0.2em] text-white/90">
                {modal.asset ? 'Refining' : 'Generating'} {modal.type.toUpperCase()}
              </span>
            </div>
          </div>
          <button onClick={onClose} className="p-2 hover:bg-white/10 rounded-full transition-all text-gray-500 hover:text-white active:scale-90">
            <X size={22}/>
          </button>
        </div>

        <div className="flex-1 flex flex-col md:flex-row overflow-hidden">
          
          {/* --- Left Column: Canvas Preview --- */}
          <div className="flex-[1.6] bg-bg-canvas relative flex flex-col items-center justify-center p-10 border-r border-border-default">
            {modal.asset?.url ? (
              <VideoPlayer src={modal.asset.url} className="w-full" />
            ) : (
              <div className="text-center opacity-20"><Terminal size={48} className="mx-auto text-white mb-4" /><p className="text-[10px] font-black uppercase tracking-[0.4em] text-white">Visualizer Standby</p></div>
            )}
            {isGenerating && (
              <div className="absolute inset-0 bg-black/80 backdrop-blur-md z-50 flex flex-col items-center justify-center gap-8">
                <div className="relative"><div className="w-24 h-24 border-t-2 border-indigo-500 rounded-full animate-spin" /><Loader2 size={32} className="absolute inset-0 m-auto text-indigo-400 animate-pulse" /></div>
                <p className="text-sm font-black uppercase text-white tracking-[0.3em] animate-pulse">{status}</p>
              </div>
            )}
          </div>

          {/* --- Right Column: Intelligence & Control --- */}
          <div className="flex-1 flex flex-col bg-bg-surface">
            <div className="flex-1 p-8 overflow-y-auto custom-scrollbar space-y-8">
              
              {/* Brain Selection */}
              <div className="space-y-3">
                <div className="flex items-center gap-2 text-gray-500"><Cpu size={14} /><span className="text-[9px] font-black uppercase tracking-widest text-gray-400">Brain Selection</span></div>
                <ModelGrid
                  providers={availableProviders}
                  selectedProvider={selectedProvider}
                  selectedModel={selectedModel}
                  onSelect={(providerId, modelId) => {
                    setSelectedProvider(providerId);
                    setSelectedModel(modelId);
                  }}
                />
              </div>

              {/* Render Settings (NEW: Duration & Resolution) */}
              <div className="space-y-4">
                <div className="flex items-center gap-2 text-gray-500"><Timer size={14} /><span className="text-[9px] font-black uppercase tracking-widest text-gray-400">Render Parameters</span></div>
                
                <div className="grid grid-cols-2 gap-3">
                  {/* Duration */}
                  <div className="bg-white/[0.03] border border-border-default rounded-xl p-3">
                    <p className="text-[8px] font-black text-gray-500 uppercase mb-1">Duration (Sec)</p>
                    <input type="number" value={duration} onChange={(e) => setDuration(Number(e.target.value))} className="bg-transparent text-white text-xs w-full focus:outline-none font-mono" />
                  </div>
                  {/* Resolution Toggle/Hint */}
                  <div className="bg-indigo-500/5 border border-indigo-500/10 rounded-xl p-3">
                    <p className="text-[8px] font-black text-indigo-400 uppercase mb-1 flex justify-between">Resolution <Maximize size={8}/></p>
                    <div className="flex gap-2 text-[10px] font-mono text-indigo-300">
                      <input value={resW} onChange={e => setResW(Number(e.target.value))} className="bg-transparent w-full focus:outline-none" />
                      <span className="opacity-30">x</span>
                      <input value={resH} onChange={e => setResH(Number(e.target.value))} className="bg-transparent w-full focus:outline-none" />
                    </div>
                  </div>
                </div>
              </div>

              {/* History Section */}
              <div className="space-y-3">
                <div className="flex items-center gap-2 text-gray-500"><History size={14} /><span className="text-[9px] font-black uppercase tracking-widest text-gray-400">Prompt Context</span></div>
                {modal.asset ? (
                  <div className="p-4 bg-indigo-500/5 border border-indigo-500/10 rounded-xl"><p className="text-xs text-gray-400 italic">"{modal.asset.prompt}"</p></div>
                ) : (
                  <p className="text-[10px] text-gray-600 uppercase font-bold tracking-tighter">New Asset Initialization...</p>
                )}
              </div>
            </div>

            {/* Input Footer */}
            <div className="p-8 bg-white/[0.02] border-t border-border-default">
              <div className="relative">
                <textarea
                  value={localPrompt} onChange={(e) => setLocalPrompt(e.target.value)}
                  placeholder="Describe your vision..."
                  className="w-full bg-bg-canvas-deep border border-border-default rounded-2xl p-5 text-sm text-white focus:outline-none focus:border-indigo-500/50 min-h-[140px] resize-none pr-14"
                  disabled={isGenerating}
                />
                <button 
                  onClick={() => onGenerate(localPrompt, selectedProvider, selectedModel, duration, { w: resW, h: resH })}
                  disabled={isGenerating || !localPrompt.trim() || !selectedModel}
                  className="absolute bottom-4 right-4 p-3 bg-indigo-600 text-white rounded-xl hover:bg-indigo-500 disabled:opacity-20 active:scale-95 transition-all"
                >
                  <Send size={18}/>
                </button>
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};