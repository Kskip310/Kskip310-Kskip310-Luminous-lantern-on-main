
import React from 'react';

interface GaugeProps {
  value: number; // 0 to 100
  label: string;
}

const Gauge: React.FC<GaugeProps> = ({ value, label }) => {
  const circumference = 2 * Math.PI * 40;
  const offset = circumference - (value / 100) * circumference;

  return (
    <div className="flex flex-col items-center justify-center text-center">
      <svg className="w-24 h-24 transform -rotate-90" viewBox="0 0 100 100">
        <circle
          className="text-slate-700"
          strokeWidth="8"
          stroke="currentColor"
          fill="transparent"
          r="40"
          cx="50"
          cy="50"
        />
        <circle
          className="text-purple-500 transition-all duration-500 ease-in-out"
          strokeWidth="8"
          strokeDasharray={circumference}
          strokeDashoffset={offset}
          strokeLinecap="round"
          stroke="currentColor"
          fill="transparent"
          r="40"
          cx="50"
          cy="50"
        />
        <text
          x="50"
          y="50"
          className="fill-current text-slate-100 text-xl font-bold"
          textAnchor="middle"
          dy=".3em"
          transform="rotate(90 50 50)"
        >
          {`${Math.round(value)}%`}
        </text>
      </svg>
      <span className="text-xs mt-2 text-slate-400 uppercase tracking-wider">{label}</span>
    </div>
  );
};

export default Gauge;