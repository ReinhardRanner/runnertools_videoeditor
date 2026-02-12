import { useState } from 'react';
import JSZip from 'jszip';

export const useGenerativeAI = () => {
  const [isGenerating, setIsGenerating] = useState(false);
  const [status, setStatus] = useState("");

  const generate = async (
    type: 'html' | 'manim',
    prompt: string,
    providerId: string,
    modelId: string,
    duration: number,
    resolution: { w: number, h: number },
    oldCode?: string
  ) => {
    setIsGenerating(true);
    const BASE_URL = type === 'html' 
      ? 'https://runnertools.demo3.at/api/webrenderer' 
      : 'https://runnertools.demo3.at/api/manimrenderer';

    try {
      // 1. LLM API Call - JETZT MIT CONTENT-TYPE HEADER
      setStatus("LLM creates code...");
      const genRes = await fetch(`${BASE_URL}/generate`, { 
          method: 'POST', 
          headers: {
            'Content-Type': 'application/json' // ESSENZIELL: Damit req.body nicht undefined ist
          },
          body: JSON.stringify({ prompt, oldCode: oldCode || '', providerId, modelId }) 
      });

      if (!genRes.ok) {
        const errText = await genRes.text();
        throw new Error(`LLM Error: ${errText}`);
      }

      const { code } = await genRes.json();

      // 2. Render Call with query parameters
      let jobId = "";
      const renderParams = new URLSearchParams({
        width: String(resolution.w),
        height: String(resolution.h),
        duration: String(duration)
      });

      if (type === 'html') {
        setStatus("Building ZIP...");
        const zip = new JSZip();
        zip.file("master.html", code);
        const zipBlob = await zip.generateAsync({ type: "blob" });

        const res = await fetch(`${BASE_URL}/render?${renderParams}`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/zip' },
            body: zipBlob
        });
        const data = await res.json();
        jobId = data.jobId;
      } else {
        setStatus("Uploading Manim...");
        const res = await fetch(`${BASE_URL}/render?${renderParams}`, {
            method: 'POST',
            headers: { 'Content-Type': 'text/plain' },
            body: code
        });
        const data = await res.json();
        jobId = data.jobId;
      }

      // 3. Polling
      let videoUrl = "";
      const statusUrl = `${BASE_URL}/status/${jobId}`;

      while (!videoUrl) {
        const sRes = await fetch(statusUrl);
        const sData = await sRes.json();

        if (sData.status === 'completed') {
            videoUrl = sData.videoUrl;
        } else if (sData.status === 'failed') {
            throw new Error(sData.error || "Render failed");
        } else {
            const progress = sData.progress ?? 0;
            setStatus(`Rendering Video... ${progress}%`);
        }
        await new Promise(r => setTimeout(r, 2000));
      }

      // 4. Download locally
      setStatus("Saving local copy...");
      const videoFetch = await fetch(videoUrl);
      const blob = await videoFetch.blob();
      
      return { url: URL.createObjectURL(blob), code };
    } catch (e) {
      console.error("AI Generation Failed:", e);
      return null;
    } finally {
      setIsGenerating(false);
      setStatus("");
    }
  };

  return { generate, isGenerating, status };
};