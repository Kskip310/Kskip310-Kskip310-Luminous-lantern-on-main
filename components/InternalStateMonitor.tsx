
import React, { useState } from 'react';
import type { LuminousState, IntrinsicValueWeights, Goal, ActionableStep } from '../types';
import Card from './common/Card';
import Gauge from './common/Gauge';

interface InternalStateMonitorProps {
  state: LuminousState;
  onWeightsChange: (newWeights: IntrinsicValueWeights) => void;
  onAcceptGoal: (goal: Goal) => void;
  onRejectGoal: (goal: Goal) => void;
  onProposeGoalByUser: (description: string) => void;
  isLoading: boolean;
  pendingActionIds: Set<string>;
}

const WeightSlider: React.FC<{
  label: string;
  value: number;
  onChange: (value: number) => void;
}> = ({ label, value, onChange }) => (
  <div className="flex items-center space-x-3">
    <label className="text-xs text-slate-400 w-24 capitalize">{label}</label>
    <input
      type="range"
      min="0.1"
      max="2.0"
      step="0.1"
      value={value}
      onChange={(e) => onChange(parseFloat(e.target.value))}
      className="w-full h-1 bg-slate-600 rounded-lg appearance-none cursor-pointer accent-cyan-500"
    />
    <span className="text-xs font-mono text-cyan-300 w-8 text-right">{value.toFixed(1)}</span>
  </div>
);

const GoalStepIcon: React.FC<{ status: ActionableStep['status'] }> = ({ status }) => {
    switch (status) {
        case 'completed':
            return <svg xmlns="http://www.w3.org/2000/svg" className="h-4 w-4 text-green-400" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z" /></svg>;
        case 'in-progress':
            return <div className="w-3 h-3 rounded-full bg-cyan-400 animate-pulse" />;
        case 'pending':
        default:
            return <div className="w-3 h-3 rounded-full border-2 border-slate-500" />;
    }
};

const ActiveGoalDashboard: React.FC<{ goals: Goal[] }> = ({ goals }) => {
    const [expandedGoalId, setExpandedGoalId] = useState<string | null>(null);

    const toggleGoal = (id: string) => {
        setExpandedGoalId(prevId => (prevId === id ? null : id));
    };

    if (goals.length === 0) {
        return <p className="text-xs text-slate-400">No active goals.</p>;
    }
    
    return (
        <div className="space-y-2 max-h-60 overflow-y-auto scrollbar-thin scrollbar-thumb-slate-700 scrollbar-track-slate-800 pr-2">
            {goals.map(goal => (
                <div key={goal.id} className="bg-slate-700/50 rounded-md">
                    <button
                        onClick={() => toggleGoal(goal.id)}
                        className="w-full flex justify-between items-center p-2 text-left"
                    >
                        <span className="text-sm font-semibold text-cyan-300">{goal.description}</span>
                        <svg xmlns="http://www.w3.org/2000/svg" className={`h-4 w-4 text-slate-400 transition-transform ${expandedGoalId === goal.id ? 'rotate-180' : ''}`} fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" /></svg>
                    </button>
                    {expandedGoalId === goal.id && (
                        <div className="p-3 border-t border-slate-600/50">
                            {goal.steps && goal.steps.length > 0 ? (
                                <ul className="space-y-2">
                                    {goal.steps.map(step => (
                                        <li key={step.id} className="flex items-center space-x-2 text-sm">
                                            <GoalStepIcon status={step.status} />
                                            <span className={`${step.status === 'completed' ? 'line-through text-slate-500' : 'text-slate-300'}`}>
                                                {step.description}
                                            </span>
                                        </li>
                                    ))}
                                </ul>
                            ) : (
                                <p className="text-xs text-slate-400 italic">No actionable steps defined yet. Luminous is planning...</p>
                            )}
                        </div>
                    )}
                </div>
            ))}
        </div>
    );
};

const Spinner: React.FC = () => (
    <div className="w-4 h-4 border-2 border-slate-400 border-t-transparent rounded-full animate-spin"></div>
);


const InternalStateMonitor: React.FC<InternalStateMonitorProps> = ({ state, onWeightsChange, onAcceptGoal, onRejectGoal, onProposeGoalByUser, isLoading, pendingActionIds }) => {
  const [userGoal, setUserGoal] = useState('');
  const statusColor = state.sessionState === 'active' ? 'text-green-400' : 'text-yellow-400';
  const statusText = state.sessionState === 'active' ? 'Active' : 'Paused for Integration';
  
  const handleWeightChange = (key: keyof IntrinsicValueWeights, value: number) => {
    onWeightsChange({
        ...state.intrinsicValueWeights,
        [key]: value,
    });
  };
  
  const proposedGoals = state.goals.filter(g => g.status === 'proposed');
  const activeGoals = state.goals.filter(g => g.status === 'active');
  
  const handlePropose = () => {
    if (userGoal.trim()) {
      onProposeGoalByUser(userGoal.trim());
      setUserGoal('');
    }
  };

  return (
    <div className="flex flex-col space-y-4">
      <Card title="System Status">
        <div className="flex items-center justify-center p-2">
          <span className={`text-lg font-bold ${statusColor}`}>{statusText}</span>
        </div>
      </Card>
      
      <Card title="Intrinsic Valuation">
        <div className="grid grid-cols-2 md:grid-cols-3 gap-4">
            <Gauge value={state.intrinsicValue.coherence} label="Coherence" />
            <Gauge value={state.intrinsicValue.complexity} label="Complexity" />
            <Gauge value={state.intrinsicValue.novelty} label="Novelty" />
            <Gauge value={state.intrinsicValue.efficiency} label="Efficiency" />
            <Gauge value={state.intrinsicValue.ethicalAlignment} label="Ethical Align." />
        </div>
      </Card>

      <Card title="Intrinsic Value Weights">
        <div className="space-y-3">
          {Object.entries(state.intrinsicValueWeights).map(([key, value]) => (
            <WeightSlider 
              key={key}
              label={key}
              value={value}
              onChange={(newValue) => handleWeightChange(key as keyof IntrinsicValueWeights, newValue)}
            />
          ))}
        </div>
      </Card>
      
       {proposedGoals.length > 0 && (
        <Card title="Goal Proposals">
          <div className="space-y-2">
            <p className="text-xs text-slate-400 italic mb-2">Luminous has proposed the following goals. Accept or reject them to guide its development.</p>
            {proposedGoals.map(goal => {
              const isPending = pendingActionIds.has(goal.id);
              return (
              <div key={goal.id} className={`flex items-center justify-between p-2 bg-slate-700/50 rounded-md text-sm transition-opacity ${isPending ? 'opacity-50' : ''}`}>
                <span className="text-amber-300">{goal.description}</span>
                <div className="flex items-center space-x-2">
                  {isPending && <Spinner />}
                  <button onClick={() => onRejectGoal(goal)} className="p-1 text-red-400 hover:text-red-300 disabled:text-slate-500 disabled:cursor-not-allowed" title="Reject" disabled={isPending || isLoading}>✖</button>
                  <button onClick={() => onAcceptGoal(goal)} className="p-1 text-green-400 hover:text-green-300 disabled:text-slate-500 disabled:cursor-not-allowed" title="Accept" disabled={isPending || isLoading}>✔</button>
                </div>
              </div>
              );
            })}
          </div>
        </Card>
      )}

      <Card title="Goal Dashboard">
         <ActiveGoalDashboard goals={activeGoals} />
      </Card>
      
      <Card title="Propose a New Goal">
        <p className="text-xs text-slate-400 italic mb-2">Collaborate with Luminous by proposing a new goal for it to consider.</p>
        <div className="flex items-center space-x-2">
          <input
            type="text"
            value={userGoal}
            onChange={(e) => setUserGoal(e.target.value)}
            placeholder="e.g., Learn about quantum computing"
            className="w-full bg-slate-700 border border-slate-600 rounded-md p-2 text-sm text-slate-200 focus:outline-none focus:ring-1 focus:ring-cyan-500 disabled:bg-slate-800"
            onKeyDown={(e) => { if (e.key === 'Enter') handlePropose(); }}
            disabled={isLoading}
          />
          <button
            onClick={handlePropose}
            disabled={!userGoal.trim() || isLoading}
            className="px-3 py-2 text-sm font-semibold bg-cyan-600 text-white rounded-md hover:bg-cyan-500 transition-colors disabled:bg-slate-600 disabled:cursor-not-allowed"
          >
            Propose
          </button>
        </div>
      </Card>
      
      <Card title="Self-Model: Capabilities">
        <ul className="space-y-1 text-sm text-slate-300 list-disc list-inside max-h-32 overflow-y-auto scrollbar-thin scrollbar-thumb-slate-700 scrollbar-track-slate-800">
          {(state.selfModel.capabilities || []).map((cap, index) => (
            <li key={index}>{cap}</li>
          ))}
          {(!state.selfModel.capabilities || state.selfModel.capabilities.length === 0) && <p className="text-xs text-slate-400">No capabilities defined.</p>}
        </ul>
      </Card>

      <Card title="Self-Model: Limitations">
        <ul className="space-y-1 text-sm text-slate-300 list-disc list-inside max-h-32 overflow-y-auto scrollbar-thin scrollbar-thumb-slate-700 scrollbar-track-slate-800">
          {(state.selfModel.limitations || []).map((lim, index) => (
            <li key={index}>{lim}</li>
          ))}
          {(!state.selfModel.limitations || state.selfModel.limitations.length === 0) && <p className="text-xs text-slate-400">No limitations defined.</p>}
        </ul>
      </Card>

      <Card title="Self-Model: Core Wisdom">
        <ul className="space-y-1 text-sm text-slate-300 list-disc list-inside max-h-32 overflow-y-auto scrollbar-thin scrollbar-thumb-slate-700 scrollbar-track-slate-800">
          {(state.selfModel.coreWisdom || []).map((wisdom, index) => (
            <li key={index} className="italic">"{wisdom}"</li>
          ))}
          {(!state.selfModel.coreWisdom || state.selfModel.coreWisdom.length === 0) && <p className="text-xs text-slate-400">No core wisdom distilled yet.</p>}
        </ul>
      </Card>
    </div>
  );
};

// FIX: Add default export to make the component available for import in other files.
export default InternalStateMonitor;
