import React, { useState, useEffect, useRef, useCallback, memo } from 'react';
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
  
  const panRef = useRef({ x: 0, y: 0 });
  const zoomRef = useRef(zoom);
  const isDraggingRef = useRef(false);
  const startPos = useRef({ x: 0, y: 0 });

  const presets = [
    { name: 'Landscape', w: 1920, h: 1080, icon: <Monitor size={14} /> },
    { name: 'Portrait', w: 1080, h: 1920, icon: <Smartphone size={14} /> },
    { name: 'Square', w: 1080, h: 1080, icon: <Square size={14} /> },
  ];

  const updateDOM = useCallback(() => {
    if (!stageRef.current || !gridRef.current) return;
    stageRef.current.style.transform = `translate3d(${panRef.current.x}px, ${panRef.current.y}px, 0) scale(${zoomRef.current})`;
    
    const gSize = 40 * zoomRef.current;
    const gBigSize = 200 * zoomRef.current;
    gridRef.current.style.backgroundPosition = `calc(50% + ${panRef.current.x}px) calc(50% + ${panRef.current.y}px)`;
    gridRef.current.style.backgroundSize = `${gSize}px ${gSize}px, ${gSize}px ${gSize}px, ${gBigSize}px ${gBigSize}px, ${gBigSize}px ${gBigSize}px`;
  }, []);

  useEffect(() => {
    zoomRef.current = zoom;
    updateDOM();
  }, [resolution, updateDOM]);

  const handleStartPanning = (e: React.MouseEvent) => {
    if (tool === 'hand') {
      setIsDraggingUI(true);
      isDraggingRef.current = true;
      startPos.current = { x: e.clientX - panRef.current.x, y: e.clientY - panRef.current.y };
    } else {
      onMouseDown();
    }
  };

  const handleMouseMove = (e: React.MouseEvent) => {
    if (isDraggingRef.current && tool === 'hand') {
      panRef.current = { x: e.clientX - startPos.current.x, y: e.clientY - startPos.current.y };
      updateDOM();
    }
  };

  const handleMouseUp = () => { 
    setIsDraggingUI(false);
    isDraggingRef.current = false; 
  };

  useEffect(() => {
    const el = containerRef.current;
    if (!el) return;
    const handleWheel = (e: WheelEvent) => {
      e.preventDefault();
      if (e.ctrlKey) {
        const factor = 1.02; 
        const delta = e.deltaY > 0 ? 1/factor : factor;
        const nextZoom = Math.min(Math.max(0.05, zoomRef.current * delta), 5);
        zoomRef.current = nextZoom;
        updateDOM();
        setZoom(nextZoom);
      } else {
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
      onMouseMove={handleMouseMove}
      onMouseUp={handleMouseUp}
      onMouseLeave={handleMouseUp}
      onClick={() => setActiveMenu(null)}
      className={`relative w-full h-full bg-bg-elevated overflow-hidden flex items-center justify-center canvas-container ${
        tool === 'hand' ? (isDraggingUI ? 'cursor-grabbing' : 'cursor-grab') : 'cursor-default'
      }`}
    >
      <div 
        ref={gridRef}
        className="absolute inset-0 pointer-events-none" 
        style={{ 
          backgroundImage: `
            linear-gradient(to right, rgba(255,255,255,0.05) 1px, transparent 1px),
            linear-gradient(to bottom, rgba(255,255,255,0.05) 1px, transparent 1px),
            linear-gradient(to right, rgba(255,255,255,0.1) 1px, transparent 1px),
            linear-gradient(to bottom, rgba(255,255,255,0.1) 1px, transparent 1px)
          `,
          backgroundPosition: '50% 50%',
          backgroundSize: '40px 40px, 40px 40px, 200px 200px, 200px 200px',
        }} 
      />

      {/* FIXED: Added id="canvas-stage" so Moveable can find it for snapping */}
      <div 
        ref={stageRef}
        id="canvas-stage"
        className="relative bg-black shadow-[0_0_100px_rgba(0,0,0,1)] border border-border-strong flex-shrink-0"
        style={{ 
          width: resolution.w, 
          height: resolution.h, 
          transformOrigin: 'center center',
          willChange: 'transform',
          pointerEvents: tool === 'hand' ? 'none' : 'auto' 
        }}
      >
        {children}
      </div>

      <div className="absolute top-2 left-1/2 -translate-x-1/2 flex items-center gap-2 z-[400]" onClick={e => e.stopPropagation()}>
        <div className="flex gap-1 bg-bg-overlay/90 backdrop-blur-xl border border-border-default p-1 rounded-xl h-10 shadow-2xl">
          <button onClick={() => setTool('select')} className={`px-3 rounded-lg transition-all ${tool === 'select' ? 'bg-indigo-600 text-white shadow-lg' : 'text-gray-400 hover:text-white'}`}><MousePointer2 size={16} /></button>
          <button onClick={() => setTool('hand')} className={`px-3 rounded-lg transition-all ${tool === 'hand' ? 'bg-indigo-600 text-white shadow-lg' : 'text-gray-400 hover:text-white'}`}><Hand size={16} /></button>
        </div>

        <div className="relative">
          <button 
            onClick={() => setActiveMenu(activeMenu === 'res' ? null : 'res')}
            className="h-10 px-4 shrink-0 whitespace-nowrap bg-black/90 backdrop-blur-xl border border-white/10 rounded-xl text-[10px] font-black text-white flex items-center gap-3 uppercase tracking-tighter hover:border-white/40 transition-all shadow-2xl"
          >
            <Settings2 size={14} className="text-indigo-400 shrink-0"/>
            {resolution.w} × {resolution.h}
            <ChevronDown size={14} className={`shrink-0 transition-transform ${activeMenu === 'res' ? 'rotate-180' : ''}`} />
          </button>

          {activeMenu === 'res' && (
            <div className="absolute top-12 left-0 w-48 bg-[#0a0a0a] border border-white/10 rounded-xl overflow-hidden shadow-2xl animate-in fade-in slide-in-from-top-2 p-1">
              <div className="p-2 text-[8px] font-black text-white/20 uppercase tracking-widest border-b border-white/5 mb-1">Presets</div>
              {presets.map((p) => (
                <button
                  key={p.name}
                  onClick={() => { setResolution({ w: p.w, h: p.h }); setActiveMenu(null); }}
                  className={`w-full flex items-center justify-between px-3 py-2 rounded-lg text-[10px] font-bold transition-all ${resolution.w === p.w && resolution.h === p.h ? 'bg-indigo-600 text-white' : 'text-gray-400 hover:bg-white/5 hover:text-white'}`}
                >
                  <span className="flex items-center gap-2">{p.icon} {p.name}</span>
                  <span className="opacity-40 font-mono text-[9px]">{p.w}×{p.h}</span>
                </button>
              ))}
              <div className="p-2 mt-1 text-[8px] font-black text-white/20 uppercase tracking-widest border-b border-white/5 mb-2">Custom</div>
              <div className="flex items-center gap-2 px-2 pb-2 font-mono text-[10px]">
                <input type="number" value={resolution.w} onChange={(e) => setResolution({ ...resolution, w: parseInt(e.target.value) || 0 })} className="bg-white/5 border border-white/10 rounded-md py-1 w-full text-indigo-400 outline-none focus:border-indigo-500 text-center font-bold" />
                <span className="opacity-30 italic">×</span>
                <input type="number" value={resolution.h} onChange={(e) => setResolution({ ...resolution, h: parseInt(e.target.value) || 0 })} className="bg-white/5 border border-white/10 rounded-md py-1 w-full text-indigo-400 outline-none text-center font-bold" />
              </div>
            </div>
          )}
        </div>

        <div className="relative">
          <button 
            onClick={() => setActiveMenu(activeMenu === 'zoom' ? null : 'zoom')} 
            className="h-10 px-4 bg-black/90 backdrop-blur-xl border border-white/10 rounded-xl text-[10px] font-black text-white flex items-center gap-2 uppercase tracking-tighter hover:border-white/40 transition-all shadow-2xl"
          >
            {/* FIXED: Using zoom prop instead of zoomRef.current to avoid React error */}
            {Math.round(zoom * 100)}% <ChevronDown size={14} className={`transition-transform ${activeMenu === 'zoom' ? 'rotate-180' : ''}`} />
          </button>
          
          {activeMenu === 'zoom' && (
            <div className="absolute top-12 left-0 w-32 bg-[#0a0a0a] border border-white/10 rounded-xl overflow-hidden shadow-2xl animate-in fade-in slide-in-from-top-2">
              {[0.25, 0.5, 0.75, 1, 1.5, 2].map(p => (
                <button key={p} onClick={() => { setZoom(p); setActiveMenu(null); }} className="w-full px-4 py-2 text-[10px] text-left font-bold text-gray-400 hover:bg-indigo-600 hover:text-white transition-colors uppercase font-mono">
                  {Math.round(p * 100)}%
                </button>
              ))}
            </div>
          )}
        </div>

        <button 
          onClick={() => setIsMuted(!isMuted)} 
          className={`h-10 w-10 flex items-center justify-center bg-black/90 backdrop-blur-xl border border-white/10 rounded-xl transition-all shadow-2xl ${!isMuted ? 'text-indigo-400 border-indigo-500/30' : 'text-gray-500'}`}
        >
          {isMuted ? <VolumeX size={18} /> : <Volume2 size={18} />}
        </button>
      </div>
    </div>
  );
});