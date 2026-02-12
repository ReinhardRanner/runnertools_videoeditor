import React, { useState, useRef } from 'react';
import { Play, Pause } from 'lucide-react';

interface VideoPlayerProps {
  src: string;
  className?: string;
}

export const VideoPlayer: React.FC<VideoPlayerProps> = ({ src, className = '' }) => {
  const [isPlaying, setIsPlaying] = useState(true);
  const [currentTime, setCurrentTime] = useState(0);
  const [duration, setDuration] = useState(0);
  const videoRef = useRef<HTMLVideoElement>(null);

  const togglePlayPause = () => {
    if (!videoRef.current) return;
    if (isPlaying) videoRef.current.pause();
    else videoRef.current.play();
    setIsPlaying(!isPlaying);
  };

  const handleScrub = (e: React.MouseEvent<HTMLDivElement>) => {
    if (!videoRef.current || !duration) return;
    const rect = e.currentTarget.getBoundingClientRect();
    const newTime = ((e.clientX - rect.left) / rect.width) * duration;
    videoRef.current.currentTime = newTime;
    setCurrentTime(newTime);
  };

  const formatTime = (t: number) => `${Math.floor(t / 60)}:${Math.floor(t % 60).toString().padStart(2, '0')}`;

  return (
    <div className={`flex flex-col items-center gap-4 ${className}`}>
      <video
        ref={videoRef}
        key={src}
        src={src}
        className="max-w-full max-h-[calc(100%-60px)] rounded-2xl shadow-2xl border border-border-default"
        autoPlay loop muted
        onTimeUpdate={() => setCurrentTime(videoRef.current?.currentTime || 0)}
        onLoadedMetadata={() => setDuration(videoRef.current?.duration || 0)}
        onPlay={() => setIsPlaying(true)}
        onPause={() => setIsPlaying(false)}
      />
      <div className="w-full max-w-md flex items-center gap-3 px-4 py-3 bg-white/5 backdrop-blur-md rounded-2xl border border-border-default">
        <button onClick={togglePlayPause} className="p-2 hover:bg-white/10 rounded-xl transition-all text-white">
          {isPlaying ? <Pause size={18} /> : <Play size={18} />}
        </button>
        <span className="text-[10px] font-mono text-gray-400 w-10">{formatTime(currentTime)}</span>
        <div className="flex-1 h-2 bg-white/10 rounded-full cursor-pointer relative group" onClick={handleScrub}>
          <div className="h-full bg-indigo-500 rounded-full" style={{ width: duration ? `${(currentTime / duration) * 100}%` : '0%' }} />
          <div className="absolute top-1/2 -translate-y-1/2 w-3 h-3 bg-white rounded-full shadow-lg opacity-0 group-hover:opacity-100 transition-opacity" style={{ left: duration ? `calc(${(currentTime / duration) * 100}% - 6px)` : '0' }} />
        </div>
        <span className="text-[10px] font-mono text-gray-400 w-10 text-right">{formatTime(duration)}</span>
      </div>
    </div>
  );
};
