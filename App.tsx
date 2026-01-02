
import React, { useState, useEffect, useRef, useCallback } from 'react';
import { MEDICATIONS as DEFAULT_MEDICATIONS, TIME_SLOT_CONFIG, SLOT_HOURS, SYMPTOMS, CATEGORY_COLORS, MEDICAL_HISTORY_SUMMARY, DIET_GUIDELINES } from './constants';
import { AppState, TimeSlot, AIAnalysisResult, HealthReport, Medication, DayHistory } from './types';
import { analyzeHealthStatus, generateDailyHealthTip } from './services/geminiService';
import { speakText, stopSpeech, playChime } from './services/audioService';
import { syncPatientData, listenToPatient, generateSyncId, sendRemoteReminder, requestForToken, onForegroundMessage, saveTokenToDatabase } from './services/firebaseService';
import { 
  Heart, 
  Activity, 
  ClipboardList, 
  CheckCircle, 
  BrainCircuit, 
  RefreshCw,
  Settings,
  X, 
  Plus,
  Calendar as CalendarIcon,
  Wind,
  Trash2,
  Pencil,
  VolumeX,
  Volume2,
  PlusCircle,
  Clock,
  Stethoscope as DoctorIcon,
  AlertTriangle,
  UserCog,
  Copy,
  Cloud,
  Wifi,
  WifiOff,
  Smile,
  Droplets,
  ChevronLeft,
  FileText,
  MessageSquare,
  Sparkles,
  Moon,
  Sun,
  Utensils,
  Minus,
  Zap,
  Bell,
  BellOff,
  UtensilsCrossed,
  Check,
  Ban,
  Users,
  UserPlus,
  Bed,
  Info,
  Share2,
  History,
  Save,
  Edit3,
  ListTodo,
  Frown,
  Meh
} from 'lucide-react';

/**
 * Robustly sanitizes an object to ensure it is safe for JSON stringification.
 * Specifically handles circular references and prunes complex non-plain objects.
 */
const makeJsonSafe = (obj: any): any => {
  const cache = new WeakSet();
  const replacer = (_key: string, value: any) => {
    if (value !== null && typeof value === 'object') {
      if (cache.has(value)) return undefined; // Prune circularity
      cache.add(value);
      
      // Strict check for plain objects and arrays
      const proto = Object.getPrototypeOf(value);
      const isPlain = Array.isArray(value) || proto === null || proto === Object.prototype;
      
      // Detect React elements or hidden circular props
      if (value.$$typeof || value._owner || (value.constructor && value.constructor.name === 'FiberNode')) {
        return undefined;
      }

      if (!isPlain) {
        // Handle special known types, otherwise stringify to prevent circularity errors
        if (typeof value.toDate === 'function') return value.toDate().getTime();
        if (value.path && typeof value.path === 'string') return value.path; // Handle Firebase References
        return String(value);
      }
    }
    return value;
  };

  try {
    const stringified = JSON.stringify(obj, replacer);
    return JSON.parse(stringified);
  } catch (e) {
    console.error("Safe stringify failed in makeJsonSafe", e);
    return {};
  }
};

const App: React.FC = () => {
  const today = new Date().toISOString().split('T')[0];
  const [now, setNow] = useState(new Date());
  const [isSyncing, setIsSyncing] = useState(false);
  const [lastSyncedTime, setLastSyncedTime] = useState<string | null>(null);
  const [isOnline, setIsOnline] = useState(navigator.onLine);
  const [isMuted, setIsMuted] = useState(false);
  const [notificationPermission, setNotificationPermission] = useState<NotificationPermission>(
    typeof Notification !== 'undefined' ? Notification.permission : 'default'
  );

  const lastLocalActionTime = useRef<number>(0);
  const lastSyncedHash = useRef<string>("");
  const isDirty = useRef<boolean>(false);
  const lastHandledReminderTime = useRef<number>(0);

  const [state, setState] = useState<AppState>(() => {
    const saved = localStorage.getItem('health_track_v6');
    if (saved) {
      try {
        const parsed = JSON.parse(saved);
        const isSameDay = parsed.currentReport?.date === today;
        if (!isSameDay && parsed.currentReport?.date) {
          const yesterdayDate = parsed.currentReport.date;
          parsed.dailyReports = parsed.dailyReports || {};
          parsed.dailyReports[yesterdayDate] = {
            report: parsed.currentReport,
            takenMedications: parsed.takenMedications || {}
          };
        }
        return {
          ...parsed,
          patientId: parsed.patientId || generateSyncId(),
          medications: parsed.medications || DEFAULT_MEDICATIONS,
          medicalHistorySummary: parsed.medicalHistorySummary || MEDICAL_HISTORY_SUMMARY,
          dietGuidelines: parsed.dietGuidelines || DIET_GUIDELINES,
          upcomingProcedures: parsed.upcomingProcedures || "لا توجد إجراءات مسجلة حالياً.",
          takenMedications: isSameDay ? (parsed.takenMedications || {}) : {},
          sentNotifications: isSameDay ? (parsed.sentNotifications || []) : [],
          customReminderTimes: parsed.customReminderTimes || {},
          darkMode: parsed.darkMode ?? false,
          notificationsEnabled: parsed.notificationsEnabled ?? true,
          currentReport: isSameDay ? parsed.currentReport : {
            date: today, healthRating: 0, painLevel: 0, sleepQuality: '', appetite: '', symptoms: [], otherSymptoms: '', notes: '', additionalNotes: '',
            systolicBP: 0, diastolicBP: 0, bloodSugar: 0, oxygenLevel: 0, heartRate: 0, waterIntake: 0, mood: ''
          }
        };
      } catch (e) { console.error(e); }
    }
    return {
      patientName: "الحاج ممدوح عبد العال",
      patientAge: 75,
      patientId: generateSyncId(),
      caregiverMode: false,
      caregiverTargetId: null,
      medications: DEFAULT_MEDICATIONS,
      medicalHistorySummary: MEDICAL_HISTORY_SUMMARY,
      dietGuidelines: DIET_GUIDELINES,
      upcomingProcedures: "لا توجد إجراءات مسجلة حالياً.",
      takenMedications: {},
      notificationsEnabled: true,
      sentNotifications: [],
      customReminderTimes: {},
      darkMode: false,
      history: [],
      dailyReports: {},
      currentReport: {
        date: today, healthRating: 0, painLevel: 0, sleepQuality: '', appetite: '', symptoms: [], otherSymptoms: '', notes: '', additionalNotes: '',
        systolicBP: 0, diastolicBP: 0, bloodSugar: 0, oxygenLevel: 0, heartRate: 0, waterIntake: 0, mood: ''
      }
    };
  });

  const [aiResult, setAiResult] = useState<AIAnalysisResult | null>(null);
  const [isAnalyzing, setIsAnalyzing] = useState(false);
  const [isSettingsOpen, setIsSettingsOpen] = useState(false);
  const [isReportOpen, setIsReportOpen] = useState(false);
  const [isCalendarOpen, setIsCalendarOpen] = useState(false);
  const [isMedManagerOpen, setIsMedManagerOpen] = useState(false);
  const [isMedicalSummaryOpen, setIsMedicalSummaryOpen] = useState(false);
  const [isDietModalOpen, setIsDietModalOpen] = useState(false);
  const [isProceduresModalOpen, setIsProceduresModalOpen] = useState(false);
  const [editingMed, setEditingMed] = useState<Partial<Medication> | null>(null);
  const [idToDelete, setIdToDelete] = useState<string | null>(null);
  const [selectedHistoryDate, setSelectedHistoryDate] = useState<string | null>(null);

  useEffect(() => {
    const root = window.document.documentElement;
    const metaTheme = document.querySelector('meta[name="theme-color"]');
    if (state.darkMode) {
      root.classList.add('dark');
      document.body.style.backgroundColor = '#020617';
      metaTheme?.setAttribute('content', '#020617');
    } else {
      root.classList.remove('dark');
      document.body.style.backgroundColor = '#f8fafc';
      metaTheme?.setAttribute('content', '#2563eb');
    }
  }, [state.darkMode]);

  const requestNotificationPermission = async () => {
    if (!('Notification' in window)) {
      alert("هذا المتصفح لا يدعم الإشعارات.");
      return;
    }
    
    try {
      const permission = await Notification.requestPermission();
      setNotificationPermission(permission);
      
      if (permission === 'granted') {
        // Get FCM Token
        const token = await requestForToken();
        if (token) {
          const targetId = state.caregiverMode ? state.caregiverTargetId : state.patientId;
          if (targetId) {
            await saveTokenToDatabase(targetId, token);
          }
          console.log("FCM Token:", token);
        }

        alert("تم تفعيل الإشعارات بنجاح! ستصلك التنبيهات في مواعيد الدواء حتى والتطبيق مغلق.");
        new Notification("صحتي", { body: "الإشعارات الخلفية تعمل الآن بنجاح ✅", icon: 'https://cdn-icons-png.flaticon.com/512/3063/3063176.png' });
      }
    } catch (error) {
      console.error("Permission request failed", error);
    }
  };

  useEffect(() => {
    if (notificationPermission === 'granted') {
      const fetchToken = async () => {
        const token = await requestForToken();
        if (token) {
          const targetId = state.caregiverMode ? state.caregiverTargetId : state.patientId;
          if (targetId) {
            await saveTokenToDatabase(targetId, token);
          }
          console.log("FCM Token retrieved on mount:", token);
        }
      };
      fetchToken();
    }
  }, [notificationPermission, state.patientId, state.caregiverMode, state.caregiverTargetId]);

  useEffect(() => {
    // Listen for foreground messages
    const unsubscribe = onForegroundMessage((payload) => {
      console.log('Foreground message:', payload);
      const { title, body } = payload.notification || {};
      if (title) {
        new Notification(title, { 
          body, 
          icon: 'https://cdn-icons-png.flaticon.com/512/3063/3063176.png' 
        });
        
        if (!isMuted && body) { 
           playChime().then(() => speakText(body)); 
        }
      }
    });
    return () => unsubscribe && unsubscribe(); // onMessage returns unsubscribe function
  }, [isMuted]);

  useEffect(() => {
    const currentDayStr = now.toISOString().split('T')[0];
    if (state.currentReport.date && state.currentReport.date !== currentDayStr) {
      setState(prev => {
        const yesterdayDate = prev.currentReport.date;
        const newDailyReports = { ...prev.dailyReports };
        newDailyReports[yesterdayDate] = {
          report: prev.currentReport,
          takenMedications: prev.takenMedications
        };
        
        return {
          ...prev,
          takenMedications: {},
          sentNotifications: [],
          currentReport: {
            date: currentDayStr,
            healthRating: 0,
            painLevel: 0,
            sleepQuality: '',
            appetite: '',
            symptoms: [],
            otherSymptoms: '',
            notes: '',
            additionalNotes: '',
            systolicBP: 0,
            diastolicBP: 0,
            bloodSugar: 0,
            oxygenLevel: 0, heartRate: 0, waterIntake: 0, mood: ''
          },
          dailyReports: newDailyReports
        };
      });
      isDirty.current = true;
    }
  }, [now, state.currentReport.date]);

  useEffect(() => {
    const handleOnline = () => setIsOnline(true);
    const handleOffline = () => setIsOnline(false);
    window.addEventListener('online', handleOnline);
    window.addEventListener('offline', handleOffline);
    return () => {
      window.removeEventListener('online', handleOnline);
      window.removeEventListener('offline', handleOffline);
    };
  }, []);

  useEffect(() => {
    try {
      const safeState = makeJsonSafe(state);
      localStorage.setItem('health_track_v6', JSON.stringify(safeState));
    } catch (e) { console.error(e); }
  }, [state]);

  // Combined Notification Effect for Patient, Caregiver, and Daily AI Tips
  useEffect(() => {
    if (!state.notificationsEnabled) return;
    
    const checkAndNotify = async () => {
      const h = new Date().getHours();
      const todayStr = new Date().toISOString().split('T')[0];
      
      // --- logic for Daily AI Health Tip ---
      // We check if it's afternoon (between 12 and 18) and tip not sent yet today
      if (!state.caregiverMode && state.lastDailyTipDate !== todayStr && h >= 10) {
        try {
          const tip = await generateDailyHealthTip(state);
          if (Notification.permission === 'granted') {
             const title = "نصيحة صحية لك 💡";
             if ('serviceWorker' in navigator && navigator.serviceWorker.controller) {
                const reg = await navigator.serviceWorker.ready;
                reg.showNotification(title, { 
                  body: tip, icon: 'https://cdn-icons-png.flaticon.com/512/883/883356.png',
                  badge: 'https://cdn-icons-png.flaticon.com/512/883/883356.png',
                  tag: 'daily-ai-tip'
                } as any);
             } else { new Notification(title, { body: tip }); }
             
             // Update state to prevent re-sending today
             setState(prev => ({ ...prev, lastDailyTipDate: todayStr, dailyTipContent: tip }));
             isDirty.current = true;
          }
        } catch (e) { console.error("Error generating daily tip:", e); }
      }

      // --- existing Medication notification logic ---
      if (state.caregiverMode && !state.caregiverTargetId) return;

      state.medications.forEach(med => {
        const slotHour = SLOT_HOURS[med.timeSlot];
        const notifId = `${todayStr}-${med.id}-${state.caregiverMode ? 'cg' : 'pt'}`;
        
        if (h >= slotHour && !state.takenMedications[med.id] && !state.sentNotifications.includes(notifId)) {
          if (Notification.permission === 'granted') {
             const title = state.caregiverMode ? "تنبيه للمرافق: دواء متأخر ⚠️" : "تذكير بموعد الدواء 💊";
             const body = state.caregiverMode 
               ? `تأخر ${state.patientName} في تناول دواء ${med.name} (${med.dosage})`
               : `يا حاج ${state.patientName}، حان موعد تناول ${med.name} (${med.dosage})`;

             if ('serviceWorker' in navigator && navigator.serviceWorker.controller) {
                navigator.serviceWorker.ready.then(reg => {
                  reg.showNotification(title, { 
                    body, icon: 'https://cdn-icons-png.flaticon.com/512/3063/3063176.png', 
                    badge: 'https://cdn-icons-png.flaticon.com/512/3063/3063176.png',
                    vibrate: [200, 100, 200], tag: med.id, renotify: true
                  } as any);
                });
             } else { new Notification(title, { body }); }
             
             if (!isMuted) { 
               const speechText = state.caregiverMode 
                 ? `تنبيه للمرافق: المريض تأخر في تناول دواء ${med.name}`
                 : `تذكير بموعد الدواء: حان وقت تناول ${med.name}. من فضلك لا تنسى.`;
               playChime().then(() => speakText(speechText)); 
             }
             setState(prev => ({ ...prev, sentNotifications: [...prev.sentNotifications, notifId] }));
          }
        }
      });
    };
    const timer = setInterval(checkAndNotify, 60000);
    checkAndNotify();
    return () => clearInterval(timer);
  }, [state.notificationsEnabled, state.medications, state.takenMedications, state.sentNotifications, isMuted, state.caregiverMode, state.patientName, state.caregiverTargetId, state.lastDailyTipDate]);

  useEffect(() => {
    const handleRemoteReminder = async () => {
      if (!state.remoteReminder || isMuted || state.caregiverMode) return;
      const { timestamp, medName } = state.remoteReminder;
      const fiveMinutesAgo = Date.now() - 300000;
      if (timestamp > lastHandledReminderTime.current && timestamp > fiveMinutesAgo) {
        lastHandledReminderTime.current = timestamp;
        try {
          await playChime();
          await speakText(`تنبيه هام من المرافق: حان الآن موعد تناول دواء ${medName}. فضلاً لا تتأخر.`);
        } catch (e) { console.error(e); }
      }
    };
    handleRemoteReminder();
  }, [state.remoteReminder, isMuted, state.caregiverMode]);

  useEffect(() => {
    const targetId = state.caregiverMode ? state.caregiverTargetId : state.patientId;
    if (!targetId || targetId.length < 4) return;
    const unsubscribe = listenToPatient(targetId, (remoteData) => {
      const nowMs = Date.now();
      if (nowMs - lastLocalActionTime.current < 3000) return;
      setState(prev => {
        const remoteSubset = makeJsonSafe({
          m: remoteData.medications, tr: remoteData.takenMedications, cr: remoteData.currentReport,
          dr: remoteData.dailyReports, rr: remoteData.remoteReminder, mh: remoteData.medicalHistorySummary, 
          dg: remoteData.dietGuidelines, up: remoteData.upcomingProcedures, tip: remoteData.lastDailyTipDate
        });
        const remoteHash = JSON.stringify(remoteSubset);
        const localSubset = makeJsonSafe({
          m: prev.medications, tr: prev.takenMedications, cr: prev.currentReport,
          dr: prev.dailyReports, rr: prev.remoteReminder, mh: prev.medicalHistorySummary, 
          dg: prev.dietGuidelines, up: prev.upcomingProcedures, tip: prev.lastDailyTipDate
        });
        const localHash = JSON.stringify(localSubset);
        if (remoteHash !== localHash) {
          isDirty.current = false;
          lastSyncedHash.current = remoteHash;
          setLastSyncedTime(new Date().toLocaleTimeString('ar-EG', { hour: '2-digit', minute: '2-digit', second: '2-digit' }));
          return {
            ...prev,
            medications: remoteData.medications || prev.medications,
            currentReport: remoteData.currentReport || prev.currentReport,
            takenMedications: remoteData.takenMedications || prev.takenMedications,
            dailyReports: remoteData.dailyReports || prev.dailyReports,
            patientName: remoteData.patientName || prev.patientName,
            remoteReminder: remoteData.remoteReminder || prev.remoteReminder,
            medicalHistorySummary: remoteData.medicalHistorySummary || prev.medicalHistorySummary,
            dietGuidelines: remoteData.dietGuidelines || prev.dietGuidelines,
            upcomingProcedures: remoteData.upcomingProcedures || prev.upcomingProcedures,
            lastDailyTipDate: remoteData.lastDailyTipDate || prev.lastDailyTipDate,
            dailyTipContent: remoteData.dailyTipContent || prev.dailyTipContent
          };
        }
        return prev;
      });
    });
    return () => unsubscribe();
  }, [state.caregiverMode, state.caregiverTargetId, state.patientId]);

  useEffect(() => {
    const sync = async () => {
      const targetId = state.caregiverMode ? state.caregiverTargetId : state.patientId;
      if (!targetId || !isOnline || !isDirty.current) return;
      const safeStateSubset = makeJsonSafe({
        m: state.medications, tr: state.takenMedications, cr: state.currentReport,
        dr: state.dailyReports, mh: state.medicalHistorySummary, dg: state.dietGuidelines,
        up: state.upcomingProcedures, tip: state.lastDailyTipDate
      });
      const currentHash = JSON.stringify(safeStateSubset);
      if (currentHash === lastSyncedHash.current) { isDirty.current = false; return; }
      setIsSyncing(true);
      try {
        await syncPatientData(targetId, state);
        lastSyncedHash.current = currentHash;
        isDirty.current = false;
        setLastSyncedTime(new Date().toLocaleTimeString('ar-EG', { hour: '2-digit', minute: '2-digit', second: '2-digit' }));
      } catch (err: any) { console.error(err); } finally { setTimeout(() => setIsSyncing(false), 500); }
    };
    const timer = setTimeout(sync, 2500);
    return () => clearTimeout(timer);
  }, [state.medications, state.currentReport, state.takenMedications, state.dailyReports, state.medicalHistorySummary, state.dietGuidelines, state.upcomingProcedures, isOnline, state.caregiverMode, state.caregiverTargetId, state.lastDailyTipDate]);

  useEffect(() => {
    const timer = setInterval(() => setNow(new Date()), 60000);
    return () => clearInterval(timer);
  }, []);

  const activeMedications = state.medications;
  const activeTakenMeds = state.takenMedications;
  const activeReport = state.currentReport;
  const activeName = state.patientName;
  const activeDailyReports = state.dailyReports;
  const currentHour = now.getHours();

  const toggleMedication = useCallback((id: string) => {
    lastLocalActionTime.current = Date.now();
    isDirty.current = true;
    const med = activeMedications.find(m => m.id === id);
    const isCurrentlyTaken = state.takenMedications[id];
    if (med?.isCritical && isCurrentlyTaken) {
      if (!window.confirm(`دواء "${med.name}" ضروري جداً. هل أنت متأكد من التراجع؟`)) {
        lastLocalActionTime.current = 0; isDirty.current = false; return;
      }
    }
    setState(prev => {
      const isTaken = !prev.takenMedications[id];
      const newTaken = { ...prev.takenMedications, [id]: isTaken };
      const log = {
        date: new Date().toLocaleDateString('ar-EG'),
        action: isTaken ? '✅ تناول الجرعة' : '🔄 تراجع عن الجرعة',
        details: med?.name || id,
        timestamp: new Date().toLocaleTimeString('ar-EG', { hour: '2-digit', minute: '2-digit' })
      };
      const newDailyReports = { ...prev.dailyReports };
      newDailyReports[today] = { report: prev.currentReport, takenMedications: newTaken };
      return { ...prev, takenMedications: newTaken, history: [log, ...prev.history].slice(0, 30), dailyReports: newDailyReports };
    });
  }, [activeMedications, state.takenMedications, today]);

  const handleSendReminder = async (medName: string) => {
    const targetId = state.caregiverTargetId;
    if (!targetId || !isOnline) return;
    try {
      await sendRemoteReminder(targetId, medName);
    } catch (err) { console.error(err); }
  };

  const handleSaveMedication = () => {
    if (!editingMed || !editingMed.name || !editingMed.dosage) {
      alert("يرجى إكمال بيانات الدواء الأساسية (الاسم والجرعة)"); return;
    }
    lastLocalActionTime.current = Date.now();
    isDirty.current = true;
    setState(prev => {
      let newMeds;
      if (editingMed.id) {
        newMeds = prev.medications.map(m => m.id === editingMed.id ? { ...m, ...editingMed } : m);
      } else {
        const newMed: Medication = { 
          ...editingMed as Medication, 
          id: `med-${Date.now()}`,
          frequencyLabel: TIME_SLOT_CONFIG[editingMed.timeSlot || 'morning-fasting'].label
        };
        newMeds = [...prev.medications, newMed];
      }
      return { ...prev, medications: newMeds };
    });
    setEditingMed(null);
  };

  const handleDeleteMedication = () => {
    if (!idToDelete) return;
    lastLocalActionTime.current = Date.now();
    isDirty.current = true;
    setState(prev => ({
      ...prev,
      medications: prev.medications.filter(m => m.id !== idToDelete),
      takenMedications: { ...prev.takenMedications, [idToDelete]: false }
    }));
    setIdToDelete(null);
  };

  const updateReport = (updates: Partial<HealthReport>) => {
    lastLocalActionTime.current = Date.now();
    isDirty.current = true;
    setState(prev => {
      const newReport = { ...prev.currentReport, ...updates };
      const newDailyReports = { ...prev.dailyReports };
      newDailyReports[today] = { report: newReport, takenMedications: prev.takenMedications };
      return { ...prev, currentReport: newReport, dailyReports: newDailyReports };
    });
  };

  const saveReportFinal = () => {
    lastLocalActionTime.current = Date.now();
    isDirty.current = true;
    setState(prev => {
      const newDailyReports = { ...prev.dailyReports };
      newDailyReports[today] = { report: prev.currentReport, takenMedications: prev.takenMedications };
      return { ...prev, dailyReports: newDailyReports };
    });
    setIsReportOpen(false);
  };

  const toggleSymptom = (symptom: string) => {
    lastLocalActionTime.current = Date.now();
    isDirty.current = true;
    const currentSymptoms = state.currentReport.symptoms || [];
    const newSymptoms = currentSymptoms.includes(symptom)
      ? currentSymptoms.filter(s => s !== symptom)
      : [...currentSymptoms, symptom];
    updateReport({ symptoms: newSymptoms });
  };

  const shareReportToWhatsApp = () => {
    const report = state.currentReport;
    const symptoms = report.symptoms?.length > 0 ? report.symptoms.join('، ') : 'لا توجد';
    const other = report.otherSymptoms ? `\n- أعراض أخرى: ${report.otherSymptoms}` : '';
    const sleepQualityMap = { good: 'جيد', fair: 'متوسط', poor: 'ضعيف', '': 'غير محدد' };
    const appetiteMap = { good: 'جيدة', fair: 'متوسطة', poor: 'ضعيفة', '': 'غير محدد' };
    const message = `*تقرير صحي يومي* 📋\nالمريض: ${state.patientName}\nالتاريخ: ${new Date().toLocaleDateString('ar-EG')}\n\n*المؤشرات الحيوية:*\n- ضغط الدم: ${report.systolicBP || '--'}/${report.diastolicBP || '--'}\n- سكر الدم: ${report.bloodSugar || '--'} mg/dL\n- نسبة الأكسجين: ${report.oxygenLevel || '--'}%\n- نبض القلب: ${report.heartRate || '--'} bpm\n\n*الحالة العامة:*\n- جودة النوم: ${sleepQualityMap[report.sleepQuality || '']}\n- الشهية: ${appetiteMap[report.appetite || '']}\n- المزاج: ${report.mood || 'غير محدد'}\n- شرب الماء: ${report.waterIntake || 0} أكواب\n\n*الأعراض:* ${symptoms}${other}\n*ملاحظات إضافية:* ${report.notes || 'لا توجد'}`.trim();
    window.open(`https://wa.me/?text=${encodeURIComponent(message)}`, '_blank');
  };

  const toggleMute = () => { if (!isMuted) stopSpeech(); setIsMuted(!isMuted); };
  const toggleDarkMode = () => setState(prev => ({ ...prev, darkMode: !prev.darkMode }));

  const handleAI = async () => {
    setIsAnalyzing(true);
    setAiResult(null);
    try {
      const res = await analyzeHealthStatus(state);
      setAiResult(res);
      if (!isMuted) await speakText(res.summary);
    } catch (e) { alert("عذراً، لم نتمكن من تحليل الحالة حالياً."); } finally { setIsAnalyzing(false); }
  };

  const copyPatientId = () => {
    const idToCopy = state.caregiverMode ? state.caregiverTargetId : state.patientId;
    if (idToCopy) { navigator.clipboard.writeText(idToCopy); alert("تم نسخ الرمز بنجاح!"); }
  };

  const progress = activeMedications.length > 0 ? (Object.values(activeTakenMeds).filter(Boolean).length / activeMedications.length) * 100 : 0;
  const takenCount = Object.values(activeTakenMeds).filter(Boolean).length;
  const totalMeds = activeMedications.length;

  const handleDayClick = (dateStr: string) => {
    if (activeDailyReports[dateStr]) setSelectedHistoryDate(dateStr);
    else if (dateStr === today) setIsReportOpen(true);
  };

  const renderCalendar = () => {
    const year = now.getFullYear();
    const month = now.getMonth();
    const firstDay = new Date(year, month, 1).getDay();
    const daysInMonth = new Date(year, month + 1, 0).getDate();
    const days = [];
    for (let i = 0; i < firstDay; i++) days.push(<div key={`empty-${i}`} className="h-8 w-8 md:h-10 md:w-10"></div>);
    for (let d = 1; d <= daysInMonth; d++) {
      const dateStr = `${year}-${String(month + 1).padStart(2, '0')}-${String(d).padStart(2, '0')}`;
      let hasData = activeDailyReports[dateStr];
      const isToday = dateStr === today;
      const displayData = hasData || (isToday && (takenCount > 0 || activeReport.systolicBP || activeReport.bloodSugar));
      let statusColor = state.darkMode ? 'bg-slate-800 text-slate-500' : 'bg-white text-slate-400';
      if (displayData) {
        const medsCount = isToday ? takenCount : Object.values(hasData?.takenMedications || {}).filter(Boolean).length;
        if (medsCount === totalMeds && totalMeds > 0) statusColor = 'bg-emerald-500 text-white shadow-emerald-200';
        else if (medsCount > 0) statusColor = 'bg-amber-400 text-white shadow-amber-200';
        else statusColor = state.darkMode ? 'bg-slate-700 text-slate-300' : 'bg-slate-200 text-slate-600';
      }
      if (isToday) statusColor += ' ring-4 ring-blue-500 ring-offset-2 scale-110 z-10';
      days.push(
        <button 
          key={d} onClick={() => handleDayClick(dateStr)}
          className={`h-8 w-8 md:h-11 md:w-11 rounded-2xl flex items-center justify-center font-black text-xs md:text-sm transition-all hover:scale-125 shadow-md ${statusColor} ${!displayData && !isToday ? 'opacity-30 cursor-default' : 'cursor-pointer'}`}
        >
          {d}
        </button>
      );
    }
    return days;
  };

  const formatHour = (h: number) => {
    if (h === 0) return "12:00 م";
    if (h < 12) return `${h}:00 ص`;
    if (h === 12) return "12:00 م";
    return `${h - 12}:00 م`;
  };

  return (
    <div className={`${state.darkMode ? 'dark' : ''}`}>
      <div className="min-h-screen bg-[#f8fafc] dark:bg-slate-950 transition-colors duration-300">
        <div className="flex-1 flex flex-col max-w-5xl mx-auto px-4 py-6 md:py-8 space-y-6 pb-24 md:pb-32">
          {state.caregiverMode && (
            <div className="bg-emerald-600 text-white py-2 px-6 rounded-2xl flex items-center justify-between shadow-lg mb-2 animate-in slide-in-from-top-4 duration-500">
              <div className="flex items-center gap-3">
                <UserCog className="w-5 h-5" />
                <span className="text-sm font-black">وضع المرافق نشط: إدارة حساب {activeName}</span>
              </div>
              <button 
                onClick={() => { lastLocalActionTime.current = Date.now(); setState(prev => ({...prev, caregiverMode: false})); }} 
                className="text-xs bg-white/20 hover:bg-white/30 px-3 py-1 rounded-full font-bold transition-all"
              >
                العودة لوضع المريض
              </button>
            </div>
          )}

          <div className="fixed top-4 left-4 z-[200] flex flex-col gap-2 pointer-events-none">
            <div className="bg-white/95 dark:bg-slate-900/95 backdrop-blur-xl px-4 py-2 rounded-2xl shadow-xl border border-slate-100 dark:border-slate-800 flex items-center gap-3 transition-colors">
              <div className={`w-2.5 h-2.5 rounded-full ${isOnline ? (isSyncing ? 'bg-blue-500 animate-pulse' : 'bg-emerald-500 shadow-[0_0_10px_rgba(16,185,129,0.5)]') : 'bg-red-500'} transition-colors`}></div>
              <div className="flex flex-col">
                <div className="flex items-center gap-2">
                  {isSyncing ? <RefreshCw className="w-3 h-3 text-blue-500 animate-spin" /> : <Cloud className={`w-3 h-3 ${isOnline ? 'text-blue-500' : 'text-slate-300'}`} />}
                  <span className="text-[10px] font-black text-slate-800 dark:text-slate-200 tracking-tight">
                    {isSyncing ? 'جاري المزامنة...' : isOnline ? 'مزامنة سحابية نشطة' : 'وضع عدم الاتصال'}
                  </span>
                </div>
                {lastSyncedTime && <span className="text-[8px] font-bold text-slate-400">تحديث: {lastSyncedTime}</span>}
              </div>
            </div>
          </div>

          <header className={`glass-card rounded-[2.5rem] p-6 md:p-10 shadow-2xl border-b-[8px] relative overflow-hidden transition-all duration-500 ${state.caregiverMode ? 'border-emerald-500' : 'border-blue-600'} dark:bg-slate-900 dark:border-slate-800`}>
            <div className="absolute -top-10 -left-10 w-48 h-48 bg-blue-100/40 dark:bg-blue-900/10 rounded-full blur-[80px]"></div>
            <div className="flex flex-col md:flex-row items-center justify-between gap-6 relative z-10 text-right">
              <div className="flex items-center gap-5 w-full md:w-auto">
                <div className={`p-4 rounded-3xl text-white shadow-2xl scale-110 ${state.caregiverMode ? 'bg-emerald-500' : 'bg-blue-600'}`}>
                  {state.caregiverMode ? <UserCog className="w-8 h-8" /> : <Heart className="w-8 h-8 fill-current" />}
                </div>
                <div>
                  <div className="flex flex-col md:flex-row md:items-center gap-2 md:gap-4 mb-2">
                    <h1 className="text-2xl md:text-3xl font-black text-slate-900 dark:text-white leading-tight">{activeName}</h1>
                    <div onClick={copyPatientId} className="inline-flex items-center gap-2 bg-slate-900 dark:bg-slate-800 text-white px-5 py-2.5 rounded-2xl shadow-2xl cursor-pointer active:scale-95 transition-all group border-2 border-slate-700">
                      <span className="text-[10px] font-black text-slate-400 uppercase tracking-widest">كود المريض:</span>
                      <span className="text-lg font-black text-blue-400">{state.caregiverMode ? state.caregiverTargetId : state.patientId}</span>
                      <Copy className="w-4 h-4 text-blue-400" />
                    </div>
                  </div>
                  <p className="text-slate-500 dark:text-slate-400 text-sm font-bold opacity-80 uppercase tracking-widest">المتابعة الصحية الشاملة</p>
                </div>
              </div>
              <div className="flex items-center gap-3 w-full justify-end md:w-auto">
                 <button onClick={toggleDarkMode} className={`p-3.5 rounded-2xl shadow-md border active:scale-90 transition-all ${state.darkMode ? 'bg-slate-800 border-slate-700 text-yellow-400' : 'bg-white border-slate-100 text-slate-600'}`}>
                   {state.darkMode ? <Sun className="w-6 h-6" /> : <Moon className="w-6 h-6" />}
                 </button>
                 <button onClick={toggleMute} className={`p-3.5 rounded-2xl shadow-md border active:scale-90 transition-all ${isMuted ? 'bg-red-50 dark:bg-red-900/20 border-red-100 dark:border-red-900/30 text-red-500' : 'bg-white dark:bg-slate-800 border-slate-100 dark:border-slate-700 text-slate-600 dark:text-slate-300'}`}>
                   {isMuted ? <VolumeX className="w-6 h-6" /> : <Volume2 className="w-6 h-6" />}
                 </button>
                 <button onClick={() => setIsCalendarOpen(true)} className="p-3.5 bg-white dark:bg-slate-800 rounded-2xl shadow-md border border-slate-100 dark:border-slate-700 active:scale-90 transition-all text-slate-600 dark:text-slate-300">
                   <CalendarIcon className="w-6 h-6" />
                 </button>
                 <button onClick={() => setIsSettingsOpen(true)} className="p-3.5 bg-white dark:bg-slate-800 rounded-2xl shadow-md border border-slate-100 dark:border-slate-700 active:scale-90 transition-all text-slate-600 dark:text-slate-300">
                   <Settings className="w-6 h-6" />
                 </button>
              </div>
            </div>

            <div className="mt-8 space-y-2.5">
              <div className="flex justify-between items-center text-[10px] md:text-xs font-black uppercase text-slate-400 dark:text-slate-500 tracking-widest">
                 <span className="flex items-center gap-1.5"><Activity className="w-3 h-3"/> الالتزام اليوم: {Math.round(progress)}%</span>
                 <span>{takenCount} من {totalMeds} دواء اليوم</span>
              </div>
              <div className="h-4 w-full bg-slate-100 dark:bg-slate-800 rounded-full overflow-hidden shadow-inner border border-white/50 dark:border-slate-700 relative">
                <div className={`h-full rounded-full transition-all duration-1000 ${state.caregiverMode ? 'bg-emerald-500' : 'bg-blue-600'}`} style={{ width: `${progress}%` }}></div>
              </div>
            </div>
          </header>

          {/* Daily AI Tip Section */}
          {state.dailyTipContent && (
            <div className="bg-blue-50 dark:bg-blue-900/10 border-2 border-blue-100 dark:border-blue-800 p-5 rounded-[2.5rem] flex items-center gap-4 animate-in slide-in-from-right-4 duration-700">
              <div className="bg-blue-600 p-3 rounded-2xl text-white shadow-lg"><Sparkles className="w-6 h-6"/></div>
              <div className="flex-1 text-right">
                <p className="text-[10px] font-black text-blue-600 dark:text-blue-400 uppercase tracking-widest mb-1">نصيحة اليوم الذكية</p>
                <p className="text-sm md:text-base font-bold text-slate-800 dark:text-slate-100 leading-relaxed">{state.dailyTipContent}</p>
              </div>
            </div>
          )}

          <main className="grid grid-cols-1 lg:grid-cols-12 gap-6 items-start">
            <div className="lg:col-span-5 space-y-8">
              <div className="flex items-center justify-between px-2">
                <h2 className="text-2xl font-black text-slate-800 dark:text-slate-200 flex items-center gap-3">جدول الأدوية <ClipboardList className="w-7 h-7 text-blue-500" /></h2>
                {state.caregiverMode && (
                  <button 
                    onClick={() => { setEditingMed({ name: '', dosage: '', timeSlot: 'morning-fasting', notes: '', isCritical: false, category: 'other', frequencyLabel: '' }); setIsMedManagerOpen(true); }}
                    className="bg-emerald-600 text-white p-3 rounded-2xl shadow-xl active:scale-95 transition-all"
                  >
                    <PlusCircle className="w-7 h-7" />
                  </button>
                )}
              </div>

              <div className="space-y-12 pb-8">
                {(Object.keys(TIME_SLOT_CONFIG) as TimeSlot[]).map(slot => {
                  const meds = activeMedications.filter(m => m.timeSlot === slot);
                  if (meds.length === 0) return null;
                  const cfg = TIME_SLOT_CONFIG[slot];
                  const slotHourFormatted = formatHour(SLOT_HOURS[slot]);
                  return (
                    <div key={slot} className="space-y-6">
                      <div className="flex items-center justify-between pr-3 border-r-4 border-slate-200 dark:border-slate-800 group/slot">
                        <div className="flex items-center gap-4">
                          <div className={`p-3.5 rounded-2xl shadow-md ${state.darkMode ? 'bg-slate-800 border-slate-700' : cfg.color.split(' ')[0]}`}>{cfg.icon}</div>
                          <div>
                            <h3 className="text-lg font-black text-slate-800 dark:text-slate-200">{cfg.label}</h3>
                            <span className="text-[11px] font-bold text-blue-600 dark:text-blue-400 bg-blue-50 dark:bg-blue-900/20 px-2.5 py-0.5 rounded-lg flex items-center gap-1.5 w-fit mt-1">
                              <Clock className="w-3 h-3" /> {slotHourFormatted}
                            </span>
                          </div>
                        </div>
                        {state.caregiverMode && (
                          <button 
                            onClick={() => {
                              meds.forEach(m => handleSendReminder(m.name));
                              alert(`تم إرسال تنبيهات للمريض بخصوص أدوية مجموعة: ${cfg.label}`);
                            }}
                            className="bg-amber-500 hover:bg-amber-600 text-white p-3 rounded-2xl shadow-lg shadow-amber-500/20 active:scale-95 transition-all flex items-center gap-2"
                            title="تنبيه للمجموعة بالكامل"
                          >
                            <Bell className="w-4 h-4" />
                            <span className="text-[10px] font-black">تنبيه الكل</span>
                          </button>
                        )}
                      </div>
                      <div className="grid grid-cols-1 gap-5">
                        {meds.map(med => {
                          const isTaken = !!activeTakenMeds[med.id];
                          const isLate = !isTaken && currentHour >= SLOT_HOURS[slot];
                          const catColor = CATEGORY_COLORS[med.category || 'other'];
                          return (
                            <div key={med.id} className={`group relative bg-white dark:bg-slate-900 rounded-[2.2rem] border-2 transition-all duration-500 shadow-sm ${isTaken ? 'opacity-60 grayscale-[0.5]' : isLate ? 'late-med-alert border-red-200 dark:border-red-900/30' : 'border-slate-50 dark:border-slate-800'}`}>
                              <div className={`absolute top-0 right-0 w-2.5 h-full ${catColor.replace('text-', 'bg-')}`}></div>
                              {state.caregiverMode && (
                                <div className="absolute top-4 left-4 flex gap-2 opacity-0 group-hover:opacity-100 transition-opacity z-20">
                                  <button onClick={() => { handleSendReminder(med.name); alert(`تم إرسال تنبيه للمريض بخصوص ${med.name}`); }} className="p-2.5 bg-white/95 dark:bg-slate-800 shadow-lg border dark:border-slate-700 rounded-xl hover:bg-amber-50 dark:hover:bg-amber-900/20 text-amber-600"><Bell className="w-4 h-4" /></button>
                                  <button onClick={() => { setEditingMed(med); setIsMedManagerOpen(true); }} className="p-2.5 bg-white/95 dark:bg-slate-800 shadow-lg border dark:border-slate-700 rounded-xl hover:bg-blue-50 dark:hover:bg-blue-900/20 text-blue-600"><Pencil className="w-4 h-4" /></button>
                                  <button onClick={() => setIdToDelete(med.id)} className="p-2.5 bg-white/95 dark:bg-slate-800 shadow-lg border dark:border-slate-700 rounded-xl hover:bg-red-50 dark:hover:bg-red-900/20 text-red-600"><Trash2 className="w-4 h-4" /></button>
                                </div>
                              )}
                              <div className="p-6 md:p-7 flex items-center gap-6">
                                <button onClick={() => toggleMedication(med.id)} className={`shrink-0 w-16 h-16 rounded-[1.6rem] flex items-center justify-center transition-all ${isTaken ? 'bg-emerald-500 text-white' : isLate ? 'bg-red-600 text-white animate-pulse' : 'bg-slate-50 dark:bg-slate-800 text-slate-300 dark:text-slate-600'}`}>
                                  {isTaken ? <CheckCircle className="w-10 h-10" /> : isLate ? <AlertTriangle className="w-10 h-10" /> : <Plus className="w-10 h-10" />}
                                </button>
                                <div className="flex-1 text-right min-w-0 pr-2">
                                  <div className="flex items-center justify-end gap-2 mb-2">
                                    {med.isCritical && <span className="flex items-center gap-1 text-[9px] bg-red-100 dark:bg-red-900/30 text-red-700 dark:text-red-400 px-2 py-1 rounded-lg font-black">ضروري</span>}
                                    <h4 className={`text-xl md:text-2xl font-black truncate ${isTaken ? 'line-through text-slate-400 dark:text-slate-600' : 'text-slate-800 dark:text-slate-100'}`}>{med.name}</h4>
                                  </div>
                                  <span className="text-[11px] font-black px-3 py-1 rounded-lg bg-slate-100 dark:bg-slate-800 text-slate-500 dark:text-slate-400">{med.dosage} • {med.frequencyLabel}</span>
                                  {med.notes && <p className="text-[10px] font-bold text-blue-600 dark:text-blue-400 mt-1">{med.notes}</p>}
                                </div>
                              </div>
                            </div>
                          );
                        })}
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>

            <div className="lg:col-span-7 space-y-8 md:sticky md:top-4">
              <section onClick={() => setIsProceduresModalOpen(true)} className="cursor-pointer bg-gradient-to-br from-white to-amber-50/40 dark:from-slate-900 dark:to-slate-900/80 rounded-[2.8rem] p-8 shadow-xl border-2 border-amber-100 dark:border-amber-900/20 relative group transition-all ring-4 ring-amber-600/5">
                <div className="flex items-center justify-between mb-6">
                   <div className="bg-amber-500 p-5 rounded-3xl text-white shadow-xl shadow-amber-500/30"><ListTodo className="w-8 h-8" /></div>
                   <div className="text-right">
                     <h2 className="text-2xl font-black text-slate-800 dark:text-slate-100 mb-1">الإجراءات القادمة</h2>
                     <p className="text-amber-600 dark:text-amber-400 text-[10px] font-black uppercase flex items-center justify-end gap-1.5"><Clock className="w-3 h-3"/> {state.caregiverMode ? 'تحديث المواعيد والتحاليل' : 'المتابعات والزيارات'}</p>
                   </div>
                </div>
                <div className="p-6 bg-white/70 dark:bg-slate-800/50 rounded-[2rem] text-right text-slate-600 dark:text-slate-300 text-sm font-medium border border-slate-100 dark:border-slate-700 shadow-inner">
                   <p className="line-clamp-3 mb-4">{state.upcomingProcedures}</p>
                   <div className="flex items-center justify-end gap-2 text-amber-600 dark:text-amber-400 font-black text-xs">
                      <span>{state.caregiverMode ? 'تعديل الخطة القادمة' : 'عرض التفاصيل'}</span><ChevronLeft className="w-4 h-4" />
                   </div>
                </div>
              </section>

              <section onClick={() => setIsMedicalSummaryOpen(true)} className="cursor-pointer bg-gradient-to-br from-white to-blue-50/40 dark:from-slate-900 dark:to-slate-900/80 rounded-[2.8rem] p-8 shadow-xl border-2 border-blue-100 dark:border-blue-900/20 relative group transition-all">
                <div className="flex items-center justify-between mb-6">
                   <div className="bg-blue-600 p-5 rounded-3xl text-white shadow-xl shadow-blue-500/30"><FileText className="w-8 h-8" /></div>
                   <div className="text-right">
                     <h2 className="text-2xl font-black text-slate-800 dark:text-slate-100 mb-1">ملخص الحالة الطبية</h2>
                     <p className="text-blue-600 dark:text-blue-400 text-[10px] font-black uppercase flex items-center justify-end gap-1.5"><Sparkles className="w-3 h-3"/> {state.caregiverMode ? 'تعديل البيانات الطبية' : 'نصائح يومية مخصصة'}</p>
                   </div>
                </div>
                <div className="p-6 bg-white/70 dark:bg-slate-800/50 rounded-[2rem] text-right text-slate-600 dark:text-slate-300 text-sm font-medium border border-slate-100 dark:border-slate-700 shadow-inner">
                   <p className="line-clamp-3 mb-4">{state.medicalHistorySummary}</p>
                   <div className="flex items-center justify-end gap-2 text-blue-600 dark:text-blue-400 font-black text-xs">
                      <span>{state.caregiverMode ? 'تعديل الملخص الطبي' : 'فتح التقرير الكامل'}</span><ChevronLeft className="w-4 h-4" />
                   </div>
                </div>
              </section>

              <section onClick={() => setIsDietModalOpen(true)} className="cursor-pointer bg-gradient-to-br from-white to-emerald-50/40 dark:from-slate-900 dark:to-slate-900/80 rounded-[2.8rem] p-8 shadow-xl border-2 border-emerald-100 dark:border-emerald-900/20 relative group transition-all">
                <div className="flex items-center justify-between mb-6">
                   <div className="bg-emerald-600 p-5 rounded-3xl text-white shadow-xl shadow-emerald-500/30"><UtensilsCrossed className="w-8 h-8" /></div>
                   <div className="text-right">
                     <h2 className="text-2xl font-black text-slate-800 dark:text-slate-100 mb-1">نظام الأكل الصحي</h2>
                     <p className="text-emerald-600 dark:text-emerald-400 text-[10px] font-black uppercase flex items-center justify-end gap-1.5"><Activity className="w-3 h-3"/> {state.caregiverMode ? 'تعديل التوصيات الغذائية' : 'المسموح والممنوع'}</p>
                   </div>
                </div>
                <div className="p-6 bg-white/70 dark:bg-slate-800/50 rounded-[2rem] text-right text-slate-600 dark:text-slate-300 text-sm font-medium border border-slate-100 dark:border-slate-700 shadow-inner">
                   <p className="line-clamp-2">{state.dietGuidelines.substring(0, 100)}...</p>
                   <div className="flex items-center justify-end gap-2 text-emerald-600 dark:text-emerald-400 font-black text-xs mt-3">
                      <span>{state.caregiverMode ? 'تعديل نظام الأكل' : 'فتح قائمة الطعام'}</span><ChevronLeft className="w-4 h-4" />
                   </div>
                </div>
              </section>

              <section className="bg-slate-900 dark:bg-slate-900 rounded-[2.8rem] p-8 text-white shadow-2xl relative overflow-hidden border-b-[10px] border-blue-600">
                <div className="flex items-center justify-between mb-8">
                   <div className="bg-white/10 p-5 rounded-2xl"><BrainCircuit className="w-9 h-9 text-blue-400" /></div>
                   <div className="text-right">
                     <h2 className="text-2xl font-black mb-1">التحليل الصحي الذكي</h2>
                     <p className="text-slate-400 text-xs font-bold uppercase">مبني على ملفك الطبي</p>
                   </div>
                </div>
                <button onClick={handleAI} disabled={isAnalyzing} className={`w-full py-6 rounded-[2.2rem] font-black text-xl shadow-2xl transition-all ${state.caregiverMode ? 'bg-emerald-600' : 'bg-blue-600'}`}>
                  {isAnalyzing ? <RefreshCw className="w-8 h-8 animate-spin mx-auto" /> : 'حلل حالتي الآن'}
                </button>
                {aiResult && (
                  <div className="mt-8 p-7 bg-white/10 rounded-[2.2rem] text-right animate-in fade-in">
                    <div className="flex items-center justify-end gap-2 mb-4 text-blue-400"><h3 className="font-black text-lg">تحليل Gemini اليومي</h3><Sparkles className="w-5 h-5"/></div>
                    <p className="text-lg font-medium leading-relaxed text-slate-100">{aiResult.summary}</p>
                  </div>
                )}
              </section>

              <section className="bg-white dark:bg-slate-900 rounded-[2.8rem] p-8 shadow-xl grid grid-cols-2 md:grid-cols-4 gap-8 border border-slate-50 dark:border-slate-800 transition-colors">
                 {[
                   { label: 'ضغط الدم', val: `${activeReport.systolicBP || '--'}/${activeReport.diastolicBP || '--'}`, icon: <Heart className="w-7 h-7 text-red-500"/> },
                   { label: 'سكر الدم', val: activeReport.bloodSugar || '--', icon: <Droplets className="w-7 h-7 text-red-400"/> },
                   { label: 'الأكسجين', val: `${activeReport.oxygenLevel || '--'}%`, icon: <Wind className="w-7 h-7 text-blue-500"/> },
                   { label: 'النبض', val: activeReport.heartRate || '--', icon: <Activity className="w-7 h-7 text-amber-500"/> }
                 ].map((v, i) => (
                   <div key={i} className="text-right space-y-4 border-r-2 border-slate-100 dark:border-slate-800 pr-6 last:border-0 first:pr-0">
                     <div className="flex items-center justify-end gap-3 text-slate-400 dark:text-slate-500">
                       <p className="text-[11px] font-black uppercase tracking-widest">{v.label}</p>{v.icon}
                     </div>
                     <p className="text-3xl font-black text-slate-800 dark:text-slate-100 tabular-nums">{v.val}</p>
                   </div>
                 ))}
              </section>
            </div>
          </main>

          <footer className="fixed bottom-8 left-1/2 -translate-x-1/2 w-fit max-w-[95%] bg-white/80 dark:bg-slate-900/80 backdrop-blur-3xl border border-white/40 dark:border-slate-700/50 px-8 py-5 rounded-[3.5rem] shadow-2xl z-[100] flex items-center justify-center gap-10 transition-colors">
            <button onClick={() => setIsReportOpen(true)} className="w-14 h-14 flex items-center justify-center rounded-[1.6rem] text-blue-600 dark:text-blue-400 bg-white dark:bg-slate-800 border dark:border-slate-700 active:scale-90 transition-all"><DoctorIcon className="w-8 h-8"/></button>
            <button onClick={handleAI} disabled={isAnalyzing} className={`w-18 h-18 rounded-[2rem] text-white shadow-2xl active:scale-95 flex items-center justify-center border-[6px] border-white dark:border-slate-900 ${state.caregiverMode ? 'bg-emerald-600' : 'bg-blue-600'}`}>
              {isAnalyzing ? <RefreshCw className="w-9 h-9 animate-spin" /> : <BrainCircuit className="w-10 h-10" />}
            </button>
            <button onClick={() => setIsMedicalSummaryOpen(true)} className="w-14 h-14 flex items-center justify-center rounded-[1.6rem] text-slate-600 dark:text-slate-300 bg-white dark:bg-slate-800 border dark:border-slate-700 active:scale-90 transition-all"><FileText className="w-8 h-8"/></button>
            <button onClick={toggleMute} className={`w-14 h-14 flex items-center justify-center rounded-[1.6rem] active:scale-90 transition-all ${isMuted ? 'text-red-500 bg-red-50 dark:bg-red-900/20' : 'text-slate-600 dark:text-slate-300 bg-white dark:bg-slate-800 border dark:border-slate-700'}`}>
              {isMuted ? <VolumeX className="w-8 h-8"/> : <Volume2 className="w-8 h-8"/>}
            </button>
          </footer>

          {isProceduresModalOpen && (
            <div className="fixed inset-0 z-[190] flex items-center justify-center p-4 bg-slate-900/95 backdrop-blur-xl animate-in fade-in duration-300">
              <div className="bg-white dark:bg-slate-900 w-full max-w-2xl rounded-[3rem] shadow-2xl relative max-h-[92vh] flex flex-col overflow-hidden border-t-[14px] border-amber-500">
                <div className="p-8 pb-5 border-b border-slate-100 dark:border-slate-800 flex items-center justify-between bg-amber-50/40 dark:bg-amber-900/10">
                   <button onClick={() => setIsProceduresModalOpen(false)} className="p-3.5 bg-white dark:bg-slate-800 text-slate-800 dark:text-slate-200 rounded-2xl active:scale-90"><X className="w-7 h-7"/></button>
                   <div className="text-right">
                     <h2 className="text-2xl font-black text-slate-800 dark:text-white">{state.caregiverMode ? 'تعديل الإجراءات' : 'المتابعات والزيارات'}</h2>
                     <p className="text-amber-600 dark:text-amber-400 text-[10px] font-black uppercase mt-1">الخطة العلاجية</p>
                   </div>
                </div>
                <div className="flex-1 overflow-y-auto p-8 custom-scrollbar text-right space-y-10 bg-white dark:bg-slate-900">
                  {state.caregiverMode ? (
                    <div className="space-y-4">
                      <label className="flex items-center justify-end gap-2 text-amber-700 dark:text-amber-500 font-black text-lg">سجل المواعيد القادمة <Edit3 className="w-5 h-5"/></label>
                      <textarea 
                        value={state.upcomingProcedures}
                        onChange={(e) => { 
                          lastLocalActionTime.current = Date.now(); isDirty.current = true;
                          setState(prev => ({ ...prev, upcomingProcedures: e.target.value })); 
                        }}
                        className="w-full p-6 bg-slate-50 dark:bg-slate-800 border-2 border-slate-100 dark:border-slate-700 focus:border-amber-500 focus:bg-white dark:focus:bg-slate-700 outline-none rounded-[2rem] font-bold text-right shadow-inner min-h-[400px] resize-none leading-relaxed text-slate-800 dark:text-slate-100"
                        placeholder="مثال: زيارة طبيب القلب يوم الثلاثاء القادم..."
                      />
                    </div>
                  ) : (
                    <div className="bg-slate-50 dark:bg-slate-800 p-7 rounded-[2.5rem] border border-slate-100 dark:border-slate-700 whitespace-pre-wrap font-bold text-slate-700 dark:text-slate-200 leading-relaxed text-lg">
                      {state.upcomingProcedures}
                    </div>
                  )}
                </div>
                <div className="p-8 border-t border-slate-100 dark:border-slate-800 bg-white dark:bg-slate-900">
                   <button onClick={() => setIsProceduresModalOpen(false)} className="w-full py-5 bg-amber-500 text-white rounded-[2rem] font-black text-xl shadow-xl active:scale-[0.98] transition-all">إغلاق</button>
                </div>
              </div>
            </div>
          )}

          {isDietModalOpen && (
            <div className="fixed inset-0 z-[190] flex items-center justify-center p-4 bg-slate-900/95 backdrop-blur-xl animate-in fade-in duration-300">
              <div className="bg-white dark:bg-slate-900 w-full max-w-2xl rounded-[3rem] shadow-2xl relative max-h-[92vh] flex flex-col overflow-hidden border-t-[14px] border-emerald-600">
                <div className="p-8 pb-5 border-b border-slate-100 dark:border-slate-800 flex items-center justify-between bg-emerald-50/40 dark:bg-emerald-900/10">
                   <button onClick={() => setIsDietModalOpen(false)} className="p-3.5 bg-white dark:bg-slate-800 text-slate-800 dark:text-slate-200 rounded-2xl active:scale-90"><X className="w-7 h-7"/></button>
                   <div className="text-right">
                     <h2 className="text-2xl font-black text-slate-800 dark:text-white">{state.caregiverMode ? 'تعديل نظام الأكل' : 'نظام الأكل المعتمد'}</h2>
                     <p className="text-emerald-600 dark:text-emerald-400 text-[10px] font-black uppercase mt-1">توصيات مخصصة</p>
                   </div>
                </div>
                <div className="flex-1 overflow-y-auto p-8 custom-scrollbar text-right space-y-10 bg-white dark:bg-slate-900">
                  {state.caregiverMode ? (
                    <div className="space-y-4">
                      <label className="flex items-center justify-end gap-2 text-emerald-700 dark:text-emerald-500 font-black text-lg">اكتب توصيات الأكل <Edit3 className="w-5 h-5"/></label>
                      <textarea 
                        value={state.dietGuidelines}
                        onChange={(e) => { 
                          lastLocalActionTime.current = Date.now(); isDirty.current = true;
                          setState(prev => ({ ...prev, dietGuidelines: e.target.value })); 
                        }}
                        className="w-full p-6 bg-slate-50 dark:bg-slate-800 border-2 border-slate-100 dark:border-slate-700 focus:border-emerald-500 focus:bg-white dark:focus:bg-slate-700 outline-none rounded-[2rem] font-bold text-right shadow-inner min-h-[400px] resize-none leading-relaxed text-slate-800 dark:text-slate-100"
                        placeholder="مثال: الفطار: بيضة مسلوقة..."
                      />
                    </div>
                  ) : (
                    <div className="bg-slate-50 dark:bg-slate-800 p-7 rounded-[2.5rem] border border-slate-100 dark:border-slate-700 whitespace-pre-wrap font-bold text-slate-700 dark:text-slate-200 leading-relaxed text-lg">
                      {state.dietGuidelines}
                    </div>
                  )}
                </div>
                <div className="p-8 border-t border-slate-100 dark:border-slate-800 bg-white dark:bg-slate-900">
                   <button onClick={() => setIsDietModalOpen(false)} className="w-full py-5 bg-emerald-600 text-white rounded-[2rem] font-black text-xl shadow-xl active:scale-[0.98] transition-all">فهمت التعليمات</button>
                </div>
              </div>
            </div>
          )}

          {isMedicalSummaryOpen && (
            <div className="fixed inset-0 z-[150] flex items-center justify-center p-4 bg-slate-900/95 backdrop-blur-xl animate-in fade-in duration-300">
              <div className="bg-white dark:bg-slate-900 w-full max-w-2xl rounded-[3rem] shadow-2xl relative max-h-[92vh] flex flex-col overflow-hidden border-t-[14px] border-blue-600">
                <div className="p-8 pb-5 border-b border-slate-100 dark:border-slate-800 flex items-center justify-between bg-blue-50/40 dark:bg-blue-900/10">
                   <button onClick={() => setIsMedicalSummaryOpen(false)} className="p-3.5 bg-white dark:bg-slate-800 text-slate-800 dark:text-slate-200 rounded-2xl active:scale-90"><X className="w-7 h-7"/></button>
                   <div className="text-right">
                     <h2 className="text-2xl font-black text-slate-800 dark:text-white">{state.caregiverMode ? 'تعديل التاريخ المرضي' : 'الملخص الطبي'}</h2>
                     <p className="text-blue-600 dark:text-blue-400 text-[10px] font-black uppercase mt-1">المريض: {activeName}</p>
                   </div>
                </div>
                <div className="flex-1 overflow-y-auto p-8 custom-scrollbar text-right space-y-8 bg-white dark:bg-slate-900">
                  {!state.caregiverMode && (
                    <div className="bg-emerald-50 dark:bg-emerald-900/20 p-7 rounded-[2.5rem] border-2 border-emerald-100 dark:border-emerald-900/30 shadow-sm relative overflow-hidden group">
                      <div className="flex items-center justify-end gap-3 mb-4 text-emerald-700 dark:text-emerald-400">
                        <h3 className="font-black text-lg">نصيحة طبية لك</h3><Sparkles className="w-6 h-6"/>
                      </div>
                      <p className="text-sm md:text-base font-bold text-emerald-800 dark:text-emerald-200 leading-relaxed">
                        {aiResult?.recommendations[0] || "تذكر دائماً أن مراقبة نسبة الأكسجين هي مفتاح الأمان لحالتك."}
                      </p>
                    </div>
                  )}
                  {state.caregiverMode ? (
                    <div className="space-y-4">
                      <label className="flex items-center justify-end gap-2 text-blue-700 dark:text-blue-400 font-black text-lg">تعديل ملخص الحالة <Edit3 className="w-5 h-5"/></label>
                      <textarea 
                        value={state.medicalHistorySummary}
                        onChange={(e) => { 
                          lastLocalActionTime.current = Date.now(); isDirty.current = true;
                          setState(prev => ({ ...prev, medicalHistorySummary: e.target.value })); 
                        }}
                        className="w-full p-6 bg-slate-50 dark:bg-slate-800 border-2 border-slate-100 dark:border-slate-700 focus:border-blue-500 focus:bg-white dark:focus:bg-slate-700 outline-none rounded-[2rem] font-bold text-right shadow-inner min-h-[400px] resize-none leading-relaxed text-slate-800 dark:text-slate-100"
                      />
                    </div>
                  ) : (
                    <div className="bg-slate-50 dark:bg-slate-800 p-7 rounded-[2.5rem] border border-slate-100 dark:border-slate-700 whitespace-pre-wrap font-medium text-slate-700 dark:text-slate-200 leading-relaxed text-sm md:text-base shadow-inner">
                      {state.medicalHistorySummary}
                    </div>
                  )}
                </div>
              </div>
            </div>
          )}

          {isReportOpen && (
            <div className="fixed inset-0 z-[180] flex items-center justify-center p-4 bg-slate-900/95 backdrop-blur-xl animate-in fade-in">
              <div className="bg-white dark:bg-slate-900 w-full max-w-2xl rounded-[3rem] shadow-2xl relative max-h-[94vh] flex flex-col overflow-hidden border-t-[14px] border-blue-600">
                <div className="p-8 pb-5 border-b border-slate-100 dark:border-slate-800 flex items-center justify-between bg-blue-50/40 dark:bg-blue-900/10">
                   <button onClick={() => setIsReportOpen(false)} className="p-3.5 bg-white dark:bg-slate-800 text-slate-800 dark:text-slate-200 rounded-2xl transition-all active:scale-90 border shadow-sm"><X className="w-7 h-7"/></button>
                   <div className="text-right">
                     <h2 className="text-2xl font-black text-slate-800 dark:text-white">تعديل تقرير اليوم</h2>
                     <p className="text-blue-600 dark:text-blue-400 text-[10px] font-black uppercase mt-1">تاريخ اليوم: {new Date().toLocaleDateString('ar-EG')}</p>
                   </div>
                </div>
                <div className="flex-1 overflow-y-auto p-8 custom-scrollbar text-right space-y-12 bg-white dark:bg-slate-900 pb-12">
                  <div className="space-y-6">
                    <div className="flex items-center justify-end gap-3 text-slate-800 dark:text-slate-200 border-b-2 border-slate-50 dark:border-slate-800 pb-2"><h3 className="font-black text-xl">المؤشرات الحيوية</h3><Activity className="w-6 h-6 text-blue-500"/></div>
                    <div className="grid grid-cols-2 gap-6">
                      <div className="space-y-3">
                        <label className="text-[11px] font-black text-slate-400 mr-2 flex items-center justify-end gap-2 uppercase">ضغط الدم <Heart className="w-4 h-4 text-red-500"/></label>
                        <div className="flex gap-2">
                          <input type="number" value={activeReport.diastolicBP || ''} onChange={(e) => updateReport({ diastolicBP: parseInt(e.target.value) })} className="w-1/2 p-5 bg-slate-50 dark:bg-slate-800 dark:text-white border-2 dark:border-slate-700 outline-none rounded-2xl font-black text-center text-xl shadow-inner" placeholder="80" />
                          <input type="number" value={activeReport.systolicBP || ''} onChange={(e) => updateReport({ systolicBP: parseInt(e.target.value) })} className="w-1/2 p-5 bg-slate-50 dark:bg-slate-800 dark:text-white border-2 dark:border-slate-700 outline-none rounded-2xl font-black text-center text-xl shadow-inner" placeholder="120" />
                        </div>
                      </div>
                      <div className="space-y-3">
                        <label className="text-[11px] font-black text-slate-400 mr-2 flex items-center justify-end gap-2 uppercase">سكر الدم <Droplets className="w-4 h-4 text-red-400"/></label>
                        <input type="number" value={activeReport.bloodSugar || ''} onChange={(e) => updateReport({ bloodSugar: parseInt(e.target.value) })} className="w-full p-5 bg-slate-50 dark:bg-slate-800 dark:text-white border-2 dark:border-slate-700 outline-none rounded-2xl font-black text-center text-xl shadow-inner" placeholder="110" />
                      </div>
                      <div className="space-y-3">
                        <label className="text-[11px] font-black text-slate-400 mr-2 flex items-center justify-end gap-2 uppercase">الأكسجين (%) <Wind className="w-4 h-4 text-blue-500"/></label>
                        <input type="number" value={activeReport.oxygenLevel || ''} onChange={(e) => updateReport({ oxygenLevel: parseInt(e.target.value) })} className="w-full p-5 bg-slate-50 dark:bg-slate-800 dark:text-white border-2 dark:border-slate-700 outline-none rounded-2xl font-black text-center text-xl shadow-inner" placeholder="98" />
                      </div>
                      <div className="space-y-3">
                        <label className="text-[11px] font-black text-slate-400 mr-2 flex items-center justify-end gap-2 uppercase">النبض <Zap className="w-4 h-4 text-amber-500"/></label>
                        <input type="number" value={activeReport.heartRate || ''} onChange={(e) => updateReport({ heartRate: parseInt(e.target.value) })} className="w-full p-5 bg-slate-50 dark:bg-slate-800 dark:text-white border-2 dark:border-slate-700 outline-none rounded-2xl font-black text-center text-xl shadow-inner" placeholder="75" />
                      </div>
                    </div>
                  </div>

                  <div className="space-y-4">
                    <div className="flex items-center justify-end gap-3 text-slate-800 dark:text-slate-200 border-b-2 border-slate-50 dark:border-slate-800 pb-2"><h3 className="font-black text-xl">الشهية اليوم</h3><Utensils className="w-6 h-6 text-orange-500"/></div>
                    <div className="grid grid-cols-3 gap-3">
                      {[
                        { id: 'good', label: 'جيدة', icon: <Smile className="w-5 h-5"/>, color: 'bg-emerald-50 text-emerald-600 border-emerald-100 dark:bg-emerald-900/20 dark:text-emerald-400' },
                        { id: 'fair', label: 'متوسطة', icon: <Meh className="w-5 h-5"/>, color: 'bg-amber-50 text-amber-600 border-amber-100 dark:bg-amber-900/20 dark:text-amber-400' },
                        { id: 'poor', label: 'ضعيفة', icon: <Frown className="w-5 h-5"/>, color: 'bg-red-50 text-red-600 border-red-100 dark:bg-red-900/20 dark:text-red-400' }
                      ].map(a => (
                        <button 
                          key={a.id} 
                          onClick={() => updateReport({ appetite: a.id as any })}
                          className={`flex flex-col items-center gap-2 p-4 rounded-2xl border-2 transition-all ${activeReport.appetite === a.id ? a.color.replace('border-', 'border-current') + ' ring-2 ring-current' : 'bg-slate-50 dark:bg-slate-800 border-transparent text-slate-400 dark:text-slate-500'}`}
                        >
                          {a.icon}
                          <span className="font-black text-sm">{a.label}</span>
                        </button>
                      ))}
                    </div>
                  </div>

                  <div className="space-y-4">
                    <div className="flex items-center justify-end gap-3 text-slate-800 dark:text-slate-200 border-b-2 border-slate-50 dark:border-slate-800 pb-2"><h3 className="font-black text-xl">الحالة المزاجية</h3><Smile className="w-6 h-6 text-purple-500"/></div>
                    <div className="grid grid-cols-4 gap-3">
                      {[
                        { id: 'happy', label: 'سعيد', icon: <Smile className="w-5 h-5"/>, color: 'bg-emerald-50 text-emerald-600 border-emerald-100 dark:bg-emerald-900/20 dark:text-emerald-400' },
                        { id: 'calm', label: 'هادئ', icon: <Sparkles className="w-5 h-5"/>, color: 'bg-blue-50 text-blue-600 border-blue-100 dark:bg-blue-900/20 dark:text-blue-400' },
                        { id: 'anxious', label: 'قلق', icon: <Zap className="w-5 h-5"/>, color: 'bg-amber-50 text-amber-600 border-amber-100 dark:bg-amber-900/20 dark:text-amber-400' },
                        { id: 'sad', label: 'حزين', icon: <Frown className="w-5 h-5"/>, color: 'bg-red-50 text-red-600 border-red-100 dark:bg-red-900/20 dark:text-red-400' }
                      ].map(m => (
                        <button 
                          key={m.id} 
                          onClick={() => updateReport({ mood: m.id as any })}
                          className={`flex flex-col items-center gap-2 p-4 rounded-2xl border-2 transition-all ${activeReport.mood === m.id ? m.color.replace('border-', 'border-current') + ' ring-2 ring-current' : 'bg-slate-50 dark:bg-slate-800 border-transparent text-slate-400 dark:text-slate-500'}`}
                        >
                          {m.icon}
                          <span className="font-black text-xs">{m.label}</span>
                        </button>
                      ))}
                    </div>
                  </div>

                  <div className="space-y-4">
                    <div className="flex items-center justify-end gap-3 text-slate-800 dark:text-slate-200 border-b-2 border-slate-50 dark:border-slate-800 pb-2"><h3 className="font-black text-xl">أعراض اليوم</h3><Activity className="w-6 h-6 text-red-500"/></div>
                    <div className="grid grid-cols-3 md:grid-cols-4 gap-3">
                      {SYMPTOMS.map(symptom => {
                        const isSelected = activeReport.symptoms.includes(symptom);
                        return (
                          <button 
                            key={symptom} 
                            onClick={() => toggleSymptom(symptom)}
                            className={`p-3 rounded-xl border-2 font-bold text-xs transition-all ${isSelected ? 'bg-red-50 dark:bg-red-900/20 border-red-500 dark:border-red-500 text-red-700 dark:text-red-200' : 'bg-slate-50 dark:bg-slate-800 border-transparent text-slate-500 dark:text-slate-400'}`}
                          >
                            {symptom}
                          </button>
                        );
                      })}
                    </div>
                  </div>

                  <div className="space-y-3">
                    <label className="text-[11px] font-black text-slate-400 dark:text-slate-500 mr-2 flex items-center justify-end gap-2 uppercase">أعراض أخرى <Edit3 className="w-4 h-4"/></label>
                    <textarea 
                      value={activeReport.otherSymptoms || ''} 
                      onChange={(e) => updateReport({ otherSymptoms: e.target.value })} 
                      className="w-full p-5 bg-slate-50 dark:bg-slate-800 text-slate-800 dark:text-slate-100 border-2 dark:border-slate-700 outline-none rounded-2xl font-bold text-right h-24 resize-none shadow-inner"
                      placeholder="اكتب أي أعراض إضافية هنا..."
                    />
                  </div>

                  <div className="grid grid-cols-1 md:grid-cols-2 gap-10">
                    <div className="space-y-4">
                      <label className="text-[11px] font-black text-slate-400 dark:text-slate-500 mr-2 block uppercase">شرب الماء (أكواب)</label>
                      <div className="flex items-center justify-center gap-6 bg-blue-50/50 dark:bg-blue-900/10 p-4 rounded-[2rem] border-2 dark:border-blue-900/30">
                        <button onClick={() => updateReport({ waterIntake: Math.max(0, (activeReport.waterIntake || 0) - 1) })} className="p-4 bg-white dark:bg-slate-800 rounded-2xl shadow-md active:scale-90 text-blue-600 dark:text-blue-400"><Minus className="w-6 h-6"/></button>
                        <span className="text-4xl font-black text-slate-800 dark:text-slate-100 w-12 text-center">{activeReport.waterIntake || 0}</span>
                        <button onClick={() => updateReport({ waterIntake: (activeReport.waterIntake || 0) + 1 })} className="p-4 bg-blue-600 text-white rounded-2xl shadow-md active:scale-90"><Plus className="w-6 h-6"/></button>
                      </div>
                    </div>
                    <div className="space-y-4">
                      <label className="text-[11px] font-black text-slate-400 dark:text-slate-500 mr-2 block uppercase">جودة النوم <Bed className="w-4 h-4 text-purple-500 inline-block mr-1"/></label>
                      <div className="grid grid-cols-3 gap-2 p-2 bg-slate-100 dark:bg-slate-800 rounded-[2rem]">
                        {['good', 'fair', 'poor'].map(s => (
                          <button key={s} onClick={() => updateReport({ sleepQuality: s as any })} className={`py-3 rounded-2xl font-black text-xs transition-all ${activeReport.sleepQuality === s ? 'bg-purple-600 text-white shadow-lg' : 'text-slate-500 dark:text-slate-400'}`}>
                            {s === 'good' ? 'جيد' : s === 'fair' ? 'متوسط' : 'ضعيف'}
                          </button>
                        ))}
                      </div>
                    </div>
                  </div>

                  <div className="flex flex-col gap-4 mt-8">
                    <button onClick={shareReportToWhatsApp} className="w-full py-6 bg-[#25D366] text-white rounded-[2.2rem] font-black text-xl shadow-xl active:scale-[0.98] flex items-center justify-center gap-4"><MessageSquare className="w-7 h-7" /> مشاركة عبر واتساب</button>
                    <button onClick={saveReportFinal} className={`w-full py-8 text-white rounded-[2.5rem] font-black text-2xl shadow-2xl active:scale-[0.98] flex items-center justify-center gap-4 ${state.caregiverMode ? 'bg-emerald-600' : 'bg-blue-600'}`}><CheckCircle className="w-8 h-8"/> حفظ التقرير</button>
                  </div>
                </div>
              </div>
            </div>
          )}

          {selectedHistoryDate && (
            <div className="fixed inset-0 z-[210] flex items-center justify-center p-4 bg-slate-900/95 backdrop-blur-xl animate-in fade-in">
              <div className="bg-white dark:bg-slate-900 w-full max-w-2xl rounded-[3rem] shadow-2xl relative max-h-[94vh] flex flex-col overflow-hidden border-t-[14px] border-slate-700">
                <div className="p-8 pb-5 border-b border-slate-100 dark:border-slate-800 flex items-center justify-between bg-slate-50/40 dark:bg-slate-800/50">
                   <button onClick={() => setSelectedHistoryDate(null)} className="p-3.5 bg-white dark:bg-slate-800 text-slate-800 dark:text-slate-200 rounded-2xl active:scale-90"><X className="w-7 h-7"/></button>
                   <div className="text-right">
                     <h2 className="text-2xl font-black text-slate-800 dark:text-white">سجل يوم {new Date(selectedHistoryDate).toLocaleDateString('ar-EG', { day: 'numeric', month: 'long', year: 'numeric' })}</h2>
                   </div>
                </div>
                <div className="flex-1 overflow-y-auto p-8 custom-scrollbar text-right space-y-12 bg-white dark:bg-slate-900 pb-12">
                   <div className="grid grid-cols-2 md:grid-cols-4 gap-6">
                      {[
                        { label: 'ضغط الدم', val: `${activeDailyReports[selectedHistoryDate].report.systolicBP || '--'}/${activeDailyReports[selectedHistoryDate].report.diastolicBP || '--'}`, icon: <Heart className="w-5 h-5 text-red-500"/> },
                        { label: 'سكر الدم', val: activeDailyReports[selectedHistoryDate].report.bloodSugar || '--', icon: <Droplets className="w-5 h-5 text-red-400"/> },
                        { label: 'الأكسجين', val: `${activeDailyReports[selectedHistoryDate].report.oxygenLevel || '--'}%`, icon: <Wind className="w-5 h-5 text-blue-500"/> },
                        { label: 'النبض', val: activeDailyReports[selectedHistoryDate].report.heartRate || '--', icon: <Activity className="w-5 h-5 text-amber-500"/> }
                      ].map((v, i) => (
                        <div key={i} className="bg-slate-50 dark:bg-slate-800 p-4 rounded-[1.8rem] border dark:border-slate-700 transition-colors">
                          <div className="flex items-center justify-end gap-2 mb-2"><span className="text-[10px] font-black text-slate-400 dark:text-slate-500 uppercase">{v.label}</span>{v.icon}</div>
                          <p className="text-xl font-black text-slate-800 dark:text-slate-100 tabular-nums">{v.val}</p>
                        </div>
                      ))}
                   </div>
                   <div className="space-y-4">
                     <div className="flex items-center justify-end gap-3 text-slate-800 dark:text-slate-200 border-b-2 border-slate-50 dark:border-slate-800 pb-2"><h3 className="font-black text-xl">الأدوية التي تم تناولها</h3><CheckCircle className="w-6 h-6 text-emerald-500"/></div>
                     <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                       {activeMedications.map(med => {
                         const wasTaken = activeDailyReports[selectedHistoryDate!].takenMedications[med.id];
                         return (
                           <div key={med.id} className={`p-4 rounded-2xl flex items-center justify-between border-2 ${wasTaken ? 'bg-emerald-50 dark:bg-emerald-900/20 border-emerald-100 dark:border-emerald-900/30' : 'bg-slate-50 dark:bg-slate-800 opacity-50 border-transparent dark:border-slate-700'}`}>
                             {wasTaken ? <Check className="w-5 h-5 text-emerald-600 dark:text-emerald-400"/> : <Ban className="w-5 h-5 text-slate-300 dark:text-slate-600"/>}
                             <div className="text-right">
                               <p className="font-black text-sm text-slate-800 dark:text-slate-100">{med.name}</p>
                               <p className="text-[10px] text-slate-500 dark:text-slate-400">{med.dosage}</p>
                             </div>
                           </div>
                         );
                       })}
                     </div>
                   </div>
                </div>
                <div className="p-8 border-t border-slate-100 dark:border-slate-800 bg-white dark:bg-slate-900">
                   <button onClick={() => setSelectedHistoryDate(null)} className="w-full py-5 bg-slate-900 dark:bg-slate-800 text-white rounded-[2rem] font-black text-xl active:scale-[0.98]">إغلاق السجل</button>
                </div>
              </div>
            </div>
          )}

          {isSettingsOpen && (
            <div className="fixed inset-0 z-[120] flex items-center justify-center p-4 bg-slate-900/95 backdrop-blur-md transition-colors">
              <div className="bg-white dark:bg-slate-900 w-full max-w-md rounded-[3rem] p-8 shadow-2xl relative max-h-[85vh] overflow-y-auto custom-scrollbar">
                <button onClick={() => setIsSettingsOpen(false)} className="absolute top-8 left-8 p-3.5 bg-slate-50 dark:bg-slate-800 dark:text-white rounded-2xl active:scale-90"><X className="w-7 h-7"/></button>
                <h2 className="text-2xl font-black text-slate-900 dark:text-white mb-10 text-right flex items-center justify-end gap-4 mt-8">الإعدادات <Settings className="text-blue-600 w-8 h-8" /></h2>
                <div className="space-y-8 pb-4">
                  <div className="space-y-3 text-right">
                    <label className="text-[11px] font-black text-slate-400 dark:text-slate-500 mr-2 uppercase">اسم المستخدم</label>
                    <input type="text" value={state.patientName} onChange={(e) => { lastLocalActionTime.current = Date.now(); isDirty.current = true; setState(prev => ({ ...prev, patientName: e.target.value })); }} className="w-full p-6 bg-slate-50 dark:bg-slate-800 dark:text-white border-2 dark:border-slate-700 focus:border-blue-500 outline-none rounded-[1.8rem] font-black text-lg text-right shadow-sm" />
                  </div>

                  <div className="p-6 bg-amber-50 dark:bg-amber-900/20 rounded-[2rem] border-2 border-amber-100 dark:border-amber-900/30 text-right space-y-4">
                    <div className="flex items-center justify-end gap-2 text-amber-700 dark:text-amber-400 font-black"><Bell className="w-5 h-5"/> تفعيل تنبيهات الهاتف</div>
                    <p className="text-xs text-slate-600 dark:text-slate-400 font-bold">لضمان وصول التنبيهات حتى والموقع مغلق، يرجى تفعيل الإذن التالي:</p>
                    <button 
                      onClick={requestNotificationPermission}
                      disabled={notificationPermission === 'granted'}
                      className={`w-full py-4 rounded-2xl font-black text-sm transition-all shadow-md ${notificationPermission === 'granted' ? 'bg-emerald-500 text-white' : 'bg-amber-500 text-white active:scale-95'}`}
                    >
                      {notificationPermission === 'granted' ? 'تم تفعيل الإشعارات بنجاح' : 'اضغط هنا لتفعيل التنبيهات'}
                    </button>
                  </div>

                  <div className="p-7 bg-blue-50/50 dark:bg-blue-900/10 rounded-[2.5rem] border border-blue-100 dark:border-blue-900/30 text-right space-y-5">
                    <p className="text-[11px] font-black text-blue-600 dark:text-blue-400 uppercase tracking-widest">رمز المزامنة (ID)</p>
                    <div className="flex items-center gap-4">
                      <button onClick={copyPatientId} className="p-5 bg-white dark:bg-slate-800 text-blue-600 dark:text-blue-400 rounded-2xl border dark:border-slate-700 active:scale-90 shadow-sm"><Copy className="w-6 h-6"/></button>
                      <div className="flex-1 p-5 bg-white dark:bg-slate-800 border-2 border-blue-100 dark:border-blue-900/30 rounded-[1.5rem] text-center font-black text-3xl text-slate-800 dark:text-slate-100 uppercase tabular-nums shadow-inner">{state.patientId}</div>
                    </div>
                  </div>
                  <div className="space-y-4 text-right">
                    <label className="text-[11px] font-black text-slate-400 dark:text-slate-500 mr-2 uppercase">نوع الحساب</label>
                    <div className="grid grid-cols-2 gap-4 p-2 bg-slate-100 dark:bg-slate-800 rounded-[2rem]">
                      <button onClick={() => { lastLocalActionTime.current = Date.now(); isDirty.current = false; setState(prev => ({ ...prev, caregiverMode: true })); }} className={`py-5 rounded-[1.5rem] font-black transition-all ${state.caregiverMode ? 'bg-white dark:bg-slate-700 text-emerald-600 dark:text-emerald-400 shadow-xl' : 'text-slate-400 dark:text-slate-500'}`}>مرافق</button>
                      <button onClick={() => { lastLocalActionTime.current = Date.now(); isDirty.current = false; setState(prev => ({ ...prev, caregiverMode: false })); }} className={`py-5 rounded-[1.5rem] font-black transition-all ${!state.caregiverMode ? 'bg-white dark:bg-slate-700 text-blue-600 dark:text-blue-400 shadow-xl' : 'text-slate-400 dark:text-slate-500'}`}>مريض</button>
                    </div>
                  </div>
                  {state.caregiverMode && (
                    <div className="space-y-4 text-right">
                      <label className="text-[11px] font-black text-slate-400 dark:text-slate-500 mr-2 uppercase">ربط حساب مريض (ID)</label>
                      <input type="text" placeholder="أدخل رمز المريض" value={state.caregiverTargetId || ''} onChange={(e) => { lastLocalActionTime.current = Date.now(); isDirty.current = false; setState(prev => ({ ...prev, caregiverTargetId: e.target.value.toUpperCase() })); }} className="w-full p-6 bg-emerald-50/50 dark:bg-emerald-900/10 border-2 border-emerald-100 dark:border-emerald-900/30 focus:border-emerald-500 rounded-[1.8rem] font-black text-3xl text-center uppercase shadow-md dark:text-white" />
                    </div>
                  )}
                  <button onClick={() => setIsSettingsOpen(false)} className={`w-full py-6 text-white rounded-[2rem] font-black text-xl shadow-2xl active:scale-[0.98] transition-all mt-4 ${state.caregiverMode ? 'bg-emerald-600' : 'bg-slate-900 dark:bg-slate-800'}`}>حفظ الإعدادات</button>
                </div>
              </div>
            </div>
          )}

          {isCalendarOpen && (
            <div className="fixed inset-0 z-[125] flex items-center justify-center p-4 bg-slate-900/95 backdrop-blur-md animate-in slide-in-from-bottom-10 duration-300">
              <div className="bg-white dark:bg-slate-900 w-full max-md rounded-[3rem] p-8 shadow-2xl relative border-b-[12px] border-blue-600 transition-colors">
                <button onClick={() => setIsCalendarOpen(false)} className="absolute top-8 left-8 p-3.5 bg-slate-50 dark:bg-slate-800 dark:text-white rounded-2xl"><X className="w-7 h-7"/></button>
                <div className="text-right pt-8 mb-6"><h2 className="text-2xl font-black text-slate-900 dark:text-white">تاريخ الالتزام الدوائي</h2></div>
                <div className="grid grid-cols-7 gap-5 text-center mb-10" dir="rtl">
                  {['ح', 'ن', 'ث', 'ر', 'خ', 'ج', 'س'].map(d => <span key={d} className="text-[11px] font-black text-slate-300 dark:text-slate-600 uppercase">{d}</span>)}
                  {renderCalendar()}
                </div>
              </div>
            </div>
          )}

          {isMedManagerOpen && (
            <div className="fixed inset-0 z-[160] flex items-center justify-center p-4 bg-slate-900/95 backdrop-blur-xl animate-in fade-in">
              <div className="bg-white dark:bg-slate-900 w-full max-w-2xl rounded-[3rem] p-8 md:p-10 shadow-2xl relative max-h-[90vh] overflow-y-auto custom-scrollbar border-t-[12px] border-emerald-600 transition-colors">
                <button onClick={() => { setIsMedManagerOpen(false); setEditingMed(null); }} className="absolute top-8 left-8 p-3.5 bg-slate-50 dark:bg-slate-800 dark:text-white rounded-2xl"><X className="w-7 h-7"/></button>
                {editingMed ? (
                  <div className="text-right pt-8 mb-10 space-y-8 animate-in slide-in-from-left-4">
                    <div className="flex items-center justify-end gap-3">
                      <h2 className="text-3xl font-black text-slate-900 dark:text-white leading-tight">{editingMed.id ? 'تعديل بيانات الدواء' : 'إضافة دواء جديد'}</h2>
                      <div className="bg-emerald-100 dark:bg-emerald-900/20 p-3 rounded-2xl"><Pencil className="w-6 h-6 text-emerald-600 dark:text-emerald-400" /></div>
                    </div>
                    <div className="space-y-6">
                      <div className="space-y-2">
                        <label className="text-[11px] font-black text-slate-400 dark:text-slate-500 uppercase tracking-widest mr-2">اسم الدواء</label>
                        <input type="text" value={editingMed.name || ''} onChange={(e) => setEditingMed({...editingMed, name: e.target.value})} className="w-full p-5 bg-slate-50 dark:bg-slate-800 dark:text-white border-2 dark:border-slate-700 focus:border-emerald-500 outline-none rounded-2xl font-black text-lg text-right" placeholder="مثال: Aldomet"/>
                      </div>
                      <div className="grid grid-cols-2 gap-4">
                        <div className="space-y-2">
                          <label className="text-[11px] font-black text-slate-400 dark:text-slate-500 uppercase mr-2">الجرعة</label>
                          <input type="text" value={editingMed.dosage || ''} onChange={(e) => setEditingMed({...editingMed, dosage: e.target.value})} className="w-full p-5 bg-slate-50 dark:bg-slate-800 dark:text-white border-2 dark:border-slate-700 focus:border-emerald-500 outline-none rounded-2xl font-black text-lg text-right" placeholder="قرص واحد"/>
                        </div>
                        <div className="space-y-2">
                          <label className="text-[11px] font-black text-slate-400 dark:text-slate-500 uppercase mr-2">وقت التناول</label>
                          <select value={editingMed.timeSlot || 'morning-fasting'} onChange={(e) => setEditingMed({...editingMed, timeSlot: e.target.value as TimeSlot})} className="w-full p-5 bg-slate-50 dark:bg-slate-800 dark:text-white border-2 dark:border-slate-700 outline-none rounded-2xl font-black text-lg text-right appearance-none">
                            {Object.entries(TIME_SLOT_CONFIG).map(([key, value]) => (<option key={key} value={key}>{value.label}</option>))}
                          </select>
                        </div>
                      </div>
                      <div className="space-y-2">
                        <label className="text-[11px] font-black text-slate-400 dark:text-slate-500 uppercase mr-2">نوع الدواء (الفئة)</label>
                        <div className="grid grid-cols-3 gap-2">
                          {Object.entries(CATEGORY_COLORS).map(([cat, colorClass]) => (
                            <button key={cat} onClick={() => setEditingMed({...editingMed, category: cat as any})} className={`py-3 rounded-xl border-2 font-black text-xs transition-all ${editingMed.category === cat ? 'bg-emerald-50 dark:bg-emerald-900/20 border-emerald-500 dark:border-emerald-500 text-emerald-700 dark:text-emerald-400' : 'bg-slate-50 dark:bg-slate-800 border-transparent dark:border-slate-700 text-slate-400 dark:text-slate-500'}`}>{cat === 'pressure' ? 'ضغط' : cat === 'diabetes' ? 'سكري' : cat === 'blood-thinner' ? 'سيولة' : cat === 'stomach' ? 'معدة' : cat === 'antibiotic' ? 'مضاد' : 'أخرى'}</button>
                          ))}
                        </div>
                      </div>
                      <div className="space-y-2">
                        <label className="text-[11px] font-black text-slate-400 dark:text-slate-500 uppercase mr-2">ملاحظات إضافية</label>
                        <textarea value={editingMed.notes || ''} onChange={(e) => setEditingMed({...editingMed, notes: e.target.value})} className="w-full p-5 bg-slate-50 dark:bg-slate-800 dark:text-white border-2 dark:border-slate-700 outline-none rounded-2xl font-bold text-right h-24 resize-none" placeholder="مثال: قبل الأكل بنصف ساعة" />
                      </div>
                      <div className="flex items-center justify-end gap-3 p-4 bg-red-50/50 dark:bg-red-900/10 border border-red-100 dark:border-red-900/30 rounded-2xl">
                        <label className="font-black text-red-700 dark:text-red-400 text-sm">هذا الدواء ضروري جداً (يمنع تفويته)</label>
                        <button onClick={() => setEditingMed({...editingMed, isCritical: !editingMed.isCritical})} className={`w-12 h-7 rounded-full transition-all relative ${editingMed.isCritical ? 'bg-red-600' : 'bg-slate-300 dark:bg-slate-700'}`}><div className={`absolute top-1 w-5 h-5 bg-white rounded-full transition-all ${editingMed.isCritical ? 'left-6' : 'left-1'}`}></div></button>
                      </div>
                      <div className="grid grid-cols-2 gap-4 pt-4">
                        <button onClick={() => setEditingMed(null)} className="py-5 bg-slate-100 dark:bg-slate-800 text-slate-600 dark:text-slate-300 rounded-2xl font-black text-lg">إلغاء</button>
                        <button onClick={handleSaveMedication} className="py-5 bg-emerald-600 text-white rounded-2xl font-black text-lg shadow-xl flex items-center justify-center gap-2"><Save className="w-5 h-5" /> حفظ الدواء</button>
                      </div>
                    </div>
                  </div>
                ) : (
                  <>
                    <div className="text-right pt-8 mb-10"><h2 className="text-3xl font-black text-slate-900 dark:text-white leading-tight">إدارة أدوية {activeName}</h2></div>
                    <div className="space-y-6">
                      {activeMedications.map(med => (
                        <div key={med.id} className="p-6 bg-slate-50/80 dark:bg-slate-800/50 rounded-[2.5rem] flex items-center justify-between border-2 border-transparent hover:border-emerald-100 dark:hover:border-emerald-900/30 transition-all shadow-sm">
                          <div className="flex gap-4"><button onClick={() => setEditingMed(med)} className="p-4 bg-white dark:bg-slate-800 text-blue-600 dark:text-blue-400 rounded-[1.4rem] border dark:border-slate-700 active:scale-90 shadow-sm"><Pencil className="w-6 h-6"/></button><button onClick={() => setIdToDelete(med.id)} className="p-4 bg-white dark:bg-slate-800 text-red-600 dark:text-red-400 rounded-[1.4rem] border dark:border-slate-700 active:scale-90 shadow-sm"><Trash2 className="w-6 h-6"/></button></div>
                          <div className="text-right"><p className="font-black text-slate-800 dark:text-slate-100 text-lg">{med.name}</p><p className="text-xs font-black text-slate-400 dark:text-slate-500 mt-1 uppercase">{med.dosage} • {TIME_SLOT_CONFIG[med.timeSlot]?.label}</p></div>
                        </div>
                      ))}
                      <button onClick={() => setEditingMed({ name: '', dosage: '', timeSlot: 'morning-fasting', notes: '', isCritical: false, category: 'other', frequencyLabel: '' })} className="w-full py-10 border-4 border-dashed border-slate-100 dark:border-slate-800 rounded-[2.8rem] text-slate-400 dark:text-slate-600 font-black text-xl hover:bg-emerald-50 dark:hover:bg-emerald-900/10 transition-all flex items-center justify-center gap-5 shadow-inner"><PlusCircle className="w-9 h-9" /> إضافة دواء جديد</button>
                    </div>
                  </>
                )}
              </div>
            </div>
          )}

          {idToDelete && (
            <div className="fixed inset-0 z-[300] flex items-center justify-center p-4 bg-slate-900/80 backdrop-blur-sm animate-in fade-in">
              <div className="bg-white dark:bg-slate-900 w-full max-sm rounded-[2.5rem] p-8 text-center shadow-2xl border-t-8 border-red-500">
                 <div className="bg-red-50 dark:bg-red-900/20 w-20 h-20 rounded-full flex items-center justify-center mx-auto mb-6"><Trash2 className="w-10 h-10 text-red-500 dark:text-red-400" /></div>
                 <h3 className="text-xl font-black text-slate-900 dark:text-white mb-2">تأكيد حذف الدواء</h3>
                 <p className="text-slate-500 dark:text-slate-400 font-bold mb-8">هل أنت متأكد أنك تريد إزالة هذا الدواء؟</p>
                 <div className="grid grid-cols-2 gap-4">
                    <button onClick={() => setIdToDelete(null)} className="py-4 bg-slate-100 dark:bg-slate-800 text-slate-600 dark:text-slate-300 rounded-2xl font-black">إلغاء</button>
                    <button onClick={handleDeleteMedication} className="py-4 bg-red-600 text-white rounded-2xl font-black shadow-lg shadow-red-200 dark:shadow-red-900/20">نعم، احذف</button>
                 </div>
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
};

export default App;
