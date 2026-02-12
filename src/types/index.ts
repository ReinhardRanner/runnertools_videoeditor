export interface Asset {
  id: string;
  name: string;
  type: 'video' | 'audio' | 'image' | 'html' | 'manim';
  url: string;
  file?: File;
  sourceDuration: number;
  sourceWidth?: number;  // Original width (for generated content)
  sourceHeight?: number; // Original height (for generated content)
  code?: string; // Der generierte HTML/Python Code
  prompt?: string; // Der letzte verwendete Prompt
}

export interface TrackItem extends Asset {
  instanceId: string;
  startTime: number;
  duration: number;
  startTimeOffset: number;
  layer: number;
  x: number;
  y: number;
  width: number;
  height: number;
  rotation: number;
  volume: number;
  fadeInDuration: number;
  fadeOutDuration: number;
}