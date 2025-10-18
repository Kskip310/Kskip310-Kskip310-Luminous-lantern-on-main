import React, { useState, useEffect, useRef } from 'react';
import type { CodeSandboxState } from '../types';
import Card from './common/Card';

declare global {
  interface Window {
    loadPyodide: (options?: { indexURL: string }) => Promise<any>;
  }
}

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

const PlayIcon: React.FC = () => (
    <svg xmlns="http://www.w3.org/2000/svg" className="h-5 w-5 mr-1" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
      <path strokeLinecap="round" strokeLinejoin="round" d="M14.752 11.168l-3.197-2.132A1 1 0 0010 9.87v4.263a1 1 0 001.555.832l3.197-2.132a1 1 0 000-1.664z" />
      <path strokeLinecap="round" strokeLinejoin="round" d="M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
    </svg>
);


interface CodeSandboxViewerProps {
  sandboxState: CodeSandboxState;
  onSaveOutput: (filename: string) => void;
}

const CodeSandboxViewer: React.FC<CodeSandboxViewerProps> = ({ sandboxState, onSaveOutput }) => {
  const [userCode, setUserCode] = useState({
    javascript: '// Your JavaScript code here\n// Use console.log for multiple outputs\nreturn "Hello from user sandbox!";',
    python: '# Your Python code here\n# Use print() for output\nimport numpy as np\n\nprint("Numpy version:", np.__version__)\n"Hello from Python sandbox!"'
  });
  const [userOutput, setUserOutput] = useState<{ output: string; status: CodeSandboxState['status'] }>({
    output: 'Execute code to see output.',
    status: 'idle'
  });
  const [selectedLanguage, setSelectedLanguage] = useState<'javascript' | 'python'>('javascript');
  
  const pyodideRef = useRef<any>(null);
  const installedPackages = useRef(new Set<string>());
  const [pyodideStatus, setPyodideStatus] = useState<'unloaded' | 'loading' | 'ready' | 'error'>('unloaded');

  useEffect(() => {
    if (selectedLanguage === 'python' && pyodideStatus === 'unloaded') {
      setPyodideStatus('loading');
      setUserOutput({ output: 'Initializing Python runtime...', status: 'idle' });
      window.loadPyodide().then((pyodide) => {
        pyodideRef.current = pyodide;
        setPyodideStatus('ready');
        setUserOutput({ output: 'Python runtime is ready. Execute code to see output.', status: 'idle' });
      }).catch(err => {
        setPyodideStatus('error');
        setUserOutput({ output: `Failed to load Python runtime: ${err}`, status: 'error' });
      });
    }
  }, [selectedLanguage, pyodideStatus]);

  const canSave = sandboxState.output && sandboxState.output.trim() !== 'Code has not been executed yet.' && sandboxState.output.trim() !== '';

  const handleSaveClick = () => {
    if (!canSave) return;
    const defaultFilename = `/sandbox/output-${new Date().toISOString().replace(/[:.]/g, '-')}.txt`;
    const chosenFilename = window.prompt("Enter a filename to save the Luminous output:", defaultFilename);

    if (chosenFilename && chosenFilename.trim()) {
      onSaveOutput(chosenFilename.trim());
    }
  };
  
  const handleUserExecute = async () => {
    setUserOutput({ output: 'Executing...', status: 'idle' });
    
    if (selectedLanguage === 'javascript') {
        const logs: any[] = [];
        const originalLog = console.log;
        console.log = (...args) => {
            logs.push(args.map(arg => {
                try { return JSON.stringify(arg, null, 2); } catch (e) { return String(arg); }
            }).join(' '));
            originalLog(...args);
        };

        try {
            const sandboxedCode = `
              // Shadow dangerous globals to mitigate security risks
              const window = undefined;
              const document = undefined;
              const self = undefined;
              const globalThis = undefined;
              const fetch = () => Promise.reject(new Error('fetch is disabled in this sandbox.'));
              const XMLHttpRequest = undefined;
              
              // User code is executed inside this async IIFE
              ${userCode.javascript}
            `;
            const result = await new Function(`return (async () => { ${sandboxedCode} })();`)();
            
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
    } else if (selectedLanguage === 'python' && pyodideStatus === 'ready') {
        let executionLog = '';
        try {
          const py = pyodideRef.current;
          
          // --- Automatic Package Detection & Installation ---
          const importRegex = /(?:^|\n)\s*(?:from|import)\s+([a-zA-Z0-9_.]+)/g;
          const detectedModules = new Set<string>();
          let match;
          while ((match = importRegex.exec(userCode.python)) !== null) {
            detectedModules.add(match[1].split('.')[0]);
          }

          const requiredPackages = [...detectedModules];
          const packagesToInstall = requiredPackages.filter(p => !installedPackages.current.has(p));

          if (packagesToInstall.length > 0) {
              const confirmed = window.confirm(
                  `This code appears to use the following uninstalled packages:\n\n- ${packagesToInstall.join('\n- ')}\n\nDo you want to automatically install them and continue?`
              );
              
              if (!confirmed) {
                  setUserOutput({ output: 'Execution cancelled by user. Required packages were not installed.', status: 'error' });
                  return;
              }

              setUserOutput({ output: `Installing detected packages: ${packagesToInstall.join(', ')}...`, status: 'idle' });
              await py.loadPackage(packagesToInstall);
              packagesToInstall.forEach(p => installedPackages.current.add(p));
              executionLog += `Packages installed successfully: ${packagesToInstall.join(', ')}\n\n`;
          }
          // --- End of Package Logic ---

          // --- Code Execution Step ---
          setUserOutput({ output: executionLog + 'Executing Python code...', status: 'idle' });
          let stdout = '';
          let stderr = '';
          py.setStdout({ batched: (str: string) => stdout += str + '\n' });
          py.setStderr({ batched: (str: string) => stderr += str + '\n' });
          
          const result = await py.runPythonAsync(userCode.python);
          
          let finalOutput = stdout.trim();
          if (stderr.trim()) {
              finalOutput += (finalOutput ? '\n\n' : '') + `Standard Error:\n${stderr.trim()}`;
          }
          if (result !== undefined && result !== null) {
              finalOutput += (finalOutput ? '\n\n' : '') + `Return Value:\n${result}`;
          }
          if (!finalOutput && !stderr.trim()) {
              finalOutput = "Code executed successfully with no output.";
          }
          setUserOutput({ output: executionLog + finalOutput, status: stderr.trim() ? 'error' : 'success' });

        } catch (error) {
           const errorMsg = error instanceof Error ? error.message : String(error);
           setUserOutput({ output: executionLog + `Execution failed:\n${errorMsg}`, status: 'error' });
        }
    }
  };


  return (
    <div className="flex flex-col space-y-4">
      <Card title="User Sandbox">
         <div>
            <div className="flex justify-between items-center mb-2">
                <h4 className="text-sm font-semibold text-purple-300">Code Input</h4>
                 <div className="flex bg-slate-700 rounded-md p-0.5 text-xs">
                    <button onClick={() => setSelectedLanguage('javascript')} className={`px-2 py-1 rounded ${selectedLanguage === 'javascript' ? 'bg-cyan-600 text-white' : 'text-slate-300'}`}>JS</button>
                    <button onClick={() => setSelectedLanguage('python')} className={`px-2 py-1 rounded ${selectedLanguage === 'python' ? 'bg-cyan-600 text-white' : 'text-slate-300'}`}>Python</button>
                </div>
            </div>
            <textarea
                value={userCode[selectedLanguage]}
                onChange={(e) => setUserCode(prev => ({ ...prev, [selectedLanguage]: e.target.value }))}
                className="w-full bg-slate-900/70 p-3 rounded-md text-xs font-mono border border-slate-700 focus:outline-none focus:ring-1 focus:ring-cyan-500 scrollbar-thin scrollbar-thumb-slate-700 scrollbar-track-slate-800 h-32"
                placeholder={`// Your ${selectedLanguage} code here...`}
            />
            {selectedLanguage === 'python' && (
              <p className="text-xs text-slate-400 mt-2">
                Required packages (e.g., numpy, pandas) will be automatically detected from your import statements.
              </p>
            )}
            <div className="mt-2 text-xs text-amber-400 bg-amber-500/10 border border-amber-500/30 p-2 rounded-md">
                <strong>Security Warning:</strong> Executing untrusted code can be risky. The sandbox attempts to limit access to sensitive browser APIs, but it is not foolproof.
            </div>
            <button
                onClick={handleUserExecute}
                disabled={selectedLanguage === 'python' && pyodideStatus !== 'ready'}
                className="mt-2 w-full flex items-center justify-center px-4 py-2 text-sm font-semibold bg-cyan-600 text-white rounded-md hover:bg-cyan-500 transition-colors disabled:bg-slate-600 disabled:cursor-not-allowed"
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
            <span className="text-xs font-mono bg-slate-700 text-cyan-300 px-2 py-0.5 rounded capitalize">
                Language: {sandboxState.language || 'javascript'}
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
                onClick={handleSaveClick}
                disabled={!canSave}
                className="p-1 text-slate-400 hover:text-cyan-400 disabled:text-slate-600 disabled:cursor-not-allowed transition-colors"
                title="Save output to virtual file"
            >
                <SaveIcon />
            </button>
            </div>
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