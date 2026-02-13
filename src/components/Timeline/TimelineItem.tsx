import React, { memo, useMemo, useState, useEffect } from 'react';
import { Film, Music, Image as ImageIcon, Code2, Sparkles, ChevronDown, Camera } from 'lucide-react';
import { TrackItem, ASSET_COLORS } from '../../types';
import { Waveform } from './Waveform';

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

// --- COMPONENTS ---

const SideHandle = ({ orientation, zoom, color }: { orientation: 'v' | 'h', zoom: number, color: string }) => {
  const size = 32;
  const center = size / 2;
  const thickness = 3;
  const border = 1;
  const d = orientation === 'v' ? `M ${center} ${center - 10} V ${center + 10}` : `M ${center - 10} ${center} H ${center + 10}`;

  return (
    <div style={{ width: size, height: size, position: 'absolute', transform: `translate(-50%, -50%) scale(${1 / zoom})`, willChange: 'transform' }} className="flex items-center justify-center pointer-events-none">
      <svg width={size} height={size} style={{ overflow: 'visible', shapeRendering: 'geometricPrecision' }}>
        <path d={d} fill="none" stroke={color} strokeWidth={thickness + border * 2} strokeLinecap="round" />
        <path d={d} fill="none" stroke="white" strokeWidth={thickness} strokeLinecap="round" />
      </svg>
    </div>
  );
};

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
  const safeSourceDuration = item.sourceDuration || safeDuration;
  const clipWidth = safeDuration * zoom;
  const styleConfig = ASSET_COLORS[item.type] || ASSET_COLORS.video;
  const accentHex = getHexFromType(item.type);
  const [isMenuOpen, setIsMenuOpen] = useState(false);
  const isVideoContent = ['video', 'html', 'manim'].includes(item.type);

  const handleCaptureFreezeFrame = (e: React.MouseEvent) => {
    e.stopPropagation();
    setIsMenuOpen(false);

    // Calculate the exact time within the clip where the playhead is currently sitting
    const timeInClip = (playheadTime - item.startTime) + (item.startTimeOffset || 0);
    
    // Request a frame from your singleton generator
    generator.request(item.url, timeInClip, (dataUrl) => {
      onCaptureFrame(`${item.name}_freeze_${Math.round(timeInClip)}s`, dataUrl);
    });
  };

  const handleFadeDrag = (type: 'in' | 'out', e: React.MouseEvent) => {
    if (isImage) return;
    e.stopPropagation(); e.preventDefault();
    const startX = e.clientX;
    const initialFade = type === 'in' ? (item.fadeInDuration || 0) : (item.fadeOutDuration || 0);

    const onMove = (moveE: MouseEvent) => {
      const deltaX = (moveE.clientX - startX) / zoom;
      const newVal = type === 'in' 
        ? Math.max(0, Math.min(safeDuration / 2, initialFade + deltaX))
        : Math.max(0, Math.min(safeDuration / 2, initialFade - deltaX));
      setItems((prev) => prev.map((i) => i.instanceId === item.instanceId ? { ...i, [type === 'in' ? 'fadeInDuration' : 'fadeOutDuration']: newVal } : i));
    };

    const onUp = () => {
      window.removeEventListener('mousemove', onMove);
      window.removeEventListener('mouseup', onUp);
    };
    window.addEventListener('mousemove', onMove);
    window.addEventListener('mouseup', onUp);
  };

  const handleAction = (e: React.MouseEvent, type: 'move' | 'left' | 'right') => {
    e.stopPropagation(); e.preventDefault();
    setSelectedId(item.instanceId);
    const startX = e.clientX; const startY = e.clientY;
    const initialItem = { ...item, duration: safeDuration };
    const otherItems = (items || []).filter(i => i.instanceId !== item.instanceId);
    const snapPoints = [playheadTime, ...otherItems.map(i => i.startTime), ...otherItems.map(i => i.startTime + (i.duration || 0))];
    const threshold = 12 / zoom;

    const onMouseMove = (moveE: MouseEvent) => {
      const deltaX = (moveE.clientX - startX) / zoom;
      const deltaY = moveE.clientY - startY;
      let snapTrigger: number | null = null;

      setItems((prev) => prev.map((i) => {
        if (i.instanceId !== item.instanceId) return i;
        if (type === 'move') {
          let nS = Math.max(0, initialItem.startTime + deltaX);
          const nE = nS + initialItem.duration;
          for (const p of snapPoints) {
            if (Math.abs(p - nS) < threshold) { nS = p; snapTrigger = p; break; }
            if (Math.abs(p - nE) < threshold) { nS = p - initialItem.duration; snapTrigger = p; break; }
          }
          const nL = Math.max(0, Math.min(trackCount - 1, Math.round((initialItem.layer * TRACK_HEIGHT + deltaY) / TRACK_HEIGHT)));
          return { ...i, startTime: nS, layer: nL };
        }
        if (type === 'left') {
          let nS = initialItem.startTime + deltaX;
          if ((initialItem.startTimeOffset || 0) + (nS - initialItem.startTime) < 0) nS = initialItem.startTime - (initialItem.startTimeOffset || 0);
          for (const p of snapPoints) { if (Math.abs(p - nS) < threshold) { nS = p; snapTrigger = p; break; } }
          const fD = nS - initialItem.startTime;
          return { ...i, startTime: nS, startTimeOffset: (initialItem.startTimeOffset || 0) + fD, duration: Math.max(0.1, initialItem.duration - fD) };
        }
        if (type === 'right') {
          let nD = initialItem.duration + deltaX;
          const maxD = isImage ? 9999 : (initialItem.sourceDuration || 9999) - (initialItem.startTimeOffset || 0);
          const nE = initialItem.startTime + nD;
          for (const p of snapPoints) { if (Math.abs(p - nE) < threshold) { nD = p - initialItem.startTime; snapTrigger = p; break; } }
          return { ...i, duration: Math.min(Math.max(0.1, nD), maxD) };
        }
        return i;
      }));
      onSnap(snapTrigger);
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
    if (isImage) return "";
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
      {/* 1. GHOST LAYER (Background indicator for trimmed parts) */}
      {isSelected && !isImage && (
        <div 
          className={`absolute h-[54px] top-[5px] border border-dashed rounded-lg pointer-events-none ${styleConfig.border}`} 
          style={{ 
            left: -(item.startTimeOffset || 0) * zoom, 
            width: safeSourceDuration * zoom, 
            zIndex: -1,
            borderOpacity: 1, // Ensures the stroke is fully visible
          }} 
        >
          {/* Background-only layer to preserve your preferred styleConfig.bg */}
          <div className={`absolute inset-0 rounded-lg opacity-50 ${styleConfig.bg}`} />
        </div>
      )}

      {/* 2. MAIN CLIP CONTENT */}
      <div 
        onMouseDown={(e) => handleAction(e, 'move')} 
        className={`absolute top-[5px] left-0 right-0 h-[54px] border flex flex-col rounded-lg transition-all ${
          isSelected 
            ? `${styleConfig.bg} ${styleConfig.accent} shadow-lg shadow-black/40` 
            : `bg-[#18181b] border-white/10 hover:border-white/20`
        } ${isMenuOpen ? 'z-[100]' : 'overflow-hidden'}`}
      >
        {/* HEADER BAR - Bumped to z-40 to sit above trim handles (z-30) */}
        <div 
          className="h-5 flex items-center px-2 gap-1.5 bg-black/40 border-b border-white/5 relative shrink-0 z-40"
        >
          <div className={`shrink-0 flex items-center ${styleConfig.text}`}>
            {item.type === 'video' && <Film size={11} />}
            {item.type === 'audio' && <Music size={11} />}
            {item.type === 'image' && <ImageIcon size={11} />}
            {item.type === 'html' && <Code2 size={11} />}
            {item.type === 'manim' && <Sparkles size={11} />}
          </div>
          
          <span className="truncate text-[8px] font-black uppercase tracking-tight flex-1 text-gray-200 pointer-events-none">
            {item.name}
          </span>
        
          {/* CHEVRON MENU */}
          {isVideoContent && (
            <div className="relative pointer-events-auto h-full flex items-center z-50">
              <button 
                onMouseDown={(e) => e.stopPropagation()}
                onClick={(e) => { 
                  e.stopPropagation(); 
                  setIsMenuOpen(!isMenuOpen); 
                }}
                className="hover:bg-white/10 p-0.5 rounded transition-colors text-gray-400 hover:text-white"
              >
                <ChevronDown size={10} className={`transition-transform ${isMenuOpen ? 'rotate-180' : ''}`} />
              </button>

              {isMenuOpen && (
                <div className="absolute top-0 right-0 overflow-visible">
                  <div 
                    className="fixed inset-0 z-[100]" 
                    onMouseDown={(e) => { e.stopPropagation(); setIsMenuOpen(false); }} 
                  />
                  <div className="absolute top-6 right-0 w-32 bg-[#18181b] border border-white/10 rounded-md shadow-2xl z-[101] py-1 animate-in fade-in zoom-in-95 duration-100">
                    <button 
                      onMouseDown={(e) => e.stopPropagation()}
                      onClick={handleCaptureFreezeFrame}
                      className="w-full px-2 py-1.5 flex items-center gap-2 text-[9px] font-bold text-gray-300 hover:bg-indigo-600 hover:text-white transition-colors text-left"
                    >
                      <Camera size={10} />
                      CAPTURE FRAME
                    </button>
                  </div>
                </div>
              )}
            </div>
          )}
        </div>

        {/* CLIP BODY - Changed flex-1 to fixed h-[34px] to prevent the waveform "jump" */}
        <div className="relative h-[34px] pointer-events-none overflow-hidden">
          <ImageSequence item={item} zoom={zoom} clipWidth={clipWidth} />
          
          {item.type !== 'image' && item.url && (
            <div className="absolute inset-0 z-0">
              <Waveform url={item.url} zoom={zoom} width={clipWidth} item={item} color={accentHex} />
            </div>
          )}

          {/* Fade Visualizer Overlay */}
          <svg className="absolute inset-0 w-full h-full z-10" style={{ top: -CLIP_HEADER_HEIGHT, height: TOTAL_CLIP_HEIGHT }}>
            <path d={generateFadePath(item.fadeInDuration || 0, 'in')} fill={accentHex} fillOpacity="0.1" stroke="white" strokeWidth="0.5" strokeDasharray="2,1" opacity="1" />
            <path d={generateFadePath(item.fadeOutDuration || 0, 'out')} fill={accentHex} fillOpacity="0.1" stroke="white" strokeWidth="0.5" strokeDasharray="2,1" opacity="1" />
          </svg>
        </div>

        {/* TRIM HANDLES (Edges) */}
        <div 
          onMouseDown={(e) => handleAction(e, 'left')} 
          className="absolute left-0 top-0 bottom-0 w-4 cursor-col-resize z-30 flex items-center bg-white opacity-0 hover:opacity-30 transition-opacity justify-center transition-colors"
        >
          <SideHandle orientation="v" zoom={zoom} color={accentHex} />
        </div>
        <div 
          onMouseDown={(e) => handleAction(e, 'right')} 
          className="absolute right-0 top-0 bottom-0 w-4 cursor-col-resize z-30 flex items-center bg-white opacity-0 hover:opacity-30 transition-opacity justify-center transition-colors"
        >
          <SideHandle orientation="v" zoom={zoom} color={accentHex} />
        </div>
      </div>

      {/* 3. FADE HANDLES (Dots) */}
      {isSelected && !isImage && (
        <div className="absolute inset-0 pointer-events-none z-40">
          <div 
            onMouseDown={(e) => handleFadeDrag('in', e)} 
            className="absolute top-5 translate-x-[-50%] cursor-ew-resize pointer-events-auto" 
            style={{ left: (Math.min(item.fadeInDuration || 0, safeDuration / 2) * zoom) }}
          >
            <div className="w-2.5 h-2.5 bg-white rounded-full border-2 shadow-xl" style={{ borderColor: accentHex }} />
          </div>
          <div 
            onMouseDown={(e) => handleFadeDrag('out', e)} 
            className="absolute top-5 translate-x-[-50%] cursor-ew-resize pointer-events-auto" 
            style={{ left: (safeDuration - Math.min(item.fadeOutDuration || 0, safeDuration / 2)) * zoom }}
          >
            <div className="w-2.5 h-2.5 bg-white rounded-full border-2 shadow-xl" style={{ borderColor: accentHex }} />
          </div>
        </div>
      )}
    </div>
  );
});

TimelineItem.displayName = 'TimelineItem';