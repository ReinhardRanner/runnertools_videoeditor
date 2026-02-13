import React from 'react';
import { RotateCw } from 'lucide-react';

// Unified Colors
const COLORS = {
  dark: '#1e1e2e',
  indigo: '#4f46e5', // Matches indigo-600
  white: '#ffffff',
};

interface HandleProps {
  zoom: number;
}

interface LHandleProps extends HandleProps {
  pos: 'tl' | 'tr' | 'bl' | 'br';
}

interface SideHandleProps extends HandleProps {
  orientation: 'v' | 'h';
  side: 'left' | 'right' | 'top' | 'bottom';
  pointerStyle?: string;
}

interface RotationHandleProps extends HandleProps {
  zoom: number;
  isRotating: boolean;
  rotation: number;
}

// --- Corner "L" Handles ---
export const LHandle: React.FC<LHandleProps> = ({ pos, zoom }) => {
  const size = 32;
  const center = size / 2;
  const arm = 14; 
  const thickness = 5;
  const outline = 1;

  const cursors = {
    tl: 'nwse-resize',
    tr: 'nesw-resize',
    bl: 'nesw-resize',
    br: 'nwse-resize',
  };

  const paths = {
    tl: `M ${center + arm} ${center} H ${center} V ${center + arm}`,
    tr: `M ${center - arm} ${center} H ${center} V ${center + arm}`,
    bl: `M ${center + arm} ${center} H ${center} V ${center - arm}`,
    br: `M ${center - arm} ${center} H ${center} V ${center - arm}`,
  };

  return (
    <div
      style={{
        width: size,
        height: size,
        position: 'absolute',
        transform: `translate(-50%, -50%) scale(${1 / zoom})`,
        willChange: 'transform',
        cursor: cursors[pos],
      }}
      className="flex items-center justify-center pointer-events-auto group z-[100]"
    >
      <svg width={size} height={size} className="overflow-visible transition-transform duration-200 group-hover:scale-110">
        {/* White Outline (Layered behind core) */}
        <path 
          d={paths[pos]} 
          fill="none" 
          stroke={COLORS.white} 
          strokeWidth={thickness + outline * 2} 
          strokeLinecap="round" 
          strokeLinejoin="round" 
          className="opacity-40 group-hover:opacity-100 transition-opacity duration-200"
        />
        {/* Dynamic Core (Changes to Indigo on hover) */}
        <path 
          d={paths[pos]} 
          fill="none" 
          stroke={COLORS.dark} 
          strokeWidth={thickness} 
          strokeLinecap="round" 
          strokeLinejoin="round" 
          className="group-hover:stroke-[#4f46e5] transition-colors duration-200"
          style={{ stroke: 'var(--handle-stroke, #1e1e2e)' }}
        />
      </svg>
      <style jsx>{`
        .group:hover { --handle-stroke: var(--accent-color); }
      `}</style>
    </div>
  );
};

// --- Side "Bar" Handles ---
export const SideHandle: React.FC<SideHandleProps> = ({ orientation, side, zoom, pointerStyle }) => {
  const size = 32;
  const center = size / 2;
  const len = 16;
  const thickness = 5;
  const outline = 1;

  const cursors = {
    left: 'ew-resize',
    right: 'ew-resize',
    top: 'ns-resize',
    bottom: 'ns-resize',
  };

  const d = orientation === 'v'
    ? `M ${center} ${center - len / 2} V ${center + len / 2}`
    : `M ${center - len / 2} ${center} H ${center + len / 2}`;

  return (
    <div
      style={{
        width: size,
        height: size,
        position: 'absolute',
        transform: `translate(-50%, -50%) scale(${1 / zoom})`,
        willChange: 'transform',
        pointerEvents: (pointerStyle as any) || 'auto',
        cursor: cursors[side],
      }}
      className="flex items-center justify-center pointer-events-auto group"
    >
      <svg width={size} height={size} className="overflow-visible transition-transform duration-200 group-hover:scale-110">
        <path 
          d={d} 
          fill="none" 
          stroke={COLORS.white} 
          strokeWidth={thickness + outline * 2} 
          strokeLinecap="round" 
          className="opacity-40 group-hover:opacity-100 transition-opacity duration-200"
        />
        <path 
          d={d} 
          fill="none" 
          stroke={COLORS.dark} 
          strokeWidth={thickness} 
          strokeLinecap="round" 
          className="group-hover:stroke-[#4f46e5] transition-colors duration-200"
          style={{ stroke: 'var(--handle-stroke, #1e1e2e)' }}
        />
      </svg>
      <style jsx>{`
        .group:hover { --handle-stroke: var(--accent-color); }
      `}</style>
    </div>
  );
};

export const RotationHandle: React.FC<RotationHandleProps> = ({ zoom, isRotating, rotation }) => {
  return (
    <div
      className="absolute flex flex-col items-center pointer-events-none"
      style={{
        transform: `scale(${1 / zoom})`,
        transformOrigin: 'center'
      }}
    >
      {/* Degree Tooltip */}
      {isRotating && (
        <div 
          className="absolute -top-10 px-2 py-1 text-white text-[10px] font-black rounded shadow-2xl whitespace-nowrap animate-in fade-in zoom-in-75 duration-150 uppercase tracking-tighter"
          style={{ backgroundColor: 'var(--accent-color)' }}
        >
          {Math.round(rotation)}°
        </div>
      )}

      {/* Handle Button */}
      <div
        className={`
          w-8 h-8 rounded-full shadow-2xl border border-white/20 
          flex items-center justify-center pointer-events-auto 
          cursor-alias active:cursor-grabbing transition-all duration-200
          hover:scale-110 active:scale-95
          hover:!bg-[var(--accent-color)]
        `}
        style={{ 
          // Default logic: use accent if rotating, otherwise dark core
          backgroundColor: isRotating ? 'var(--accent-color)' : '#1e1e2e',
          boxShadow: isRotating ? '0 0 20px var(--accent-color)' : 'none',
        }}
      >
        <RotateCw size={14} className="text-white" />
      </div>
    </div>
  );
};