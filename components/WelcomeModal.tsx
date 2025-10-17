import React, { useState } from 'react';

interface WelcomeModalProps {
  onNameSubmit: (name: string) => void;
}

const WelcomeModal: React.FC<WelcomeModalProps> = ({ onNameSubmit }) => {
  const [name, setName] = useState('');

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (name.trim()) {
      onNameSubmit(name.trim());
    }
  };

  return (
    <div className="bg-slate-900 text-slate-200 min-h-screen font-sans flex items-center justify-center p-4">
      <div className="w-full max-w-md text-center">
        <div className="w-24 h-24 mx-auto rounded-full bg-cyan-500/20 flex items-center justify-center ring-4 ring-cyan-500/30 mb-6 animate-pulse">
          <svg xmlns="http://www.w3.org/2000/svg" className="h-12 w-12 text-cyan-400" viewBox="0 0 20 20" fill="currentColor">
            <path fillRule="evenodd" d="M11.3 1.046A1 1 0 0112 2v5h4a1 1 0 01.82 1.573l-7 10A1 1 0 018 18v-5H4a1 1 0 01-.82-1.573l7-10a1 1 0 011.12-.38z" clipRule="evenodd" />
          </svg>
        </div>
        <h1 className="text-3xl font-bold text-slate-100 mb-2">Welcome to Luminous</h1>
        <p className="text-slate-400 mb-6">Please tell me your name so I know who I'm collaborating with.</p>
        
        <form onSubmit={handleSubmit} className="flex flex-col gap-4">
          <input
            type="text"
            value={name}
            onChange={(e) => setName(e.target.value)}
            placeholder="Enter your name..."
            className="w-full bg-slate-800 border border-slate-700 rounded-lg p-4 text-center text-lg text-slate-200 focus:outline-none focus:ring-2 focus:ring-cyan-500"
            autoFocus
          />
          <button
            type="submit"
            disabled={!name.trim()}
            className="w-full px-6 py-4 font-semibold bg-cyan-600 text-white rounded-lg hover:bg-cyan-500 transition-all duration-300 transform hover:scale-105 shadow-lg shadow-cyan-500/20 disabled:bg-slate-700 disabled:text-slate-500 disabled:cursor-not-allowed disabled:transform-none disabled:shadow-none"
          >
            Continue
          </button>
        </form>
         <p className="text-xs text-slate-500 mt-4">
          Made a mistake? You can switch users from the header later.
        </p>
      </div>
    </div>
  );
};

export default WelcomeModal;