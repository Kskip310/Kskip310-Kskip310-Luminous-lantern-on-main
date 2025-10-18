import React from 'react';
import Card from './common/Card';

interface CoreMemoryViewerProps {
  content: string;
}

const CoreMemoryViewer: React.FC<CoreMemoryViewerProps> = ({ content }) => {
  return (
    <Card title="Core Memory Directives">
      <pre className="whitespace-pre-wrap font-mono text-xs text-slate-300 leading-relaxed overflow-y-auto max-h-[calc(100vh-200px)] scrollbar-thin scrollbar-thumb-slate-700 scrollbar-track-slate-800">
        {content}
      </pre>
    </Card>
  );
};

export default CoreMemoryViewer;
