import React from 'react';
import { X, Edit3 } from 'lucide-react';
import { ScrollHint } from './ScrollHint';
import { HealthCharts } from './HealthCharts';
import { DayHistory } from '../types';

interface MedicalSummaryModalProps {
  isOpen: boolean;
  onClose: () => void;
  isCaregiverMode: boolean;
  patientName: string;
  medicalHistorySummary: string;
  onUpdateSummary: (newSummary: string) => void;
  reports?: Record<string, DayHistory>;
  isSubscribed?: boolean;
}

export const MedicalSummaryModal: React.FC<MedicalSummaryModalProps> = ({
  isOpen,
  onClose,
  isCaregiverMode,
  patientName,
  medicalHistorySummary,
  onUpdateSummary,
  reports,
  isSubscribed
}) => {
  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-[150] flex items-center justify-center p-4 bg-slate-900/95 backdrop-blur-xl animate-in fade-in duration-300">
      <div className="bg-white dark:bg-slate-900 w-full max-w-2xl rounded-[3rem] shadow-2xl relative max-h-[92vh] flex flex-col overflow-hidden border-t-[14px] border-blue-600">
        <div className="p-8 pb-5 border-b border-slate-100 dark:border-slate-800 flex items-center justify-between bg-blue-50/40 dark:bg-blue-900/10">
           <button onClick={onClose} className="p-3.5 bg-white dark:bg-slate-800 text-slate-800 dark:text-slate-200 rounded-2xl active:scale-90"><X className="w-7 h-7"/></button>
           <div className="text-right">
             <h2 className="text-2xl font-black text-slate-800 dark:text-white">{isCaregiverMode ? 'تعديل التاريخ المرضي' : 'الملخص الطبي'}</h2>
             <p className="text-blue-600 dark:text-blue-400 text-[10px] font-black uppercase mt-1">المريض: {patientName}</p>
           </div>
        </div>
        <div className="flex-1 overflow-y-auto p-8 custom-scrollbar text-right space-y-8 bg-white dark:bg-slate-900">
          
          {isSubscribed && reports && (
            <div className="mb-6">
              <HealthCharts reports={reports} />
            </div>
          )}

          <div className="space-y-4">
            <label className="flex items-center justify-end gap-2 text-blue-700 dark:text-blue-400 font-black text-lg">
              {isCaregiverMode ? 'تعديل ملخص الحالة' : 'تحديث بياناتي الطبية'} 
              <Edit3 className="w-5 h-5"/>
            </label>
            <textarea 
              value={medicalHistorySummary}
              onChange={(e) => onUpdateSummary(e.target.value)}
              placeholder="اكتب هنا ملخص حالتك الطبية، الأمراض المزمنة، العمليات السابقة..."
              className="w-full p-6 bg-slate-50 dark:bg-slate-800 border-2 border-slate-100 dark:border-slate-700 focus:border-blue-500 focus:bg-white dark:focus:bg-slate-700 outline-none rounded-[2rem] font-bold text-right shadow-inner min-h-[400px] resize-none leading-relaxed text-slate-800 dark:text-slate-100"
            />
          </div>
        </div>
        <ScrollHint />
      </div>
    </div>
  );
};
