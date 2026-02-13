import React, { useRef, useEffect, memo } from 'react';
import { TrackItem } from '../../types';

const waveformCache = new Map<string, Float32Array>();

export const Waveform = memo(({ url, width, item, zoom, color }: { url: string; width: number; item: TrackItem; zoom: number; color: string }) => {
  const canvasRef = useRef<HTMLCanvasElement>(null);

  const smoothstep = (t: number) => {
    const v = Math.max(0, Math.min(1, t));
    return v * v * (3 - 2 * v);
  };

  useEffect(() => {
    if (item.type === 'image' || !url || !width) return;

    const render = (peaks: Float32Array) => {
      const canvas = canvasRef.current;
      if (!canvas) return;
      const ctx = canvas.getContext('2d');
      if (!ctx) return;

      const dpr = window.devicePixelRatio || 1;
      canvas.width = width * dpr;
      canvas.height = 54 * dpr;
      ctx.scale(dpr, dpr);
      
      ctx.clearRect(0, 0, width, 54);
      ctx.globalAlpha = 0.6;
      
      // Use the color prop passed from TimelineItem
      ctx.strokeStyle = color; 
      ctx.lineCap = 'round';

      const TIME_STEP = 0.05; 
      ctx.lineWidth = Math.max(1, (TIME_STEP * zoom) - 1.5);

      const firstVisibleBarTime = Math.ceil(item.startTimeOffset / TIME_STEP) * TIME_STEP;
      const lastVisibleBarTime = item.startTimeOffset + item.duration;

      for (let sourceTime = firstVisibleBarTime; sourceTime <= lastVisibleBarTime; sourceTime += TIME_STEP) {
        const peakIdx = Math.floor((sourceTime / (item.sourceDuration || 1)) * peaks.length);
        const peak = peaks[peakIdx] || 0;
        const localTime = sourceTime - item.startTimeOffset;

        let gain = item.volume ?? 1;
        if (localTime < item.fadeInDuration) {
          gain *= smoothstep(localTime / item.fadeInDuration);
        } else if (localTime > (item.duration - item.fadeOutDuration)) {
          gain *= smoothstep((item.duration - localTime) / item.fadeOutDuration);
        }

        const h = Math.max(1, peak * gain * 34 * 6);
        const x = localTime * zoom;
        
        ctx.beginPath();
        ctx.moveTo(x, 37 - (h / 2));
        ctx.lineTo(x, 37 + (h / 2));
        ctx.stroke();
      }
    };

    if (waveformCache.has(url)) {
      render(waveformCache.get(url)!);
    } else {
      const audioCtx = new (window.AudioContext || (window as any).webkitAudioContext)();
      fetch(url)
        .then(r => r.arrayBuffer())
        .then(b => audioCtx.decodeAudioData(b))
        .then(buffer => {
          const raw = buffer.getChannelData(0);
          const peaks = new Float32Array(10000);
          const blockSize = Math.floor(raw.length / 10000);
          for (let i = 0; i < 10000; i++) {
            let sum = 0;
            for (let j = 0; j < blockSize; j++) sum += Math.abs(raw[(i * blockSize) + j]);
            peaks[i] = sum / blockSize;
          }
          waveformCache.set(url, peaks);
          render(peaks);
        })
        .catch(() => {});
    }
  }, [url, width, zoom, item.volume, item.fadeInDuration, item.fadeOutDuration, item.duration, item.startTimeOffset, color]);

  return <canvas ref={canvasRef} style={{ width, height: 54 }} className="absolute inset-0 pointer-events-none z-0" />;
});