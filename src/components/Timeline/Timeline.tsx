import React, { useRef, useEffect, useState, useLayoutEffect, useCallback } from 'react';
import { 
  Play, Pause, Scissors, ZoomIn, ZoomOut, Square 
} from 'lucide-react';
import { TrackItem } from '../../types';
import { TimelineItem } from './TimelineItem';
import { timeStore } from '../../utils/TimeStore';
import { Asset } from '../../types';

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
  onCaptureFrame: (name: string, dataUrl: string) => void;
  activeDragAsset: Asset | null;
  onAdd: (asset: Asset, startTime: number, layer: number) => void;
}

const TRACK_COUNT = 20;
const TRACK_HEIGHT = 64;
const RULER_HEIGHT = 40;
const LEFT_PADDING = 24;

const formatTime = (seconds: number) => new Date(seconds * 1000).toISOString().substr(14, 8);

export const Timeline: React.FC<TimelineProps> = ({
  items,
  setItems,
  currentTime,
  setCurrentTime,
  isPlaying,
  setIsPlaying,
  zoom,
  setZoom,
  selectedId,
  setSelectedId,
  onCaptureFrame, // Unpacked here!
  activeDragAsset,
  onAdd
}) => {
  const containerRef = useRef<HTMLDivElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const playheadRef = useRef<HTMLDivElement>(null);
  const timecodeRef = useRef<HTMLSpanElement>(null);
  const [snapLineTime, setSnapLineTime] = useState<number | null>(null);
  const [timelineDragGhost, setTimelineDragGhost] = useState<{time: number, layer: number} | null>(null);

  // --- ZOOM FOCAL POINT ANCHOR ---
  const scrollAnchorRef = useRef<{ time: number; x: number } | null>(null);

  // --- INERTIA PHYSICS REFS ---
  const panVelocityRef = useRef({ x: 0, y: 0 });
  const isPanningRef = useRef(false);
  const lastPanMousePos = useRef({ x: 0, y: 0 });
  const lastPanTimestamp = useRef(0);
  const rafIdRef = useRef<number | null>(null);
  const velocityBuffer = useRef<{ x: number; y: number }[]>([]);

  const stopInertia = useCallback(() => {
    if (rafIdRef.current) {
      cancelAnimationFrame(rafIdRef.current);
      rafIdRef.current = null;
    }
    panVelocityRef.current = { x: 0, y: 0 };
  }, []);

  const startInertiaLoop = useCallback(() => {
    if (rafIdRef.current) return;

    const friction = 0.95; // Resistance
    
    const drift = () => {
      const { x, y } = panVelocityRef.current;
      
      // Stop if movement is negligible
      if (Math.abs(x) < 0.1 && Math.abs(y) < 0.1) {
        rafIdRef.current = null;
        return;
      }

      if (containerRef.current) {
        // Invert velocity for scrolling (dragging right decreases scrollLeft)
        containerRef.current.scrollLeft -= x * 2; 
        containerRef.current.scrollTop -= y * 2;
      }

      // Apply friction
      panVelocityRef.current.x *= friction;
      panVelocityRef.current.y *= friction;

      rafIdRef.current = requestAnimationFrame(drift);
    };

    rafIdRef.current = requestAnimationFrame(drift);
  }, []);

  
  useLayoutEffect(() => {
    if (scrollAnchorRef.current && containerRef.current) {
      const { time, x } = scrollAnchorRef.current;
      const newScroll = (time * zoom) - x + LEFT_PADDING;
      containerRef.current.scrollLeft = newScroll;
      scrollAnchorRef.current = null;
    }
  }, [zoom]);

  useEffect(() => {
    const el = containerRef.current;
    if (!el) return;
    const handleWheel = (e: WheelEvent) => {
      if (e.ctrlKey) {
        e.preventDefault();
        const rect = el.getBoundingClientRect();
        const mouseX = e.clientX - rect.left;
        const timeAtMouse = (mouseX + el.scrollLeft - LEFT_PADDING) / zoom;
        scrollAnchorRef.current = { time: timeAtMouse, x: mouseX };
        const factor = e.deltaY > 0 ? 0.9 : 1.1;
        setZoom(Math.min(Math.max(15, zoom * factor), 200));
      }
    };
    el.addEventListener('wheel', handleWheel, { passive: false });
    return () => el.removeEventListener('wheel', handleWheel);
  }, [zoom, setZoom]);

  // --- MIDDLE MOUSE PANNING ---
  const handleMouseDown = (e: React.MouseEvent) => {
    // Middle mouse (1) or Hand Tool (if you add one later)
    if (e.button === 1) {
      e.preventDefault();
      const el = containerRef.current;
      if (!el) return;

      stopInertia();
      isPanningRef.current = true;
      velocityBuffer.current = [];
      
      lastPanMousePos.current = { x: e.clientX, y: e.clientY };
      lastPanTimestamp.current = performance.now();

      const onMove = (mE: MouseEvent) => {
        const now = performance.now();
        const dt = now - lastPanTimestamp.current;

        if (dt > 0) {
          // Calculate instantaneous velocity
          const instantV = {
            x: (mE.clientX - lastPanMousePos.current.x) / dt,
            y: (mE.clientY - lastPanMousePos.current.y) / dt
          };

          // Smooth velocity using a small buffer
          velocityBuffer.current.push(instantV);
          if (velocityBuffer.current.length > 4) velocityBuffer.current.shift();

          const avgV = velocityBuffer.current.reduce(
            (acc, v) => ({ x: acc.x + v.x, y: acc.y + v.y }),
            { x: 0, y: 0 }
          );

          panVelocityRef.current = {
            x: avgV.x / velocityBuffer.current.length,
            y: avgV.y / velocityBuffer.current.length
          };
        }

        // Perform the actual scroll
        el.scrollLeft -= mE.clientX - lastPanMousePos.current.x;
        el.scrollTop -= mE.clientY - lastPanMousePos.current.y;

        lastPanMousePos.current = { x: mE.clientX, y: mE.clientY };
        lastPanTimestamp.current = now;
        document.body.style.cursor = 'grabbing';
      };

      const onUp = () => {
        isPanningRef.current = false;
        window.removeEventListener('mousemove', onMove);
        window.removeEventListener('mouseup', onUp);
        document.body.style.cursor = 'default';

        // Only start drift if the user didn't stop moving before release
        const timeSinceLastMove = performance.now() - lastPanTimestamp.current;
        if (timeSinceLastMove < 50) {
          startInertiaLoop();
        }
      };

      window.addEventListener('mousemove', onMove);
      window.addEventListener('mouseup', onUp);
    } else if (e.target === e.currentTarget) {
      setSelectedId(null);
    }
  };

  // --- SPLIT LOGIC ---
  const handleSplit = () => {
    const time = currentTime;
    const target = items.find(i => 
      i.instanceId === selectedId && 
      time > i.startTime && 
      time < (i.startTime + i.duration)
    );
    if (!target) return;
    const splitPointInAsset = target.startTimeOffset + (time - target.startTime);
    const firstPartDuration = time - target.startTime;
    const secondPartDuration = target.duration - firstPartDuration;
    const newPart: TrackItem = {
      ...JSON.parse(JSON.stringify(target)),
      instanceId: crypto.randomUUID(),
      name: `${target.name} (Part 2)`,
      startTime: time,
      startTimeOffset: splitPointInAsset,
      duration: secondPartDuration,
      fadeInDuration: 0,
    };
    setItems(prev => prev.flatMap(i => {
      if (i.instanceId === target.instanceId) {
        return [{ ...i, duration: firstPartDuration, fadeOutDuration: 0 }, newPart];
      }
      return [i];
    }));
    setSelectedId(newPart.instanceId);
  };

  const getSnapPoints = () => {
    return [
      0,
      currentTime, // Der Playhead ist magnetisch
      ...items.map(i => i.startTime),
      ...items.map(i => i.startTime + i.duration)
    ];
  };

  const handleDragOver = (e: React.DragEvent) => {
    e.preventDefault();
    const el = containerRef.current;
    if (!el || !activeDragAsset) return;

    const rect = el.getBoundingClientRect();
    
    // 1. Rohe Zeit berechnen
    const mouseX = e.clientX - rect.left;
    const rawTime = (mouseX + el.scrollLeft - LEFT_PADDING) / zoom;
    let finalTime = Math.max(0, rawTime);

    // 2. SNAPPING (Magnet-Logik)
    const snapPoints = getSnapPoints();
    const threshold = 15 / zoom; // 15 Pixel Magnet-Radius
    
    let triggeredSnap = null;
    for (const p of snapPoints) {
      if (Math.abs(p - finalTime) < threshold) {
        finalTime = p;
        triggeredSnap = p;
        break;
      }
    }

    // 3. Layer berechnen (Y-Achse)
    const mouseY = e.clientY - rect.top;
    const layerAtMouse = Math.floor((mouseY + el.scrollTop - RULER_HEIGHT) / TRACK_HEIGHT);
    const finalLayer = Math.max(0, Math.min(layerAtMouse, TRACK_COUNT - 1));

    // Ghost updaten (snappt jetzt optisch!)
    setTimelineDragGhost({ time: finalTime, layer: finalLayer });
    setSnapLineTime(triggeredSnap); // Die blaue Linie anzeigen
  };

  const handleDrop = (e: React.DragEvent) => {
    e.preventDefault();
    setSnapLineTime(null);

    // Wir nutzen die Werte, die wir gerade im DragOver berechnet haben
    if (!activeDragAsset || !timelineDragGhost) return;

    // WICHTIG: Die Werte explizit übergeben
    onAdd(activeDragAsset, timelineDragGhost.time, timelineDragGhost.layer);
    
    setTimelineDragGhost(null);
  };

  // --- PLAYHEAD ANIMATION ---
  const timeRef = useRef(currentTime);
  useEffect(() => { timeRef.current = currentTime; }, [currentTime]);

  useEffect(() => {
    const unsubscribe = timeStore.subscribe((time) => {
      if (playheadRef.current) {
        playheadRef.current.style.transform = `translate3d(${time * zoom + LEFT_PADDING}px, 0, 0)`;
      }
      if (timecodeRef.current) {
        timecodeRef.current.innerText = formatTime(time);
      }
    });

    return () => unsubscribe();
  }, [zoom]);

  // --- RULER ---
  useEffect(() => {
    const canvas = canvasRef.current; if (!canvas) return;
    const ctx = canvas.getContext('2d'); if (!ctx) return;
    const dpr = window.devicePixelRatio || 1;
    canvas.width = 20000 * dpr; canvas.height = RULER_HEIGHT * dpr;
    ctx.scale(dpr, dpr); ctx.clearRect(0, 0, canvas.width, canvas.height);
    ctx.strokeStyle = 'rgba(255, 255, 255, 0.1)'; ctx.fillStyle = 'rgba(255, 255, 255, 0.3)'; ctx.font = '9px monospace';
    for (let i = 0; i < 500; i++) {
      const x = i * zoom;
      ctx.beginPath(); ctx.moveTo(x, RULER_HEIGHT); ctx.lineTo(x, i % 5 === 0 ? 20 : 30); ctx.stroke();
      if (i % 5 === 0) ctx.fillText(`${i}s`, x + 4, 18);
    }
  }, [zoom]);

  // --- SCRUBBING WITH SNAPPING ---
  const scrub = (e: React.MouseEvent) => {
    e.preventDefault();
    setIsPlaying(false);

    // Alle möglichen Snap-Punkte sammeln (Clip-Anfänge und -Enden)
    const snapPoints = [
      0,
      ...items.map(i => i.startTime),
      ...items.map(i => i.startTime + i.duration)
    ];

    const update = (clientX: number) => {
      if (!containerRef.current) return;
      const rect = containerRef.current.getBoundingClientRect();
      const rawTime = (clientX - rect.left + containerRef.current.scrollLeft - LEFT_PADDING) / zoom;
      let finalTime = Math.max(0, rawTime);

      // Snapping Logik (Magnet-Radius ca. 12 Pixel)
      const threshold = 12 / zoom;
      let triggeredSnap = null;
      for (const p of snapPoints) {
        if (Math.abs(p - finalTime) < threshold) {
          finalTime = p;
          triggeredSnap = p;
          break;
        }
      }

      setSnapLineTime(triggeredSnap);
      
      setCurrentTime(finalTime);
      timeStore.update(finalTime, false);
    };

    update(e.clientX);
    const move = (mE: MouseEvent) => update(mE.clientX);
    const end = () => { 
      setSnapLineTime(null);
      window.removeEventListener('mousemove', move); 
      window.removeEventListener('mouseup', end); 
    };
    window.addEventListener('mousemove', move);
    window.addEventListener('mouseup', end);
  };

  return (
    <div className="h-full bg-bg-canvas flex flex-col relative border-t border-border-strong shadow-2xl overflow-hidden">
      {/* TOOLBAR */}
      <div className="h-12 border-b border-border-default flex items-center px-6 justify-between bg-bg-surface z-[60]">
        <div className="flex items-center gap-4">
          <div className="flex items-center gap-2 bg-black/40 p-1 rounded-full border border-white/5">
            <button onClick={() => setIsPlaying(!isPlaying)} className="w-8 h-8 rounded-full bg-indigo-600 hover:bg-indigo-500 transition-colors flex items-center justify-center">
              {isPlaying ? <Pause size={14} fill="currentColor"/> : <Play size={14} fill="currentColor" className="ml-0.5"/>}
            </button>
            <button onClick={() => { setIsPlaying(false); setCurrentTime(0); }} className="w-8 h-8 rounded-full hover:bg-white/10 flex items-center justify-center text-gray-400 hover:text-white"><Square size={14} fill="currentColor"/></button>
          </div>
          <span ref={timecodeRef} className="text-[12px] font-mono text-indigo-400 font-bold tracking-widest">{formatTime(currentTime)}</span>
        </div>
        <div className="flex items-center gap-4">
          <button onClick={handleSplit} className="p-1.5 bg-white/5 hover:bg-indigo-600 border border-white/5 rounded-xl text-gray-400 hover:text-white transition-all active:scale-95 shadow-xl"><Scissors size={16}/></button>
          <div className="flex items-center gap-2 bg-black/20 px-2 py-1.5 rounded-lg border border-white/5">
            <button onClick={() => setZoom(Math.max(15, zoom - 10))} className="p-1 text-gray-500 hover:text-indigo-400"><ZoomIn size={14} /></button>
            <input type="range" min="15" max="200" step="2" value={zoom} onChange={(e) => setZoom(Number(e.target.value))} className="w-24 accent-indigo-500 cursor-pointer" />
            <button onClick={() => setZoom(Math.min(200, zoom + 10))} className="p-1 text-gray-500 hover:text-indigo-400"><ZoomOut size={14} /></button>
          </div>
        </div>
      </div>

      <div 
        ref={containerRef} 
        onMouseDown={handleMouseDown}
        onContextMenu={e => e.preventDefault()}
        className="flex-1 overflow-x-auto overflow-y-auto relative bg-bg-canvas-deep scrollbar-none select-none"
        onDragOver={handleDragOver}
        onDragLeave={() => setTimelineDragGhost(null)}
        onDrop={handleDrop}
      >
        <div className="min-w-[20000px] relative" style={{ paddingLeft: LEFT_PADDING }}>
          <canvas ref={canvasRef} style={{ width: '20000px', height: `${RULER_HEIGHT}px` }} className="sticky top-0 bg-bg-canvas/95 backdrop-blur-md z-[55] cursor-pointer" onMouseDown={scrub} />

          {/* PLAYHEAD DESIGN KORREKTUR */}
          <div 
            ref={playheadRef} 
            className="absolute top-0 bottom-0 w-[1.5px] bg-red-500 z-[100] pointer-events-none" 
            style={{ left: 0, transform: `translate3d(${currentTime * zoom + LEFT_PADDING}px, 0, 0)` }}
          >
              {/* Der "Kopf" des Playheads - schlankeres, professionelles Design */}
              <div 
                onMouseDown={scrub}
                className="sticky top-0 w-3 h-[18px] bg-red-500 shadow-xl -ml-[5.75px] pointer-events-auto cursor-col-resize flex items-center justify-center transition-transform active:scale-110"
                style={{ clipPath: 'polygon(0% 0%, 100% 0%, 100% 65%, 50% 100%, 0% 65%)' }}
              >
                {/* Kleiner Akzent im Kopf */}
                <div className="w-[1px] h-2 bg-white/40" />
              </div>
          </div>

          {/* SNAP LINE (Wird beim Snappen sichtbar) */}
          {snapLineTime !== null && (
            <div className="absolute top-0 bottom-0 w-[1px] bg-indigo-400 z-[45] pointer-events-none shadow-[0_0_10px_rgba(129,140,248,0.8)]" style={{ left: snapLineTime * zoom + LEFT_PADDING }} />
          )}

          <div className="relative" style={{ height: TRACK_COUNT * TRACK_HEIGHT }} onMouseDown={(e) => { if (e.target === e.currentTarget) setSelectedId(null); }}>
            {[...Array(TRACK_COUNT + 1)].map((_, i) => (
              <div key={i} className="absolute left-[-24px] right-0 border-t border-border-subtle pointer-events-none" style={{ top: i * TRACK_HEIGHT }} />
            ))}

            {/* TIMELINE DROP GHOST */}
            {timelineDragGhost && activeDragAsset && (
              <div 
                className="absolute border-2 border-indigo-500 bg-indigo-500/20 shadow-[0_0_15px_rgba(99,102,241,0.3)] z-[40] rounded-md pointer-events-none"
                style={{
                  left: timelineDragGhost.time * zoom,
                  top: timelineDragGhost.layer * TRACK_HEIGHT,
                  width: (activeDragAsset.duration || 5) * zoom,
                  height: TRACK_HEIGHT - 4, // Kleiner Puffer für die Optik
                  marginTop: 2
                }}
              />
            )}

            {items.map((item) => (
              <TimelineItem 
                key={item.instanceId} 
                item={item} 
                zoom={zoom} 
                selectedId={selectedId} 
                setSelectedId={setSelectedId} 
                setItems={setItems} 
                trackCount={TRACK_COUNT}
                items={items}
                playheadTime={currentTime}
                onSnap={setSnapLineTime}
                onCaptureFrame={onCaptureFrame}
              />
            ))}
          </div>
        </div>
      </div>
    </div>
  );
};