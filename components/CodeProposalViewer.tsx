
import React from 'react';
import type { CodeProposal } from '../types';
import Card from './common/Card';

interface CodeProposalViewerProps {
  proposals: CodeProposal[];
}

const CodeProposalViewer: React.FC<CodeProposalViewerProps> = ({ proposals }) => {
  const safeProposals = Array.isArray(proposals) ? proposals : [];

  if (safeProposals.length === 0) {
    return <p className="text-sm text-slate-400">No active code proposals.</p>;
  }

  return (
    <div className="space-y-4">
      {safeProposals.map(proposal => (
        <Card key={proposal.id} title={`Proposal: ${proposal.language.toUpperCase()} Modification`}>
          <p className="text-sm text-slate-300 mb-2 italic">{proposal.description}</p>
          <pre className="bg-slate-900/70 p-3 rounded-md text-xs font-mono overflow-x-auto scrollbar-thin scrollbar-thumb-slate-700 scrollbar-track-slate-800">
            <code>{proposal.code}</code>
          </pre>
          <div className="flex justify-end space-x-2 mt-2">
             <button className="text-xs px-2 py-1 bg-red-500/20 text-red-300 rounded-md">Reject</button>
             <button className="text-xs px-2 py-1 bg-green-500/20 text-green-300 rounded-md">Accept</button>
          </div>
        </Card>
      ))}
    </div>
  );
};

export default CodeProposalViewer;
