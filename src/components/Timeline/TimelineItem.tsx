import React, { memo, useMemo, useState, useEffect } from 'react';
import { Film, Music, Image as ImageIcon, Code2, Sparkles, ChevronDown, Camera } from 'lucide-react';
import { TrackItem, ASSET_COLORS } from '../../types';
import { Waveform } from './Waveform';
import { useDrag } from '@use-gesture/react';

const TRACK_HEIGHT = 64;
const CLIP_HEADER_HEIGHT = 20;
const TOTAL_CLIP_HEIGHT = 54;
const FRAME_WIDTH = 100; 
const CACHE_STEP = 1;

// --- UTILS ---
const smoothstep = (t: number) => {
  const v = Math.max(0, Math.min(1, t));
  return v * v * (3 - 2 * v);
};

const getHexFromType = (type: string) => {
  switch (type) {
    case 'video': return '#38bdf8';
    case 'audio': return '#818cf8';
    case 'image': return '#34d399';
    case 'html':  return '#38bdf8';
    case 'manim': return '#c084fc';
    default:      return '#818cf8';
  }
};

// --- SINGLETON THUMBNAIL GENERATOR ---
class ThumbnailGenerator {
  private cache = new Map<string, string>();
  private queue: { key: string; url: string; time: number; cb: (url: string) => void }[] = [];
  private processing = false;
  private video: HTMLVideoElement | null = null;
  private canvas: HTMLCanvasElement | null = null;

  constructor() {
    if (typeof window === 'undefined') return;
    this.video = document.createElement('video');
    this.video.muted = true;
    this.video.crossOrigin = "anonymous";
    this.canvas = document.createElement('canvas');
    // We no longer hardcode width/height here
  }

  public request(url: string, time: number, cb: (url: string) => void) {
    const key = `${url}-${time}`;
    if (this.cache.has(key)) {
      cb(this.cache.get(key)!);
      return;
    }
    this.queue.push({ key, url, time, cb });
    this.processQueue();
  }

  private async processQueue() {
    if (this.processing || this.queue.length === 0 || !this.video || !this.canvas) return;
    this.processing = true;

    const task = this.queue.shift()!;
    try {
      if (this.video.src !== task.url) {
        this.video.src = task.url;
        await new Promise((resolve) => {
          this.video!.onloadedmetadata = resolve;
          this.video!.onerror = resolve;
        });
      }

      // --- THE FIX: Match the video's actual resolution ---
      this.canvas.width = this.video.videoWidth;
      this.canvas.height = this.video.videoHeight;

      this.video.currentTime = task.time;
      await new Promise((resolve) => {
        const onSeeked = () => {
          this.video!.removeEventListener('seeked', onSeeked);
          resolve(true);
        };
        this.video!.addEventListener('seeked', onSeeked);
        setTimeout(resolve, 1000); 
      });

      const ctx = this.canvas.getContext('2d', { alpha: false }); // Performance boost
      if (ctx) {
        ctx.drawImage(this.video, 0, 0, this.canvas.width, this.canvas.height);
        
        // Increase quality to 0.95 or 1.0 for the freeze frame
        const dataUrl = this.canvas.toDataURL('image/jpeg', 0.95);
        this.cache.set(task.key, dataUrl);
        task.cb(dataUrl);
      }
    } catch (e) {
      console.error("Frame capture failed", e);
    }
    this.processing = false;
    this.processQueue();
  }
}

const generator = new ThumbnailGenerator();

const ImageSequence = memo(({ item, zoom, clipWidth }: { item: TrackItem, zoom: number, clipWidth: number }) => {
  const [bakedFrames, setBakedFrames] = useState<Record<number, string>>({});
  const isVideoType = ['video', 'html', 'manim'].includes(item.type);
  const frameCount = Math.ceil(clipWidth / FRAME_WIDTH);

  const requestedTimes = useMemo(() => {
    if (!isVideoType) return [];
    return Array.from({ length: frameCount }).map((_, i) => {
      const timeOffset = (i * FRAME_WIDTH) / zoom;
      return Math.round((item.startTimeOffset + timeOffset) / CACHE_STEP) * CACHE_STEP;
    });
  }, [frameCount, item.startTimeOffset, zoom, isVideoType]);

  useEffect(() => {
    if (!isVideoType || !item.url) return;
    requestedTimes.forEach((time) => {
      generator.request(item.url, time, (dataUrl) => {
        setBakedFrames(prev => ({ ...prev, [time]: dataUrl }));
      });
    });
  }, [requestedTimes, item.url, isVideoType]);

  if (item.type === 'audio') return null;

  return (
    <div className="absolute inset-0 flex overflow-hidden pointer-events-none opacity-40 transition-opacity duration-500">
      {item.type === 'image' ? (
        <img src={item.url} alt="" className="w-full h-full object-cover" />
      ) : (
        requestedTimes.map((time, i) => (
          <div key={`${item.instanceId}-${i}-${time}`} className="h-full shrink-0 border-r border-black/20 bg-white/[0.02]" style={{ width: FRAME_WIDTH }}>
            {bakedFrames[time] && <img src={bakedFrames[time]} alt="" className="w-full h-full object-cover animate-in fade-in duration-300" />}
          </div>
        ))
      )}
    </div>
  );
});

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
  onCaptureFrame: (name: string, dataUrl: string) => void;
}

export const TimelineItem = memo(({ 
  item, zoom, selectedId, setSelectedId, setItems, trackCount, items, playheadTime, onSnap, onCaptureFrame
}: TimelineItemProps) => {
  const isSelected = selectedId === item.instanceId;
  const isImage = item.type === 'image';
  const safeDuration = item.duration || 5;
  const styleConfig = ASSET_COLORS[item.type] || ASSET_COLORS.video;
  const accentHex = getHexFromType(item.type);
  const [isMenuOpen, setIsMenuOpen] = useState(false);
  const isVideoContent = ['video', 'html', 'manim'].includes(item.type);

  const [isInteracting, setIsInteracting] = useState(false);

  // --- UTILS: Fade Path ---
  const SideHandle = ({ orientation, color }: { orientation: 'v' | 'h', color: string }) => {
    const size = 38;
    const center = size / 2;
    const d = orientation === 'v' 
      ? `M ${center} ${center - 8} V ${center + 8}` 
      : `M ${center - 8} ${center} H ${center + 8}`;

    return (
      <div className="flex items-center justify-center pointer-events-none">
        <svg 
          width={size} 
          height={size} 
          viewBox={`0 0 ${size} ${size}`}
          style={{ overflow: 'visible' }}
        >
          <path d={d} fill="none" stroke="#ffffff8e" strokeWidth="4" strokeLinecap="round" />
        </svg>
      </div>
    );
  };

  // --- MOVE LOGIC ---
  const bindMove = useDrag(({ down, movement: [mx, my], first, last, memo, event }) => {
    // 1. Verhindert Drag auf Trim-Handles & Menü
    if ((event.target as HTMLElement).closest('.stop-propagation')) return;

    if (first) {
      // Auswahl direkt hier erledigen
      setSelectedId(item.instanceId);
      setIsInteracting(true);
      // Startwerte im memo speichern
      return { startX: item.startTime, startY: item.layer };
    }

    // Berechnung (mx sind Pixel, zoom ist Pixel/Sekunde)
    // WICHTIG: Nutze memo?.startX um sicherzugehen, dass memo existiert
    const startX = memo?.startX ?? item.startTime;
    const startY = memo?.startY ?? item.layer;

    let nS = Math.max(0, startX + mx / zoom);
    const nL = Math.max(0, Math.min(trackCount - 1, startY + Math.round(my / TRACK_HEIGHT)));

    // Snap-Logik
    const otherItems = items.filter(i => i.instanceId !== item.instanceId);
    const snapPoints = [0, playheadTime, ...otherItems.flatMap(i => [i.startTime, i.startTime + i.duration])];
    const threshold = 15 / zoom;
    let snapTrigger: number | null = null;

    for (const p of snapPoints) {
      if (Math.abs(p - nS) < threshold) { nS = p; snapTrigger = p; break; }
      if (Math.abs(p - (nS + item.duration)) < threshold) { nS = p - item.duration; snapTrigger = p; break; }
    }

    if (down) {
      onSnap(snapTrigger);
      setItems(prev => prev.map(i => 
        i.instanceId === item.instanceId ? { ...i, startTime: nS, layer: nL } : i
      ));
    }

    if (last) {
      setIsInteracting(false);
      onSnap(null);
    }
    return memo;
  }, { 
    filterTaps: true, 
    threshold: 5,
    // Verhindert, dass Text markiert wird während des Drags
    eventOptions: { passive: false } 
  });

  // --- FADE DRAG LOGIC ---
  const handleFadeDrag = (type: 'in' | 'out', e: React.MouseEvent) => {
    e.stopPropagation(); e.preventDefault();
    setIsInteracting(true);
    const startX = e.clientX;
    const initialFade = type === 'in' ? (item.fadeInDuration || 0) : (item.fadeOutDuration || 0);

    const onMove = (moveE: MouseEvent) => {
      const deltaX = (moveE.clientX - startX) / zoom;
      const newVal = type === 'in' 
        ? Math.max(0, Math.min(item.duration / 2, initialFade + deltaX))
        : Math.max(0, Math.min(item.duration / 2, initialFade - deltaX));
      setItems((prev) => prev.map((i) => i.instanceId === item.instanceId ? { ...i, [type === 'in' ? 'fadeInDuration' : 'fadeOutDuration']: newVal } : i));
    };
    const onUp = () => { 
      window.removeEventListener('mousemove', onMove); 
      window.removeEventListener('mouseup', onUp); 
      setIsInteracting(false);
    };
    window.addEventListener('mousemove', onMove);
    window.addEventListener('mouseup', onUp);
  };

  // --- TRIM LOGIC (Left/Right) ---
  const handleAction = (e: React.MouseEvent, type: 'left' | 'right') => {
    e.stopPropagation(); e.preventDefault();
    setIsInteracting(true);
    setSelectedId(item.instanceId);
    const startX = e.clientX;
    const initialStartTime = item.startTime;
    const initialDuration = item.duration;
    const initialOffset = item.startTimeOffset || 0;
    const otherItems = items.filter(i => i.instanceId !== item.instanceId);
    const snapPoints = [0, playheadTime, ...otherItems.flatMap(i => [i.startTime, i.startTime + i.duration])];
    const threshold = 15 / zoom;

    const onMouseMove = (moveE: MouseEvent) => {
      const deltaX = (moveE.clientX - startX) / zoom;
      let snapTrigger: number | null = null;
      setItems(prev => prev.map(i => {
        if (i.instanceId !== item.instanceId) return i;
        if (type === 'left') {
          let nS = initialStartTime + deltaX;
          if (initialOffset + (nS - initialStartTime) < 0) nS = initialStartTime - initialOffset;
          for (const p of snapPoints) { if (Math.abs(p - nS) < threshold) { nS = p; snapTrigger = p; break; } }
          const diff = nS - initialStartTime;
          return { ...i, startTime: nS, duration: Math.max(0.1, initialDuration - diff), startTimeOffset: initialOffset + diff };
        } else {
          let nD = initialDuration + deltaX;
          const maxD = isImage ? 9999 : (item.sourceDuration || 9999) - initialOffset;
          const nE = initialStartTime + nD;
          for (const p of snapPoints) { if (Math.abs(p - nE) < threshold) { nD = p - initialStartTime; snapTrigger = p; break; } }
          return { ...i, duration: Math.min(Math.max(0.1, nD), maxD) };
        }
      }));
      onSnap(snapTrigger);
    };
    const onMouseUp = () => { 
      window.removeEventListener('mousemove', onMouseMove); 
      window.removeEventListener('mouseup', onMouseUp); 
      setIsInteracting(false); onSnap(null); 
    };
    window.addEventListener('mousemove', onMouseMove);
    window.addEventListener('mouseup', onMouseUp);
  };

  const generateFadePath = (dur: number, type: 'in' | 'out') => {
    const height=32;
    if (isImage) return "";
    const safeDur = Math.min(dur || 0, item.duration / 2);
    const w = safeDur * zoom;
    if (w <= 1) return "";

    const clipWidth = item.duration * zoom;
    
    // Startpunkt: Unten am Rand des 34px-Containers
    let path = `M ${type === 'in' ? 0 : clipWidth} ${height} `;

    for (let i = 0; i <= 12; i++) {
      const t = i / 12;
      const x = type === 'in' ? t * w : clipWidth - (t * w);
      
      // Smoothstep geht von 0 bis 1. 
      // Wir rechnen: 34 - (0..1 * 34) -> Ergibt Werte zwischen 34 (unten) und 0 (oben)
      const y = height - (smoothstep(t) * height);
      path += `L ${x} ${y} `;
    }

    // Pfad schließen
    path += `L ${type === 'in' ? w : clipWidth - w} ${height} Z`;
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
        zIndex: isSelected ? 100 : 10,
        transition: isInteracting ? 'none' : 'left 0.2s, top 0.2s, width 0.2s'
      }}
    >
      {/* 1. GHOST LAYER */}
      {isSelected && !isImage && (
        <div 
          className={`absolute h-[54px] top-[5px] border border-dashed rounded-lg pointer-events-none ${styleConfig.border}`} 
          style={{ 
            left: -(item.startTimeOffset || 0) * zoom, 
            width: (item.sourceDuration || item.duration) * zoom, 
            zIndex: -1,
            // opacity: 0.9 entfernt, damit der Rahmen 100% hat
          }} 
        >
          {/* Hintergrund-Layer mit separater Opacity */}
          <div 
            className={`absolute inset-0 rounded-lg ${styleConfig.bg} opacity-60`} 
          />
        </div>
      )}

      {/* MAIN CONTENT & DRAG AREA */}
      <div 
        {...bindMove()} 
        onPointerDownCapture={(e) => {
          if (!(e.target as HTMLElement).closest('.stop-propagation')) {
            setSelectedId(item.instanceId);
          }
        }}
        className={`absolute inset-x-0 top-[5px] h-[54px] border flex flex-col rounded-lg ${
          isSelected 
            ? `${styleConfig.bg} ${styleConfig.accent} shadow-lg shadow-black/40` 
            : `bg-[#18181b] border-white/10 hover:border-white/20`
        } touch-none`} 
        /* HINWEIS: overflow-hidden hier entfernt, damit die Handles rausragen dürfen! */
      >
        {/* Header & Waveform Bereich bekommt jetzt das overflow-hidden */}
        <div className="absolute inset-0 flex flex-col rounded-lg overflow-hidden pointer-events-none">
          <div className="h-5 flex items-center px-2 bg-black/40 border-b border-white/5 relative z-10">
            <span className="truncate text-[8px] font-black uppercase text-gray-200">{item.name}</span>
          </div>

          <div className="relative flex-1">
            <ImageSequence item={item} zoom={zoom} clipWidth={item.duration * zoom} />
            {item.type !== 'image' && item.url && (
              <Waveform url={item.url} zoom={zoom} width={item.duration * zoom} item={item} color={accentHex} />
            )}
            {/* TRIM HANDLES - Außerhalb des overflow-hidden Bereichs */}
            <svg 
              className="absolute inset-0 w-full h-full pointer-events-none z-10"
              style={{ height: '34px' }} // Höhe des Waveform-Bereichs
            >
              <path 
                d={generateFadePath(item.fadeInDuration || 0, 'in')} 
                fill={accentHex} 
                fillOpacity="0.15" 
                stroke="white" 
                strokeWidth="0.5" 
                strokeDasharray="2,1" 
              />
              <path 
                d={generateFadePath(item.fadeOutDuration || 0, 'out')} 
                fill={accentHex} 
                fillOpacity="0.15" 
                stroke="white" 
                strokeWidth="0.5" 
                strokeDasharray="2,1" 
              />
            </svg>
          </div>
        </div>
        
        {/* LINKS TRIM HANDLE */}
        <div 
          onMouseDown={(e) => handleAction(e, 'left')} 
          className="stop-propagation absolute left-0 top-0 bottom-0 w-4 cursor-col-resize z-30 group/handle"
        >
          {/* Der weiße Block (Hintergrund) */}
          <div className="absolute inset-0 bg-white opacity-0 group-hover/handle:opacity-20 transition-opacity rounded-l-lg" />
          
          {/* Die weiße Linie - Jetzt zentriert und nur bei Hover sichtbar */}
          <div className="absolute left-1/2 top-1/2 -translate-y-1/2 -translate-x-1/2 opacity-0 group-hover/handle:opacity-100 transition-opacity pointer-events-none">
            <SideHandle orientation="v" color={accentHex} />
          </div>
        </div>

        {/* RECHTS TRIM HANDLE */}
        <div 
          onMouseDown={(e) => handleAction(e, 'right')} 
          className="stop-propagation absolute right-0 top-0 bottom-0 w-4 cursor-col-resize z-30 group/handle"
        >
          {/* Der weiße Block (Hintergrund) */}
          <div className="absolute inset-0 bg-white opacity-0 group-hover/handle:opacity-20 transition-opacity rounded-r-lg" />
          
          {/* Die weiße Linie - Jetzt zentriert und nur bei Hover sichtbar */}
          <div className="absolute left-1/2 top-1/2 -translate-y-1/2 -translate-x-1/2 opacity-0 group-hover/handle:opacity-100 transition-opacity pointer-events-none">
            <SideHandle orientation="v" color={accentHex} />
          </div>
        </div>
      </div>

      {/* 4. FADE HANDLES (Dots) */}
      {isSelected && !isImage && (
        <div className="absolute inset-0 pointer-events-none z-40">
          <div 
            onMouseDown={(e) => handleFadeDrag('in', e)} 
            className="absolute top-5 translate-x-[-50%] cursor-ew-resize pointer-events-auto" 
            style={{ left: (Math.min(item.fadeInDuration || 0, item.duration / 2) * zoom) }}
          >
            <div className="w-2.5 h-2.5 bg-white rounded-full border-2 shadow-xl" style={{ borderColor: accentHex }} />
          </div>
          <div 
            onMouseDown={(e) => handleFadeDrag('out', e)} 
            className="absolute top-5 translate-x-[-50%] cursor-ew-resize pointer-events-auto" 
            style={{ left: (item.duration - Math.min(item.fadeOutDuration || 0, item.duration / 2)) * zoom }}
          >
            <div className="w-2.5 h-2.5 bg-white rounded-full border-2 shadow-xl" style={{ borderColor: accentHex }} />
          </div>
        </div>
      )}
    </div>
  );
});

TimelineItem.displayName = 'TimelineItem';