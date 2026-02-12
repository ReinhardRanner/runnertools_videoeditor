import React, { useState } from 'react';
import * as Popover from '@radix-ui/react-popover';
import { ChevronDown, Sparkles } from 'lucide-react';

interface ModelPricing {
  input: number;
  output: number;
}

interface Model {
  id: string;
  name: string;
  isThinking?: boolean;
  supportsFlex?: boolean;
  pricing?: ModelPricing;
}

interface Provider {
  provider: string;
  providerName: string;
  models: Model[];
}

interface ModelGridProps {
  label?: string;
  providers: Provider[];
  selectedProvider: string;
  selectedModel: string;
  onSelect: (providerId: string, modelId: string) => void;
}

const getPriceTier = (pricing?: ModelPricing): string => {
  if (!pricing) return '';
  const outPrice = pricing.output;
  if (outPrice >= 20) return '💰💰💰';
  if (outPrice >= 5) return '💰💰';
  return '💰';
};

const formatPricing = (pricing?: ModelPricing): string => {
  if (!pricing) return '';
  return `In: $${pricing.input} / Out: $${pricing.output}`;
};

export const ModelGrid: React.FC<ModelGridProps> = ({
  label = "Model",
  providers,
  selectedProvider,
  selectedModel,
  onSelect,
}) => {
  const [isOpen, setIsOpen] = useState(false);
  const [hoveredModel, setHoveredModel] = useState<string | null>(null);

  const selectedProviderData = providers.find(p => p.provider === selectedProvider);
  const selectedModelData = selectedProviderData?.models.find(m => m.id === selectedModel);
  const selectedName = selectedProviderData && selectedModelData
    ? `${selectedProviderData.providerName} ${selectedModelData.name}`
    : 'Select Model';

  return (
    <Popover.Root open={isOpen} onOpenChange={setIsOpen}>
      <Popover.Trigger asChild>
        <button className="w-full bg-white/5 p-3 rounded-2xl border border-white/5 hover:border-white/10 hover:bg-white/[0.07] transition-all cursor-pointer group text-left">
          <p className="text-[7px] font-black text-gray-500 uppercase mb-1 tracking-widest group-hover:text-gray-400 transition-colors">
            {label}
          </p>
          <div className="flex items-center justify-between">
            <span className="text-white text-[10px] font-bold uppercase tracking-tight">
              {selectedName}
            </span>
            <ChevronDown
              size={10}
              className={`text-indigo-400 transition-transform duration-300 ${isOpen ? 'rotate-180' : ''}`}
            />
          </div>
        </button>
      </Popover.Trigger>

      <Popover.Portal>
        <Popover.Content
          className="w-[var(--radix-popover-trigger-width)] min-w-[280px] bg-[#0f0f0f] border border-white/10 rounded-xl shadow-[0_20px_40px_rgba(0,0,0,0.6)] overflow-hidden z-[10000] data-[state=open]:animate-in data-[state=closed]:animate-out data-[state=closed]:fade-out-0 data-[state=open]:fade-in-0 data-[state=closed]:zoom-out-95 data-[state=open]:zoom-in-95 data-[side=bottom]:slide-in-from-top-2"
          sideOffset={8}
          align="start"
        >
          <div className="max-h-[400px] overflow-y-auto custom-scrollbar p-3 space-y-4">
            {providers.map((provider) => (
              <div key={provider.provider} className="space-y-2">
                <div className="text-[8px] font-black uppercase tracking-widest text-gray-500 px-1">
                  {provider.providerName}
                </div>

                <div className="grid grid-cols-2 gap-2">
                  {provider.models.map((model) => {
                    const isSelected = selectedProvider === provider.provider && selectedModel === model.id;
                    const isHovered = hoveredModel === `${provider.provider}|${model.id}`;

                    return (
                      <button
                        key={model.id}
                        onClick={() => {
                          onSelect(provider.provider, model.id);
                          setIsOpen(false);
                        }}
                        onMouseEnter={() => setHoveredModel(`${provider.provider}|${model.id}`)}
                        onMouseLeave={() => setHoveredModel(null)}
                        className={`relative p-2.5 rounded-lg text-left transition-all duration-200 ${
                          isSelected
                            ? 'bg-indigo-500/20 border border-indigo-500/50 shadow-[0_0_12px_rgba(99,102,241,0.15)]'
                            : 'bg-white/[0.03] border border-white/5 hover:bg-white/[0.06] hover:border-white/10'
                        }`}
                      >
                        <div className="flex items-start justify-between gap-1">
                          <span className={`text-[9px] font-bold uppercase tracking-tight leading-tight ${
                            isSelected ? 'text-indigo-300' : 'text-gray-300'
                          }`}>
                            {model.name}
                          </span>
                          {isSelected && (
                            <div className="w-1.5 h-1.5 bg-indigo-500 rounded-full shadow-[0_0_8px_#818cf8] flex-shrink-0 mt-0.5" />
                          )}
                        </div>

                        <div className="flex items-center gap-1 mt-1.5 flex-wrap">
                          {model.isThinking && (
                            <div className="flex items-center gap-0.5 px-1 py-0.5 bg-purple-500/20 rounded text-[6px] font-bold text-purple-400 uppercase">
                              <Sparkles size={7} />
                              <span>Think</span>
                            </div>
                          )}
                          <span className="text-[8px] ml-auto">{getPriceTier(model.pricing)}</span>
                        </div>

                        {isHovered && model.pricing && (
                          <div className="absolute -top-7 left-1/2 -translate-x-1/2 px-2 py-1 bg-black border border-white/20 rounded-lg text-[7px] text-gray-300 whitespace-nowrap z-50 shadow-xl">
                            {formatPricing(model.pricing)}
                          </div>
                        )}
                      </button>
                    );
                  })}
                </div>
              </div>
            ))}
          </div>
        </Popover.Content>
      </Popover.Portal>
    </Popover.Root>
  );
};
