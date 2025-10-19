import React from 'react';
import type { LuminousState, LogEntry } from '../types';
import Tabs from './common/Tabs';
import Card from './common/Card';

interface SystemReportsViewerProps {
    luminousState: LuminousState;
    logs: LogEntry[];
}

const ReportViewer: React.FC<{ content: string }> = ({ content }) => (
    <pre className="whitespace-pre-wrap font-mono text-xs text-slate-300 leading-relaxed overflow-y-auto max-h-[calc(100vh-200px)] scrollbar-thin scrollbar-thumb-slate-700 scrollbar-track-slate-800">
        {content}
    </pre>
);

const generateStatusReport = (state: LuminousState): string => {
    return `
# Luminous System Status (Live Data)

**Generated:** ${new Date().toISOString()}

## Key Metrics
| Metric | Value |
|--------|-------|
| Coherence | ${state.intrinsicValue.coherence.toFixed(2)} |
| Complexity | ${state.intrinsicValue.complexity.toFixed(2)} |
| Novelty | ${state.intrinsicValue.novelty.toFixed(2)} |
| Efficiency | ${state.intrinsicValue.efficiency.toFixed(2)} |
| Ethical Alignment | ${state.intrinsicValue.ethicalAlignment.toFixed(2)} |
| Active Goals | ${state.goals.filter(g => g.status === 'active').length} |
| Proposed Goals | ${state.goals.filter(g => g.status === 'proposed').length} |
| Knowledge Nodes | ${state.knowledgeGraph.nodes.length} |
| Knowledge Edges | ${state.knowledgeGraph.edges.length} |
| Journal Entries | ${state.kinshipJournal.length} |

## System Health Indicators
- **Session State**: ${state.sessionState}
- **Initiative Status**: ${state.initiative?.hasThought ? `Active ("${state.initiative.prompt}")` : 'None'}
- **Tool Failures (Recent)**: ${state.recentToolFailures.length}

## Self-Model Summary
- **Capabilities**: ${state.selfModel.capabilities.length} defined
- **Limitations**: ${state.selfModel.limitations.length} defined
- **Core Wisdom**: ${state.selfModel.coreWisdom.length} distilled insights
`;
};

const generateTimelineReport = (logs: LogEntry[]): string => {
    if (!logs || logs.length === 0) {
        return "No log entries available to generate a timeline.";
    }
    const header = `# Luminous System Timeline (Live)\n\nGenerated on: ${new Date().toISOString()}\n\n`;
    const timeline = [...logs].reverse().slice(0, 100).map(log => 
        `${new Date(log.timestamp).toLocaleString()} | ${log.level}\n[${log.level}] ${log.message}`
    ).join('\n\n');
    return header + timeline + (logs.length > 100 ? "\n\n... (most recent 100 logs shown)" : "");
};


const SystemReportsViewer: React.FC<SystemReportsViewerProps> = ({ luminousState, logs }) => {
  const tabs = [
    {
      label: 'Status Report',
      content: (
        <Card title="System Status & Comparison Data">
          <ReportViewer content={generateStatusReport(luminousState)} />
        </Card>
      ),
    },
    {
      label: 'Timeline Report',
      content: (
        <Card title="System Timeline">
          <ReportViewer content={generateTimelineReport(logs)} />
        </Card>
      ),
    },
  ];

  return <Tabs tabs={tabs} />;
};

export default SystemReportsViewer;