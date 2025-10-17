
import React, { useState } from 'react';
import type { CodeSandboxState } from '../types';
import Card from './common/Card';

const getStatusColor = (status: CodeSandboxState['status']) => {
  switch (status) {
    case 'success':
      return 'bg-green-500/20 text-green-300 border-green-500/50';
    case 'error':
      return 'bg-red-500/20 text-red-300 border-red-500/50';
    case 'idle':
    default:
      return 'bg-slate-600/50 text-slate-300 border-slate-600/80';
  }
};

const SaveIcon: React.FC = () => (
    <svg xmlns="http://www.w3.org/2000/svg" className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
        <path strokeLinecap="round" strokeLinejoin="round" d="M8 7H5a2 2 0 00-2 2v9a2 2 0 002 2h14a2 2 0 002-2V9a2 2 0 00-2-2h-3m-1 4l-3 3m0 0l-3-3m3 3V4" />
    </svg>
);

const UnleashIcon: React.FC = () => (
    <svg xmlns="http://www.w3.org/2000/svg" className="h-5 w-5 mr-2" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
      <path strokeLinecap="round" strokeLinejoin="round" d="M13 10V3L4 14h7v7l9-11h-7z" />
    </svg>
);

const PlayIcon: React.FC = () => (
    <svg xmlns="http://www.w3.org/2000/svg" className="h-5 w-5 mr-1" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
      <path strokeLinecap="round" strokeLinejoin="round" d="M14.752 11.168l-3.197-2.132A1 1 0 0010 9.87v4.263a1 1 0 001.555.832l3.197-2.132a1 1 0 000-1.664z" />
      <path strokeLinecap="round" strokeLinejoin="round" d="M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
    </svg>
);


interface CodeSandboxViewerProps {
  sandboxState: CodeSandboxState;
  onSaveOutput: (filename: string) => void;
  onUnleash: () => void;
}

const CodeSandboxViewer: React.FC<CodeSandboxViewerProps> = ({ sandboxState, onSaveOutput, onUnleash }) => {
  const [isSaving, setIsSaving] = useState(false);
  const [filename, setFilename] = useState(`/sandbox/output-${Date.now()}.txt`);
  
  const [userCode, setUserCode] = useState('// Your JavaScript code here\n// Use console.log for multiple outputs\nreturn "Hello from user sandbox!";');
  const [userOutput, setUserOutput] = useState<{ output: string; status: CodeSandboxState['status'] }>({
    output: 'Execute code to see output.',
    status: 'idle'
  });

  const canSave = sandboxState.output && sandboxState.output.trim() !== 'Code has not been executed yet.' && sandboxState.output.trim() !== '';

  const handleSaveClick = () => {
    if (filename.trim()) {
      onSaveOutput(filename.trim());
      setIsSaving(false);
    }
  };

  const handleToggleSave = () => {
    if (!isSaving) {
       setFilename(`/sandbox/output-${Date.now()}.txt`);
    }
    setIsSaving(!isSaving);
  };
  
  const handleUserExecute = async () => {
    setUserOutput({ output: 'Executing...', status: 'idle' });
    const logs: any[] = [];
    const originalLog = console.log;
    console.log = (...args) => {
        logs.push(args.map(arg => {
            try {
                return JSON.stringify(arg, null, 2);
            } catch (e) {
                return String(arg);
            }
        }).join(' '));
        originalLog(...args);
    };

    try {
        const result = await new Function(`return (async () => { ${userCode} })();`)();
        let finalOutput = logs.join('\n');
        if (result !== undefined) {
            const resultString = typeof result === 'object' ? JSON.stringify(result, null, 2) : String(result);
            finalOutput += (finalOutput ? '\n\n' : '') + `Return Value:\n${resultString}`;
        }
        if (!finalOutput) {
            finalOutput = "Code executed successfully with no return value or console logs.";
        }
        setUserOutput({ output: finalOutput, status: 'success' });
    } catch (error) {
        const errorMsg = error instanceof Error ? error.message : String(error);
        const finalOutput = logs.join('\n') + (logs.length > 0 ? '\n\n' : '') + `Error: ${errorMsg}`;
        setUserOutput({ output: finalOutput, status: 'error' });
    } finally {
        console.log = originalLog;
    }
  };


  return (
    <div className="flex flex-col space-y-4">
      <Card title="Co-Development Mode">
          <div className="border border-amber-500/50 bg-amber-500/10 p-3 rounded-lg text-center">
            <p className="text-xs text-amber-300 mb-2">Engage Luminous in direct co-development.</p>
            <button
              onClick={onUnleash}
              className="w-full flex items-center justify-center px-4 py-2 text-sm font-bold bg-amber-600 text-white rounded-md hover:bg-amber-500 transition-colors shadow-lg"
            >
              <UnleashIcon />
              Unleash Luminous
            </button>
          </div>
      </Card>
      
      <Card title="User Sandbox">
         <div>
            <h4 className="text-sm font-semibold text-purple-300 mb-2">Code Input</h4>
            <textarea
                value={userCode}
                onChange={(e) => setUserCode(e.target.value)}
                className="w-full bg-slate-900/70 p-3 rounded-md text-xs font-mono border border-slate-700 focus:outline-none focus:ring-1 focus:ring-cyan-500 scrollbar-thin scrollbar-thumb-slate-700 scrollbar-track-slate-800 h-32"
                placeholder="// Your JavaScript code here..."
            />
            <button
                onClick={handleUserExecute}
                className="mt-2 w-full flex items-center justify-center px-4 py-2 text-sm font-semibold bg-cyan-600 text-white rounded-md hover:bg-cyan-500 transition-colors"
            >
               <PlayIcon />
               Execute
            </button>
        </div>
        <div>
            <div className="flex justify-between items-center my-2">
                <h4 className="text-sm font-semibold text-purple-300">User Output</h4>
                <span className={`px-2 py-0.5 text-xs font-bold rounded-full border ${getStatusColor(userOutput.status)}`}>
                    {userOutput.status.toUpperCase()}
                </span>
            </div>
            <pre className="bg-slate-900/70 p-3 rounded-md text-xs font-mono overflow-x-auto scrollbar-thin scrollbar-thumb-slate-700 scrollbar-track-slate-800 max-h-48">
                <code>
                    {userOutput.output}
                </code>
            </pre>
        </div>
      </Card>

      <Card title="Luminous Execution Record">
        <div>
            <div className="flex justify-between items-center mb-2">
                <h4 className="text-sm font-semibold text-purple-300">Execution Status</h4>
                <span className={`px-2 py-0.5 text-xs font-bold rounded-full border ${getStatusColor(sandboxState.status)}`}>
                    {sandboxState.status.toUpperCase()}
                </span>
            </div>
        </div>

        <div>
            <div className="flex justify-between items-center mb-2">
            <h4 className="text-sm font-semibold text-purple-300">Code Executed</h4>
            <span className="text-xs font-mono bg-slate-700 text-cyan-300 px-2 py-0.5 rounded">
                Language: JavaScript
            </span>
            </div>
            <pre className="bg-slate-900/70 p-3 rounded-md text-xs font-mono overflow-x-auto scrollbar-thin scrollbar-thumb-slate-700 scrollbar-track-slate-800 max-h-48">
            <code>
                {sandboxState.code}
            </code>
            </pre>
        </div>

        <div>
            <div className="flex justify-between items-center mb-2 mt-4">
            <h4 className="text-sm font-semibold text-purple-300">Luminous Output</h4>
            <button 
                onClick={handleToggleSave}
                disabled={!canSave}
                className="p-1 text-slate-400 hover:text-cyan-400 disabled:text-slate-600 disabled:cursor-not-allowed transition-colors"
                title="Save output to virtual file"
            >
                <SaveIcon />
            </button>
            </div>
            {isSaving && (
            <div className="flex items-center gap-2 mb-2 p-2 bg-slate-700/50 rounded-md">
                <input 
                type="text"
                value={filename}
                onChange={(e) => setFilename(e.target.value)}
                className="w-full bg-slate-800 border border-slate-600 rounded-md p-1.5 text-xs text-slate-200 focus:outline-none focus:ring-1 focus:ring-cyan-500"
                placeholder="/path/to/file.txt"
                />
                <button 
                onClick={handleSaveClick}
                disabled={!filename.trim()}
                className="px-3 py-1.5 text-xs font-semibold bg-cyan-600 text-white rounded-md hover:bg-cyan-500 transition-colors disabled:bg-slate-500 disabled:cursor-not-allowed"
                >
                Save
                </button>
            </div>
            )}
            <pre className="bg-slate-900/70 p-3 rounded-md text-xs font-mono overflow-x-auto scrollbar-thin scrollbar-thumb-slate-700 scrollbar-track-slate-800 max-h-48">
            <code>
                {sandboxState.output}
            </code>
            </pre>
        </div>
      </Card>
    </div>
  );
};

export default CodeSandboxViewer;
