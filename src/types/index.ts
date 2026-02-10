export interface Asset {
  id: string;
  name: string;
  type: 'video' | 'audio' | 'image';
  url: string;
  file?: File;
  sourceDuration: number;
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