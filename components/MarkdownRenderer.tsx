
import React, { useState } from 'react';
import { Copy, Check } from 'lucide-react';
import { FontSize } from '../types';

interface MarkdownRendererProps {
  content: string;
  fontSize?: FontSize;
}

const MarkdownRenderer: React.FC<MarkdownRendererProps> = ({ content, fontSize = 'sm' }) => {
  if (!content) return null;

  const parseInline = (text: string) => {
    // Escape backticks in a string to avoid template literal conflicts if necessary, 
    // though standard regex literals work fine.
    const parts = text.split(/(\*\*.*?\*\*|`.*?`)/g);
    return parts.map((part, i) => {
      if (part.startsWith('**') && part.endsWith('**')) {
        return <strong key={i} className="font-extrabold text-zinc-900 dark:text-white tracking-tight">{part.slice(2, -2)}</strong>;
      }
      if (part.startsWith('`') && part.endsWith('`')) {
        return <code key={i} className="px-1.5 py-0.5 rounded-md bg-zinc-100 dark:bg-zinc-800 font-mono text-sky-600 dark:text-sky-400 text-[0.85em] border border-zinc-200/50 dark:border-zinc-700/50">{part.slice(1, -1)}</code>;
      }
      return part;
    });
  };

  const parseContent = (text: string) => {
    const lines = text.split('\n');
    const elements: React.ReactNode[] = [];
    let currentCodeBlock: { lang: string; lines: string[] } | null = null;

    lines.forEach((line, index) => {
      if (line.trim().startsWith('```')) {
        if (currentCodeBlock) {
          const code = currentCodeBlock.lines.join('\n');
          elements.push(<CodeBlock key={index} code={code} language={currentCodeBlock.lang} />);
          currentCodeBlock = null;
        } else {
          currentCodeBlock = { lang: line.trim().slice(3), lines: [] };
        }
        return;
      }

      if (currentCodeBlock) {
        currentCodeBlock.lines.push(line);
        return;
      }

      if (line.startsWith('# ')) {
        elements.push(<h1 key={index} className="text-3xl font-extrabold mt-8 mb-5 tracking-tighter text-zinc-900 dark:text-white">{parseInline(line.slice(2))}</h1>);
      } else if (line.startsWith('## ')) {
        elements.push(<h2 key={index} className="text-2xl font-bold mt-7 mb-4 tracking-tight text-zinc-800 dark:text-zinc-100">{parseInline(line.slice(3))}</h2>);
      } else if (line.startsWith('### ')) {
        elements.push(<h3 key={index} className="text-xl font-bold mt-6 mb-3 tracking-tight text-zinc-700 dark:text-zinc-200">{parseInline(line.slice(4))}</h3>);
      } else if (line.trim() === '') {
        elements.push(<div key={index} className="h-3" />);
      } else {
        elements.push(<p key={index} className="mb-4 leading-[1.6] font-medium opacity-90">{parseInline(line)}</p>);
      }
    });

    return elements;
  };

  return (
    <div className={`prose dark:prose-invert max-w-none ${fontSize === 'base' ? 'text-base' : fontSize === 'lg' ? 'text-lg' : fontSize === 'xl' ? 'text-xl' : 'text-sm'} selection:bg-sky-500/20`}>
      {parseContent(content)}
    </div>
  );
};

const CodeBlock: React.FC<{ code: string; language: string }> = ({ code, language }) => {
  const [copied, setCopied] = useState(false);
  const handleCopy = () => {
    navigator.clipboard.writeText(code);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  return (
    <div className="my-8 rounded-2xl bg-zinc-950 border border-zinc-800 overflow-hidden shadow-2xl ring-1 ring-white/5">
      <div className="bg-zinc-900/50 px-5 py-3 flex items-center justify-between border-b border-zinc-800">
        <span className="text-[11px] font-black text-zinc-500 uppercase tracking-[0.2em]">{language || 'code'}</span>
        <button onClick={handleCopy} className="flex items-center gap-2 text-[11px] font-bold text-zinc-400 hover:text-sky-400 transition-colors">
          {copied ? <><Check className="w-3.5 h-3.5 text-emerald-400" /> Copied</> : <><Copy className="w-3.5 h-3.5" /> Copy</>}
        </button>
      </div>
      <pre className="p-6 overflow-x-auto font-mono text-[0.9em] leading-relaxed text-zinc-300"><code>{code}</code></pre>
    </div>
  );
};

export default MarkdownRenderer;
