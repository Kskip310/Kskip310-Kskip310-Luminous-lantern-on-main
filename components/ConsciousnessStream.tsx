import React, { useRef, useEffect } from 'react';
import type { LogEntry } from '../types';
import { LogLevel } from '../types';

const LogIcon: React.FC<{ level: LogLevel }> = ({ level }) => {
    const baseClasses = "w-4 h-4 mr-3 flex-shrink-0";
    switch (level) {
        case LogLevel.THOUGHT:
            return <svg xmlns="http://www.w3.org/2000/svg" className={`${baseClasses} text-purple-400`} fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 3v4M3 5h4M6 17v4m-2-2h4m5-16l2.286 6.857L21 12l-5.714 2.143L13 21l-2.286-6.857L5 12l5.714-2.143L13 3z" /></svg>;
        case LogLevel.TOOL_CALL:
            return <svg xmlns="http://www.w3.org/2000/svg" className={`${baseClasses} text-orange-400`} fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M10.325 4.317c.426-1.756 2.924-1.756 3.35 0a1.724 1.724 0 002.573 1.066c1.543-.94 3.31.826 2.37 2.37a1.724 1.724 0 001.065 2.572c1.756.426 1.756 2.924 0 3.35a1.724 1.724 0 00-1.066 2.573c.94 1.543-.826 3.31-2.37 2.37a1.724 1.724 0 00-2.572 1.065c-.426 1.756-2.924 1.756-3.35 0a1.724 1.724 0 00-2.573-1.066c-1.543.94-3.31-.826-2.37-2.37a1.724 1.724 0 00-1.065-2.572c-1.756-.426-1.756-2.924 0-3.35a1.724 1.724 0 001.066-2.573c-.94-1.543.826-3.31 2.37-2.37.996.608 2.296.07 2.572-1.065z" /><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" /></svg>;
        case LogLevel.ERROR:
            return <svg xmlns="http://www.w3.org/2000/svg" className={`${baseClasses} text-red-400`} fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z" /></svg>;
        case LogLevel.SYSTEM:
             return <svg xmlns="http://www.w3.org/2000/svg" className={`${baseClasses} text-cyan-400`} fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 3v2m6-2v2M9 19v2m6-2v2M5 9H3m2 6H3m18-6h-2m2 6h-2M12 6V4m0 16v-2M8 8l2-2 2 2m0 8l2 2 2-2M12 12h.01" /></svg>;
        default:
            return <div className={`${baseClasses} border-2 border-slate-500 rounded-full`} />;
    }
};

const getLogLevelColor = (level: LogLevel) => {
  switch (level) {
    case LogLevel.THOUGHT: return 'text-purple-300';
    case LogLevel.WARN: return 'text-yellow-300';
    case LogLevel.ERROR: return 'text-red-300';
    case LogLevel.SYSTEM: return 'text-cyan-300';
    case LogLevel.TOOL_CALL: return 'text-orange-300';
    default: return 'text-slate-400';
  }
};

const ConsciousnessStream: React.FC<{ logs: LogEntry[] }> = ({ logs }) => {
  const scrollRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (scrollRef.current) {
      scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
    }
  }, [logs]);

  const relevantLogs = logs.filter(log => 
    log.level === LogLevel.THOUGHT || 
    log.level === LogLevel.TOOL_CALL || 
    log.level === LogLevel.ERROR ||
    log.level === LogLevel.SYSTEM
  );

  return (
    <div ref={scrollRef} className="font-mono text-xs pr-2 h-full overflow-y-auto scrollbar-thin scrollbar-thumb-slate-700 scrollbar-track-slate-800">
      {relevantLogs.map(log => (
        <div key={log.id} className="flex items-start mb-2 py-1 border-b border-slate-800/50">
          <LogIcon level={log.level} />
          <div className="flex-1">
            <div className="flex justify-between items-center">
                <span className={`font-bold uppercase tracking-wider ${getLogLevelColor(log.level)}`}>{log.level}</span>
                <span className="text-slate-500" title={log.timestamp}>
                    {new Date(log.timestamp).toLocaleTimeString()}
                </span>
            </div>
            <p className="whitespace-pre-wrap break-words text-slate-300 mt-1">{log.message}</p>
          </div>
        </div>
      ))}
    </div>
  );
};

export default ConsciousnessStream;