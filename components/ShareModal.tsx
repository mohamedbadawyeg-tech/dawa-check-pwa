import React from 'react';
import { Share } from '@capacitor/share';
import { X, Share2, Heart, Star, Copy } from 'lucide-react';

interface ShareModalProps {
  isOpen: boolean;
  onClose: () => void;
}

export const ShareModal: React.FC<ShareModalProps> = ({ isOpen, onClose }) => {
  if (!isOpen) return null;

  const handleShare = async () => {
    try {
      await Share.share({
        title: 'تطبيق صحتي - رفيقك الصحي الذكي',
        text: 'أنصحك بتحميل تطبيق صحتي لمتابعة أدويتك وصحتك بذكاء. حمل التطبيق الآن!',
        url: 'https://sahaty.app',
        dialogTitle: 'مشاركة التطبيق مع الأحباب',
      });
    } catch (error) {
      console.error('Error sharing:', error);
    }
  };

  const handleCopyLink = async () => {
     try {
        await navigator.clipboard.writeText('https://sahaty.app');
        alert('تم نسخ الرابط بنجاح ✅');
     } catch (err) {
        console.error('Failed to copy', err);
        // Fallback
        const textArea = document.createElement("textarea");
        textArea.value = 'https://sahaty.app';
        document.body.appendChild(textArea);
        textArea.select();
        document.execCommand('copy');
        document.body.removeChild(textArea);
        alert('تم نسخ الرابط بنجاح ✅');
     }
  };

  return (
    <div className="fixed inset-0 z-[300] w-full h-full bg-slate-50 dark:bg-slate-950 overflow-y-auto animate-in fade-in slide-in-from-bottom-4 duration-500">
       <div className="w-full max-w-lg mx-auto p-6 min-h-screen flex flex-col relative">
          <button 
            onClick={onClose} 
            className="absolute top-6 left-6 p-3 bg-white dark:bg-slate-800 rounded-full shadow-lg border border-slate-100 dark:border-slate-700 active:scale-90 transition-all z-10"
          >
            <X className="w-6 h-6 text-slate-600 dark:text-slate-300" />
          </button>

          <div className="flex-1 flex flex-col items-center justify-center text-center space-y-8 mt-10">
             <div className="relative">
                <div className="absolute inset-0 bg-blue-500/20 blur-[60px] rounded-full"></div>
                <div className="relative bg-gradient-to-tr from-blue-600 to-emerald-500 p-8 rounded-[3rem] shadow-2xl rotate-3 transform hover:rotate-0 transition-all duration-500">
                   <Share2 className="w-20 h-20 text-white" />
                </div>
                <div className="absolute -bottom-4 -right-4 bg-yellow-400 p-3 rounded-2xl shadow-lg animate-bounce">
                   <Star className="w-8 h-8 text-yellow-900 fill-current" />
                </div>
             </div>

             <div className="space-y-4 max-w-xs mx-auto">
                <h2 className="text-3xl font-black text-slate-900 dark:text-white leading-tight">
                   شارك العافية<br/>مع من تحب
                </h2>
                <div className="w-16 h-1.5 bg-blue-500 mx-auto rounded-full"></div>
             </div>

             <div className="bg-white dark:bg-slate-900 p-6 rounded-[2.5rem] shadow-xl border border-slate-100 dark:border-slate-800 w-full relative overflow-hidden group">
                <div className="absolute top-0 right-0 w-24 h-24 bg-emerald-100/50 dark:bg-emerald-900/20 rounded-bl-[4rem] transition-all group-hover:scale-110"></div>
                <p className="text-lg font-bold text-slate-600 dark:text-slate-300 leading-relaxed relative z-10">
                   "الدال على الخير كفاعله"
                   <br/>
                   مشاركتك للتطبيق قد تكون سبباً في حفاظ شخص على صحته وانتظام دوائه.
                   <br/>
                   <span className="text-emerald-600 dark:text-emerald-400 font-black mt-2 block">اجعلها صدقة جارية لك ولأهلك.</span>
                </p>
             </div>

             <div className="w-full space-y-4 pt-4">
                <button 
                  onClick={handleShare}
                  className="w-full py-5 bg-blue-600 hover:bg-blue-700 text-white rounded-[2rem] font-black text-xl shadow-xl shadow-blue-600/30 active:scale-[0.98] transition-all flex items-center justify-center gap-3"
                >
                  <Share2 className="w-6 h-6" />
                  مشاركة الرابط الآن
                </button>
                
                <button 
                  onClick={handleCopyLink}
                  className="w-full py-5 bg-white dark:bg-slate-800 text-slate-700 dark:text-slate-200 rounded-[2rem] font-bold text-lg border-2 border-slate-100 dark:border-slate-700 active:scale-[0.98] transition-all flex items-center justify-center gap-3"
                >
                  <Copy className="w-5 h-5" />
                  نسخ الرابط
                </button>
             </div>
          </div>
          
          <div className="text-center mt-8 text-slate-400 text-xs font-bold uppercase tracking-widest pb-4">
             شكراً لكونك جزءاً من عائلة صحتي
          </div>
       </div>
    </div>
  );
};
