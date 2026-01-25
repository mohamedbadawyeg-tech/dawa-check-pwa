import React from 'react';
import { X, Edit3, Sparkles, Share2, RefreshCw, Lock } from 'lucide-react';
import { openWhatsApp } from '../utils/whatsapp';
import { ScrollHint } from './ScrollHint';

interface DietModalProps {
  isOpen: boolean;
  onClose: () => void;
  isCaregiverMode: boolean;
  dietGuidelines: string;
  displayedDietPlan: string | null;
  selectedHistoryDate: Date | null;
  onUpdateDietGuidelines: (newGuidelines: string) => void;
  onGenerateDiet: () => void;
  isGenerating: boolean;
  hasSubscription: boolean;
  onOpenSubscription: () => void;
}

export const DietModal: React.FC<DietModalProps> = ({
  isOpen,
  onClose,
  isCaregiverMode,
  dietGuidelines,
  displayedDietPlan,
  selectedHistoryDate,
  onUpdateDietGuidelines,
  onGenerateDiet,
  isGenerating,
  hasSubscription,
  onOpenSubscription
}) => {
  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-[190] flex items-center justify-center p-4 bg-slate-900/95 backdrop-blur-xl animate-in fade-in duration-300">
      <div className="bg-white dark:bg-slate-900 w-full max-w-2xl rounded-[3rem] shadow-2xl relative max-h-[92vh] flex flex-col overflow-hidden border-t-[14px] border-emerald-600">
        <div className="p-8 pb-5 border-b border-slate-100 dark:border-slate-800 flex items-center justify-between bg-emerald-50/40 dark:bg-emerald-900/10">
           <button onClick={onClose} className="p-3.5 bg-white dark:bg-slate-800 text-slate-800 dark:text-slate-200 rounded-2xl active:scale-90"><X className="w-7 h-7"/></button>
           <div className="text-right">
             <h2 className="text-2xl font-black text-slate-800 dark:text-white">{isCaregiverMode ? 'تعديل نظام الأكل' : 'نظام الأكل المعتمد'}</h2>
             <p className="text-emerald-600 dark:text-emerald-400 text-[10px] font-black uppercase mt-1">توصيات مخصصة</p>
           </div>
        </div>
        <div className="flex-1 overflow-y-auto p-8 custom-scrollbar text-right space-y-10 bg-white dark:bg-slate-900">
          {!displayedDietPlan && !isCaregiverMode && (
             <div className="flex flex-col items-center justify-center py-10 text-center space-y-4 opacity-70">
                <Sparkles className="w-16 h-16 text-emerald-200"/>
                <p className="text-slate-400 font-bold">لا يوجد نظام غذائي مقترح لهذا اليوم</p>
             </div>
          )}
          {displayedDietPlan && !isCaregiverMode && (
            <div className="mb-6 p-6 bg-blue-50 dark:bg-blue-900/20 rounded-[2.5rem] border border-blue-100 dark:border-blue-800">
              <div className="flex items-center justify-end gap-3 mb-4 text-blue-700 dark:text-blue-300">
                <h3 className="font-black text-lg">اقتراح الذكاء الاصطناعي {selectedHistoryDate ? 'لذلك اليوم' : 'لليوم'}</h3>
                <Sparkles className="w-6 h-6"/>
              </div>
              <p className="whitespace-pre-wrap font-bold text-blue-900 dark:text-blue-100 leading-relaxed text-base">{displayedDietPlan}</p>
            </div>
          )}
          {isCaregiverMode ? (
            <div className="space-y-4">
              <label className="flex items-center justify-end gap-2 text-emerald-700 dark:text-emerald-500 font-black text-lg">اكتب توصيات الأكل <Edit3 className="w-5 h-5"/></label>
              <textarea 
                value={dietGuidelines}
                onChange={(e) => onUpdateDietGuidelines(e.target.value)}
                className="w-full p-6 bg-slate-50 dark:bg-slate-800 border-2 border-slate-100 dark:border-slate-700 focus:border-emerald-500 focus:bg-white dark:focus:bg-slate-700 outline-none rounded-[2rem] font-bold text-right shadow-inner min-h-[400px] resize-none leading-relaxed text-slate-800 dark:text-slate-100"
                placeholder="مثال: الفطار: بيضة مسلوقة..."
              />
            </div>
          ) : (
            <div className="bg-slate-50 dark:bg-slate-800 p-7 rounded-[2.5rem] border border-slate-100 dark:border-slate-700 whitespace-pre-wrap font-bold text-slate-700 dark:text-slate-200 leading-relaxed text-lg">
              {dietGuidelines}
            </div>
          )}
        </div>
        <ScrollHint />
        <div className="p-8 border-t border-slate-100 dark:border-slate-800 bg-white dark:bg-slate-900 flex flex-col gap-4">
           <button 
             onClick={() => hasSubscription ? onGenerateDiet() : onOpenSubscription()}
             disabled={isGenerating}
             className={`w-full py-5 rounded-[2rem] font-black text-xl shadow-lg active:scale-[0.98] transition-all flex items-center justify-center gap-2 ${
               hasSubscription 
                 ? 'bg-blue-600 text-white shadow-blue-500/30 hover:bg-blue-700' 
                 : 'bg-slate-100 text-slate-500 dark:bg-slate-800 dark:text-slate-400'
             } ${isGenerating ? 'opacity-80 cursor-wait' : ''}`}
           >
             {isGenerating ? (
               <>
                 <RefreshCw className="w-6 h-6 animate-spin" />
                 جاري إعداد النظام...
               </>
             ) : hasSubscription ? (
               <>
                 <Sparkles className="w-6 h-6" />
                 {displayedDietPlan ? 'تحديث مقترح الذكاء الاصطناعي' : 'توليد نظام غذائي ذكي'}
               </>
             ) : (
               <>
                 <Lock className="w-5 h-5" />
                 توليد نظام غذائي (للمشتركين فقط)
               </>
             )}
           </button>

           <button onClick={() => {
              const textToShare = (displayedDietPlan || dietGuidelines || '').trim();
              if (textToShare) {
                  openWhatsApp(`*نظام الأكل الصحي الخاص بي* 🥗\n\n${textToShare}`);
              } else {
                  alert("لا يوجد نظام غذائي لمشاركته حالياً.");
              }
            }} className="w-full py-5 bg-emerald-100 text-emerald-700 dark:bg-emerald-900/30 dark:text-emerald-300 rounded-[2rem] font-black text-xl shadow-sm active:scale-[0.98] transition-all flex items-center justify-center gap-2">
              <Share2 className="w-6 h-6" />
              مشاركة عبر واتساب
            </button>
        </div>
      </div>
    </div>
  );
};
