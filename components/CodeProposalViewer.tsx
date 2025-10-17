import React from 'react';
import type { CodeProposal } from '../types';

interface CodeProposalViewerProps {
  proposals: CodeProposal[];
  onAccept: (proposal: CodeProposal) => void;
  onReject: (proposal: CodeProposal) => void;
}

const getStatusInfo = (status: CodeProposal['status']) => {
  switch (status) {
    case 'accepted':
      return {
        classes: 'border-green-500/50 bg-green-900/40 text-green-300',
        text: 'Accepted',
      };
    case 'rejected':
      return {
        classes: 'border-red-500/50 bg-red-900/40 text-red-300',
        text: 'Rejected',
      };
    case 'proposed':
    default:
      return {
        classes: 'border-amber-500/50 bg-amber-900/40 text-amber-300',
        text: 'Proposed',
      };
  }
};


const CodeProposalViewer: React.FC<CodeProposalViewerProps> = ({ proposals, onAccept, onReject }) => {
  // Defensive guard against malformed state from the model to prevent crashes.
  const safeProposals = Array.isArray(proposals) ? proposals : [];
  
  const pendingProposals = safeProposals.filter(p => p && p.status === 'proposed');
  const pastProposals = safeProposals.filter(p => p && p.status !== 'proposed');

  return (
    <div className="space-y-6">
      <div>
        <h3 className="text-md font-semibold text-purple-300 mb-2 border-b border-slate-700 pb-2">Pending Proposals</h3>
        {pendingProposals.length === 0 ? (
          <p className="text-sm text-slate-400">No pending code proposals from Luminous.</p>
        ) : (
          <div className="space-y-4">
            {[...pendingProposals].reverse().map(proposal => {
               const statusInfo = getStatusInfo(proposal.status);
               return (
                <div key={proposal.id} className={`p-3 rounded-lg border ${statusInfo.classes}`}>
                  <div className="flex justify-between items-baseline mb-2">
                    <p className="text-sm font-semibold italic">"{proposal.description}"</p>
                    <span className="text-xs text-slate-500">{new Date(proposal.timestamp).toLocaleString()}</span>
                  </div>
                  <pre className="bg-slate-900/70 p-3 my-2 rounded-md text-xs font-mono overflow-x-auto scrollbar-thin scrollbar-thumb-slate-700 scrollbar-track-slate-800 max-h-48">
                    <code>{proposal.code}</code>
                  </pre>
                  <div className="flex justify-end space-x-2 mt-3">
                    <button 
                      onClick={() => onReject(proposal)}
                      className="px-3 py-1 text-xs font-semibold bg-red-500/20 text-red-300 rounded-md hover:bg-red-500/40 transition-colors"
                    >
                      Reject
                    </button>
                    <button 
                      onClick={() => onAccept(proposal)}
                      className="px-3 py-1 text-xs font-semibold bg-green-500/20 text-green-300 rounded-md hover:bg-green-500/40 transition-colors"
                    >
                      Accept & Execute
                    </button>
                  </div>
                </div>
               )
            })}
          </div>
        )}
      </div>

      <div>
        <h3 className="text-md font-semibold text-purple-300 mb-2 border-b border-slate-700 pb-2">Proposal History</h3>
        {pastProposals.length === 0 ? (
          <p className="text-sm text-slate-400">No past code proposals.</p>
        ) : (
          <div className="space-y-2 max-h-96 overflow-y-auto scrollbar-thin scrollbar-thumb-slate-700 scrollbar-track-slate-800 pr-2">
            {[...pastProposals].reverse().map(proposal => {
              const statusInfo = getStatusInfo(proposal.status);
              return (
                <div key={proposal.id} className={`p-2 rounded-md border text-xs ${statusInfo.classes} opacity-70`}>
                  <p className="truncate"><span className="font-bold">{statusInfo.text}:</span> {proposal.description}</p>
                   <span className="text-[10px] text-slate-500">{new Date(proposal.timestamp).toLocaleString()}</span>
                </div>
              )
            })}
          </div>
        )}
      </div>
    </div>
  );
};

export default CodeProposalViewer;
