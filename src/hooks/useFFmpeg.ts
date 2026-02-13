import { useRef, useState, useEffect, useCallback } from 'react'; // Added useCallback
import { FFmpeg } from '@ffmpeg/ffmpeg';
import { fetchFile, toBlobURL } from '@ffmpeg/util';
import { TrackItem } from '../types';

export const useFFmpeg = (resolution: { w: number, h: number }) => {
  const [loaded, setLoaded] = useState(false);
  const [progress, setProgress] = useState(0);
  const [status, setStatus] = useState<'idle' | 'writing' | 'rendering' | 'done'>('idle');
  const ffmpegRef = useRef(new FFmpeg());

  const resetStatus = useCallback(() => {
    setStatus('idle');
    setProgress(0);
  }, []);

  const restartFFmpeg = async () => {
    setLoaded(false);
    try {
      // Bestehende Instanz beenden, falls vorhanden
      if (ffmpegRef.current) {
        await ffmpegRef.current.terminate();
      }
      
      // Neue Instanz erstellen
      ffmpegRef.current = new FFmpeg();
      const ffmpeg = ffmpegRef.current;
      
      const baseURL = 'https://unpkg.com/@ffmpeg/core@0.12.6/dist/esm';
      await ffmpeg.load({
        coreURL: await toBlobURL(`${baseURL}/ffmpeg-core.js`, 'text/javascript'),
        wasmURL: await toBlobURL(`${baseURL}/ffmpeg-core.wasm`, 'application/wasm'),
      });
      
      setLoaded(true);
      return true;
    } catch (e) {
      console.error("FFmpeg Load Failed", e);
      return false;
    }
  };

  // Initialer Start beim Mounten
  useEffect(() => {
    restartFFmpeg();
    // Cleanup beim Unmounten
    return () => {
      ffmpegRef.current.terminate();
    };
  }, []);

  const handleExport = async (items: TrackItem[], settings: any) => {
    // 1. DEFINE CONSTANTS AT THE TOP
    const timestamp = Date.now();
    const ffmpeg = ffmpegRef.current;
    if (!loaded || !ffmpeg || items.length === 0) return;

    const { format, scale, fps, crf, preset } = settings;
    const outName = `o.${format}`; // Minimal name for FS stability
    
    setStatus('writing');
    setProgress(0);

    const actualEnd = Math.max(...items.map(i => i.startTime + i.duration), 1);
    const totalDur = actualEnd.toFixed(3);
    const exportW = Math.round(resolution.w * scale);
    const exportH = Math.round(resolution.h * scale);

    const vCodec = format === 'webm' ? 'libvpx-vp9' : 'libx264';
    const aCodec = format === 'webm' ? 'libopus' : 'aac';
    const writtenFiles: string[] = [];

    // --- PROACTIVE CLEANUP ---
    // Clears memory from previous failed attempts
    try {
        const rootFiles = await ffmpeg.listDir('/');
        for (const file of rootFiles) {
            if (file.name.startsWith('f') || file.name.startsWith('o.')) {
                await ffmpeg.deleteFile(file.name);
            }
        }
    } catch (e) { /* FS is already clean */ }

    const progressHandler = ({ time }: { time: number }) => {
      const percentage = Math.round(((time / 1000000) / actualEnd) * 100);
      setProgress(prev => Math.max(prev, Math.min(percentage, 99)));
    };
    ffmpeg.on('progress', progressHandler);

    try {
      // 2. WRITE PHASE
      for (let i = 0; i < items.length; i++) {
        const item = items[i];
        if (!item.url) continue;
        const data = await fetchFile(item.url);
        const fileName = `f${i}`; 
        await ffmpeg.writeFile(fileName, data);
        writtenFiles.push(fileName);
        setProgress(Math.round(((i + 1) / items.length) * 10));
        await new Promise(r => setTimeout(r, 10)); // Breathe
      }

      setStatus('rendering');

      // 3. FILTER GENERATION
      const visualItems = [...items]
        .filter(i => i.type !== 'audio')
        .sort((a, b) => b.layer - a.layer); // Background first (higher layer number)

      const f: string[] = [];
      f.push(`color=s=${exportW}x${exportH}:c=black:d=${totalDur}[b]`);
      
      let lastL = '[b]';

      visualItems.forEach((cfg, idx) => {
        const inIdx = items.findIndex(orig => orig.instanceId === cfg.instanceId);
        const rad = (cfg.rotation * Math.PI) / 180;
        const sW = Math.round(cfg.width * scale);
        const sH = Math.round(cfg.height * scale);
        const sX = Math.round(cfg.x * scale);
        const sY = Math.round(cfg.y * scale);

        const inL = `[${inIdx}:v]`;
        const pL = `p${idx}`;
        const oL = idx === visualItems.length - 1 ? `[ov]` : `[t${idx}]`;

        const trim = cfg.type === 'image' 
            ? `format=rgba,loop=loop=-1:size=1:start=0` 
            : `trim=start=${cfg.startTimeOffset}:duration=${cfg.duration},setpts=PTS-STARTPTS`;

        const trans = `format=rgba,scale=${sW}:${sH},rotate=${rad}:c=none:ow='rotw(${rad})':oh='roth(${rad})'`;
        const alpha = (cfg.opacity ?? 1) < 1 ? `,colorchannelmixer=aa=${cfg.opacity?.toFixed(2)}` : '';

        f.push(`${inL}${trim},${trans}${alpha},setpts=PTS-STARTPTS+${cfg.startTime}/TB[${pL}]`);
        f.push(`${lastL}[${pL}]overlay=x=${sX}:y=${sY}:enable='between(t,${cfg.startTime},${cfg.startTime + cfg.duration})'${oL}`);
        
        lastL = oL;
      });

      if (visualItems.length === 0) f.push(`[b]copy[ov]`);

      // Audio Mix
      const aLabels: string[] = [];
      items.forEach((cfg, i) => {
        if (['video', 'audio'].includes(cfg.type)) {
          const d = Math.round(cfg.startTime * 1000);
          const fIn = cfg.fadeInDuration || 0.01;
          const fOut = cfg.fadeOutDuration || 0.01;
          const al = `[a${i}]`;
          f.push(`[${i}:a]atrim=start=${cfg.startTimeOffset}:duration=${cfg.duration},asetpts=PTS-STARTPTS,volume=${cfg.volume || 1},afade=t=in:st=0:d=${fIn},afade=t=out:st=${Math.max(0, cfg.duration - fOut)}:d=${fOut},adelay=${d}|${d}${al}`);
          aLabels.push(al);
        }
      });

      if (aLabels.length > 0) f.push(`${aLabels.join('')}amix=inputs=${aLabels.length}:duration=longest[oa]`);
      else f.push(`anullsrc=r=44100:cl=stereo:d=${totalDur}[oa]`);

      // 4. EXECUTION
      await ffmpeg.exec([
        "-y",
        ...writtenFiles.flatMap((fn) => ["-i", fn]),
        "-filter_complex", f.join(';'),
        "-map", "[ov]", 
        "-map", "[oa]",
        "-t", totalDur,
        "-c:v", vCodec,
        "-preset", preset,
        "-crf", crf.toString(),
        "-pix_fmt", "yuv420p", 
        "-r", fps.toString(),
        "-c:a", aCodec,
        outName
      ]);
      
      // 5. DOWNLOAD
      const data = await ffmpeg.readFile(outName);
      const url = URL.createObjectURL(new Blob([(data as any).buffer], { type: format === 'webm' ? 'video/webm' : 'video/mp4' }));
      const a = document.createElement('a'); 
      a.href = url; 
      a.download = `render_${timestamp}.${format}`; 
      a.click();

      setStatus('done');
    } catch (e) {
      console.error("Critical Export Error:", e);
      alert("Render failed. Most likely the browser ran out of memory. Try reducing the scale.");
      setStatus('idle');
    } finally {
      // 6. FINAL CLEANUP
      ffmpeg.off('progress', progressHandler);
      for (const fn of writtenFiles) { try { await ffmpeg.deleteFile(fn); } catch(err) {} }
      try { await ffmpeg.deleteFile(outName); } catch(err) {}
    }
};

  const cancelExport = async () => {
    if (ffmpegRef.current) {
      await ffmpegRef.current.terminate();
      setLoaded(false);
      setStatus('idle');
      setProgress(0);
      await restartFFmpeg();
    }
  };

  return {
    handleExport,
    cancelExport,
    resetStatus,
    restartFFmpeg,
    progress,
    status,
    loaded
  };
};