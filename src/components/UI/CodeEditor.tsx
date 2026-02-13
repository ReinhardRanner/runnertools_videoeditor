import React, { useState, useEffect, useRef, useCallback } from 'react';
import { createHighlighter, Highlighter } from 'shiki';
import { Copy, Check, Loader2 } from 'lucide-react';

interface CodeEditorProps {
  value: string;
  onChange: (v: string) => void;
  language: 'html' | 'python';
  fullHeight?: boolean;
}

export const CodeEditor: React.FC<CodeEditorProps> = ({ value, onChange, language, fullHeight }) => {
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const containerRef = useRef<HTMLDivElement>(null);
  const [copied, setCopied] = useState(false);
  const [highlighter, setHighlighter] = useState<Highlighter | null>(null);
  const [html, setHtml] = useState('');

  useEffect(() => {
    const init = async () => {
      const shiki = await createHighlighter({
        themes: ['dark-plus'],
        langs: ['html', 'python', 'javascript', 'css'],
      });
      setHighlighter(shiki);
    };
    init();
  }, []);

  useEffect(() => {
    if (!highlighter) return;
    const highlighted = highlighter.codeToHtml(value || '', {
      lang: language,
      theme: 'dark-plus'
    });
    setHtml(highlighted);
  }, [value, language, highlighter]);

  // --- THE FIX: SYNC DIMENSIONS ---
  useEffect(() => {
    if (textareaRef.current) {
      const el = textareaRef.current;
      // Reset height/width to recalculate
      el.style.height = '0px';
      el.style.width = '0px';
      
      // Set height to scrollHeight (vertical content)
      el.style.height = el.scrollHeight + 'px';
      // Set width to scrollWidth (horizontal content) 
      // We add a little padding (40px) to prevent the caret from hitting the edge
      el.style.width = (el.scrollWidth + 40) + 'px';
    }
  }, [value, html]);

  const handleKeyDown = (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
    if (e.key === 'Tab') {
      e.preventDefault();
      const start = e.currentTarget.selectionStart;
      const end = e.currentTarget.selectionEnd;
      const spaces = "  ";
      const newValue = value.substring(0, start) + spaces + value.substring(end);
      onChange(newValue);
      setTimeout(() => {
        if (textareaRef.current) {
          textareaRef.current.selectionStart = textareaRef.current.selectionEnd = start + spaces.length;
        }
      }, 0);
    }
  };

  return (
    <div className={`rounded-xl border border-white/10 relative bg-[#1e1e1e] ${fullHeight ? 'h-full' : 'h-96'}`}>
      <button
        onClick={() => {
          navigator.clipboard.writeText(value);
          setCopied(true);
          setTimeout(() => setCopied(false), 2000);
        }}
        className="absolute top-3 right-3 z-30 p-1.5 rounded-lg bg-white/5 hover:bg-white/10 text-white/40 hover:text-white/80 transition-all"
      >
        {copied ? <Check size={14} className="text-emerald-400" /> : <Copy size={14} />}
      </button>

      {!highlighter && (
        <div className="absolute inset-0 flex items-center justify-center bg-black/20 z-20">
          <Loader2 className="w-5 h-5 text-indigo-500 animate-spin" />
        </div>
      )}

      {/* Main Scroll Container */}
      <div className="absolute inset-0 overflow-auto scrollbar-custom" ref={containerRef}>
        {/* Sizing box: grows with the textarea */}
        <div className="relative inline-block min-w-full">
          
          {/* Highlighting Layer */}
          <div
            className="absolute inset-0 pointer-events-none p-5 text-[12px] font-mono leading-relaxed whitespace-pre"
            dangerouslySetInnerHTML={{ __html: html }}
          />

          {/* Input Layer */}
          <textarea
            ref={textareaRef}
            value={value}
            onChange={(e) => onChange(e.target.value)}
            onKeyDown={handleKeyDown}
            spellCheck={false}
            wrap="off" // Critical: stops browser from wrapping text
            className="relative block bg-transparent p-5 text-[12px] font-mono leading-relaxed text-transparent caret-white focus:outline-none resize-none border-none overflow-hidden whitespace-pre"
            style={{ 
              fontFamily: 'ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, "Liberation Mono", "Courier New", font-mono',
            }}
          />
        </div>
      </div>
    </div>
  );
};