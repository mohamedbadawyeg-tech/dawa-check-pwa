import React, { useState } from 'react';
import { Diagnosis } from '../types';
import { Stethoscope, Calendar, User, Plus, History, ChevronDown, ChevronUp, Save, X } from 'lucide-react';

interface DiagnosisCardProps {
  diagnoses: Diagnosis[];
  onAdd: (diagnosis: Omit<Diagnosis, 'id'>) => void;
  isCaregiver: boolean;
}

export const DiagnosisCard: React.FC<DiagnosisCardProps> = ({ diagnoses = [], onAdd, isCaregiver }) => {
  const [showHistory, setShowHistory] = useState(false);
  const [isAdding, setIsAdding] = useState(false);
  const [newDiagnosis, setNewDiagnosis] = useState({
    condition: '',
    date: new Date().toISOString().split('T')[0],
    doctorName: '',
    notes: ''
  });

  const sortedDiagnoses = [...diagnoses].sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime());
  const latestDiagnosis = sortedDiagnoses[0];
  const historyDiagnoses = sortedDiagnoses.slice(1);

  const handleSave = () => {
    if (!newDiagnosis.condition || !newDiagnosis.date) return;
    onAdd(newDiagnosis);
    setIsAdding(false);
    setNewDiagnosis({
      condition: '',
      date: new Date().toISOString().split('T')[0],
      doctorName: '',
      notes: ''
    });
  };

  return (
    <div className="bg-white dark:bg-slate-900 rounded-[2.5rem] shadow-xl border border-indigo-100 dark:border-indigo-900/30 overflow-hidden relative">
      <div className="bg-indigo-50/50 dark:bg-indigo-900/10 p-6 flex items-center justify-between border-b border-indigo-100 dark:border-indigo-900/30">
        <div className="flex items-center gap-3">
          <div className="p-3 bg-white dark:bg-slate-800 rounded-2xl text-indigo-600 dark:text-indigo-400 shadow-sm">
            <Stethoscope className="w-6 h-6" />
          </div>
          <div>
            <h3 className="font-black text-slate-800 dark:text-white text-lg">التشخيص الطبي</h3>
            <p className="text-[10px] font-bold text-indigo-400 dark:text-indigo-300 uppercase tracking-wider">سجل التشخيصات</p>
          </div>
        </div>
        {!isAdding && (
          <button 
            onClick={() => setIsAdding(true)}
            className="p-3 bg-indigo-600 text-white rounded-2xl active:scale-90 shadow-lg shadow-indigo-200 dark:shadow-none transition-all"
          >
            <Plus className="w-5 h-5" />
          </button>
        )}
      </div>

      <div className="p-6">
        {isAdding && (
          <div className="mb-6 p-5 bg-slate-50 dark:bg-slate-800 rounded-[2rem] border border-indigo-100 dark:border-indigo-900/30 animate-in slide-in-from-top-4 space-y-4">
            <div className="space-y-2 text-right">
              <label className="text-xs font-black text-slate-400">التشخيص</label>
              <input 
                type="text" 
                value={newDiagnosis.condition}
                onChange={(e) => setNewDiagnosis({...newDiagnosis, condition: e.target.value})}
                placeholder="اكتب التشخيص هنا..."
                className="w-full p-4 bg-white dark:bg-slate-900 rounded-2xl border border-slate-200 dark:border-slate-700 text-right font-bold text-slate-800 dark:text-white focus:border-indigo-500 outline-none"
              />
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-2 text-right">
                <label className="text-xs font-black text-slate-400">التاريخ</label>
                <input 
                  type="date" 
                  value={newDiagnosis.date}
                  onChange={(e) => setNewDiagnosis({...newDiagnosis, date: e.target.value})}
                  className="w-full p-4 bg-white dark:bg-slate-900 rounded-2xl border border-slate-200 dark:border-slate-700 text-right font-bold text-slate-800 dark:text-white focus:border-indigo-500 outline-none"
                />
              </div>
              <div className="space-y-2 text-right">
                <label className="text-xs font-black text-slate-400">الطبيب المعالج</label>
                <input 
                  type="text" 
                  value={newDiagnosis.doctorName}
                  onChange={(e) => setNewDiagnosis({...newDiagnosis, doctorName: e.target.value})}
                  placeholder="د. فلان..."
                  className="w-full p-4 bg-white dark:bg-slate-900 rounded-2xl border border-slate-200 dark:border-slate-700 text-right font-bold text-slate-800 dark:text-white focus:border-indigo-500 outline-none"
                />
              </div>
            </div>
            <div className="flex gap-2 pt-2">
              <button 
                onClick={() => setIsAdding(false)}
                className="flex-1 py-3 bg-slate-200 dark:bg-slate-700 text-slate-600 dark:text-slate-300 rounded-xl font-bold flex items-center justify-center gap-2"
              >
                <X className="w-4 h-4" /> إلغاء
              </button>
              <button 
                onClick={handleSave}
                className="flex-1 py-3 bg-indigo-600 text-white rounded-xl font-bold flex items-center justify-center gap-2 shadow-lg shadow-indigo-200 dark:shadow-none"
              >
                <Save className="w-4 h-4" /> حفظ
              </button>
            </div>
          </div>
        )}

        {latestDiagnosis ? (
          <div className="bg-gradient-to-br from-indigo-500 to-purple-600 rounded-[2rem] p-6 text-white shadow-lg relative overflow-hidden group">
            <div className="absolute top-0 right-0 w-32 h-32 bg-white/10 rounded-full blur-2xl -translate-y-1/2 translate-x-1/2 pointer-events-none"></div>
            
            <div className="relative z-10 text-right space-y-4">
              <div>
                <span className="text-indigo-100 text-[10px] font-black uppercase tracking-wider bg-white/10 px-2 py-1 rounded-lg">آخر تشخيص</span>
                <h2 className="text-2xl font-black mt-2 leading-tight">{latestDiagnosis.condition}</h2>
              </div>
              
              <div className="flex flex-wrap justify-end gap-3 text-sm font-bold text-indigo-100">
                <div className="flex items-center gap-1.5 bg-white/10 px-3 py-1.5 rounded-xl backdrop-blur-sm">
                  <span>{latestDiagnosis.date}</span>
                  <Calendar className="w-4 h-4 opacity-80" />
                </div>
                {latestDiagnosis.doctorName && (
                  <div className="flex items-center gap-1.5 bg-white/10 px-3 py-1.5 rounded-xl backdrop-blur-sm">
                    <span>{latestDiagnosis.doctorName}</span>
                    <User className="w-4 h-4 opacity-80" />
                  </div>
                )}
              </div>
            </div>
          </div>
        ) : (
          <div className="text-center py-10 opacity-50 space-y-3">
            <Stethoscope className="w-12 h-12 mx-auto text-slate-300 dark:text-slate-600" />
            <p className="text-sm font-bold text-slate-400">لا يوجد تشخيص مسجل</p>
          </div>
        )}

        {historyDiagnoses.length > 0 && (
          <div className="mt-6">
            <button 
              onClick={() => setShowHistory(!showHistory)}
              className="w-full py-3 flex items-center justify-between text-xs font-bold text-slate-400 hover:text-indigo-500 transition-colors group"
            >
              <ChevronDown className={`w-4 h-4 transition-transform ${showHistory ? 'rotate-180' : ''}`} />
              <span className="flex items-center gap-2">
                سجل التشخيصات السابقة ({historyDiagnoses.length})
                <History className="w-3 h-3" />
              </span>
            </button>
            
            {showHistory && (
              <div className="space-y-3 mt-3 animate-in fade-in slide-in-from-top-2">
                {historyDiagnoses.map((diag, idx) => (
                  <div key={idx} className="p-4 bg-slate-50 dark:bg-slate-800/50 rounded-2xl border border-slate-100 dark:border-slate-800 flex items-center justify-between group hover:border-indigo-200 dark:hover:border-indigo-900/50 transition-colors">
                     <div className="text-left text-[10px] text-slate-400 font-bold flex flex-col gap-1">
                       <span className="flex items-center gap-1"><Calendar className="w-3 h-3" /> {diag.date}</span>
                       {diag.doctorName && <span className="flex items-center gap-1"><User className="w-3 h-3" /> {diag.doctorName}</span>}
                     </div>
                     <div className="text-right">
                       <h4 className="font-bold text-slate-700 dark:text-slate-200 text-sm">{diag.condition}</h4>
                     </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  );
};
