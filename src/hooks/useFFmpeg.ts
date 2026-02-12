import { useRef, useState, useEffect } from 'react';
import { FFmpeg } from '@ffmpeg/ffmpeg';
import { fetchFile, toBlobURL } from '@ffmpeg/util';
import { TrackItem } from '../types';

export const useFFmpeg = (resolution: { w: number, h: number }) => {
  const [loaded, setLoaded] = useState(false);
  const [progress, setProgress] = useState(0);
  const [status, setStatus] = useState<'idle' | 'writing' | 'rendering' | 'done'>('idle');
  const ffmpegRef = useRef(new FFmpeg());

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
    if (!loaded || items.length === 0) return;

    const ffmpeg = ffmpegRef.current;
    const { format, scale, fps, crf, preset } = settings;
    
    setStatus('writing');
    setProgress(0);

    const timestamp = Date.now();
    const outName = `CORE_RENDER_${timestamp}.${format}`;
    
    const actualEnd = Math.max(...items.map(i => i.startTime + i.duration), 1);
    const totalDur = actualEnd.toFixed(3);
    const exportW = Math.round(resolution.w * scale);
    const exportH = Math.round(resolution.h * scale);

    const vCodec = format === 'webm' ? 'libvpx-vp9' : 'libx264';
    const aCodec = format === 'webm' ? 'libopus' : 'aac';

    const writtenFiles: string[] = [];

    // Fortschritts-Logik
    const progressHandler = ({ time }: { time: number }) => {
      const currentTimeSec = time / 1000000;
      const percentage = Math.round((currentTimeSec / actualEnd) * 100);
      setProgress(prev => Math.max(prev, Math.min(percentage, 99)));
    };
    
    ffmpeg.on('progress', progressHandler);

    try {
      // 1. Dateien in das virtuelle Dateisystem schreiben
      for (let i = 0; i < items.length; i++) {
        const item = items[i];
        if (!item.url) continue;
        const data = await fetchFile(item.url);
        await ffmpeg.writeFile(`in${i}`, data);
        writtenFiles.push(`in${i}`);
        setProgress(Math.round(((i + 1) / items.length) * 10));
      }

      setStatus('rendering');

      // 2. Video Filter Bauen (Layer-Sortierung beachten)
      const sorted = [...items].sort((a, b) => b.layer - a.layer);
      let vF = `color=s=${exportW}x${exportH}:c=black:d=${totalDur}[bg];`;
      let lastV = '[bg]';
      let visCount = 0;

      sorted.forEach((cfg) => {
        if (cfg.type === 'audio') return;
        const idx = items.findIndex(orig => orig.instanceId === cfg.instanceId);
        const rad = (cfg.rotation * Math.PI) / 180;
        
        const src = cfg.type === 'image' 
          ? `[${idx}:v]format=rgba,` 
          : `[${idx}:v]trim=start=${cfg.startTimeOffset}:duration=${cfg.duration},`;
        
        const sW = Math.round(cfg.width * scale);
        const sH = Math.round(cfg.height * scale);
        const sX = Math.round(cfg.x * scale);
        const sY = Math.round(cfg.y * scale);

        vF += `${src}setpts=PTS-STARTPTS,scale=${sW}:${sH},rotate=${rad}:c=none:ow=rotw(${rad}):oh=roth(${rad}),setpts=PTS-STARTPTS+${cfg.startTime}/TB[v${idx}];`;
        vF += `${lastV}[v${idx}]overlay=x=${sX}:y=${sY}:enable='between(t,${cfg.startTime},${cfg.startTime + cfg.duration})'`;
        
        const isLast = !sorted.slice(sorted.indexOf(cfg) + 1).some(n => n.type !== 'audio');
        if (isLast) vF += `[outv]`;
        else { vF += `[vtmp${visCount}];`; lastV = `[vtmp${visCount}]`; visCount++; }
      });

      if (!sorted.some(i => i.type !== 'audio')) vF += `[bg]copy[outv]`;

      // 3. Audio Filter Bauen (Fades einberechnen)
      let aF = ";"; 
      let aCount = 0; 
      const aLabels: string[] = [];
      items.forEach((cfg, i) => {
        if (cfg.type === 'video' || cfg.type === 'audio' || cfg.type === 'html' || cfg.type === 'manim') {
          const delay = Math.round(cfg.startTime * 1000);
          const sel = (cfg.type === 'video' || cfg.type === 'html' || cfg.type === 'manim') ? `${i}:a` : `${i}:0`;
          
          const fadeIn = cfg.fadeInDuration || 0.5;
          const fadeOut = cfg.fadeOutDuration || 0.5;
          const fadeStr = `,afade=t=in:st=0:d=${fadeIn},afade=t=out:st=${cfg.duration - fadeOut}:d=${fadeOut}`;
          
          aF += `[${sel}]atrim=start=${cfg.startTimeOffset}:duration=${cfg.duration},asetpts=PTS-STARTPTS,volume=${cfg.volume || 1}${fadeStr},adelay=${delay}|${delay}[a${i}];`;
          aLabels.push(`[a${i}]`); aCount++;
        }
      });
      aF += aCount > 0 ? `${aLabels.join('')}amix=inputs=${aCount}:duration=longest[outa]` : `anullsrc=r=44100:cl=stereo:d=${totalDur}[outa]`;

      // 4. Ausführen
      await ffmpeg.exec([
        "-y", ...writtenFiles.flatMap((f) => ["-i", f]), 
        "-filter_complex", vF + aF, 
        "-map", "[outv]", "-map", "[outa]", 
        "-t", totalDur, "-c:v", vCodec, "-preset", preset, "-crf", crf.toString(),
        "-r", fps.toString(), "-c:a", aCodec, "-pix_fmt", "yuv420p", outName
      ]);
      
      setProgress(100);
      setStatus('done');

      // 5. Blob-Download
      const data = await ffmpeg.readFile(outName);
      const mime = format === 'webm' ? 'video/webm' : 'video/mp4';
      const url = URL.createObjectURL(new Blob([(data as any).buffer], { type: mime }));
      const a = document.createElement('a'); a.href = url; a.download = `SYNTH_${timestamp}.${format}`; a.click();

      setTimeout(() => { setStatus('idle'); setProgress(0); }, 2000);

    } catch (e) {
      console.error("Critical Export Error:", e);
      setStatus('idle');
    } finally {
      // WICHTIG: Listener entfernen, um Memory Leaks zu vermeiden
      ffmpeg.off('progress', progressHandler);
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

  return { handleExport, restartFFmpeg, cancelExport, progress, status, loaded };
};