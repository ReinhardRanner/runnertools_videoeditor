interface VideoMetadata {
  duration: number;
  resolution: {
    w: number;
    h: number;
  };
}

export const analyzeVideo = (url: string): Promise<VideoMetadata> => {
  return new Promise((resolve) => {
    const video = document.createElement('video');
    video.preload = 'metadata';
    video.muted = true;
    video.playsInline = true;

    video.onloadedmetadata = () => {
      resolve({
        duration: video.duration,
        resolution: {
          w: video.videoWidth,
          h: video.videoHeight,
        },
      });
      video.remove();
    };

    video.onerror = () => {
      console.error("Failed to analyze video for:", url);
      resolve({
        duration: 0,
        resolution: { w: 0, h: 0 },
      });
      video.remove();
    };

    video.src = url;
  });
};