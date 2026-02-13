import React, { useState, useRef, useEffect } from 'react';
import { ChevronDown, LucideIcon } from 'lucide-react';

interface SplitButtonOption<T> {
  value: T;
  label: string;         // The descriptive text in the menu
  buttonLabel?: string;  // The short text for the active button (The "Slot")
  description?: string;
  icon: LucideIcon;
}

interface SplitButtonProps<T> {
  options: SplitButtonOption<T>[];
  selectedValue: T;
  onValueChange: (value: T) => void;
  onAction: (value: T) => void;
  disabled?: boolean;
  className?: string;
}

export function SplitButton<T>({
  options,
  selectedValue,
  onValueChange,
  onAction,
  disabled,
  className = ""
}: SplitButtonProps<T>) {
  const [isOpen, setIsOpen] = useState(false);
  const containerRef = useRef<HTMLDivElement>(null);

  const selectedOption = options.find(opt => opt.value === selectedValue) || options[0];

  useEffect(() => {
    const handleClickOutside = (e: MouseEvent) => {
      if (containerRef.current && !containerRef.current.contains(e.target as Node)) {
        setIsOpen(false);
      }
    };
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  return (
    <div className={`flex relative items-stretch ${className}`} ref={containerRef}>
      {/* 1. Main Action Area */}
      <button
        onClick={() => onAction(selectedValue)}
        disabled={disabled}
        className="flex-1 flex items-center justify-center gap-3 py-4 bg-indigo-600 hover:bg-indigo-500 text-white rounded-l-2xl font-bold text-[11px] uppercase tracking-[0.2em] shadow-lg shadow-indigo-500/20 transition-all active:scale-[0.98] disabled:opacity-30"
      >
        <selectedOption.icon size={16} />
        {/* SLOT LOGIC: Priority to buttonLabel, then fallback to label */}
        {selectedOption.buttonLabel || selectedOption.label}
      </button>

      {/* 2. Vertical Divider */}
      <div className="w-[1px] bg-white/20 my-3 z-10" />

      {/* 3. Dropdown Toggle */}
      <button
        onClick={() => setIsOpen(!isOpen)}
        disabled={disabled}
        className="px-4 bg-indigo-600 hover:bg-indigo-500 text-white rounded-r-2xl transition-all disabled:opacity-30 active:bg-indigo-700"
      >
        <ChevronDown 
          size={16} 
          className={`transition-transform duration-200 ${isOpen ? 'rotate-180' : ''}`} 
        />
      </button>

      {/* 4. The Menu */}
      {isOpen && (
        <div className="absolute bottom-full right-0 mb-2 w-64 bg-[#161618] border border-white/10 rounded-xl overflow-hidden shadow-2xl z-[100] animate-in fade-in slide-in-from-bottom-2">
          <div className="p-1.5 space-y-1">
            {options.map((option) => {
              const Icon = option.icon;
              const isSelected = option.value === selectedValue;
              return (
                <button
                  key={String(option.value)}
                  onClick={() => {
                    onValueChange(option.value);
                    setIsOpen(false);
                  }}
                  className={`w-full flex items-start gap-3 px-3 py-2.5 rounded-lg text-left transition-colors ${
                    isSelected ? 'bg-indigo-500/20' : 'hover:bg-white/5'
                  }`}
                >
                  <Icon size={14} className={`mt-0.5 ${isSelected ? 'text-indigo-400' : 'text-white/40'}`} />
                  <div className="flex flex-col">
                    <span className={`text-[10px] font-bold uppercase ${isSelected ? 'text-indigo-400' : 'text-white/80'}`}>
                      {option.label}
                    </span>
                    {option.description && (
                      <span className="text-[9px] text-white/30 lowercase italic">
                        {option.description}
                      </span>
                    )}
                  </div>
                </button>
              );
            })}
          </div>
        </div>
      )}
    </div>
  );
}