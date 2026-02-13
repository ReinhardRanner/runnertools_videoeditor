import React, { useState, useEffect, useRef, useCallback, memo, useLayoutEffect } from 'react';
import {
  Monitor, Smartphone, Square, ChevronDown, MousePointer2,
  Hand, Volume2, VolumeX, Settings2
} from 'lucide-react';

interface PreviewCanvasProps {
  children: React.ReactNode;
  zoom: number;
  setZoom: (z: number) => void;
  resolution: { w: number; h: number };
  setResolution: (r: { w: number; h: number }) => void;
  tool: 'select' | 'hand';
  setTool: (t: 'select' | 'hand') => void;
  isMuted: boolean;
  setIsMuted: (m: boolean) => void;
  onMouseDown: () => void;
}

export const PreviewCanvas: React.FC<PreviewCanvasProps> = memo(({
  children, zoom, setZoom, resolution, setResolution, tool, setTool, isMuted, setIsMuted, onMouseDown
}) => {
  const [activeMenu, setActiveMenu] = useState<'zoom' | 'res' | null>(null);
  const [isDraggingUI, setIsDraggingUI] = useState(false);

  const containerRef = useRef<HTMLDivElement>(null);
  const stageRef = useRef<HTMLDivElement>(null);
  const gridRef = useRef<HTMLDivElement>(null);
  
  // Real-time values kept out of React State for performance
  const panRef = useRef({ x: 0, y: 0 });
  const zoomRef = useRef(zoom);
  const isDraggingRef = useRef(false);
  const startPos = useRef({ x: 0, y: 0 });
  const lastDimensions = useRef({ w: 0, h: 0 });

  const presets = [
    { name: 'Landscape', w: 1920, h: 1080, icon: <Monitor size={14} /> },
    { name: 'Portrait', w: 1080, h: 1920, icon: <Smartphone size={14} /> },
    { name: 'Square', w: 1080, h: 1080, icon: <Square size={14} /> },
  ];

  // Bypasses React Render Cycle for 60fps updates
  const updateDOM = useCallback(() => {
    if (!stageRef.current || !gridRef.current) return;
    
    // Hardware accelerated transform
    stageRef.current.style.transform = `translate3d(${panRef.current.x}px, ${panRef.current.y}px, 0) scale(${zoomRef.current})`;
    
    // Update Grid - background-size updates can be heavy, but direct DOM is much faster than React
    const gSize = 40 * zoomRef.current;
    const gBigSize = 200 * zoomRef.current;
    gridRef.current.style.backgroundPosition = `${panRef.current.x}px ${panRef.current.y}px`;
    gridRef.current.style.backgroundSize = `${gSize}px ${gSize}px, ${gSize}px ${gSize}px, ${gBigSize}px ${gBigSize}px, ${gBigSize}px ${gBigSize}px`;
  }, []);

  // --- WINDOW RESIZE & INITIAL CENTERING ---
  useLayoutEffect(() => {
    if (!containerRef.current) return;

    const observer = new ResizeObserver((entries) => {
      for (let entry of entries) {
        const { width, height } = entry.contentRect;

        if (lastDimensions.current.w !== 0) {
          const deltaX = (width - lastDimensions.current.w) / 2;
          const deltaY = (height - lastDimensions.current.h) / 2;
          panRef.current.x += deltaX;
          panRef.current.y += deltaY;
        } else {
          // Centering Logic
          panRef.current = {
            x: (width - resolution.w * zoomRef.current) / 2,
            y: (height - resolution.h * zoomRef.current) / 2
          };
        }
        updateDOM();
        lastDimensions.current = { w: width, h: height };
      }
    });

    observer.observe(containerRef.current);
    return () => observer.disconnect();
  }, [resolution, updateDOM]);

  // Sync React State Zoom -> Ref Zoom (e.g., when clicking 100% in menu)
  useEffect(() => {
    if (Math.abs(zoomRef.current - zoom) > 0.001) {
      zoomRef.current = zoom;
      updateDOM();
    }
  }, [zoom, updateDOM]);

  // --- MOUSE PANNING HANDLERS ---
  const handleStartPanning = (e: React.MouseEvent) => {
    const target = e.target as HTMLElement;
    if (target.closest('.rotation-handle')) {
      return; // Do nothing, let the handle manage its own events
    }

    const isMiddleMouse = e.button === 1;
    if (tool === 'hand' || isMiddleMouse) {
      if (isMiddleMouse) e.preventDefault();
      setIsDraggingUI(true);
      isDraggingRef.current = true;
      startPos.current = { x: e.clientX - panRef.current.x, y: e.clientY - panRef.current.y };
      
      const onMove = (mE: MouseEvent) => {
        panRef.current = { x: mE.clientX - startPos.current.x, y: mE.clientY - startPos.current.y };
        updateDOM();
      };

      const onUp = () => {
        setIsDraggingUI(false);
        isDraggingRef.current = false;
        window.removeEventListener('mousemove', onMove);
        window.removeEventListener('mouseup', onUp);
      };

      window.addEventListener('mousemove', onMove);
      window.addEventListener('mouseup', onUp);
    } else {
      onMouseDown();
    }
  };

  // --- ZOOM TO MOUSE & SCROLL ---
  useEffect(() => {
    const el = containerRef.current;
    if (!el) return;

    let zoomTimeout: NodeJS.Timeout;

    const handleWheel = (e: WheelEvent) => {
      e.preventDefault();
      const rect = el.getBoundingClientRect();
      const mouseX = e.clientX - rect.left;
      const mouseY = e.clientY - rect.top;

      if (e.ctrlKey) {
        // Zoom Logic
        const canvasX = (mouseX - panRef.current.x) / zoomRef.current;
        const canvasY = (mouseY - panRef.current.y) / zoomRef.current;

        const zoomSpeed = 0.08; // Slightly smoother speed
        const factor = e.deltaY > 0 ? (1 - zoomSpeed) : (1 + zoomSpeed);
        const nextZoom = Math.min(Math.max(0.05, zoomRef.current * factor), 5);

        panRef.current.x = mouseX - canvasX * nextZoom;
        panRef.current.y = mouseY - canvasY * nextZoom;
        zoomRef.current = nextZoom;

        updateDOM();

        // Debounce state update to parent to prevent laggy renders
        clearTimeout(zoomTimeout);
        zoomTimeout = setTimeout(() => {
          setZoom(nextZoom);
        }, 50);
      } else {
        // Panning Logic
        panRef.current.x -= e.deltaX;
        panRef.current.y -= e.deltaY;
        updateDOM();
      }
    };

    el.addEventListener('wheel', handleWheel, { passive: false });
    return () => el.removeEventListener('wheel', handleWheel);
  }, [setZoom, updateDOM]);

  return (
    <div
      ref={containerRef}
      onMouseDown={handleStartPanning}
      onContextMenu={(e) => e.preventDefault()}
      className={`relative w-full h-full bg-[#0d0d0d] overflow-hidden canvas-container ${
        tool === 'hand' || isDraggingUI ? (isDraggingUI ? 'cursor-grabbing' : 'cursor-grab') : 'cursor-default'
      }`}
    >
      {/* GRID (Updated via updateDOM) */}
      <div
        ref={gridRef}
        className="absolute inset-0 pointer-events-none"
        style={{
          backgroundImage: `
            linear-gradient(to right, rgba(255,255,255,0.03) 1px, transparent 1px),
            linear-gradient(to bottom, rgba(255,255,255,0.03) 1px, transparent 1px),
            linear-gradient(to right, rgba(255,255,255,0.07) 1px, transparent 1px),
            linear-gradient(to bottom, rgba(255,255,255,0.07) 1px, transparent 1px)
          `,
          backgroundPosition: '0px 0px',
          backgroundSize: '40px 40px, 40px 40px, 200px 200px, 200px 200px',
          willChange: 'background-position, background-size'
        }}
      />

      {/* STAGE (Updated via updateDOM) */}
      <div
        ref={stageRef}
        id="canvas-stage"
        className="absolute bg-black shadow-[0_0_100px_rgba(0,0,0,1)] border border-white/10 flex-shrink-0"
        style={{
          width: resolution.w,
          height: resolution.h,
          transformOrigin: '0 0',
          willChange: 'transform',
          pointerEvents: tool === 'hand' || isDraggingUI ? 'none' : 'auto'
        }}
      >
        {children}
      </div>

      {/* FLOATING UI - Compact & Fixed */}
      <div className="absolute top-4 left-1/2 -translate-x-1/2 flex items-center gap-2 z-[400]" onClick={e => e.stopPropagation()}>
        
        {/* Tool Switcher - Slimmer version */}
        <div className="flex gap-0.5 bg-[#080808]/95 backdrop-blur-3xl border border-white/10 p-1 rounded-2xl shadow-2xl">
          <button 
            onClick={() => setTool('select')} 
            className={`px-3 py-1.5 rounded-xl transition-all duration-300 ${tool === 'select' ? 'bg-indigo-600 text-white shadow-lg shadow-indigo-500/40' : 'text-gray-500 hover:text-gray-300'}`}
          >
            <MousePointer2 size={16} />
          </button>
          <button 
            onClick={() => setTool('hand')} 
            className={`px-3 py-1.5 rounded-xl transition-all duration-300 ${tool === 'hand' ? 'bg-indigo-600 text-white shadow-lg shadow-indigo-500/40' : 'text-gray-500 hover:text-gray-300'}`}
          >
            <Hand size={16} />
          </button>
        </div>

        {/* Resolution & Zoom Bar - Slimmer h-9 */}
        <div className="flex gap-0.5 bg-[#080808]/95 backdrop-blur-3xl border border-white/10 p-1 rounded-2xl shadow-2xl">
          {/* Resolution Dropdown */}
          <div className="relative">
            <button
              onClick={() => setActiveMenu(activeMenu === 'res' ? null : 'res')}
              className="h-7 px-3 hover:bg-white/5 rounded-lg text-[9px] font-black text-white/90 flex items-center gap-2 uppercase tracking-widest transition-all flex-shrink-0"
            >
              <Settings2 size={12} className="text-indigo-500"/>
              <span className="tabular-nums flex-shrink-0">{resolution.w} × {resolution.h}</span>
            </button>

            {activeMenu === 'res' && (
              <div className="absolute top-10 left-0 w-48 bg-[#0d0d0d] border border-white/10 rounded-xl overflow-hidden shadow-2xl p-1 z-[500] animate-in fade-in zoom-in-95 duration-200">
                {presets.map((p) => (
                  <button
                    key={p.name}
                    onClick={() => { setResolution({ w: p.w, h: p.h }); setActiveMenu(null); }}
                    className={`w-full flex items-center justify-between px-3 py-2 rounded-lg text-[10px] font-bold transition-all ${resolution.w === p.w && resolution.h === p.h ? 'bg-indigo-600 text-white' : 'text-gray-400 hover:bg-white/5 hover:text-white'}`}
                  >
                    <span>{p.name}</span>
                    <span className="opacity-40 font-mono text-[9px]">{p.w}×{p.h}</span>
                  </button>
                ))}
              </div>
            )}
          </div>

          <div className="w-px h-4 bg-white/10 self-center mx-0.5" />

          {/* Zoom Dropdown */}
          <div className="relative">
            <button
              onClick={() => setActiveMenu(activeMenu === 'zoom' ? null : 'zoom')}
              className="h-7 px-3 hover:bg-white/5 rounded-lg text-[9px] font-black text-white/90 flex items-center gap-2 uppercase tracking-widest transition-all flex-shrink-0"
            >
              <span className="tabular-nums flex-shrink-0">{Math.round(zoom * 100)}%</span>
              <ChevronDown size={12} className={`transition-transform duration-300 opacity-30 ${activeMenu === 'zoom' ? 'rotate-180' : ''}`} />
            </button>

            {activeMenu === 'zoom' && (
              <div className="absolute top-10 left-0 w-28 bg-[#0d0d0d] border border-white/10 rounded-xl overflow-hidden shadow-2xl p-1 z-[500] animate-in fade-in zoom-in-95 duration-200">
                {[0.25, 0.5, 0.75, 1, 1.5, 2].map(p => (
                  <button 
                    key={p} 
                    onClick={() => { setZoom(p); setActiveMenu(null); }} 
                    className={`w-full px-3 py-2 text-[10px] text-left font-black transition-all uppercase rounded-lg ${zoom === p ? 'text-indigo-400 bg-indigo-500/10' : 'text-gray-500 hover:bg-white/5 hover:text-white'}`}
                  >
                    {Math.round(p * 100)}%
                  </button>
                ))}
              </div>
            )}
          </div>
        </div>

        {/* Audio Toggle - Compact h-9 */}
        <button
          onClick={() => setIsMuted(!isMuted)}
          className={`h-9 w-9 flex items-center justify-center bg-[#080808]/95 backdrop-blur-3xl border border-white/10 rounded-2xl transition-all shadow-2xl ${!isMuted ? 'text-indigo-400 bg-indigo-500/10' : 'text-gray-500'}`}
        >
          {isMuted ? <VolumeX size={16} /> : <Volume2 size={16} />}
        </button>
      </div>
    </div>
  );
});

PreviewCanvas.displayName = 'PreviewCanvas';