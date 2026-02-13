// Global color palette for asset types — use everywhere for consistency
export const ASSET_COLORS: Record<string, { text: string; bg: string; border: string; accent: string }> = {
  video:  { text: 'text-sky-400',     bg: 'bg-sky-500/10',     border: 'border-sky-500/20',     accent: 'border-sky-500' },
  audio:  { text: 'text-indigo-400',  bg: 'bg-indigo-500/10',  border: 'border-indigo-500/20',  accent: 'border-indigo-500' },
  image:  { text: 'text-emerald-400', bg: 'bg-emerald-500/10', border: 'border-emerald-500/20', accent: 'border-emerald-500' },
  html:   { text: 'text-sky-400',     bg: 'bg-sky-500/10',     border: 'border-sky-500/20',     accent: 'border-sky-500' },
  manim:  { text: 'text-purple-400',  bg: 'bg-purple-500/10',  border: 'border-purple-500/20',  accent: 'border-purple-500' },
};

export interface Asset {
  id: string;
  name: string;
  type: 'video' | 'audio' | 'image' | 'html' | 'manim';
  url?: string;
  file?: File;
  duration?: number;
  resolution?: { w: number, h: number };
  code?: string; // Der generierte HTML/Python Code
  prompt?: string; // Der letzte verwendete Prompt

  // Background Process State
  isProcessing?: boolean;
  processStatus?: string;
  progress?: number;
  processError?: string | null;
}

export interface TrackItem extends Asset {
  instanceId: string;
  
  // 1. TIMELINE PROPERTIES
  startTime: number;
  duration: number;
  layer: number;

  // 2. TRIM PROPERTIES (The "Window")
  trimStart: number;
  sourceDuration: number;

  // 3. TRANSFORM & EFFECTS (Optional/Existing)
  x: number;
  y: number;
  width: number;
  height: number;
  rotation: number;
  opacity: number;
  volume: number;
  fadeInDuration: number;
  fadeOutDuration: number;
}

interface ModelPricing {
  input: number;
  output: number;
}

interface Model {
  id: string;
  name: string;
  isThinking?: boolean;
  supportsFlex?: boolean;
  pricing?: ModelPricing;
}

interface Provider {
  provider: string;
  providerName: string;
  models: Model[];
}