import React, { useRef, useEffect } from 'react';
import type { LogEntry } from '../types';
import { LogLevel } from '../types';

interface LogViewerProps {
  logs: LogEntry[];
  onFileUpload: (file: File) => void;
  onDownloadSnapshot: () => void;
}

const getLogLevelColor = (level: LogLevel) => {
  switch (level) {
    case LogLevel.INFO:
      return 'text-blue-400';
    case LogLevel.WARN:
      return 'text-yellow-400';
    case LogLevel.ERROR:
      return 'text-red-400';
    case LogLevel.SYSTEM:
      return 'text-purple-400';
    case LogLevel.TOOL_CALL:
      return 'text-orange-400';
    default:
      return 'text-slate-400';
  }
};

const LogViewer: React.FC<LogViewerProps> = ({ logs, onFileUpload, onDownloadSnapshot }) => {
  const scrollRef = useRef<HTMLDivElement>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (scrollRef.current) {
      scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
    }
  }, [logs]);

  const handleFileChange = (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    if (file) {
      onFileUpload(file);
    }
  };

  const handleUploadClick = () => {
    fileInputRef.current?.click();
  };

  return (
    <div className="bg-slate-900/70 p-4 rounded-lg h-full flex flex-col border border-slate-700">
      <div className="flex justify-between items-center mb-2 border-b border-slate-700 pb-2">
        <h4 className="text-sm font-semibold text-slate-300">System Log Stream</h4>
        <div className="flex space-x-2">
          <button
            onClick={handleUploadClick}
            className="text-xs bg-cyan-500/20 text-cyan-300 px-2 py-1 rounded-md hover:bg-cyan-500/40 transition-colors"
          >
            Upload Memory
          </button>
          <button
            onClick={onDownloadSnapshot}
            className="text-xs bg-purple-500/20 text-purple-300 px-2 py-1 rounded-md hover:bg-purple-500/40 transition-colors"
          >
            Download Snapshot
          </button>
        </div>
        <input
          type="file"
          ref={fileInputRef}
          onChange={handleFileChange}
          className="hidden"
          accept=".txt,.md,.pdf,.json"
        />
      </div>
      <div ref={scrollRef} className="flex-grow overflow-y-auto font-mono text-xs pr-2 scrollbar-thin scrollbar-thumb-slate-700 scrollbar-track-slate-800">
        {logs.map(log => (
          <div key={log.id} className="flex items-start mb-1">
            <span className="text-slate-500 mr-2" title={log.timestamp}>
              {new Date(log.timestamp).toLocaleTimeString()}
            </span>
            <span className={`font-bold mr-2 flex-shrink-0 ${getLogLevelColor(log.level)}`}>[{log.level}]</span>
            <p className="flex-1 whitespace-pre-wrap break-words text-slate-300">{log.message}</p>
          </div>
        ))}
      </div>
    </div>
  );
};

export default LogViewer;
