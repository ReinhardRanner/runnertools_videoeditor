import { useState, useRef, useCallback } from 'react';
import JSZip from 'jszip';

export const useGenerativeAI = () => {
  const [isGenerating, setIsGenerating] = useState(false);
  const [canCancel, setCanCancel] = useState(false);
  const [status, setStatus] = useState("");
  const activeJobRef = useRef<{ jobId: string; baseUrl: string } | null>(null);

  /**
   * Cancel the currently running render job
   */
  const cancel = useCallback(async () => {
    const job = activeJobRef.current;
    if (!job) return;
    try {
      await fetch(`${job.baseUrl}/cancel/${job.jobId}`, { method: 'POST' });
    } catch (e) {
      console.error("Cancel request failed:", e);
    }
  }, []);

  /**
   * STEP 1: Generate the code from the LLM
   * This returns the raw string of code (HTML or Manim Python)
   */
  const onGenerateHTML = async (
    type: 'html' | 'manim',
    prompt: string,
    providerId: string,
    modelId: string,
    oldCode?: string
  ): Promise<string> => {
    setIsGenerating(true);
    setStatus("LLM is designing...");

    const BASE_URL = type === 'html'
      ? 'https://runnertools.demo3.at/api/webrenderer'
      : 'https://runnertools.demo3.at/api/manimrenderer';

    try {
      const genRes = await fetch(`${BASE_URL}/generate`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({
          prompt,
          oldCode: oldCode || '',
          providerId,
          modelId
        })
      });

      if (!genRes.ok) {
        const errText = await genRes.text();
        let errMsg: string;
        try {
          const errJson = JSON.parse(errText);
          errMsg = errJson.error || errText;
        } catch {
          errMsg = errText;
        }
        throw new Error(errMsg);
      }

      const { code } = await genRes.json();
      return code;
    } catch (e) {
      console.error("AI Code Generation Failed:", e);
      throw e;
    } finally {
      setIsGenerating(false);
      setStatus("");
    }
  };

  /**
   * STEP 2: Render the video from the provided code
   * This handles ZIP creation, rendering, polling, and blob conversion
   */
  const onRenderVideo = async (
    type: 'html' | 'manim',
    code: string,
    duration: number,
    resolution: { w: number, h: number },
    onProgress?: (progress: number, statusText: string) => void
  ): Promise<string> => {
    setIsGenerating(true);
    const BASE_URL = type === 'html'
      ? 'https://runnertools.demo3.at/api/webrenderer'
      : 'https://runnertools.demo3.at/api/manimrenderer';

    try {
      let jobId = "";
      const renderParams = new URLSearchParams({
        width: String(resolution.w),
        height: String(resolution.h),
        duration: String(duration)
      });

      // 1. Initiate Render Job
      if (type === 'html') {
        setStatus("Building Asset ZIP...");
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
        setStatus("Uploading Manim Script...");
        const res = await fetch(`${BASE_URL}/render?${renderParams}`, {
            method: 'POST',
            headers: { 'Content-Type': 'text/plain' },
            body: code
        });
        const data = await res.json();
        jobId = data.jobId;
      }

      // Track active job for cancellation
      activeJobRef.current = { jobId, baseUrl: BASE_URL };
      setCanCancel(true);

      // 2. Polling for Completion
      let videoUrl = "";
      const statusUrl = `${BASE_URL}/status/${jobId}`;

      while (!videoUrl) {
        const sRes = await fetch(statusUrl);
        if (!sRes.ok) throw new Error("Failed to fetch job status");

        const sData = await sRes.json();

        if (sData.status === 'completed') {
            videoUrl = sData.videoUrl;
        } else if (sData.status === 'failed' || sData.status === 'cancelled') {
            throw new Error(sData.status === 'cancelled' ? 'Cancelled' : (sData.error || "Render process failed on server"));
        } else {
            const progress = sData.progress ?? 0;
            const statusText = `Rendering Video... ${progress}%`;
            setStatus(statusText);
            onProgress?.(progress, statusText);
        }
        // Wait 2 seconds before next poll
        await new Promise(r => setTimeout(r, 2000));
      }

      // 3. Download and create local URL
      setStatus("finalizing video...");
      const videoFetch = await fetch(videoUrl);
      const blob = await videoFetch.blob();

      return URL.createObjectURL(blob);
    } catch (e) {
      console.error("Video Rendering Failed:", e);
      throw e;
    } finally {
      activeJobRef.current = null;
      setCanCancel(false);
      setIsGenerating(false);
      setStatus("");
    }
  };

  return {
    onGenerateHTML,
    onRenderVideo,
    cancel,
    canCancel,
    isGenerating,
    status
  };
};
