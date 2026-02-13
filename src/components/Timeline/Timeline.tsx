import React, { useRef, useEffect, memo } from 'react';
import { 
  Play, Pause, Scissors, ZoomIn, ZoomOut, Square 
} from 'lucide-react';
import { TrackItem } from '../../types';
import { TimelineItem } from './TimelineItem';

interface TimelineProps {
  items: TrackItem[];
  setItems: React.Dispatch<React.SetStateAction<TrackItem[]>>;
  currentTime: number;
  setCurrentTime: (time: number) => void;
  isPlaying: boolean;
  setIsPlaying: (playing: boolean) => void;
  zoom: number;
  setZoom: (zoom: number) => void;
  selectedId: string | null;
  setSelectedId: (id: string | null) => void;
  onSplit: () => void;
}

const TRACK_COUNT = 8;
const TRACK_HEIGHT = 64;
const RULER_HEIGHT = 40;
const LEFT_PADDING = 24;

const formatTime = (seconds: number) => new Date(seconds * 1000).toISOString().substr(14, 8);

export const Timeline: React.FC<TimelineProps> = (props) => {
  const containerRef = useRef<HTMLDivElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const playheadRef = useRef<HTMLDivElement>(null);
  const timecodeRef = useRef<HTMLSpanElement>(null);

  // --- PINCH TO ZOOM LOGIC ---
  useEffect(() => {
    const el = containerRef.current;
    if (!el) return;

    const handleWheel = (e: WheelEvent) => {
      if (e.ctrlKey) {
        e.preventDefault();
        const zoomSpeed = 0.05;
        const factor = e.deltaY > 0 ? (1 - zoomSpeed) : (1 + zoomSpeed);
        const nextZoom = Math.min(Math.max(15, props.zoom * factor), 200);
        props.setZoom(nextZoom);
      }
    };

    el.addEventListener('wheel', handleWheel, { passive: false });
    return () => el.removeEventListener('wheel', handleWheel);
  }, [props.zoom, props.setZoom]);

  const handleStop = () => {
    props.setIsPlaying(false);
    props.setCurrentTime(0);
    if (playheadRef.current) playheadRef.current.style.transform = `translate3d(${LEFT_PADDING}px, 0, 0)`;
    if (timecodeRef.current) timecodeRef.current.innerText = formatTime(0);
  };

  useEffect(() => {
    const canvas = canvasRef.current; if (!canvas) return;
    const ctx = canvas.getContext('2d'); if (!ctx) return;
    const dpr = window.devicePixelRatio || 1;
    canvas.width = 20000 * dpr; canvas.height = RULER_HEIGHT * dpr;
    ctx.scale(dpr, dpr); ctx.clearRect(0, 0, canvas.width, canvas.height);
    ctx.strokeStyle = 'rgba(255, 255, 255, 0.1)'; ctx.fillStyle = 'rgba(255, 255, 255, 0.3)'; ctx.font = '9px monospace';
    for (let i = 0; i < 500; i++) {
      const x = i * props.zoom;
      ctx.beginPath(); ctx.moveTo(x, RULER_HEIGHT); ctx.lineTo(x, i % 5 === 0 ? 25 : 32); ctx.stroke();
      if (i % 5 === 0) ctx.fillText(`${i}s`, x + 4, 20);
    }
  }, [props.zoom]);

  useEffect(() => {
    if (!props.isPlaying) return;
    let frameId: number; let lastTime = performance.now(); let it = props.currentTime;
    const loop = () => {
      const now = performance.now();
      it += (now - lastTime) / 1000;
      lastTime = now;
      if (playheadRef.current) playheadRef.current.style.transform = `translate3d(${it * props.zoom + LEFT_PADDING}px, 0, 0)`;
      if (timecodeRef.current) timecodeRef.current.innerText = formatTime(it);
      frameId = requestAnimationFrame(loop);
    };
    frameId = requestAnimationFrame(loop);
    return () => { cancelAnimationFrame(frameId); props.setCurrentTime(it); };
  }, [props.isPlaying, props.zoom]);

  const scrub = (e: React.MouseEvent) => {
    e.preventDefault();
    e.stopPropagation();
    props.setIsPlaying(false);
    const update = (clientX: number) => {
      if (!containerRef.current) return;
      const rect = containerRef.current.getBoundingClientRect();
      const scrollLeft = containerRef.current.scrollLeft;
      const newTime = Math.max(0, (clientX - rect.left + scrollLeft - LEFT_PADDING) / props.zoom);
      if (playheadRef.current) playheadRef.current.style.transform = `translate3d(${newTime * props.zoom + LEFT_PADDING}px, 0, 0)`;
      if (timecodeRef.current) timecodeRef.current.innerText = formatTime(newTime);
      props.setCurrentTime(newTime);
    };
    update(e.clientX);
    const move = (mE: MouseEvent) => update(mE.clientX);
    const end = () => { window.removeEventListener('mousemove', move); window.removeEventListener('mouseup', end); };
    window.addEventListener('mousemove', move); window.addEventListener('mouseup', end);
  };

  return (
    <div className="h-full bg-bg-canvas flex flex-col relative border-t border-border-strong shadow-2xl">
      {/* TOOLBAR */}
      <div className="h-12 border-b border-border-default flex items-center px-6 justify-between bg-bg-surface z-[60]">
        <div className="flex items-center gap-4">
          <div className="flex items-center gap-2 bg-black/40 p-1 rounded-full border border-white/5">
            <button onClick={() => props.setIsPlaying(!props.isPlaying)} className="w-8 h-8 rounded-full bg-indigo-600 hover:bg-indigo-500 transition-colors flex items-center justify-center shadow-lg active:scale-90">
              {props.isPlaying ? <Pause size={14} fill="currentColor"/> : <Play size={14} fill="currentColor" className="ml-0.5"/>}
            </button>
            <button onClick={handleStop} className="w-8 h-8 rounded-full hover:bg-white/10 flex items-center justify-center text-gray-400 hover:text-white" title="Reset Playhead"><Square size={14} fill="currentColor"/></button>
          </div>
          <span ref={timecodeRef} className="text-[12px] font-mono text-indigo-400 font-bold tracking-widest">{formatTime(props.currentTime)}</span>
        </div>
        <div className="flex items-center gap-4">
          <button onClick={props.onSplit} className="p-1.5 bg-white/5 hover:bg-white/10 border border-white/5 rounded-xl text-gray-400 hover:text-white transition-all active:scale-95"><Scissors size={16}/></button>

          <div className="flex items-center gap-2 bg-black/20 px-2 py-1.5 rounded-lg border border-white/5">
            <button onClick={() => props.setZoom(Math.max(15, props.zoom - 10))} className="p-1 text-gray-500 hover:text-indigo-400 transition-colors"><ZoomOut size={14} /></button>
            <input type="range" min="15" max="200" step="2" value={props.zoom} onChange={(e) => props.setZoom(Number(e.target.value))} className="w-24 accent-indigo-500 cursor-pointer" />
            <button onClick={() => props.setZoom(Math.min(200, props.zoom + 10))} className="p-1 text-gray-500 hover:text-indigo-400 transition-colors"><ZoomIn size={14} /></button>
          </div>
        </div>
      </div>

      {/* TIMELINE AREA */}
      <div ref={containerRef} className="flex-1 overflow-x-auto overflow-y-auto relative bg-bg-canvas-deep scrollbar-none">
        <div className="min-w-[20000px] relative" style={{ paddingLeft: LEFT_PADDING }}>
          
          {/* RULER - Sticky to top */}
          <canvas 
            ref={canvasRef} 
            style={{ width: '20000px', height: `${RULER_HEIGHT}px` }} 
            className="sticky top-0 bg-bg-canvas/95 backdrop-blur-md z-[55] cursor-pointer border-b border-border-default" 
            onMouseDown={scrub} 
          />

          {/* PLAYHEAD */}
          <div 
            ref={playheadRef} 
            className="absolute top-0 bottom-0 w-[2px] bg-red-600 z-[100] pointer-events-none" 
            style={{ left: 0, willChange: 'transform', transform: `translate3d(${props.currentTime * props.zoom + LEFT_PADDING}px, 0, 0)` }}
          >
              {/* PLAYHEAD HANDLE - Sticky top-0 keeps it visible while scrolling vertically */}
              <div 
                onMouseDown={scrub}
                className="sticky top-0 w-6 h-6 bg-red-600 rounded-b-lg shadow-[0_0_20px_rgba(220,38,38,0.5)] -ml-[11px] pointer-events-auto cursor-col-resize flex items-center justify-center"
              >
                <div className="w-[1px] h-3 bg-white/30" />
              </div>
          </div>

          {/* TRACKS */}
          <div className="relative" style={{ height: TRACK_COUNT * TRACK_HEIGHT }} onMouseDown={(e) => { if (e.target === e.currentTarget) props.setSelectedId(null); }}>
            {[...Array(TRACK_COUNT + 1)].map((_, i) => (
              <div key={i} className="absolute left-[-24px] right-0 border-t border-border-subtle pointer-events-none" style={{ top: i * TRACK_HEIGHT }} />
            ))}
            {props.items.map((item) => (
              <TimelineItem 
                key={item.instanceId} 
                item={item} 
                zoom={props.zoom} 
                selectedId={props.selectedId} 
                setSelectedId={props.setSelectedId} 
                setItems={props.setItems} 
                trackCount={TRACK_COUNT} 
              />
            ))}
          </div>
        </div>
      </div>
    </div>
  );
};