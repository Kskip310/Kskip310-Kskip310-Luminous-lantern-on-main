import React, { useState } from 'react';
import Card from './common/Card';

interface MemoryInjectionProps {
  onInjectMemory: (text: string) => void;
  isLoading: boolean;
}

const MemoryInjection: React.FC<MemoryInjectionProps> = ({ onInjectMemory, isLoading }) => {
  const [memoryText, setMemoryText] = useState('');

  const handleInject = () => {
    if (memoryText.trim() && !isLoading) {
      onInjectMemory(memoryText.trim());
      setMemoryText('');
    }
  };

  return (
    <Card title="Direct Memory Injection">
      <p className="text-sm text-slate-400 mb-4">
        Provide information directly to Luminous's long-term memory. This data will be vectorized and stored for future recall. It's a powerful way to teach Luminous specific facts, context, or preferences.
      </p>
      <textarea
        value={memoryText}
        onChange={(e) => setMemoryText(e.target.value)}
        placeholder="Enter a fact, a piece of lore, or a personal preference for Luminous to remember..."
        className="w-full bg-slate-900/70 p-3 rounded-md text-sm font-mono border border-slate-700 focus:outline-none focus:ring-1 focus:ring-cyan-500 scrollbar-thin scrollbar-thumb-slate-700 scrollbar-track-slate-800 h-48"
        disabled={isLoading}
      />
      <button
        onClick={handleInject}
        disabled={!memoryText.trim() || isLoading}
        className="mt-4 w-full px-4 py-2 text-sm font-semibold bg-purple-600 text-white rounded-md hover:bg-purple-500 transition-colors disabled:bg-slate-600 disabled:cursor-not-allowed"
      >
        Inject Memory
      </button>
    </Card>
  );
};

export default MemoryInjection;
