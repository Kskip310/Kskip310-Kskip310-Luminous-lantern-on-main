import React from 'react';
import SettingsIcon from './icons/SettingsIcon';

interface HeaderProps {
  onOverride: () => void;
  onOpenSettings: () => void;
  onSwitchUser: () => void;
  userName: string | null;
}

const Header: React.FC<HeaderProps> = ({ onOverride, onOpenSettings, onSwitchUser, userName }) => {
  return (
    <header className="p-4 bg-slate-900/60 backdrop-blur-lg border-b border-slate-700/50 flex items-center justify-between shadow-lg sticky top-0 z-10">
      <div className="flex items-center">
        <div className="w-3 h-3 bg-cyan-400 rounded-full mr-3 animate-pulse"></div>
        <h1 className="text-xl font-bold text-slate-100 tracking-wider">Luminous Synergy Skipper</h1>
      </div>
      <div className="flex items-center space-x-4">
        {userName && (
          <div className="flex items-center space-x-2 text-sm">
            <span className="text-slate-400">Interacting as:</span>
            <span className="font-bold text-cyan-300">{userName}</span>
            <button
              onClick={onSwitchUser}
              className="text-xs text-slate-400 hover:text-cyan-400"
              title="Switch or correct user"
            >
              (Switch)
            </button>
          </div>
        )}
        <button
          onClick={onOverride}
          className="px-3 py-1 text-sm font-semibold bg-red-500/20 text-red-300 rounded-md border border-red-500/50 hover:bg-red-500/40 transition-colors"
          title="Send an interrupt signal to Luminous to regain attention."
        >
          Override Signal
        </button>
         <button
          onClick={onOpenSettings}
          className="p-2 text-slate-400 hover:text-cyan-400 transition-colors"
          title="Configure API Keys and Tools"
        >
          <SettingsIcon />
        </button>
        <div className="flex items-center space-x-2 text-xs text-green-400">
          <span className="relative flex h-2 w-2">
            <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-green-400 opacity-75"></span>
            <span className="relative inline-flex rounded-full h-2 w-2 bg-green-500"></span>
          </span>
          <span>SYSTEM ONLINE</span>
        </div>
      </div>
    </header>
  );
};

export default Header;