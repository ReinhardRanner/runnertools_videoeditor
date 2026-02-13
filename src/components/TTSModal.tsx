import React, { useState } from 'react';
import { X, Send, Loader2, Mic } from 'lucide-react';
import { ASSET_COLORS } from '../types';

interface TTSModalProps {
  open: boolean;
  onClose: () => void;
  onGenerate: (text: string, voice: string) => void;
  isGenerating: boolean;
}

const VOICES = [
  { id: 'en-US-AndrewNeural', name: 'Andrew (US)', lang: 'English' },
  { id: 'en-US-JennyNeural', name: 'Jenny (US)', lang: 'English' },
  { id: 'en-US-GuyNeural', name: 'Guy (US)', lang: 'English' },
  { id: 'en-GB-SoniaNeural', name: 'Sonia (UK)', lang: 'English' },
  { id: 'en-GB-RyanNeural', name: 'Ryan (UK)', lang: 'English' },
  { id: 'de-DE-KatjaNeural', name: 'Katja', lang: 'German' },
  { id: 'de-DE-ConradNeural', name: 'Conrad', lang: 'German' },
  { id: 'fr-FR-DeniseNeural', name: 'Denise', lang: 'French' },
  { id: 'es-ES-ElviraNeural', name: 'Elvira', lang: 'Spanish' },
];

export const TTSModal: React.FC<TTSModalProps> = ({ open, onClose, onGenerate, isGenerating }) => {
  const [text, setText] = useState('');
  const [voice, setVoice] = useState('en-US-AndrewNeural');

  if (!open) return null;

  return (
    <div className="fixed inset-0 bg-black/70 backdrop-blur-xl z-[9999] flex items-center justify-center p-4 md:p-8 animate-in fade-in duration-300">
      <div className="bg-bg-elevated border border-border-default w-full max-w-lg rounded-3xl overflow-hidden flex flex-col shadow-2xl">

        {/* Header */}
        <div className="h-14 border-b border-border-default flex items-center justify-between px-6 bg-white/[0.02]">
          <div className="flex items-center gap-3">
            <div className={`p-2 rounded-xl ${ASSET_COLORS.audio.bg} ${ASSET_COLORS.audio.text}`}>
              <Mic size={18} />
            </div>
            <span className="text-[11px] font-black uppercase tracking-[0.2em] text-white/90">Text to Speech</span>
          </div>
          <button onClick={onClose} className="p-2 hover:bg-white/10 rounded-full transition-all text-gray-500 hover:text-white">
            <X size={20}/>
          </button>
        </div>

        <div className="p-6 space-y-5">
          {/* Voice Selection */}
          <div className="space-y-2">
            <label className="text-[9px] font-black uppercase tracking-widest text-gray-500">Voice</label>
            <select
              value={voice}
              onChange={(e) => setVoice(e.target.value)}
              className="w-full bg-white/[0.03] border border-border-default rounded-xl px-4 py-3 text-xs text-white appearance-none focus:outline-none focus:border-indigo-500/50 transition-all"
            >
              {VOICES.map(v => (
                <option key={v.id} value={v.id} className="bg-[#111]">
                  {v.name} ({v.lang})
                </option>
              ))}
            </select>
          </div>

          {/* Text Input */}
          <div className="space-y-2">
            <label className="text-[9px] font-black uppercase tracking-widest text-gray-500">Text</label>
            <textarea
              value={text}
              onChange={(e) => setText(e.target.value)}
              placeholder="Enter the text you want to convert to speech..."
              className="w-full bg-bg-canvas-deep border border-border-default rounded-xl p-4 text-sm text-white focus:outline-none focus:border-indigo-500/50 min-h-[120px] resize-none"
              disabled={isGenerating}
            />
          </div>

          {/* Generate Button */}
          <button
            onClick={() => onGenerate(text, voice)}
            disabled={isGenerating || !text.trim()}
            className="w-full py-4 bg-indigo-600 hover:bg-indigo-500 disabled:opacity-20 text-white font-black uppercase text-xs rounded-xl transition-all flex items-center justify-center gap-2"
          >
            {isGenerating ? (
              <>
                <Loader2 size={16} className="animate-spin" />
                Generating...
              </>
            ) : (
              <>
                <Send size={16} />
                Generate Speech
              </>
            )}
          </button>
        </div>
      </div>
    </div>
  );
};
