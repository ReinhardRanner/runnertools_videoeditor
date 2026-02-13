import React, { useRef, useEffect, memo, useState } from 'react';
import { TrackItem } from '../../types';
import { timeStore } from '../../utils/TimeStore';

export const MediaClipPlayer = memo(({ item, isMuted }: { 
  item: TrackItem, 
  isMuted: boolean 
}) => {
  // We use the same ref for Video or Audio
  const mediaRef = useRef<HTMLVideoElement | HTMLAudioElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const [isReady, setIsReady] = useState(false);

  // Fallback duration for images/assets that lack it
  const safeDuration = item.duration ?? 5;

  const getSmoothstepGain = (t: number) => {
    const v = Math.max(0, Math.min(1, t));
    return v * v * (3 - 2 * v);
  };

  useEffect(() => {
    const media = mediaRef.current;
    // Images don't need a playhead or audio logic
    if (!media || item.type === 'image') return;

    const canvas = canvasRef.current;
    const ctx = canvas?.getContext('2d', { alpha: false, desynchronized: true });
    let frameId: number;

    const paint = () => {
      if (item.type === 'video' && media instanceof HTMLVideoElement && media.readyState >= 2) {
        ctx?.drawImage(media, 0, 0, canvas!.width, canvas!.height);
      }
      
      if (item.type === 'video' && media instanceof HTMLVideoElement) {
        if ('requestVideoFrameCallback' in media) {
          frameId = (media as any).requestVideoFrameCallback(paint);
        } else {
          frameId = requestAnimationFrame(paint);
        }
      }
    };

    const unsubscribe = timeStore.subscribe((time, isPlaying) => {
      if (!media) return;

      const playbackTime = Math.max(0, (time - item.startTime) + item.startTimeOffset);
      const isWithinBounds = time >= item.startTime && time < (item.startTime + safeDuration);

      if (!isWithinBounds) {
        // --- PRE-WARM ENGINE ---
        // Force the video/audio to stay at the starting frame while invisible
        if (Math.abs(media.currentTime - item.startTimeOffset) > 0.1 && !media.seeking) {
          media.currentTime = item.startTimeOffset;
        }
        if (!media.paused) media.pause();
        return;
      }

      // 1. Precise Sync (Scrubbing)
      if (!isPlaying) {
        if (!media.seeking && Math.abs(media.currentTime - playbackTime) > 0.04) {
          media.currentTime = playbackTime;
        }
      }

      // 2. Playback Control
      if (isPlaying && isWithinBounds) {
        // ReadyState 3 = HAVE_FUTURE_DATA
        if (media.paused && media.readyState >= 3) {
          media.play().catch(() => {});
        }
      } else if (!media.paused) {
        media.pause();
      }

      // 3. Audio Fades
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

    if (item.type === 'video') paint();

    return () => {
      unsubscribe();
      if (item.type === 'video' && media instanceof HTMLVideoElement) {
        if ('cancelVideoFrameCallback' in media) {
          (media as any).cancelVideoFrameCallback(frameId);
        } else {
          cancelAnimationFrame(frameId);
        }
      }
    };
  }, [item.instanceId, isMuted, item.url, safeDuration]);

  // --- RENDERING ---

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
          <canvas 
            ref={canvasRef} 
            width={item.width} 
            height={item.height} 
            className={`w-full h-full object-fill transition-opacity duration-300 ${isReady ? 'opacity-100' : 'opacity-0'}`} 
          />
        </>
      )}
      
      {!isReady && item.type === 'video' && (
        <div className="absolute inset-0 bg-bg-canvas flex items-center justify-center">
          <div className="w-6 h-6 border-2 border-indigo-500 border-t-transparent rounded-full animate-spin" />
        </div>
      )}
    </div>
  );
});

MediaClipPlayer.displayName = 'MediaClipPlayer';