import React, { useRef, useEffect, memo } from 'react';
import { TrackItem } from '../../types';

const waveformCache = new Map<string, Float32Array>();

export const Waveform = memo(({ url, width, item }: { url: string; width: number; item: TrackItem }) => {
  const canvasRef = useRef<HTMLCanvasElement>(null);

  const smoothstep = (t: number) => {
    const v = Math.max(0, Math.min(1, t));
    return v * v * (3 - 2 * v);
  };

  useEffect(() => {
    if (item.type === 'image') return;

    const render = (peaks: Float32Array) => {
      const canvas = canvasRef.current;
      if (!canvas || !width) return;
      const ctx = canvas.getContext('2d');
      if (!ctx) return;

      const SECONDS_PER_BAR = 0.1;
      const totalBars = Math.floor(item.duration / SECONDS_PER_BAR);
      if (totalBars === 0) return;

      const barSpacing = width / totalBars;
      canvas.width = width;
      canvas.height = 54;
      
      ctx.clearRect(0, 0, width, 54);
      ctx.globalAlpha = 0.6;
      ctx.strokeStyle = '#818cf8'; 
      ctx.lineCap = 'round';
      ctx.lineWidth = Math.max(1, barSpacing - 1.5);

      for (let i = 0; i < totalBars; i++) {
        const localTime = i * SECONDS_PER_BAR;
        const sourceTime = item.startTimeOffset + localTime;
        const peakIdx = Math.floor((sourceTime / item.sourceDuration) * peaks.length);
        const peak = peaks[peakIdx] || 0;

        let gain = item.volume;
        if (localTime < item.fadeInDuration) gain *= smoothstep(localTime / item.fadeInDuration);
        else if (localTime > (item.duration - item.fadeOutDuration)) {
          gain *= smoothstep((item.duration - localTime) / item.fadeOutDuration);
        }

        const h = Math.max(1, peak * gain * 34 * 6);
        const x = i * barSpacing + (barSpacing / 2);
        
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
      fetch(url).then(r => r.arrayBuffer()).then(b => audioCtx.decodeAudioData(b)).then(buffer => {
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
      });
    }
  }, [url, width, item.volume, item.fadeInDuration, item.fadeOutDuration, item.duration, item.startTimeOffset]);

  return <canvas ref={canvasRef} className="absolute inset-0 h-full w-full pointer-events-none z-0" />;
});