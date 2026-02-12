import React, { useRef, useState } from 'react';
import { Upload, Plus, Film, Music, Image as ImageIcon, Code2, Sparkles, Edit3, Mic, Trash2 } from 'lucide-react';
import { Asset } from '../types';

interface FileExplorerProps {
  assets: Asset[];
  onUpload: (e: React.ChangeEvent<HTMLInputElement>) => void;
  onAdd: (asset: Asset) => void;
  onDelete: (id: string) => void; // Neu hinzugefügt
  onCreateDynamic: (type: 'html' | 'manim') => void;
  onEditDynamic: (asset: Asset) => void;
  onCreateTTS: () => void;
}

export const FileExplorer: React.FC<FileExplorerProps> = ({
  assets, onUpload, onAdd, onDelete, onCreateDynamic, onEditDynamic, onCreateTTS
}) => {
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [isDragging, setIsDragging] = useState(false);

  // Drag & Drop Handler
  const handleDragOver = (e: React.DragEvent) => {
    e.preventDefault();
    setIsDragging(true);
  };

  const handleDragLeave = () => setIsDragging(false);

  const handleDrop = (e: React.DragEvent) => {
    e.preventDefault();
    setIsDragging(false);
    if (e.dataTransfer.files && e.dataTransfer.files.length > 0) {
      // Erstellt ein Fake-Event für die bestehende onUpload-Logik
      const dt = new DataTransfer();
      for (let i = 0; i < e.dataTransfer.files.length; i++) {
        dt.items.add(e.dataTransfer.files[i]);
      }
      const event = {
        target: { files: dt.files }
      } as unknown as React.ChangeEvent<HTMLInputElement>;
      onUpload(event);
    }
  };

  return (
    <div 
      className="flex flex-col h-full overflow-hidden"
      onDragOver={handleDragOver}
      onDragLeave={handleDragLeave}
      onDrop={handleDrop}
    >
      {/* Creation Tools - Jetzt oben und gleichmäßig verteilt */}
      <div className="grid grid-cols-3 gap-2 mb-4">
        <button 
          onClick={() => onCreateDynamic('html')} 
          className="py-3 bg-sky-500/10 border border-sky-500/20 rounded-xl hover:bg-sky-500/20 transition-all flex flex-col items-center justify-center gap-1 text-sky-400 cursor-pointer"
        >
          <Code2 size={16}/><span className="text-[8px] font-black uppercase">HTML</span>
        </button>
        
        <button
          onClick={() => onCreateDynamic('manim')}
          className="py-3 bg-purple-500/10 border border-purple-500/20 rounded-xl hover:bg-purple-500/20 transition-all flex flex-col items-center justify-center gap-1 text-purple-400 cursor-pointer"
        >
          <Sparkles size={16}/><span className="text-[8px] font-black uppercase">Manim</span>
        </button>

        <button
          onClick={onCreateTTS}
          className="py-3 bg-amber-500/10 border border-amber-500/20 rounded-xl hover:bg-amber-500/20 transition-all flex flex-col items-center justify-center gap-1 text-amber-400 cursor-pointer"
        >
          <Mic size={16}/><span className="text-[8px] font-black uppercase">TTS</span>
        </button>
      </div>

      {/* Import/Dropzone - Kleiner und funktionaler */}
      <button 
        onClick={() => fileInputRef.current?.click()} 
        className={`mb-6 py-3 border-2 border-dashed rounded-2xl transition-all flex items-center justify-center gap-3 group cursor-pointer ${
          isDragging 
            ? 'border-indigo-500 bg-indigo-500/10' 
            : 'border-border-strong hover:bg-white/5 hover:border-indigo-500/40 text-gray-500'
        }`}
      >
        <Upload size={16} className={`${isDragging ? 'text-indigo-400' : 'group-hover:text-indigo-400'} transition-colors`}/>
        <p className="text-[9px] font-black uppercase tracking-widest">
          {isDragging ? 'Drop to upload' : 'Import Media'}
        </p>
      </button>
      
      <input type="file" ref={fileInputRef} hidden multiple onChange={onUpload} />

      {/* Assets List */}
      <div className="flex-1 overflow-y-auto space-y-2 pr-2 custom-scrollbar">
        {assets.map(asset => (
          <div key={asset.id} className="group relative bg-bg-elevated p-3 rounded-2xl border border-border-default hover:border-indigo-500/50 transition-all flex items-center gap-3">
            <div className="w-10 h-10 bg-bg-canvas rounded-lg flex items-center justify-center border border-border-subtle shrink-0">
              {asset.type === 'video' && <Film size={14} className="text-sky-400" />}
              {asset.type === 'audio' && <Music size={14} className="text-indigo-400" />}
              {asset.type === 'image' && <ImageIcon size={14} className="text-emerald-400" />}
              {asset.type === 'html' && <Code2 size={14} className="text-sky-400" />}
              {asset.type === 'manim' && <Sparkles size={14} className="text-purple-400" />}
            </div>
            
            <div className="flex-1 min-w-0">
              <p className="text-[10px] font-bold truncate capitalize text-gray-300">{asset.name.split('.')[0]}</p>
              <p className="text-[8px] font-black opacity-30 uppercase tracking-widest">
                {asset.type} • {asset.sourceDuration.toFixed(1)}s
              </p>
            </div>

            {/* Actions: Edit, Delete, Add */}
            <div className="flex gap-1 opacity-0 group-hover:opacity-100 transition-all">
              {(asset.type === 'html' || asset.type === 'manim') && (
                <button 
                  onClick={(e) => { e.stopPropagation(); onEditDynamic(asset); }} 
                  className="bg-white/10 text-white p-2 rounded-xl hover:bg-white/20 transition-all cursor-pointer active:scale-90"
                  title="Edit"
                >
                  <Edit3 size={12}/>
                </button>
              )}
              <button 
                onClick={(e) => { e.stopPropagation(); onDelete(asset.id); }} 
                className="bg-red-500/10 text-red-500 p-2 rounded-xl hover:bg-red-500/20 transition-all cursor-pointer active:scale-90"
                title="Delete"
              >
                <Trash2 size={12}/>
              </button>
              <button 
                onClick={(e) => { e.stopPropagation(); onAdd(asset); }} 
                className="bg-indigo-600 text-white p-2 rounded-xl hover:bg-indigo-500 transition-all shadow-lg cursor-pointer active:scale-90"
                title="Add to Timeline"
              >
                <Plus size={12}/>
              </button>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
};