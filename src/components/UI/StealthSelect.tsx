import React, { useState } from 'react';
import { ChevronDown } from 'lucide-react';

interface Option {
  label: string;
  value: string | number;
}

interface StealthSelectProps {
  label: string;
  value: string | number;
  options: Option[];
  onChange: (value: any) => void;
  className?: string;
}

export const StealthSelect: React.FC<StealthSelectProps> = ({ 
  label, 
  value, 
  options, 
  onChange, 
  className = "" 
}) => {
  const [isOpen, setIsOpen] = useState(false);

  // Find the label for the current value to display it
  const currentLabel = options.find(opt => opt.value === value)?.label || value;

  return (
    <div className={`relative ${className}`}>
      {/* Trigger Area */}
      <div 
        onClick={() => setIsOpen(!isOpen)} 
        className="bg-white/5 p-3 rounded-2xl border border-white/5 hover:border-white/10 hover:bg-white/[0.07] transition-all cursor-pointer group"
      >
        <p className="text-[7px] font-black text-gray-500 uppercase mb-1 tracking-widest group-hover:text-gray-400 transition-colors">
          {label}
        </p>
        <div className="flex items-center justify-between">
          <span className="text-white text-[10px] font-bold uppercase tracking-tight">
            {currentLabel}
          </span>
          <ChevronDown 
            size={10} 
            className={`text-indigo-400 transition-transform duration-300 ${isOpen ? 'rotate-180' : ''}`} 
          />
        </div>
      </div>

      {/* Dropdown Menu */}
      {isOpen && (
        <>
          {/* Backdrop to close when clicking outside */}
          <div 
            className="fixed inset-0 z-[600]" 
            onClick={() => setIsOpen(false)} 
          />
          
          <div className="absolute top-[calc(100%+8px)] left-0 w-full bg-[#0f0f0f] border border-white/10 rounded-xl shadow-[0_20px_40px_rgba(0,0,0,0.6)] z-[610] overflow-hidden animate-in fade-in zoom-in-95 duration-150 origin-top">
            <div className="max-h-48 overflow-y-auto custom-scrollbar">
              {options.map((opt) => (
                <button
                  key={opt.value}
                  onClick={() => {
                    onChange(opt.value);
                    setIsOpen(false);
                  }}
                  className={`w-full text-left px-4 py-2.5 text-[9px] font-black uppercase tracking-tighter transition-all flex items-center justify-between ${
                    value === opt.value 
                      ? 'text-indigo-400 bg-indigo-500/10' 
                      : 'text-gray-400 hover:bg-white/5 hover:text-white'
                  }`}
                >
                  {opt.label}
                  {value === opt.value && (
                    <div className="w-1 h-1 bg-indigo-500 rounded-full shadow-[0_0_8px_#818cf8]" />
                  )}
                </button>
              ))}
            </div>
          </div>
        </>
      )}
    </div>
  );
};