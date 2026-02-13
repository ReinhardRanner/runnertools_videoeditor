import html2canvas from 'html2canvas';
import { FFmpeg } from '@ffmpeg/ffmpeg';
import { fetchFile, toBlobURL } from '@ffmpeg/util';

let ffmpegInstance: FFmpeg | null = null;

export interface RenderOptions {
  html: string;
  duration: number;
  width: number;
  height: number;
  fps?: number;
  onProgress?: (percent: number, status: string) => void;
}

export async function renderVideoInBrowser({
  html,
  duration,
  width,
  height,
  fps = 30,
  onProgress
}: RenderOptions): Promise<string> {
  // 1. Initialize FFmpeg Singleton
  if (!ffmpegInstance) {
    ffmpegInstance = new FFmpeg();
    await ffmpegInstance.load({
      coreURL: await toBlobURL('https://unpkg.com/@ffmpeg/core@0.12.6/dist/esm/ffmpeg-core.js', 'text/javascript'),
      wasmURL: await toBlobURL('https://unpkg.com/@ffmpeg/core@0.12.6/dist/esm/ffmpeg-core.wasm', 'application/wasm'),
    });
  }
  const ffmpeg = ffmpegInstance;
  const totalFrames = Math.floor(duration * fps);

  // 2. Setup Hidden "Headless" Container
  const container = document.createElement('div');
  container.style.position = 'fixed';
  container.style.top = '-10000px'; // Off-screen
  container.style.width = `${width}px`;
  container.style.height = `${height}px`;
  
  const iframe = document.createElement('iframe');
  iframe.style.width = '100%';
  iframe.style.height = '100%';
  container.appendChild(iframe);
  document.body.appendChild(container);

  // 3. Inject Clock Hijack Script
  const srcDoc = `
    <script>
      let currentTime = 0;
      const frameDuration = ${1000 / fps};
      const rafCallbacks = [];
      window.performance.now = () => currentTime;
      window.Date.now = () => currentTime;
      window.requestAnimationFrame = (cb) => {
        rafCallbacks.push(cb);
        return rafCallbacks.length;
      };
      window.__advanceFrame = () => {
        currentTime += frameDuration;
        const callbacks = [...rafCallbacks];
        rafCallbacks.length = 0;
        callbacks.forEach(cb => { try { cb(currentTime); } catch(e) {} });
      };
    </script>
    ${html}
  `;

  return new Promise(async (resolve, reject) => {
    iframe.onload = async () => {
      try {
        for (let i = 0; i < totalFrames; i++) {
          // Advance Clock
          (iframe.contentWindow as any).__advanceFrame?.();

          // Capture Frame
          const canvas = await html2canvas(iframe.contentDocument!.body, {
            width, height, scale: 1, logging: false, useCORS: true, backgroundColor: '#000'
          });

          // Write to FFmpeg Virtual Filesystem
          const blob = await new Promise<Blob>((res) => canvas.toBlob(b => res(b!), 'image/jpeg', 0.85));
          const arrayBuffer = await blob.arrayBuffer();
          await ffmpeg.writeFile(`f_${i.toString().padStart(4, '0')}.jpg`, new Uint8Array(arrayBuffer));

          onProgress?.(Math.round((i / totalFrames) * 85), `Capturing frame ${i}/${totalFrames}`);
        }

        // 4. Muxing
        onProgress?.(90, 'Encoding MP4...');
        await ffmpeg.exec([
          '-framerate', `${fps}`,
          '-i', 'f_%04d.jpg',
          '-c:v', 'libx264',
          '-pix_fmt', 'yuv420p',
          '-crf', '22',
          'output.mp4'
        ]);

        const data = await ffmpeg.readFile('output.mp4');
        const url = URL.createObjectURL(new Blob([(data as any).buffer], { type: 'video/mp4' }));
        
        // Cleanup
        document.body.removeChild(container);
        resolve(url);
      } catch (err) {
        document.body.removeChild(container);
        reject(err);
      }
    };
    iframe.srcdoc = srcDoc;
  });
}