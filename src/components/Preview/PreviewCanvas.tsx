import React, { useState, useEffect, useRef, useCallback, memo, useLayoutEffect } from 'react';
import {
  Monitor, Smartphone, Square, ChevronDown, MousePointer2,
  Hand, Volume2, VolumeX, Settings2, Zap
} from 'lucide-react';
import { Asset } from '../../types';
import { getSnapInfo } from '../../utils/canvas-math';

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
  previewFps: number;
  setPreviewFps: (fps: number) => void;
  previewDownscale: number;
  setPreviewDownscale: (factor: number) => void;
  onAdd: (asset: Asset, x: number, y: number) => void;
  activeDragAsset: Asset | null;
  selectedId: string | null;
  onMoveSelected: (dx: number, dy: number) => void;
}

export const PreviewCanvas: React.FC<PreviewCanvasProps> = memo(({
  children, zoom, setZoom, resolution, setResolution, tool, setTool, 
  isMuted, setIsMuted, onMouseDown,
  previewFps, setPreviewFps, previewDownscale, setPreviewDownscale,
  onAdd, activeDragAsset, selectedId, onMoveSelected
}) => {
  const [activeMenu, setActiveMenu] = useState<'zoom' | 'res' | 'perf' | null>(null);
  const [isDraggingUI, setIsDraggingUI] = useState(false);

  const containerRef = useRef<HTMLDivElement>(null);
  const stageRef = useRef<HTMLDivElement>(null);
  const gridRef = useRef<HTMLDivElement>(null);
  const floatingUiRef = useRef<HTMLDivElement>(null);
  const syncCbRef = useRef<((z: number) => void) | undefined>(undefined);
  const [dragOverPos, setDragOverPos] = useState<{x: number, y: number} | null>(null);

  // --- MOTION REFS ---
  const panRef = useRef({ x: 0, y: 0 });
  const zoomRef = useRef(zoom);
  const velocityRef = useRef({ x: 0, y: 0 });
  const zoomVelocityRef = useRef(0);
  const targetZoomRef = useRef<number | null>(null);
  const lastMousePos = useRef({ x: 0, y: 0 });
  const lastTimestamp = useRef(0);
  const rafId = useRef<number | null>(null);
  const isDraggingRef = useRef(false);
  const startPos = useRef({ x: 0, y: 0 });
  const lastDimensions = useRef({ w: 0, h: 0 });
  const zoomPercentRef = useRef<HTMLSpanElement>(null);
  const ghostRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      // 1. Safety check: Don't move if no element is selected
      // 2. Safety check: Don't move if user is typing in an input/textarea
      if (!selectedId) return;
      if (e.target instanceof HTMLInputElement || e.target instanceof HTMLTextAreaElement) return;

      const isArrowKey = ['ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight'].includes(e.key);
      if (!isArrowKey) return;

      e.preventDefault(); // Prevent page scrolling

      // Determine distance: 1px by default, 10px if Ctrl/Cmd is held
      const step = (e.ctrlKey || e.metaKey) ? 10 : 1;
      
      let dx = 0;
      let dy = 0;

      switch (e.key) {
        case 'ArrowUp':    dy = -step; break;
        case 'ArrowDown':  dy = step;  break;
        case 'ArrowLeft':  dx = -step; break;
        case 'ArrowRight': dx = step;  break;
      }

      onMoveSelected(dx, dy);
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [selectedId, onMoveSelected]); // Re-bind if selection changes

  const updateDOM = useCallback(() => {
    if (!stageRef.current) return;
    
    // 1. Das Canvas bewegen (Hardware-beschleunigt)
    stageRef.current.style.transform = `translate3d(${panRef.current.x}px, ${panRef.current.y}px, 0) scale(${zoomRef.current})`;
    
    // 2. Den Grid-Hintergrund syncen
    if (gridRef.current) {
      const gSize = 40 * zoomRef.current;
      const gBigSize = 200 * zoomRef.current;
      gridRef.current.style.backgroundPosition = `${panRef.current.x}px ${panRef.current.y}px`;
      gridRef.current.style.backgroundSize = `${gSize}px ${gSize}px, ${gSize}px ${gSize}px, ${gBigSize}px ${gBigSize}px, ${gBigSize}px ${gBigSize}px`;
    }

    // 3. NEU: Die Prozentanzeige in der Toolbar direkt updaten (OHNE React-Render)
    if (zoomPercentRef.current) {
      zoomPercentRef.current.textContent = `${Math.round(zoomRef.current * 100)}%`;
    }
  }, []);

  const stopInertia = useCallback(() => {
    if (rafId.current) {
      cancelAnimationFrame(rafId.current);
      rafId.current = null;
    }
    velocityRef.current = { x: 0, y: 0 };
    zoomVelocityRef.current = 0;
    targetZoomRef.current = null;
    syncCbRef.current = undefined; // Callback zurücksetzen
  }, []);

  // Change the signature to make the callback optional
  const startInertiaLoop = useCallback((stateSyncCb?: (z: number) => void) => {
    if (stateSyncCb) {
      syncCbRef.current = stateSyncCb;
    }

    if (rafId.current) return;

    const friction = 0.95;
    const zoomFriction = 0.85;
    const lerpStrength = 0.15;

    const drift = () => {
      const hasPanInertia = Math.abs(velocityRef.current.x) > 0.005 || Math.abs(velocityRef.current.y) > 0.005;
      const hasZoomMomentum = Math.abs(zoomVelocityRef.current) > 0.0001;
      const hasTargetZoom = targetZoomRef.current !== null;

      if (!hasPanInertia && !hasZoomMomentum && !hasTargetZoom) {
        rafId.current = null;
        return;
      }

      // 1. Process Pan Inertia
      if (hasPanInertia) {
        panRef.current.x += velocityRef.current.x * 6; // Matching your original multiplier
        panRef.current.y += velocityRef.current.y * 6;
        velocityRef.current.x *= friction;
        velocityRef.current.y *= friction;
      }

      // 2. Process Zoom Calculation
      const prevZoom = zoomRef.current;
      let nextZoom = prevZoom;

      if (hasTargetZoom) {
        const diff = targetZoomRef.current! - prevZoom;
        if (Math.abs(diff) < 0.001) {
          nextZoom = targetZoomRef.current!;
          targetZoomRef.current = null;
        } else {
          nextZoom = prevZoom + diff * lerpStrength;
        }
      } else if (hasZoomMomentum) {
        nextZoom = Math.min(Math.max(0.05, prevZoom * (1 + zoomVelocityRef.current)), 8);
        zoomVelocityRef.current *= zoomFriction;
      }

      // 3. Focal Point & State Sync
      if (nextZoom !== prevZoom) {
        const zoomRatio = nextZoom / prevZoom;
        panRef.current.x = lastMousePos.current.x - (lastMousePos.current.x - panRef.current.x) * zoomRatio;
        panRef.current.y = lastMousePos.current.y - (lastMousePos.current.y - panRef.current.y) * zoomRatio;
        zoomRef.current = nextZoom;
        
        // Only call if the callback exists (Zoom events)
        if (syncCbRef.current) {
          syncCbRef.current(zoomRef.current);
        }
      }

      updateDOM();
      rafId.current = requestAnimationFrame(drift);
    };

    rafId.current = requestAnimationFrame(drift);
  }, [updateDOM]);

  // Handle Smooth Zoom from Buttons
  const handleSmoothZoomClick = (p: number) => {
    const container = containerRef.current;
    if (!container) return;

    const rect = container.getBoundingClientRect();
    lastMousePos.current = { x: rect.width / 2, y: rect.height / 2 };
    
    zoomVelocityRef.current = 0;
    targetZoomRef.current = p;
    
    let lastSyncTime = 0;
    startInertiaLoop((z) => {
      const now = performance.now();
      // Alle 32ms den React-State füttern
      if (now - lastSyncTime > 32 || z === p) {
        setZoom(z);
        lastSyncTime = now;
      }
    });
    
    setActiveMenu(null);
  };

  // --- WINDOW RESIZE & CENTERING ---
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

  // Sync React State -> Ref
  useEffect(() => {
    if (Math.abs(zoomRef.current - zoom) > 0.001) {
      zoomRef.current = zoom;
      updateDOM();
    }
  }, [zoom, updateDOM]);

  // --- CLICK OUTSIDE MENUS ---
  useEffect(() => {
    const handleGlobalClick = (event: MouseEvent) => {
      if (activeMenu && floatingUiRef.current && !floatingUiRef.current.contains(event.target as Node)) {
        setActiveMenu(null);
      }
    };
    if (activeMenu) {
      document.addEventListener('mousedown', handleGlobalClick);
    }
    return () => document.removeEventListener('mousedown', handleGlobalClick);
  }, [activeMenu]);

  // --- PANNING WITH INERTIA ---
  const velocityBuffer = useRef<{x: number, y: number}[]>([]);
  const handleStartPanning = (e: React.MouseEvent) => {
    const target = e.target as HTMLElement;
    if (target.closest('.rotation-handle')) return;
    
    const isMiddleMouse = e.button === 1;
    if (tool === 'hand' || isMiddleMouse) {
      if (isMiddleMouse) e.preventDefault();
      
      stopInertia();
      setIsDraggingUI(true);
      isDraggingRef.current = true;
      velocityBuffer.current = []; // Clear buffer for new gesture
      
      startPos.current = { x: e.clientX - panRef.current.x, y: e.clientY - panRef.current.y };
      lastTimestamp.current = performance.now();
      lastMousePos.current = { x: e.clientX, y: e.clientY };

      const onMove = (mE: MouseEvent) => {
        const now = performance.now();
        const dt = now - lastTimestamp.current;
        
        if (dt > 0) {
          const instantV = {
            x: (mE.clientX - lastMousePos.current.x) / dt,
            y: (mE.clientY - lastMousePos.current.y) / dt
          };

          // --- VELOCITY SMOOTHING ---
          // We keep the last 4 samples and average them to preserve diagonal momentum
          velocityBuffer.current.push(instantV);
          if (velocityBuffer.current.length > 4) velocityBuffer.current.shift();

          const avgV = velocityBuffer.current.reduce(
            (acc, v) => ({ x: acc.x + v.x, y: acc.y + v.y }), 
            { x: 0, y: 0 }
          );
          
          velocityRef.current = {
            x: avgV.x / velocityBuffer.current.length,
            y: avgV.y / velocityBuffer.current.length
          };
        }

        panRef.current = { x: mE.clientX - startPos.current.x, y: mE.clientY - startPos.current.y };
        lastMousePos.current = { x: mE.clientX, y: mE.clientY };
        lastTimestamp.current = now;
        updateDOM();
      };

      const onUp = () => {
        setIsDraggingUI(false);
        isDraggingRef.current = false;
        window.removeEventListener('mousemove', onMove);
        window.removeEventListener('mouseup', onUp);

        // Instead of starting a local drift loop, we trigger the unified one.
        // It will pick up the velocityRef.current you calculated in onMove.
        startInertiaLoop(); 
      };

      window.addEventListener('mousemove', onMove);
      window.addEventListener('mouseup', onUp);
    } else {
      onMouseDown();
    }
  };

  // --- ZOOMING (Focal Point & exponential curve) ---
  // --- SMOOTH ZOOM HANDLER ---
  useEffect(() => {
    const el = containerRef.current;
    if (!el) return;
    
    let endSyncTimeout: NodeJS.Timeout;

    const handleWheel = (e: WheelEvent) => {
      e.preventDefault();
      const rect = el.getBoundingClientRect();
      lastMousePos.current = { x: e.clientX - rect.left, y: e.clientY - rect.top };

      if (e.ctrlKey) {
        targetZoomRef.current = null;
        zoomVelocityRef.current += -e.deltaY * 0.0003;
        startInertiaLoop();
        clearTimeout(endSyncTimeout);
        endSyncTimeout = setTimeout(() => {
          setZoom(zoomRef.current);
        }, 150); 
      } else if (e.shiftKey) {
        velocityRef.current.x -= e.deltaY * 0.005;
        startInertiaLoop();
        
      } else {
        velocityRef.current.y -= e.deltaY * 0.005;
        startInertiaLoop();
      }
    };

    el.addEventListener('wheel', handleWheel, { passive: false });
    return () => {
      el.removeEventListener('wheel', handleWheel);
      clearTimeout(endSyncTimeout);
    };
  }, [setZoom, updateDOM, startInertiaLoop]);

  const presets = [
    { name: 'Landscape', w: 1920, h: 1080 },
    { name: 'Portrait', w: 1080, h: 1920 },
    { name: 'Square', w: 1080, h: 1080 },
  ];

  const getCanvasCoordinates = (e: React.DragEvent | MouseEvent) => {
    const rect = containerRef.current?.getBoundingClientRect();
    if (!rect) return { x: 0, y: 0 };

    const mouseX = e.clientX - rect.left;
    const mouseY = e.clientY - rect.top;

    // 1. In Welt-Koordinaten umrechnen
    let x = (mouseX - panRef.current.x) / zoomRef.current;
    let y = (mouseY - panRef.current.y) / zoomRef.current;

    // 2. SNAPPING (z.B. an einem 20px Raster)
    const gridSize = 20;
    x = Math.round(x / gridSize) * gridSize;
    y = Math.round(y / gridSize) * gridSize;

    return { x, y };
  };

  const handleDrop = (e: React.DragEvent) => {
    e.preventDefault();
    if (ghostRef.current) ghostRef.current.style.display = 'none';

    const rawData = e.dataTransfer.getData("application/react-asset");
    if (!rawData || !ghostRef.current) return;

    const asset = JSON.parse(rawData) as Asset;
    
    // Wir nehmen die exakten, gesnappten Werte vom Ghost (Top-Left)
    const x = parseFloat(ghostRef.current.dataset.nx || "0");
    const y = parseFloat(ghostRef.current.dataset.ny || "0");

    onAdd(asset, x, y);
  };

  const handleDragOver = (e: React.DragEvent) => {
    e.preventDefault();
    const rect = containerRef.current?.getBoundingClientRect();
    if (!rect || !activeDragAsset || !ghostRef.current) return;

    const w = activeDragAsset.resolution?.w || 400;
    const h = activeDragAsset.resolution?.h || 225;

    // 1. Koordinaten berechnen (Top-Left Fokus)
    const mouseX = (e.clientX - rect.left - panRef.current.x) / zoomRef.current;
    const mouseY = (e.clientY - rect.top - panRef.current.y) / zoomRef.current;
    let nx = mouseX - w / 2;
    let ny = mouseY - h / 2;

    // 2. Snapping (Top-Left)
    const threshold = 20 / zoomRef.current;
    const vGuides = [0, resolution.w / 2, resolution.w];
    const hGuides = [0, resolution.h / 2, resolution.h];

    const snapX = [nx, nx + w / 2, nx + w];
    const snapY = [ny, ny + h / 2, ny + h];

    const resX = [getSnapInfo(snapX[0], vGuides, threshold), getSnapInfo(snapX[1], vGuides, threshold), getSnapInfo(snapX[2], vGuides, threshold)];
    if (resX[0].snapped) nx = resX[0].value;
    else if (resX[1].snapped) nx = resX[1].value - w / 2;
    else if (resX[2].snapped) nx = resX[2].value - w;

    const resY = [getSnapInfo(snapY[0], hGuides, threshold), getSnapInfo(snapY[1], hGuides, threshold), getSnapInfo(snapY[2], hGuides, threshold)];
    if (resY[0].snapped) ny = resY[0].value;
    else if (resY[1].snapped) ny = resY[1].value - h / 2;
    else if (resY[2].snapped) ny = resY[2].value - h;

    // 3. DOM Update (Lag-frei)
    ghostRef.current.style.display = 'block';
    ghostRef.current.style.width = `${w}px`;
    ghostRef.current.style.height = `${h}px`;
    ghostRef.current.style.transform = `translate3d(${nx}px, ${ny}px, 0)`;

    // Bild-URL in den Ghost setzen (nur einmal beim Start)
    const img = ghostRef.current.querySelector('img');
    const video = ghostRef.current.querySelector('video');

    const isVideo = ['video', 'manim', 'html'].includes(activeDragAsset.type);

    if (isVideo && video && img) {
      // Show Video, Hide Image
      img.style.display = 'none';
      video.style.display = 'block';
      
      // Only update src if changed to prevent flickering/reloading
      // We use getAttribute to compare the raw string value
      if (video.getAttribute('src') !== activeDragAsset.url) {
        video.src = activeDragAsset.url;
        video.load();
        video.play().catch(() => { /* silent catch for autoplay policies */ });
      }
    } else if (img && video) {
      // Show Image, Hide Video
      video.style.display = 'none';
      video.pause(); // Stop processing
      img.style.display = 'block';
      
      if (img.getAttribute('src') !== activeDragAsset.url) {
        img.src = activeDragAsset.url;
      }
    }

    ghostRef.current.dataset.nx = nx.toString();
    ghostRef.current.dataset.ny = ny.toString();
  };

  const handleDragLeave = () => {
    if (ghostRef.current) {
      ghostRef.current.style.display = 'none';
    }
  };

  return (
    <div
      ref={containerRef}
      tabIndex={0}
      onMouseDown={handleStartPanning}
      onContextMenu={(e) => e.preventDefault()}
      className={`relative w-full h-full bg-[#1b1b1b] overflow-hidden canvas-container ${
        tool === 'hand' || isDraggingUI ? (isDraggingUI ? 'cursor-grabbing' : 'cursor-grab') : 'cursor-default'
      }`}
      onDragOver={handleDragOver}
      onDragLeave={handleDragLeave}
      onDrop={handleDrop}
    >
      {/* GRID PATTERN */}
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

      {/* RENDER STAGE */}
      <div
        id="canvas-stage"
        ref={stageRef}
        className="absolute bg-black shadow-[0_0_100px_rgba(0,0,0,1)] border border-white/10 flex-shrink-0"
        style={{ 
          width: resolution.w,
          height: resolution.h,
          transformOrigin: '0 0',
          transform: `translate3d(${panRef.current.x}px, ${panRef.current.y}px, 0) scale(${zoomRef.current})`,
          willChange: 'transform',
          pointerEvents: tool === 'hand' || isDraggingUI ? 'none' : 'auto',
          backfaceVisibility: 'hidden',
          WebkitBackfaceVisibility: 'hidden',
          transformStyle: 'preserve-3d',
        }}
      >
        <div 
          ref={ghostRef}
          className="absolute hidden pointer-events-none border-2 border-indigo-500 bg-indigo-500/10 shadow-[0_0_40px_rgba(99,102,241,0.3)] z-[1000] overflow-hidden rounded-sm"
          style={{ left: 0, top: 0, transformOrigin: 'top left' }}
        >
          {/* Image Preview Element */}
          <img 
            className="w-full h-full object-cover opacity-70" 
            src="" 
            alt="" 
          />
          
          {/* NEW: Video Preview Element (Hidden by default via CSS logic in DragOver) */}
          <video
            className="w-full h-full object-cover opacity-70 hidden"
            muted
            loop
            autoPlay
            playsInline
          />
        </div>

        {children}
      </div>

      {/* --- FLOATING UI --- */}
      <div 
        ref={floatingUiRef}
        className="absolute top-4 left-0 right-0 px-4 flex items-center justify-between z-[400]" 
        onClick={e => e.stopPropagation()}
      >
        {/* ISLAND 1: VIEWPORT CONTROLS */}
        <div className="flex items-center gap-0.5 bg-[#080808]/95 backdrop-blur-3xl border border-white/10 p-1 rounded-2xl shadow-2xl">
          <div className="flex gap-0.5 mr-1">
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

          <div className="w-px h-4 bg-white/10 self-center mx-1" />

          <div className="relative">
            <button
              onClick={() => setActiveMenu(activeMenu === 'zoom' ? null : 'zoom')}
              className="h-7 px-3 hover:bg-white/5 rounded-lg text-[9px] font-black text-white/90 flex items-center gap-2 uppercase tracking-widest transition-all"
            >
              <span ref={zoomPercentRef} className="tabular-nums">
                {Math.round(zoom * 100)}%
              </span>
              <ChevronDown size={12} className={`transition-transform duration-300 opacity-30 ${activeMenu === 'zoom' ? 'rotate-180' : ''}`} />
            </button>

            {activeMenu === 'zoom' && (
              <div className="absolute top-10 left-0 w-28 bg-[#0d0d0d] border border-white/10 rounded-xl overflow-hidden shadow-2xl p-1 z-[500] animate-in fade-in zoom-in-95 duration-200">
                {[0.25, 0.5, 0.75, 1, 1.5, 2, 4, 8].map(p => (
                  <button 
                    key={p} 
                    onClick={() => handleSmoothZoomClick(p)}
                    className={`w-full px-3 py-2 text-[10px] text-left font-black transition-all uppercase rounded-lg ${zoom === p ? 'text-indigo-400 bg-indigo-500/10' : 'text-gray-500 hover:bg-white/5'}`}
                  >
                    {Math.round(p * 100)}%
                  </button>
                ))}
              </div>
            )}
          </div>

          <div className="w-px h-4 bg-white/10 self-center mx-1" />

          <button
            onClick={() => setIsMuted(!isMuted)}
            className={`h-7 w-9 flex items-center justify-center rounded-lg transition-all ${!isMuted ? 'text-indigo-400 bg-indigo-500/10' : 'text-gray-500 hover:bg-white/5'}`}
          >
            {isMuted ? <VolumeX size={15} /> : <Volume2 size={15} />}
          </button>
        </div>
      
        {/* ISLAND 2: ENGINE & RENDERING */}
        <div className="flex items-center gap-0.5 bg-[#080808]/95 backdrop-blur-3xl border border-indigo-500/20 p-1 rounded-2xl shadow-2xl">
          <div className="relative">
            <button
              onClick={() => setActiveMenu(activeMenu === 'res' ? null : 'res')}
              className="h-7 px-3 hover:bg-white/5 rounded-lg text-[9px] font-black text-white/90 flex items-center gap-2 uppercase tracking-widest transition-all"
            >
              <Settings2 size={12} className="text-indigo-500"/>
              <span className="tabular-nums">{resolution.w} × {resolution.h}</span>
            </button>

            {activeMenu === 'res' && (
              <div className="absolute top-10 right-0 w-48 bg-[#0d0d0d] border border-white/10 rounded-xl overflow-hidden shadow-2xl p-1 z-[500] animate-in fade-in zoom-in-95 duration-200">
                {presets.map((p) => (
                  <button
                    key={p.name}
                    onClick={() => { setResolution({ w: p.w, h: p.h }); setActiveMenu(null); }}
                    className={`w-full flex items-center justify-between px-3 py-2 rounded-lg text-[10px] font-bold transition-all ${resolution.w === p.w ? 'bg-indigo-600 text-white' : 'text-gray-400 hover:bg-white/5'}`}
                  >
                    <div className="flex items-center gap-2">
                      {p.w > p.h ? <Monitor size={12} /> : <Smartphone size={12} />}
                      <span>{p.name}</span>
                    </div>
                    <span className="opacity-40 font-mono text-[9px]">{p.w}×{p.h}</span>
                  </button>
                ))}
              </div>
            )}
          </div>

          <div className="w-px h-4 bg-white/10 self-center mx-1" />

          <div className="relative">
            <button
              onClick={() => setActiveMenu(activeMenu === 'perf' ? null : 'perf')}
              className="h-7 px-3 hover:bg-white/5 rounded-lg text-[9px] font-black text-white/90 flex items-center gap-2 uppercase tracking-widest transition-all"
            >
              <Zap size={12} className={(previewFps < 60 || previewDownscale < 1) ? 'text-amber-500' : 'text-indigo-500'}/>
              <span className="tabular-nums">{previewFps} FPS • {Math.round(previewDownscale * 100)}%</span>
            </button>

            {activeMenu === 'perf' && (
              <div className="absolute top-10 right-0 w-48 bg-[#0d0d0d] border border-white/10 rounded-xl overflow-hidden shadow-2xl p-3 z-[500] animate-in fade-in zoom-in-95 duration-200">
                <div className="space-y-4">
                  <div>
                    <label className="text-[8px] font-black text-white/30 uppercase tracking-tighter mb-2 block">Engine FPS</label>
                    <div className="grid grid-cols-3 gap-1">
                      {[60, 30, 24].map(f => (
                        <button 
                          key={f} 
                          onClick={() => { setPreviewFps(f); setActiveMenu(null); }} 
                          className={`py-1.5 rounded-md text-[9px] font-bold transition-all ${previewFps === f ? 'bg-indigo-600 text-white' : 'bg-white/5 text-gray-500 hover:text-white'}`}
                        >
                          {f}
                        </button>
                      ))}
                    </div>
                  </div>
                  <div>
                    <label className="text-[8px] font-black text-white/30 uppercase tracking-tighter mb-2 block">Proxy Scale</label>
                    <div className="grid grid-cols-4 gap-1">
                      {[1, 0.75, 0.5, 0.25].map(s => (
                        <button 
                          key={s} 
                          onClick={() => { setPreviewDownscale(s); setActiveMenu(null); }} 
                          className={`py-1.5 rounded-md text-[9px] font-bold transition-all ${previewDownscale === s ? 'bg-indigo-600 text-white' : 'bg-white/5 text-gray-500 hover:text-white'}`}
                        >
                          {Math.round(s * 100)}%
                        </button>
                      ))}
                    </div>
                  </div>
                </div>
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
});

PreviewCanvas.displayName = 'PreviewCanvas';