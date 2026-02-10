import React, { useState, useRef, memo } from 'react';
import { Rnd } from 'react-rnd';
import { Film, Music, Image as ImageIcon } from 'lucide-react';
import { TrackItem } from '../../types';
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
  const [isResizing, setIsResizing] = useState(false);
  const [tempState, setTempState] = useState({ startTime: item.startTime, duration: item.duration, offset: item.startTimeOffset });
  const resizeLimits = useRef({ absStart: 0, absEnd: 0, rightAnchor: 0, leftAnchor: 0 });

  const isMedia = item.type === 'video' || item.type === 'audio';

  const getIcon = () => {
    switch (item.type) {
      case 'video': return <Film size={11} className="text-sky-400" />;
      case 'audio': return <Music size={11} className="text-indigo-400" />;
      case 'image': return <ImageIcon size={11} className="text-emerald-400" />;
      default: return null;
    }
  };

  const handleFadeDrag = (type: 'in' | 'out', e: React.MouseEvent) => {
    e.stopPropagation(); e.preventDefault();
    const startX = e.clientX;
    const initialFade = type === 'in' ? item.fadeInDuration : item.fadeOutDuration;
    const onMove = (moveE: MouseEvent) => {
      const deltaX = (moveE.clientX - startX) / zoom;
      const newVal = type === 'in' 
        ? Math.max(0, Math.min(item.duration / 2, initialFade + deltaX))
        : Math.max(0, Math.min(item.duration / 2, initialFade - deltaX));
      setItems((prev) => prev.map((i) => i.instanceId === item.instanceId ? { ...i, [type === 'in' ? 'fadeInDuration' : 'fadeOutDuration']: newVal } : i));
    };
    const onUp = () => { window.removeEventListener('mousemove', onMove); window.removeEventListener('mouseup', onUp); };
    window.addEventListener('mousemove', onMove); window.addEventListener('mouseup', onUp);
  };

  const generateFadePath = (dur: number, type: 'in' | 'out') => {
    const w = dur * zoom;
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
    <Rnd
      dragAxis="both" bounds="parent" dragGrid={[1, TRACK_HEIGHT]} enableResizing={{ right: true, left: true }}
      position={{ x: (isResizing ? tempState.startTime : item.startTime) * zoom, y: item.layer * TRACK_HEIGHT }}
      size={{ width: (isResizing ? tempState.duration : item.duration) * zoom, height: TRACK_HEIGHT }}
      onDragStart={(e) => { e.stopPropagation(); setSelectedId(item.instanceId); }}
      onDragStop={(_, d) => {
        const newLayer = Math.max(0, Math.min(trackCount - 1, Math.round(d.y / TRACK_HEIGHT)));
        setItems((prev) => prev.map((i) => i.instanceId === item.instanceId ? { ...i, startTime: d.x / zoom, layer: newLayer } : i));
      }}
      onResizeStart={() => {
        setIsResizing(true);
        resizeLimits.current = { absStart: item.startTime - item.startTimeOffset, absEnd: (item.startTime - item.startTimeOffset) + item.sourceDuration, rightAnchor: item.startTime + item.duration, leftAnchor: item.startTime };
        setTempState({ startTime: item.startTime, duration: item.duration, offset: item.startTimeOffset });
      }}
      onResize={(_, dir, ref, __, pos) => {
        let nD = parseInt(ref.style.width) / zoom;
        let nS = pos.x / zoom;
        if (item.type !== 'image') {
          if (dir === 'left') { if (nS < resizeLimits.current.absStart) { nS = resizeLimits.current.absStart; nD = resizeLimits.current.rightAnchor - nS; } }
          else { if (resizeLimits.current.leftAnchor + nD > resizeLimits.current.absEnd) nD = resizeLimits.current.absEnd - resizeLimits.current.leftAnchor; }
        }
        setTempState({ startTime: nS, duration: nD, offset: item.type !== 'image' ? item.startTimeOffset + (nS - item.startTime) : 0 });
      }}
      onResizeStop={() => { setIsResizing(false); setItems((prev) => prev.map((i) => i.instanceId === item.instanceId ? { ...i, ...tempState } : i)); }}
    >
      <div className={`mx-0 my-[5px] h-[54px] w-full border flex flex-col relative overflow-hidden transition-all ${selectedId === item.instanceId ? 'bg-indigo-500/10 border-indigo-400' : 'bg-[#121212] border-white/5'}`}>
        <div className="h-5 flex items-center px-2 gap-1.5 bg-black/40 border-b border-white/5 z-20 pointer-events-none">
          {getIcon()} <span className="truncate text-[8px] font-black uppercase text-gray-200 tracking-tight">{item.name}</span>
        </div>
        {isMedia && (
          <div className="relative flex-1">
            <Waveform url={item.url} width={(isResizing ? tempState.duration : item.duration) * zoom} item={item} />
            <svg className="absolute inset-0 w-full h-full pointer-events-none z-10" style={{ top: -CLIP_HEADER_HEIGHT, height: TOTAL_CLIP_HEIGHT }}>
              <path d={generateFadePath(item.fadeInDuration, 'in')} fill="rgba(99, 102, 241, 0.1)" stroke="white" strokeWidth="0.5" strokeDasharray="2,1" />
              <path d={generateFadePath(item.fadeOutDuration, 'out')} fill="rgba(99, 102, 241, 0.1)" stroke="white" strokeWidth="0.5" strokeDasharray="2,1" />
            </svg>
            <div onMouseDown={(e) => handleFadeDrag('in', e)} className="absolute top-0 z-30 cursor-ew-resize group/handle" style={{ left: (item.fadeInDuration * zoom) - 5, width: 10, height: 10 }}>
              <div className="w-2 h-2 bg-white rounded-full border border-indigo-500 opacity-0 group-hover/handle:opacity-100" />
            </div>
            <div onMouseDown={(e) => handleFadeDrag('out', e)} className="absolute top-0 z-30 cursor-ew-resize group/handle" style={{ left: ((item.duration - item.fadeOutDuration) * zoom) - 5, width: 10, height: 10 }}>
              <div className="w-2 h-2 bg-white rounded-full border border-indigo-500 opacity-0 group-hover/handle:opacity-100" />
            </div>
          </div>
        )}
      </div>
    </Rnd>
  );
});