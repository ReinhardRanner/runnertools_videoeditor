import React, { useRef } from 'react';
import { Upload, Plus, Film, Music, Image as ImageIcon } from 'lucide-react';
import { Asset } from '../types';

interface FileExplorerProps {
  assets: Asset[];
  onUpload: (e: React.ChangeEvent<HTMLInputElement>) => void;
  onAdd: (asset: Asset) => void;
}

export const FileExplorer: React.FC<FileExplorerProps> = ({ assets, onUpload, onAdd }) => {
  const fileInputRef = useRef<HTMLInputElement>(null);

  return (
    <div className="flex flex-col h-full overflow-hidden">
      <button onClick={() => fileInputRef.current?.click()} className="w-full py-4 border-2 border-dashed border-white/10 rounded-2xl mb-6 hover:bg-indigo-500/5 hover:border-indigo-500/40 transition-all flex flex-col items-center gap-3 text-gray-500 group">
        <div className="p-3 bg-white/5 rounded-full group-hover:bg-indigo-500 group-hover:text-white transition-all"><Upload size={20}/></div>
        <div className="text-center">
          <p className="text-[10px] font-black tracking-widest uppercase text-gray-400">Import Media</p>
          <p className="text-[9px] opacity-40">MP4, MP3, PNG, JPG</p>
        </div>
      </button>
      <input type="file" ref={fileInputRef} hidden multiple onChange={onUpload} />
      <div className="flex-1 overflow-y-auto space-y-2 pr-2 custom-scrollbar">
        {assets.map(asset => (
          <div key={asset.id} className="group relative bg-[#111] p-3 rounded-2xl border border-white/5 hover:border-indigo-500/50 transition-all cursor-pointer flex items-center gap-3">
            <div className="w-10 h-10 bg-black rounded-lg flex items-center justify-center border border-white/5 shrink-0">
              {asset.type === 'video' ? <Film size={14} className="text-sky-400" /> : asset.type === 'audio' ? <Music size={14} className="text-indigo-400" /> : <ImageIcon size={14} className="text-emerald-400" />}
            </div>
            <div className="flex-1 min-w-0">
              <p className="text-[10px] font-bold truncate capitalize text-gray-300">{asset.name.split('.')[0]}</p>
              <p className="text-[8px] font-black opacity-30 uppercase tracking-widest">{asset.type} • {asset.sourceDuration.toFixed(1)}s</p>
            </div>
            <button onClick={(e) => { e.stopPropagation(); onAdd(asset); }} className="opacity-0 group-hover:opacity-100 bg-indigo-600 text-white p-2 rounded-xl hover:bg-indigo-500 transition-all shadow-lg active:scale-90"><Plus size={14}/></button>
          </div>
        ))}
      </div>
    </div>
  );
};