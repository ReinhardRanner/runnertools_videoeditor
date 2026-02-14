import React, { useState, useRef, useEffect, useCallback } from 'react';
import * as Resizable from 'react-resizable-panels'; 
import { Film, Download, ChevronDown, Zap, Settings, Volume2 } from 'lucide-react';
import { EditorItem } from './components/Preview/EditorItem';
import { timeStore } from './utils/TimeStore';

// Modular Imports
import { Asset, TrackItem } from './types';
import { FileExplorer } from './components/FileExplorer';
import { Timeline } from './components/Timeline/Timeline';
import { PreviewCanvas } from './components/Preview/PreviewCanvas';
import { MediaClipPlayer } from './components/Preview/MediaClipPlayer';
import { PropertiesPanel } from './components/PropertiesPanel';
import { StealthSelect } from './components/UI/StealthSelect';

// Hooks & Modals
import { useFFmpeg } from './hooks/useFFmpeg';
import { useGenerativeAI } from './hooks/useGenerativeAI';
import { GenerativeModal } from './components/GenerativeModal';
import { TTSModal } from './components/TTSModal';
import { ExportOverlay } from './components/ExportOverlay';

const { Group, Panel, Separator } = Resizable;

export default function App() {
  // --- Project State ---
  const [assets, setAssets] = useState<Asset[]>([]);
  const [timelineItems, setTimelineItems] = useState<TrackItem[]>([]);
  const [selectedInstanceId, setSelectedInstanceId] = useState<string | null>(null);
  const [isPlaying, setIsPlaying] = useState(false);
  const [currentTime, setCurrentTime] = useState(0);
  const [isPreviewMuted, setIsPreviewMuted] = useState(false);
  const [previewFps, setPreviewFps] = useState(60);
  const [previewDownscale, setPreviewDownscale] = useState(0.5);
  
  // --- Canvas & Tools ---
  const [canvasZoom, setCanvasZoom] = useState(0.45);
  const [timelineZoom, setTimelineZoom] = useState(60);
  const [resolution, setResolution] = useState({ w: 1920, h: 1080 });
  const [tool, setTool] = useState<'select' | 'hand'>('select');
  const [isShiftPressed, setIsShiftPressed] = useState(false);
  const [isCtrlPressed, setIsCtrlPressed] = useState(false);

  // --- Export Settings ---
  const [isRenderMenuOpen, setIsRenderMenuOpen] = useState(false);
  const [renderSettings, setRenderSettings] = useState({
    format: 'mp4',
    scale: 1,
    fps: 30,
    qualityLabel: 'High Quality',
    crf: 23,
    preset: 'ultrafast'
  });

  const QUALITY_LEVELS = [
    { label: 'Lossless', crf: 0, desc: 'Maximum file size' },
    { label: 'Production', crf: 18, desc: 'Visually transparent' },
    { label: 'High Quality', crf: 23, desc: 'Balanced (Recommended)' },
    { label: 'Compressed', crf: 30, desc: 'Small file, minor loss' },
    { label: 'Potato', crf: 45, desc: 'Maximum compression' },
  ];
  const FORMATS = ['mp4', 'webm', 'mov'];

  // --- Custom Hooks ---
  const { handleExport, cancelExport, resetStatus, progress, status, loaded: ffmpegLoaded } = useFFmpeg(resolution);
  const { onGenerateHTML, onRenderVideo, cancel: cancelGeneration, canCancel, status: genStatus } = useGenerativeAI();
  const [dynamicModal, setDynamicModal] = useState<{ open: boolean, type: 'html' | 'manim', asset: Asset } | null>(null);
  const dynamicModalRef = useRef(dynamicModal);
  dynamicModalRef.current = dynamicModal;

  // --- TTS State ---
  const [ttsModalOpen, setTtsModalOpen] = useState(false);
  const [isTTSGenerating, setIsTTSGenerating] = useState(false);

  const lastTimeRef = useRef(performance.now());

  // Inside your App component:
  const renderMenuRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const handleClickOutside = (e: MouseEvent) => {
      if (renderMenuRef.current && !renderMenuRef.current.contains(e.target as Node)) {
        setIsRenderMenuOpen(false);
      }
    };
    if (isRenderMenuOpen) {
      window.addEventListener('mousedown', handleClickOutside);
    }
    return () => window.removeEventListener('mousedown', handleClickOutside);
  }, [isRenderMenuOpen]);

  // 2. Fix the loop in App.tsx
  useEffect(() => {
    timeStore.update(currentTime, isPlaying);
  }, [isPlaying]);

  // 2. The Unified Heartbeat Loop
  useEffect(() => {
    let frameId: number;
    let lastTime = performance.now();

    const loop = () => {
      if (isPlaying) {
        const now = performance.now();
        const delta = (now - lastTime) / 1000;
        lastTime = now;
        
        const nextTime = timeStore.currentTime + delta;
        
        // Update the Store (60fps)
        timeStore.update(nextTime, isPlaying);

        // Throttled Sync to React (only 10fps) to keep 'isVisible' logic working 
        // without destroying performance.
        if (Math.abs(nextTime - currentTime) > 0.1) {
          setCurrentTime(nextTime);
        }
      } else {
        lastTime = performance.now();
      }
      frameId = requestAnimationFrame(loop);
    };
    
    frameId = requestAnimationFrame(loop);
    return () => cancelAnimationFrame(frameId);
  }, [isPlaying, currentTime]);

  // --- Actions ---
  const onSplit = useCallback(() => {
    const selected = timelineItems.find(i => i.instanceId === selectedInstanceId);
    if (!selected) return;
    const rel = currentTime - selected.startTime;
    if (rel <= 0.1 || rel >= selected.duration - 0.1) return;
    const first = { ...selected, duration: rel };
    const second: TrackItem = { 
      ...selected, 
      instanceId: Math.random().toString(36).substr(2, 9), 
      startTime: currentTime, 
      duration: selected.duration - rel, 
      startTimeOffset: selected.startTimeOffset + rel 
    };
    setTimelineItems(prev => prev.flatMap(i => i.instanceId === selectedInstanceId ? [first, second] : i));
  }, [timelineItems, selectedInstanceId, currentTime]);

  const handleUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    if (!e.target.files) return;
    Array.from(e.target.files).forEach((file) => {
      const url = URL.createObjectURL(file);
      const id = Math.random().toString(36).substr(2, 9);

      if (file.type.startsWith('video')) {
        const v = document.createElement('video');
        v.src = url;
        v.onloadedmetadata = () => setAssets(prev => [...prev, { 
          id, name: file.name, type: 'video', url, file, 
          duration: v.duration, 
          resolution: { w: v.videoWidth, h: v.videoHeight } 
        }]);
      } 
      else if (file.type.startsWith('audio')) {
        const a = new Audio();
        a.src = url;
        a.onloadedmetadata = () => setAssets(prev => [...prev, { 
          id, name: file.name, type: 'audio', url, file, 
          duration: a.duration 
        }]);
      } 
      else if (file.type.startsWith('image')) {
        const img = new Image();
        img.src = url;
        img.onload = () => {
          setAssets(prev => [...prev, { 
            id, name: file.name, type: 'image', url, file, 
            duration: 5, // <--- DEFAULT DURATION (5 seconds)
            resolution: { w: img.naturalWidth, h: img.naturalHeight } // <--- REAL SIZE
          }]);
        };
      }
    });
  };

  const handleCaptureFrame = (name: string, dataUrl: string) => {
    const id = Math.random().toString(36).substr(2, 9);
    
    // Convert DataURL to a File object so it behaves like a real upload
    fetch(dataUrl)
      .then(res => res.blob())
      .then(blob => {
        const file = new File([blob], `${name}.jpg`, { type: 'image/jpeg' });
        
        const newAsset: Asset = {
          id,
          name: `${name}.jpg`,
          type: 'image',
          url: dataUrl, // Use the generated URL
          file,
          duration: 5, // Default for new images
        };

        setAssets(prev => [...prev, newAsset]);
      });
  };

  const updateAsset = (id: string, updates: Partial<Asset>) => {
    setAssets(prev => prev.map(a => a.id === id ? { ...a, ...updates } : a));
    
    // If the modal is currently looking at this asset, update its view too
    if (dynamicModalRef.current?.asset?.id === id) {
      setDynamicModal(prev => prev ? { ...prev, asset: { ...prev.asset!, ...updates } } : null);
    }
  };

  const addAssetToTimeline = (asset: Asset) => {
    const itemWidth = asset.resolution?.w || 400;
    const itemHeight = asset.resolution?.h || 225;

    const newItem: TrackItem = {
      ...asset,
      url: asset.url || '',
      instanceId: crypto.randomUUID(),
      startTime: currentTime,
      duration: asset.duration,
      sourceDuration: asset.duration,
      startTimeOffset: 0,
      layer: timelineItems.length,
      x: (resolution.w / 2) - (itemWidth / 2),
      y: (resolution.h / 2) - (itemHeight / 2),
      width: itemWidth,
      height: itemHeight,
      rotation: 0,
      opacity: 1,
      volume: 1,
      fadeInDuration: 0.5,
      fadeOutDuration: 0.5
    };
    setTimelineItems(prev => [...prev, newItem]);
    setSelectedInstanceId(newItem.instanceId);
  };

  const updateSelectedItem = (updates: Partial<TrackItem>) => {
    if (!selectedInstanceId) return;
    setTimelineItems(prev => prev.map(item => item.instanceId === selectedInstanceId ? { ...item, ...updates } : item));
  };

  const handleGenerateHTML = async (prompt: string, providerId: string, modelId: string, oldCode?: string): Promise<string> => {
    const modal = dynamicModalRef.current!;
    const assetId = modal.asset?.id || crypto.randomUUID();

    // 1. Initialize or get the asset
    const existing = assets.find(a => a.id === assetId);
    if (!existing) {
      const newDraft: Asset = {
        id: assetId,
        name: `${modal.type}_${prompt.substring(0, 10)}`,
        type: modal.type,
        code: oldCode || '',
        prompt,
        duration: 5,
        isProcessing: true,
        processStatus: 'Thinking...',
        processError: null
      };
      setAssets(prev => [...prev, newDraft]);
      setDynamicModal({ ...modal, asset: newDraft });
    } else {
      updateAsset(assetId, { isProcessing: true, processStatus: 'Refining code...', processError: null, prompt });
    }

    try {
      const code = await onGenerateHTML(modal.type, prompt, providerId, modelId, oldCode);
      updateAsset(assetId, { code, isProcessing: false, processStatus: '' });
      return code;
    } catch (err: any) {
      const isCancelled = err.message === 'Cancelled';
      updateAsset(assetId, { isProcessing: false, ...(!isCancelled && { processError: err.message }) });
      throw err;
    }
  };

  const handleRenderVideo = async (code: string, duration: number, res: { w: number; h: number }): Promise<string> => {
    const modal = dynamicModalRef.current!;
    const assetId = modal.asset?.id;
    if (!assetId) return "";

    // Set this specific asset to processing
    updateAsset(assetId, {
      isProcessing: true,
      processStatus: 'Rendering 0%',
      processError: null,
      code // Save the code used for rendering
    });

    try {
      // Note: If your useGenerativeAI hook doesn't support multiple parallel renders, 
      // you'll need to refactor the hook itself to be stateless.
      const videoUrl = await onRenderVideo(modal.type, code, duration, res, (progress, statusText) => {
        updateAsset(assetId, { progress, processStatus: statusText });
      });

      updateAsset(assetId, {
        url: videoUrl,
        duration: duration,
        resolution: res,
        isProcessing: false,
        processStatus: 'Complete'
      });

      return videoUrl;
    } catch (err: any) {
      const isCancelled = err.message === 'Cancelled';
      updateAsset(assetId, { isProcessing: false, ...(!isCancelled && { processError: err.message }) });
      throw err;
    }
  };

  // --- TTS Generation ---
  const handleTTSGenerate = async (text: string, voice: string) => {
    setIsTTSGenerating(true);
    try {
      const res = await fetch('https://runnertools.demo3.at/api/TTS', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ text, voice })
      });
      const blob = await res.blob();
      const url = URL.createObjectURL(blob);

      // Get audio duration
      const audio = new Audio(url);
      await new Promise<void>(resolve => {
        audio.onloadedmetadata = () => resolve();
      });

      const newAsset: Asset = {
        id: Math.random().toString(36).substring(2, 9),
        name: `TTS_${text.substring(0, 15)}...`,
        type: 'audio',
        url,
        duration: audio.duration,
      };
      setAssets(prev => [...prev, newAsset]);
      setTtsModalOpen(false);
    } catch (e) {
      console.error('TTS Generation failed:', e);
    } finally {
      setIsTTSGenerating(false);
    }
  };

  // --- Keyboard Shortcuts ---
  useEffect(() => {
    const down = (e: KeyboardEvent) => {
      if (e.target instanceof HTMLInputElement || e.target instanceof HTMLTextAreaElement) return;
      if (e.shiftKey) setIsShiftPressed(true);
      if (e.ctrlKey || e.metaKey) setIsCtrlPressed(true);
      if (e.code === 'KeyV') setTool('select');
      if (e.code === 'KeyH') setTool('hand');
      if (e.code === 'Space') { e.preventDefault(); setIsPlaying(!isPlaying); }
      if (e.code === 'KeyS') { e.preventDefault(); onSplit(); }
      if ((e.code === 'Delete' || e.code === 'Backspace') && selectedInstanceId) {
        setTimelineItems(prev => prev.filter(i => i.instanceId !== selectedInstanceId));
        setSelectedInstanceId(null);
      }
    };
    const up = (e: KeyboardEvent) => { 
      if (e.key === 'Shift') setIsShiftPressed(false);
      if (e.key === 'Control' || e.key === 'Meta') setIsCtrlPressed(false);
    };
    window.addEventListener('keydown', down); window.addEventListener('keyup', up);
    return () => { window.removeEventListener('keydown', down); window.removeEventListener('keyup', up); };
  }, [isPlaying, onSplit, selectedInstanceId]);

  const currentItem = timelineItems.find(i => i.instanceId === selectedInstanceId);

  return (
    <div className="flex flex-col w-screen h-screen bg-bg-base text-gray-200 overflow-hidden font-sans select-none">
      {/* --- GLOBAL BACKDROP --- */}
      {/* We place this outside the nav so it covers the entire viewport */}
      <div 
        onClick={() => setIsRenderMenuOpen(false)}
        className={`fixed inset-0 z-[550] transition-all duration-500 ease-in-out ${
          isRenderMenuOpen 
          ? 'bg-black/60 backdrop-blur-md opacity-100 visible' 
          : 'bg-black/0 backdrop-blur-none opacity-0 invisible pointer-events-none'
        }`} 
      />

      {/* --- HEADER BAR --- */}
      <nav className="h-12 border-b border-white/5 flex items-center justify-between px-6 bg-darkgrey z-[600] relative">
        <div className="flex items-center gap-3">
          <Film size={16} />
          <span className="text-[11px] font-black uppercase tracking-[0.2em] text-white/80 italic">Runner Editor</span>
        </div>
        
        <div className="relative" ref={renderMenuRef}>
          <button 
            onClick={() => setIsRenderMenuOpen(!isRenderMenuOpen)}
            className={`group h-9 px-5 rounded-xl flex items-center gap-3 transition-all duration-300 border z-[610] relative ${
              isRenderMenuOpen 
              ? 'bg-indigo-600 border-indigo-400 text-white shadow-[0_0_20px_rgba(99,102,241,0.4)]' 
              : 'bg-white/5 border-white/10 text-gray-400 hover:bg-white/10 hover:text-white'
            }`}
          >
            <Download size={14} className={isRenderMenuOpen ? 'animate-bounce' : ''} /> 
            <span className="text-[10px] font-black uppercase tracking-widest">
              {status !== 'idle' ? `Processing ${progress}%` : 'Export'}
            </span>
            <ChevronDown size={14} className={`transition-transform duration-500 ${isRenderMenuOpen ? 'rotate-180' : ''}`} />
          </button>

          {/* MENU WITH ZOOM & FADE ANIMATION */}
          <div className={`absolute top-12 right-0 w-72 bg-[#0d0d0d] border border-white/10 rounded-[2rem] shadow-2xl z-[610] p-5 transition-all duration-300 origin-top-right backdrop-blur-3xl ${
            isRenderMenuOpen 
            ? 'opacity-100 scale-100 translate-y-0 visible' 
            : 'opacity-0 scale-95 -translate-y-2 invisible pointer-events-none'
          }`}>
            <div className="space-y-5">
              <div className="px-1 flex items-center justify-between">
                <span className="text-[10px] font-black uppercase tracking-widest text-white/40">Settings</span>
                <div className="h-px flex-1 bg-white/5 ml-4" />
              </div>

              <StealthSelect label="Format" value={renderSettings.format} options={FORMATS.map(f => ({ label: `.${f.toUpperCase()}`, value: f }))} onChange={(f) => setRenderSettings({...renderSettings, format: f})} />
              
              <div className="grid grid-cols-3 gap-1.5 p-1 bg-black/40 rounded-xl border border-white/5">
                {[1, 0.5, 0.25].map((s) => (
                  <button 
                    key={s} 
                    onClick={() => setRenderSettings({...renderSettings, scale: s})} 
                    className={`py-2 rounded-lg text-[9px] font-black transition-all ${renderSettings.scale === s ? 'bg-indigo-600 text-white shadow-lg' : 'text-gray-500 hover:text-gray-300'}`}
                  >
                    {s === 1 ? '4K/HD' : s === 0.5 ? '720P' : '480P'}
                  </button>
                ))}
              </div>

              <div className="grid grid-cols-2 gap-3">
                <StealthSelect label="Quality" value={renderSettings.crf} options={QUALITY_LEVELS.map(q => ({ label: q.label, value: q.crf }))} onChange={(val) => setRenderSettings({...renderSettings, crf: val as number})} />
                <StealthSelect label="Rate" value={renderSettings.fps} options={[24, 30, 60].map(f => ({ label: `${f} FPS`, value: f }))} onChange={(f) => setRenderSettings({...renderSettings, fps: f as number})} />
              </div>

              <button 
                onClick={() => {
                  setIsRenderMenuOpen(false);
                  handleExport(timelineItems, renderSettings);
                }} 
                disabled={status !== 'idle'} 
                className="w-full h-12 bg-gradient-to-br from-indigo-500 to-indigo-700 hover:from-indigo-400 hover:to-indigo-600 text-white rounded-xl font-black uppercase text-[11px] tracking-widest transition-all active:scale-95 shadow-[0_10px_20px_rgba(79,70,229,0.3)] flex items-center justify-center gap-2"
              >
                <Zap size={16} fill="currentColor" /> Render
              </button>
            </div>
          </div>
        </div>
      </nav>

      {/* --- MAIN LAYOUT --- */}
      <div className="flex-1 min-h-0">
        <Group orientation="vertical">
          <Panel defaultSize={65}>
            <Group orientation="horizontal">
              <Panel defaultSize={20} className="bg-bg-surface p-4 border-r border-border-default">
                <FileExplorer
                  assets={assets} onUpload={handleUpload} onAdd={addAssetToTimeline}
                  onDelete={(id) => setAssets(prev => prev.filter(a => a.id !== id))}
                  onRename={(id, newName) => {
                    setAssets(prev => prev.map(a => a.id === id ? { ...a, name: newName } : a));
                    setTimelineItems(prev => prev.map(i => i.id === id ? { ...i, name: newName } : i));
                  }}
                  onCreateDynamic={(type) => {
                    const newAssetId = crypto.randomUUID();
  
                    const newAsset: Asset = {
                      id: newAssetId,
                      name: `New ${type.toUpperCase()}`,
                      type: type,
                      url: '',
                      code: '',
                      prompt: '',
                      isProcessing: false
                    };
                    if (type === 'html') {
                      newAsset.duration = 5;
                    }

                    setAssets(prev => [...prev, newAsset]);
                    setDynamicModal({ open: true, type, asset: newAsset });
                  }}
                  onEditDynamic={(asset) => {
                    setDynamicModal({ open: true, type: asset.type as 'html' | 'manim', asset });
                  }}
                  onCreateTTS={() => setTtsModalOpen(true)}
                />
              </Panel>
              <Separator className="w-1 bg-bg-canvas-deep hover:bg-indigo-600 transition-all" />

              <Panel defaultSize={60} className="relative bg-bg-canvas">
                <PreviewCanvas 
                  zoom={canvasZoom} setZoom={setCanvasZoom} resolution={resolution} setResolution={setResolution} 
                  tool={tool} setTool={setTool} isMuted={isPreviewMuted} setIsMuted={setIsPreviewMuted}
                  onMouseDown={() => setSelectedInstanceId(null)}previewFps={previewFps}
                  setPreviewFps={setPreviewFps}
                  previewDownscale={previewDownscale}
                  setPreviewDownscale={setPreviewDownscale}
                >
                  {[...timelineItems].sort((a, b) => b.layer - a.layer).map((item) => {
                    const isVisible = currentTime >= item.startTime && currentTime <= (item.startTime + item.duration);
                    // console.log(`Item ${item.name} is ${isVisible ? 'visible' : 'hidden'} at time ${currentTime.toFixed(2)}s (starts at ${item.startTime}s, duration ${item.duration}s)`);
                    const isNear = currentTime >= (item.startTime - 2) && currentTime <= (item.startTime + item.duration + 2);
                    // if (!isVisible) return null;
                    
                    if (!isNear) return null;
                    return (
                      <div key={item.instanceId} style={{ opacity: isVisible ? 1 : 0 }}>
                        <EditorItem
                          id={item.instanceId}
                          type={item.type}
                          name={item.name}
                          tool={tool}
                          
                          // Position & Props
                          isSelected={selectedInstanceId === item.instanceId}
                          x={item.x}
                          y={item.y}
                          width={item.width}
                          height={item.height}
                          rotation={item.rotation}
                          zoom={canvasZoom} // <--- WICHTIGSTER PARAMETER
                          canvasResolution={resolution}
                          zIndex={20 - item.layer}
                          // opacity={item.opacity}
                          // visibility={isVisible ? 'visible' : 'hidden'}
                          
                          // Events
                          onSelect={() => setSelectedInstanceId(item.instanceId)}
                          onUpdate={(id, updates) => updateSelectedItem(updates)}
                        >
                          {/* Child Content */}
                          <MediaClipPlayer 
                            item={item}
                            isMuted={isPreviewMuted}
                            previewFps={previewFps} 
                            previewDownscale={previewDownscale}
                          />
                        </EditorItem>
                      </div>
                    );
                  })}
                </PreviewCanvas>
              </Panel>

              <Separator className="w-1 bg-bg-canvas-deep hover:bg-indigo-600 transition-all" />
              <Panel defaultSize={20} className="bg-bg-surface p-5 border-l border-border-default overflow-y-auto">
                <PropertiesPanel item={currentItem} onUpdate={updateSelectedItem} onDelete={() => { setTimelineItems(prev => prev.filter(i => i.instanceId !== selectedInstanceId)); setSelectedInstanceId(null); }} />
              </Panel>
            </Group>
          </Panel>

          <Separator className="h-1 bg-bg-canvas-deep hover:bg-indigo-600 transition-all" />
          <Panel defaultSize={25} minSize={20}>
            <Timeline items={timelineItems} setItems={setTimelineItems} currentTime={currentTime} setCurrentTime={setCurrentTime} isPlaying={isPlaying} setIsPlaying={setIsPlaying} zoom={timelineZoom} setZoom={setTimelineZoom} selectedId={selectedInstanceId} setSelectedId={setSelectedInstanceId} onSplit={onSplit} onCaptureFrame={handleCaptureFrame} />
          </Panel>
        </Group>
      </div>

      {/* --- OVERLAYS --- */}
      <GenerativeModal
        key={dynamicModal?.asset?.id || `new-session-${dynamicModal?.type}`}
        modal={dynamicModal}
        resolution={resolution}
        onClose={() => setDynamicModal(null)}
        onGenerateHTML={handleGenerateHTML}
        onRenderVideo={handleRenderVideo}
        onCancel={cancelGeneration}
        onRename={(id, newName) => {
          setAssets(prev => prev.map(a => a.id === id ? { ...a, name: newName } : a));
          setTimelineItems(prev => prev.map(i => i.id === id ? { ...i, name: newName } : i));
          setDynamicModal(prev => prev?.asset?.id === id ? { ...prev, asset: { ...prev.asset!, name: newName } } : prev);
        }}
        onCodeChange={(code) => {
          const activeId = dynamicModal?.asset?.id;
          if (!activeId) return;
          const modal = dynamicModalRef.current;
          setAssets(prev => prev.map(a => a.id === modal?.asset!.id ? { ...a, code } : a));
          setDynamicModal(prev => prev?.asset ? { ...prev, asset: { ...prev.asset, code } } : prev);
        }}
        onUpdateAsset={(id, updates) => {
          setAssets(prev => prev.map(a => a.id === id ? { ...a, ...updates } : a));
          // Also sync the modal's internal view if it's the active asset
          if (dynamicModal?.asset?.id === id) {
            setDynamicModal(prev => prev ? { ...prev, asset: { ...prev.asset!, ...updates } } : null);
          }
        }}
        canCancel={canCancel}
        status={genStatus}
      />
      <TTSModal
        open={ttsModalOpen}
        onClose={() => setTtsModalOpen(false)}
        onGenerate={handleTTSGenerate}
        isGenerating={isTTSGenerating}
      />
      <ExportOverlay status={status} progress={progress} onCancel={cancelExport} onClose={resetStatus} />
    </div>
  );
}