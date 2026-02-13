import React, { memo } from 'react';
import { Film, Music, Image as ImageIcon, Code2, Sparkles } from 'lucide-react';
import { TrackItem, ASSET_COLORS } from '../../types';
import { Waveform } from './Waveform';

const TRACK_HEIGHT = 64;
const CLIP_HEADER_HEIGHT = 20;
const TOTAL_CLIP_HEIGHT = 54;

// Hilfsfunktion für Hex-Codes der SVGs (da Tailwind-Klassen in SVG-Strokes nicht greifen)
const getHexFromType = (type: string) => {
  switch (type) {
    case 'video': return '#38bdf8'; // sky-400
    case 'audio': return '#818cf8'; // indigo-400
    case 'image': return '#34d399'; // emerald-400
    case 'html':  return '#38bdf8'; // sky-400
    case 'manim': return '#c084fc'; // purple-400
    default:      return '#818cf8';
  }
};

const smoothstep = (t: number) => {
  const v = Math.max(0, Math.min(1, t));
  return v * v * (3 - 2 * v);
};

// --- ZOOM-PROOF CORNER HANDLE ---
const LHandle = ({ pos, zoom, color }: { pos: 'tl' | 'tr' | 'bl' | 'br', zoom: number, color: string }) => {
  const size = 32;
  const center = size / 2;
  const arm = 12; 
  const thickness = 3;
  const border = 1;
  const offset = (thickness / 2) + border;

  const paths = {
    tl: `M ${center + arm} ${center + offset} H ${center + offset} V ${center + arm}`,
    tr: `M ${center - arm} ${center + offset} H ${center - offset} V ${center + arm}`,
    bl: `M ${center + arm} ${center - offset} H ${center + offset} V ${center - arm}`,
    br: `M ${center - arm} ${center - offset} H ${center - offset} V ${center - arm}`,
  };

  return (
    <div 
      style={{ 
        width: size, height: size, 
        position: 'absolute',
        transform: `translate(-50%, -50%) scale(${1 / zoom})`,
        willChange: 'transform',
      }}
      className="flex items-center justify-center pointer-events-none"
    >
      <svg width={size} height={size} style={{ overflow: 'visible', shapeRendering: 'geometricPrecision' }}>
        <path d={paths[pos]} fill="none" stroke={color} strokeWidth={thickness + border * 2} strokeLinecap="round" strokeLinejoin="round" />
        <path d={paths[pos]} fill="none" stroke="white" strokeWidth={thickness} strokeLinecap="round" strokeLinejoin="round" />
      </svg>
    </div>
  );
};

// --- ZOOM-PROOF SIDE HANDLE ---
const SideHandle = ({ orientation, zoom, color }: { orientation: 'v' | 'h', zoom: number, color: string }) => {
  const size = 32;
  const center = size / 2;
  const len = 20;
  const thickness = 3;
  const border = 1;

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
      className="flex items-center justify-center pointer-events-none"
    >
      <svg width={size} height={size} style={{ overflow: 'visible', shapeRendering: 'geometricPrecision' }}>
        <path d={d} fill="none" stroke={color} strokeWidth={thickness + border * 2} strokeLinecap="round" />
        <path d={d} fill="none" stroke="white" strokeWidth={thickness} strokeLinecap="round" />
      </svg>
    </div>
  );
};

interface TimelineItemProps {
  item: TrackItem;
  zoom: number;
  selectedId: string | null;
  setSelectedId: (id: string | null) => void;
  setItems: React.Dispatch<React.SetStateAction<TrackItem[]>>;
  trackCount: number;
  items: TrackItem[];
  playheadTime: number;
  onSnap: (time: number | null) => void;
}

export const TimelineItem = memo(({ 
  item, zoom, selectedId, setSelectedId, setItems, trackCount, items, playheadTime, onSnap 
}: TimelineItemProps) => {
  const isSelected = selectedId === item.instanceId;
  const isImage = item.type === 'image';
  
  const safeDuration = item.duration || 5;
  const safeSourceDuration = item.sourceDuration || safeDuration;
  const clipWidth = safeDuration * zoom;

  const styleConfig = ASSET_COLORS[item.type] || ASSET_COLORS.video;
  const accentHex = getHexFromType(item.type);

  const handleFadeDrag = (type: 'in' | 'out', e: React.MouseEvent) => {
    if (isImage) return; // Bilder haben keine Fades
    e.stopPropagation();
    e.preventDefault();
    const startX = e.clientX;
    const initialFade = type === 'in' ? (item.fadeInDuration || 0) : (item.fadeOutDuration || 0);

    const onMove = (moveE: MouseEvent) => {
      const deltaX = (moveE.clientX - startX) / zoom;
      const newVal = type === 'in' 
        ? Math.max(0, Math.min(safeDuration / 2, initialFade + deltaX))
        : Math.max(0, Math.min(safeDuration / 2, initialFade - deltaX));

      setItems((prev) => prev.map((i) => 
        i.instanceId === item.instanceId ? { ...i, [type === 'in' ? 'fadeInDuration' : 'fadeOutDuration']: newVal } : i
      ));
    };

    const onUp = () => {
      window.removeEventListener('mousemove', onMove);
      window.removeEventListener('mouseup', onUp);
    };

    window.addEventListener('mousemove', onMove);
    window.addEventListener('mouseup', onUp);
  };

  const handleAction = (e: React.MouseEvent, type: 'move' | 'left' | 'right') => {
    e.stopPropagation();
    e.preventDefault();
    setSelectedId(item.instanceId);

    const startX = e.clientX;
    const startY = e.clientY;
    const initialItem = { ...item, duration: safeDuration };
    const otherItems = (items || []).filter(i => i.instanceId !== item.instanceId);
    const snapPoints = [playheadTime, ...otherItems.map(i => i.startTime), ...otherItems.map(i => i.startTime + (i.duration || 0))];
    const threshold = 12 / zoom;

    const onMouseMove = (moveE: MouseEvent) => {
      const deltaX = (moveE.clientX - startX) / zoom;
      const deltaY = moveE.clientY - startY;
      let snapTriggered: number | null = null;

      setItems((prev) => prev.map((i) => {
        if (i.instanceId !== item.instanceId) return i;

        if (type === 'move') {
          let newStartTime = Math.max(0, initialItem.startTime + deltaX);
          const newEndTime = newStartTime + initialItem.duration;

          for (const p of snapPoints) {
            if (Math.abs(p - newStartTime) < threshold) { newStartTime = p; snapTriggered = p; break; }
            if (Math.abs(p - newEndTime) < threshold) { newStartTime = p - initialItem.duration; snapTriggered = p; break; }
          }
          const newLayer = Math.max(0, Math.min(trackCount - 1, Math.round((initialItem.layer * TRACK_HEIGHT + deltaY) / TRACK_HEIGHT)));
          return { ...i, startTime: newStartTime, layer: newLayer };
        }

        if (type === 'left') {
          let newStartTime = initialItem.startTime + deltaX;
          if ((initialItem.startTimeOffset || 0) + (newStartTime - initialItem.startTime) < 0) {
            newStartTime = initialItem.startTime - (initialItem.startTimeOffset || 0);
          }
          for (const p of snapPoints) {
            if (Math.abs(p - newStartTime) < threshold) { newStartTime = p; snapTriggered = p; break; }
          }
          const finalDelta = newStartTime - initialItem.startTime;
          return { ...i, startTime: newStartTime, startTimeOffset: (initialItem.startTimeOffset || 0) + finalDelta, duration: Math.max(0.1, initialItem.duration - finalDelta) };
        }

        if (type === 'right') {
          let newDuration = initialItem.duration + deltaX;
          const maxDur = isImage ? 9999 : (initialItem.sourceDuration || 9999) - (initialItem.startTimeOffset || 0);
          const newEndTime = initialItem.startTime + newDuration;
          for (const p of snapPoints) {
            if (Math.abs(p - newEndTime) < threshold) { newDuration = p - initialItem.startTime; snapTriggered = p; break; }
          }
          return { ...i, duration: Math.min(Math.max(0.1, newDuration), maxDur) };
        }
        return i;
      }));
      onSnap(snapTriggered);
    };

    const onMouseUp = () => {
      window.removeEventListener('mousemove', onMouseMove);
      window.removeEventListener('mouseup', onMouseUp);
      onSnap(null);
    };

    window.addEventListener('mousemove', onMouseMove);
    window.addEventListener('mouseup', onMouseUp);
  };

  const generateFadePath = (dur: number, type: 'in' | 'out') => {
    if (isImage) return ""; // Pfad für Bilder unterdrücken
    const safeDur = Math.min(dur || 0, safeDuration / 2);
    const w = safeDur * zoom;
    if (w <= 1) return "";
    let path = `M ${type === 'in' ? 0 : clipWidth} ${TOTAL_CLIP_HEIGHT} `;
    for (let i = 0; i <= 12; i++) {
      const t = i / 12;
      const x = type === 'in' ? t * w : clipWidth - (t * w);
      path += `L ${x} ${TOTAL_CLIP_HEIGHT - (smoothstep(t) * 34)} `;
    }
    path += `L ${type === 'in' ? w : clipWidth - w} ${TOTAL_CLIP_HEIGHT} Z`;
    return path;
  };

  return (
    <div
      className="absolute group select-none"
      style={{
        left: item.startTime * zoom,
        top: item.layer * TRACK_HEIGHT,
        width: clipWidth,
        height: TRACK_HEIGHT,
        zIndex: isSelected ? 50 : 10,
        willChange: 'left, width, top'
      }}
    >
      {/* Ghost Layer */}
      {isSelected && (
        <div 
          className={`absolute h-[54px] top-[5px] border border-dashed rounded-lg pointer-events-none opacity-20 ${styleConfig.bg} ${styleConfig.border}`}
          style={{ left: -(item.startTimeOffset || 0) * zoom, width: safeSourceDuration * zoom, zIndex: -1 }}
        />
      )}

      {/* Main Clip Content */}
      <div 
        onMouseDown={(e) => handleAction(e, 'move')}
        className={`absolute top-[5px] left-0 right-0 h-[54px] border flex flex-col overflow-hidden rounded-lg transition-all ${
          isSelected 
            ? `${styleConfig.bg} ${styleConfig.accent} shadow-lg shadow-black/40` 
            : `bg-[#18181b] border-white/10 hover:border-white/20`
        }`}
      >
        <div className="h-5 flex items-center px-2 gap-1.5 bg-black/40 border-b border-white/5 pointer-events-none overflow-hidden">
          <div className={`shrink-0 flex items-center ${styleConfig.text}`}>
            {item.type === 'video' && <Film size={11} />}
            {item.type === 'audio' && <Music size={11} />}
            {item.type === 'image' && <ImageIcon size={11} />}
            {item.type === 'html' && <Code2 size={11} />}
            {item.type === 'manim' && <Sparkles size={11} />}
          </div>
          <span className="truncate text-[8px] font-black uppercase tracking-tight flex-1 text-gray-200">
            {item.name}
          </span>
        </div>

        <div className="relative flex-1 pointer-events-none">
          {!isImage && item.url && <Waveform url={item.url} zoom={zoom} width={clipWidth} item={item} />}
          <svg className="absolute inset-0 w-full h-full" style={{ top: -CLIP_HEADER_HEIGHT, height: TOTAL_CLIP_HEIGHT }}>
            <path d={generateFadePath(item.fadeInDuration || 0, 'in')} fill={accentHex} fillOpacity="0.1" stroke="white" strokeWidth="0.5" strokeDasharray="2,1" opacity="0.4" />
            <path d={generateFadePath(item.fadeOutDuration || 0, 'out')} fill={accentHex} fillOpacity="0.1" stroke="white" strokeWidth="0.5" strokeDasharray="2,1" opacity="0.4" />
          </svg>
        </div>

        {/* Trim Handles */}
        <div 
          onMouseDown={(e) => handleAction(e, 'left')} 
          className="absolute left-0 top-0 bottom-0 w-4 cursor-col-resize z-30 flex items-center justify-center group/trim-left hover:bg-white/5 transition-colors"
        >
          <div className="opacity-0 group-hover/trim-left:opacity-100 transition-opacity">
            <SideHandle orientation="v" zoom={zoom} color={accentHex} />
          </div>
        </div>

        <div 
          onMouseDown={(e) => handleAction(e, 'right')} 
          className="absolute right-0 top-0 bottom-0 w-4 cursor-col-resize z-30 flex items-center justify-center group/trim-right hover:bg-white/5 transition-colors"
        >
          <div className="opacity-0 group-hover/trim-right:opacity-100 transition-opacity">
            <SideHandle orientation="v" zoom={zoom} color={accentHex} />
          </div>
        </div>
      </div>

      {/* Fade Handles (Nur für Video/Audio) */}
      {isSelected && !isImage && (
        <div className="absolute inset-0 pointer-events-none z-40">
          <div onMouseDown={(e) => handleFadeDrag('in', e)} className="absolute top-5 translate-x-[-50%] cursor-ew-resize pointer-events-auto" style={{ left: (Math.min(item.fadeInDuration || 0, safeDuration / 2) * zoom) }}>
             <div className="w-2.5 h-2.5 bg-white rounded-full border-2 shadow-xl" style={{ borderColor: accentHex }} />
          </div>
          <div onMouseDown={(e) => handleFadeDrag('out', e)} className="absolute top-5 translate-x-[-50%] cursor-ew-resize pointer-events-auto" style={{ left: (safeDuration - Math.min(item.fadeOutDuration || 0, safeDuration / 2)) * zoom }}>
             <div className="w-2.5 h-2.5 bg-white rounded-full border-2 shadow-xl" style={{ borderColor: accentHex }} />
          </div>
        </div>
      )}
    </div>
  );
});

TimelineItem.displayName = 'TimelineItem';