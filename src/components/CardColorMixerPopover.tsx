import React, { useEffect, useRef, useState } from 'react';
import { Palette, Check, RotateCcw } from 'lucide-react';

export const CARD_THEME_SWATCHES: Array<{ label: string; hex: string }> = [
  { label: 'Royal Blue', hex: '#1e3a8a' },
  { label: 'Baroda Orange', hex: '#ea580c' },
  { label: 'Emerald Vault', hex: '#059669' },
  { label: 'Indigo Slate', hex: '#4338ca' },
  { label: 'Ocean Sky', hex: '#0284c7' },
  { label: 'Amber Gold', hex: '#d97706' },
  { label: 'Violet Plum', hex: '#6d28d9' },
  { label: 'Crimson Rose', hex: '#be123c' },
  { label: 'Teal Cyan', hex: '#0f766e' },
  { label: 'Charcoal Obsidian', hex: '#1e293b' },
];

interface CardColorMixerButtonProps {
  currentColor?: string;
  color?: string;
  defaultColor?: string;
  cardLabel?: string;
  label?: string;
  onChangeColor?: (newHex: string) => void;
  onChange?: (newHex: string) => void;
  testId?: string;
}

export const CardColorMixerButton: React.FC<CardColorMixerButtonProps> = ({
  currentColor,
  color,
  defaultColor = '#1e3a8a',
  cardLabel,
  label,
  onChangeColor,
  onChange,
  testId,
}) => {
  const [isOpen, setIsOpen] = useState(false);
  const containerRef = useRef<HTMLDivElement>(null);

  const resolvedColor = currentColor || color || defaultColor || '#1e3a8a';
  const resolvedLabel = cardLabel || label || 'Card Theme';
  const handleSelectColor = (hex: string) => {
    if (onChangeColor) onChangeColor(hex);
    if (onChange) onChange(hex);
  };

  useEffect(() => {
    if (!isOpen) return;
    const handleOutsideClick = (e: MouseEvent) => {
      if (containerRef.current && !containerRef.current.contains(e.target as Node)) {
        setIsOpen(false);
      }
    };
    document.addEventListener('mousedown', handleOutsideClick);
    return () => document.removeEventListener('mousedown', handleOutsideClick);
  }, [isOpen]);

  const slug = resolvedLabel.toLowerCase().replace(/[^a-z0-9]+/g, '-');

  return (
    <div
      ref={containerRef}
      className="relative inline-block shrink-0"
      onClick={(e) => e.stopPropagation()}
    >
      <button
        type="button"
        data-testid={testId || `card-color-mixer-btn-${slug}`}
        onClick={(e) => {
          e.stopPropagation();
          setIsOpen((prev) => !prev);
        }}
        aria-label={`Change color theme for ${resolvedLabel}`}
        title={`Color Theme Mixer (${resolvedLabel})`}
        className="p-1.5 rounded-lg bg-white/15 hover:bg-white/25 text-white border border-white/15 backdrop-blur-xs transition-colors cursor-pointer flex items-center justify-center shadow-2xs"
      >
        <Palette className="w-3.5 h-3.5" />
      </button>

      {isOpen && (
        <div
          data-testid="card-color-mixer-popover"
          onClick={(e) => e.stopPropagation()}
          className="absolute right-0 mt-1.5 w-56 p-3 rounded-xl bg-slate-900 text-white border border-slate-700 shadow-2xl z-50 space-y-2.5"
        >
          <div className="flex items-center justify-between gap-2 pb-1.5 border-b border-slate-800">
            <span className="text-[11px] font-extrabold uppercase tracking-wider text-slate-300 truncate">
              Card Theme Mixer
            </span>
            {defaultColor && resolvedColor.toLowerCase() !== defaultColor.toLowerCase() && (
              <button
                type="button"
                onClick={() => handleSelectColor(defaultColor)}
                title="Reset to default theme color"
                className="text-[10px] font-bold text-slate-400 hover:text-white flex items-center gap-1 cursor-pointer"
              >
                <RotateCcw className="w-2.5 h-2.5" />
                <span>Reset</span>
              </button>
            )}
          </div>

          {/* Custom Color Mixer Input */}
          <label className="flex items-center justify-between gap-2 p-1.5 rounded-lg bg-slate-800/90 border border-slate-700 cursor-pointer">
            <span className="text-[11px] font-semibold text-slate-200">
              Custom Color Mixer:
            </span>
            <div className="flex items-center gap-1.5">
              <span className="text-[10px] font-mono text-slate-400 uppercase">
                {resolvedColor}
              </span>
              <input
                type="color"
                aria-label={`Custom hex color mixer for ${resolvedLabel}`}
                value={
                  resolvedColor.startsWith('#') && resolvedColor.length === 7
                    ? resolvedColor
                    : '#1e3a8a'
                }
                onChange={(e) => handleSelectColor(e.target.value)}
                className="w-6 h-6 rounded cursor-pointer border-0 bg-transparent p-0"
              />
            </div>
          </label>

          {/* Curated Gradient Swatches */}
          <div>
            <div className="text-[10px] font-bold uppercase tracking-wider text-slate-400 mb-1.5">
              Preset Themes
            </div>
            <div className="grid grid-cols-5 gap-1.5">
              {CARD_THEME_SWATCHES.map((swatch) => {
                const isSelected =
                  resolvedColor.toLowerCase() === swatch.hex.toLowerCase();
                return (
                  <button
                    key={swatch.hex}
                    type="button"
                    onClick={() => handleSelectColor(swatch.hex)}
                    title={swatch.label}
                    aria-label={`Select ${swatch.label} theme`}
                    style={{ backgroundColor: swatch.hex }}
                    className={`w-7 h-7 rounded-lg flex items-center justify-center transition-transform cursor-pointer border ${
                      isSelected
                        ? 'border-white scale-105 ring-2 ring-white/40'
                        : 'border-white/20 opacity-85 hover:opacity-100 hover:scale-105'
                    }`}
                  >
                    {isSelected && <Check className="w-3.5 h-3.5 text-white drop-shadow" />}
                  </button>
                );
              })}
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
