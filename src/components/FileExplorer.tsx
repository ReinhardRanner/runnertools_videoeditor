import React, { useRef, useState, useEffect } from 'react';
import { 
  Upload, Plus, Film, Music, Image as ImageIcon, 
  Code2, Sparkles, Mic, Trash2, 
  AlertTriangle, Check
} from 'lucide-react';
import { Asset, ASSET_COLORS } from '../types';

interface FileExplorerProps {
  assets: Asset[];
  onUpload: (e: React.ChangeEvent<HTMLInputElement>) => void;
  onAdd: (asset: Asset) => void;
  onDelete: (id: string) => void;
  onRename: (id: string, newName: string) => void;
  onCreateDynamic: (type: 'html' | 'manim') => void;
  onEditDynamic: (asset: Asset) => void;
  onCreateTTS: () => void;
}

export const FileExplorer: React.FC<FileExplorerProps> = ({
  assets, onUpload, onAdd, onDelete, onRename, onCreateDynamic, onEditDynamic, onCreateTTS
}) => {
  const fileInputRef = useRef<HTMLInputElement>(null);
  const renameInputRef = useRef<HTMLInputElement>(null);
  
  const [isDragging, setIsDragging] = useState(false);
  const [renamingId, setRenamingId] = useState<string | null>(null);
  const [renameValue, setRenameValue] = useState("");

  // Auto-focus the input when a user clicks the name to rename
  useEffect(() => {
    if (renamingId && renameInputRef.current) {
      renameInputRef.current.focus();
      renameInputRef.current.select();
    }
  }, [renamingId]);

  // --- Handlers ---
  const handleDragOver = (e: React.DragEvent) => { e.preventDefault(); setIsDragging(true); };
  const handleDragLeave = () => setIsDragging(false);
  const handleDrop = (e: React.DragEvent) => {
    e.preventDefault();
    setIsDragging(false);
    if (e.dataTransfer.files?.length) {
      const dt = new DataTransfer();
      for (let i = 0; i < e.dataTransfer.files.length; i++) dt.items.add(e.dataTransfer.files[i]);
      onUpload({ target: { files: dt.files } } as unknown as React.ChangeEvent<HTMLInputElement>);
    }
  };

  const startRenaming = (e: React.MouseEvent, asset: Asset) => {
    e.stopPropagation(); // Prevent opening the editor modal
    setRenamingId(asset.id);
    setRenameValue(asset.name.replace(/\.[^/.]+$/, ""));
  };

  const submitRename = () => {
    if (renamingId && renameValue.trim()) {
      onRename(renamingId, renameValue.trim());
    }
    setRenamingId(null);
  };

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter') submitRename();
    if (e.key === 'Escape') setRenamingId(null);
  };

  return (
    <div 
      className="flex flex-col h-full overflow-hidden"
      onDragOver={handleDragOver} onDragLeave={handleDragLeave} onDrop={handleDrop}
    >
      {/* 1. CREATION TOOLS */}
      <div className="grid grid-cols-3 gap-2 mb-4 shrink-0">
        {/* HTML Button */}
        <button 
          onClick={() => onCreateDynamic('html')} 
          className={`group py-3 ${ASSET_COLORS.html.bg} border ${ASSET_COLORS.html.border} rounded-xl transition-all cursor-pointer flex flex-col items-center justify-center gap-1 ${ASSET_COLORS.html.text} active:scale-95`}
        >
          <Code2 
            size={16} 
            className="transition-all duration-300 ease-out group-hover:scale-125 group-hover:drop-shadow-[0_0_8px_rgba(99,102,241,0.8)]" 
          />
          <span className="text-[8px] font-black uppercase tracking-wider opacity-70 group-hover:opacity-100 transition-opacity">HTML</span>
        </button>

        {/* Manim Button */}
        <button 
          onClick={() => onCreateDynamic('manim')} 
          className={`group py-3 ${ASSET_COLORS.manim.bg} border ${ASSET_COLORS.manim.border} rounded-xl transition-all cursor-pointer flex flex-col items-center justify-center gap-1 ${ASSET_COLORS.manim.text} active:scale-95`}
        >
          <Sparkles 
            size={16} 
            className="transition-all duration-300 ease-out group-hover:scale-125 group-hover:drop-shadow-[0_0_8px_rgba(168,85,247,0.8)]" 
          />
          <span className="text-[8px] font-black uppercase tracking-wider opacity-70 group-hover:opacity-100 transition-opacity">Manim</span>
        </button>

        {/* TTS Button */}
        <button 
          onClick={onCreateTTS} 
          className={`group py-3 ${ASSET_COLORS.audio.bg} border ${ASSET_COLORS.audio.border} rounded-xl transition-all cursor-pointer flex flex-col items-center justify-center gap-1 ${ASSET_COLORS.audio.text} active:scale-95`}
        >
          <Mic 
            size={16} 
            className="transition-all duration-300 ease-out group-hover:scale-125 group-hover:drop-shadow-[0_0_8px_rgba(244,63,94,0.8)]" 
          />
          <span className="text-[8px] font-black uppercase tracking-wider opacity-70 group-hover:opacity-100 transition-opacity">TTS</span>
        </button>
      </div>

      {/* 2. IMPORT DROPZONE */}
      <button 
        onClick={() => fileInputRef.current?.click()} 
        className={`mb-6 py-3 border-2 border-dashed rounded-2xl transition-all flex items-center justify-center gap-3 group cursor-pointer shrink-0 ${
          isDragging ? 'border-indigo-500 bg-indigo-500/10' : 'border-white/5 hover:bg-white/5 hover:border-white/10 text-gray-500'
        }`}
      >
        <Upload size={14} className={`${isDragging ? 'text-indigo-400' : 'group-hover:text-indigo-400'} transition-colors`}/>
        <p className="text-[9px] font-black uppercase tracking-widest">{isDragging ? 'Release to Upload' : 'Import Media'}</p>
      </button>
      <input type="file" ref={fileInputRef} hidden multiple onChange={onUpload} />

      {/* 3. ASSETS GRID */}
      <div className="flex-1 overflow-y-auto pr-2 custom-scrollbar">
        <div className="grid gap-3 pb-6" style={{ gridTemplateColumns: 'repeat(auto-fill, minmax(110px, 1fr))' }}>
          {assets.map(asset => {
            const colors = ASSET_COLORS[asset.type] || ASSET_COLORS.video;
            const percent = asset.progress ?? asset.processStatus?.match(/(\d+)%/)?.[1];
            const isEditing = renamingId === asset.id;
            
            const iconMap: Record<string, React.ReactNode> = {
              video: <Film size={18} />,
              audio: <Music size={18} />,
              image: <ImageIcon size={18} />,
              html: <Code2 size={18} />,
              manim: <Sparkles size={18} />,
            };

            const renderThumbnail = () => {
              if (asset.isProcessing || !asset.url) {
                return (
                  <div className={`${colors.text} opacity-40 group-hover:opacity-100 transition-all transform group-hover:scale-110 duration-500`}>
                    {iconMap[asset.type]}
                  </div>
                );
              }
              if (asset.type === 'image') {
                return <img src={asset.url} alt={asset.name} className="w-full h-full object-cover transition-transform duration-500 group-hover:scale-110" />;
              }
              if (['video', 'html', 'manim'].includes(asset.type)) {
                const middleFrame = (asset.duration || 2) / 2;
                return <video src={`${asset.url}#t=${middleFrame}`} className="w-full h-full object-cover transition-transform duration-500 group-hover:scale-110" muted playsInline />;
              }
              return (
                <div className={`${colors.text} opacity-40 group-hover:opacity-100 transition-all transform group-hover:scale-110 duration-500`}>
                  {iconMap[asset.type]}
                </div>
              );
            };

            return (
              <div
                key={asset.id}
                onClick={() => !isEditing && (asset.type === 'html' || asset.type === 'manim') && onEditDynamic(asset)}
                className={`group relative flex flex-col bg-white/[0.02] rounded-2xl border transition-all cursor-pointer overflow-hidden ${
                  asset.processError && !asset.isProcessing ? 'border-red-500/30' : `border-white/5 hover:${colors.border}`
                }`}
                style={{ aspectRatio: '1 / 1.15' }}
              >
                {/* PREVIEW AREA */}
                <div className="flex-1 relative flex items-center justify-center bg-black/40 overflow-hidden">
                  {renderThumbnail()}

                  {/* ACTION OVERLAY (Top Right) */}
                  <div className="absolute top-2 right-2 flex flex-col gap-1 opacity-0 group-hover:opacity-100 transition-all z-20 translate-x-1 group-hover:translate-x-0">
                    <button 
                      onClick={(e) => { e.stopPropagation(); onDelete(asset.id); }} 
                      className="bg-black/80 hover:bg-red-500/20 text-white/40 hover:text-red-400 p-1.5 rounded-lg backdrop-blur-md border border-white/5 transition-all active:scale-90"
                    >
                      <Trash2 size={10}/>
                    </button>
                    
                    {/* ADD BUTTON - Fixed visibility logic */}
                    <button
                      onClick={(e) => { e.stopPropagation(); onAdd(asset); }}
                      disabled={!asset.url || asset.isProcessing}
                      className="bg-indigo-600 hover:bg-indigo-500 text-white p-1.5 rounded-lg shadow-xl transition-all active:scale-90 disabled:opacity-20 disabled:grayscale disabled:cursor-not-allowed"
                    >
                      <Plus size={10}/>
                    </button>
                  </div>

                  {/* PROCESSING OVERLAY */}
                  {asset.isProcessing && (
                    <div className="absolute inset-0 flex flex-col items-center justify-center bg-black/70 backdrop-blur-[1px] z-10">
                      <div className="relative w-8 h-8">
                        <div className={`absolute inset-0 border-t-2 ${colors.accent || 'border-indigo-500'} rounded-full animate-spin`} />
                        {percent && (
                          <span className={`absolute inset-0 flex items-center justify-center text-[7px] font-black ${colors.text}`}>
                            {percent}%
                          </span>
                        )}
                      </div>
                    </div>
                  )}
                </div>

                {/* INFO FOOTER */}
                <div className="p-2.5 bg-white/[0.01] border-t border-white/5">
                  {isEditing ? (
                    <div className="flex items-center gap-1 bg-black/40 rounded-lg px-1.5 py-1 border border-indigo-500/50">
                      <input
                        ref={renameInputRef}
                        value={renameValue}
                        onChange={(e) => setRenameValue(e.target.value)}
                        onBlur={submitRename}
                        onKeyDown={handleKeyDown}
                        onClick={(e) => e.stopPropagation()}
                        className="bg-transparent text-[9px] font-bold text-white outline-none w-full"
                      />
                      <Check size={10} className="text-emerald-400 shrink-0 cursor-pointer" onClick={submitRename}/>
                    </div>
                  ) : (
                    <h4 
                      className="text-[9px] font-bold truncate text-white/40 group-hover:text-white transition-colors uppercase tracking-tight cursor-text hover:bg-white/5 rounded px-1 -ml-1"
                      onClick={(e) => startRenaming(e, asset)}
                      title="Click to rename"
                    >
                      {asset.name.replace(/\.[^/.]+$/, "")}
                    </h4>
                  )}
                  <div className="flex items-center justify-between mt-1">
                    <span className={`text-[7px] font-black uppercase tracking-widest ${colors.text} opacity-60`}>{asset.type}</span>
                    <span className="text-[8px] font-medium text-white/20">{asset.duration > 0 && `${asset.duration.toFixed(1)}s`}</span>
                  </div>
                </div>

                {/* ERROR INDICATOR BAR */}
                {asset.processError && !asset.isProcessing && (
                  <div className="absolute bottom-0 left-0 right-0 h-0.5 bg-red-500/50" />
                )}
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
};