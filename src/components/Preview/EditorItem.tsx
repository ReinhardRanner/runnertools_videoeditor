import React, { useRef, useState, useEffect, memo } from 'react';
import { createPortal } from 'react-dom'; // WICHTIG für die korrekte Position
import { useDrag } from '@use-gesture/react';
import { Resizable } from 're-resizable';
import { RotateCw, Volume2 } from 'lucide-react';
import { getSnapInfo, getAngle } from '../../utils/canvas-math';
import { LHandle, SideHandle, RotationHandle } from '../Preview/EditorHandles';
import { tr } from 'framer-motion/client';
import { ASSET_COLORS } from '../../types';

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
  opacity?: number; // Add this
  zIndex?: number;  // Add this
  onSelect: () => void;
  onUpdate: (id: string, updates: Partial<{ x: number; y: number; width: number; height: number; rotation: number }>) => void;
  children: React.ReactNode;
  tool: 'select' | 'hand';
}

export const EditorItem: React.FC<EditorItemProps> = memo(({
  id, isSelected, x, y, width, height, rotation, zoom, canvasResolution, 
  type, onSelect, onUpdate, children, opacity, zIndex, tool
}) => {
  const elementRef = useRef<HTMLDivElement>(null);
  const [localState, setLocalState] = useState({ x, y, width, height, rotation });
  const [isDragging, setIsDragging] = useState(false);
  const [isResizing, setIsResizing] = useState(false);
  const [isRotating, setIsRotating] = useState(false);
  
  // Snap Lines State (in Canvas-Koordinaten)
  const [snapLines, setSnapLines] = useState<{ x: number | null; y: number | null }>({ x: null, y: null });

  const pointerStyle = tool === 'hand' ? 'none' : 'auto';

  useEffect(() => {
    // Only sync props to local state if we aren't currently interacting
    if (isDragging || isResizing || isRotating) return;

    // Use the functional updater to compare the current local state 
    // with the incoming props to prevent "snap-backs"
    setLocalState(prev => {
      const hasChanged = 
        prev.x !== x || 
        prev.y !== y || 
        prev.width !== width || 
        prev.height !== height || 
        prev.rotation !== rotation;

      if (!hasChanged) return prev;
      return { x, y, width, height, rotation };
    });
  }, [x, y, width, height, rotation, isDragging, isResizing, isRotating]);;

  const vGuides = [0, canvasResolution.w / 2, canvasResolution.w];
  const hGuides = [0, canvasResolution.h / 2, canvasResolution.h];
  const threshold = 20 / zoom;

  const themeHex = ASSET_COLORS[type]?.hex || '#4f46e5';

  // --- DRAG LOGIK ---
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
    threshold: 5,
    eventOptions: { capture: false, passive: false }
  });

  // --- ROTATE LOGIK ---
  // --- ROTATE LOGIK FIXED ---
  const bindRotate = useDrag(({ active, first, last, event, memo }) => {
    if (tool === 'hand') return;
    if (event) event.stopPropagation();

    // Update visual state immediately
    setIsRotating(active);

    if (first) {
      onSelect();
      const rect = elementRef.current?.getBoundingClientRect();
      if (!rect) return;

      const centerX = rect.left + rect.width / 2;
      const centerY = rect.top + rect.height / 2;
      const { clientX, clientY } = event as PointerEvent;
      
      const startAngle = Math.atan2(clientY - centerY, clientX - centerX) * (180 / Math.PI);
      return { startRotation: localState.rotation, startAngle };
    }

    if (!memo) return;

    const rect = elementRef.current?.getBoundingClientRect();
    if (!rect) return;

    const centerX = rect.left + rect.width / 2;
    const centerY = rect.top + rect.height / 2;
    const { clientX, clientY, shiftKey } = event as PointerEvent;
    
    const currentAngle = Math.atan2(clientY - centerY, clientX - centerX) * (180 / Math.PI);
    let newRotation = memo.startRotation + (currentAngle - memo.startAngle);

    // Snapping logic
    if (shiftKey) {
      newRotation = Math.round(newRotation / 15) * 15;
    }

    // Update local visual state
    setLocalState(prev => ({ ...prev, rotation: newRotation }));

    // Final update to parent (App state)
    if (last) {
      onUpdate(id, { rotation: newRotation });
    }
    
    return memo;
  }, {
    threshold: 0,
    eventOptions: { capture: false, passive: false }
  });

  // Portal Ziel: Das Canvas-Element selbst
  const canvasStage = document.getElementById('canvas-stage');

  const activeColor = ASSET_COLORS[type]?.hex || '#6366f1';

  return (
    <>
      {/* 1. SNAP LINES (Portaled to top) */}
      {isSelected && (isDragging || isResizing) && canvasStage && createPortal(
        <div className="absolute inset-0 pointer-events-none" style={{ zIndex: 999999 }}>
          {snapLines.x !== null && (
            <div 
              className="absolute top-0 bottom-0 bg-indigo-500"
              style={{ 
                left: `${snapLines.x}px`, 
                width: `${1 / zoom}px`, 
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

      {/* 2. BASE MEDIA LAYER (Respects zIndex and Opacity) */}
      <div
        ref={elementRef}
        className="absolute will-change-transform"
        style={{
          transform: `translate(${localState.x}px, ${localState.y}px) rotate(${localState.rotation}deg)`,
          width: localState.width, 
          height: localState.height,
          pointerEvents: pointerStyle,
          zIndex: zIndex ?? 1, // Media layer priority
          ['--accent-color' as any]: themeHex
        }}
      >
        <div
          {...bindDrag()}
          className="w-full h-full relative group"
          style={{ 
            cursor: isDragging ? 'grabbing' : 'grab', 
            touchAction: 'none',
            opacity: opacity ?? 1 // Only media fades
          }}
        >
          {/* Audio Placeholder */}
          {type === 'audio' && (
            <div className="absolute inset-0 flex flex-col items-center justify-center bg-indigo-500/10 border-2 border-dashed border-indigo-500/30 rounded-lg pointer-events-none">
              <Volume2 className="text-indigo-400 opacity-40" size={Math.min(localState.width, localState.height) / 3} />
            </div>
          )}
          
          {/* Media Content */}
          {children}

          {/* Selection Backdrop (Faint ring to show bounds when buried) */}
          <div 
            className={`absolute inset-0 pointer-events-none border border-white/10 rounded-sm ${
              isSelected ? 'opacity-100' : 'opacity-0'
            }`} 
          />
        </div>
      </div>

      {/* 3. UI OVERLAY LAYER (Portaled to absolute top for handle priority) */}
      {isSelected && canvasStage && createPortal(
        <div 
          className="absolute pointer-events-none" 
          style={{ 
            // Must match base layer coordinates exactly
            transform: `translate(${localState.x}px, ${localState.y}px) rotate(${localState.rotation}deg)`,
            width: localState.width,
            height: localState.height,
            zIndex: 999999, // Absolute top of the canvas
            left: 0,
            top: 0,
            ['--accent-color' as any]: themeHex
          }}
        >
          <Resizable
            size={{ width: localState.width, height: localState.height }}
            scale={zoom}
            onResizeStart={(e) => { e.stopPropagation(); setIsResizing(true); }}
            onResize={(e, direction, ref, d) => {
              const mouseEvt = e as MouseEvent;
              const isShift = mouseEvt.shiftKey;
              const isCtrl = mouseEvt.ctrlKey;
              
              const currentAR = width / height;

              let newW = width;
              let newH = height;
              let newX = x;
              let newY = y;
              
              // Get Pivot
              let pivot = {
                x: 0.5,
                y: 0.5
              }
              if (!isCtrl) {
                if (direction == 'left') pivot.x = 1;
                else if (direction == 'right') pivot.x = 0;
                else if (direction == 'top') pivot.y = 1;
                else if (direction == 'bottom') pivot.y = 0;
                else if (direction == 'topLeft') {
                  pivot.x = 1;
                  pivot.y = 1;
                }
                else if (direction == 'topRight') {
                  pivot.y = 1;
                  pivot.x = 0;
                }
                else if (direction == 'bottomLeft') {
                  pivot.x = 1;
                  pivot.y = 0;
                }
                else if (direction == 'bottomRight') {
                  pivot.x = 0;
                  pivot.y = 0;
                }
              }
              
              // Scaling
              const scaleFactor = isCtrl ? 2 : 1
              if (direction == 'left' || direction == 'topLeft' || direction == 'bottomLeft' || direction == 'right' || direction == 'topRight' || direction == 'bottomRight') {
                newW = width + (d.width * scaleFactor);
                if (isShift) newH = newW / currentAR;
              }
              if (direction == 'top' || direction == 'topLeft' || direction == 'topRight' || direction == 'bottom' || direction == 'bottomLeft' || direction == 'bottomRight') {
                newH = height + (d.height * scaleFactor);
                if (isShift) newW = newH * currentAR;
              }

              // Moving
              newX = x - (newW - width) * pivot.x;
              newY = y - (newH - height) * pivot.y;
              
              // Snapping
              const threshold = 20 / zoom;
              const vGuides = [0, canvasResolution.w / 2, canvasResolution.w];
              const hGuides = [0, canvasResolution.h / 2, canvasResolution.h];
              if (direction == 'left' || direction == 'topLeft' || direction == 'bottomLeft') {
                  newX = getSnapInfo(newX, vGuides, threshold).value;
                  newW = (width + (x - newX)) * scaleFactor;
                  if (isShift) newH = newW / currentAR;
              } else if (direction == 'right' || direction == 'topRight' || direction == 'bottomRight') {
                  const snappedRight = getSnapInfo(newX + newW, vGuides, threshold).value;
                  newW = snappedRight - newX;
                  if (isShift) {
                    newH = newW / currentAR;
                    newY = y - (newH - height) * pivot.y;
                  }
              }

              if (direction == 'top' || direction == 'topLeft' || direction == 'topRight') {
                  newY = getSnapInfo(newY, hGuides, threshold).value;
                  newH = (height + (y - newY)) * scaleFactor;
                  if (isShift) newW = newH * currentAR;
              } else if (direction == 'bottom' || direction == 'bottomLeft' || direction == 'bottomRight') {
                  let snappedBottom = getSnapInfo(newY + newH, hGuides, threshold).value;
                  newH = snappedBottom - newY;
                  if (isShift) {
                    newW = newH * currentAR;
                    newX = x - (newW - width) * pivot.x;
                  }
              }


              ref.style.width = `${newW}px`;
              ref.style.height = `${newH}px`;

              setLocalState(prev => ({ ...prev, x: newX, y: newY, width: newW, height: newH }));
            }}
            onResizeStop={() => {
              setIsResizing(false);
              setSnapLines({ x: null, y: null });
              onUpdate(id, { x: localState.x, y: localState.y, width: localState.width, height: localState.height });
            }}
            handleComponent={{
              topLeft:     <div className="absolute w-0 h-0 pointer-events-auto" style={{ left: 0, top: 0 }}><LHandle pos="tl" zoom={zoom} /></div>,
              topRight:    <div className="absolute w-0 h-0 pointer-events-auto" style={{ left: '100%', top: 0 }}><LHandle pos="tr" zoom={zoom} /></div>,
              bottomLeft:  <div className="absolute w-0 h-0 pointer-events-auto" style={{ left: 0, top: '100%' }}><LHandle pos="bl" zoom={zoom} /></div>,
              bottomRight: <div className="absolute w-0 h-0 pointer-events-auto" style={{ left: '100%', top: '100%' }}><LHandle pos="br" zoom={zoom} /></div>,
              left:        <div className="absolute w-0 h-0 top-1/2 pointer-events-auto" style={{ left: 0 }}><SideHandle orientation="v" zoom={zoom} /></div>,
              right:       <div className="absolute w-0 h-0 top-1/2 pointer-events-auto" style={{ left: '100%' }}><SideHandle orientation="v" zoom={zoom} /></div>,
              top:         <div className="absolute w-0 h-0 left-1/2 pointer-events-auto" style={{ top: 0 }}><SideHandle orientation="h" zoom={zoom} /></div>,
              bottom:      <div className="absolute w-0 h-0 left-1/2 pointer-events-auto" style={{ top: '100%' }}><SideHandle orientation="h" zoom={zoom} /></div>,
            }}
          >
            {/* The Selection Ring (Always 100% opaque and on top) */}
            <div 
              className="absolute inset-0 pointer-events-none transition-all duration-200"
              style={{
                boxShadow: `0 0 0 ${2 / zoom}px ${activeColor}`,
                backgroundColor: `${activeColor}10`
              }}
            />
          </Resizable>

          {/* Rotation Handle (Portaled to stay on top) */}
          {tool === 'select' && (
            <div 
              {...bindRotate()} 
              className="rotation-handle pointer-events-auto"
              style={{ 
                position: 'absolute',
                top: -14,
                left: '50%',
                transform: 'translate(-50%, -150%)',
                width: 40 / zoom, 
                height: 40 / zoom,
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center'
              }}
            >
              <RotationHandle 
                zoom={zoom}
                isRotating={isRotating}
                rotation={localState.rotation}
                onSelect={onSelect} 
              />
            </div>
          )}
        </div>,
        canvasStage
      )}
    </>
  );
});

EditorItem.displayName = 'EditorItem';