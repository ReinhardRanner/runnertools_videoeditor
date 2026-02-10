import React, { useState, useRef, useEffect, useCallback } from 'react';
import * as Resizable from 'react-resizable-panels'; 
import { 
  Film, 
  Download, 
  Loader2, 
  Volume2, 
  CheckCircle2, 
  ChevronDown, 
  ChevronRight, // <--- Add this
  Settings,      // <--- Add this
  Zap,           // <--- Add this
  Play,          // <--- Add this
  Target         // <--- Add this
} from 'lucide-react';
import { FFmpeg } from '@ffmpeg/ffmpeg';
import { fetchFile, toBlobURL } from '@ffmpeg/util';
import { StealthSelect } from './components/UI/StealthSelect';

// Modular Imports
import { Asset, TrackItem } from './types';
import { FileExplorer } from './components/FileExplorer';
import { Timeline } from './components/Timeline/Timeline';
import { PreviewCanvas } from './components/Preview/PreviewCanvas';
import { MediaClipPlayer } from './components/Preview/MediaClipPlayer';
import { PropertiesPanel } from './components/PropertiesPanel';
import Moveable from "react-moveable";

const { Group, Panel, Separator } = Resizable;

export default function App() {
  // --- Project State ---
  const [assets, setAssets] = useState<Asset[]>([]);
  const [timelineItems, setTimelineItems] = useState<TrackItem[]>([]);
  const [selectedInstanceId, setSelectedInstanceId] = useState<string | null>(null);
  const [isPlaying, setIsPlaying] = useState(false);
  const [currentTime, setCurrentTime] = useState(0);
  const [isPreviewMuted, setIsPreviewMuted] = useState(false);
  
  // --- Canvas & Export Settings ---
  const [canvasZoom, setCanvasZoom] = useState(0.45);
  const [timelineZoom, setTimelineZoom] = useState(60);
  const [resolution, setResolution] = useState({ w: 1920, h: 1080 });
  const [isRenderMenuOpen, setIsRenderMenuOpen] = useState(false);
  const [showProSettings, setShowProSettings] = useState(false);
  const [renderSettings, setRenderSettings] = useState({
    format: 'mp4',
    scale: 1,
    fps: 30,
    qualityLabel: 'High Quality', // For UI
    crf: 23, // The actual value for FFmpeg
    preset: 'ultrafast'
  });

  // Mapping quality labels to CRF values
  const QUALITY_LEVELS = [
    { label: 'Lossless', crf: 0, desc: 'Maximum file size' },
    { label: 'Production', crf: 18, desc: 'Visually transparent' },
    { label: 'High Quality', crf: 23, desc: 'Balanced (Recommended)' },
    { label: 'Compressed', crf: 30, desc: 'Small file, minor loss' },
    { label: 'Potato', crf: 45, desc: 'Maximum compression' },
  ];

  const FORMATS = ['mp4', 'webm', 'mov'];
  const [tool, setTool] = useState<'select' | 'hand'>('select');
  
  // --- System State ---
  const [ffmpegLoaded, setFfmpegLoaded] = useState(false);
  const [isExporting, setIsExporting] = useState(false);
  const [exportProgress, setExportProgress] = useState(0);
  const [exportStatus, setExportStatus] = useState<'idle' | 'writing' | 'rendering' | 'done'>('idle');
  const [isShiftPressed, setIsShiftPressed] = useState(false);
  const [isCtrlPressed, setIsCtrlPressed] = useState(false);

  const ffmpegRef = useRef(new FFmpeg());
  const lastTimeRef = useRef(performance.now());

  // --- FFmpeg Initialization ---
  const restartFFmpeg = async () => {
    setFfmpegLoaded(false);
    try {
      if (ffmpegRef.current) await ffmpegRef.current.terminate();
      ffmpegRef.current = new FFmpeg();
      const baseURL = 'https://unpkg.com/@ffmpeg/core@0.12.6/dist/esm';
      await ffmpegRef.current.load({
        coreURL: await toBlobURL(`${baseURL}/ffmpeg-core.js`, 'text/javascript'),
        wasmURL: await toBlobURL(`${baseURL}/ffmpeg-core.wasm`, 'application/wasm'),
      });
      setFfmpegLoaded(true);
      return true;
    } catch (e) { return false; }
  };

  useEffect(() => { restartFFmpeg(); }, []);

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
      if (file.type.startsWith('video')) {
        const v = document.createElement('video'); v.src = url;
        v.onloadedmetadata = () => setAssets(prev => [...prev, { id: Math.random().toString(36).substr(2, 9), name: file.name, type: 'video', url, file, sourceDuration: v.duration }]);
      } else if (file.type.startsWith('audio')) {
        const a = new Audio(); a.src = url;
        a.onloadedmetadata = () => setAssets(prev => [...prev, { id: Math.random().toString(36).substr(2, 9), name: file.name, type: 'audio', url, file, sourceDuration: a.duration }]);
      } else if (file.type.startsWith('image')) {
        setAssets(prev => [...prev, { id: Math.random().toString(36).substr(2, 9), name: file.name, type: 'image', url, file, sourceDuration: 3600 }]);
      }
    });
  };

  const addAssetToTimeline = (asset: Asset) => {
    const newItem: TrackItem = {
      ...asset, 
      instanceId: Math.random().toString(36).substr(2, 9), 
      startTime: currentTime, 
      duration: Math.min(asset.sourceDuration, 5), 
      startTimeOffset: 0,
      layer: timelineItems.length, 
      x: (resolution.w / 2) - 200, 
      y: (resolution.h / 2) - 112, 
      width: 400, height: 225, 
      rotation: 0, volume: 1,
      fadeInDuration: 0.5, fadeOutDuration: 0.5
    };
    setTimelineItems(prev => [...prev, newItem]);
    setSelectedInstanceId(newItem.instanceId);
  };

  const updateSelectedItem = (updates: Partial<TrackItem>) => {
    if (!selectedInstanceId) return;
    setTimelineItems(prev => prev.map(item => item.instanceId === selectedInstanceId ? { ...item, ...updates } : item));
  };

  // --- Keyboard Shortcuts ---
  useEffect(() => {
    const down = (e: KeyboardEvent) => {
      if (e.target instanceof HTMLInputElement) return;
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
    window.addEventListener('keydown', down);
    window.addEventListener('keyup', up);
    return () => { window.removeEventListener('keydown', down); window.removeEventListener('keyup', up); };
  }, [isPlaying, onSplit, selectedInstanceId]);

  // --- Export Logic ---
  const handleExport = async () => {
    // 1. Localize state to prevent "undefined" errors during async loops
    const currentItems = [...timelineItems]; 
    if (!ffmpegLoaded || currentItems.length === 0) return;

    setIsRenderMenuOpen(false);
    setIsExporting(true);
    setExportStatus('writing');
    setExportProgress(0);

    const ffmpeg = ffmpegRef.current;
    const { format, scale, fps, crf, preset } = renderSettings;
    const timestamp = Date.now();
    const outName = `CORE_RENDER_${timestamp}.${format}`;
    
    // Calculate project boundaries
    const actualEnd = Math.max(...currentItems.map(i => i.startTime + i.duration), 1);
    const totalDur = actualEnd.toFixed(3);
    const exportW = Math.round(resolution.w * scale);
    const exportH = Math.round(resolution.h * scale);

    // Setup Codecs based on format
    // WebM needs VP9/Opus, MP4/MOV use H264/AAC
    const vCodec = format === 'webm' ? 'libvpx-vp9' : 'libx264';
    const aCodec = format === 'webm' ? 'libopus' : 'aac';

    const writtenFiles: string[] = [];

    // Reset Progress Listener for this specific run
    ffmpeg.on('progress', ({ time }) => {
      const currentTimeSec = time / 1000000;
      const percentage = Math.round((currentTimeSec / actualEnd) * 100);
      setExportProgress(prev => Math.max(prev, Math.min(percentage, 99)));
    });

    try {
      // 2. Writing Phase (Uses localized currentItems)
      for (let i = 0; i < currentItems.length; i++) {
        const item = currentItems[i];
        if (!item.file) continue;
        const data = await fetchFile(item.url);
        await ffmpeg.writeFile(`in${i}`, data);
        writtenFiles.push(`in${i}`);
        // Progress calculation is now safe from "undefined" errors
        setExportProgress(Math.round(((i + 1) / currentItems.length) * 10));
      }

      setExportStatus('rendering');

      // 3. Complex Filter Building
      const sorted = [...currentItems].sort((a, b) => b.layer - a.layer);
      let vF = `color=s=${exportW}x${exportH}:c=black:d=${totalDur}[bg];`;
      let lastV = '[bg]';
      let visCount = 0;

      sorted.forEach((cfg) => {
        if (cfg.type === 'audio') return;
        const idx = currentItems.findIndex(orig => orig.instanceId === cfg.instanceId);
        const rad = (cfg.rotation * Math.PI) / 180;
        const src = cfg.type === 'image' 
          ? `[${idx}:v]format=rgba,` 
          : `[${idx}:v]trim=start=${cfg.startTimeOffset}:duration=${cfg.duration},`;
        
        // Scale positions and sizes based on chosen render scale
        const sW = Math.round(cfg.width * scale);
        const sH = Math.round(cfg.height * scale);
        const sX = Math.round(cfg.x * scale);
        const sY = Math.round(cfg.y * scale);

        vF += `${src}setpts=PTS-STARTPTS,scale=${sW}:${sH},rotate=${rad}:c=none:ow=rotw(${rad}):oh=roth(${rad}),setpts=PTS-STARTPTS+${cfg.startTime}/TB[v${idx}];`;
        vF += `${lastV}[v${idx}]overlay=x=${sX}:y=${sY}:enable='between(t,${cfg.startTime},${cfg.startTime + cfg.duration})'`;
        
        const currentIdx = sorted.indexOf(cfg);
        const isLast = !sorted.slice(currentIdx + 1).some(n => n.type !== 'audio');
        
        if (isLast) vF += `[outv]`;
        else { vF += `[vtmp${visCount}];`; lastV = `[vtmp${visCount}]`; visCount++; }
      });

      if (!sorted.some(i => i.type !== 'audio')) vF += `[bg]copy[outv]`;

      // Audio Filter
      let aF = ";"; 
      let aCount = 0; 
      const aLabels: string[] = [];
      currentItems.forEach((cfg, i) => {
        if (cfg.type === 'video' || cfg.type === 'audio') {
          const delay = Math.round(cfg.startTime * 1000);
          const sel = cfg.type === 'video' ? `${i}:a` : `${i}:0`;
          const fadeStr = `,afade=t=in:st=0:d=${cfg.fadeInDuration},afade=t=out:st=${cfg.duration - cfg.fadeOutDuration}:d=${cfg.fadeOutDuration}`;
          aF += `[${sel}]atrim=start=${cfg.startTimeOffset}:duration=${cfg.duration},asetpts=PTS-STARTPTS,volume=${cfg.volume}${fadeStr},adelay=${delay}|${delay}[a${i}];`;
          aLabels.push(`[a${i}]`); aCount++;
        }
      });
      aF += aCount > 0 ? `${aLabels.join('')}amix=inputs=${aCount}:duration=longest[outa]` : `anullsrc=r=44100:cl=stereo:d=${totalDur}[outa]`;

      // 4. Execution
      await ffmpeg.exec([
        "-y", 
        ...writtenFiles.flatMap((f) => ["-i", f]), 
        "-filter_complex", vF + aF, 
        "-map", "[outv]", "-map", "[outa]", 
        "-t", totalDur, 
        "-c:v", vCodec, 
        "-preset", preset, 
        "-crf", crf.toString(),
        "-r", fps.toString(),
        "-c:a", aCodec,
        "-pix_fmt", "yuv420p", 
        outName
      ]);
      
      setExportProgress(100);
      setExportStatus('done');

      const data = await ffmpeg.readFile(outName);
      const mime = format === 'webm' ? 'video/webm' : 'video/mp4';
      const url = URL.createObjectURL(new Blob([data], { type: mime }));
      const a = document.createElement('a'); 
      a.href = url; 
      a.download = `SYNTH_${timestamp}.${format}`; 
      a.click();

      setTimeout(() => { setIsExporting(false); setExportStatus('idle'); }, 2000);

    } catch (e) {
      console.error("Critical Export Error:", e);
      setIsExporting(false);
    }
  };

  const cancelExport = () => {
    if (ffmpegRef.current) {
      ffmpegRef.current.terminate();
      setIsExporting(false);
      setExportStatus('idle');
      setFfmpegLoaded(false);
    }
  };

  const currentItem = timelineItems.find(i => i.instanceId === selectedInstanceId);

  return (
    <div className="flex flex-col w-screen h-screen bg-[#020202] text-gray-200 overflow-hidden font-sans select-none">
      {/* --- HEADER BAR --- */}
      <nav className="h-12 border-b border-white/10 flex items-center justify-between px-4 bg-[#0a0a0a] z-[100] shadow-xl">
        <div className="flex items-center gap-2 font-black text-indigo-500 italic uppercase tracking-tighter">
          <Film size={18} /> Video Editor
        </div>
        
        <div className="relative">
          {/* Trigger Button */}
          <button 
            onClick={() => setIsRenderMenuOpen(!isRenderMenuOpen)}
            className="group relative bg-[#0a0a0a] hover:bg-indigo-600 border border-white/10 text-white h-10 px-5 rounded-2xl flex items-center gap-3 text-[11px] font-black uppercase tracking-widest transition-all duration-300 shadow-2xl active:scale-95"
          >
            <div className="absolute inset-0 bg-indigo-500/20 blur-xl opacity-0 group-hover:opacity-100 transition-opacity rounded-2xl" />
            <Download size={14} className="relative z-10 group-hover:rotate-12 transition-transform" /> 
            <span className="relative z-10">{isExporting ? `Rendering ${exportProgress}%` : 'Export Project'}</span>
            <ChevronDown size={14} className={`relative z-10 opacity-40 transition-transform duration-500 ${isRenderMenuOpen ? 'rotate-180' : ''}`} />
          </button>

          {/* Dropdown Menu */}
          {isRenderMenuOpen && (
            <>
              <div className="fixed inset-0 z-[500]" onClick={() => { setIsRenderMenuOpen(false); setShowProSettings(false); }} />
              <div className="absolute top-14 right-0 w-80 bg-[#0a0a0a]/95 backdrop-blur-2xl border border-white/10 rounded-3xl shadow-[0_30px_60px_rgba(0,0,0,0.8)] z-[510] p-6 animate-in fade-in zoom-in-95 duration-200 origin-top-right">
                
                {/* NEW: Format Selector using StealthSelect */}
                <div className="mb-6">
                  <StealthSelect 
                    label="Format"
                    value={renderSettings.format}
                    options={FORMATS.map(f => ({ label: `.${f.toUpperCase()}`, value: f }))}
                    onChange={(f) => setRenderSettings({...renderSettings, format: f})}
                  />
                </div>

                {/* Resolution Selector */}
                <div className="mb-6">
                  <p className="text-[9px] font-black text-white/20 uppercase tracking-[0.2em] mb-3 px-1">Resolution</p>
                  <div className="grid grid-cols-3 gap-2">
                    {[1, 0.5, 0.25].map((scale) => (
                      <button 
                        key={scale}
                        onClick={() => setRenderSettings({...renderSettings, scale})}
                        className={`flex flex-col items-center py-3 rounded-2xl border transition-all duration-300 ${
                          renderSettings.scale === scale ? 'bg-indigo-500/10 border-indigo-500/50 text-indigo-400 shadow-[0_0_15px_rgba(129,140,248,0.1)]' : 'bg-white/5 border-white/5 text-gray-500 hover:bg-white/10'
                        }`}
                      >
                        <span className="text-[12px] font-black">{scale === 1 ? 'FULL' : scale === 0.5 ? '1/2' : '1/4'}</span>
                        <span className="text-[8px] font-mono opacity-40 mt-1">{Math.round(resolution.w * scale)}p</span>
                      </button>
                    ))}
                  </div>
                </div>

                {/* Quality & FPS Section */}
                <div className="mb-8 space-y-3">
                  <div className="flex items-center justify-between px-1">
                    <p className="text-[9px] font-black text-white/20 uppercase tracking-[0.2em]">Quality & FPS</p>
                    <Settings size={12} className="text-white/20" />
                  </div>
                  
                  <div className="grid grid-cols-2 gap-2">
                    {/* FIXED: Using StealthSelect for Encoding */}
                    <StealthSelect 
                      label="Encoding"
                      value={renderSettings.crf}
                      options={QUALITY_LEVELS.map(q => ({ label: q.label, value: q.crf }))}
                      onChange={(val) => {
                        const q = QUALITY_LEVELS.find(item => item.crf === val);
                        setRenderSettings({...renderSettings, crf: val, qualityLabel: q?.label || 'Custom'});
                      }}
                    />

                    {/* FIXED: Using StealthSelect for Framerate */}
                    <StealthSelect 
                      label="Framerate"
                      value={renderSettings.fps}
                      options={[24, 30, 60].map(f => ({ label: `${f} FPS`, value: f }))}
                      onChange={(f) => setRenderSettings({...renderSettings, fps: f})}
                    />
                  </div>
                </div>

                {/* The Final Render Button */}
                <button 
                  onClick={handleExport}
                  disabled={isExporting}
                  className="group w-full relative h-14 bg-white hover:bg-indigo-400 text-black rounded-2xl overflow-hidden transition-all duration-500 active:scale-[0.98] disabled:opacity-50"
                >
                  <div className="absolute inset-0 bg-indigo-500/20 translate-y-14 group-hover:translate-y-0 transition-transform duration-500" />
                  <div className="relative flex items-center justify-center gap-3">
                    {isExporting ? (
                      <Loader2 size={18} className="animate-spin" />
                    ) : (
                      <Zap size={18} fill="currentColor" className="group-hover:animate-pulse" />
                    )}
                    <span className="text-[12px] font-black uppercase tracking-[0.2em]">
                      {isExporting ? `Rendering ${exportProgress}%` : 'Initiate Render'}
                    </span>
                  </div>
                </button>
              </div>
            </>
          )}
        </div>
      </nav>

      {/* --- MAIN LAYOUT --- */}
      <div className="flex-1 min-h-0">
        <Group orientation="vertical">
          <Panel defaultSize={65}>
            <Group orientation="horizontal">
              <Panel defaultSize={20} className="bg-[#0a0a0a] p-4 border-r border-white/5">
                <FileExplorer assets={assets} onUpload={handleUpload} onAdd={addAssetToTimeline} />
              </Panel>
              <Separator className="w-1 bg-black hover:bg-indigo-600 transition-all" />
              
              <Panel defaultSize={60} className="relative">
                <PreviewCanvas 
                  zoom={canvasZoom} setZoom={setCanvasZoom} resolution={resolution} setResolution={setResolution} 
                  tool={tool} setTool={setTool} isMuted={isPreviewMuted} setIsMuted={setIsPreviewMuted}
                  onMouseDown={() => setSelectedInstanceId(null)}
                >
                  {[...timelineItems].sort((a, b) => b.layer - a.layer).map((item) => {
                    const isVisible = currentTime >= item.startTime && currentTime <= (item.startTime + item.duration);
                    if (!isVisible) return null;
                    const strictZIndex = 100 - item.layer;
                    return (
                      <div key={item.instanceId} onMouseDown={(e) => e.stopPropagation()}>
                        <div 
                          id={`target-${item.instanceId}`} 
                          className={`absolute flex items-center justify-center`}
                          style={{ 
                            width: item.width, height: item.height, zIndex: strictZIndex,
                            transform: `translate(${item.x}px, ${item.y}px) rotate(${item.rotation}deg)` 
                          }}
                          onMouseDown={() => setSelectedInstanceId(item.instanceId)}
                        >
                          {item.type === 'audio' && (
                            <div className="absolute inset-0 flex flex-col items-center justify-center bg-indigo-500/10 border-2 border-dashed border-indigo-500/30 rounded-lg pointer-events-none">
                              <Volume2 className="text-indigo-400 opacity-40" size={48} />
                              <span className="text-[10px] font-black text-indigo-400/40 uppercase mt-2 tracking-tighter">{item.name}</span>
                            </div>
                          )}
                          <MediaClipPlayer item={item} currentTime={currentTime} isPlaying={isPlaying} isMuted={isPreviewMuted} />
                        </div>

                        {selectedInstanceId === item.instanceId && (
                          <Moveable 
                            target={document.querySelector(`#target-${item.instanceId}`)}
                            className="custom-editor-handles"
                            draggable={tool === 'select'} resizable={tool === 'select'} rotatable={tool === 'select'}
                            snappable={true} snapCenter={true} zoom={1/canvasZoom} keepRatio={isShiftPressed}
                            onDrag={({ target, transform }) => { target.style.transform = transform; }}
                            onDragEnd={() => {
                              const target = document.querySelector(`#target-${selectedInstanceId}`) as HTMLElement;
                              const m = new WebKitCSSMatrix(target.style.transform);
                              updateSelectedItem({ x: m.m41, y: m.m42 });
                            }}
                            onResize={e => {
                              e.target.style.width = `${e.width}px`; e.target.style.height = `${e.height}px`;
                              e.target.style.transform = e.drag.transform;
                            }}
                            onResizeEnd={({ target }) => {
                              const m = new WebKitCSSMatrix(target.style.transform);
                              updateSelectedItem({ width: target.offsetWidth, height: target.offsetHeight, x: m.m41, y: m.m42 });
                            }}
                            onRotate={({ target, transform }) => { target.style.transform = transform; }}
                            onRotateEnd={({ target }) => {
                              const r = target.style.transform.match(/rotate\((.+?)deg\)/);
                              updateSelectedItem({ rotation: r ? parseFloat(r[1]) : 0 });
                            }}
                          />
                        )}
                      </div>
                    );
                  })}
                </PreviewCanvas>
              </Panel>

              <Separator className="w-1 bg-black hover:bg-indigo-600 transition-all" />
              <Panel defaultSize={20} className="bg-[#0a0a0a] p-5 border-l border-white/5 overflow-y-auto custom-scrollbar">
                <PropertiesPanel 
                  item={currentItem} onUpdate={updateSelectedItem} 
                  onDelete={() => { setTimelineItems(prev => prev.filter(i => i.instanceId !== selectedInstanceId)); setSelectedInstanceId(null); }} 
                />
              </Panel>
            </Group>
          </Panel>

          <Separator className="h-1 bg-black hover:bg-indigo-600 transition-all" />
          <Panel defaultSize={35} minSize={20}>
            <Timeline 
              items={timelineItems} setItems={setTimelineItems} currentTime={currentTime} setCurrentTime={setCurrentTime} 
              isPlaying={isPlaying} setIsPlaying={setIsPlaying} zoom={timelineZoom} setZoom={setTimelineZoom} 
              selectedId={selectedInstanceId} setSelectedId={setSelectedInstanceId} onSplit={onSplit} 
            />
          </Panel>
        </Group>
      </div>

      {/* --- EXPORT MODAL --- */}
      {isExporting && (
        <div className="fixed inset-0 z-[1000] flex items-center justify-center bg-black/60 backdrop-blur-xl animate-in fade-in duration-300">
          <div className="bg-[#0a0a0a] border border-white/10 p-10 rounded-3xl shadow-2xl flex flex-col items-center max-w-sm w-full mx-4 relative overflow-hidden">
            <div className={`absolute -top-24 -left-24 w-48 h-48 rounded-full blur-[100px] transition-colors duration-1000 ${exportStatus === 'done' ? 'bg-emerald-500/20' : 'bg-indigo-500/20'}`} />
            <div className="relative mb-8">
              {exportStatus === 'done' ? (
                <div className="w-20 h-20 bg-emerald-500 rounded-full flex items-center justify-center animate-in zoom-in shadow-[0_0_30px_rgba(16,185,129,0.4)]"><CheckCircle2 size={40} className="text-white" /></div>
              ) : (
                <div className="relative w-20 h-20">
                  <div className="absolute inset-0 border-4 border-indigo-500/10 rounded-full" />
                  <div className="absolute inset-0 border-4 border-t-indigo-500 rounded-full animate-spin shadow-[0_0_20px_rgba(99,102,241,0.3)]" />
                  <div className="absolute inset-0 flex items-center justify-center"><span className="text-[12px] font-mono font-black text-indigo-400">{exportProgress}%</span></div>
                </div>
              )}
            </div>
            <h2 className="text-white font-black uppercase tracking-[0.3em] text-sm mb-2">{exportStatus === 'rendering' ? "Synthesizing..." : exportStatus === 'done' ? "Complete" : "Preparing..."}</h2>
            <div className="w-full mt-8 flex flex-col items-center">
              <div className="w-full h-1 bg-white/5 rounded-full overflow-hidden"><div className={`h-full transition-all duration-500 ${exportStatus === 'done' ? 'bg-emerald-500' : 'bg-indigo-500'}`} style={{ width: `${exportStatus === 'done' ? 100 : exportProgress}%` }} /></div>
              {exportStatus !== 'done' && (
                <button onClick={() => confirm("Cancel Export?") && cancelExport()} className="mt-8 px-6 py-2 bg-white/5 hover:bg-red-500/10 border border-white/10 rounded-xl text-[10px] font-black text-gray-400 hover:text-red-500 uppercase tracking-widest transition-all">Cancel</button>
              )}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}