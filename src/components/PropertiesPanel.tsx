import React, { useState } from 'react';
import { 
  Settings2, Move, Volume2, RotateCw, Trash2, 
  ChevronDown, ChevronRight, Film, Music, Image as ImageIcon 
} from 'lucide-react';
import { TrackItem } from '../types';

interface PropertiesProps {
  item: TrackItem | undefined;
  onUpdate: (updates: Partial<TrackItem>) => void;
  onDelete: () => void;
}

// --- Helper for Type Icons ---
const getTypeStyles = (type: string) => {
  switch (type) {
    case 'video': return { icon: Film, color: 'text-sky-400', bg: 'bg-sky-400/10' };
    case 'audio': return { icon: Music, color: 'text-indigo-400', bg: 'bg-indigo-400/10' };
    case 'image': return { icon: ImageIcon, color: 'text-emerald-400', bg: 'bg-emerald-400/10' };
    default: return { icon: Settings2, color: 'text-gray-400', bg: 'bg-gray-400/10' };
  }
};

// --- Reusable Sub-Components ---
const InputField = ({ label, value, onChange, icon: Icon, step = 1, isFloat = false }: any) => (
  <div className="bg-white/5 p-2 rounded-xl border border-white/5 hover:border-white/10 transition-colors group">
    <p className="text-[7px] text-gray-500 font-black mb-1 uppercase tracking-widest flex items-center gap-1 group-hover:text-gray-300 transition-colors">
      {Icon && <Icon size={8}/>} {label}
    </p>
    <input 
      type="number" 
      step={step}
      value={value} 
      onChange={(e) => {
        const val = isFloat ? parseFloat(e.target.value) : parseInt(e.target.value);
        onChange(isNaN(val) ? 0 : val);
      }} 
      className="bg-transparent w-full text-xs font-mono text-indigo-400 outline-none focus:text-white" 
    />
  </div>
);

const CollapsibleSection = ({ title, icon: Icon, children, isOpen, onToggle }: any) => (
  <div className="border-b border-white/5 last:border-0 pb-4">
    <button 
      onClick={onToggle}
      className="w-full flex items-center justify-between py-2 text-white/30 hover:text-white transition-colors group"
    >
      <div className="flex items-center gap-2">
        <Icon size={12} className="group-hover:text-indigo-400 transition-colors" />
        <span className="text-[9px] font-black uppercase tracking-[0.1em]">{title}</span>
      </div>
      {isOpen ? <ChevronDown size={12} /> : <ChevronRight size={12} />}
    </button>
    {isOpen && <div className="mt-4 space-y-4 animate-in fade-in slide-in-from-top-1 duration-200">{children}</div>}
  </div>
);

export const PropertiesPanel: React.FC<PropertiesProps> = ({ item, onUpdate, onDelete }) => {
  const [openSections, setOpenSections] = useState({ transform: true, audio: true });

  const toggleSection = (section: keyof typeof openSections) => {
    setOpenSections(prev => ({ ...prev, [section]: !prev[section] }));
  };

  if (!item) return (
    <div className="h-full flex flex-col items-center justify-center opacity-10 text-white">
      <Settings2 size={48} />
      <p className="text-[10px] font-black uppercase tracking-[0.3em] mt-4">No Selection</p>
    </div>
  );

  const { icon: TypeIcon, color, bg } = getTypeStyles(item.type);

  return (
    <div className="flex flex-col h-full text-white">
      
      {/* --- HEADER BAR --- */}
      <div className="flex items-center justify-between mb-8 pb-6 border-b border-white/5">
        <div className="flex items-center gap-3 overflow-hidden">
          <div className={`p-2.5 ${bg} rounded-xl shrink-0 border border-white/5`}>
            <TypeIcon size={16} className={color} />
          </div>
          <div className="overflow-hidden">
            <p className="text-[10px] font-black text-white truncate uppercase tracking-widest leading-tight">
              {item.name.split('.')[0]}
            </p>
            <p className={`text-[8px] font-bold ${color} opacity-60 uppercase tracking-tighter`}>
              {item.type} asset
            </p>
          </div>
        </div>
        
        <button 
          onClick={() => { if(confirm('Delete clip?')) onDelete(); }}
          className="p-2 text-gray-600 hover:text-red-500 hover:bg-red-500/10 rounded-lg transition-all active:scale-90"
        >
          <Trash2 size={14} />
        </button>
      </div>

      {/* --- Collapsible Content --- */}
      <div className="space-y-2 overflow-y-auto pr-2 custom-scrollbar">
        
        {/* --- Transform Section --- */}
        <CollapsibleSection 
          title="Transform" 
          icon={Move} 
          isOpen={openSections.transform} 
          onToggle={() => toggleSection('transform')}
        >
          <div className="grid grid-cols-2 gap-2">
            <InputField label="X Pos" value={Math.round(item.x)} onChange={(val: number) => onUpdate({x: val})} />
            <InputField label="Y Pos" value={Math.round(item.y)} onChange={(val: number) => onUpdate({y: val})} />
          </div>
          <div className="grid grid-cols-2 gap-2">
            <InputField label="Width" value={Math.round(item.width)} onChange={(val: number) => onUpdate({width: val})} />
            <InputField label="Height" value={Math.round(item.height)} onChange={(val: number) => onUpdate({height: val})} />
          </div>
          <InputField label="Rotation" icon={RotateCw} value={Math.round(item.rotation)} onChange={(val: number) => onUpdate({rotation: val})} />
        </CollapsibleSection>

        {/* --- Audio Section --- */}
        {item.type !== 'image' && (
          <CollapsibleSection 
            title="Audio" 
            icon={Volume2} 
            isOpen={openSections.audio} 
            onToggle={() => toggleSection('audio')}
          >
            <div className="space-y-4">
              {/* Volume Slider Block */}
              <div className="bg-white/5 p-4 rounded-2xl border border-white/5">
                <input 
                  type="range" min="0" max="2" step="0.01" value={item.volume} 
                  onChange={(e) => {
                    let val = parseFloat(e.target.value);
                    if (Math.abs(val - 1.0) < 0.05) val = 1.0;
                    onUpdate({ volume: val });
                  }} 
                  className="w-full accent-indigo-500 cursor-pointer mb-4" 
                />
                <div className="flex justify-between items-center font-mono">
                  <span className="text-[7px] font-black uppercase text-gray-500 tracking-widest">
                    {item.volume === 1.0 ? "Unity Gain" : "Output Level"}
                  </span>
                  <div className="flex items-center gap-1 bg-black/40 px-2 py-1 rounded-md border border-white/5">
                    <input 
                      type="number" value={Math.round(item.volume * 100)}
                      onChange={(e) => onUpdate({ volume: (parseInt(e.target.value) || 0) / 100 })}
                      className="bg-transparent text-indigo-400 text-right outline-none w-8 text-[10px] font-bold"
                    />
                    <span className="text-indigo-400 opacity-40 text-[9px]">%</span>
                  </div>
                </div>
              </div>

              {/* Fades Grid */}
              <div className="grid grid-cols-2 gap-2">
                <InputField 
                  label="Fade In (s)" 
                  value={item.fadeInDuration} 
                  step={0.1}
                  isFloat={true}
                  onChange={(val: number) => onUpdate({ fadeInDuration: val })} 
                />
                <InputField 
                  label="Fade Out (s)" 
                  value={item.fadeOutDuration} 
                  step={0.1}
                  isFloat={true}
                  onChange={(val: number) => onUpdate({ fadeOutDuration: val })} 
                />
              </div>
            </div>
          </CollapsibleSection>
        )}
      </div>
    </div>
  );
};