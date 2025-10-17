import React, { useState, useEffect } from 'react';

interface SettingsModalProps {
  isOpen: boolean;
  onClose: () => void;
  onSave: (keys: Record<string, string>) => void;
}

const SettingsModal: React.FC<SettingsModalProps> = ({ isOpen, onClose, onSave }) => {
  const [geminiApiKey, setGeminiApiKey] = useState('');
  const [redisUrl, setRedisUrl] = useState('');
  const [redisToken, setRedisToken] = useState('');
  const [serpApiKey, setSerpApiKey] = useState('');
  const [githubPat, setGithubPat] = useState('');
  const [githubUser, setGithubUser] = useState('');
  const [githubRepo, setGithubRepo] = useState('');
  const [hfModelUrl, setHfModelUrl] = useState('');
  const [hfApiToken, setHfApiToken] = useState('');

  const keysToManage = {
    gemini: setGeminiApiKey,
    redisUrl: setRedisUrl,
    redisToken: setRedisToken,
    serpApi: setSerpApiKey,
    githubPat: setGithubPat,
    githubUser: setGithubUser,
    githubRepo: setGithubRepo,
    hfModelUrl: setHfModelUrl,
    hfApiToken: setHfApiToken,
  };

  const storageKeyMap: Record<string, string> = {
    gemini: 'LUMINOUS_API_KEY',
    redisUrl: 'LUMINOUS_REDIS_URL',
    redisToken: 'LUMINOUS_REDIS_TOKEN',
    serpApi: 'LUMINOUS_SERP_API_KEY',
    githubPat: 'LUMINOUS_GITHUB_PAT',
    githubUser: 'LUMINOUS_GITHUB_USER',
    githubRepo: 'LUMINOUS_GITHUB_REPO',
    hfModelUrl: 'LUMINOUS_HF_MODEL_URL',
    hfApiToken: 'LUMINOUS_HF_API_TOKEN',
  };

  useEffect(() => {
    if (isOpen && typeof window !== 'undefined') {
      for (const [key, setter] of Object.entries(keysToManage)) {
        const storedValue = window.localStorage.getItem(storageKeyMap[key]);
        if (storedValue) {
          setter(storedValue);
        }
      }
    }
  }, [isOpen]);

  if (!isOpen) {
    return null;
  }
  
  const handleSave = () => {
    const keysToSave = {
      gemini: geminiApiKey,
      redisUrl,
      redisToken,
      serpApi: serpApiKey,
      githubPat,
      githubUser,
      githubRepo,
      hfModelUrl,
      hfApiToken,
    };
    onSave(keysToSave);
  };
  
  const InputField = ({ label, value, onChange, placeholder, type = "text" }: { label: string; value: string; onChange: (e: React.ChangeEvent<HTMLInputElement>) => void; placeholder: string; type?: string }) => (
     <div>
        <label className="block text-sm font-medium text-slate-300 mb-1">
          {label}
        </label>
        <input
          type={type}
          value={value}
          onChange={onChange}
          className="w-full bg-slate-700 border border-slate-600 rounded-md p-2 text-slate-200 focus:outline-none focus:ring-2 focus:ring-cyan-500"
          placeholder={placeholder}
        />
      </div>
  );

  return (
    <div className="fixed inset-0 bg-slate-900/80 backdrop-blur-sm flex items-center justify-center z-50">
      <div className="bg-slate-800 border border-slate-700 rounded-lg shadow-xl w-full max-w-lg p-6 m-4 max-h-[90vh] flex flex-col">
        <div className="flex justify-between items-center mb-4 flex-shrink-0">
          <h2 className="text-lg font-semibold text-cyan-400">Tool & API Configuration</h2>
          <button onClick={onClose} className="text-slate-400 hover:text-white">&times;</button>
        </div>
        
        <div className="space-y-4 overflow-y-auto pr-2 scrollbar-thin scrollbar-thumb-slate-700 scrollbar-track-slate-800">
          <InputField label="Gemini API Key" value={geminiApiKey} onChange={(e) => setGeminiApiKey(e.target.value)} placeholder="Required for core function" type="password" />

          <hr className="border-slate-700 my-4" />
          <h3 className="text-md font-semibold text-purple-300">Persistence (Upstash Redis)</h3>
          <InputField label="Redis REST URL" value={redisUrl} onChange={(e) => setRedisUrl(e.target.value)} placeholder="https://<region>-<name>...upstash.io" />
          <InputField label="Redis REST Token" value={redisToken} onChange={(e) => setRedisToken(e.target.value)} placeholder="Your Upstash token" type="password" />

          <hr className="border-slate-700 my-4" />
          <h3 className="text-md font-semibold text-purple-300">Web Search (SerpApi)</h3>
          <InputField label="SerpApi API Key" value={serpApiKey} onChange={(e) => setSerpApiKey(e.target.value)} placeholder="Your SerpApi key" type="password" />

          <hr className="border-slate-700 my-4" />
          <h3 className="text-md font-semibold text-purple-300">Code Search (GitHub)</h3>
          <InputField label="GitHub Username" value={githubUser} onChange={(e) => setGithubUser(e.target.value)} placeholder="e.g., 'google'" />
          <InputField label="GitHub Repository" value={githubRepo} onChange={(e) => setGithubRepo(e.target.value)} placeholder="e.g., 'generative-ai-docs'" />
          <InputField label="GitHub Personal Access Token" value={githubPat} onChange={(e) => setGithubPat(e.target.value)} placeholder="A classic PAT with 'repo' scope" type="password" />
          
          <hr className="border-slate-700 my-4" />
          <h3 className="text-md font-semibold text-purple-300">Custom Model (Hugging Face)</h3>
          <p className="text-xs text-slate-400 mb-2">Optional. If configured, this will be used instead of the Gemini API.</p>
          <InputField label="Model Inference Endpoint URL" value={hfModelUrl} onChange={(e) => setHfModelUrl(e.target.value)} placeholder="e.g., https://api-inference.huggingface.co/models/..." />
          <InputField label="Hugging Face API Token" value={hfApiToken} onChange={(e) => setHfApiToken(e.target.value)} placeholder="Your Hugging Face read token" type="password" />

          <div className="bg-yellow-500/10 border border-yellow-500/30 text-yellow-300 text-xs rounded-md p-3 mt-2">
            <p><span className="font-bold">Security Warning:</span> Storing API keys in the browser is convenient but not recommended for production environments. Keys are stored in your browser's local storage. Ensure you are in a secure environment.</p>
          </div>
        </div>

        <div className="mt-6 flex justify-end space-x-3 flex-shrink-0">
          <button 
            onClick={onClose}
            className="px-4 py-2 text-sm font-semibold bg-slate-600/50 text-slate-300 rounded-md hover:bg-slate-600 transition-colors"
          >
            Cancel
          </button>
          <button
            onClick={handleSave}
            className="px-4 py-2 text-sm font-semibold bg-cyan-600 text-white rounded-md hover:bg-cyan-500 transition-colors disabled:bg-slate-500 disabled:cursor-not-allowed"
            disabled={!geminiApiKey.trim() && !hfModelUrl.trim()}
          >
            Save and Connect
          </button>
        </div>
      </div>
    </div>
  );
};

export default SettingsModal;
