import React, { useState, useRef, useEffect, useCallback } from 'react';
import * as Resizable from 'react-resizable-panels'; 
import { Film, Download, ChevronDown, Zap, Settings, Volume2 } from 'lucide-react';
import Moveable from "react-moveable";

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
  const { handleExport, cancelExport, progress, status, loaded: ffmpegLoaded } = useFFmpeg(resolution);
  const { generate, isGenerating, status: genStatus } = useGenerativeAI();
  const [dynamicModal, setDynamicModal] = useState<{ open: boolean, type: 'html' | 'manim', asset?: Asset } | null>(null);

  // --- TTS State ---
  const [ttsModalOpen, setTtsModalOpen] = useState(false);
  const [isTTSGenerating, setIsTTSGenerating] = useState(false);

  const lastTimeRef = useRef(performance.now());

  // --- Playback Loop ---
  useEffect(() => {
    let frameId: number;
    const loop = () => {
      if (isPlaying) {
        const now = performance.now();
        const delta = (now - lastTimeRef.current) / 1000;
        lastTimeRef.current = now;
        setCurrentTime(prev => prev + delta);
      } else { lastTimeRef.current = performance.now(); }
      frameId = requestAnimationFrame(loop);
    };
    frameId = requestAnimationFrame(loop);
    return () => cancelAnimationFrame(frameId);
  }, [isPlaying]);

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
        const v = document.createElement('video'); v.src = url;
        v.onloadedmetadata = () => setAssets(prev => [...prev, { id, name: file.name, type: 'video', url, file, sourceDuration: v.duration }]);
      } else if (file.type.startsWith('audio')) {
        const a = new Audio(); a.src = url;
        a.onloadedmetadata = () => setAssets(prev => [...prev, { id, name: file.name, type: 'audio', url, file, sourceDuration: a.duration }]);
      } else if (file.type.startsWith('image')) {
        setAssets(prev => [...prev, { id, name: file.name, type: 'image', url, file, sourceDuration: 3600 }]);
      }
    });
  };

  const addAssetToTimeline = (asset: Asset) => {
    // Use source dimensions if available (for generated content), otherwise use defaults
    const itemWidth = asset.sourceWidth || 400;
    const itemHeight = asset.sourceHeight || 225;

    const newItem: TrackItem = {
      ...asset,
      instanceId: Math.random().toString(36).substr(2, 9),
      startTime: currentTime,
      duration: asset.sourceDuration,
      startTimeOffset: 0,
      layer: timelineItems.length,
      x: (resolution.w / 2) - (itemWidth / 2),
      y: (resolution.h / 2) - (itemHeight / 2),
      width: itemWidth,
      height: itemHeight,
      rotation: 0,
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

  // In App.tsx
  const handleAddDynamic = async (
    prompt: string, 
    providerId: string, 
    modelId: string, 
    duration: number, 
    res: { w: number, h: number }
  ) => {
    // WICHTIG: Die Argumente müssen hier in den generate-Aufruf!
    const result = await generate(
      dynamicModal!.type, 
      prompt, 
      providerId, 
      modelId, 
      duration,
      res,
      dynamicModal?.asset?.code
    );

    if (result) {
      const assetId = dynamicModal?.asset?.id || Math.random().toString(36).substring(2, 9);
      const newAsset: Asset = {
        id: assetId,
        name: `${dynamicModal!.type}_${prompt.substring(0, 10)}`,
        type: dynamicModal!.type,
        url: result.url,
        sourceDuration: duration,
        sourceWidth: res.w,
        sourceHeight: res.h,
        code: result.code,
        prompt: prompt,
      };

      setAssets(prev =>
        dynamicModal?.asset
          ? prev.map(a => a.id === newAsset.id ? newAsset : a)
          : [...prev, newAsset]
      );

      // Update modal with new asset to show preview, but keep it open
      setDynamicModal({ ...dynamicModal!, asset: newAsset });
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
        sourceDuration: audio.duration,
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
      {/* --- HEADER BAR --- */}
      <nav className="h-12 border-b border-border-strong flex items-center justify-between px-4 bg-bg-surface z-[100] shadow-xl">
        <div className="flex items-center gap-2 font-black text-indigo-500 italic uppercase tracking-tighter">
          <Film size={18} /> Video Editor
        </div>
        
        <div className="relative">
          <button 
            onClick={() => setIsRenderMenuOpen(!isRenderMenuOpen)}
            className="group relative bg-bg-canvas hover:bg-indigo-600 border border-border-default text-white h-10 px-5 rounded-2xl flex items-center gap-3 text-[11px] font-black uppercase transition-all duration-300"
          >
            <Download size={14} /> 
            <span>{status !== 'idle' ? `Rendering ${progress}%` : 'Export Project'}</span>
            <ChevronDown size={14} className={isRenderMenuOpen ? 'rotate-180' : ''} />
          </button>

          {isRenderMenuOpen && (
            <div className="absolute top-14 right-0 w-80 bg-bg-elevated/95 backdrop-blur-xl border border-border-default rounded-3xl shadow-2xl z-[510] p-6 animate-in zoom-in-95 duration-200 origin-top-right">
              <div className="space-y-6">
                <StealthSelect label="Format" value={renderSettings.format} options={FORMATS.map(f => ({ label: `.${f.toUpperCase()}`, value: f }))} onChange={(f) => setRenderSettings({...renderSettings, format: f})} />
                
                <div>
                  <p className="text-[9px] font-black text-white/20 uppercase tracking-[0.2em] mb-3 px-1">Resolution</p>
                  <div className="grid grid-cols-3 gap-2">
                    {[1, 0.5, 0.25].map((s) => (
                      <button key={s} onClick={() => setRenderSettings({...renderSettings, scale: s})} className={`py-3 rounded-2xl border transition-all ${renderSettings.scale === s ? 'bg-indigo-500/10 border-indigo-500/50 text-indigo-400' : 'bg-white/5 border-white/5 text-gray-500'}`}>
                        <span className="text-[12px] font-black">{s === 1 ? 'FULL' : s === 0.5 ? '1/2' : '1/4'}</span>
                      </button>
                    ))}
                  </div>
                </div>

                <div className="grid grid-cols-2 gap-2">
                  <StealthSelect label="Encoding" value={renderSettings.crf} options={QUALITY_LEVELS.map(q => ({ label: q.label, value: q.crf }))} onChange={(val) => setRenderSettings({...renderSettings, crf: val as number})} />
                  <StealthSelect label="Framerate" value={renderSettings.fps} options={[24, 30, 60].map(f => ({ label: `${f} FPS`, value: f }))} onChange={(f) => setRenderSettings({...renderSettings, fps: f as number})} />
                </div>

                <button onClick={() => handleExport(timelineItems, renderSettings)} disabled={status !== 'idle'} className="w-full h-14 bg-white hover:bg-indigo-400 text-black rounded-2xl font-black uppercase text-[12px] transition-all"><Zap size={18} className="inline mr-2"/> Initiate Render</button>
              </div>
            </div>
          )}
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
                  onCreateDynamic={(type) => setDynamicModal({ open: true, type })}
                  onEditDynamic={(asset) => { setDynamicModal({ open: true, type: asset.type as any, asset }); }}
                  onCreateTTS={() => setTtsModalOpen(true)}
                />
              </Panel>
              <Separator className="w-1 bg-bg-canvas-deep hover:bg-indigo-600 transition-all" />

              <Panel defaultSize={60} className="relative bg-bg-canvas">
                <PreviewCanvas 
                  zoom={canvasZoom} setZoom={setCanvasZoom} resolution={resolution} setResolution={setResolution} 
                  tool={tool} setTool={setTool} isMuted={isPreviewMuted} setIsMuted={setIsPreviewMuted}
                  onMouseDown={() => setSelectedInstanceId(null)}
                >
                  {[...timelineItems].sort((a, b) => b.layer - a.layer).map((item) => {
                    const isVisible = currentTime >= item.startTime && currentTime <= (item.startTime + item.duration);
                    if (!isVisible) return null;
                    return (
                      <div key={item.instanceId} onMouseDown={(e) => e.stopPropagation()}>
                        <div id={`target-${item.instanceId}`} className="absolute" style={{ width: item.width, height: item.height, zIndex: 100 - item.layer, transform: `translate(${item.x}px, ${item.y}px) rotate(${item.rotation}deg)` }} onMouseDown={() => setSelectedInstanceId(item.instanceId)}>
                          {item.type === 'audio' && <div className="absolute inset-0 flex flex-col items-center justify-center bg-indigo-500/10 border-2 border-dashed border-indigo-500/30 rounded-lg pointer-events-none"><Volume2 className="text-indigo-400 opacity-40" size={48} /><span className="text-[10px] font-black text-indigo-400/40 uppercase mt-2 tracking-tighter">{item.name}</span></div>}
                          <MediaClipPlayer item={item} currentTime={currentTime} isPlaying={isPlaying} isMuted={isPreviewMuted} />
                        </div>
                        {selectedInstanceId === item.instanceId && (
                          <Moveable
                            target={document.querySelector(`#target-${item.instanceId}`)}
                            draggable={tool === 'select'}
                            resizable={tool === 'select'}
                            rotatable={tool === 'select'}
                            snappable
                            snapCenter
                            snapThreshold={10}
                            zoom={1/canvasZoom}
                            keepRatio={isShiftPressed}
                            verticalGuidelines={[0, resolution.w / 2, resolution.w]}
                            horizontalGuidelines={[0, resolution.h / 2, resolution.h]}
                            elementGuidelines={timelineItems
                              .filter(i => i.instanceId !== item.instanceId && currentTime >= i.startTime && currentTime <= i.startTime + i.duration)
                              .map(i => document.querySelector(`#target-${i.instanceId}`) as HTMLElement)
                              .filter(Boolean)}
                            onDrag={({ target, transform }) => target.style.transform = transform}
                            onDragEnd={() => { const m = new WebKitCSSMatrix((document.querySelector(`#target-${selectedInstanceId}`) as HTMLElement).style.transform); updateSelectedItem({ x: m.m41, y: m.m42 }); }}
                            onResize={e => { e.target.style.width = `${e.width}px`; e.target.style.height = `${e.height}px`; e.target.style.transform = e.drag.transform; }}
                            onResizeEnd={({ target }) => { const m = new WebKitCSSMatrix(target.style.transform); updateSelectedItem({ width: target.offsetWidth, height: target.offsetHeight, x: m.m41, y: m.m42 }); }}
                            onRotate={({ target, transform }) => target.style.transform = transform}
                            onRotateEnd={({ target }) => { const r = target.style.transform.match(/rotate\((.+?)deg\)/); updateSelectedItem({ rotation: r ? parseFloat(r[1]) : 0 }); }}
                          />
                        )}
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
          <Panel defaultSize={35} minSize={20}>
            <Timeline items={timelineItems} setItems={setTimelineItems} currentTime={currentTime} setCurrentTime={setCurrentTime} isPlaying={isPlaying} setIsPlaying={setIsPlaying} zoom={timelineZoom} setZoom={setTimelineZoom} selectedId={selectedInstanceId} setSelectedId={setSelectedInstanceId} onSplit={onSplit} />
          </Panel>
        </Group>
      </div>

      {/* --- OVERLAYS --- */}
      <GenerativeModal
        modal={dynamicModal}
        resolution={resolution}
        onClose={() => setDynamicModal(null)}
        onGenerate={handleAddDynamic}
        isGenerating={isGenerating}
        status={genStatus}
      />
      <TTSModal
        open={ttsModalOpen}
        onClose={() => setTtsModalOpen(false)}
        onGenerate={handleTTSGenerate}
        isGenerating={isTTSGenerating}
      />
      <ExportOverlay status={status} progress={progress} onCancel={cancelExport} />
    </div>
  );
}