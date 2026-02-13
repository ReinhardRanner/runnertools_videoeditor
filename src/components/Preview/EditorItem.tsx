import React, { useRef, useState, useEffect, memo } from 'react';
import { createPortal } from 'react-dom'; // WICHTIG für die korrekte Position
import { useDrag } from '@use-gesture/react';
import { Resizable } from 're-resizable';
import { RotateCw, Volume2 } from 'lucide-react';

export interface EditorItemProps {
  id: string;
  isSelected: boolean;
  x: number;
  y: number;
  width: number;
  height: number;
  rotation: number;
  zoom: number;
  canvasResolution: { w: number; h: number };
  type: 'video' | 'audio' | 'image' | 'text' | 'html';
  name?: string;
  onSelect: () => void;
  onUpdate: (id: string, updates: Partial<{ x: number; y: number; width: number; height: number; rotation: number }>) => void;
  children: React.ReactNode;
}

const getSnapInfo = (val: number, guides: number[], threshold: number) => {
  let best = val;
  let minDist = threshold;
  let snapped = false;
  guides.forEach(g => {
    const d = Math.abs(val - g);
    if (d < minDist) {
      minDist = d;
      best = g;
      snapped = true;
    }
  });
  return { value: best, snapped, guide: snapped ? best : null };
};

export const EditorItem: React.FC<EditorItemProps> = memo(({
  id, isSelected, x, y, width, height, rotation, zoom, canvasResolution, type, name, onSelect, onUpdate, children
}) => {
  const elementRef = useRef<HTMLDivElement>(null);
  const [localState, setLocalState] = useState({ x, y, width, height, rotation });
  const [isDragging, setIsDragging] = useState(false);
  const [isResizing, setIsResizing] = useState(false);
  const [isRotating, setIsRotating] = useState(false);
  
  // Snap Lines State (in Canvas-Koordinaten)
  const [snapLines, setSnapLines] = useState<{ x: number | null; y: number | null }>({ x: null, y: null });

  useEffect(() => {
    if (!isDragging && !isResizing && !isRotating) {
      setLocalState({ x, y, width, height, rotation });
    }
  }, [x, y, width, height, rotation, isDragging, isResizing, isRotating]);

  const vGuides = [0, canvasResolution.w / 2, canvasResolution.w];
  const hGuides = [0, canvasResolution.h / 2, canvasResolution.h];
  const threshold = 20 / zoom;

  // --- DRAG LOGIK ---
  // --- DRAG LOGIK FIX ---
    // --- DRAG LOGIK FIX (COMPLETE) ---
    const bindDrag = useDrag(({ down, movement: [mx, my], first, last, memo, tap }) => {
    // 1. Handle simple clicks immediately
    if (tap) {
        onSelect();
        return;
    }

    // 2. Initialize starting position on first movement
    if (first) {
        setIsDragging(true);
        onSelect();
        return { x: localState.x, y: localState.y }; 
    }

    // 3. Safety check: if no memo, we aren't dragging
    if (!memo) return;

    // 4. Calculate coordinates based on movement + start position (memo)
    let nx = memo.x + mx / zoom;
    let ny = memo.y + my / zoom;

    const snapX = [nx, nx + localState.width / 2, nx + localState.width];
    const snapY = [ny, ny + localState.height / 2, ny + localState.height];

    // Snapping Logic for X
    const resX0 = getSnapInfo(snapX[0], vGuides, threshold);
    const resX1 = getSnapInfo(snapX[1], vGuides, threshold);
    const resX2 = getSnapInfo(snapX[2], vGuides, threshold);

    let bestX = nx;
    let activeLineX: number | null = null;
    if (resX0.snapped) { bestX = resX0.value; activeLineX = resX0.guide; }
    else if (resX1.snapped) { bestX = resX1.value - localState.width / 2; activeLineX = resX1.guide; }
    else if (resX2.snapped) { bestX = resX2.value - localState.width; activeLineX = resX2.guide; }

    // Snapping Logic for Y
    const resY0 = getSnapInfo(snapY[0], hGuides, threshold);
    const resY1 = getSnapInfo(snapY[1], hGuides, threshold);
    const resY2 = getSnapInfo(snapY[2], hGuides, threshold);

    let bestY = ny;
    let activeLineY: number | null = null;
    if (resY0.snapped) { bestY = resY0.value; activeLineY = resY0.guide; }
    else if (resY1.snapped) { bestY = resY1.value - localState.height / 2; activeLineY = resY1.guide; }
    else if (resY2.snapped) { bestY = resY2.value - localState.height; activeLineY = resY2.guide; }

    // 5. Update Local State during drag
    if (down) {
        setSnapLines({ x: activeLineX, y: activeLineY });
        setLocalState(prev => ({ ...prev, x: bestX, y: bestY }));
    }

    // 6. Final Update on release
    if (last) { 
        setIsDragging(false); 
        setSnapLines({ x: null, y: null });
        onUpdate(id, { x: bestX, y: bestY }); 
    }

    return memo;
    }, { 
    pointer: { keys: false }, 
    filterTaps: true, 
    threshold: 5 
    });

  // --- ROTATE LOGIK ---
  const bindRotate = useDrag(({ down, first, last, event, memo }) => {
    const getAngle = (cx: number, cy: number, px: number, py: number) => Math.atan2(py - cy, px - cx) * (180 / Math.PI);
    if (first) {
      setIsRotating(true); onSelect();
      const rect = elementRef.current?.getBoundingClientRect();
      if (!rect) return;
      return { startR: localState.rotation, startA: getAngle(rect.left + rect.width / 2, rect.top + rect.height / 2, (event as MouseEvent).clientX, (event as MouseEvent).clientY) };
    }
    if (!down || !memo) return;
    const rect = elementRef.current?.getBoundingClientRect();
    const curA = getAngle(rect!.left + rect!.width / 2, rect!.top + rect!.height / 2, (event as MouseEvent).clientX, (event as MouseEvent).clientY);
    let nr = memo.startR + (curA - memo.startA) + 90;
    if ((event as MouseEvent).shiftKey) nr = Math.round(nr / 15) * 15;
    setLocalState(prev => ({ ...prev, rotation: nr }));
    if (last) { setIsRotating(false); onUpdate(id, { rotation: nr }); }
    return memo;
  });

  const hStyle = { transform: `scale(${1 / zoom})`, transformOrigin: 'center center' };

  // Portal Ziel: Das Canvas-Element selbst
  const canvasStage = document.getElementById('canvas-stage');

    const LHandle = ({ pos, zoom }: { pos: 'tl' | 'tr' | 'bl' | 'br', zoom: number }) => {
  const size = 32;
  const center = size / 2; // 16 (Unser Fixpunkt)
  const arm = 18; // Länge der Schenkel
  const thickness = 3;
  const border = 1;

  // Wir berechnen den Pfad so, dass der "Ellbogen" des L 
  // exakt so verschoben ist, dass die AUSSENKANTE bei 16,16 liegt.
  const offset = (thickness / 2) + border;

  const paths = {
    // tl: Ecke oben links, Schenkel gehen nach rechts (H) und unten (V)
    tl: `M ${center + arm} ${center + offset} H ${center + offset} V ${center + arm}`,
    // tr: Ecke oben rechts, Schenkel gehen nach links (H) und unten (V)
    tr: `M ${center - arm} ${center + offset} H ${center - offset} V ${center + arm}`,
    // bl: Ecke unten links, Schenkel gehen nach rechts (H) und oben (V)
    bl: `M ${center + arm} ${center - offset} H ${center + offset} V ${center - arm}`,
    // br: Ecke unten rechts, Schenkel gehen nach links (H) und oben (V)
    br: `M ${center - arm} ${center - offset} H ${center - offset} V ${center - arm}`,
  };

  return (
    <div 
      style={{ 
        width: size, height: size, 
        position: 'absolute',
        // WICHTIG: Erst zentrieren, dann skalieren. 
        // So bleibt die Mitte (16,16) immer auf der Element-Ecke.
        transform: `translate(-50%, -50%) scale(${1 / zoom})`,
        willChange: 'transform',
      }}
      className="flex items-center justify-center pointer-events-auto"
    >
      <svg width={size} height={size} style={{ overflow: 'visible', shapeRendering: 'geometricPrecision' }}>
        <path d={paths[pos]} fill="none" stroke="#4f46e5" strokeWidth={thickness + border * 2} strokeLinecap="round" strokeLinejoin="round" />
        <path d={paths[pos]} fill="none" stroke="white" strokeWidth={thickness} strokeLinecap="round" strokeLinejoin="round" />
      </svg>
    </div>
  );
};
    const SideHandle = ({ orientation, zoom }: { orientation: 'v' | 'h', zoom: number }) => {
  const size = 32;
  const center = size / 2; // 16
  const len = 20;
  const thickness = 3;
  const border = 1;

  // Die Linie geht genau durch das Zentrum
  const d = orientation === 'v' 
    ? `M ${center} ${center - len/2} V ${center + len/2}` 
    : `M ${center - len/2} ${center} H ${center + len/2}`;

  return (
    <div 
      style={{ 
        width: size, height: size, 
        position: 'absolute',
        transform: `translate(-50%, -50%) scale(${1 / zoom})`,
        willChange: 'transform',
      }}
      className="flex items-center justify-center pointer-events-auto"
    >
      <svg width={size} height={size} style={{ overflow: 'visible', shapeRendering: 'geometricPrecision' }}>
        <path d={d} fill="none" stroke="#4f46e5" strokeWidth={thickness + border * 2} strokeLinecap="round" />
        <path d={d} fill="none" stroke="white" strokeWidth={thickness} strokeLinecap="round" />
      </svg>
    </div>
  );
};

  return (
    <>
      {/* SNAP LINES VIA PORTAL */}
      {isSelected && (isDragging || isResizing) && canvasStage && createPortal(
        <div className="absolute inset-0 pointer-events-none" style={{ zIndex: 9999 }}>
          {snapLines.x !== null && (
            <div 
              className="absolute top-0 bottom-0 bg-indigo-500"
              style={{ 
                left: `${snapLines.x}px`, 
                width: `${1 / zoom}px`, // Bleibt optisch 1px dünn, egal wie groß der Zoom ist
                height: `${canvasResolution.h}px` 
              }}
            />
          )}
          {snapLines.y !== null && (
            <div 
              className="absolute left-0 right-0 bg-indigo-500"
              style={{ 
                top: `${snapLines.y}px`, 
                height: `${1 / zoom}px`, 
                width: `${canvasResolution.w}px` 
              }}
            />
          )}
        </div>,
        canvasStage
      )}

      <div
        ref={elementRef}
        className="absolute will-change-transform"
        style={{
          transform: `translate(${localState.x}px, ${localState.y}px) rotate(${localState.rotation}deg)`,
          width: localState.width, height: localState.height,
          zIndex: isSelected ? 1000 : 100,
          pointerEvents: isDragging || isResizing || isRotating ? 'none' : 'auto',
        }}
        onPointerDownCapture={(e) => { if (e.button === 0) onSelect(); }}
        onPointerDown={(e) => {
            console.log('PointerDown on Item:', id, e);
            if (e.button === 0) onSelect();
        }}
      >
        <Resizable
          size={{ width: localState.width, height: localState.height }}
          scale={zoom}
          onResizeStart={(e) => { e.stopPropagation(); setIsResizing(true); }}
          onResize={(e, direction, ref, d) => {
            const threshold = 20 / zoom;
            const vGuides = [0, canvasResolution.w / 2, canvasResolution.w];
            const hGuides = [0, canvasResolution.h / 2, canvasResolution.h];

            let newW = width + d.width;
            let newH = height + d.height;
            let newX = x;
            let newY = y;

            if (direction.includes('left') || direction.includes('topLeft') || direction.includes('bottomLeft')) {
                const wantedX = x - d.width;
                newX = getSnapInfo(wantedX, vGuides, threshold).value;
                const rightEdge = x + width;
                newW = rightEdge - newX;
            } else if (direction.includes('right') || direction.includes('topRight') || direction.includes('bottomRight')) {
                const wantedRight = x + width + d.width;
                const snappedRight = getSnapInfo(wantedRight, vGuides, threshold).value;
                newW = snappedRight - x;
            }

            if (direction.includes('top') || direction.includes('topLeft') || direction.includes('topRight')) {
                const wantedTop = y - d.height;
                newY = getSnapInfo(wantedTop, hGuides, threshold).value;
                const bottomEdge = y + height;
                newH = bottomEdge - newY;
            } else if (direction.includes('bottom') || direction.includes('bottomLeft') || direction.includes('bottomRight')) {
                const wantedBottom = y + height + d.height;
                let snappedBottom = getSnapInfo(wantedBottom, hGuides, threshold).value;
                newH = snappedBottom - y;
            
            }

            ref.style.width = `${newW}px`;
            ref.style.height = `${newH}px`;

            // State Update
            setLocalState({
                ...localState,
                x: newX,
                y: newY,
                width: newW,
                height: newH
            });

            // debug the quad in the viewport
            /* const parent = document.getElementById('canvas-stage');
            const guideDiv = document.getElementById('resize-guide') as HTMLDivElement || (() => {
                const guide = document.createElement('div');
                guide.id = 'resize-guide';
                parent?.appendChild(guide);
                return guide;
            })();
            guideDiv.style.position = 'absolute';
            guideDiv.style.left = `${newX}px`;
            guideDiv.style.top = `${newY}px`;
            guideDiv.style.width = `${newW}px`;
            guideDiv.style.height = `${newH}px`;
            guideDiv.style.zIndex = '9999';
            guideDiv.style.border = '2px dashed red';
            guideDiv.style.pointerEvents = 'none';
            guideDiv.style.backgroundColor = 'rgba(255, 0, 0, 0.5)';
            if (parent) {
                parent.appendChild(guideDiv);
            } */
        }}
          onResizeStop={() => {
            setIsResizing(false);
            setSnapLines({ x: null, y: null });
            onUpdate(id, { x: localState.x, y: localState.y, width: localState.width, height: localState.height });
          }}
          enable={isSelected ? undefined : false}
          
            handleComponent={{
                // Corners: Einfach auf die Ecke setzen (0 oder 100%)
                topLeft:     <div className="absolute w-0 h-0" style={{ left: 'calc(47% - 1px)', top: 'calc(47% - 1px)' }}><LHandle pos="tl" zoom={zoom} /></div>,
                topRight:    <div className="absolute w-0 h-0" style={{ left: 'calc(53% + 1px)', top: 'calc(47% - 1px)' }}><LHandle pos="tr" zoom={zoom} /></div>,
                bottomLeft:  <div className="absolute w-0 h-0" style={{ left: 'calc(47% - 1px)', top: 'calc(53% + 1px)' }}><LHandle pos="bl" zoom={zoom} /></div>,
                bottomRight: <div className="absolute w-0 h-0" style={{ left: 'calc(53% + 1px)', top: 'calc(53% + 1px)' }}><LHandle pos="br" zoom={zoom} /></div>,

                // Sides: Mittig auf die jeweilige Kante setzen
                left:   <div className="absolute w-0 h-0 top-1/2" style={{ left: 'calc(47% - 1px)' }}><SideHandle orientation="v" zoom={zoom} /></div>,
                right:  <div className="absolute w-0 h-0 top-1/2" style={{ left: 'calc(53% + 1px)' }}><SideHandle orientation="v" zoom={zoom} /></div>,
                top:    <div className="absolute w-0 h-0 left-1/2" style={{ top: 'calc(47% - 1px)' }}><SideHandle orientation="h" zoom={zoom} /></div>,
                bottom: <div className="absolute w-0 h-0 left-1/2" style={{ top: 'calc(53% + 1px)' }}><SideHandle orientation="h" zoom={zoom} /></div>,
            }}
        >
          <div
            {...bindDrag()}
            className={`w-full h-full relative group ${isSelected ? 'ring-1 ring-indigo-500' : 'hover:ring-1 hover:ring-white/30'}`}
            style={{ cursor: isDragging ? 'grabbing' : 'grab', touchAction: 'none' }}
          >
            {type === 'audio' && (
              <div className="absolute inset-0 flex flex-col items-center justify-center bg-indigo-500/10 border-2 border-dashed border-indigo-500/30 rounded-lg pointer-events-none">
                <Volume2 className="text-indigo-400 opacity-40" size={Math.min(localState.width, localState.height) / 3} />
              </div>
            )}
            {children}
          </div>
        </Resizable>

        {isSelected && (
          <div 
            className="absolute left-1/2 -top-12 -translate-x-1/2 flex flex-col items-center gap-0 cursor-grab active:cursor-grabbing pointer-events-auto"
            style={{ transformOrigin: 'bottom center', transform: `translateX(-50%) scale(${1 / zoom})` }}
          >
            <div {...bindRotate()} className="w-6 h-6 bg-white rounded-full shadow-lg border border-gray-200 flex items-center justify-center hover:scale-110 transition-transform z-50 mb-1" onPointerDown={(e) => e.stopPropagation()} >
              <RotateCw size={12} className="text-black" />
            </div>
            <div className="w-px h-6 bg-indigo-500" />
          </div>
        )}
      </div>
    </>
  );
});

EditorItem.displayName = 'EditorItem';