import React from 'react';
import type { ProactiveInitiative } from '../types';

interface ProactiveInitiativesViewerProps {
  initiatives: ProactiveInitiative[];
}

// These classes are for the badge
const getStatusBadgeClasses = (status: ProactiveInitiative['status']) => {
  switch (status) {
    case 'generated':
      return 'bg-yellow-500/20 text-yellow-300';
    case 'categorized':
      return 'bg-cyan-500/20 text-cyan-300';
    case 'reflected':
      return 'bg-green-500/20 text-green-300';
    default:
      return 'bg-slate-600/50 text-slate-300';
  }
};

// These classes are for the card border
const getStatusBorderClasses = (status: ProactiveInitiative['status']) => {
    switch (status) {
      case 'generated':
        return 'border-yellow-500/50';
      case 'categorized':
        return 'border-cyan-500/50';
      case 'reflected':
        return 'border-green-500/50';
      default:
        return 'border-slate-700/50';
    }
  };

const ProactiveInitiativesViewer: React.FC<ProactiveInitiativesViewerProps> = ({ initiatives }) => {
  const safeInitiatives = Array.isArray(initiatives) ? initiatives : [];

  return (
    <div className="space-y-4">
      {safeInitiatives.length === 0 ? (
        <p className="text-sm text-slate-400 text-center py-4">Luminous has not generated any autonomous initiatives yet.</p>
      ) : (
        [...safeInitiatives].reverse().map(item => (
          <div key={item.id} className={`p-3 bg-slate-900/50 rounded-lg border ${getStatusBorderClasses(item.status)}`}>
            <p className="text-sm text-slate-200 mb-2 italic">"{item.prompt}"</p>
            <div className="flex justify-between items-center text-xs">
              <span className="text-slate-500" title={item.timestamp}>
                {new Date(item.timestamp).toLocaleString()}
              </span>
              <span className={`px-2 py-0.5 font-bold rounded-full text-[10px] ${getStatusBadgeClasses(item.status)}`}>
                {item.status.toUpperCase()} {item.userCategory ? `(${item.userCategory})` : ''}
              </span>
            </div>
          </div>
        ))
      )}
    </div>
  );
};

export default ProactiveInitiativesViewer;
