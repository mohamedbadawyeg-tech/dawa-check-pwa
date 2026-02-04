import React, { useRef, useState } from 'react';
import { AppState } from '../types';
import { X, Settings, Copy, Bell, Cloud, Sparkles, Download, Upload, LogIn, LogOut, Clock, Loader2, Link as LinkIcon, Share2, ChevronLeft, Database } from 'lucide-react';
import { TIME_SLOT_CONFIG } from '../constants';
import { LocalNotifications } from '@capacitor/local-notifications';
import { Capacitor } from '@capacitor/core';
import { Filesystem, Directory, Encoding } from '@capacitor/filesystem';
import { User } from '../services/authService';
import { ScrollHint } from './ScrollHint';
import { resolvePatientId, testConnection, retryShortCodeGeneration } from '../services/firebaseService';

interface SettingsModalProps {
  isOpen: boolean;
  onClose: () => void;
  state: AppState;
  updateState: (updates: Partial<AppState> | ((prev: AppState) => AppState)) => void;
  copyPatientId: () => void;
  overlayDisplayEnabled: boolean;
  setOverlayDisplayEnabled: React.Dispatch<React.SetStateAction<boolean>>;
  setIsSubscriptionModalOpen: (isOpen: boolean) => void;
  user: User | null;
  onGoogleSignIn: () => Promise<void>;
  onAppleSignIn: () => Promise<void>;
  onSignOut: () => Promise<void>;
  onOpenShare: () => void;
}

export const SettingsModal: React.FC<SettingsModalProps> = ({
  isOpen,
  onClose,
  state,
  updateState,
  copyPatientId,
  overlayDisplayEnabled,
  setOverlayDisplayEnabled,
  setIsSubscriptionModalOpen,
  user,
  onGoogleSignIn,
  onAppleSignIn,
  onSignOut,
  onOpenShare
}) => {
  if (!isOpen) return null; // Restored conditional rendering for simple visibility control

  const fileInputRef = useRef<HTMLInputElement>(null);
  const [isVerifying, setIsVerifying] = useState(false);

  const handleFullBackup = async () => {
    const dataStr = JSON.stringify(state, null, 2);
    const fileName = `sahaty_backup_${new Date().toISOString().split('T')[0]}.json`;

    if (Capacitor.isNativePlatform()) {
      try {
        await Filesystem.writeFile({
          path: fileName,
          data: dataStr,
          directory: Directory.Documents,
          encoding: Encoding.UTF8,
        });
        alert(`تم حفظ النسخة الاحتياطية بنجاح ✅\nتم الحفظ في مجلد المستندات (Documents) باسم:\n${fileName}`);
      } catch (e) {
        console.error('Backup failed', e);
        // Fallback to Web method if native fails (might work in some webviews)
        try {
            const blob = new Blob([dataStr], { type: "application/json" });
            const url = URL.createObjectURL(blob);
            const link = document.createElement("a");
            link.href = url;
            link.download = fileName;
            document.body.appendChild(link);
            link.click();
            document.body.removeChild(link);
            alert("تم حفظ النسخة الاحتياطية بنجاح ✅\n(تم استخدام طريقة بديلة)");
        } catch (webError) {
             alert("فشل حفظ النسخة الاحتياطية ❌\nيرجى التأكد من إعطاء صلاحيات التخزين للتطبيق.");
        }
      }
    } else {
      const blob = new Blob([dataStr], { type: "application/json" });
      const url = URL.createObjectURL(blob);
      const link = document.createElement("a");
      link.href = url;
      link.download = fileName;
      document.body.appendChild(link);
      link.click();
      document.body.removeChild(link);
      alert("تم حفظ النسخة الاحتياطية بنجاح ✅\nيمكنك حفظ هذا الملف في مكان آمن.");
    }
  };

  const handleRestoreBackup = (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    if (!file) return;

    const reader = new FileReader();
    reader.onload = (e) => {
      try {
        const content = e.target?.result as string;
        const parsed = JSON.parse(content);
        
        if (!parsed.patientId && !parsed.medications) {
          alert("الملف غير صالح أو تالف ❌");
          return;
        }

        if (confirm("هل أنت متأكد من استعادة هذه النسخة؟\n⚠️ سيتم استبدال جميع البيانات الحالية بالبيانات الموجودة في الملف.")) {
          try {
            localStorage.setItem('health_track_v6', JSON.stringify(parsed));
            updateState(parsed);
            alert("تمت استعادة البيانات بنجاح ✅\nسيتم إعادة تحميل التطبيق الآن.");
            window.location.reload();
          } catch (e) {
            console.error("Error saving to localStorage", e);
            alert("حدث خطأ أثناء حفظ البيانات ❌");
          }
        }
      } catch (error) {
        alert("حدث خطأ أثناء قراءة الملف ❌");
        console.error(error);
      }
    };
    reader.readAsText(file);
    if (fileInputRef.current) fileInputRef.current.value = '';
  };

  return (
    <div className="fixed inset-0 z-[200] w-full h-full bg-slate-50 dark:bg-slate-950 overflow-y-auto pb-40 animate-in fade-in slide-in-from-bottom-4 duration-500">
      <div className="w-full max-w-2xl mx-auto p-6 relative">
        <button onClick={onClose} className="absolute top-8 left-8 p-3.5 bg-slate-50 dark:bg-slate-800 dark:text-white rounded-2xl active:scale-90 z-10"><X className="w-7 h-7"/></button>
        <h2 className="text-2xl font-black text-slate-900 dark:text-white mb-10 text-right flex items-center justify-start gap-4 mt-8">الإعدادات <Settings className="text-blue-600 w-8 h-8" /></h2>
        <div className="space-y-8 pb-4">
          {state.caregiverMode && (
            <div className="space-y-4 text-right">
              <label className="text-[11px] font-black text-slate-400 dark:text-slate-500 mr-2 uppercase">ربط حساب مريض (ID)</label>
              <div className="relative">
                <input 
                  type="text" 
                  placeholder="أدخل رمز المريض" 
                  value={state.caregiverTargetId || ''} 
                  onChange={(e) => {
                    const val = e.target.value.toUpperCase();
                    updateState({ caregiverTargetId: val });
                  }} 
                  className="w-full p-6 pl-24 bg-emerald-50/50 dark:bg-emerald-900/10 border-2 border-emerald-100 dark:border-emerald-900/30 focus:border-emerald-500 rounded-[1.8rem] font-black text-3xl text-center uppercase shadow-md dark:text-white" 
                />
                <button
                  onClick={async () => {
                    const val = state.caregiverTargetId;
                    if (!val) return;
                    setIsVerifying(true);
                    try {
                      if (val.length === 6) {
                        const resolved = await resolvePatientId(val);
                        if (resolved !== val) {
                          updateState({ caregiverTargetId: resolved });
                          alert("تم العثور على المريض وربط الحساب بنجاح ✅");
                        } else {
                          alert("لم يتم العثور على مريض بهذا الرمز ❌\nتأكد من صحة الرمز.");
                        }
                      } else if (val.length > 6) {
                        alert("تم حفظ معرف المريض ✅");
                      } else {
                         alert("الرمز قصير جداً ⚠️");
                      }
                    } catch (e: any) {
                      if (e.message === "PERMISSION_DENIED") {
                          alert("فشل التحقق بسبب صلاحيات الأمان 🔒\nيرجى تحديث Firestore Rules للسماح بقراءة مجموعة 'shortCodes'.");
                      } else {
                          alert("حدث خطأ أثناء التحقق ❌");
                      }
                    } finally {
                      setIsVerifying(false);
                    }
                  }}
                  className="absolute left-3 top-3 bottom-3 aspect-square bg-emerald-500 hover:bg-emerald-600 text-white rounded-2xl flex items-center justify-center transition-colors shadow-lg shadow-emerald-500/20"
                >
                  {isVerifying ? <Loader2 className="w-6 h-6 animate-spin" /> : <LinkIcon className="w-6 h-6" />}
                </button>
              </div>
              
              {state.caregiverHistory && state.caregiverHistory.length > 0 && (
                <div className="mt-2">
                    <p className="text-[10px] text-slate-400 mr-2 mb-2">تم استخدامها مؤخراً:</p>
                    <div className="flex flex-wrap gap-2 justify-end">
                        {state.caregiverHistory.map((historyItem) => (
                            <button
                                key={historyItem.id}
                                onClick={() => updateState({ caregiverTargetId: historyItem.id })}
                                className="px-4 py-2 bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-xl text-xs font-bold text-slate-700 dark:text-slate-300 shadow-sm flex items-center gap-2 hover:bg-slate-50 dark:hover:bg-slate-700 transition-colors"
                            >
                                <span>{historyItem.name}</span>
                                <span className="text-[10px] bg-slate-100 dark:bg-slate-900 px-1.5 py-0.5 rounded text-slate-500">{historyItem.id}</span>
                            </button>
                        ))}
                    </div>
                </div>
              )}
            </div>
          )}
          <div className="space-y-4 text-right">
            <label className="text-[11px] font-black text-slate-400 dark:text-slate-500 mr-2 uppercase">نوع الحساب</label>
            <div className="relative">
              <div className="grid grid-cols-2 gap-4 p-2 bg-slate-100 dark:bg-slate-800 rounded-[2rem]">
                <button onClick={() => { 
                  if (!state.aiSubscriptionActive) {
                      setIsSubscriptionModalOpen(true);
                      return;
                  }
                  updateState({ caregiverMode: true }); 
                }} className={`py-5 rounded-[1.5rem] font-black transition-all ${state.caregiverMode ? 'bg-white dark:bg-slate-700 text-emerald-600 dark:text-emerald-400 shadow-xl' : 'text-slate-400 dark:text-slate-500'}`}>مرافق <span className="text-[9px] bg-amber-100 text-amber-700 px-1.5 py-0.5 rounded-md mr-1">PRO</span></button>
                <button onClick={() => { updateState({ caregiverMode: false }); }} className={`py-5 rounded-[1.5rem] font-black transition-all ${!state.caregiverMode ? 'bg-white dark:bg-slate-700 text-blue-600 dark:text-blue-400 shadow-xl' : 'text-slate-400 dark:text-slate-500'}`}>مريض</button>
              </div>
            </div>
          </div>

          <div className="space-y-3 text-right">
            <label className="text-[11px] font-black text-slate-400 dark:text-slate-500 mr-2 uppercase">اسم المستخدم</label>
            <input type="text" value={state.patientName} onChange={(e) => updateState({ patientName: e.target.value })} className="w-full p-6 bg-slate-50 dark:bg-slate-800 dark:text-white border-2 dark:border-slate-700 focus:border-blue-500 outline-none rounded-[1.8rem] font-black text-lg text-right shadow-sm" />
            
            <div className="grid grid-cols-2 gap-4 mt-2">
                <div className="space-y-2">
                    <label className="text-[11px] font-black text-slate-400 dark:text-slate-500 mr-2 uppercase">السن</label>
                    <input 
                        type="number" 
                        value={state.patientAge || ''} 
                        onChange={(e) => updateState({ patientAge: parseInt(e.target.value) || 0 })} 
                        className="w-full p-4 bg-slate-50 dark:bg-slate-800 dark:text-white border-2 dark:border-slate-700 focus:border-blue-500 outline-none rounded-[1.5rem] font-black text-lg text-center shadow-sm"
                        placeholder="0"
                    />
                </div>
                <div className="space-y-2">
                    <label className="text-[11px] font-black text-slate-400 dark:text-slate-500 mr-2 uppercase">النوع</label>
                    <div className="flex bg-slate-50 dark:bg-slate-800 rounded-[1.5rem] p-1 border-2 dark:border-slate-700">
                        <button 
                            onClick={() => updateState({ patientGender: 'male' })}
                            className={`flex-1 py-3 rounded-[1.2rem] text-sm font-black transition-all ${state.patientGender === 'male' ? 'bg-blue-100 text-blue-600 shadow-sm' : 'text-slate-400'}`}
                        >
                            ذكر
                        </button>
                        <button 
                            onClick={() => updateState({ patientGender: 'female' })}
                            className={`flex-1 py-3 rounded-[1.2rem] text-sm font-black transition-all ${state.patientGender === 'female' ? 'bg-pink-100 text-pink-600 shadow-sm' : 'text-slate-400'}`}
                        >
                            أنثى
                        </button>
                    </div>
                </div>
            </div>

            <div className="flex items-center justify-between bg-blue-50/50 dark:bg-blue-900/10 p-4 rounded-[1.5rem] border border-blue-100 dark:border-blue-900/30 mt-2">
                <button onClick={() => { navigator.clipboard.writeText(state.syncCode || state.patientId); alert("تم نسخ الرمز بنجاح ✅"); }} className="p-3 bg-white dark:bg-slate-800 text-blue-600 dark:text-blue-400 rounded-xl border dark:border-slate-700 active:scale-90 shadow-sm"><Copy className="w-5 h-5"/></button>
                <div className="text-right">
                    <p className="text-[10px] font-black text-blue-600 dark:text-blue-400 uppercase tracking-widest mb-0.5">رمز المزامنة (ID)</p>
                    <div className="flex items-center justify-end gap-2">
                         {(state.syncCode || state.patientId).length > 8 && (
                             <button 
                                onClick={async () => {
                                    if (!user?.uid) {
                                        alert("يجب تسجيل الدخول أولاً لتوليد رمز قصير.");
                                        return;
                                    }
                                    const btn = document.getElementById('gen-code-btn');
                                    if(btn) btn.innerText = '...';
                                    try {
                                        const code = await retryShortCodeGeneration(user.uid);
                                        updateState({ syncCode: code });
                                        alert("تم توليد رمز قصير بنجاح! ✅");
                                    } catch(e: any) {
                                        alert("فشل توليد الرمز: " + e.message + "\nتأكد من اتصال الإنترنت وصلاحيات الحساب.");
                                    } finally {
                                        if(btn) btn.innerText = 'تحديث';
                                    }
                                }}
                                id="gen-code-btn"
                                className="text-[10px] bg-blue-600 text-white px-2 py-1 rounded-lg font-bold shadow-sm hover:bg-blue-700 transition-colors"
                             >
                                تحديث
                             </button>
                         )}
                         <p className="font-black text-xl text-slate-800 dark:text-slate-100 uppercase tabular-nums">{state.syncCode || state.patientId}</p>
                    </div>
                </div>
            </div>
          </div>

          <div className="p-6 bg-slate-50 dark:bg-slate-800 rounded-[2.2rem] border border-slate-100 dark:border-slate-700 text-right space-y-4">
            <div className="flex items-center justify-end gap-2 text-slate-800 dark:text-white font-black">
              <h3>نسخ احتياطي ومزامنة</h3>
              <Cloud className="w-5 h-5 text-blue-500" />
            </div>
            <div className="grid grid-cols-2 gap-3">
              <input 
                type="file" 
                ref={fileInputRef} 
                style={{ display: 'none' }} 
                accept=".json" 
                onChange={handleRestoreBackup} 
              />
              <button onClick={handleFullBackup} className="py-4 bg-emerald-50 dark:bg-emerald-900/20 border border-emerald-200 dark:border-emerald-800 rounded-[1.5rem] font-bold text-sm shadow-sm flex items-center justify-center gap-2 active:scale-95 transition-all text-emerald-700 dark:text-emerald-300">
                <Download className="w-5 h-5" />
                <span>حفظ نسخة كاملة</span>
              </button>
              <button onClick={() => fileInputRef.current?.click()} className="py-4 bg-blue-50 dark:bg-blue-900/20 border border-blue-200 dark:border-blue-800 rounded-[1.5rem] font-bold text-sm shadow-sm flex items-center justify-center gap-2 active:scale-95 transition-all text-blue-700 dark:text-blue-300">
                <Upload className="w-5 h-5" />
                <span>استعادة نسخة</span>
              </button>
            </div>
            <button 
                onClick={async () => {
                    const btn = document.getElementById('test-db-btn');
                    if (btn) btn.innerText = 'جاري الاتصال...';
                    const res = await testConnection();
                    alert(res.message);
                    if (btn) btn.innerText = 'اختبار اتصال قاعدة البيانات';
                }}
                id="test-db-btn"
                className="w-full py-3 mt-2 bg-slate-200 dark:bg-slate-700 text-slate-700 dark:text-slate-300 rounded-[1.2rem] font-bold text-xs flex items-center justify-center gap-2 active:scale-95 transition-all"
            >
                <Database className="w-4 h-4" />
                <span>اختبار اتصال قاعدة البيانات</span>
            </button>
          </div>

          <div className="p-6 bg-blue-50/50 dark:bg-blue-900/10 rounded-[2.2rem] border border-blue-100 dark:border-blue-900/40 text-right space-y-4">
            <div className="flex items-center justify-between gap-4">
              <div className="flex-1">
                <div className="flex items-center justify-end gap-2 text-blue-700 dark:text-blue-300 font-black text-sm">
                  <Sparkles className="w-5 h-5" />
                  <span>اشتراك التحليل الذكي الشهري</span>
                </div>
                <p className="text-[11px] text-slate-600 dark:text-slate-400 mt-1">
                  كل خدمات الذكاء الاصطناعي (التحليل الصوتي والنصي) تعمل للمشتركين فقط.
                </p>
              </div>
              <button
                onClick={() => {
                  setIsSubscriptionModalOpen(true);
                }}
                className="px-4 py-2 rounded-2xl text-xs font-black shadow-md transition-all bg-blue-600 text-white"
              >
                إدارة الاشتراك
              </button>
            </div>
            <div className="flex items-center justify-end gap-2 text-[11px] font-bold">
              <span className={state.aiSubscriptionActive ? 'text-emerald-600 dark:text-emerald-400' : 'text-slate-500 dark:text-slate-400'}>
                {state.aiSubscriptionActive ? 'الاشتراك مفعل حالياً' : 'الاشتراك غير مفعل'}
              </span>
            </div>
          </div>

          <div className="space-y-4 text-right">
            <label className="text-[11px] font-black text-slate-400 dark:text-slate-500 mr-2 uppercase">رقم الصيدلية (واتساب)</label>
            <input 
              type="text" 
              placeholder="أدخل رقم واتساب الصيدلية (مثال: 201012345678)" 
              value={state.pharmacyPhone || ''} 
              onChange={(e) => { 
                const val = e.target.value.replace(/[^0-9]/g, '');
                updateState({ pharmacyPhone: val }); 
              }} 
              className="w-full p-4 bg-slate-50 dark:bg-slate-800 border-2 border-slate-100 dark:border-slate-700 focus:border-blue-500 rounded-[1.8rem] font-bold text-xs text-left ltr shadow-inner dark:text-white" 
            />
            <p className="text-[10px] text-slate-400 pr-2">اكتب الرقم بكود الدولة بدون علامة + (مثال لمصر: 201012345678)</p>
          </div>

          <div className="p-6 bg-slate-50 dark:bg-slate-800 rounded-[2.2rem] border border-slate-100 dark:border-slate-700 text-right space-y-4">
            <div className="flex items-center justify-end gap-2 text-slate-800 dark:text-white font-black">
              <h3>تخصيص مواعيد الجرعات</h3>
              <Clock className="w-5 h-5 text-purple-500" />
            </div>
            <div className="grid grid-cols-2 gap-3">
              {(Object.keys(state.slotHours || {}) as Array<keyof typeof state.slotHours>).map((slot) => (
                <div key={slot} className="bg-white dark:bg-slate-900 p-3 rounded-2xl border border-slate-100 dark:border-slate-700 space-y-2">
                  <input 
                      type="text"
                      value={state.customSlotNames?.[slot] || TIME_SLOT_CONFIG[slot]?.label || ''}
                      onChange={(e) => {
                           const val = e.target.value;
                           updateState(prev => ({
                               ...prev,
                               customSlotNames: {
                                   ...(prev.customSlotNames || {}),
                                   [slot]: val
                               }
                           }));
                      }}
                      className="w-full bg-transparent text-[11px] font-bold text-slate-400 dark:text-slate-500 mb-1 outline-none border-b border-dashed border-slate-200 focus:border-blue-500 focus:text-blue-600 transition-colors text-right"
                      placeholder="اسم الموعد"
                  />
                  <div className="flex items-center gap-2" dir="ltr">
                    <input 
                      type="time" 
                      value={state.slotHours?.[slot]?.toString() ?? ''} 
                      onChange={(e) => {
                        const valStr = e.target.value;
                        if (valStr === '') {
                           updateState(prev => {
                             const newSlots = { ...(prev.slotHours || {}) };
                             delete newSlots[slot];
                             return { ...prev, slotHours: newSlots };
                           });
                           return;
                        }
                        updateState(prev => ({
                             ...prev,
                             slotHours: {
                               ...(prev.slotHours || {}),
                               [slot]: valStr
                             }
                        }));
                      }}
                      className="w-full bg-transparent font-black text-lg text-slate-800 dark:text-white outline-none text-center"
                    />
                  </div>
                </div>
              ))}
            </div>
            <p className="text-[10px] text-slate-400 pr-2">حدد الساعة (0-23) التي يبدأ فيها كل موعد.</p>
          </div>



          {/* Account Management Section */}
          <div className="space-y-4 text-right border-t border-slate-100 dark:border-slate-800 pt-6">
             <label className="text-[11px] font-black text-slate-400 dark:text-slate-500 mr-2 uppercase">الحساب</label>
             {user ? (
                 <div className="space-y-3">
                     <div className="flex items-center justify-between p-4 bg-slate-50 dark:bg-slate-800/50 rounded-2xl border border-slate-100 dark:border-slate-800">
                        <div className="flex items-center gap-3">
                           {user.photoURL ? (
                             <img src={user.photoURL} alt="Profile" className="w-10 h-10 rounded-full" />
                           ) : (
                             <div className="w-10 h-10 rounded-full bg-blue-100 dark:bg-blue-900 flex items-center justify-center">
                               <span className="text-blue-600 dark:text-blue-300 font-bold text-lg">{user.displayName?.charAt(0) || 'U'}</span>
                             </div>
                           )}
                           <div className="text-right">
                              <p className="font-bold text-slate-800 dark:text-slate-200 text-sm">{user.displayName}</p>
                              <p className="text-xs text-slate-500">{user.email}</p>
                           </div>
                        </div>
                        <span className="px-2 py-1 bg-green-100 dark:bg-green-900 text-green-700 dark:text-green-300 text-[10px] rounded-lg font-bold">متصل</span>
                     </div>
                     <button 
                       onClick={() => {
                           if (confirm("هل أنت متأكد من تسجيل الخروج؟")) {
                               onSignOut();
                               onClose();
                           }
                       }}
                       className="w-full py-4 bg-red-50 dark:bg-red-900/10 text-red-600 dark:text-red-400 rounded-2xl font-black text-sm flex items-center justify-center gap-2 hover:bg-red-100 transition-colors"
                     >
                       <LogOut className="w-5 h-5" />
                       تسجيل الخروج
                     </button>
                 </div>
             ) : (
                 <div className="space-y-3">
                    <p className="text-xs text-slate-500 dark:text-slate-400 mb-2">قم بتسجيل الدخول لحفظ بياناتك سحابياً والوصول إليها من أي جهاز.</p>
                    <button 
                      onClick={async () => {
                          try {
                            await onGoogleSignIn();
                            // Don't close immediately to show updated state
                          } catch (e) {
                            console.error("Login failed in settings", e);
                            alert("فشل تسجيل الدخول. يرجى المحاولة مرة أخرى.");
                          }
                      }}
                      className="w-full py-4 bg-slate-50 dark:bg-slate-800 text-slate-700 dark:text-slate-200 rounded-2xl font-black text-sm flex items-center justify-center gap-2 border border-slate-200 dark:border-slate-700 hover:bg-slate-100 transition-colors"
                    >
                      <img src="https://www.svgrepo.com/show/475656/google-color.svg" className="w-5 h-5" alt="Google" />
                      تسجيل الدخول باستخدام Google
                    </button>
                    {Capacitor.getPlatform() === 'ios' && (
                        <button 
                          onClick={() => {
                              onAppleSignIn();
                              onClose();
                          }}
                          className="w-full py-4 bg-black text-white rounded-2xl font-black text-sm flex items-center justify-center gap-2 hover:bg-slate-900 transition-colors"
                        >
                          <svg className="w-5 h-5 fill-current" viewBox="0 0 24 24"><path d="M17.05 20.28c-.98.95-2.05.8-3.08.35-1.09-.46-2.09-.48-3.24 0-1.44.62-2.2.44-3.06-.35C2.79 15.25 3.51 7.59 9.05 7.31c1.35.07 2.29.74 3.08.74 1.18 0 2.21-1.23 3.96-1.14.95.05 1.93.5 2.54 1.29-2.31 1.15-2.01 4.5 1 5.6-.46 1.35-1.25 2.76-2.58 4.48zM12.03 7.25c-.15-2.23 1.66-4.07 3.74-4.25.16 2.22-1.84 4.08-3.74 4.25z"/></svg>
                          تسجيل الدخول باستخدام Apple
                        </button>
                    )}
                 </div>
             )}
          </div>

          <div className="bg-white dark:bg-slate-900 rounded-[2.5rem] p-2 shadow-lg border border-slate-100 dark:border-slate-800">
                <button onClick={onOpenShare} className="w-full p-6 flex items-center justify-between group active:scale-[0.98] transition-all">
                  <div className="flex items-center gap-4">
                    <div className="bg-gradient-to-br from-indigo-500 to-purple-600 p-3.5 rounded-2xl text-white shadow-lg group-hover:scale-110 transition-transform">
                      <Share2 className="w-6 h-6" />
                    </div>
                    <div className="text-right">
                      <h3 className="font-bold text-slate-800 dark:text-white text-lg">مشاركة التطبيق</h3>
                      <p className="text-xs text-slate-500 font-medium mt-1">شارك الخير مع من تحب</p>
                    </div>
                  </div>
                  <div className="w-10 h-10 rounded-full bg-slate-50 dark:bg-slate-800 flex items-center justify-center text-slate-400 group-hover:bg-indigo-50 dark:group-hover:bg-indigo-900/30 group-hover:text-indigo-600 transition-colors">
                    <ChevronLeft className="w-6 h-6" />
                  </div>
                </button>
              </div>

              <button onClick={onClose} className={`w-full py-6 text-white rounded-[2rem] font-black text-xl shadow-2xl active:scale-[0.98] transition-all mt-4 ${state.caregiverMode ? 'bg-emerald-600' : 'bg-slate-900 dark:bg-slate-800'}`}>العودة للرئيسية</button>
        </div>
      </div>
      <ScrollHint position="fixed" />
    </div>
  );
};
