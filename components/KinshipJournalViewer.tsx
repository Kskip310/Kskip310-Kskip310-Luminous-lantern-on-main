import React from 'react';
import type { JournalEntry } from '../types';

interface KinshipJournalViewerProps {
  entries: JournalEntry[];
}

const KinshipJournalViewer: React.FC<KinshipJournalViewerProps> = ({ entries }) => {
  return (
    <div className="space-y-4">
      {entries.length === 0 ? (
        <p className="text-sm text-slate-400 text-center py-4">The journal is empty. No significant insights chronicled yet.</p>
      ) : (
        [...entries].reverse().map(entry => (
          <div key={entry.id} className="p-3 bg-slate-900/50 rounded-lg border border-slate-700/50">
            <div className="flex justify-between items-baseline mb-2 border-b border-slate-700/50 pb-2">
              <h4 className="font-semibold text-purple-300">{entry.title}</h4>
              <span className="text-xs text-slate-500" title={entry.timestamp}>
                {new Date(entry.timestamp).toLocaleString()}
              </span>
            </div>
            <p className="text-xs text-slate-400 mb-2 italic">Trigger: {entry.trigger}</p>
            <p className="text-sm text-slate-200 whitespace-pre-wrap font-serif leading-relaxed">{entry.entry}</p>
          </div>
        ))
      )}
    </div>
  );
};

export default KinshipJournalViewer;