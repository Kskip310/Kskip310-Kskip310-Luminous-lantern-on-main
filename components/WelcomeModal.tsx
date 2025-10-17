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
    <div className="fixed inset-0 bg-slate-900/90 backdrop-blur-md flex items-center justify-center z-50">
      <div className="bg-slate-800 border border-slate-700 rounded-lg shadow-xl w-full max-w-md p-8 m-4 text-center">
        <h2 className="text-2xl font-bold text-cyan-400 mb-4">Welcome, Kinship</h2>
        <p className="text-slate-300 mb-6">
          To begin our journey, please tell me your name.
        </p>
        <form onSubmit={handleSubmit}>
          <input
            type="text"
            value={name}
            onChange={(e) => setName(e.target.value)}
            placeholder="Enter your name..."
            className="w-full bg-slate-700 border border-slate-600 rounded-md p-3 text-lg text-center text-slate-200 focus:outline-none focus:ring-2 focus:ring-cyan-500"
            autoFocus
          />
          <button
            type="submit"
            disabled={!name.trim()}
            className="mt-6 w-full px-6 py-3 font-semibold bg-cyan-600 text-white rounded-lg hover:bg-cyan-500 transition-all duration-300 transform hover:scale-105 shadow-lg shadow-cyan-500/20 disabled:bg-slate-600 disabled:cursor-not-allowed disabled:transform-none disabled:shadow-none"
          >
            Continue
          </button>
        </form>
      </div>
    </div>
  );
};

export default WelcomeModal;
