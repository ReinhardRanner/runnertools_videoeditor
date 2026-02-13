import React, { useState, useRef, memo, useEffect } from 'react';
import { Film, Music, Image as ImageIcon, Code2, Sparkles } from 'lucide-react';
import { TrackItem, ASSET_COLORS } from '../../types';
import { Waveform } from './Waveform';

const TRACK_HEIGHT = 64;
const CLIP_HEADER_HEIGHT = 20;
const TOTAL_CLIP_HEIGHT = 54;

const smoothstep = (t: number) => {
  const v = Math.max(0, Math.min(1, t));
  return v * v * (3 - 2 * v);
};

interface TimelineItemProps {
  item: TrackItem;
  zoom: number;
  selectedId: string | null;
  setSelectedId: (id: string | null) => void;
  setItems: React.Dispatch<React.SetStateAction<TrackItem[]>>;
  trackCount: number;
}

export const TimelineItem = memo(({ item, zoom, selectedId, setSelectedId, setItems, trackCount }: TimelineItemProps) => {
  const isSelected = selectedId === item.instanceId;
  const hasWaveform = item.type !== 'image';

  // --- INTERAKTIONS LOGIK (MANUELL) ---
  const handleAction = (e: React.MouseEvent, type: 'move' | 'left' | 'right') => {
    e.stopPropagation();
    e.preventDefault();
    setSelectedId(item.instanceId);

    const startX = e.clientX;
    const startY = e.clientY;
    const initialItem = { ...item };

    const onMouseMove = (moveE: MouseEvent) => {
      const deltaX = (moveE.clientX - startX) / zoom;
      const deltaY = moveE.clientY - startY;

      setItems((prev) => prev.map((i) => {
        if (i.instanceId !== item.instanceId) return i;

        if (type === 'move') {
          const newLayer = Math.max(0, Math.min(trackCount - 1, Math.round((initialItem.layer * TRACK_HEIGHT + deltaY) / TRACK_HEIGHT)));
          return { 
            ...i, 
            startTime: Math.max(0, initialItem.startTime + deltaX),
            layer: newLayer
          };
        }

        if (type === 'left') {
          // HARTE GRENZE LINKS: startTimeOffset darf nicht < 0 werden
          let validDeltaX = deltaX;
          if (initialItem.startTimeOffset + validDeltaX < 0) {
            validDeltaX = -initialItem.startTimeOffset;
          }
          // Mindestlänge checken
          if (initialItem.duration - validDeltaX < 0.1) {
            validDeltaX = initialItem.duration - 0.1;
          }

          return {
            ...i,
            startTime: initialItem.startTime + validDeltaX,
            startTimeOffset: initialItem.startTimeOffset + validDeltaX,
            duration: initialItem.duration - validDeltaX
          };
        }

        if (type === 'right') {
          // HARTE GRENZE RECHTS: offset + duration darf nicht > sourceDuration werden
          let validDeltaX = deltaX;
          const maxPossibleDuration = initialItem.sourceDuration - initialItem.startTimeOffset;
          if (initialItem.duration + validDeltaX > maxPossibleDuration) {
            validDeltaX = maxPossibleDuration - initialItem.duration;
          }
          // Mindestlänge checken
          if (initialItem.duration + validDeltaX < 0.1) {
            validDeltaX = 0.1 - initialItem.duration;
          }

          return {
            ...i,
            duration: initialItem.duration + validDeltaX
          };
        }

        return i;
      }));
    };

    const onMouseUp = () => {
      window.removeEventListener('mousemove', onMouseMove);
      window.removeEventListener('mouseup', onMouseUp);
      document.body.style.cursor = 'default';
    };

    document.body.style.cursor = type === 'move' ? 'grabbing' : 'col-resize';
    window.addEventListener('mousemove', onMouseMove);
    window.addEventListener('mouseup', onMouseUp);
  };

  // --- HELPER ---
  const getIcon = () => {
    const colors = ASSET_COLORS[item.type];
    const cls = colors?.text || 'text-gray-400';
    switch (item.type) {
      case 'video': return <Film size={11} className={cls} />;
      case 'audio': return <Music size={11} className={cls} />;
      case 'image': return <ImageIcon size={11} className={cls} />;
      case 'html':  return <Code2 size={11} className={cls} />;
      case 'manim': return <Sparkles size={11} className={cls} />;
      default: return null;
    }
  };

  const generateFadePath = (dur: number, type: 'in' | 'out') => {
    const safeDur = Math.min(dur, item.duration / 2);
    const w = safeDur * zoom;
    const clipW = item.duration * zoom;
    if (w <= 1) return "";
    let path = `M ${type === 'in' ? 0 : clipW} ${TOTAL_CLIP_HEIGHT} `;
    for (let i = 0; i <= 12; i++) {
      const t = i / 12;
      const x = type === 'in' ? t * w : clipW - (t * w);
      path += `L ${x} ${TOTAL_CLIP_HEIGHT - (smoothstep(t) * 34)} `;
    }
    path += `L ${type === 'in' ? w : clipW - w} ${TOTAL_CLIP_HEIGHT} Z`;
    return path;
  };

  return (
    <div
      className="absolute group select-none"
      style={{
        left: item.startTime * zoom,
        top: item.layer * TRACK_HEIGHT,
        width: item.duration * zoom,
        height: TRACK_HEIGHT,
        zIndex: isSelected ? 50 : 10,
        willChange: 'left, width, top'
      }}
    >
      {/* Ghost Layer */}
      {isSelected && (
        <div 
          className="absolute h-[54px] top-[5px] bg-white/[0.03] border border-dashed border-white/10 rounded-lg pointer-events-none"
          style={{
            left: -item.startTimeOffset * zoom,
            width: item.sourceDuration * zoom,
            zIndex: -1
          }}
        />
      )}

      {/* Main Clip Content */}
      <div 
        onMouseDown={(e) => handleAction(e, 'move')}
        className={`absolute top-[5px] left-0 right-0 h-[54px] border flex flex-col overflow-hidden rounded-lg transition-colors ${
          isSelected ? 'bg-indigo-500/20 border-indigo-400 shadow-lg' : 'bg-[#18181b] border-white/10 hover:border-white/20'
        }`}
      >
        {/* Header */}
        <div className="h-5 flex items-center px-2 gap-1.5 bg-black/40 border-b border-white/5 pointer-events-none">
          {getIcon()} 
          <span className="truncate text-[8px] font-black uppercase text-gray-200 tracking-tight">{item.name}</span>
          <span className="ml-auto text-[7px] font-mono text-white/30">{item.duration.toFixed(2)}s</span>
        </div>

        {/* Waveform */}
        <div className="relative flex-1 pointer-events-none">
          {hasWaveform && item.url && (
            <Waveform 
              url={item.url} 
              zoom={zoom}
              width={item.duration * zoom} 
              item={item} 
            />
          )}
          <svg className="absolute inset-0 w-full h-full" style={{ top: -CLIP_HEADER_HEIGHT, height: TOTAL_CLIP_HEIGHT }}>
            <path d={generateFadePath(item.fadeInDuration, 'in')} fill="rgba(99, 102, 241, 0.08)" stroke="white" strokeWidth="0.5" strokeDasharray="2,1" opacity="0.4" />
            <path d={generateFadePath(item.fadeOutDuration, 'out')} fill="rgba(99, 102, 241, 0.08)" stroke="white" strokeWidth="0.5" strokeDasharray="2,1" opacity="0.4" />
          </svg>
        </div>

        {/* Resize Handles (Manuell) */}
        <div 
          onMouseDown={(e) => handleAction(e, 'left')}
          className="absolute left-0 top-0 bottom-0 w-2 cursor-col-resize hover:bg-white/10 z-30"
        />
        <div 
          onMouseDown={(e) => handleAction(e, 'right')}
          className="absolute right-0 top-0 bottom-0 w-2 cursor-col-resize hover:bg-white/10 z-30"
        />
      </div>

      {/* Fade Handles (Nur bei Selektion) */}
      {isSelected && (
        <div className="absolute inset-0 pointer-events-none z-40">
           {/* Hier könntest du deine handleFadeDrag Logik von vorhin einfügen */}
        </div>
      )}
    </div>
  );
});