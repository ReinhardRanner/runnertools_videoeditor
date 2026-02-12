import React, { useState } from 'react';
import { ChevronDown } from 'lucide-react';

interface Option {
  label: string;
  selectedLabel?: string;
  value: string | number;
  tooltip?: string;
}

interface OptionGroup {
  header: string;
  options: Option[];
}

interface StealthSelectProps {
  label: string;
  value: string | number;
  options: Option[] | OptionGroup[];
  onChange: (value: any) => void;
  className?: string;
}

// Type guard to check if options are grouped
const isGrouped = (options: Option[] | OptionGroup[]): options is OptionGroup[] => {
  return options.length > 0 && 'header' in options[0];
};

// Flatten grouped options to find selected
const flattenOptions = (options: Option[] | OptionGroup[]): Option[] => {
  if (isGrouped(options)) {
    return options.flatMap(g => g.options);
  }
  return options;
};

export const StealthSelect: React.FC<StealthSelectProps> = ({
  label,
  value,
  options,
  onChange,
  className = ""
}) => {
  const [isOpen, setIsOpen] = useState(false);
  const [hoveredValue, setHoveredValue] = useState<string | number | null>(null);

  const allOptions = flattenOptions(options);
  const currentOption = allOptions.find(opt => opt.value === value);
  const currentLabel = currentOption?.selectedLabel || currentOption?.label || value;
  const grouped = isGrouped(options);

  const renderOption = (opt: Option) => (
    <button
      key={opt.value}
      onClick={() => {
        onChange(opt.value);
        setIsOpen(false);
      }}
      onMouseEnter={() => setHoveredValue(opt.value)}
      onMouseLeave={() => setHoveredValue(null)}
      className={`relative w-full text-left py-2.5 text-[9px] uppercase tracking-tight transition-all flex items-center justify-between ${
        grouped ? 'pl-6 pr-4' : 'px-4'
      } ${
        value === opt.value
          ? 'text-indigo-400 bg-indigo-500/10 font-semibold'
          : 'text-gray-400 hover:bg-white/5 hover:text-white font-medium'
      }`}
    >
      {opt.label}
      {value === opt.value && (
        <div className="w-1 h-1 bg-indigo-500 rounded-full shadow-[0_0_8px_#818cf8]" />
      )}
      {/* Tooltip */}
      {hoveredValue === opt.value && opt.tooltip && (
        <div className="absolute right-full mr-2 top-1/2 -translate-y-1/2 px-2.5 py-1.5 bg-black border border-white/20 rounded-lg text-[8px] text-gray-300 whitespace-nowrap z-[620] shadow-xl normal-case tracking-normal font-medium">
          {opt.tooltip}
        </div>
      )}
    </button>
  );

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
            <div className="max-h-64 overflow-y-auto custom-scrollbar">
              {grouped ? (
                (options as OptionGroup[]).map((group) => (
                  <div key={group.header}>
                    {/* Group Header */}
                    <div className="px-4 py-2 text-[8px] font-black uppercase tracking-widest text-gray-600 bg-white/[0.02] border-b border-white/5 sticky top-0">
                      {group.header}
                    </div>
                    {group.options.map(renderOption)}
                  </div>
                ))
              ) : (
                (options as Option[]).map(renderOption)
              )}
            </div>
          </div>
        </>
      )}
    </div>
  );
};
