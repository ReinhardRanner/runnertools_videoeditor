import React, { useRef, useEffect, memo, useState } from 'react';
import { TrackItem } from '../../types';
import { timeStore } from '../../utils/TimeStore';

interface MediaClipPlayerProps {
  item: TrackItem;
  isMuted: boolean;
  previewFps: number;
  previewDownscale: number;
}

export const MediaClipPlayer = memo(({ 
  item, 
  isMuted, 
  previewFps, 
  previewDownscale 
}: MediaClipPlayerProps) => {
  const mediaRef = useRef<HTMLVideoElement | HTMLAudioElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const [isReady, setIsReady] = useState(false);

  // HELPER: Determine if this asset should be rendered as a video
  const isVideoLike = ['video', 'manim', 'html'].includes(item.type);

  const safeDuration = item.duration ?? 5;
  const baseWidth = item.width || 1920;
  const baseHeight = item.height || 1080;
  
  const canvasWidth = Math.max(1, Math.round(baseWidth * (previewDownscale || 1)));
  const canvasHeight = Math.max(1, Math.round(baseHeight * (previewDownscale || 1)));

  const getSmoothstepGain = (t: number) => {
    const v = Math.max(0, Math.min(1, t));
    return v * v * (3 - 2 * v);
  };

  // --- REFRESH LOGIC ---
  useEffect(() => {
    const media = mediaRef.current;
    const canvas = canvasRef.current;
    // UPDATED: Check for isVideoLike instead of just 'video'
    if (!media || !canvas || !isVideoLike || !(media instanceof HTMLVideoElement)) return;

    const ctx = canvas.getContext('2d', { alpha: false, desynchronized: true });
    
    if (media.readyState >= 2) {
      ctx?.drawImage(media, 0, 0, canvas.width, canvas.height);
    }
  }, [previewDownscale, previewFps, item.instanceId, isReady, isVideoLike]);

  useEffect(() => {
    const media = mediaRef.current;
    if (!media || item.type === 'image') return;

    const canvas = canvasRef.current;
    if (!canvas && isVideoLike) return;

    const ctx = canvas?.getContext('2d', { alpha: false, desynchronized: true });
    let frameId: number;
    let lastPaintTime = 0;
    const fpsInterval = 1000 / previewFps;

    const paint = (now: number) => {
      // UPDATED: Allow html and manim to draw to canvas
      if (isVideoLike && media instanceof HTMLVideoElement && media.readyState >= 2) {
        const elapsed = now - lastPaintTime;
        if (elapsed >= fpsInterval) {
          lastPaintTime = now - (elapsed % fpsInterval);
          ctx?.drawImage(media, 0, 0, canvas!.width, canvas!.height);
        }
      }
      
      if (isVideoLike && media instanceof HTMLVideoElement) {
        if ('requestVideoFrameCallback' in media) {
          frameId = (media as any).requestVideoFrameCallback(() => paint(performance.now()));
        } else {
          frameId = requestAnimationFrame(() => paint(performance.now()));
        }
      }
    };

    const unsubscribe = timeStore.subscribe((time, isPlaying) => {
      if (!media) return;
      
      const playbackTime = Math.max(0, (time - item.startTime) + item.startTimeOffset);
      const isWithinBounds = time >= item.startTime && time < (item.startTime + safeDuration);

      if (!isWithinBounds) {
        if (Math.abs(media.currentTime - item.startTimeOffset) > 0.1 && !media.seeking) {
          media.currentTime = item.startTimeOffset;
        }
        if (!media.paused) media.pause();
        return;
      }

      if (!isPlaying) {
        if (!media.seeking && Math.abs(media.currentTime - playbackTime) > 0.04) {
          media.currentTime = playbackTime;
        }
      }

      if (isPlaying && isWithinBounds) {
        if (media.paused && media.readyState >= 3) {
          media.play().catch(() => {});
        }
      } else if (!media.paused) {
        media.pause();
      }

      const localTime = time - item.startTime;
      let gain = item.volume ?? 1;
      if (item.fadeInDuration && localTime < item.fadeInDuration) {
        gain *= getSmoothstepGain(localTime / item.fadeInDuration);
      } else if (item.fadeOutDuration && localTime > (safeDuration - item.fadeOutDuration)) {
        const fadeProgress = (safeDuration - localTime) / item.fadeOutDuration;
        gain *= getSmoothstepGain(fadeProgress);
      }
      
      const vol = isMuted ? 0 : Math.max(0, Math.min(1, gain));
      if (Math.abs(media.volume - vol) > 0.01) media.volume = vol;
    });

    if (isVideoLike) {
      paint(performance.now());
    }

    return () => {
      unsubscribe();
      if (isVideoLike && media instanceof HTMLVideoElement) {
        if ('cancelVideoFrameCallback' in media) {
          (media as any).cancelVideoFrameCallback(frameId);
        } else {
          cancelAnimationFrame(frameId);
        }
      }
    };
  }, [item.instanceId, isMuted, item.url, previewFps, previewDownscale, safeDuration, isVideoLike]);

  if (item.type === 'image') {
    return (
      <img 
        src={item.url} 
        className="w-full h-full object-fill pointer-events-none select-none" 
        alt="" 
      />
    );
  }

  return (
    <div className="w-full h-full bg-black overflow-hidden relative">
      {item.type === 'audio' ? (
        <audio ref={mediaRef as React.RefObject<HTMLAudioElement>} src={item.url} preload="auto" />
      ) : (
        <>
          <video 
            ref={mediaRef as React.RefObject<HTMLVideoElement>} 
            src={item.url} 
            className="hidden" 
            preload="auto" 
            muted 
            playsInline 
            onLoadedData={() => setIsReady(true)}
          />
          {/* UPDATED: Only show canvas for video-like types */}
          {isVideoLike && (
            <canvas 
              ref={canvasRef} 
              width={canvasWidth} 
              height={canvasHeight} 
              className={`w-full h-full object-fill transition-opacity duration-300 ${isReady ? 'opacity-100' : 'opacity-0'}`} 
              style={{ 
                imageRendering: previewDownscale < 1 ? 'pixelated' : 'auto' 
              }}
            />
          )}
        </>
      )}
      
      {/* UPDATED: Show spinner for all video types while loading */}
      {!isReady && isVideoLike && (
        <div className="absolute inset-0 bg-bg-canvas flex items-center justify-center">
          <div className="w-6 h-6 border-2 border-indigo-500 border-t-transparent rounded-full animate-spin" />
        </div>
      )}
    </div>
  );
});

MediaClipPlayer.displayName = 'MediaClipPlayer';