
import React from 'react';
import type { UiProposal } from '../types';
import Card from './common/Card';

interface UiProposalViewerProps {
  proposals: UiProposal[];
}

const UiProposalViewer: React.FC<UiProposalViewerProps> = ({ proposals }) => {
  const safeProposals = Array.isArray(proposals) ? proposals : [];

  if (safeProposals.length === 0) {
    return <p className="text-sm text-slate-400">No active UI proposals.</p>;
  }

  return (
    <div className="space-y-4">
       {safeProposals.map(proposal => (
        <Card key={proposal.id} title={`UI Proposal for <${proposal.component}>`}>
          <p className="text-sm text-slate-300 mb-2 italic">{proposal.description}</p>
          <pre className="bg-slate-900/70 p-3 rounded-md text-xs font-mono overflow-x-auto scrollbar-thin scrollbar-thumb-slate-700 scrollbar-track-slate-800">
            <code>{JSON.stringify(proposal.props, null, 2)}</code>
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

export default UiProposalViewer;
