import React, { useRef, useEffect, memo } from 'react';
import { TrackItem } from '../../types';

// src/components/Preview/MediaClipPlayer.tsx

export const MediaClipPlayer = memo(({ item, currentTime, isPlaying, isMuted }: { 
  item: TrackItem, 
  currentTime: number, 
  isPlaying: boolean, 
  isMuted: boolean 
}) => {
  const mediaRef = useRef<HTMLVideoElement | HTMLAudioElement>(null);

  const getSmoothstepGain = (t: number) => {
    const v = Math.max(0, Math.min(1, t));
    return v * v * (3 - 2 * v);
  };

  useEffect(() => {
    const media = mediaRef.current;
    // Images don't have volume or playheads, so we exit early
    if (!media || item.type === 'image') return;
    
    const playbackTime = (currentTime - item.startTime) + item.startTimeOffset;
    if (Math.abs(media.currentTime - playbackTime) > 0.15) {
      media.currentTime = playbackTime;
    }

    const isWithinBounds = currentTime >= item.startTime && currentTime < (item.startTime + item.duration);
    if (isPlaying && isWithinBounds && media.paused) {
      media.play().catch(() => {});
    } else if ((!isPlaying || !isWithinBounds) && !media.paused) {
      media.pause();
    }

    const localTime = currentTime - item.startTime;
    let gain = item.volume;
    if (localTime < item.fadeInDuration && item.fadeInDuration > 0) {
      gain *= getSmoothstepGain(localTime / item.fadeInDuration);
    } else if (localTime > (item.duration - item.fadeOutDuration) && item.fadeOutDuration > 0) {
      const fadeProgress = (item.duration - localTime) / item.fadeOutDuration;
      gain *= getSmoothstepGain(fadeProgress);
    }

    media.volume = isMuted ? 0 : Math.max(0, Math.min(1, gain));
  }, [isPlaying, currentTime, item.startTime, item.duration, item.volume, item.fadeInDuration, item.fadeOutDuration, isMuted, item.type]);

  // --- THE FIX: RENDER THE IMAGE ---
  if (item.type === 'image') {
    return (
      <img 
        src={item.url} 
        className="w-full h-full object-fill pointer-events-none" 
        alt={item.name}
        style={{
          // Optional: You can even apply opacity fades to images here!
          opacity: 1 
        }}
      />
    );
  }

  if (item.type === 'audio') {
    return <audio ref={mediaRef as React.RefObject<HTMLAudioElement>} src={item.url} />;
  }

  return (
    <video 
      ref={mediaRef as React.RefObject<HTMLVideoElement>} 
      src={item.url} 
      className="w-full h-full object-fill pointer-events-none" 
      playsInline 
    />
  );
});