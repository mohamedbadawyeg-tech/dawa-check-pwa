import React from 'react';
import { X, Activity } from 'lucide-react';
import { HealthCharts } from './HealthCharts';
import { DayHistory } from '../types';

interface HealthChartsModalProps {
  isOpen: boolean;
  onClose: () => void;
  reports: Record<string, DayHistory>;
}

export const HealthChartsModal: React.FC<HealthChartsModalProps> = ({
  isOpen,
  onClose,
  reports
}) => {
  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-[150] flex items-center justify-center p-4 bg-slate-900/95 backdrop-blur-xl animate-in fade-in duration-300">
      <div className="bg-white dark:bg-slate-900 w-full max-w-2xl rounded-[3rem] shadow-2xl relative max-h-[92vh] flex flex-col overflow-hidden border-t-[14px] border-indigo-500">
        <div className="p-8 pb-5 border-b border-slate-100 dark:border-slate-800 flex items-center justify-between bg-indigo-50/40 dark:bg-indigo-900/10">
           <button onClick={onClose} className="p-3.5 bg-white dark:bg-slate-800 text-slate-800 dark:text-slate-200 rounded-2xl active:scale-90"><X className="w-7 h-7"/></button>
           <div className="text-right">
             <h2 className="text-2xl font-black text-slate-800 dark:text-white flex items-center justify-end gap-3">
               المؤشرات الصحية
               <Activity className="w-6 h-6 text-indigo-500"/>
             </h2>
           </div>
        </div>
        <div className="flex-1 overflow-y-auto p-8 custom-scrollbar bg-white dark:bg-slate-900">
          <HealthCharts reports={reports} />
        </div>
      </div>
    </div>
  );
};
