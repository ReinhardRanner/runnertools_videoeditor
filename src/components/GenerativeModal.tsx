import React, { useState, useEffect, useRef, useLayoutEffect } from 'react';
import { X, Code2, Sparkles, Terminal, Film, Cpu, Timer, Maximize, Minimize2, Play, Cloud, ChevronDown, MonitorPlay, RotateCcw, AlertTriangle, Copy, Check, XCircle } from 'lucide-react';
import * as Resizable from 'react-resizable-panels';
import { Asset, ASSET_COLORS } from '../types';
import { VideoPlayer } from './UI/VideoPlayer';
import { renderVideoInBrowser } from '../utils/ClientRenderer';
import { SplitButton } from './UI/SplitButton';
import { CodeEditor } from './UI/CodeEditor'; // This now handles Shiki internally
import { analyzeVideo } from '../utils/videoUtils';

const { Group, Panel, Separator } = Resizable;
import { ModelGrid } from './UI/ModelGrid';

/** Extract the meaningful error from a manim/python traceback */
function cleanError(raw: string): string {
  const cleaned = raw.replace(/\r[^\n]*/g, '').trim();
  const lines = cleaned.split('\n').map(l => l.trim()).filter(Boolean);
  for (let i = lines.length - 1; i >= 0; i--) {
    if (/Error:|Exception:/.test(lines[i])) return lines[i];
  }
  return lines[lines.length - 1] || raw.substring(0, 200);
}

interface GenerativeModalProps {
  modal: { open: boolean, type: 'html' | 'manim', asset?: Asset } | null;
  resolution: { w: number, h: number };
  onClose: () => void;
  onGenerateHTML: (prompt: string, providerId: string, modelId: string, oldCode?: string) => Promise<string>;
  onRenderVideo: (html: string, duration: number, res: { w: number, h: number }) => Promise<string>;
  onCancel: () => Promise<void>;
  onRename: (id: string, newName: string) => void;
  onCodeChange: (code: string) => void;
  onUpdateAsset: (id: string, updates: Partial<Asset>) => void;
  canCancel: boolean;
  status: string;
}

export const GenerativeModal: React.FC<GenerativeModalProps> = ({ 
  modal, 
  resolution, 
  onClose, 
  onGenerateHTML,
  onRenderVideo,
  onCancel,
  onRename,
  onCodeChange,
  onUpdateAsset,
  canCancel,
  status 
}) => {
  // --- UI & Content State ---
  const [localPrompt, setLocalPrompt] = useState("");
  const [generatedHtml, setGeneratedHtml] = useState<string>("");
  const [renderedVideoUrl, setRenderedVideoUrl] = useState<string | null>(null);
  const [errorToast, setErrorToast] = useState<string | null>(null);
  const [iframeErrors, setIframeErrors] = useState<string[]>([]);
  const [codeFullscreen, setCodeFullscreen] = useState(false);
  const [previewTab, setPreviewTab] = useState<'live' | 'video'>('live');
  const activeAssetIdRef = useRef<string | null>(null);
  const [renderMode, setRenderMode] = useState<'server' | 'client'>('client');

  // --- Configuration State ---
  const [availableProviders, setAvailableProviders] = useState<Provider[]>([]);
  const [selectedProvider, setSelectedProvider] = useState("");
  const [selectedModel, setSelectedModel] = useState("");
  const [duration, setDuration] = useState(5);
  const [resW, setResW] = useState(resolution.w);
  const [resH, setResH] = useState(resolution.h);
  const previewContainerRef = useRef<HTMLDivElement>(null);
  const [previewScale, setPreviewScale] = useState(1);

  // Calculate the scale factor to fit the target resolution into the UI
  useLayoutEffect(() => {
    const updateScale = () => {
      if (!previewContainerRef.current) return;
      const { width, height } = previewContainerRef.current.getBoundingClientRect();
      
      // Calculate how much we need to scale the target resolution to fit
      const scaleX = width / resW;
      const scaleY = height / resH;
      
      // Use the smaller scale to ensure it fits entirely (Contain)
      setPreviewScale(Math.min(scaleX, scaleY, 1) * 0.95); // 0.95 for a little padding
    };

    const observer = new ResizeObserver(updateScale);
    if (previewContainerRef.current) observer.observe(previewContainerRef.current);
    updateScale();

    return () => observer.disconnect();
  }, [resW, resH, modal?.open, previewTab]); // Recalculate if res or tab changes

  // Load Models on Mount
  useEffect(() => {
    fetch('https://runnertools.demo3.at/api/webrenderer/models')
      .then(res => res.json())
      .then((data: Provider[]) => {
        setAvailableProviders(data);
        if (data.length > 0) {
          // Default to DeepSeek 3.2 no-thinking if available
          let defaultProvider = data[0].provider;
          let defaultModel = data[0].models[0].id;
          for (const p of data) {
            const match = p.models.find(m => /deepseek/i.test(m.id || m.name) && !m.isThinking);
            if (match) {
              defaultProvider = p.provider;
              defaultModel = match.id;
              break;
            }
          }
          setSelectedProvider(defaultProvider);
          setSelectedModel(defaultModel);
        }
      })
      .catch(err => console.error("Failed to fetch models", err));
  }, []);

  // Listen for error messages from iframe
  useEffect(() => {
    const handler = (e: MessageEvent) => {
      if (e.data?.type === 'iframe-error') {
        setIframeErrors(prev => [...prev, e.data.message]);
      }
    };
    window.addEventListener('message', handler);
    return () => window.removeEventListener('message', handler);
  }, []);

  // Clear iframe errors when HTML changes
  useEffect(() => {
    setIframeErrors([]);
  }, [generatedHtml]);

  // Sync code changes back to parent (debounced)
  useEffect(() => {
    if (!generatedHtml) return;
    const timer = setTimeout(() => onCodeChange(generatedHtml), 500);
    return () => clearTimeout(timer);
  }, [generatedHtml]);

  useEffect(() => {
    if (!modal?.open || !modal.asset) {
      activeAssetIdRef.current = null;
      return;
    };

    // Switch assets: Reset local state to match the new selection
    if (activeAssetIdRef.current !== modal.asset.id) {
      activeAssetIdRef.current = modal.asset.id;
      setLocalPrompt(modal.asset.prompt || "");
      setGeneratedHtml(modal.asset.code || "");
      setRenderedVideoUrl(modal.asset.url || null);
      setDuration(modal.asset.duration || 5);
      setResW(modal.asset.resolution?.w || resolution.w);
      setResH(modal.asset.resolution?.h || resolution.h);
      setPreviewTab(modal.asset.url ? 'video' : 'live');
      setIframeErrors([]);
      setErrorToast(null);
    } else {
      // Background update: Only update video URL or code if a background render finished
      if (modal.asset.url !== renderedVideoUrl) setRenderedVideoUrl(modal.asset.url || null);
      
      // Only update code from props if we aren't currently "busy" generating it
      if (modal.asset.code !== generatedHtml && !modal.asset.isProcessing) {
        setGeneratedHtml(modal.asset.code || "");
      }
    }
  }, [modal?.asset, resolution]);

  const isManim = modal?.type === 'manim';

  const isCurrentlyBusy = modal?.asset?.isProcessing;

  // Action: Generate Step 1
  const handleGenerateHTML = async () => {
    try {
      // Parent updates asset.isProcessing to true automatically
      await onGenerateHTML(localPrompt, selectedProvider, selectedModel, generatedHtml || undefined);
    } catch (error: any) {
      if (error?.message !== 'Cancelled') {
        setErrorToast(error?.message || String(error));
        setTimeout(() => setErrorToast(null), 5000);
      }
    }
  };

  // Action: Render Step 2
  const handleRenderVideo = async (mode: 'server' | 'client') => {
    if (!modal.asset) return;

    // 1. Initial State Update
    onUpdateAsset(modal.asset.id, { 
      isProcessing: true, 
      progress: 0,
      processStatus: mode === 'server' ? 'Sending to server...' : 'Initializing browser render...' 
    });

    try {
      let videoUrl: string;

      if (mode === 'client') {
        // CLIENT-SIDE LOGIC
        videoUrl = await renderVideoInBrowser({
          html: generatedHtml,
          duration: duration,
          width: resW,
          height: resH,
          onProgress: (percent, status) => {
            onUpdateAsset(modal.asset!.id, { progress: percent, processStatus: status });
          }
        });
      } else {
        // SERVER-SIDE LOGIC (Your original function)
        videoUrl = await onRenderVideo(generatedHtml, duration, { w: resW, h: resH });
      }

      onUpdateAsset(modal.asset.id, { processStatus: 'Finalizing metadata...' });
      const videoMediadata = await analyzeVideo(videoUrl);
      const actualDuration = videoMediadata.duration;
      const actualResolution = videoMediadata.resolution;

      // 2. Success Update
      setRenderedVideoUrl(videoUrl);
      setPreviewTab('video');
      onUpdateAsset(modal.asset.id, { 
        url: videoUrl,
        duration: actualDuration,
        resolution: actualResolution,
        isProcessing: false, 
        progress: 100,
        processStatus: 'Complete'
      });

    } catch (error: any) {
      console.error("Render Error:", error);
      onUpdateAsset(modal.asset.id, { 
        isProcessing: false, 
        processError: error.message || String(error) 
      });
      
      if (error?.message !== 'Cancelled') {
        setErrorToast(error?.message || String(error));
        setTimeout(() => setErrorToast(null), 5000);
      }
    }
  };

  if (!modal || !modal.open) return null;

  return (
    <div className="fixed inset-0 bg-black/80 backdrop-blur-xl z-[9999] flex items-center justify-center p-4 md:p-8 animate-in fade-in duration-300">
      <div className="bg-[#0A0A0B] border border-white/10 w-full max-w-6xl h-[90vh] rounded-[2rem] overflow-hidden flex flex-col shadow-[0_0_50px_-12px_rgba(0,0,0,0.5)]">

        {/* --- Header --- */}
        <div className="h-14 border-b border-white/5 flex items-center justify-between px-6 bg-white/[0.01]">
          <div className="flex items-center gap-3">
            <div className={`p-2 rounded-xl ${ASSET_COLORS[modal.type]?.bg} ${ASSET_COLORS[modal.type]?.text}`}>
              {modal.type === 'manim' ? <Sparkles size={16} /> : <Code2 size={16} />}
            </div>
            <div className="flex flex-col">
              {modal.asset ? (
                <input
                  defaultValue={modal.asset.name}
                  onBlur={(e) => { if (e.target.value.trim() && modal.asset) onRename(modal.asset.id, e.target.value.trim()); }}
                  onKeyDown={(e) => { if (e.key === 'Enter') (e.target as HTMLInputElement).blur(); }}
                  className="text-sm font-bold text-white bg-transparent border-b border-transparent hover:border-white/20 focus:border-indigo-500/50 focus:outline-none px-1 py-0.5 min-w-0"
                />
              ) : (
                <span className="text-sm font-bold text-white/50 italic">Untitled</span>
              )}
              <span className="text-[9px] font-black uppercase tracking-widest text-white/30 px-1">{modal.type}</span>
            </div>
          </div>
          <button onClick={onClose} className="p-2 hover:bg-white/10 rounded-full transition-all text-gray-500 hover:text-white active:scale-90">
            <X size={20}/>
          </button>
        </div>

        <div className="flex-1 overflow-hidden">
          <Group direction="horizontal">
            <Panel defaultSize={55} minSize={25}>
            {/* --- Left Column: Dynamic Preview --- */}
            <div className="h-full bg-[#050505] relative flex flex-col">
              {/* Tab switcher */}
              <div className="absolute top-4 left-4 z-10 flex gap-1">
                {!isManim && (
                  <button
                    onClick={() => setPreviewTab('live')}
                    className={`flex items-center gap-1.5 px-3 py-1 backdrop-blur-md border rounded-full text-[9px] font-black uppercase tracking-widest transition-all ${
                      previewTab === 'live'
                        ? 'bg-indigo-500/20 border-indigo-500/40 text-indigo-300'
                        : 'bg-black/50 border-white/10 text-white/40 hover:text-white/60'
                    }`}
                  >
                    <MonitorPlay size={10} />
                    Live
                  </button>
                )}
                {renderedVideoUrl && (
                  <button
                    onClick={() => setPreviewTab('video')}
                    className={`flex items-center gap-1.5 px-3 py-1 backdrop-blur-md border rounded-full text-[9px] font-black uppercase tracking-widest transition-all ${
                      previewTab === 'video'
                        ? 'bg-indigo-500/20 border-indigo-500/40 text-indigo-300'
                        : 'bg-black/50 border-white/10 text-white/40 hover:text-white/60'
                    }`}
                  >
                    <Film size={10} />
                    Video
                  </button>
                )}
              </div>

              <div 
                ref={previewContainerRef}
                className="flex-1 flex items-center justify-center p-6 relative overflow-hidden bg-[#050505]"
              >
                {previewTab === 'video' && renderedVideoUrl ? (
                  <VideoPlayer src={renderedVideoUrl} className="w-full rounded-xl shadow-2xl" />
                ) : generatedHtml && !isManim ? (
                  <div className="w-full h-full flex flex-col gap-4 items-center justify-center">
                    <div 
                      className="relative shadow-2xl overflow-hidden bg-white rounded-2xl border border-border-default"
                      style={{
                        width: resW,
                        height: resH,
                        transform: `scale(${previewScale})`,
                        borderRadius: 16 / previewScale,
                        borderWidth: 1 / previewScale,
                      }}
                    >
                      <iframe
                        title="html-preview"
                        srcDoc={`
                          <!DOCTYPE html>
                          <html>
                            <head>
                              <style>
                                * {
                                  margin: 0;
                                  padding: 0;
                                  box-sizing: border-box;
                                  -webkit-font-smoothing: antialiased;
                                  -moz-osx-font-smoothing: grayscale;
                                  text-rendering: optimizeLegibility;
                                }
                                html, body { 
                                  width: ${resW}px; 
                                  height: ${resH}px; 
                                  overflow: hidden; 
                                  background-color: white !important;
                                }
                              </style>
                            </head>
                            <body>
                              <script>
                                window.onerror = function(msg, src, line, col, err) {
                                  parent.postMessage({ type: 'iframe-error', message: (err ? err.toString() : msg) + (line ? ' (line ' + line + ')' : '') }, '*');
                                };
                                var _origErr = console.error;
                                console.error = function() {
                                  var msg = Array.prototype.slice.call(arguments).map(a => typeof a === 'object' ? JSON.stringify(a) : String(a)).join(' ');
                                  parent.postMessage({ type: 'iframe-error', message: msg }, '*');
                                  _origErr.apply(console, arguments);
                                };
                              </script>
                              ${generatedHtml}
                            </body>
                          </html>`}
                        className="w-full h-full border-none"
                        style={{ width: resW, height: resH }}
                      />
                    </div>

                    {/* ERROR DISPLAY (Pinned below the scaled preview) */}
                    {iframeErrors.length > 0 && (
                      <div className="absolute bottom-6 left-6 right-6 max-h-32 overflow-auto rounded-xl bg-red-950/90 border border-red-500/30 p-4 flex gap-4 backdrop-blur-md z-20">
                        <div className="flex-1 min-w-0 space-y-1">
                          <p className="text-[10px] font-black uppercase tracking-widest text-red-400/60 mb-2">Runtime Errors</p>
                          {iframeErrors.map((err, i) => (
                            <p key={i} className="text-[11px] font-mono text-red-200/90 leading-relaxed">
                              <span className="text-red-500 font-bold mr-2">●</span>{err}
                            </p>
                          ))}
                        </div>
                        <button
                          onClick={async () => {
                            const errorPrompt = iframeErrors.map(e => `ERROR: ${e}`).join('\n');
                            try {
                              const code = await onGenerateHTML(errorPrompt, selectedProvider, selectedModel, generatedHtml || undefined);
                              setGeneratedHtml(code);
                              setRenderedVideoUrl(null);
                            } catch (error: any) {
                              if (error?.message !== 'Cancelled') {
                                setErrorToast(error?.message || String(error));
                                setTimeout(() => setErrorToast(null), 5000);
                              }
                            }
                          }}
                          disabled={isCurrentlyBusy}
                          className="shrink-0 self-center px-4 py-2 rounded-xl bg-red-500 text-white text-[10px] font-black uppercase tracking-widest transition-all hover:bg-red-400 active:scale-95 disabled:opacity-30"
                        >
                          Fix with AI
                        </button>
                      </div>
                    )}
                  </div>
                ) : (
                  <div className="text-center opacity-20">
                    <Terminal size={64} className="mx-auto text-white mb-6" />
                    <p className="text-[11px] font-black uppercase tracking-[0.5em] text-white">System Idle</p>
                  </div>
                )}
              </div>

              {/* Persistent Render Error Panel */}
              {modal.asset?.processError && !isCurrentlyBusy && (
                <div className="mx-4 mb-4 max-h-28 overflow-auto rounded-lg bg-red-950/80 border border-red-500/20 p-3 flex gap-3">
                  <AlertTriangle size={14} className="text-red-500 shrink-0 mt-0.5" />
                  <div className="flex-1 min-w-0 space-y-1">
                    <p className="text-[9px] font-black uppercase tracking-widest text-red-400/60">Render Failed</p>
                    <p className="text-[10px] font-mono text-red-400/90 leading-relaxed">
                      {cleanError(modal.asset.processError)}
                    </p>
                  </div>
                  <button
                    onClick={async () => {
                      const errorPrompt = `Fix this error in my ${modal.type} code:\n${cleanError(modal.asset!.processError!)}`;
                      try {
                        await onGenerateHTML(errorPrompt, selectedProvider, selectedModel, generatedHtml || undefined);
                      } catch (error: any) {
                        if (error?.message !== 'Cancelled') {
                          setErrorToast(error?.message || String(error));
                          setTimeout(() => setErrorToast(null), 5000);
                        }
                      }
                    }}
                    disabled={isCurrentlyBusy || !selectedModel}
                    className="shrink-0 self-center px-3 py-1.5 rounded-lg bg-red-500/20 hover:bg-red-500/30 border border-red-500/30 text-red-400 hover:text-red-300 text-[10px] font-bold uppercase tracking-wider transition-all disabled:opacity-30"
                  >
                    Fix
                  </button>
                </div>
              )}

              {/* Error Toast */}
              {errorToast && (
                <div className="absolute bottom-6 left-6 right-6 z-50 flex items-start gap-3 p-4 bg-red-950/90 border border-red-500/30 backdrop-blur-md rounded-2xl animate-in slide-in-from-bottom-4 fade-in duration-300">
                  <AlertTriangle size={18} className="text-red-400 shrink-0 mt-0.5" />
                  <div className="flex-1 min-w-0">
                    <p className="text-[10px] font-black uppercase tracking-widest text-red-400/70 mb-1">Generation Failed</p>
                    <p className="text-xs text-red-200/90 break-words">{errorToast}</p>
                  </div>
                  <button onClick={() => setErrorToast(null)} className="text-red-400/50 hover:text-red-300 shrink-0">
                    <X size={14} />
                  </button>
                </div>
              )}

              {/* Loading Overlay */}
              {isCurrentlyBusy && (() => {
                const colors = ASSET_COLORS[modal.type] || ASSET_COLORS.video;
                const displayStatus = modal.asset?.processStatus || '';
                const progress = modal.asset?.progress;
                const percent = progress != null && progress > 0 ? `${progress}%` : null;
                const statusText = percent ? displayStatus.replace(/\s*\d+%/, '') : displayStatus;
                return (
                <div className="absolute inset-0 bg-black/90 backdrop-blur-sm z-50 flex flex-col items-center justify-center gap-8">
                  <div className="relative w-24 h-24">
                    <div className={`absolute inset-0 border-t-2 ${colors.accent} rounded-full animate-spin`} />
                    {percent && (
                      <span className={`absolute inset-0 flex items-center justify-center text-sm font-black ${colors.text}`}>{percent}</span>
                    )}
                  </div>
                  <div className="text-center space-y-2">
                    <p className="text-xs font-black uppercase text-white tracking-[0.4em] animate-pulse">{statusText}</p>
                    <p className="text-[10px] text-white/40 italic">This may take a few moments...</p>
                  </div>
                  {canCancel && (
                    <button
                      onClick={onCancel}
                      className="flex items-center gap-2 px-5 py-2.5 rounded-xl bg-white/5 hover:bg-red-500/20 border border-white/10 hover:border-red-500/30 text-white/50 hover:text-red-400 transition-all text-[10px] font-bold uppercase tracking-widest"
                    >
                      <XCircle size={14} />
                      Cancel
                    </button>
                  )}
                </div>
                );
              })()}
            </div>
            </Panel>
            <Separator className="w-1 bg-white/5 hover:bg-indigo-600 transition-all" />
            <Panel defaultSize={45} minSize={25}>
            {/* --- Right Column: Intelligence & Control --- */}
            <div className="h-full flex flex-col bg-[#0A0A0B]">
              {codeFullscreen ? (
                <div className="flex-1 flex flex-col p-4 overflow-hidden">
                  <div className="flex items-center justify-between mb-3">
                    <div className="flex items-center gap-2 text-gray-500">
                      <Code2 size={16} />
                      <span className="text-[10px] font-black uppercase tracking-widest text-white/50">Source Code</span>
                    </div>
                    <button
                      onClick={() => setCodeFullscreen(false)}
                      className="p-1.5 rounded-lg bg-white/5 hover:bg-white/10 text-white/40 hover:text-white/80 transition-all"
                      title="Exit fullscreen"
                    >
                      <Minimize2 size={14} />
                    </button>
                  </div>
                  <div className="flex-1 min-h-0">
                    <CodeEditor
                      value={generatedHtml}
                      onChange={setGeneratedHtml}
                      language={isManim ? 'python' : 'html'}
                      fullHeight
                    />
                  </div>
                </div>
              ) : (
              <div className="flex-1 p-8 overflow-y-auto custom-scrollbar space-y-10">
                
                {/* 1. Brain Selection */}
                <div className="space-y-4">
                  <div className="flex items-center gap-2 text-gray-500">
                    <Cpu size={16} />
                    <span className="text-[10px] font-black uppercase tracking-widest text-white/50">Model Intelligence</span>
                  </div>
                  <ModelGrid
                    providers={availableProviders}
                    selectedProvider={selectedProvider}
                    selectedModel={selectedModel}
                    onSelect={(p, m) => { setSelectedProvider(p); setSelectedModel(m); }}
                  />
                </div>

                {/* 2. Render Parameters */}
                <div className="space-y-4">
                  <div className="flex items-center gap-2 text-gray-500">
                    <Timer size={16} />
                    <span className="text-[10px] font-black uppercase tracking-widest text-white/50">Render Specification</span>
                  </div>
                  <div className={`grid ${isManim ? 'grid-cols-1' : 'grid-cols-2'} gap-4`}>
                    {!isManim && (
                      <div className="bg-white/[0.02] border border-white/5 rounded-2xl p-2 focus-within:border-indigo-500/50 transition-colors">
                        <p className="text-[9px] font-black text-white/30 uppercase mb-1">Length (Seconds)</p>
                        <input
                          type="number"
                          value={duration}
                          onChange={(e) => setDuration(Number(e.target.value))}
                          className="bg-transparent text-white text-sm w-full focus:outline-none font-mono"
                        />
                      </div>
                    )}
                    <div className="bg-white/[0.02] border border-white/5 rounded-2xl p-2 focus-within:border-indigo-500/50 transition-colors">
                      <p className="text-[9px] font-black text-white/30 uppercase mb-2 flex justify-between">Dimensions <Maximize size={10}/></p>
                      <div className="flex gap-2 text-xs font-mono text-indigo-400">
                        <input value={resW} onChange={e => setResW(Number(e.target.value))} className="bg-transparent w-full focus:outline-none" />
                        <span className="opacity-20 text-white">×</span>
                        <input value={resH} onChange={e => setResH(Number(e.target.value))} className="bg-transparent w-full focus:outline-none" />
                      </div>
                    </div>
                  </div>
                </div>

                {/* 3. Source Code Editor */}
                <div className="space-y-4">
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-2 text-gray-500">
                      <Code2 size={16} />
                      <span className="text-[10px] font-black uppercase tracking-widest text-white/50">Source Code</span>
                    </div>
                    <button
                      onClick={() => setCodeFullscreen(true)}
                      className="p-1.5 rounded-lg bg-white/5 hover:bg-white/10 text-white/40 hover:text-white/80 transition-all"
                      title="Fullscreen editor"
                    >
                      <Maximize size={14} />
                    </button>
                  </div>
                  <CodeEditor
                    value={generatedHtml}
                    onChange={setGeneratedHtml}
                    language={isManim ? 'python' : 'html'}
                  />
                </div>

              </div>

              )}
              
              {/* --- Footer Interaction Area --- */}
              <div className="p-8 bg-white/[0.02] border-t border-white/5 space-y-6">
                <div className="relative">
                  <textarea
                    value={localPrompt} 
                    onChange={(e) => setLocalPrompt(e.target.value)}
                    placeholder={generatedHtml ? "Provide refinement (e.g., 'Make the text bold')..." : "Describe your vision..."}
                    className="w-full bg-black border border-white/10 rounded-2xl p-5 text-sm text-white placeholder:text-white/20 focus:outline-none focus:border-indigo-500/50 min-h-[120px] resize-none disabled:opacity-40 disabled:cursor-not-allowed"
                    disabled={isCurrentlyBusy}
                  />
                </div>

                <div className="flex gap-4">
                  {/* 1. Generate/Update Button */}
                  <button
                    onClick={handleGenerateHTML}
                    disabled={isCurrentlyBusy || !localPrompt.trim() || !selectedModel}
                    className="flex-1 flex items-center justify-center gap-3 py-4 rounded-2xl font-bold text-[11px] uppercase tracking-[0.2em] transition-all active:scale-[0.98] disabled:opacity-30 bg-white/5 hover:bg-white/10 text-white border border-white/5"
                  >
                    {generatedHtml ? <RotateCcw size={16}/> : <Sparkles size={16}/>}
                    {generatedHtml ? 'Update Code' : 'Generate Code'}
                  </button>

                  {/* 2. Render Button Logic */}
                  {generatedHtml && (
                    isManim ? (
                      /* MANIM: Standard Button (Server Only) */
                      <button
                        onClick={() => handleRenderVideo('server')}
                        disabled={isCurrentlyBusy}
                        className="flex-1 flex items-center justify-center gap-3 py-4 rounded-2xl font-bold text-[11px] uppercase tracking-[0.2em] transition-all active:scale-[0.98] disabled:opacity-30 bg-indigo-600 text-white shadow-[0_0_20px_rgba(99,102,241,0.4)] hover:bg-indigo-500"
                      >
                        <Cloud size={16} />
                        Render on Server
                      </button>
                    ) : (
                      /* HTML: Split Button (Client + Server) */
                      <SplitButton
                        options={[
                          { 
                            value: 'client', 
                            label: 'Render in Browser', 
                            buttonLabel: 'Render', 
                            description: 'Instant local capture', 
                            icon: Cpu 
                          },
                          { 
                            value: 'server', 
                            label: 'Render on Server', 
                            buttonLabel: 'Render', 
                            description: 'Stable cloud rendering', 
                            icon: Cloud 
                          }
                        ]}
                        selectedValue={renderMode}
                        onValueChange={setRenderMode}
                        onAction={handleRenderVideo}
                        disabled={isCurrentlyBusy}
                        className="flex-1"
                      />
                    )
                  )}
                </div>
              </div>
            </div>
            </Panel>
          </Group>
        </div>
      </div>
    </div>
  );
};