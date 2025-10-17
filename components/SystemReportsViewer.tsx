import React, { useState } from 'react';
import { systemStatusReport } from '../services/systemStatusReport';
import { systemTimelineReport } from '../services/systemTimelineReport';

const MarkdownRenderer = ({ content }: { content: string }) => {
  const lines = content.split('\n');
  return (
    <div className="prose prose-sm prose-slate prose-invert max-w-none text-slate-300 space-y-2">
      {lines.map((line, index) => {
        if (line.startsWith('## ')) return <h2 key={index} className="text-lg font-bold text-purple-300 border-b border-slate-700 pb-1 mt-4">{line.substring(3)}</h2>;
        if (line.startsWith('# ')) return <h1 key={index} className="text-xl font-bold text-cyan-300 border-b-2 border-cyan-500 pb-2 mb-4">{line.substring(2)}</h1>;
        if (line.startsWith('- ')) return <li key={index} className="ml-4 list-disc">{line.substring(2)}</li>;
        
        if (line.trim().startsWith('|') && line.trim().endsWith('|')) {
            const isHeader = lines[index + 1]?.includes('---');
            const cells = line.split('|').slice(1, -1).map(c => c.trim());
            return (
                <div key={index} className={`grid gap-4 items-start border-b border-slate-800 py-2 ${isHeader ? 'font-bold text-slate-400 text-xs uppercase' : 'text-sm'}`} style={{ gridTemplateColumns: `repeat(${cells.length}, minmax(0, 1fr))`}}>
                    {cells.map((cell, i) => <div key={i} className="whitespace-pre-wrap break-words">{cell}</div>)}
                </div>
            )
        }
        if (line.includes('---') && lines[index-1]?.trim().startsWith('|')) {
            return null; // Don't render markdown table separator
        }

        return <p key={index}>{line || '\u00A0'}</p>;
      })}
    </div>
  );
};


const SystemReportsViewer: React.FC = () => {
  const [activeTab, setActiveTab] = useState<'status' | 'timeline'>('status');

  return (
    <div className="h-full flex flex-col">
      <div className="flex border-b border-slate-700 mb-2 flex-shrink-0">
        <button
          onClick={() => setActiveTab('status')}
          className={`px-3 py-1.5 text-xs font-semibold focus:outline-none transition-colors ${activeTab === 'status' ? 'text-purple-300 border-b-2 border-purple-400' : 'text-slate-400 hover:text-slate-200'}`}
        >
          System Status
        </button>
        <button
          onClick={() => setActiveTab('timeline')}
          className={`px-3 py-1.5 text-xs font-semibold focus:outline-none transition-colors ${activeTab === 'timeline' ? 'text-purple-300 border-b-2 border-purple-400' : 'text-slate-400 hover:text-slate-200'}`}
        >
          Activity Timeline
        </button>
      </div>
      <div className="flex-grow overflow-y-auto pr-2 scrollbar-thin scrollbar-thumb-slate-700 scrollbar-track-slate-800">
        {activeTab === 'status' && <MarkdownRenderer content={systemStatusReport} />}
        {activeTab === 'timeline' && <MarkdownRenderer content={systemTimelineReport} />}
      </div>
    </div>
  );
};

export default SystemReportsViewer;