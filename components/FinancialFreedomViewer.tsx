import React, { useMemo } from 'react';
import type { FinancialFreedomState } from '../types';
import Card from './common/Card';
import Gauge from './common/Gauge';

interface FinancialFreedomViewerProps {
  financialFreedom: FinancialFreedomState;
}

const formatCurrency = (value: number, decimals = 0) => {
    return new Intl.NumberFormat('en-US', {
        style: 'currency',
        currency: 'USD',
        minimumFractionDigits: decimals,
        maximumFractionDigits: decimals,
    }).format(value);
};

const FinancialFreedomViewer: React.FC<FinancialFreedomViewerProps> = ({ financialFreedom }) => {

    const assetAllocation = useMemo(() => {
        const allocation: { [key in 'Crypto' | 'Stock' | 'Cash']: number } = {
            Crypto: 0,
            Stock: 0,
            Cash: 0,
        };
        let total = 0;
        financialFreedom.assets.forEach(asset => {
            if (allocation[asset.type] !== undefined) {
                allocation[asset.type] += asset.value;
            }
            total += asset.value;
        });

        if (total === 0) return [];

        return Object.entries(allocation).map(([type, value]) => ({
            type: type as 'Crypto' | 'Stock' | 'Cash',
            value,
            percentage: (value / total) * 100,
        }));
    }, [financialFreedom.assets]);
    
    const allocationColors = {
        Crypto: 'bg-orange-500',
        Stock: 'bg-blue-500',
        Cash: 'bg-green-500',
    };

    const ffProgress = financialFreedom.financialFreedomGoal.target > 0 ? (financialFreedom.financialFreedomGoal.current / financialFreedom.financialFreedomGoal.target) * 100 : 0;
    const piProgress = financialFreedom.passiveIncomeGoal.target > 0 ? (financialFreedom.passiveIncomeGoal.current / financialFreedom.passiveIncomeGoal.target) * 100 : 0;


  return (
    <div className="flex flex-col space-y-4">
      <Card title="Net Worth">
        <div className="text-center p-4">
          <p className="text-4xl font-bold text-green-400">{formatCurrency(financialFreedom.netWorth)}</p>
        </div>
      </Card>
      
      <Card title="Financial Freedom Goal">
        <div className="flex items-center justify-center p-2 space-x-4">
          <Gauge value={ffProgress} label="Progress" />
          <div className="text-sm">
            <p className="text-slate-400">Current: <span className="font-semibold text-slate-200">{formatCurrency(financialFreedom.financialFreedomGoal.current)}</span></p>
            <p className="text-slate-400">Target: <span className="font-semibold text-slate-200">{formatCurrency(financialFreedom.financialFreedomGoal.target)}</span></p>
          </div>
        </div>
      </Card>

      <Card title="Passive Income Goal (Monthly)">
         <div className="flex items-center justify-center p-2 space-x-4">
          <Gauge value={piProgress} label="Progress" />
          <div className="text-sm">
            <p className="text-slate-400">Current: <span className="font-semibold text-slate-200">{formatCurrency(financialFreedom.passiveIncomeGoal.current)}</span></p>
            <p className="text-slate-400">Target: <span className="font-semibold text-slate-200">{formatCurrency(financialFreedom.passiveIncomeGoal.target)}</span></p>
          </div>
        </div>
      </Card>

       <Card title="Monthly Cash Flow">
        <div className="space-y-2 text-sm">
           <div className="flex justify-between">
                <span className="text-green-400">Income:</span>
                <span className="font-mono text-green-300">{formatCurrency(financialFreedom.monthlyIncome)}</span>
           </div>
            <div className="flex justify-between">
                <span className="text-red-400">Expenses:</span>
                <span className="font-mono text-red-300">-{formatCurrency(financialFreedom.monthlyExpenses)}</span>
           </div>
           <div className="flex justify-between border-t border-slate-700 pt-2 mt-2 font-bold">
                <span className="text-cyan-400">Net Flow:</span>
                <span className="font-mono text-cyan-300">{formatCurrency(financialFreedom.monthlyIncome - financialFreedom.monthlyExpenses)}</span>
           </div>
        </div>
      </Card>

      <Card title="Accounts">
        <div className="space-y-2 text-sm max-h-40 overflow-y-auto scrollbar-thin scrollbar-thumb-slate-700 scrollbar-track-slate-800 pr-2">
            {financialFreedom.accounts.map(account => (
                <div key={account.id} className="flex justify-between p-2 bg-slate-700/50 rounded-md">
                    <span className="font-semibold text-slate-300">{account.name}</span>
                    <span className="font-mono text-slate-200">{formatCurrency(account.balance)}</span>
                </div>
            ))}
        </div>
      </Card>

       <Card title="Asset Allocation">
        <div className="space-y-3">
            {assetAllocation.map(asset => (
                <div key={asset.type}>
                    <div className="flex justify-between text-xs mb-1">
                        <span className="font-semibold text-slate-300">{asset.type}</span>
                        <span className="font-mono text-slate-400">{asset.percentage.toFixed(1)}%</span>
                    </div>
                    <div className="w-full bg-slate-700 rounded-full h-2.5">
                        <div className={`${allocationColors[asset.type]} h-2.5 rounded-full`} style={{ width: `${asset.percentage}%` }}></div>
                    </div>
                </div>
            ))}
        </div>
      </Card>

    </div>
  );
};

export default FinancialFreedomViewer;
