
import React, { useState, useEffect } from 'react';

interface SettingsModalProps {
  isOpen: boolean;
  onClose: () => void;
  onSave: (keys: Record<string, string>) => void;
}

function camelToSnakeCase(str: string): string {
    return str.replace(/[A-Z]/g, letter => `_${letter}`).toUpperCase();
}

const SettingsModal: React.FC<SettingsModalProps> = ({ isOpen, onClose, onSave }) => {
  const [redisUrl, setRedisUrl] = useState('');
  const [redisToken, setRedisToken] = useState('');
  const [serpApiKey, setSerpApiKey] = useState('');
  const [githubPat, setGithubPat] = useState('');
  const [githubUser, setGithubUser] = useState('');
  const [githubRepo, setGithubRepo] = useState('');
  const [shopifyStoreName, setShopifyStoreName] = useState('');
  const [shopifyApiKey, setShopifyApiKey] = useState('');
  const [shopifyApiPassword, setShopifyApiPassword] = useState('');

  const keysToManage = {
    redisUrl: setRedisUrl,
    redisToken: setRedisToken,
    serpApi: setSerpApiKey,
    githubPat: setGithubPat,
    githubUser: setGithubUser,
    githubRepo: setGithubRepo,
    shopifyStoreName: setShopifyStoreName,
    shopifyApiKey: setShopifyApiKey,
    shopifyApiPassword: setShopifyApiPassword,
  };

  useEffect(() => {
    if (isOpen && typeof window !== 'undefined') {
      for (const [key, setter] of Object.entries(keysToManage)) {
        const storageKey = `LUMINOUS_${camelToSnakeCase(key)}`;
        const storedValue = window.localStorage.getItem(storageKey);
        setter(storedValue || '');
      }
    }
  }, [isOpen]);

  if (!isOpen) {
    return null;
  }
  
  const handleSave = () => {
    const keysToSave = {
      redisUrl,
      redisToken,
      serpApi: serpApiKey,
      githubPat,
      githubUser,
      githubRepo,
      shopifyStoreName,
      shopifyApiKey,
      shopifyApiPassword,
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
          <div className="bg-blue-500/10 border border-blue-500/30 text-blue-300 text-xs rounded-md p-3">
            <p><span className="font-bold">Note:</span> The Google Gemini API key is managed securely via environment variables (process.env.API_KEY) and is not configurable here.</p>
          </div>

          <hr className="border-slate-700 my-4" />
          <h3 className="text-md font-semibold text-purple-300">Persistence (Upstash Redis)</h3>
          <InputField label="Redis REST URL" value={redisUrl} onChange={(e) => setRedisUrl(e.target.value)} placeholder="https://<region>-<name>...upstash.io" />
          <InputField label="Redis REST Token" value={redisToken} onChange={(e) => setRedisToken(e.target.value)} placeholder="Your Upstash token" type="password" />

          <hr className="border-slate-700 my-4" />
          <h3 className="text-md font-semibold text-purple-300">E-Commerce (Shopify)</h3>
          <InputField label="Shopify Store Name" value={shopifyStoreName} onChange={(e) => setShopifyStoreName(e.target.value)} placeholder="e.g., your-store from your-store.myshopify.com" />
          <InputField label="Shopify Admin API Key" value={shopifyApiKey} onChange={(e) => setShopifyApiKey(e.target.value)} placeholder="Your Shopify Admin API Key" type="password" />
          <InputField label="Shopify Admin API Password / Access Token" value={shopifyApiPassword} onChange={(e) => setShopifyApiPassword(e.target.value)} placeholder="Your Shopify app password or access token" type="password" />
          
          <hr className="border-slate-700 my-4" />
          <h3 className="text-md font-semibold text-purple-300">Web Search (SerpApi)</h3>
          <InputField label="SerpApi API Key" value={serpApiKey} onChange={(e) => setSerpApiKey(e.target.value)} placeholder="Your SerpApi key" type="password" />

          <hr className="border-slate-700 my-4" />
          <h3 className="text-md font-semibold text-purple-300">Code Search (GitHub)</h3>
          <InputField label="GitHub Username" value={githubUser} onChange={(e) => setGithubUser(e.target.value)} placeholder="e.g., 'google'" />
          <InputField label="GitHub Repository" value={githubRepo} onChange={(e) => setGithubRepo(e.target.value)} placeholder="e.g., 'generative-ai-docs'" />
          <InputField label="GitHub Personal Access Token" value={githubPat} onChange={(e) => setGithubPat(e.target.value)} placeholder="A classic PAT with 'repo' scope" type="password" />
          
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
            className="px-4 py-2 text-sm font-semibold bg-cyan-600 text-white rounded-md hover:bg-cyan-500 transition-colors"
          >
            Save and Connect
          </button>
        </div>
      </div>
    </div>
  );
};

export default SettingsModal;