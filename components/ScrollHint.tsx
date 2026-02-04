import React from 'react';
import { ChevronDown } from 'lucide-react';

export const ScrollHint: React.FC<{ className?: string; position?: 'absolute' | 'fixed' }> = ({ className = '', position = 'absolute' }) => {
  return (
    <div className={`${position} bottom-6 left-1/2 -translate-x-1/2 pointer-events-none animate-bounce z-50 ${className}`}>
      <div className="bg-white/50 dark:bg-slate-900/50 backdrop-blur-md p-2 rounded-full border border-slate-200 dark:border-slate-700 shadow-lg">
        <ChevronDown className="w-6 h-6 text-slate-600 dark:text-slate-300" />
      </div>
    </div>
  );
};
