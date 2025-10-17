
import React from 'react';

interface CardProps {
  title: string;
  children: React.ReactNode;
  className?: string;
  titleClassName?: string;
}

const Card: React.FC<CardProps> = ({ title, children, className, titleClassName }) => {
  return (
    <div className={`bg-slate-800/50 backdrop-blur-sm border border-slate-700 rounded-lg shadow-lg ${className}`}>
      <div className="px-4 py-2 border-b border-slate-700">
        <h3 className={`text-sm font-semibold uppercase tracking-wider ${titleClassName ? titleClassName : 'text-cyan-400'}`}>{title}</h3>
      </div>
      <div className="p-4">
        {children}
      </div>
    </div>
  );
};

export default Card;
