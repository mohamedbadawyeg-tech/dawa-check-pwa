
import React, { useState, useEffect, useRef, useCallback, useMemo } from 'react';
import { MEDICATIONS as DEFAULT_MEDICATIONS, TIME_SLOT_CONFIG, SLOT_HOURS, SYMPTOMS, CATEGORY_COLORS, MEDICAL_HISTORY_SUMMARY, DIET_GUIDELINES } from './constants';
import { AppState, TimeSlot, AIAnalysisResult, HealthReport, Medication, DayHistory, Diagnosis } from './types';
import { PushNotifications } from '@capacitor/push-notifications';
import { LocalNotifications } from '@capacitor/local-notifications';
import { Camera, CameraResultType, CameraSource } from '@capacitor/camera';
import { App as CapacitorApp } from '@capacitor/app';
import { Geolocation } from '@capacitor/geolocation';
import { Capacitor } from '@capacitor/core';
import { analyzeHealthStatus, generateMedicationPlanFromText, generateMedicationPlanFromImage, generateDailyHealthTip, generateDietPlan, checkDrugInteractions } from './services/geminiService';
import { HealthCharts } from './components/HealthCharts';
import { FamilyChat } from './components/FamilyChat';
import { DraggableLateAlert } from './components/DraggableLateAlert';
import { VoiceCommandButton } from './components/VoiceCommandButton';
import { initializePurchases, checkSubscriptionStatus, purchasePackage, getOfferings, restorePurchases } from './services/purchaseService';
import { speakText, stopSpeech, playChime } from './services/audioService';
import PrivacyPolicy from './components/PrivacyPolicy';
import { Tour } from './components/Tour';
import { syncPatientData, listenToPatient, generateSyncId, sendRemoteReminder, requestForToken, onForegroundMessage, saveTokenToDatabase, backupAdherenceHistory } from './services/firebaseService';
import { openWhatsApp } from './utils/whatsapp';
import { signInWithGoogle, signInWithApple, signOut, initializeAuth, User } from './services/authService';
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
  Camera as CameraIcon,
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
  ShoppingCart,
  Wifi,
  WifiOff,
  Smile,
  Droplets,
  ChevronLeft,
  Mic,
  ShieldAlert,
  MicOff,
  Send,
  FileText,
  MessageSquare,
  MessageCircle,
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
  ListChecks,
  Frown,
  Meh,
  ShoppingBag
} from 'lucide-react';

import { SettingsModal } from './components/SettingsModal';
import { PharmacyModal } from './components/PharmacyModal';
import { DietModal } from './components/DietModal';
import { MedicalSummaryModal } from './components/MedicalSummaryModal';
import { ProceduresCard } from './components/ProceduresCard';
import { DiagnosisCard } from './components/DiagnosisCard';
import { ScrollHint } from './components/ScrollHint';

const DEFAULT_REPORT: HealthReport = {
  date: new Date().toISOString().split('T')[0],
  healthRating: 0,
  painLevel: 0,
  sleepQuality: '',
  appetite: '',
  symptoms: [],
  notes: '',
  waterIntake: 0,
  mood: ''
};

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

const computeDailyQuickTip = (state: AppState): string => {
  const report = state.currentReport;
  const meds = state.medications || [];

  const hasPressureMed = meds.some(m => m.category === 'pressure');
  const hasDiabetesMed = meds.some(m => m.category === 'diabetes');
  const hasBloodThinnerMed = meds.some(m => m.category === 'blood-thinner');
  const hasAnyMed = meds.length > 0;

  const symptoms = report.symptoms || [];
  const otherSymptomsText = (report.otherSymptoms || '').toLowerCase();

  const hasBreathOrChestSymptom =
    symptoms.includes('ضيق تنفس') ||
    symptoms.includes('آلام صدر') ||
    otherSymptomsText.includes('ضيق تنفس') ||
    otherSymptomsText.includes('ضيق في التنفس') ||
    otherSymptomsText.includes('آلام صدر') ||
    otherSymptomsText.includes('ألم صدر');

  const hasBruisingOrBleeding =
    symptoms.includes('كدمات') ||
    symptoms.includes('نزيف لثة') ||
    otherSymptomsText.includes('كدمة') ||
    otherSymptomsText.includes('نزيف');

  const systolic = report.systolicBP || 0;
  const diastolic = report.diastolicBP || 0;
  const sugar = report.bloodSugar || 0;
  const water = typeof report.waterIntake === 'number' ? report.waterIntake : undefined;

  const hasReadings =
    !!report.systolicBP ||
    !!report.diastolicBP ||
    !!report.bloodSugar ||
    !!report.oxygenLevel ||
    !!report.heartRate ||
    !!report.waterIntake;

  const name = (state.patientName || '').trim();
  const age = state.patientAge || 0;
  const gender = state.patientGender;

  let friendlyPrefix = '';
  if (name) {
    if (age > 0 && age < 40) {
            friendlyPrefix = gender === 'female' ? `يا آنسة ${name}` : `يا بطل ${name}`;
          } else if (age >= 40 && age < 60) {
      friendlyPrefix = gender === 'female' ? `يا أستاذة ${name}` : `يا أستاذ ${name}`;
    } else if (age >= 60) {
      friendlyPrefix = gender === 'female' ? `يا حاجة ${name}` : `يا حاج ${name}`;
    } else {
      // Fallback if age is 0 or undefined
      friendlyPrefix = gender === 'female' ? `يا أستاذة ${name}` : `يا أستاذ ${name}`;
    }
  } else if (age >= 70) {
    friendlyPrefix = 'يا حاجنا الكريم';
  } else if (age >= 50) {
    friendlyPrefix = 'يا صاحب القلب الطيب';
  } else {
    friendlyPrefix = 'يا بطل';
  }

  const softPrefix = `${friendlyPrefix}،`;

  if (hasBreathOrChestSymptom) {
    return `${softPrefix} إذا استمر ضيق التنفس أو ألم الصدر اليوم، تواصل فوراً مع طبيبك أو الطوارئ ولا تنتظر.`;
  }

  if ((systolic > 140 || diastolic > 90) && hasPressureMed) {
    return `${softPrefix} ضغطك اليوم أعلى من المطلوب؛ قلل الملح وراقب القياس وراجع طبيبك إذا استمر الارتفاع، واهدأ خُطوة بخطوة.`;
  }

  if (sugar > 180 && hasDiabetesMed) {
    return `${softPrefix} سكر الدم اليوم مرتفع؛ تجنب الحلويات واشرب ماءً كافياً، وراجع جرعات الدواء مع طبيبك، وكل خطوة التزام بتفرق في صحتك.`;
  }

  if (hasBloodThinnerMed && hasBruisingOrBleeding) {
    return `${softPrefix} مع أدوية السيولة، زيادة الكدمات أو حدوث نزيف يستدعي مراجعة الطبيب في أسرع وقت، واطمئن؛ تحركك السريع يحميك بعد إذن الله.`;
  }

  if (typeof water === 'number' && water > 0 && water < 5) {
    return `${softPrefix} حاول شرب كوب ماء كل ساعة خلال اليوم ما لم يمنعك الطبيب من السوائل؛ جسمك في سنك الغالي يحتاج ترطيب واهتمام.`;
  }

  if (hasDiabetesMed) {
    return `${softPrefix} مع أدوية السكر، وزّع النشويات على وجبات صغيرة ثابتة وامشِ 10–15 دقيقة بعد الأكل إن أمكن؛ التزامك اليوم يحمي قلبك وكليتيك.`;
  }

  if (hasPressureMed && !hasDiabetesMed && !hasBloodThinnerMed) {
    return `${softPrefix} مع أدوية الضغط، قلل المخللات والجبن المالح اليوم، وابتعد عن إضافة ملح زائد للطعام؛ صحتك أمانة غالية في هذا العمر.`;
  }

  if (hasBloodThinnerMed && !hasPressureMed && !hasDiabetesMed) {
    return `${softPrefix} مع أدوية السيولة، حافظ على مواعيد الدواء ولا تضاعف الجرعة إذا نسيت جرعة بدون استشارة طبيبك؛ هدوءك والتزامك سر الأمان.`;
  }

  if (hasAnyMed && !hasReadings) {
    return `${softPrefix} التزامك بمواعيد الدواء اليوم يساعد على استقرار ضغطك وسكرك ويحمي من المضاعفات؛ حاول أيضاً تسجيل قراءاتك ليطمئن قلبك وقلب طبيبك.`;
  }

  if (!hasAnyMed && !hasReadings) {
    return `${softPrefix} سجّل قراءاتك اليومية وحالتك المزاجية؛ المتابعة المنتظمة في عمرك تساعد على اكتشاف أي تغير بدري وطمأنة عائلتك.`;
  }

  return `${softPrefix} حافظ على مواعيد دوائك اليوم، وامشِ قليلاً إن استطعت، وخذ فترات راحة قصيرة بين الأنشطة؛ كل حركة بسيطة تقوّي قلبك وتنعش يومك.`;
};

const MOTIVATIONAL_QUOTES = [
  "صحتك هي ثروتك", "أنت قوي جداً", "استمر في المحاولة", "كل يوم جديد", 
  "تفاءل بالخير تجده", "اهتم بقلبِك", "الراحة مفتاح الشفاء", "ابتسم للحياة",
  "دواؤك سر عافيتك", "العافية نعمة", "صحتك أمانة", "أنت لست وحدك"
];

const hashCode = (str: string) => {
  let hash = 0;
  for (let i = 0; i < str.length; i++) {
      const char = str.charCodeAt(i);
      hash = ((hash << 5) - hash) + char;
      hash = hash & hash;
  }
  return Math.abs(hash);
};

const TOUR_STEPS = [
  {
    targetId: 'app-header',
    title: 'الملف الشخصي',
    content: 'هنا يظهر اسمك وحالتك، ويمكنك تفعيل وضع المرافق أو تعديل الإعدادات.'
  },
  {
    targetId: 'medication-schedule',
    title: 'جدول الأدوية اليومي',
    content: 'هنا تظهر أدويتك مرتبة حسب الوقت. اضغط على الدواء لتسجيل تناوله.'
  },
  {
    targetId: 'smart-analysis-card',
    title: 'التحليل الصحي الذكي',
    content: 'هنا يمكنك الحصول على تحليل شامل لحالتك الصحية وتوصيات مخصصة بناءً على أدويتك ونتائج تحاليلك باستخدام الذكاء الاصطناعي.'
  },

  {
    targetId: 'report-btn',
    title: 'تقرير صحتي',
    content: 'سجل متابعاتك اليومية (ضغط، سكر، أعراض) لمتابعة تطور حالتك.'
  },
  {
    targetId: 'pharmacy-btn',
    title: 'الصيدلية',
    content: 'اطلب أدويتك من أقرب صيدلية أو ابحث عنها أونلاين.'
  },
  {
    targetId: 'ai-btn',
    title: 'مساعدك الذكي',
    content: 'اضغط هنا في أي وقت للحصول على تحليل فوري أو نصيحة طبية.'
  },
  {
    targetId: 'calendar-btn',
    title: 'التقويم',
    content: 'راجع سجل التزامك بالأدوية وتاريخك الصحي.'
  },
  {
    targetId: 'settings-btn',
    title: 'الإعدادات',
    content: 'من هنا يمكنك تعديل بياناتك، ضبط التنبيهات، وتخصيص التطبيق.'
  }
];

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
  const adherenceJsonInputRef = useRef<HTMLInputElement | null>(null);

  const [state, setState] = useState<AppState>(() => {
    const saved = localStorage.getItem('health_track_v6');
    // Helper to generate default settings from constants
    const defaultTimeSettings = Object.entries(TIME_SLOT_CONFIG).reduce((acc, [key, value]) => {
      acc[key] = {
        label: value.label,
        hour: SLOT_HOURS[key as TimeSlot]
      };
      return acc;
    }, {} as Record<string, { label: string, hour: number }>);

    if (saved) {
      try {
        const parsed = JSON.parse(saved);
        if (parsed.patientName === "الحاج ممدوح عبد العال") {
          parsed.patientName = '';
          parsed.patientAge = 0;
          parsed.patientGender = undefined;
        }
        if (typeof parsed.medicalHistorySummary === 'string' && parsed.medicalHistorySummary.includes('الحاج ممدوح')) {
          parsed.medicalHistorySummary = '';
        }
        if (typeof parsed.dietGuidelines === 'string' && parsed.dietGuidelines.includes('نظام الأكل المخصص (قلب + رئة + ضغط + كُلى)')) {
          parsed.dietGuidelines = '';
        }
        const isSameDay = parsed.currentReport?.date === today;
        if (!isSameDay && parsed.currentReport?.date) {
          const yesterdayDate = parsed.currentReport?.date;
          parsed.dailyReports = parsed.dailyReports || {};
          parsed.dailyReports[yesterdayDate] = {
            report: parsed.currentReport,
            takenMedications: parsed.takenMedications || {}
          };
        }
        return {
          ...parsed,
          patientId: (parsed.patientId && parsed.patientId.length <= 8) ? parsed.patientId : generateSyncId(),
          medications: parsed.medications || DEFAULT_MEDICATIONS,
          medicalHistorySummary: parsed.medicalHistorySummary || MEDICAL_HISTORY_SUMMARY,
          dietGuidelines: parsed.dietGuidelines || DIET_GUIDELINES,
          upcomingProcedures: Array.isArray(parsed.upcomingProcedures) ? parsed.upcomingProcedures : [],
          labTests: parsed.labTests || [],
          history: parsed.history || [],
          lastDailyTipDate: parsed.lastDailyTipDate,
          dailyTipContent: parsed.dailyTipContent,
          takenMedications: isSameDay ? (parsed.takenMedications || {}) : {},
          sentNotifications: isSameDay ? (parsed.sentNotifications || []) : [],
          customReminderTimes: parsed.customReminderTimes || {},
          darkMode: parsed.darkMode ?? false,
          notificationsEnabled: parsed.notificationsEnabled ?? true,
          aiSubscriptionActive: parsed.aiSubscriptionActive ?? false,
          caregiverMode: parsed.caregiverMode ?? false,
          slotHours: parsed.slotHours || SLOT_HOURS,
          currentReport: isSameDay ? (parsed.currentReport || { ...DEFAULT_REPORT, date: today }) : { ...DEFAULT_REPORT, date: today },
          caregiverHistory: Array.isArray(parsed.caregiverHistory) ? parsed.caregiverHistory.filter((h: any) => h.id && h.id.length <= 8) : [],
          familyMessages: Array.isArray(parsed.familyMessages) ? parsed.familyMessages : [],
        };
      } catch (e) { console.error(e); }
    }
    return {
      patientName: "",
      patientAge: 0,
      patientGender: undefined,
      patientId: generateSyncId(),
      caregiverMode: false,
      caregiverTargetId: null,
      slotHours: SLOT_HOURS,
      aiSubscriptionActive: false,
      medications: [],
      medicalHistorySummary: '',
      dietGuidelines: '',
      upcomingProcedures: [],
      takenMedications: {},
      notificationsEnabled: true,
      mandatoryRemindersEnabled: false,
      pharmacyPhone: '',
      sentNotifications: [],
      customReminderTimes: {},
      darkMode: false,
      history: [],
      dailyReports: {},
      labTests: [],
      familyMessages: [],
      currentReport: {
        date: today, healthRating: 0, painLevel: 0, sleepQuality: '', appetite: '', symptoms: [], otherSymptoms: '', notes: '', additionalNotes: '',
        systolicBP: 0, diastolicBP: 0, bloodSugar: 0, oxygenLevel: 0, heartRate: 0, waterIntake: 0, mood: ''
      }
    };
  });

  const [aiResult, setAiResult] = useState<AIAnalysisResult | null>(state.aiAnalysisResult || null);
  const [user, setUser] = useState<User | null>(() => {
    try {
        const saved = localStorage.getItem('auth_user');
        return saved ? JSON.parse(saved) : null;
    } catch { return null; }
  });
  const [aiDietPlan, setAiDietPlan] = useState<string | null>(null);
  const [isAnalyzing, setIsAnalyzing] = useState(false);
  const [isProcessingImage, setIsProcessingImage] = useState(false);
  const [isSettingsOpen, setIsSettingsOpen] = useState(false);
  const [isReportOpen, setIsReportOpen] = useState(false);
  const [isCalendarOpen, setIsCalendarOpen] = useState(false);
  const [isMedManagerOpen, setIsMedManagerOpen] = useState(false);
  const [isPharmacyModalOpen, setIsPharmacyModalOpen] = useState(false);
  const [isMedicalSummaryOpen, setIsMedicalSummaryOpen] = useState(false);
  const [isDietModalOpen, setIsDietModalOpen] = useState(false);
  const [isFamilyChatOpen, setIsFamilyChatOpen] = useState(false);
  const [isProceduresModalOpen, setIsProceduresModalOpen] = useState(false);
  const [isLabsModalOpen, setIsLabsModalOpen] = useState(false);
  const [isSubscriptionModalOpen, setIsSubscriptionModalOpen] = useState(false);
  const [isPrivacyPolicyOpen, setIsPrivacyPolicyOpen] = useState(false);
  
  // Onboarding extended state
  const [onboardingLabTests, setOnboardingLabTests] = useState<any[]>([]);
  const [onboardingLabTestDraft, setOnboardingLabTestDraft] = useState({ name: '', result: '', date: new Date().toISOString().split('T')[0] });
  const [selectedPaymentMethod, setSelectedPaymentMethod] = useState<string | null>(null);
  const [overlayDisplayEnabled, setOverlayDisplayEnabled] = useState<boolean>(false);
  const [offerings, setOfferings] = useState<any>(null);
  const [editingMed, setEditingMed] = useState<Partial<Medication> | null>(null);
  const [frequencyMode, setFrequencyMode] = useState<'single' | 'recurring'>('single');
  const [recurringCount, setRecurringCount] = useState<number>(2);
  const [recurringSlots, setRecurringSlots] = useState<TimeSlot[]>(['morning-fasting', 'before-bed']);
  const [idToDelete, setIdToDelete] = useState<string | null>(null);
  const [isRefillModalOpen, setIsRefillModalOpen] = useState(false);
  const [isOrderChoiceOpen, setIsOrderChoiceOpen] = useState(false);
  const [pendingOrderMessage, setPendingOrderMessage] = useState<string | null>(null);
  const [refillAmount, setRefillAmount] = useState<number>(30);
  const [refillTargetId, setRefillTargetId] = useState<string | null>(null);
  const [selectedHistoryDate, setSelectedHistoryDate] = useState<string | null>(null);
  const [hasOnboarded, setHasOnboarded] = useState<boolean>(() => {
    const saved = localStorage.getItem('health_track_v6');
    return !!saved;
  });
  const [hasSeenTour, setHasSeenTour] = useState<boolean>(() => {
    return !!localStorage.getItem('has_seen_tour_v1');
  });
  const [isTourOpen, setIsTourOpen] = useState(false);
  const [onboardingStep, setOnboardingStep] = useState<number>(1);
  const [onboardingName, setOnboardingName] = useState<string>('');
  const [onboardingLocation, setOnboardingLocation] = useState<string>('');
  const [onboardingAge, setOnboardingAge] = useState<string>('');
  const [onboardingGender, setOnboardingGender] = useState<'male' | 'female' | ''>('');
  const [onboardingMedicalSummary, setOnboardingMedicalSummary] = useState<string>('');
  const [onboardingMode, setOnboardingMode] = useState<'manual' | 'ai'>('manual');
  const [onboardingMeds, setOnboardingMeds] = useState<Medication[]>([]);
  const [onboardingMedDraft, setOnboardingMedDraft] = useState<{ name: string; dosage: string; timeSlot: TimeSlot }>({
    name: '',
    dosage: '',
    timeSlot: 'morning-fasting'
  });
  const [isMedsDone, setIsMedsDone] = useState(false);
  const [aiMedInput, setAiMedInput] = useState<string>('');
  const [isGeneratingMeds, setIsGeneratingMeds] = useState<boolean>(false);
  const [isGeneratingDiet, setIsGeneratingDiet] = useState<boolean>(false);
  const prescriptionImageInputRef = useRef<HTMLInputElement | null>(null);
  const [hasPrescriptionImage, setHasPrescriptionImage] = useState<boolean>(false);
  const [showOnboardingSplash, setShowOnboardingSplash] = useState(true);
  const [splashFading, setSplashFading] = useState(false);
  
  // Chat UI State
  const [chatMessages, setChatMessages] = useState<Array<{
    id: string;
    sender: 'bot' | 'user';
    text: string;
    type?: 'text' | 'choice' | 'form' | 'med_list';
    choices?: { label: string; value: string; action?: () => void }[];
    formType?: 'name' | 'age' | 'gender' | 'meds' | 'lab';
  }>>([
    {
      id: '0',
      sender: 'bot',
      text: 'مرحباً بك! يرجى تسجيل الدخول للمتابعة للبدء في استخدام مساعدك الصحي الشخصي.',
      type: 'choice',
      choices: [
        { label: 'تسجيل الدخول بجوجل', value: 'SIGNIN_GOOGLE' },
        { label: 'تسجيل الدخول بـ Apple', value: 'SIGNIN_APPLE' },
        { label: 'المتابعة كضيف', value: 'GUEST_LOGIN' }
      ]
    }
  ]);
  const [chatInput, setChatInput] = useState('');
  const [isChatTyping, setIsChatTyping] = useState(false);
  
  // Voice Command State
  const [isVoiceListening, setIsVoiceListening] = useState(false);
  const [voiceRecognition, setVoiceRecognition] = useState<any>(null);
  const handleVoiceCommandRef = useRef<any>(null);
  const chatEndRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    initializeAuth();
  }, []);

  useEffect(() => {
    if (!hasOnboarded) {
      chatEndRef.current?.scrollIntoView({ behavior: 'smooth' });
    }
  }, [chatMessages, isChatTyping, hasOnboarded]);

  useEffect(() => {
    if (!hasOnboarded && showOnboardingSplash) {
      const timer1 = setTimeout(() => setSplashFading(true), 3000);
      const timer2 = setTimeout(() => setShowOnboardingSplash(false), 4000);
      return () => { clearTimeout(timer1); clearTimeout(timer2); };
    }
  }, [hasOnboarded, showOnboardingSplash]);

  useEffect(() => {
    if (hasOnboarded && !hasSeenTour) {
      // Small delay to ensure UI is rendered and animations are done
      const timer = setTimeout(() => setIsTourOpen(true), 1500);
      return () => clearTimeout(timer);
    }
  }, [hasOnboarded, hasSeenTour]);

  const addBotMessage = (text: string, type: 'text' | 'choice' | 'form' | 'med_list' = 'text', choices?: any[], formType?: any) => {
    setChatMessages(prev => [...prev, {
      id: Date.now().toString(),
      sender: 'bot',
      text,
      type,
      choices,
      formType
    }]);
    setIsChatTyping(false);
  };

  const addUserMessage = (text: string) => {
    setChatMessages(prev => [...prev, {
      id: Date.now().toString(),
      sender: 'user',
      text
    }]);
  };

  const handleAddProcedure = (text: string, date: string) => {
    lastLocalActionTime.current = Date.now();
    isDirty.current = true;
    const newProcedure: Procedure = {
      id: crypto.randomUUID(),
      text,
      date,
      completed: false
    };
    setState(prev => ({
      ...prev,
      upcomingProcedures: [...(prev.upcomingProcedures || []), newProcedure]
    }));
  };

  const handleToggleProcedure = (id: string) => {
    lastLocalActionTime.current = Date.now();
    isDirty.current = true;
    setState(prev => ({
      ...prev,
      upcomingProcedures: (prev.upcomingProcedures || []).map(p => 
        p.id === id ? { ...p, completed: !p.completed } : p
      )
    }));
  };

  const handleDeleteProcedure = (id: string) => {
    if (!confirm("هل أنت متأكد من حذف هذا الإجراء؟")) return;
    lastLocalActionTime.current = Date.now();
    isDirty.current = true;
    setState(prev => ({
      ...prev,
      upcomingProcedures: (prev.upcomingProcedures || []).filter(p => p.id !== id)
    }));
  };

  const handleUpdateProcedure = (id: string, text: string, date: string) => {
    lastLocalActionTime.current = Date.now();
    isDirty.current = true;
    setState(prev => ({
      ...prev,
      upcomingProcedures: (prev.upcomingProcedures || []).map(p => 
        p.id === id ? { ...p, text, date } : p
      )
    }));
  };

  const handleAddDiagnosis = (diagnosis: Omit<Diagnosis, 'id'>) => {
    lastLocalActionTime.current = Date.now();
    isDirty.current = true;
    setState(prev => ({
      ...prev,
      diagnoses: [
        ...(prev.diagnoses || []),
        { ...diagnosis, id: Date.now().toString() }
      ]
    }));
  };

  useEffect(() => {
    const initPermissions = async () => {
      if ((window as any).Capacitor && (window as any).Capacitor.isNative) {
        try {
          // Initialize Notification Channels
          await LocalNotifications.createChannel({
              id: 'medications',
              name: 'تنبيهات الأدوية',
              description: 'تنبيهات لمواعيد تناول الدواء',
              importance: 5,
              visibility: 1,
              vibration: true,
              lights: true,
              lightColor: '#10b981'
          });
          await LocalNotifications.createChannel({
              id: 'critical_alerts',
              name: 'تنبيهات هامة',
              description: 'تنبيهات عند تأخر الدواء',
              importance: 5,
              visibility: 1,
              vibration: true,
              lights: true,
              lightColor: '#ef4444'
          });
          await LocalNotifications.createChannel({
              id: 'reminders',
              name: 'تذكيرات عامة',
              importance: 3,
              visibility: 1
          });
          await LocalNotifications.createChannel({
              id: 'motivation',
              name: 'رسائل تشجيعية',
              importance: 3,
              visibility: 1
          });
          await LocalNotifications.createChannel({
              id: 'motivation',
              name: 'رسائل تحفيزية',
              description: 'رسائل دعم يومية',
              importance: 5,
              visibility: 1,
          });

          // Listeners setup only - permissions will be requested just-in-time
          /*
          PushNotifications.addListener('registration', token => {
             console.log('Push Registration Token: ', token.value);
             saveTokenToDatabase(state.patientId, token.value); 
          });

          PushNotifications.addListener('registrationError', err => {
             console.error('Push Registration Error: ', err);
          });

          PushNotifications.addListener('pushNotificationReceived', notification => {
             console.log('Push Received: ', notification);
             playChime();
             alert(`تنبيه: ${notification.title}\n${notification.body}`);
          });

          PushNotifications.addListener('pushNotificationActionPerformed', notification => {
             console.log('Push Action Performed: ', notification);
          });

          // Check if we already have permission, if so, register
          const pushPerm = await PushNotifications.checkPermissions();
          if (pushPerm.receive === 'granted') {
            await PushNotifications.register();
          }
          */

        } catch (e) {
          console.error('Permissions Init Failed', e);
        }
      };
    };
    initPermissions();

    // Init Purchases
    initializePurchases().then(() => {
        checkSubscriptionStatus().then(status => {
            if (status.isActive) {
                setState(prev => ({ ...prev, aiSubscriptionActive: true }));
            }
        });
        getOfferings().then(setOfferings);
    });

  }, []);

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

  useEffect(() => {
    if (state.caregiverMode) return;
    if (hasGeneratedMotivationRef.current) return;
    hasGeneratedMotivationRef.current = true;
    const line = generateMotivationMessage(state, new Date());
    setMotivationMessage(line);
  }, [state.caregiverMode]);

  const requestNotificationPermission = async () => {
    // Native Environment (Capacitor)
    if ((window as any).Capacitor && (window as any).Capacitor.isNative) {
        try {
            const localPerm = await LocalNotifications.requestPermissions();
            if (localPerm.display === 'granted') {
                setNotificationPermission('granted');
                
                // Also request Push Permissions
                /*
                try {
                    const pushPerm = await PushNotifications.requestPermissions();
                    if (pushPerm.receive === 'granted') {
                        await PushNotifications.register();
                    }
                } catch (e) { console.error("Push permission error", e); }
                */

                alert("تم تفعيل الإشعارات بنجاح! ستصلك التنبيهات في مواعيد الدواء.");
            } else {
                alert("يرجى تفعيل الإشعارات من إعدادات الهاتف لتلقي التنبيهات.");
            }
        } catch (e) {
            console.error("Native permission error", e);
        }
        return;
    }

    // Web Environment
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
          // console.log("FCM Token:", token);
        }

        alert("تم تفعيل الإشعارات بنجاح! ستصلك التنبيهات في مواعيد الدواء حتى والتطبيق مغلق.");
        new Notification("صحتي", { body: "الإشعارات الخلفية تعمل الآن بنجاح ✅", icon: 'https://cdn-icons-png.flaticon.com/512/3063/3063176.png' });
      }
    } catch (error) {
      console.error("Permission request failed", error);
    }
  };

  const exportAdherenceJson = () => {
    try {
      const safeState = makeJsonSafe(state);
      const payload = {
        ...safeState,
        exportedAt: new Date().toISOString(),
        appName: 'DawaCheck',
        version: '1.0'
      };
      
      const blob = new Blob([JSON.stringify(payload, null, 2)], { type: 'application/json' });
      const url = URL.createObjectURL(blob);
      const link = document.createElement('a');
      const dateStr = new Date().toISOString().split('T')[0];
      link.href = url;
      link.download = `dawa_backup_${state.patientId || 'patient'}_${dateStr}.json`;
      document.body.appendChild(link);
      link.click();
      document.body.removeChild(link);
      URL.revokeObjectURL(url);
      alert("تم حفظ نسخة احتياطية كاملة (شاملة الأدوية والتقارير والإعدادات).");
    } catch (e) {
      console.error(e);
      alert("حدث خطأ أثناء إنشاء ملف النسخة الاحتياطية.");
    }
  };

  const handleAdherenceJsonFile = (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = () => {
      try {
        const text = reader.result as string;
        const parsed = JSON.parse(text);
        
        if (!parsed || typeof parsed !== 'object') {
          alert("ملف غير صالح. يرجى اختيار ملف backup صحيح.");
          return;
        }

        // Validate essential fields to prevent crash
        if (parsed.medications && !Array.isArray(parsed.medications)) delete parsed.medications;
        if (parsed.upcomingProcedures && !Array.isArray(parsed.upcomingProcedures)) delete parsed.upcomingProcedures;
        if (parsed.labTests && !Array.isArray(parsed.labTests)) delete parsed.labTests;

        lastLocalActionTime.current = Date.now();
        isDirty.current = true;
        
        setState(prev => {
          const newState = {
            ...prev,
            dailyReports: parsed.dailyReports || prev.dailyReports,
            medications: parsed.medications || prev.medications,
            labTests: parsed.labTests || prev.labTests,
            upcomingProcedures: parsed.upcomingProcedures || prev.upcomingProcedures,
            caregiverMode: parsed.caregiverMode !== undefined ? parsed.caregiverMode : prev.caregiverMode,
            patientId: parsed.patientId || prev.patientId,
            patientName: parsed.patientName || prev.patientName,
            caregiverTargetId: parsed.caregiverTargetId || prev.caregiverTargetId,
            userProfile: parsed.userProfile || prev.userProfile,
            // Restore other settings if available
            darkMode: parsed.darkMode !== undefined ? parsed.darkMode : prev.darkMode,
            aiSubscriptionActive: parsed.aiSubscriptionActive !== undefined ? parsed.aiSubscriptionActive : prev.aiSubscriptionActive,
            overlayDisplayEnabled: parsed.overlayDisplayEnabled !== undefined ? parsed.overlayDisplayEnabled : prev.overlayDisplayEnabled
          };
          
          // Force immediate save to storage to prevent data loss on reload/crash
          try {
            localStorage.setItem('health_track_v6', JSON.stringify(makeJsonSafe(newState)));
          } catch (err) {
            console.error("Failed to save restored data to localStorage", err);
          }
          
          return newState;
        });
        
        alert("تم استرجاع البيانات بنجاح! سيتم إعادة تحميل التطبيق لضمان تفعيل البيانات.");
        // Optional: reload to ensure clean state
        setTimeout(() => window.location.reload(), 1500);
        
      } catch (e) {
        console.error(e);
        alert("تعذر قراءة ملف النسخة الاحتياطية. تأكد أن الملف سليم.");
      } finally {
        event.target.value = '';
      }
    };
    reader.readAsText(file, 'utf-8');
  };

  useEffect(() => {
    if (notificationPermission === 'granted') {
      // Create Notification Channels
      const createChannels = async () => {
          try {
            await LocalNotifications.createChannel({
                id: 'medications',
                name: 'تذكير الدواء',
                importance: 4,
                visibility: 1,
                vibration: true,
            });
            await LocalNotifications.createChannel({
                id: 'critical_alerts',
                name: 'تنبيهات هامة',
                importance: 5,
                visibility: 1,
                vibration: true,
                sound: 'siren.wav' 
            });
            await LocalNotifications.createChannel({
                id: 'motivation',
                name: 'رسائل تشجيعية',
                importance: 3,
                visibility: 1,
            });
            await LocalNotifications.createChannel({
                id: 'reminders',
                name: 'تذكيرات عامة',
                importance: 3,
                visibility: 1,
            });
          } catch (e) {
            console.error("Error creating notification channels", e);
          }
      };
      createChannels();

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
    const unsubscribe = onForegroundMessage((payload) => {
      // console.log('Foreground message:', payload);
      const { title, body } = payload.notification || {};
      if (title) {
        new Notification(title, { 
          body, 
          icon: 'https://cdn-icons-png.flaticon.com/512/3063/3063176.png' 
        });
        
        if (!isMuted && body && !state.caregiverMode && state.aiSubscriptionActive) { 
           playChime().then(() => speakText(body)); 
        }
      }
    });
    return () => unsubscribe && unsubscribe();
  }, [isMuted, state.caregiverMode]);

  useEffect(() => {
    const currentDayStr = now.toISOString().split('T')[0];
    if (state.currentReport?.date && state.currentReport.date !== currentDayStr) {
      setState(prev => {
        const yesterdayDate = prev.currentReport?.date || currentDayStr;
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
  }, [now, state.currentReport?.date]);

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
      // Only save if we have valid data to prevent overwriting with empty/corrupt state during reloads
      if (safeState && Object.keys(safeState).length > 0 && safeState.patientId) {
        localStorage.setItem('health_track_v6', JSON.stringify(safeState));
      }
    } catch (e) { console.error("Failed to save state:", e); }
  }, [state]);

  useEffect(() => {
    const todayStr = new Date().toISOString().split('T')[0];
    if (state.lastDailyTipDate === todayStr && state.dailyTipContent) return;

    const updateTip = async () => {
      let tip = computeDailyQuickTip(state);
      if (state.aiSubscriptionActive) {
        try {
          const aiTip = await generateDailyHealthTip(state);
          if (aiTip && aiTip.trim()) {
            tip = aiTip.trim();
          }
        } catch (e) {
        }
      }
      lastLocalActionTime.current = Date.now();
      isDirty.current = true;
      setState(prev => ({
        ...prev,
        dailyTipContent: tip,
        lastDailyTipDate: todayStr
      }));
    };

    updateTip();
  }, [
    state.currentReport,
    state.medications,
    state.medicalHistorySummary,
    state.dietGuidelines,
    state.lastDailyTipDate,
    state.dailyTipContent,
    state.aiSubscriptionActive
  ]);

  // Combined Notification Effect for Patient and Caregiver
  useEffect(() => {
    if (!state.notificationsEnabled) return;
    
    const checkAndNotify = async () => {
      const h = new Date().getHours();
      const todayStr = new Date().toISOString().split('T')[0];
      if (state.caregiverMode && !state.caregiverTargetId) return;

      const dueMeds = state.medications.filter(med => {
        const slotHour = SLOT_HOURS[med.timeSlot];
        const notifId = `${todayStr}-${med.id}-${state.caregiverMode ? 'cg' : 'pt'}`;
        return (
          h >= slotHour &&
          !state.takenMedications[med.id] &&
          !state.sentNotifications.includes(notifId)
        );
      });

      if (dueMeds.length > 0 && Notification.permission === 'granted') {
        const title = state.caregiverMode ? "تنبيه للمرافق: أدوية متأخرة ⚠️" : "تذكير بموعد الدواء 💊";
        const medNames = dueMeds.map(m => `${m.name} (${m.dosage})`).join(' و ');
        const body = state.caregiverMode
          ? `تأخر ${state.patientName} في تناول الأدوية التالية: ${medNames}`
          : `يا حاج ${state.patientName}، حان موعد تناول هذه الأدوية: ${medNames}`;

        if ('serviceWorker' in navigator && navigator.serviceWorker.controller) {
          navigator.serviceWorker.ready.then(reg => {
            reg.showNotification(title, {
              body,
              icon: 'https://cdn-icons-png.flaticon.com/512/3063/3063176.png',
              badge: 'https://cdn-icons-png.flaticon.com/512/3063/3063176.png',
              vibrate: [200, 100, 200],
              tag: 'medication-group',
              renotify: true
            } as any);
          });
        } else {
          new Notification(title, { body });
        }

        if (!isMuted && !state.caregiverMode && state.aiSubscriptionActive) {
          const speechText = state.caregiverMode
            ? `تنبيه للمرافق: المريض تأخر في تناول الأدوية التالية: ${medNames}`
            : `تذكير بموعد الدواء: حان الآن وقت تناول الأدوية التالية: ${medNames}. من فضلك لا تنسى أي جرعة.`;
          playChime().then(() => speakText(speechText));
        }

        setState(prev => {
          const newSent = [...prev.sentNotifications];
          dueMeds.forEach(med => {
            const notifId = `${todayStr}-${med.id}-${prev.caregiverMode ? 'cg' : 'pt'}`;
            if (!newSent.includes(notifId)) newSent.push(notifId);
          });
          return { ...prev, sentNotifications: newSent };
        });
      }
    };
    const timer = setInterval(checkAndNotify, 60000);
    checkAndNotify();
    return () => clearInterval(timer);
  }, [state.notificationsEnabled, state.medications, state.takenMedications, state.sentNotifications, isMuted, state.caregiverMode, state.patientName, state.caregiverTargetId, state.lastDailyTipDate]);

  useEffect(() => {
    const handleRemoteReminder = async () => {
      if (!state.remoteReminder || isMuted || state.caregiverMode || !state.aiSubscriptionActive) return;
      const { timestamp, medName } = state.remoteReminder;
      const fiveMinutesAgo = Date.now() - 300000;
      if (timestamp > lastHandledReminderTime.current && timestamp > fiveMinutesAgo) {
        lastHandledReminderTime.current = timestamp;
        try {
          playNotification(`تنبيه هام من المرافق: حان الآن موعد تناول دواء ${medName}. فضلاً لا تتأخر.`, true);
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
          dg: remoteData.dietGuidelines, up: remoteData.upcomingProcedures, tip: remoteData.lastDailyTipDate,
          labs: remoteData.labTests
        });
        const remoteHash = JSON.stringify(remoteSubset);
        const localSubset = makeJsonSafe({
          m: prev.medications, tr: prev.takenMedications, cr: prev.currentReport,
          dr: prev.dailyReports, rr: prev.remoteReminder, mh: prev.medicalHistorySummary, 
          dg: prev.dietGuidelines, up: prev.upcomingProcedures, tip: prev.lastDailyTipDate,
          labs: prev.labTests
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
            labTests: remoteData.labTests || prev.labTests || [],
            lastDailyTipDate: remoteData.lastDailyTipDate || prev.lastDailyTipDate,
            dailyTipContent: remoteData.dailyTipContent || prev.dailyTipContent,
            caregiverHistory: (() => {
                if (prev.caregiverMode && prev.caregiverTargetId && remoteData.patientName && prev.caregiverTargetId.length <= 8) {
                    const newEntry = { id: prev.caregiverTargetId, name: remoteData.patientName, lastUsed: new Date().toISOString() };
                    const list = prev.caregiverHistory || [];
                    const filtered = list.filter(h => h.id !== newEntry.id);
                    return [newEntry, ...filtered].slice(0, 5);
                }
                return prev.caregiverHistory;
            })()
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
    if (state.caregiverMode) return;
    setState(prev => {
      if (prev.caregiverMode) return prev;
      const todayStr = today;
      const newTip = computeDailyQuickTip(prev);
      if (prev.lastDailyTipDate === todayStr && prev.dailyTipContent === newTip) return prev;
      isDirty.current = true;
      return {
        ...prev,
        lastDailyTipDate: todayStr,
        dailyTipContent: newTip
      };
    });
  }, [state.currentReport, state.medications, state.caregiverMode]);

  useEffect(() => {
    const timer = setInterval(() => setNow(new Date()), 60000);
    return () => clearInterval(timer);
  }, []);

  const activeMedications = state.medications;
  const activeTakenMeds = state.takenMedications;
  const activeReport = state.currentReport || DEFAULT_REPORT;
  const activeName = state.patientName;
  const activeDailyReports = state.dailyReports;
  const displayedDietPlan = aiDietPlan || (selectedHistoryDate ? activeDailyReports[selectedHistoryDate]?.report?.aiDietPlan : activeDailyReports[today]?.report?.aiDietPlan);
  const currentHour = now.getHours();

  const scheduleMotivationalQuotes = useCallback(async () => {
    // Schedule every 3 hours from 8 AM to 8 PM
    const notifications = [];
    const hours = [8, 11, 14, 17, 20];
    
    for (const hour of hours) {
        const randomQuote = MOTIVATIONAL_QUOTES[Math.floor(Math.random() * MOTIVATIONAL_QUOTES.length)];
        notifications.push({
            id: 10000 + hour,
            title: "رسالة لك 💌",
            body: randomQuote,
            schedule: { on: { hour, minute: 0 }, allowWhileIdle: true },
            channelId: 'motivation',
            smallIcon: 'ic_launcher',
            extra: { type: 'motivation' }
        });
    }
    
    try {
        await LocalNotifications.schedule({ notifications });
    } catch (e) { console.error("Error scheduling quotes", e); }
  }, []);

  const scheduleMedicationNotifications = useCallback(async (meds: Medication[]) => {
    const notifications: any[] = [];
    
    for (const med of meds) {
        const slotTimeStr = state.slotHours?.[med.timeSlot] || SLOT_HOURS[med.timeSlot];
        const [hStr, mStr] = slotTimeStr.toString().split(':');
        const h = parseInt(hStr);
        const m = parseInt(mStr || '0');

        // Calculate late time (30 mins later)
        let lateH = h;
        let lateM = m + 30;
        if (lateM >= 60) {
            lateH = (lateH + 1) % 24;
            lateM -= 60;
        }
        
        const medIdHash = hashCode(med.id);
        
        // 1. On-time notification
        notifications.push({
            id: medIdHash,
            title: "وقت الدواء 💊",
            body: `حان موعد تناول: ${med.name} (${med.dosage})`,
            schedule: { on: { hour: h, minute: m }, allowWhileIdle: true },
            channelId: 'medications',
            smallIcon: 'ic_notification',
            actionTypeId: 'MEDICATION_ACTIONS',
            extra: { medId: med.id, type: 'reminder' }
        });
        
        // Late notification removed as per user request (replaced by in-app DraggableLateAlert)
    }

    // Schedule End of Day Report Reminder (9 PM)
    notifications.push({
      id: 99999,
      title: "📝 تقرير اليوم",
      body: "لا تنس تسجيل تقريرك الصحي اليومي للحصول على نصائح مخصصة.",
      schedule: { on: { hour: 21, minute: 0 }, allowWhileIdle: true },
      channelId: 'reminders',
      smallIcon: 'ic_launcher',
      extra: { type: 'daily_report' }
    });
    
    try {
        await LocalNotifications.registerActionTypes({
            types: [{
                id: 'MEDICATION_ACTIONS',
                actions: [
                    { id: 'snooze_15', title: 'تذكير بعد 15 دقيقة', foreground: true },
                    { id: 'take', title: 'تم التناول', foreground: true }
                ]
            }]
        });

        await LocalNotifications.schedule({ notifications });
    } catch (e) { console.error("Error scheduling med notifications", e); }
  }, [state.slotHours]);



  useEffect(() => {
    if (hasOnboarded) {
        scheduleMotivationalQuotes();
    }
  }, [hasOnboarded, scheduleMotivationalQuotes]);

  useEffect(() => {
    if (hasOnboarded) {
        scheduleMedicationNotifications(state.medications);
    }
  }, [state.medications, hasOnboarded, scheduleMedicationNotifications]);

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
      const wasTaken = !!prev.takenMedications[id];
    const isTaken = !wasTaken;

    if (isTaken) {
        // Cancel late reminder if taking medication
        const medIdHash = hashCode(id);
        LocalNotifications.cancel({ notifications: [{ id: medIdHash + 1 }] }).catch(console.error);
    }
      const newTaken = { ...prev.takenMedications, [id]: isTaken };
      const groupName = med?.name;
      let currentStock = 0;
      if (groupName) {
        const groupMeds = prev.medications.filter(m => m.name === groupName);
        if (groupMeds.length > 0) {
          const baseStock = groupMeds[0].stock;
          currentStock = typeof baseStock === 'number' ? baseStock : 0;
        }
      }
      let newStock = currentStock;
      if (groupName) {
        // Extract numeric dosage from med.dosage (e.g., "0.5 pill" -> 0.5)
        const dosageMatch = med?.dosage?.match(/(\d+(\.\d+)?)/);
        const dosageAmount = dosageMatch ? parseFloat(dosageMatch[0]) : 1;
        
        if (isTaken) {
          if (currentStock > 0) newStock = Math.max(0, currentStock - dosageAmount);
        } else {
          newStock = currentStock + dosageAmount;
        }
      }
      const updatedMedications = prev.medications.map(m => {
        if (!groupName || m.name !== groupName) return m;
        return { ...m, stock: newStock };
      });
      const log = {
        date: new Date().toLocaleDateString('ar-EG'),
        action: isTaken ? '✅ تناول الجرعة' : '🔄 تراجع عن الجرعة',
        details: med?.name || id,
        timestamp: new Date().toLocaleTimeString('ar-EG', { hour: '2-digit', minute: '2-digit' })
      };
      const newDailyReports = { ...prev.dailyReports };
      newDailyReports[today] = { report: prev.currentReport, takenMedications: newTaken };
      return { ...prev, medications: updatedMedications, takenMedications: newTaken, history: [log, ...prev.history].slice(0, 30), dailyReports: newDailyReports };
    });
  }, [activeMedications, state.takenMedications, today]);

  // Setup Notification Action Listener
  const toggleMedicationRef = useRef(toggleMedication);
  useEffect(() => { toggleMedicationRef.current = toggleMedication; }, [toggleMedication]);

  useEffect(() => {
    LocalNotifications.addListener('localNotificationActionPerformed', async (notification) => {
      console.log('Notification Action:', notification);
      if (notification.actionId === 'snooze_15') {
        const originalNotif = notification.notification;
        // Schedule for 15 mins later
        const newTime = new Date(Date.now() + 15 * 60 * 1000); 
        
        try {
            await LocalNotifications.schedule({
              notifications: [{
                id: (originalNotif.id ? Number(originalNotif.id) : 0) + 100000 + Math.floor(Math.random() * 1000), // Ensure unique ID
                title: originalNotif.title || "تذكير مؤجل",
                body: `تذكير مؤجل: ${originalNotif.body}`,
                schedule: { at: newTime, allowWhileIdle: true },
                channelId: 'critical_alerts',
                smallIcon: 'ic_notification',
                extra: originalNotif.extra
              }]
            });
            // Feedback to user
            alert("تم تأجيل التذكير لمدة 15 دقيقة ⏰");
        } catch (e) {
            console.error("Snooze scheduling failed", e);
        }
      } 
      else if (notification.actionId === 'take') {
        const medId = notification.notification.extra?.medId;
        if (medId) {
          toggleMedicationRef.current(medId);
        }
      }
    });
    
    return () => {
      LocalNotifications.removeAllListeners('localNotificationActionPerformed');
    };
  }, []);

  const handleSendReminder = async (medName: string) => {
    const targetId = state.caregiverTargetId;
    if (!targetId || !isOnline) return;
    try {
      await sendRemoteReminder(targetId, medName);
    } catch (err) { console.error(err); }
  };

  // Emergency Card Notification
  useEffect(() => {
    const updateEmergencyNotification = async () => {
      if (!state.aiSubscriptionActive) return;
      
      const bloodType = state.bloodType || 'غير محدد';
      const doctor = state.doctorPhone || 'غير محدد';
      const chronic = state.medicalHistorySummary ? (state.medicalHistorySummary.slice(0, 50) + (state.medicalHistorySummary.length > 50 ? '...' : '')) : 'لا يوجد';

      await LocalNotifications.schedule({
        notifications: [{
          title: 'بطاقة الطوارئ الطبية',
          body: `فصيلة الدم: ${bloodType} | الطبيب: ${doctor} | ${chronic}`,
          id: 99999,
          ongoing: true,
          sticky: true,
          smallIcon: 'ic_launcher',
          schedule: { at: new Date(Date.now() + 1000) },
          channelId: 'critical_alerts'
        }]
      });
    };

    updateEmergencyNotification();
  }, [state.bloodType, state.doctorPhone, state.medicalHistorySummary, state.aiSubscriptionActive]);


  const handleFamilyMessage = (msgText: string) => {
    lastLocalActionTime.current = Date.now();
    isDirty.current = true;
    const newMsg = {
        id: Date.now().toString(),
        sender: state.caregiverMode ? 'المرافق' : (state.patientName || 'المريض'),
        message: msgText,
        timestamp: Date.now()
    };
    setState(prev => ({
        ...prev,
        familyMessages: [...(prev.familyMessages || []), newMsg]
    }));
  };

  const handleSaveMedication = async () => {
    if (!editingMed || !editingMed.name || !editingMed.dosage) {
      alert("يرجى إكمال بيانات الدواء الأساسية (الاسم والجرعة)"); return;
    }

    // AI Drug Interaction Check
    if (!editingMed.id && state.aiSubscriptionActive) {
       try {
         const check = await checkDrugInteractions(editingMed.name, state.medications);
         if (check.hasInteraction) {
             const confirm = window.confirm(`⚠️ تحذير تعارض دوائي!\n${check.warning}\n\nهل تريد حفظ الدواء رغم ذلك؟`);
             if (!confirm) return;
         }
       } catch (e) {
         console.error("Interaction check failed", e);
       }
    }

    lastLocalActionTime.current = Date.now();
    isDirty.current = true;

    setState(prev => {
      let newMeds = [...prev.medications];
      
      // Case 1: Editing existing medication (Single ID)
      if (editingMed.id) {
        newMeds = prev.medications.map(m => {
          if (m.id === editingMed.id) {
            return { ...m, ...editingMed };
          }
          if (m.name === editingMed.name) {
            return { 
              ...m, 
              stock: typeof editingMed.stock === 'number' ? editingMed.stock : m.stock,
              refillUnit: editingMed.refillUnit || m.refillUnit
            };
          }
          return m;
        });
      } else {
        if (frequencyMode === 'recurring') {
           const medsToAdd: Medication[] = [];
           const slotsToUse = recurringSlots.slice(0, recurringCount);
           
           slotsToUse.forEach((slot, index) => {
               const suffix = TIME_SLOT_CONFIG[slot].label;
               const timeVal = state.slotHours?.[slot] || SLOT_HOURS[slot];
               const timeStr = formatHour(timeVal);
               const name = `${editingMed.name} - ${suffix} (${timeStr})`;
               
               const newMed: Medication = { 
                ...(editingMed as Medication), 
                id: `med-${Date.now()}-${index}`,
                name: name,
                timeSlot: slot,
                frequencyLabel: suffix,
                stock: editingMed.stock
              };
              medsToAdd.push(newMed);
           });
           newMeds = [...prev.medications, ...medsToAdd];
        } else {
            let stock = editingMed.stock;
            if (stock === undefined) {
              const sameName = prev.medications.find(m => m.name === editingMed.name);
              if (sameName && typeof sameName.stock === 'number') {
                stock = sameName.stock;
              }
            }
            const newMed: Medication = { 
              ...(editingMed as Medication), 
              id: `med-${Date.now()}`,
              frequencyLabel: TIME_SLOT_CONFIG[editingMed.timeSlot || 'morning-fasting'].label,
              stock
            };
            newMeds = [...prev.medications, newMed];
        }
      }
      return { ...prev, medications: newMeds };
    });
    setEditingMed(null);
  };

  const handleDeleteMedication = () => {
    if (!idToDelete) return;

    // Cancel notifications for this med
    const medIdHash = hashCode(idToDelete);
    LocalNotifications.cancel({ notifications: [{ id: medIdHash }, { id: medIdHash + 1 }] }).catch(console.error);

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
    openWhatsApp(message);
  };

  const exportAdherenceJson = () => {
    const patientId = state.caregiverMode ? state.caregiverTargetId || state.patientId : state.patientId;
    const payload = {
      patientId,
      patientName: state.patientName,
      generatedAt: new Date().toISOString(),
      dailyReports: state.dailyReports || {}
    };
    const safe = makeJsonSafe(payload);
    const blob = new Blob([JSON.stringify(safe, null, 2)], { type: 'application/json;charset=utf-8' });
    const url = URL.createObjectURL(blob);
    const todayStr = new Date().toISOString().split('T')[0];
    const fileId = patientId || 'UNKNOWN';
    const a = document.createElement('a');
    a.href = url;
    a.download = `adherence-history-${fileId}-${todayStr}.json`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
  };

  const handleImportAdherenceJson = (event: React.ChangeEvent<HTMLInputElement>) => {
    const input = event.target;
    const file = input.files?.[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = () => {
      try {
        const text = reader.result as string;
        const parsed = JSON.parse(text);
        const importedReports = parsed.dailyReports || parsed;
        if (!importedReports || typeof importedReports !== 'object') {
          alert("ملف JSON غير صالح. تأكد من اختيار الملف الصحيح.");
          input.value = '';
          return;
        }
        lastLocalActionTime.current = Date.now();
        isDirty.current = true;
        setState(prev => {
          const merged = { ...prev.dailyReports, ...importedReports };
          const todayStr = prev.currentReport.date || new Date().toISOString().split('T')[0];
          const todayData = merged[todayStr];
          return {
            ...prev,
            dailyReports: merged,
            currentReport: todayData?.report || prev.currentReport,
            takenMedications: todayData?.takenMedications || prev.takenMedications
          };
        });
        alert("تم استرجاع تاريخ الالتزام الدوائي من ملف JSON بنجاح.");
      } catch (err) {
        console.error(err);
        alert("تعذر قراءة ملف JSON. تأكد من أن الملف صحيح.");
      } finally {
        input.value = '';
      }
    };
    reader.readAsText(file, 'utf-8');
  };

  const handleFullBackup = () => {
    const payload = {
      ...state,
      backupDate: new Date().toISOString(),
      version: '6.0'
    };
    const safe = makeJsonSafe(payload);
    const blob = new Blob([JSON.stringify(safe, null, 2)], { type: 'application/json;charset=utf-8' });
    const url = URL.createObjectURL(blob);
    const dateStr = new Date().toISOString().split('T')[0];
    const a = document.createElement('a');
    a.href = url;
    a.download = `full-backup-${state.patientName.replace(/\s+/g, '-')}-${dateStr}.json`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
  };

  const handleFullRestore = (event: React.ChangeEvent<HTMLInputElement>) => {
    const input = event.target;
    const file = input.files?.[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = () => {
      try {
        const text = reader.result as string;
        const parsed = JSON.parse(text);
        if (!parsed.patientId || !parsed.medications) {
           alert("ملف غير صالح. تأكد من اختيار ملف نسخ احتياطي كامل.");
           return;
        }
        if (window.confirm("هل أنت متأكد من استعادة النسخة الاحتياطية؟ سيتم استبدال البيانات الحالية.")) {
           setState(parsed);
           alert("تم استعادة البيانات بنجاح!");
           window.location.reload();
        }
      } catch (e) {
        console.error(e);
        alert("خطأ في قراءة الملف.");
      } finally {
        input.value = '';
      }
    };
    reader.readAsText(file, 'utf-8');
  };

  const toggleMute = () => { if (!isMuted) stopSpeech(); setIsMuted(!isMuted); };
  const toggleDarkMode = () => setState(prev => ({ ...prev, darkMode: !prev.darkMode }));

  const handleAI = async () => {
    if (!state.aiSubscriptionActive) {
      alert("خدمة التحليل الصحي الذكي متاحة فقط بعد تفعيل الاشتراك الشهري.");
      return;
    }
    setIsAnalyzing(true);
    setAiResult(null);
    try {
      const res = await analyzeHealthStatus(state);
      setAiResult(res);
      const todayStr = new Date().toISOString().split('T')[0];
      const aiTip = res.recommendations && res.recommendations.length > 0 ? (res.recommendations[0] || '').trim() : '';
      if (aiTip) {
        lastLocalActionTime.current = Date.now();
        isDirty.current = true;
        setState(prev => ({
          ...prev,
          dailyTipContent: aiTip,
          lastDailyTipDate: todayStr
        }));
      }
      if (!isMuted && state.aiSubscriptionActive) await speakText(res.summary);
    } catch (e: any) { 
      console.error("AI Analysis Failed:", e);
      const errorMessage = e?.message || "غير محدد";
      alert(`عذراً، لم نتمكن من تحليل الحالة حالياً.\nالسبب: ${errorMessage}\nيرجى التأكد من اتصال الإنترنت والمحاولة مرة أخرى.`); 
    } finally {
      setIsAnalyzing(false);
    }
  };

  const handleVoiceCommand = (text: string) => {
    if (!state.aiSubscriptionActive) return;

    const lower = text.toLowerCase();
    
    if (lower.includes('أخدت') || lower.includes('تناولت') || lower.includes('اخذت')) {
      const med = state.medications.find(m => lower.includes(m.name.toLowerCase()));
      if (med) {
        // Correct logic to update state directly
        const medId = med.id;
        
        // Use functional state update to ensure we have latest state
        setState(prev => {
           const wasTaken = !!prev.takenMedications[medId];
           if (wasTaken) {
               // Already taken
               speakText(`لقد سجلت دواء ${med.name} بالفعل`);
               return prev; // No change
           }

           const newTaken = { ...prev.takenMedications, [medId]: true };
           
           // Log to history
           const log: HistoryLog = {
               id: Date.now().toString(),
               action: 'taken',
               medicationId: medId,
               medicationName: med.name,
               timestamp: new Date().toISOString(),
               details: 'تم التسجيل صوتياً'
           };
           
           // Update daily report
           const newDailyReports = { ...prev.dailyReports };
           const todayReport = newDailyReports[today] || { 
               date: today, 
               takenMedications: {}, 
               mood: 'neutral',
               symptoms: [],
               waterIntake: 0 
           };
           
           newDailyReports[today] = {
               ...todayReport,
               takenMedications: { ...todayReport.takenMedications, [medId]: true }
           };

           // Cancel late reminder if exists
           const medIdHash = hashCode(medId);
           LocalNotifications.cancel({ notifications: [{ id: medIdHash + 1 }] }).catch(console.error);

           return { 
               ...prev, 
               takenMedications: newTaken, 
               history: [log, ...prev.history].slice(0, 30), 
               dailyReports: newDailyReports 
           };
        });

        // Since setState is async, we can't easily know if it was "already taken" inside the setter for alert purposes
        // So we just show success message assuming it worked or was harmless
        alert(`تم تسجيل تناول دواء ${med.name} بنجاح ✅`);
        speakText(`تم تسجيل دواء ${med.name}، شفاك الله وعافاك`);
      } else {
        alert("لم أتمكن من التعرف على اسم الدواء في جملتك. حاول ذكر الاسم بوضوح.");
        speakText("لم أتعرف على اسم الدواء");
      }
    } else if (lower.includes('صداع') || lower.includes('تعبان') || lower.includes('ألم') || lower.includes('دايخ')) {
      const today = new Date().toISOString().split('T')[0];
      
      lastLocalActionTime.current = Date.now();
      isDirty.current = true;
      
      setState(prev => {
        const report = prev.dailyReports[today] || { 
            date: today, 
            takenMedications: {}, 
            mood: 'neutral',
            symptoms: [],
            waterIntake: 0
        };
        const currentNotes = report.notes || '';
        const newNotes = currentNotes ? `${currentNotes}\n- تسجيل صوتي: ${text}` : `- تسجيل صوتي: ${text}`;
        
        // Also update currentReport if it's for today (which it usually is)
        const updatedCurrentReport = { ...prev.currentReport, notes: newNotes };
        
        const newDailyReports = {
            ...prev.dailyReports,
            [today]: {
              ...report,
              notes: newNotes
            }
        };

        return {
          ...prev,
          currentReport: updatedCurrentReport,
          dailyReports: newDailyReports
        };
      });
      alert("تم تسجيل الأعراض في تقرير اليوم.");
      speakText("سلامتك الف سلامة، سجلت تعبك في التقرير");
    } else {
      alert(`لم أتعرف على الأمر: "${text}"\nجرب قول: "أخدت دواء الضغط" أو "حاسس بصداع"`);
    }
  };

  useEffect(() => {
    handleVoiceCommandRef.current = handleVoiceCommand;
  }, [handleVoiceCommand]);

  useEffect(() => {
    if ('webkitSpeechRecognition' in window || 'SpeechRecognition' in window) {
      const SpeechRecognition = (window as any).SpeechRecognition || (window as any).webkitSpeechRecognition;
      const recognitionInstance = new SpeechRecognition();
      recognitionInstance.continuous = false;
      recognitionInstance.lang = 'ar-EG';
      recognitionInstance.interimResults = false;

      recognitionInstance.onresult = (event: any) => {
        const text = event.results[0][0].transcript;
        console.log('Voice Command:', text);
        if (handleVoiceCommandRef.current) {
            handleVoiceCommandRef.current(text);
        }
        setIsVoiceListening(false);
      };

      recognitionInstance.onerror = (event: any) => {
        console.error('Speech recognition error', event.error);
        setIsVoiceListening(false);
      };

      recognitionInstance.onend = () => {
        setIsVoiceListening(false);
      };

      setVoiceRecognition(recognitionInstance);
    }
  }, []);

  const toggleVoiceListening = () => {
    if (!state.aiSubscriptionActive) {
         setIsSubscriptionModalOpen(true);
         return;
    }
    
    if (!voiceRecognition) {
      alert('عذراً، المتصفح لا يدعم الأوامر الصوتية');
      return;
    }

    if (isVoiceListening) {
      voiceRecognition.stop();
    } else {
      voiceRecognition.start();
      setIsVoiceListening(true);
    }
  };

  const handleGenerateDiet = async () => {
    if (!state.aiSubscriptionActive) {
      setIsSubscriptionModalOpen(true);
      return;
    }
    setIsGeneratingDiet(true);
    try {
      const plan = await generateDietPlan(state);
      if (plan) {
        setAiDietPlan(plan);
        // Also update daily report if exists
        setState(prev => {
           const todayStr = new Date().toISOString().split('T')[0];
           const updatedDailyReports = { ...prev.dailyReports };
           if (updatedDailyReports[todayStr]) {
             updatedDailyReports[todayStr].report.aiDietPlan = plan;
           }
           return { ...prev, dailyReports: updatedDailyReports };
        });
      }
    } catch (e) {
      console.error("Diet generation error", e);
      alert("حدث خطأ أثناء توليد النظام الغذائي. يرجى المحاولة لاحقاً.");
    } finally {
      setIsGeneratingDiet(false);
    }
  };

  const handleGoogleSignIn = async () => {
    try {
      const u = await signInWithGoogle();
      let restored = false;
      
      if (u) {
          setUser(u);
          localStorage.setItem('auth_user', JSON.stringify(u));
          if (u.displayName) {
            setState(prev => ({ ...prev, patientName: u.displayName || prev.patientName }));
            setOnboardingName(u.displayName);
          }
          
          // Attempt to restore data for this user
          try {
              const key = `cloud_${u.uid}`;
              const saved = localStorage.getItem(key);
              if (saved) {
                  const parsed = JSON.parse(saved);
                  // Merge restored data but keep critical session flags if needed
                  // We update patientId to match the logged in user
                  setState(prev => ({ 
                      ...prev, 
                      ...parsed, 
                      patientId: u.uid,
                      patientName: u.displayName || parsed.patientName || prev.patientName
                  }));
                  
                  // Sync onboarding state with restored data
                  if (parsed.patientAge) setOnboardingAge(parsed.patientAge.toString());
                  if (parsed.patientGender) setOnboardingGender(parsed.patientGender);
                  if (parsed.medicalHistorySummary) setOnboardingMedicalSummary(parsed.medicalHistorySummary);
                  if (parsed.medications && parsed.medications.length > 0) {
                      setOnboardingMeds(parsed.medications);
                      setIsMedsDone(true);
                      restored = true;
                      
                      // Skip to notifications/location if data restored
                      // We will handle the navigation in the caller to avoid side effects
                  }
              } else {
                  // No data found, but let's update patientId to user uid for future saves
                  setState(prev => ({ ...prev, patientId: u.uid }));
              }
          } catch (e) {
              console.error("Failed to restore user data", e);
          }
      }
      
      alert(`مرحباً بك ${u.displayName}! تم تسجيل الدخول بنجاح.`);
      return { user: u, restored };
    } catch (error) {
      console.error(error);
      alert("حدث خطأ أثناء تسجيل الدخول بـ Google.");
      return { user: null, restored: false };
    }
  };

  const handleAppleSignIn = async () => {
    try {
      const u = await signInWithApple();
      setUser(u);
      if (u) localStorage.setItem('auth_user', JSON.stringify(u));
      if (u && u.displayName) {
        setState(prev => ({ ...prev, patientName: u.displayName || prev.patientName }));
        setOnboardingName(u.displayName);
      }
      alert(`مرحباً بك ${u.displayName}! تم تسجيل الدخول بنجاح.`);
      return u;
    } catch (error) {
      console.error(error);
      alert("حدث خطأ أثناء تسجيل الدخول بـ Apple.");
      return null;
    }
  };

  const handleSignOut = async () => {
    try {
      await signOut();
    } catch (error) {
      console.error("SignOut error", error);
    } finally {
      setUser(null);
      localStorage.removeItem('auth_user');
      // Reset critical state but maybe keep some preferences?
      // For now, clear identity
      setState(prev => ({ ...prev, patientName: '' }));
      setOnboardingName('');
      alert("تم تسجيل الخروج.");
    }
  };

  const copyPatientId = () => {
    const idToCopy = state.caregiverMode ? state.caregiverTargetId : state.patientId;
    if (idToCopy) { navigator.clipboard.writeText(idToCopy); alert("تم نسخ الرمز بنجاح!"); }
  };

  const progress = activeMedications.length > 0 ? (Object.values(activeTakenMeds).filter(Boolean).length / activeMedications.length) * 100 : 0;
  const takenCount = Object.values(activeTakenMeds).filter(Boolean).length;
  const totalMeds = activeMedications.length;
  const dailyQuickTip = state.dailyTipContent || computeDailyQuickTip(state);
  const isAiSubscribed = !!state.aiSubscriptionActive;

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

  const formatHour = (h: number | string | undefined) => {
    if (h === undefined || h === null) return '--:--';
    let hour = 0;
    let minute = 0;
    if (typeof h === 'string') {
        const parts = h.split(':');
        hour = parseInt(parts[0]);
        minute = parseInt(parts[1] || '0');
    } else {
        hour = h;
    }
    
    if (isNaN(hour)) return '--:--';

    const ampm = hour >= 12 ? 'م' : 'ص';
    const displayHour = hour % 12 || 12;
    const displayMinute = minute.toString().padStart(2, '0');
    
    return `${displayHour}:${displayMinute} ${ampm}`;
  };

  if (!hasOnboarded) {
    const handleChatSubmit = async (customValue?: string, action?: string) => {
      const value = customValue || chatInput.trim();
      if (!value && !action) return;
      
      if (!customValue && !action) {
          setChatInput('');
          addUserMessage(value);
      } else if (customValue) {
          addUserMessage(customValue);
      }

      setIsChatTyping(true);
      
      if (action === 'SIGNIN_GOOGLE' || value === 'SIGNIN_GOOGLE') {
           try {
               const result = await handleGoogleSignIn();
               const u = result.user;
               
               if (u) {
                   // Request permissions sequentially
                   
                   // 1. Notifications
                   await requestNotificationPermission();

                   // 2. Camera
                   try {
                       await Camera.requestPermissions();
                   } catch (err) { console.error("Camera permission error", err); }

                   // 3. Location
                   try {
                        if (Capacitor.isNativePlatform()) {
                            await Geolocation.requestPermissions();
                        }
                   } catch (err) { console.error("Location permission error", err); }

                   // 4. Display Over Apps (Overlay)
                   if (Capacitor.getPlatform() === 'android') {
                        alert("يرجى تفعيل خيار 'الظهور فوق التطبيقات' لضمان عمل التنبيهات.");
                        
                        if ((window as any).plugins && (window as any).plugins.intentShim) {
                            (window as any).plugins.intentShim.startActivity(
                                {
                                    action: "android.settings.action.MANAGE_OVERLAY_PERMISSION",
                                    data: "package:com.sahaty.app"
                                },
                                () => console.log("Overlay settings opened"),
                                (err: any) => {
                                    console.error("Failed to open overlay settings via intent", err);
                                    CapacitorApp.openAppSettings();
                                }
                            );
                        } else {
                            CapacitorApp.openAppSettings();
                        }
                   }

                   // Redirect to app
                   setHasOnboarded(true);

               } else {
                   addBotMessage("فشل تسجيل الدخول. هل تود المحاولة مرة أخرى أو المتابعة كضيف؟", 'choice', [
                      { label: 'محاولة مرة أخرى', value: 'SIGNIN_GOOGLE' },
                      { label: 'متابعة كضيف', value: 'GUEST_LOGIN' }
                   ]);
               }
           } catch (e) {
               addBotMessage("حدث خطأ أثناء تسجيل الدخول. يرجى المحاولة لاحقاً.", 'choice', [
                  { label: 'متابعة كضيف', value: 'GUEST_LOGIN' }
               ]);
           }
           return;
      }

      if (action === 'GUEST_LOGIN' || value === 'GUEST_LOGIN') {
          setTimeout(() => addBotMessage("أهلاً بك! ما هو اسمك؟", 'form', undefined, 'name'), 500);
          return;
      }

      if (action === 'settings' || value === 'settings') {
          CapacitorApp.openAppSettings();
          return;
      }

      if (!onboardingName) {
          setOnboardingName(value);
          setTimeout(() => {
              addBotMessage(`أهلاً بك يا ${value}! هل تسمح لي بإرسال تنبيهات بمواعيد الدواء؟`, 'choice', [
                  { label: 'نعم، اسمح بذلك', value: 'ALLOW_NOTIFICATIONS' },
                  { label: 'لا، شكراً', value: 'SKIP_NOTIFICATIONS' }
              ]);
          }, 1000);
          return;
      }

      if (action === 'ALLOW_NOTIFICATIONS' || value === 'ALLOW_NOTIFICATIONS') {
          await requestNotificationPermission();
          setTimeout(() => addBotMessage("هل تسمح للتطبيق بالظهور فوق التطبيقات لضمان وصول التنبيهات حتى والهاتف مغلق؟", 'choice', [
              { label: 'تفعيل', value: 'ENABLE_OVERLAY' },
              { label: 'تخطي', value: 'SKIP_OVERLAY' }
          ]), 500);
          return;
      }
      if (action === 'SKIP_NOTIFICATIONS' || value === 'SKIP_NOTIFICATIONS') {
          setTimeout(() => addBotMessage("حسناً. هل تسمح للتطبيق بالظهور فوق التطبيقات لضمان وصول التنبيهات الهامة؟", 'choice', [
              { label: 'تفعيل', value: 'ENABLE_OVERLAY' },
              { label: 'تخطي', value: 'SKIP_OVERLAY' }
          ]), 500);
          return;
      }

      if (action === 'ENABLE_OVERLAY' || value === 'ENABLE_OVERLAY') {
          alert("لضمان عمل التنبيهات بكفاءة، يرجى تفعيل خيار 'الظهور فوق التطبيقات' (Display Over Apps).\n\nالخطوات:\n١. سيفتح لك الإعدادات الآن.\n٢. ابحث عن تطبيق 'صحتي' (Sahaty).\n٣. اضغط عليه وفعّل الزر.");
          
          if ((window as any).plugins && (window as any).plugins.intentShim) {
              (window as any).plugins.intentShim.startActivity(
                  {
                      action: "android.settings.action.MANAGE_OVERLAY_PERMISSION",
                      data: "package:com.sahaty.app"
                  },
                  () => console.log("Overlay settings opened"),
                  (err: any) => {
                      console.error("Failed to open overlay settings via intent, falling back to app settings", err);
                      CapacitorApp.openAppSettings();
                  }
              );
          } else {
               if (Capacitor.getPlatform() === 'android') {
                   CapacitorApp.openAppSettings();
               }
          }
          
          setTimeout(() => addBotMessage("ممتاز! هل تسمح بالوصول للميكروفون لاستخدام الأوامر الصوتية؟", 'choice', [
              { label: 'سماح', value: 'ALLOW_MIC' },
              { label: 'تخطي', value: 'SKIP_MIC' }
          ]), 1000);
          return;
      }

      if (action === 'SKIP_OVERLAY' || value === 'SKIP_OVERLAY') {
          setTimeout(() => addBotMessage("حسناً، يمكننا فعل ذلك لاحقاً. هل تسمح بالوصول للميكروفون لاستخدام الأوامر الصوتية؟", 'choice', [
              { label: 'سماح', value: 'ALLOW_MIC' },
              { label: 'تخطي', value: 'SKIP_MIC' }
          ]), 500);
          return;
      }

      if (action === 'ALLOW_MIC' || value === 'ALLOW_MIC') {
          try {
              await navigator.mediaDevices.getUserMedia({ audio: true });
              addBotMessage("تم منح صلاحية الميكروفون.");
          } catch (e) {
              console.error("Microphone permission denied", e);
              addBotMessage("لم نتمكن من الوصول للميكروفون، يمكنك تفعيله من الإعدادات.");
          }
          setTimeout(() => addBotMessage("الآن، هل تسمح بالوصول للموقع لتحديد مكانك بدقة؟", 'choice', [
              { label: 'نعم، حدد موقعي', value: 'GET_LOCATION' },
              { label: 'كتابة العنوان يدوياً', value: 'MANUAL_LOCATION' }
          ]), 1000);
          return;
      }

      if (action === 'SKIP_MIC' || value === 'SKIP_MIC') {
          setTimeout(() => addBotMessage("حسناً. هل تسمح بالوصول للموقع لتحديد مكانك بدقة؟", 'choice', [
              { label: 'نعم، حدد موقعي', value: 'GET_LOCATION' },
              { label: 'كتابة العنوان يدوياً', value: 'MANUAL_LOCATION' }
          ]), 500);
          return;
      }

      if (action === 'GET_LOCATION' || value === 'GET_LOCATION') {
          addBotMessage("جاري تحديد الموقع...");
          try {
              if (Capacitor.isNativePlatform()) {
                  const perm = await Geolocation.checkPermissions();
                  if (perm.location !== 'granted') {
                      const req = await Geolocation.requestPermissions();
                      if (req.location !== 'granted') {
                          throw new Error("لم يتم منح صلاحية الموقع");
                      }
                  }
              }
              
              const coordinates = await Geolocation.getCurrentPosition({ enableHighAccuracy: true, timeout: 15000 });
              const loc = `Lat: ${coordinates.coords.latitude.toFixed(5)}, Long: ${coordinates.coords.longitude.toFixed(5)}`;
              setOnboardingLocation(loc);
              setTimeout(() => {
                  if (onboardingAge && isMedsDone) {
                      addBotMessage("تم تحديد الموقع بنجاح. وبما أن بياناتك موجودة، سننتقل للخطوة الأخيرة.", 'choice', [{label: 'إنهاء', value: 'SHOW_DAILY_TIP'}]);
                  } else {
                      addBotMessage(`تم تحديد الموقع بنجاح.\n\nشكراً لك. كم عمرك؟ (بالسنوات)`, 'form', undefined, 'age');
                  }
              }, 500);
          } catch (e: any) {
              console.error("Location error:", e);
              addBotMessage(`تعذر تحديد الموقع تلقائياً (${e.message || 'خطأ'}). من فضلك اكتب العنوان يدوياً.`);
          }
          return;
      }

      if (action === 'MANUAL_LOCATION' || value === 'MANUAL_LOCATION') {
          addBotMessage("تفضل بكتابة العنوان:", 'form', undefined, 'location');
          return;
      }

      if (!onboardingLocation) {
          setOnboardingLocation(value);
          setTimeout(() => {
              if (onboardingAge && isMedsDone) {
                  addBotMessage("شكراً لك. وبما أن بياناتك موجودة، سننتقل للخطوة الأخيرة.", 'choice', [{label: 'إنهاء', value: 'SHOW_DAILY_TIP'}]);
              } else {
                  addBotMessage("شكراً لك. كم عمرك؟ (بالسنوات)", 'form', undefined, 'age');
              }
          }, 500);
          return;
      }

      if (!onboardingAge) {
           const age = parseInt(value);
           if (isNaN(age) || age <= 0 || age > 120) {
               setTimeout(() => addBotMessage("من فضلك أدخل عمراً صحيحاً (أرقام فقط)."), 500);
               return;
           }
           setOnboardingAge(value);
           setTimeout(() => {
               addBotMessage("تمام. ما هو نوعك؟", 'choice', [
                   { label: 'ذكر', value: 'male' },
                   { label: 'أنثى', value: 'female' }
               ]);
           }, 800);
           return;
      }

      if (!onboardingGender) {
           const genderValue = action || value;
           if (genderValue === 'male' || genderValue === 'female') {
               setOnboardingGender(genderValue as any);
               setTimeout(() => {
                   addBotMessage("هل لديك ملخص للحالة الطبية تريد إضافته؟", 'choice', [
                       { label: 'نعم، إضافة ملخص', value: 'ADD_SUMMARY' },
                       { label: 'تخطي', value: 'SKIP_SUMMARY' }
                   ]);
               }, 800);
           }
           return;
      }

      if (!onboardingMedicalSummary) {
          if (action === 'ADD_SUMMARY' || value === 'ADD_SUMMARY') {
              setTimeout(() => addBotMessage("تفضل بكتابة الملخص الطبي هنا:"), 500);
              return;
          }
          if (action === 'SKIP_SUMMARY' || value === 'SKIP_SUMMARY') {
              setOnboardingMedicalSummary('skip');
              setTimeout(() => {
                   addBotMessage("هل تود إضافة الأدوية يدوياً أم باستخدام الذكاء الاصطناعي (تصوير الروشتة)؟", 'choice', [
                       { label: 'إدخال يدوي', value: 'manual' },
                       { label: 'ذكاء اصطناعي (اشتراك)', value: 'ai' }
                   ]);
               }, 800);
              return;
          }
          // If user typed summary
          if (value && !action) {
              setOnboardingMedicalSummary(value);
              setTimeout(() => {
                   addBotMessage("تم حفظ الملخص. هل تود إضافة الأدوية يدوياً أم باستخدام الذكاء الاصطناعي (تصوير الروشتة)؟", 'choice', [
                       { label: 'إدخال يدوي', value: 'manual' },
                       { label: 'ذكاء اصطناعي (اشتراك)', value: 'ai' }
                   ]);
               }, 800);
              return;
          }
      }

      if (action === 'manual' || value === 'manual') {
          setOnboardingMode('manual');
          setTimeout(() => addBotMessage("تفضل بإضافة الأدوية. يمكنك إضافة أكثر من دواء.", 'form', undefined, 'meds'), 500);
          return;
      }

      if (action === 'ai' || value === 'ai') {
          setOnboardingMode('ai');
          setTimeout(() => addBotMessage("يرجى كتابة الأدوية أو تصوير الروشتة.", 'form', undefined, 'meds'), 500);
          return;
      }

      // Direct medication entry via chat
      if (onboardingMedicalSummary && !isMedsDone && value && !action) {
          const knownCommands = ['manual', 'ai', 'DONE_MEDS', 'تم', 'انتهيت'];
          if (!knownCommands.includes(value)) {
              const id = typeof crypto !== 'undefined' && 'randomUUID' in crypto
                ? crypto.randomUUID()
                : Math.random().toString(36).substring(2, 10);
              
              const newMed: Medication = {
                id,
                name: value,
                dosage: 'غير محدد',
                timeSlot: 'morning-fasting',
                notes: 'تمت الإضافة عبر الشات',
                isCritical: false,
                frequencyLabel: 'يومياً',
                category: 'other',
                stock: 0,
                refillUnit: 'box'
              };
              
              setOnboardingMeds(prev => [...prev, newMed]);
              
              setTimeout(() => {
                 addBotMessage(`✅ تم إضافة "${value}" لقائمتك.\n\nهل تود إضافة المزيد؟ (اكتب اسم الدواء مباشرة) أو اضغط "تم الانتهاء".`, 'choice', [
                      { label: 'تم الانتهاء', value: 'DONE_MEDS' }
                 ]);
              }, 500);
              return;
          }
      }

      if (action === 'DONE_MEDS' || value === 'DONE_MEDS' || value === 'تم' || value === 'انتهيت') {
          if (onboardingMeds.length === 0) {
               setTimeout(() => addBotMessage("من فضلك أضف دواء واحداً على الأقل."));
               return;
          }
          setIsMedsDone(true);
          setTimeout(() => {
              addBotMessage("هل لديك أي تحاليل طبية حديثة تريد تسجيلها؟", 'choice', [
                  { label: 'نعم، إضافة تحليل', value: 'ADD_LAB' },
                  { label: 'لا، تخطي', value: 'SKIP_LAB' }
              ]);
          }, 800);
          return;
      }

      if (action === 'ADD_LAB' || value === 'ADD_LAB') {
          setTimeout(() => addBotMessage("تفضل بإضافة بيانات التحليل.", 'form', undefined, 'lab'), 500);
          return;
      }

      if (action === 'DONE_LAB' || value === 'DONE_LAB' || action === 'SKIP_LAB' || value === 'SKIP_LAB') {
          setTimeout(() => {
              addBotMessage("هل تريد إجراء تحليل ذكي لحالتك الصحية الآن بناءً على ما أدخلته؟", 'choice', [
                  { label: 'نعم، حلل حالتي', value: 'RUN_AI' },
                  { label: 'لا، تخطي', value: 'SKIP_AI' }
              ]);
          }, 800);
          return;
      }

      if (action === 'RUN_AI' || value === 'RUN_AI') {
          addBotMessage("جاري تحليل بياناتك بالذكاء الاصطناعي...");
          setTimeout(() => {
              // Mock AI Analysis for now
              const mockAnalysis: AIAnalysisResult = {
                summary: "بناءً على الأدوية والبيانات المدخلة، حالتك تبدو مستقرة. يُنصح بالالتزام بمواعيد الدواء وشرب الماء بانتظام.",
                recommendations: ["الالتزام بمواعيد الدواء", "شرب الماء بانتظام"],
                warnings: [],
                positivePoints: ["استقرار الحالة"],
                potentialSideEffects: []
              };
              
              setAiResult(mockAnalysis);
              setState(prev => ({ ...prev, aiAnalysisResult: mockAnalysis }));
              
              addBotMessage(`نتيجة التحليل:\n${mockAnalysis.summary}`);
              setTimeout(() => {
                  handleChatSubmit(undefined, 'SHOW_DAILY_TIP');
              }, 3000);
          }, 2000);
          return;
      }

      if (action === 'SKIP_AI' || value === 'SKIP_AI') {
          handleChatSubmit(undefined, 'SHOW_DAILY_TIP');
          return;
      }

      if (action === 'SHOW_DAILY_TIP' || value === 'SHOW_DAILY_TIP') {
          const tip = "نصيحة اليوم: حاول المشي لمدة 20 دقيقة يومياً لتحسين الدورة الدموية.";
          setState(prev => ({
              ...prev,
              dailyTipContent: tip,
              lastDailyTipDate: new Date().toISOString().split('T')[0]
          }));
          addBotMessage(`${tip}`);
          setTimeout(() => {
              addBotMessage("اضغط إنهاء للبدء.", 'choice', [
                  { label: 'إنهاء', value: 'FINISH' }
              ]);
          }, 2000);
          return;
      }

      if (action === 'SIGNIN_GOOGLE' || value === 'SIGNIN_GOOGLE') {
          handleGoogleSignIn().then((result) => {
              if (result && result.user) {
                  if (result.restored) {
                      setTimeout(() => {
                          addBotMessage("تم استعادة بياناتك بنجاح! هل تود تفعيل التنبيهات؟", 'choice', [
                              { label: 'تفعيل', value: 'ALLOW_NOTIFICATIONS' },
                              { label: 'لاحقاً', value: 'SKIP_NOTIFICATIONS' }
                          ]);
                      }, 800);
                  } else {
                      setTimeout(() => {
                          addBotMessage("تم تسجيل الدخول بنجاح! اضغط إنهاء للبدء.", 'choice', [
                              { label: 'إنهاء', value: 'FINISH' }
                          ]);
                      }, 800);
                  }
              } else {
                   setTimeout(() => {
                      addBotMessage("فشل تسجيل الدخول. هل تود المحاولة مرة أخرى أو التخطي؟", 'choice', [
                          { label: 'Google تسجيل دخول', value: 'SIGNIN_GOOGLE' },
                          { label: 'تخطي', value: 'FINISH' }
                      ]);
                  }, 800);
              }
          });
          return;
      }

      if (action === 'SIGNIN_APPLE' || value === 'SIGNIN_APPLE') {
          handleAppleSignIn().then((u) => {
               if (u) {
                  if (u.displayName) setOnboardingName(u.displayName);
                  setTimeout(() => {
                      addBotMessage("تم تسجيل الدخول بنجاح! اضغط إنهاء للبدء.", 'choice', [
                          { label: 'إنهاء', value: 'FINISH' }
                      ]);
                  }, 800);
              } else {
                   setTimeout(() => {
                      addBotMessage("فشل تسجيل الدخول. هل تود المحاولة مرة أخرى أو التخطي؟", 'choice', [
                          { label: 'Apple تسجيل دخول', value: 'SIGNIN_APPLE' },
                          { label: 'تخطي', value: 'FINISH' }
                      ]);
                  }, 800);
              }
          });
          return;
      }

      if (action === 'FINISH' || value === 'FINISH') {
          lastLocalActionTime.current = Date.now();
          isDirty.current = true;
          setState(prev => ({
              ...prev,
              patientName: onboardingName,
              patientLocation: onboardingLocation,
              patientAge: parseInt(onboardingAge),
              patientGender: onboardingGender as any,
              medications: onboardingMeds,
              labTests: onboardingLabTests,
              medicalHistorySummary: onboardingMedicalSummary === 'skip' ? '' : onboardingMedicalSummary
          }));
          setHasOnboarded(true);
      }
    };

    const handleAddOnboardingMed = () => {
      if (!onboardingMedDraft.name.trim() || !onboardingMedDraft.dosage.trim()) {
        alert("من فضلك أدخل اسم الدواء والجرعة قبل الإضافة.");
        return;
      }
      const slot = onboardingMedDraft.timeSlot;
      const freqLabel = formatHour(SLOT_HOURS[slot]);
      const id = typeof crypto !== 'undefined' && 'randomUUID' in crypto
        ? crypto.randomUUID()
        : Math.random().toString(36).substring(2, 10);
      const med: Medication = {
        id,
        name: onboardingMedDraft.name.trim(),
        dosage: onboardingMedDraft.dosage.trim(),
        timeSlot: slot,
        notes: '',
        isCritical: false,
        frequencyLabel: freqLabel,
        category: 'other',
        stock: 0
      };
      setOnboardingMeds(prev => [...prev, med]);
      setOnboardingMedDraft({ name: '', dosage: '', timeSlot: 'morning-fasting' });
    };

    const handleGenerateMedsWithAI = async () => {
      if (!state.aiSubscriptionActive) {
        alert("تنسيق الأدوية بالذكاء الاصطناعي متاح فقط بعد تفعيل الاشتراك الشهري.");
        return;
      }
      if (!aiMedInput.trim()) {
        alert("اكتب أسماء الأدوية والجرعات أولاً.");
        return;
      }
      setIsGeneratingMeds(true);
      try {
        const meds = await generateMedicationPlanFromText(aiMedInput);
        if (!meds.length) {
          alert("لم أستطع فهم الأدوية بشكل كافٍ. جرّب تبسيط النص أو استخدم الإدخال اليدوي.");
          return;
        }
        setOnboardingMeds(meds);
      } catch (e: any) {
        console.error(e);
        const errorMessage = e?.message || "غير محدد";
        alert(`حدث خطأ أثناء تنسيق الأدوية بالذكاء الاصطناعي.\nالسبب: ${errorMessage}\nيمكنك المحاولة مرة أخرى لاحقاً.`);
      } finally {
        setIsGeneratingMeds(false);
      }
    };

    return (
      <div className={`${state.darkMode ? 'dark' : ''} h-screen flex flex-col overflow-hidden bg-[#f8fafc] dark:bg-slate-950`}>
        {showOnboardingSplash && (
           <div className={`fixed inset-0 z-[9999] bg-blue-600 dark:bg-slate-900 flex flex-col items-center justify-center p-8 text-center transition-opacity duration-1000 ${splashFading ? 'opacity-0 pointer-events-none' : 'opacity-100'}`}>
             <div className="space-y-6 animate-in zoom-in duration-1000">
               <Heart className="w-24 h-24 text-white mx-auto animate-pulse" />
               <h1 className="text-4xl font-black text-white">أهلاً بك في صحتي</h1>
               <p className="text-xl text-blue-100 font-bold leading-relaxed max-w-md mx-auto">
                 مساعدك الطبي الشخصي
               </p>
             </div>
           </div>
        )}
        
        {/* Header */}
        <header className="flex-none p-4 bg-white dark:bg-slate-900 shadow-sm z-10 flex items-center justify-between px-6 border-b dark:border-slate-800">
           <div className="flex items-center gap-3">
              <div className="p-2 bg-blue-100 dark:bg-blue-900/30 rounded-xl">
                <Heart className="w-6 h-6 text-blue-600 dark:text-blue-400" />
              </div>
              <div className="text-right">
                 <h1 className="text-lg font-black text-slate-900 dark:text-white">
                   {state.patientName ? `صحتي - ${state.patientName}` : 'صحتي'}
                 </h1>
                 <p className="text-[10px] font-bold text-slate-500 dark:text-slate-400">مساعدك الشخصي</p>
              </div>
           </div>
        </header>

        {/* Chat Area */}
        <div className="flex-1 overflow-y-auto p-4 space-y-4 custom-scrollbar bg-slate-50 dark:bg-slate-950">
           {chatMessages.map(msg => (
             <div key={msg.id} className={`flex w-full ${msg.sender === 'user' ? 'justify-start' : 'justify-end'}`}>
                {msg.sender === 'bot' && (
                    <div className="w-8 h-8 rounded-full bg-blue-100 dark:bg-blue-900/30 flex items-center justify-center ml-2 shrink-0">
                        <Heart className="w-4 h-4 text-blue-600" />
                    </div>
                )}
                <div className={`max-w-[85%] p-4 rounded-2xl text-sm font-bold leading-relaxed shadow-sm transition-all duration-300 animate-in fade-in slide-in-from-bottom-2 ${
                   msg.sender === 'user' 
                   ? 'bg-blue-600 text-white rounded-tr-none' 
                   : 'bg-white dark:bg-slate-800 text-slate-700 dark:text-slate-200 rounded-tl-none border border-slate-100 dark:border-slate-700 text-right'
                }`}>
                   <p className="whitespace-pre-wrap">{msg.text}</p>
                   
                   {/* Choice Buttons */}
                   {msg.type === 'choice' && msg.choices && (
                       <div className="mt-3 grid gap-2">
                           {msg.choices.map((choice, idx) => (
                               <button 
                                 key={idx}
                                 onClick={() => handleChatSubmit(undefined, choice.value)}
                                 className="w-full p-3 rounded-xl bg-blue-50 dark:bg-slate-700 text-blue-700 dark:text-blue-300 text-xs font-black hover:bg-blue-100 dark:hover:bg-slate-600 transition-colors"
                               >
                                   {choice.label}
                               </button>
                           ))}
                       </div>
                   )}

                   {/* Forms */}
                   {msg.type === 'form' && msg.formType === 'name' && (
                      <div className="mt-3">
                         <input 
                           autoFocus
                           className="w-full p-3 rounded-xl bg-slate-100 dark:bg-slate-700 dark:text-white border-none outline-none text-right font-bold"
                           placeholder="اكتب الاسم هنا..."
                           onKeyDown={(e) => {
                               if (e.key === 'Enter') handleChatSubmit(e.currentTarget.value);
                           }}
                         />
                      </div>
                   )}
                   
                   {msg.type === 'form' && msg.formType === 'age' && (
                      <div className="mt-3">
                         <input 
                           type="number"
                           autoFocus
                           className="w-full p-3 rounded-xl bg-slate-100 dark:bg-slate-700 dark:text-white border-none outline-none text-right font-bold"
                           placeholder="مثال: 55"
                           onKeyDown={(e) => {
                               if (e.key === 'Enter') handleChatSubmit(e.currentTarget.value);
                           }}
                         />
                      </div>
                   )}

                   {msg.type === 'form' && msg.formType === 'location' && (
                      <div className="mt-3">
                         <input 
                           autoFocus
                           className="w-full p-3 rounded-xl bg-slate-100 dark:bg-slate-700 dark:text-white border-none outline-none text-right font-bold"
                           placeholder="اكتب العنوان هنا..."
                           onKeyDown={(e) => {
                               if (e.key === 'Enter') handleChatSubmit(e.currentTarget.value);
                           }}
                         />
                      </div>
                   )}

                   {msg.type === 'form' && msg.formType === 'meds' && (
                       <div className="mt-3 space-y-3">
                           {/* Med List */}
                           {onboardingMeds.length > 0 && (
                               <div className="space-y-2">
                                   {onboardingMeds.map((m, i) => (
                                       <div key={i} className="p-2 bg-emerald-50 dark:bg-emerald-900/20 rounded-lg flex justify-between items-center">
                                           <span className="text-xs font-bold text-emerald-700 dark:text-emerald-400">{m.name} ({m.dosage})</span>
                                           <span className="text-[10px] text-emerald-600">{m.frequencyLabel}</span>
                                       </div>
                                   ))}
                               </div>
                           )}

                           {onboardingMode === 'manual' ? (
                               <div className="p-3 bg-slate-50 dark:bg-slate-700/50 rounded-xl space-y-2">
                                   <input 
                                     value={onboardingMedDraft.name}
                                     onChange={e => setOnboardingMedDraft({...onboardingMedDraft, name: e.target.value})}
                                     className="w-full p-2 rounded-lg bg-white dark:bg-slate-800 text-right text-xs font-bold"
                                     placeholder="اسم الدواء"
                                   />
                                   <input 
                                     value={onboardingMedDraft.dosage}
                                     onChange={e => setOnboardingMedDraft({...onboardingMedDraft, dosage: e.target.value})}
                                     className="w-full p-2 rounded-lg bg-white dark:bg-slate-800 text-right text-xs font-bold"
                                     placeholder="الجرعة"
                                   />
                                   <select
                                      value={onboardingMedDraft.timeSlot}
                                      onChange={e => setOnboardingMedDraft({...onboardingMedDraft, timeSlot: e.target.value as any})}
                                      className="w-full p-2 rounded-lg bg-white dark:bg-slate-800 text-right text-xs font-bold"
                                   >
                                       {Object.entries(TIME_SLOT_CONFIG).map(([k, v]) => (
                                           <option key={k} value={k}>{v.label}</option>
                                       ))}
                                   </select>
                                   <button 
                                     onClick={handleAddOnboardingMed}
                                     className="w-full py-2 bg-emerald-600 text-white rounded-lg text-xs font-black"
                                   >
                                       إضافة دواء
                                   </button>
                               </div>
                           ) : (
                               <div className="space-y-2">
                                   <textarea 
                                      value={aiMedInput}
                                      onChange={e => setAiMedInput(e.target.value)}
                                      className="w-full p-2 rounded-lg bg-white dark:bg-slate-800 text-right text-xs font-bold h-20"
                                      placeholder="اكتب الأدوية هنا أو صور الروشتة..."
                                   />
                                   {isGeneratingMeds ? (
                                       <div className="w-full py-4 bg-purple-100 dark:bg-purple-900/30 text-purple-700 dark:text-purple-300 rounded-lg text-center font-bold animate-pulse flex flex-col items-center justify-center gap-2">
                                           <RefreshCw className="w-6 h-6 animate-spin" />
                                           <span>جاري التحليل برجاء عدم غلق التطبيق...</span>
                                       </div>
                                   ) : (
                                       <div className="flex gap-2">
                                           <button 
                                             onClick={async () => {
                                                 if (!state.aiSubscriptionActive) {
                                                    alert("يرجى تفعيل الاشتراك أولاً لاستخدام الكاميرا");
                                                    return;
                                                 }
                                                 
                                                 alert("تنبيه: برجاء اختيار صورة واضحة و خط واضح حتي يتم التحليل بدقة.");

                                                 try {
                                                    const image = await Camera.getPhoto({
                                                        quality: 90,
                                                        allowEditing: true,
                                                        resultType: CameraResultType.Base64
                                                    });
                                                    if (image.base64String) {
                                                        setIsGeneratingMeds(true);
                                                        const meds = await generateMedicationPlanFromImage(image.base64String);
                                                        setOnboardingMeds(meds);
                                                        setIsGeneratingMeds(false);
                                                        alert("تم تحليل الروشتة بنجاح! يرجى مراجعة قائمة الأدوية أدناه وتعديلها إذا لزم الأمر.");
                                                    }
                                                 } catch(e: any) { 
                                                     console.error(e); 
                                                     setIsGeneratingMeds(false);
                                                     alert(`فشل تحليل الروشتة: ${e?.message || "خطأ غير معروف"}`);
                                                 }
                                             }}
                                             className="flex-1 py-2 bg-blue-600 text-white rounded-lg text-xs font-black flex items-center justify-center gap-1"
                                           >
                                               <CameraIcon className="w-3 h-3" />
                                               <span>كاميرا</span>
                                           </button>
                                           <button 
                                             onClick={handleGenerateMedsWithAI}
                                             className="flex-1 py-2 bg-purple-600 text-white rounded-lg text-xs font-black"
                                           >
                                               تحليل النص
                                           </button>
                                       </div>
                                   )}
                               </div>
                           )}

                           <button 
                             onClick={() => handleChatSubmit(undefined, 'DONE_MEDS')}
                             className="w-full py-3 bg-slate-900 text-white rounded-xl text-xs font-black"
                           >
                               انتهيت من إضافة الأدوية
                           </button>
                       </div>
                   )}

                   {/* Lab Form */}
                   {msg.type === 'form' && msg.formType === 'lab' && (
                       <div className="mt-3 space-y-3">
                           {onboardingLabTests.length > 0 && (
                               <div className="space-y-2">
                                   {onboardingLabTests.map((t, i) => (
                                       <div key={i} className="p-2 bg-rose-50 dark:bg-rose-900/20 rounded-lg flex justify-between items-center">
                                           <span className="text-xs font-bold text-rose-700 dark:text-rose-400">{t.name}</span>
                                           <span className="text-[10px] text-rose-600">{t.result}</span>
                                       </div>
                                   ))}
                               </div>
                           )}
                           <div className="p-3 bg-slate-50 dark:bg-slate-700/50 rounded-xl space-y-2">
                               <input 
                                 value={onboardingLabTestDraft.name}
                                 onChange={e => setOnboardingLabTestDraft({...onboardingLabTestDraft, name: e.target.value})}
                                 className="w-full p-2 rounded-lg bg-white dark:bg-slate-800 text-right text-xs font-bold"
                                 placeholder="اسم التحليل (مثال: سكر صائم)"
                               />
                               <input 
                                 value={onboardingLabTestDraft.result}
                                 onChange={e => setOnboardingLabTestDraft({...onboardingLabTestDraft, result: e.target.value})}
                                 className="w-full p-2 rounded-lg bg-white dark:bg-slate-800 text-right text-xs font-bold"
                                 placeholder="النتيجة (مثال: 110)"
                               />
                               <input 
                                 type="date"
                                 value={onboardingLabTestDraft.date}
                                 onChange={e => setOnboardingLabTestDraft({...onboardingLabTestDraft, date: e.target.value})}
                                 className="w-full p-2 rounded-lg bg-white dark:bg-slate-800 text-right text-xs font-bold"
                               />
                               <button 
                                 onClick={() => {
                                    if(!onboardingLabTestDraft.name || !onboardingLabTestDraft.result) {
                                        alert("أدخل الاسم والنتيجة");
                                        return;
                                    }
                                    const newLab = {
                                        id: Math.random().toString(36).substr(2, 9),
                                        name: onboardingLabTestDraft.name,
                                        result: onboardingLabTestDraft.result,
                                        date: onboardingLabTestDraft.date,
                                        notes: ''
                                    };
                                    setOnboardingLabTests(prev => [...prev, newLab]);
                                    setOnboardingLabTestDraft({ name: '', result: '', date: new Date().toISOString().split('T')[0] });
                                 }}
                                 className="w-full py-2 bg-rose-600 text-white rounded-lg text-xs font-black"
                               >
                                   إضافة تحليل
                               </button>
                           </div>
                           <button 
                             onClick={() => handleChatSubmit(undefined, 'DONE_LAB')}
                             className="w-full py-3 bg-slate-900 text-white rounded-xl text-xs font-black"
                           >
                               انتهيت من إضافة التحاليل
                           </button>
                       </div>
                   )}
                </div>
             </div>
           ))}
           
           {isChatTyping && (
             <div className="flex justify-end w-full">
                <div className="w-8 h-8 rounded-full bg-blue-100 dark:bg-blue-900/30 flex items-center justify-center ml-2 shrink-0">
                    <Heart className="w-4 h-4 text-blue-600" />
                </div>
                <div className="bg-white dark:bg-slate-800 p-4 rounded-2xl rounded-tl-none border border-slate-100 dark:border-slate-700">
                   <div className="flex gap-1">
                      <span className="w-2 h-2 bg-slate-400 rounded-full animate-bounce" style={{ animationDelay: '0ms' }} />
                      <span className="w-2 h-2 bg-slate-400 rounded-full animate-bounce" style={{ animationDelay: '150ms' }} />
                      <span className="w-2 h-2 bg-slate-400 rounded-full animate-bounce" style={{ animationDelay: '300ms' }} />
                   </div>
                </div>
             </div>
           )}
           <div ref={chatEndRef} />
        </div>

        {/* Input Area - Only show if not expecting a specific form that handles its own input */}
        <div className="p-4 bg-white dark:bg-slate-900 border-t dark:border-slate-800">
            {chatMessages[chatMessages.length - 1]?.type !== 'choice' && 
             chatMessages[chatMessages.length - 1]?.type !== 'form' && (
                <div className="flex gap-2">
                   <button onClick={() => handleChatSubmit()} className="p-3 bg-blue-600 text-white rounded-xl active:scale-95 transition-transform">
                      <div className="rotate-180"><ChevronLeft className="w-5 h-5" /></div>
                   </button>
                   <input 
                     value={chatInput}
                     onChange={e => setChatInput(e.target.value)}
                     onKeyDown={e => e.key === 'Enter' && handleChatSubmit()}
                     placeholder="اكتب ردك هنا..."
                     className="flex-1 p-3 bg-slate-100 dark:bg-slate-800 dark:text-white rounded-xl text-right outline-none font-bold"
                   />
                </div>
            )}
            {/* Show subscription button if needed in chat */}
            {!state.aiSubscriptionActive && (
                <button onClick={() => setIsSubscriptionModalOpen(true)} className="mt-2 w-full text-[10px] text-blue-500 font-bold">
                    إدارة الاشتراك
                </button>
            )}
            <button onClick={() => setIsPrivacyPolicyOpen(true)} className="mt-2 w-full text-[10px] text-slate-400 font-bold underline">
                سياسة الخصوصية
            </button>
        </div>
        
        






      </div>
    );
  }

  const lateMeds = activeMedications.filter(med => {
    const isTaken = !!state.takenMedications[med.id];
    const slotTimeStr = state.slotHours?.[med.timeSlot] || SLOT_HOURS[med.timeSlot];
    const slotHourNum = parseInt(slotTimeStr.toString().split(':')[0]);
    return !isTaken && currentHour >= slotHourNum;
  });

  return (
    <div className={`${state.darkMode ? 'dark' : ''}`}>
      <div className="min-h-screen bg-[#f8fafc] dark:bg-slate-950 transition-colors duration-300 relative">
        <div className="absolute top-0 left-0 bg-red-600 text-white text-[10px] px-2 py-1 z-[99999] opacity-70 pointer-events-none rounded-br-lg font-mono">v1.4-debug</div>
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

          <header id="app-header" className={`glass-card rounded-[2.5rem] p-6 md:p-10 shadow-2xl border-b-[8px] relative overflow-hidden transition-all duration-500 ${state.caregiverMode ? 'border-emerald-500' : 'border-blue-600'} dark:bg-slate-900 dark:border-slate-800`}>
            <div className="absolute -top-10 -left-10 w-48 h-48 bg-blue-100/40 dark:bg-blue-900/10 rounded-full blur-[80px]"></div>
            <div className="flex flex-col md:flex-row items-center justify-between gap-6 relative z-10 text-right">
              <div className="flex items-center gap-5 w-full md:w-auto">
                <div className={`p-4 rounded-3xl text-white shadow-2xl scale-110 ${state.caregiverMode ? 'bg-emerald-500' : 'bg-blue-600'}`}>
                  {state.caregiverMode ? <UserCog className="w-8 h-8" /> : <Heart className="w-8 h-8 fill-current" />}
                </div>
                <div>
                  <div className="flex flex-col md:flex-row md:items-center gap-2 md:gap-4 mb-2">
                    <h1 className="text-2xl md:text-3xl font-black text-slate-900 dark:text-white leading-tight">{activeName}</h1>
                    <div className="flex items-center gap-2">
                       {/* Connection Status Icon */}
                       <div className={`w-6 h-6 rounded-full flex items-center justify-center ${isOnline ? 'bg-emerald-100 text-emerald-600 dark:bg-emerald-900/30 dark:text-emerald-400' : 'bg-red-100 text-red-600 dark:bg-red-900/30 dark:text-red-400'}`} title={isOnline ? 'متصل بالإنترنت' : 'غير متصل'}>
                          {isOnline ? <Wifi className="w-3.5 h-3.5" /> : <WifiOff className="w-3.5 h-3.5" />}
                       </div>
                       
                       {/* Sync Status Icon */}
                       <div className={`w-6 h-6 rounded-full flex items-center justify-center ${isSyncing ? 'bg-blue-100 text-blue-600 animate-pulse dark:bg-blue-900/30 dark:text-blue-400' : 'bg-slate-100 text-slate-500 dark:bg-slate-800 dark:text-slate-400'}`} title={isSyncing ? 'جاري المزامنة' : 'المزامنة السحابية'}>
                          {isSyncing ? <RefreshCw className="w-3.5 h-3.5 animate-spin" /> : <Cloud className="w-3.5 h-3.5" />}
                       </div>
                    </div>
                    <div onClick={copyPatientId} className="inline-flex items-center gap-2 bg-slate-900 dark:bg-slate-800 text-white px-3 py-1.5 rounded-xl shadow-lg cursor-pointer active:scale-95 transition-all group border border-slate-700">
                      <span className="text-[9px] font-black text-slate-400 uppercase tracking-widest">ID:</span>
                      <span className="text-sm font-black text-blue-400">{state.caregiverMode ? state.caregiverTargetId : state.patientId}</span>
                      <Copy className="w-3 h-3 text-blue-400" />
                    </div>
                  </div>
                  <p className="text-slate-500 dark:text-slate-400 text-sm font-bold opacity-80 uppercase tracking-widest">المتابعة الصحية الشاملة</p>
                </div>
              </div>
              <div className="flex items-center gap-3 w-full justify-center md:w-auto mt-4 md:mt-0 z-50">


                 <div className="relative group">
                   <button id="settings-btn" onClick={() => setIsSettingsOpen(true)} className="p-3.5 bg-white dark:bg-slate-800 rounded-2xl shadow-md border border-slate-100 dark:border-slate-700 active:scale-90 transition-all text-slate-600 dark:text-slate-300">
                     <Settings className="w-6 h-6" />
                   </button>
 
                 </div>

                 <div className="relative group">
                   <button onClick={toggleDarkMode} className={`p-3.5 rounded-2xl shadow-md border active:scale-90 transition-all ${state.darkMode ? 'bg-slate-800 border-slate-700 text-yellow-400' : 'bg-white border-slate-100 text-slate-600'}`}>
                     {state.darkMode ? <Sun className="w-6 h-6" /> : <Moon className="w-6 h-6" />}
                   </button>
 
                 </div>

                 <button onClick={toggleMute} className={`p-3.5 rounded-2xl shadow-md border active:scale-90 transition-all ${isMuted ? 'bg-red-50 dark:bg-red-900/20 border-red-100 dark:border-red-900/30 text-red-500' : 'bg-white dark:bg-slate-800 border-slate-100 dark:border-slate-700 text-slate-600 dark:text-slate-300'}`}>
                   {isMuted ? <VolumeX className="w-6 h-6" /> : <Volume2 className="w-6 h-6" />}
                 </button>

                 <div className="relative group">
                   <button id="calendar-btn" onClick={() => setIsCalendarOpen(true)} className="p-3.5 bg-white dark:bg-slate-800 rounded-2xl shadow-md border border-slate-100 dark:border-slate-700 active:scale-90 transition-all text-slate-600 dark:text-slate-300">
                      <CalendarIcon className="w-6 h-6" />
                    </button>
 
                  </div>
              </div>
            </div>

            <div className="mt-8 space-y-2.5">
              <div className="flex justify-between items-center text-[11px] md:text-sm font-black uppercase text-slate-400 dark:text-slate-500 tracking-widest">
                 <span className="flex items-center gap-1.5 text-base md:text-lg text-slate-700 dark:text-slate-100">
                   <Activity className="w-4 h-4"/>
                   <span className="font-extrabold">الالتزام اليوم:</span>
                   <span className="text-2xl md:text-3xl font-black ml-1">{Math.round(progress)}%</span>
                 </span>
                 <span className="text-[10px] md:text-xs">{takenCount} من {totalMeds} دواء اليوم</span>
              </div>
              <div className="h-4 w-full bg-slate-100 dark:bg-slate-800 rounded-full overflow-hidden shadow-inner border border-white/50 dark:border-slate-700 relative">
                <div className={`h-full rounded-full transition-all duration-1000 ${state.caregiverMode ? 'bg-emerald-500' : 'bg-blue-600'}`} style={{ width: `${progress}%` }}></div>
              </div>
            </div>
          </header>

          {/* Daily AI Tip Section */}
          {dailyQuickTip && (
            <div className="bg-blue-50 dark:bg-blue-900/10 border-2 border-blue-100 dark:border-blue-800 p-5 rounded-[2.5rem] flex items-center gap-4 animate-in slide-in-from-right-4 duration-700">
              <div className="bg-blue-600 p-3 rounded-2xl text-white shadow-lg"><Sparkles className="w-6 h-6"/></div>
              <div className="flex-1 text-right">
                <p className="text-[10px] font-black text-blue-600 dark:text-blue-400 uppercase tracking-widest mb-1">نصيحة اليوم الذكية</p>
                <p className="text-sm md:text-base font-bold text-slate-800 dark:text-slate-100 leading-relaxed">{dailyQuickTip}</p>
              </div>
            </div>
          )}

          <main className="grid grid-cols-1 lg:grid-cols-12 gap-6 items-start">
          <div id="medication-list" className="lg:col-span-5 space-y-4 lg:order-1">
            {/* Inline Low Stock Alert (Restored) */}
            {state.medications.some(m => (typeof m.stock === 'number' ? m.stock : 0) < 2) && (
               <div className="bg-red-50 dark:bg-red-900/10 border-r-4 border-red-500 p-5 rounded-2xl flex items-center justify-between gap-4 animate-in slide-in-from-top-4 duration-500 shadow-sm">
                  <div className="flex items-center gap-4 text-right">
                     <div className="bg-red-100 dark:bg-red-900/30 p-3 rounded-xl text-red-600 dark:text-red-400">
                        <AlertTriangle className="w-6 h-6 animate-pulse" />
                     </div>
                     <div>
                        <h3 className="font-black text-red-800 dark:text-red-200 text-sm md:text-base mb-1">تنبيه: مخزون الدواء منخفض</h3>
                        <p className="text-xs font-bold text-red-600 dark:text-red-400">بعض أدويتك أوشكت على النفاذ، يرجى طلبها الآن.</p>
                     </div>
                  </div>
                  <button
                     onClick={() => {
                        const lowStockMeds = state.medications.filter(m => (typeof m.stock === 'number' ? m.stock : 0) < 2);
                        const uniqueMeds = Array.from(new Set(lowStockMeds.map(m => m.name)))
                          .map(name => lowStockMeds.find(m => m.name === name))
                          .filter((m): m is Medication => !!m);
                        
                        const medList = uniqueMeds.map(m => {
                          const unitLabel = m.refillUnit === 'strip' ? 'شريط واحد' : m.refillUnit === 'bottle' ? 'زجاجة واحدة' : 'علبة واحدة';
                          return `- ${m.name} - ${unitLabel}`;
                        }).join('\n');
                        const message = `السلام عليكم، أحتاج طلب الأدوية التالية لانتهاء المخزون:\n${medList}`;
                        setPendingOrderMessage(message);
                        setIsOrderChoiceOpen(true);
                     }}
                     className="bg-red-600 hover:bg-red-700 text-white px-5 py-2.5 rounded-xl font-black text-xs shadow-lg shadow-red-500/20 active:scale-95 transition-all whitespace-nowrap"
                  >
                     طلب النواقص
                  </button>
               </div>
            )}
            <section id="smart-analysis-card" className="bg-slate-900 dark:bg-slate-900 rounded-[2.8rem] p-8 text-white shadow-2xl relative overflow-hidden border-b-[10px] border-blue-600 mb-4">
                <div className="flex items-center justify-between mb-8">
                  <div className="bg-white/10 p-5 rounded-2xl"><BrainCircuit className="w-9 h-9 text-blue-400" /></div>
                  <div className="text-right">
                    <h2 className="text-2xl font-black mb-1">التحليل الصحي الذكي</h2>
                    <p className="text-slate-400 text-xs font-bold uppercase">مبني على ملفك الطبي</p>
                  </div>
                </div>
                <button
                  onClick={() => {
                     if (!isAiSubscribed) {
                         setIsSubscriptionModalOpen(true);
                     } else {
                         handleAI();
                     }
                  }}
                  disabled={isAnalyzing}
                  className={`w-full py-6 rounded-[2.2rem] font-black text-xl shadow-2xl transition-all ${
                    !isAiSubscribed
                      ? 'bg-blue-600' // Make it active color to encourage clicking
                      : state.caregiverMode
                        ? 'bg-emerald-600'
                        : 'bg-blue-600'
                  }`}
                >
                  {isAnalyzing ? (
                    <RefreshCw className="w-8 h-8 animate-spin mx-auto" />
                  ) : isAiSubscribed ? (
                    'حلل حالتي الآن'
                  ) : (
                    'اشترك لتفعيل التحليل الذكي'
                  )}
                </button>
                {aiResult && (
                  <div className="mt-8 p-7 bg-white/10 rounded-[2.2rem] text-right animate-in fade-in space-y-6">
                    <div>
                      <div className="flex items-center justify-end gap-2 mb-4 text-blue-400"><h3 className="font-black text-lg">تحليل Gemini اليومي</h3><Sparkles className="w-5 h-5"/></div>
                      <p className="text-lg font-medium leading-relaxed text-slate-100">{aiResult.summary}</p>
                    </div>

                    {/* Warnings */}
                    {aiResult.warnings && aiResult.warnings.length > 0 && (
                       <div className="bg-red-500/20 p-5 rounded-2xl border border-red-500/30">
                          <h4 className="text-red-300 font-bold mb-3 flex items-center gap-2 justify-end text-base"><AlertTriangle className="w-5 h-5"/> تحذيرات هامة</h4>
                          <ul className="text-red-100 text-sm space-y-2 font-medium" dir="rtl">
                            {aiResult.warnings.map((w, i) => <li key={i} className="flex items-start gap-2"><span className="mt-1.5 w-1.5 h-1.5 rounded-full bg-red-400 shrink-0"/> {w}</li>)}
                          </ul>
                       </div>
                    )}

                    {/* Food Interactions */}
                    {aiResult.foodInteractions && aiResult.foodInteractions.length > 0 && (
                       <div className="bg-amber-500/20 p-5 rounded-2xl border border-amber-500/30">
                          <h4 className="text-amber-300 font-bold mb-3 flex items-center gap-2 justify-end text-base"><UtensilsCrossed className="w-5 h-5"/> تفاعلات غذائية ودوائية</h4>
                          <ul className="text-amber-100 text-sm space-y-2 font-medium" dir="rtl">
                            {aiResult.foodInteractions.map((f, i) => <li key={i} className="flex items-start gap-2"><span className="mt-1.5 w-1.5 h-1.5 rounded-full bg-amber-400 shrink-0"/> {f}</li>)}
                          </ul>
                       </div>
                    )}

                    {/* Allowed Foods */}
                    {aiResult.allowedFoods && aiResult.allowedFoods.length > 0 && (
                       <div className="bg-emerald-500/20 p-5 rounded-2xl border border-emerald-500/30">
                          <h4 className="text-emerald-300 font-bold mb-3 flex items-center gap-2 justify-end text-base"><CheckCircle className="w-5 h-5"/> أطعمة مسموحة ومفيدة</h4>
                          <ul className="text-emerald-100 text-sm space-y-2 font-medium" dir="rtl">
                            {aiResult.allowedFoods.map((f, i) => <li key={i} className="flex items-start gap-2"><span className="mt-1.5 w-1.5 h-1.5 rounded-full bg-emerald-400 shrink-0"/> {f}</li>)}
                          </ul>
                       </div>
                    )}

                     {/* Positive Points */}
                    {aiResult.positivePoints && aiResult.positivePoints.length > 0 && (
                       <div className="bg-blue-500/20 p-5 rounded-2xl border border-blue-500/30">
                          <h4 className="text-blue-300 font-bold mb-3 flex items-center gap-2 justify-end text-base"><Heart className="w-5 h-5"/> رسالة طمأنة</h4>
                          <ul className="text-blue-100 text-sm space-y-2 font-medium" dir="rtl">
                            {aiResult.positivePoints.map((p, i) => <li key={i} className="flex items-start gap-2"><span className="mt-1.5 w-1.5 h-1.5 rounded-full bg-blue-400 shrink-0"/> {p}</li>)}
                          </ul>
                       </div>
                    )}
                  </div>
                )}
              </section>
              <div className="flex items-center justify-between px-2">
                <h2 className="text-2xl font-black text-slate-800 dark:text-slate-200 flex items-center gap-3">جدول الأدوية <ClipboardList className="w-7 h-7 text-blue-500" /></h2>
                <div className="relative group">
                    <button 
                      id="add-med-btn"
                      onClick={() => { setEditingMed({ name: '', dosage: '', timeSlot: 'morning-fasting', notes: '', isCritical: false, category: 'other', frequencyLabel: '', stock: 0, refillUnit: 'box' }); setIsMedManagerOpen(true); }}
                      className="bg-emerald-600 text-white p-3 rounded-2xl shadow-xl active:scale-95 transition-all"
                    >
                      <PlusCircle className="w-7 h-7" />
                    </button>
                  </div>
              </div>



              <div id="medication-schedule" className="space-y-12 pb-8">
                {(Object.keys(TIME_SLOT_CONFIG) as TimeSlot[]).map(slot => {
                  const meds = activeMedications.filter(m => m.timeSlot === slot);
                  if (meds.length === 0) return null;
                  const cfg = TIME_SLOT_CONFIG[slot];
                  const slotHourFormatted = formatHour(state.slotHours?.[slot] || SLOT_HOURS[slot]);
                  return (
                    <div key={slot} className="space-y-6">
                      <div className="flex items-center justify-between pr-3 border-r-4 border-slate-200 dark:border-slate-800 group/slot">
                        <div className="flex items-center gap-4">
                          <div className={`p-3.5 rounded-2xl shadow-md ${state.darkMode ? 'bg-slate-800 border-slate-700' : cfg.color.split(' ')[0]}`}>{cfg.icon}</div>
                          <div>
                            <h3 className="text-lg font-black text-slate-800 dark:text-slate-200">{slotLabel}</h3>
                            <span className="text-[11px] font-bold text-blue-600 dark:text-blue-400 bg-blue-50 dark:bg-blue-900/20 px-2.5 py-0.5 rounded-lg flex items-center gap-1.5 w-fit mt-1">
                              <Clock className="w-3 h-3" /> {slotHourFormatted}
                            </span>
                          </div>
                        </div>
                        {state.caregiverMode && (
                          <button 
                            onClick={() => {
                              meds.forEach(m => handleSendReminder(m.name));
                              alert(`تم إرسال تنبيهات للمريض بخصوص أدوية مجموعة: ${slotLabel}`);
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
                          const slotTimeStr = state.slotHours?.[slot] || SLOT_HOURS[slot];
                          const slotHourNum = parseInt(slotTimeStr.toString().split(':')[0]);
                          const isLate = !isTaken && currentHour >= slotHourNum;
                          const catColor = CATEGORY_COLORS[med.category || 'other'];
                          const stock = typeof med.stock === 'number' ? med.stock : 0;
                          const isLowStock = stock > 0 && stock <= 5;
                          const isEmptyStock = stock === 0;
                          return (
                            <div
                              key={med.id}
                              className={`group relative rounded-[2.2rem] border-2 transition-all duration-500 shadow-sm ${
                                isTaken
                                  ? 'bg-white dark:bg-slate-900 opacity-60 grayscale-[0.5] border-slate-50 dark:border-slate-800'
                                  : isLate
                                  ? 'bg-red-50 dark:bg-red-900/20 border-red-300 dark:border-red-800 animate-pulse'
                                  : 'bg-white dark:bg-slate-900 border-slate-50 dark:border-slate-800'
                              }`}
                            >
                              <div className={`absolute top-0 right-0 w-2.5 h-full ${catColor.replace('text-', 'bg-')}`}></div>
                              <div className="absolute top-4 left-4 flex gap-2 opacity-0 group-hover:opacity-100 transition-opacity z-20">
                                {state.caregiverMode && (
                                  <button onClick={() => { handleSendReminder(med.name); alert(`تم إرسال تنبيه للمريض بخصوص ${med.name}`); }} className="p-2.5 bg-white/95 dark:bg-slate-800 shadow-lg border dark:border-slate-700 rounded-xl hover:bg-amber-50 dark:hover:bg-amber-900/20 text-amber-600"><Bell className="w-4 h-4" /></button>
                                )}
                                <button onClick={() => { setEditingMed(med); setIsMedManagerOpen(true); }} className="p-2.5 bg-white/95 dark:bg-slate-800 shadow-lg border dark:border-slate-700 rounded-xl hover:bg-blue-50 dark:hover:bg-blue-900/20 text-blue-600"><Pencil className="w-4 h-4" /></button>
                                <button onClick={() => setIdToDelete(med.id)} className="p-2.5 bg-white/95 dark:bg-slate-800 shadow-lg border dark:border-slate-700 rounded-xl hover:bg-red-50 dark:hover:bg-red-900/20 text-red-600"><Trash2 className="w-4 h-4" /></button>
                              </div>
                              <div className="p-6 md:p-7 flex items-center gap-6">
                                <button onClick={() => toggleMedication(med.id)} className={`shrink-0 w-16 h-16 rounded-[1.6rem] flex items-center justify-center transition-all ${isTaken ? 'bg-emerald-500 text-white' : isLate ? 'bg-red-600 text-white' : 'bg-slate-50 dark:bg-slate-800 text-slate-300 dark:text-slate-600'}`}>
                                  {isTaken ? <CheckCircle className="w-10 h-10" /> : isLate ? <AlertTriangle className="w-10 h-10" /> : <Plus className="w-10 h-10" />}
                                </button>
                                <div className="flex-1 text-right min-w-0 pr-2">
                                  <div className="flex items-center justify-end gap-2 mb-2">
                                    {med.isCritical && <span className="flex items-center gap-1 text-[9px] bg-red-100 dark:bg-red-900/30 text-red-700 dark:text-red-400 px-2 py-1 rounded-lg font-black">ضروري</span>}
                                    <h4 className={`text-xl md:text-2xl font-black truncate ${isTaken ? 'line-through text-slate-400 dark:text-slate-600' : 'text-slate-800 dark:text-slate-100'}`}>{med.name}</h4>
                                  </div>
                                  <span className="text-[11px] font-black px-3 py-1 rounded-lg bg-slate-100 dark:bg-slate-800 text-slate-500 dark:text-slate-400">{med.dosage} • {med.frequencyLabel}</span>
                                  <p
                                    className={`text-[10px] font-bold mt-1 flex items-center justify-end gap-1 ${
                                      isEmptyStock
                                        ? 'text-red-600 dark:text-red-400'
                                        : isLowStock
                                        ? 'text-amber-600 dark:text-amber-400'
                                        : 'text-slate-500 dark:text-slate-400'
                                    }`}
                                  >
                                    <AlertTriangle
                                      className={`w-3 h-3 ${
                                        isEmptyStock
                                          ? 'text-red-500 dark:text-red-400'
                                          : isLowStock
                                          ? 'text-amber-500 dark:text-amber-400'
                                          : 'text-slate-400 dark:text-slate-500'
                                      }`}
                                    />
                                    {isEmptyStock
                                      ? 'المخزون نفد، يرجى إعادة شراء الدواء'
                                      : isLowStock
                                      ? `مخزون منخفض: ${stock} جرعات متبقية`
                                      : `المخزون المتبقي: ${stock} جرعات`}
                                      
                                    <button 
                                      onClick={(e) => {
                                        e.stopPropagation();
                                        setRefillTargetId(med.id);
                                        setRefillAmount(30); // Default refill
                                        setIsRefillModalOpen(true);
                                      }}
                                      className="mr-2 bg-blue-100 hover:bg-blue-200 text-blue-700 dark:bg-blue-900/30 dark:text-blue-300 dark:hover:bg-blue-900/50 px-2 py-0.5 rounded-lg text-[10px] font-black border border-blue-200 dark:border-blue-800 transition-colors"
                                    >
                                      + تعبئة
                                    </button>
                                  </p>
                                  {/* Pharmacy Action Button */}
                                  {stock < 2 && (
                                    <button 
                                      onClick={(e) => {
                                        e.stopPropagation();
                                        const unitLabel = med.refillUnit === 'strip' ? 'شريط واحد' : med.refillUnit === 'bottle' ? 'زجاجة واحدة' : 'علبة واحدة';
                                        const message = `السلام عليكم، أحتاج دواء: ${med.name} - ${unitLabel}`;
                                        setPendingOrderMessage(message);
                                        setIsOrderChoiceOpen(true);
                                      }}
                                      className="mt-2 w-full flex items-center justify-center gap-2 bg-emerald-500 hover:bg-emerald-600 text-white py-2 rounded-xl text-xs font-black shadow-md active:scale-95 transition-all"
                                    >
                                      <MessageCircle className="w-4 h-4" />
                                      طلب من الصيدلية
                                    </button>
                                  )}
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

            <div className="lg:col-span-7 space-y-8 md:sticky md:top-4 lg:order-2">




              <section onClick={() => setIsMedicalSummaryOpen(true)} className="cursor-pointer bg-gradient-to-br from-white to-blue-50/40 dark:from-slate-900 dark:to-slate-900/80 rounded-[2.8rem] p-8 shadow-xl border-2 border-blue-100 dark:border-blue-900/20 relative group transition-all">
                <div className="flex items-center justify-between mb-6">
                   <div className="bg-blue-600 p-5 rounded-3xl text-white shadow-xl shadow-blue-500/30"><FileText className="w-8 h-8" /></div>
                   <div className="text-right">
                     <h2 className="text-2xl font-black text-slate-800 dark:text-slate-100 mb-1">ملخص الحالة الطبية</h2>
                     <p className="text-blue-600 dark:text-blue-400 text-[10px] font-black uppercase flex items-center justify-end gap-1.5"><Sparkles className="w-3 h-3"/> {state.caregiverMode ? 'تعديل البيانات الطبية' : 'عرض الملخص الطبي'}</p>
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

              {/* Family Circle Section - Only show if subscribed */}
              {state.aiSubscriptionActive && (
                <section onClick={() => setIsFamilyChatOpen(true)} className="cursor-pointer bg-gradient-to-br from-white to-purple-50/40 dark:from-slate-900 dark:to-slate-900/80 rounded-[2.8rem] p-8 shadow-xl border-2 border-purple-100 dark:border-purple-900/20 relative group transition-all">
                  <div className="flex items-center justify-between mb-6">
                     <div className="bg-purple-600 p-5 rounded-3xl text-white shadow-xl shadow-purple-500/30"><MessageCircle className="w-8 h-8" /></div>
                     <div className="text-right">
                       <h2 className="text-2xl font-black text-slate-800 dark:text-slate-100 mb-1">دائرة العائلة</h2>
                       <p className="text-purple-600 dark:text-purple-400 text-[10px] font-black uppercase flex items-center justify-end gap-1.5">
                         <UserCog className="w-3 h-3"/> {state.caregiverMode ? 'تواصل مع العائلة' : 'تواصل مع المرافق'}
                       </p>
                     </div>
                  </div>
                  <div className="p-6 bg-white/70 dark:bg-slate-800/50 rounded-[2rem] text-right text-slate-600 dark:text-slate-300 text-sm font-medium border border-slate-100 dark:border-slate-700 shadow-inner">
                     <p className="mb-2 text-slate-500 dark:text-slate-400">آخر رسالة:</p>
                     {state.familyMessages && state.familyMessages.length > 0 ? (
                        <p className="line-clamp-2 font-bold text-slate-800 dark:text-slate-200">
                          {state.familyMessages[state.familyMessages.length - 1].sender}: {state.familyMessages[state.familyMessages.length - 1].message}
                        </p>
                     ) : (
                        <p className="text-slate-400">لا توجد رسائل بعد. ابدأ المحادثة الآن.</p>
                     )}
                     <div className="flex items-center justify-end gap-2 text-purple-600 dark:text-purple-400 font-black text-xs mt-3">
                        <span>فتح المحادثة</span><ChevronLeft className="w-4 h-4" />
                     </div>
                  </div>
                </section>
              )}

              <section className="cursor-pointer bg-gradient-to-br from-white to-rose-50/40 dark:from-slate-900 dark:to-slate-900/80 rounded-[2.8rem] p-8 shadow-xl border-2 border-rose-100 dark:border-rose-900/20 relative group transition-all" onClick={() => setIsLabsModalOpen(true)}>
                <div className="flex items-center justify-between mb-6">
                   <div className="bg-rose-500 p-5 rounded-3xl text-white shadow-xl shadow-rose-500/30"><Droplets className="w-8 h-8" /></div>
                   <div className="text-right">
                     <h2 className="text-2xl font-black text-slate-800 dark:text-slate-100 mb-1">تحاليل المختبر</h2>
                     <p className="text-rose-600 dark:text-rose-400 text-[10px] font-black uppercase flex items-center justify-end gap-1.5">
                       <Sparkles className="w-3 h-3"/> {state.caregiverMode ? 'تسجيل وتحديث نتائج التحاليل' : 'عرض أحدث النتائج'}
                     </p>
                   </div>
                </div>
                <div className="p-6 bg-white/70 dark:bg-slate-800/50 rounded-[2rem] text-right text-slate-600 dark:text-slate-300 text-sm font-medium border border-slate-100 dark:border-slate-700 shadow-inner space-y-3">
                   {state.labTests && state.labTests.length > 0 ? (
                     state.labTests.slice(-3).reverse().map((t) => (
                       <div key={t?.id} className="flex items-center justify-between gap-3">
                         <div className="flex-1">
                           <p className="font-black text-sm text-slate-800 dark:text-slate-100">{t?.name}</p>
                           <p className="text-[11px] text-slate-400 dark:text-slate-500">{t?.date}</p>
                         </div>
                         <span className="text-xs font-black px-3 py-1 rounded-2xl bg-rose-50 dark:bg-rose-900/20 text-rose-700 dark:text-rose-300">
                           {t?.result}
                         </span>
                       </div>
                     ))
                   ) : (
                     <p className="text-xs text-slate-400 dark:text-slate-500">لم يتم تسجيل أي تحاليل حتى الآن.</p>
                   )}
                   <div className="flex items-center justify-end gap-2 text-rose-600 dark:text-rose-400 font-black text-xs mt-1">
                      <span>{state.caregiverMode ? 'إضافة / تعديل التحاليل' : 'فتح سجل التحاليل'}</span><ChevronLeft className="w-4 h-4" />
                   </div>
                </div>
              </section>

              <DiagnosisCard
                diagnoses={state.diagnoses || []}
                onAdd={handleAddDiagnosis}
                isCaregiver={state.caregiverMode}
              />

              <ProceduresCard
                procedures={Array.isArray(state.upcomingProcedures) ? state.upcomingProcedures : []}
                onAdd={handleAddProcedure}
                onToggle={handleToggleProcedure}
                onDelete={handleDeleteProcedure}
                isCaregiver={state.caregiverMode}
                onOpenModal={() => setIsProceduresModalOpen(true)}
              />

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

          <footer id="floating-bar" className="fixed bottom-8 left-1/2 -translate-x-1/2 w-fit max-w-[95%] bg-white/40 dark:bg-slate-900/70 backdrop-blur-3xl border border-white/30 dark:border-slate-700/60 px-8 py-5 rounded-[3.5rem] shadow-xl z-[100] flex items-center justify-center gap-10 transition-colors">
            <div className="relative">
              <button id="report-btn" onClick={() => setIsReportOpen(true)} className="w-14 h-14 flex items-center justify-center rounded-[1.6rem] text-blue-600 dark:text-blue-400 bg-white dark:bg-slate-800 border dark:border-slate-700 active:scale-90 transition-all"><DoctorIcon className="w-8 h-8"/></button>
            </div>
            <button id="pharmacy-btn" onClick={() => setIsPharmacyModalOpen(true)} className="w-14 h-14 flex items-center justify-center rounded-[1.6rem] text-emerald-600 dark:text-emerald-400 bg-white dark:bg-slate-800 border dark:border-slate-700 active:scale-90 transition-all"><ShoppingBag className="w-8 h-8"/></button>
            <button
              id="ai-btn"
              onClick={() => {
                 if (!isAiSubscribed) {
                     setIsSubscriptionModalOpen(true);
                 } else {
                     handleAI();
                 }
              }}
              disabled={isAnalyzing}
              className={`w-18 h-18 rounded-[2rem] text-white shadow-2xl active:scale-95 flex items-center justify-center border-[6px] border-white dark:border-slate-900 ${
                !isAiSubscribed
                  ? 'bg-blue-600'
                  : state.caregiverMode
                    ? 'bg-emerald-600'
                    : 'bg-blue-600'
              }`}
            >
              {isAnalyzing ? <RefreshCw className="w-9 h-9 animate-spin" /> : <BrainCircuit className="w-10 h-10" />}
            </button>
            <button 
              id="mic-btn" 
              onClick={toggleVoiceListening} 
              className={`w-14 h-14 flex items-center justify-center rounded-[1.6rem] active:scale-90 transition-all ${
                isVoiceListening 
                  ? 'bg-red-500 text-white animate-pulse shadow-lg shadow-red-500/30' 
                  : 'text-slate-600 dark:text-slate-300 bg-white dark:bg-slate-800 border dark:border-slate-700'
              }`}
            >
              {isVoiceListening ? <MicOff className="w-8 h-8"/> : <Mic className="w-8 h-8"/>}
            </button>
          </footer>

          <Tour
            steps={TOUR_STEPS}
            isOpen={isTourOpen}
            onClose={() => {
              setIsTourOpen(false);
              setHasSeenTour(true);
              localStorage.setItem('has_seen_tour_v1', 'true');
            }}
            onComplete={() => {
              setIsTourOpen(false);
              setHasSeenTour(true);
              localStorage.setItem('has_seen_tour_v1', 'true');
            }}
          />

          <PharmacyModal
            isOpen={isPharmacyModalOpen}
            onClose={() => setIsPharmacyModalOpen(false)}
          />

          {isOrderChoiceOpen && (
            <div className="fixed inset-0 z-[250] flex items-center justify-center p-4 bg-slate-900/80 backdrop-blur-sm animate-in fade-in">
              <div className="bg-white dark:bg-slate-900 w-full max-w-sm rounded-[2.5rem] p-6 shadow-2xl border-t-[8px] border-blue-500">
                 <h3 className="text-xl font-black text-center mb-6 text-slate-800 dark:text-slate-100">كيف تود طلب الدواء؟ 🛍️</h3>
                 <div className="space-y-3">
                    <button 
                      onClick={() => {
                         const phone = state.pharmacyPhone || '';
                         if (!phone) {
                            setIsOrderChoiceOpen(false);
                            alert("يرجى إضافة رقم الصيدلية في الإعدادات أولاً.");
                            setIsSettingsOpen(true);
                            return;
                         }
                         if (pendingOrderMessage) openWhatsApp(pendingOrderMessage, phone);
                         setIsOrderChoiceOpen(false);
                      }}
                      className="w-full py-4 bg-emerald-100 dark:bg-emerald-900/20 text-emerald-700 dark:text-emerald-300 rounded-2xl font-black text-sm flex items-center justify-center gap-2 hover:bg-emerald-200 transition-colors"
                    >
                      <MessageCircle className="w-5 h-5" />
                      طلب من صيدليتي المسجلة
                    </button>
                    
                    <button 
                      onClick={() => {
                         setIsOrderChoiceOpen(false);
                         setIsPharmacyModalOpen(true);
                      }}
                      className="w-full py-4 bg-blue-100 dark:bg-blue-900/20 text-blue-700 dark:text-blue-300 rounded-2xl font-black text-sm flex items-center justify-center gap-2 hover:bg-blue-200 transition-colors"
                    >
                      <ShoppingBag className="w-5 h-5" />
                      بحث في الصيدليات أونلاين
                    </button>
                    
                    <button 
                      onClick={() => setIsOrderChoiceOpen(false)}
                      className="w-full py-3 text-slate-400 font-bold text-xs"
                    >
                      إلغاء
                    </button>
                 </div>
              </div>
            </div>
          )}

          {isRefillModalOpen && (
            <div className="fixed inset-0 z-[250] flex items-center justify-center p-4 bg-slate-900/80 backdrop-blur-sm animate-in fade-in">
              <div className="bg-white dark:bg-slate-900 w-full max-w-sm rounded-[2.5rem] p-6 shadow-2xl border-t-[8px] border-blue-500">
                 <h3 className="text-xl font-black text-center mb-4 text-slate-800 dark:text-slate-100">إعادة تعبئة المخزون 💊</h3>
                 <div className="space-y-4">
                    <div className="space-y-2">
                       <label className="text-sm font-bold text-slate-500 block text-right">الكمية المضافة (عدد الأقراص)</label>
                       <input 
                         type="number" 
                         step="0.5"
                         value={refillAmount} 
                         onChange={(e) => setRefillAmount(parseFloat(e.target.value) || 0)}
                         className="w-full p-4 bg-slate-50 dark:bg-slate-800 rounded-xl text-center text-2xl font-black text-blue-600 focus:ring-4 focus:ring-blue-100 outline-none"
                       />
                       <div className="flex justify-center gap-2 flex-wrap">
                          {[0.5, 1, 2, 3, 4, 10, 14, 20, 30].map(amt => (
                             <button key={amt} onClick={() => setRefillAmount(amt)} className="px-3 py-1 bg-slate-100 dark:bg-slate-800 rounded-lg text-xs font-bold hover:bg-blue-100 text-slate-600 dark:text-slate-400 border border-slate-200 dark:border-slate-700">+{amt}</button>
                          ))}
                       </div>
                    </div>
                    <div className="flex gap-3 pt-2">
                       <button onClick={() => setIsRefillModalOpen(false)} className="flex-1 py-3 text-slate-500 font-bold bg-slate-100 dark:bg-slate-800 rounded-xl hover:bg-slate-200 transition-colors">إلغاء</button>
                       <button onClick={() => {
                          if (refillTargetId) {
                             setState(prev => {
                                const updated = prev.medications.map(m => {
                                   if (m.id === refillTargetId) {
                                      return { ...m, stock: (m.stock || 0) + refillAmount };
                                   }
                                   return m;
                                });
                                return { ...prev, medications: updated };
                             });
                             setIsRefillModalOpen(false);
                             alert("تم تحديث المخزون بنجاح ✅");
                          }
                       }} className="flex-1 py-3 bg-blue-600 hover:bg-blue-700 text-white font-black rounded-xl shadow-lg shadow-blue-500/30 transition-all active:scale-95">تأكيد</button>
                    </div>
                 </div>
                 <ScrollHint />
              </div>
            </div>
          )}

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

                  <ProceduresCard
                    procedures={Array.isArray(state.upcomingProcedures) ? state.upcomingProcedures : []}
                    onAdd={handleAddProcedure}
                    onUpdate={handleUpdateProcedure}
                    onToggle={handleToggleProcedure}
                    onDelete={handleDeleteProcedure}
                    isCaregiver={state.caregiverMode}
                    onOpenModal={() => {}}
                  />
                  <ScrollHint />
                </div>
                <div className="p-8 border-t border-slate-100 dark:border-slate-800 bg-white dark:bg-slate-900">
                   <button onClick={() => setIsProceduresModalOpen(false)} className="w-full py-5 bg-amber-500 text-white rounded-[2rem] font-black text-xl shadow-xl active:scale-[0.98] transition-all">إغلاق</button>
                </div>
              </div>
            </div>
          )}

          <DietModal
            isOpen={isDietModalOpen}
            onClose={() => setIsDietModalOpen(false)}
            isCaregiverMode={state.caregiverMode}
            dietGuidelines={state.dietGuidelines}
            displayedDietPlan={displayedDietPlan}
            selectedHistoryDate={selectedHistoryDate ? new Date(selectedHistoryDate) : null}
            onUpdateDietGuidelines={(newGuidelines) => {
              lastLocalActionTime.current = Date.now();
              isDirty.current = true;
              setState(prev => ({ ...prev, dietGuidelines: newGuidelines }));
            }}
            onGenerateDiet={handleGenerateDiet}
            isGenerating={isGeneratingDiet}
            hasSubscription={state.aiSubscriptionActive}
            onOpenSubscription={() => setIsSubscriptionModalOpen(true)}
          />

          <MedicalSummaryModal
            isOpen={isMedicalSummaryOpen}
            onClose={() => setIsMedicalSummaryOpen(false)}
            isCaregiverMode={state.caregiverMode}
            patientName={activeName}
            medicalHistorySummary={state.medicalHistorySummary}
            onUpdateSummary={(newSummary) => {
              lastLocalActionTime.current = Date.now();
              isDirty.current = true;
              setState(prev => ({ ...prev, medicalHistorySummary: newSummary }));
            }}
          />

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
                    <button 
                      disabled={isGeneratingDiet}
                      onClick={() => saveReportFinal()} className={`w-full py-8 text-white rounded-[2.5rem] font-black text-2xl shadow-2xl active:scale-[0.98] flex items-center justify-center gap-4 ${state.caregiverMode ? 'bg-emerald-600' : 'bg-blue-600'} ${isGeneratingDiet ? 'opacity-70 cursor-wait' : ''}`}>
                      {false ? (
                        <>
                          <RefreshCw className="w-8 h-8 animate-spin"/>
                          جاري تحضير الخطة...
                        </>
                      ) : (
                        <>
                          <CheckCircle className="w-8 h-8"/> 
                          حفظ التقرير
                        </>
                      )}
                    </button>
                  </div>
                  <ScrollHint />
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

                   {activeDailyReports[selectedHistoryDate].report.aiDietPlan && (
                     <div className="space-y-4">
                       <div className="flex items-center justify-end gap-3 text-slate-800 dark:text-slate-200 border-b-2 border-slate-50 dark:border-slate-800 pb-2">
                           <h3 className="font-black text-xl">اقتراح الذكاء الاصطناعي</h3>
                           <Sparkles className="w-6 h-6 text-blue-500"/>
                       </div>
                       <div className="p-6 bg-blue-50 dark:bg-blue-900/20 rounded-[2rem] border border-blue-100 dark:border-blue-800">
                           <p className="whitespace-pre-wrap font-bold text-blue-900 dark:text-blue-100 leading-relaxed text-base text-right">
                               {activeDailyReports[selectedHistoryDate].report.aiDietPlan}
                           </p>
                       </div>
                     </div>
                   )}
                   <ScrollHint />
                </div>
                <div className="p-8 border-t border-slate-100 dark:border-slate-800 bg-white dark:bg-slate-900">
                   <button onClick={() => setSelectedHistoryDate(null)} className="w-full py-5 bg-slate-900 dark:bg-slate-800 text-white rounded-[2rem] font-black text-xl active:scale-[0.98]">إغلاق السجل</button>
                </div>
              </div>
            </div>
          )}



          {isFamilyChatOpen && (
             <div className="fixed inset-0 z-[160] flex items-center justify-center p-4 bg-slate-900/95 backdrop-blur-xl animate-in fade-in duration-300">
               <div className="w-full max-w-lg relative">
                 <button 
                   onClick={() => setIsFamilyChatOpen(false)} 
                   className="absolute -top-12 left-0 p-2 bg-white/10 text-white rounded-full hover:bg-white/20 transition-colors"
                 >
                   <X className="w-6 h-6" />
                 </button>
                 <FamilyChat 
                   messages={state.familyMessages || []}
                   onSendMessage={handleFamilyMessage}
                   currentUser={state.caregiverMode ? 'المرافق' : (state.patientName || 'المريض')}
                 />
               </div>
             </div>
          )}

          <SettingsModal
            isOpen={isSettingsOpen}
            onClose={() => setIsSettingsOpen(false)}
            state={state}
            updateState={(updates) => setState(prev => {
              if (typeof updates === 'function') {
                return updates(prev);
              }
              return { ...prev, ...updates };
            })}
            copyPatientId={copyPatientId}
            overlayDisplayEnabled={overlayDisplayEnabled}
            setOverlayDisplayEnabled={setOverlayDisplayEnabled}
            setIsSubscriptionModalOpen={setIsSubscriptionModalOpen}
            user={user}
            onGoogleSignIn={async () => { 
              await handleGoogleSignIn(); 
            }}
            onAppleSignIn={async () => { await handleAppleSignIn(); }}
            onSignOut={handleSignOut}
          />
          {isSubscriptionModalOpen && (
            <div className="fixed inset-0 z-[350] flex items-center justify-center p-4 bg-slate-900/95 backdrop-blur-md animate-in fade-in">
              <div className="bg-white dark:bg-slate-900 w-full max-w-md rounded-[3rem] p-8 shadow-2xl relative max-h-[90vh] overflow-y-auto custom-scrollbar border-b-[10px] border-blue-600">
                <button
                  onClick={() => {
                    setIsSubscriptionModalOpen(false);
                  }}
                  className="absolute top-8 left-8 p-3.5 bg-slate-50 dark:bg-slate-800 dark:text-white rounded-2xl active:scale-90"
                >
                  <X className="w-7 h-7" />
                </button>
                <div className="pt-8 mb-6 text-right space-y-2">
                  <p className="text-[11px] font-black text-blue-500 dark:text-blue-400 uppercase tracking-widest">خدمة مدفوعة</p>
                  <h2 className="text-2xl font-black text-slate-900 dark:text-white flex items-center justify-end gap-2">
                    الاشتراك الشهري في التحليل الذكي
                    <Sparkles className="w-6 h-6 text-blue-500" />
                  </h2>
                  <p className="text-xs font-bold text-slate-500 dark:text-slate-400">
                    صُممت هذه الخدمة خصيصاً لكبار السن وأصحاب الحالات المزمنة لتقديم تحليل ذكي وحنون مبني على ملفك الطبي اليومي.
                  </p>
                </div>

                <div className="mb-6 p-5 rounded-[2rem] bg-blue-50 dark:bg-blue-900/20 border border-blue-100 dark:border-blue-900/40 text-right space-y-3">
                  <p className="text-[11px] font-black text-slate-500 dark:text-slate-300 uppercase">الخطة الحالية</p>
                  <div className="flex items-baseline justify-end gap-3">
                    <span className="text-4xl font-black text-slate-900 dark:text-white">٩٩</span>
                    <div className="text-right">
                      <p className="text-xs font-black text-slate-700 dark:text-slate-200">جنيه شهرياً</p>
                      <p className="text-[11px] text-slate-400 dark:text-slate-500">
                        الخطة السنوية: ٩٩٩ جنيه (خصم شهرين مجاناً عند الدفع سنوياً)
                      </p>
                    </div>
                  </div>
                  <p className="text-[11px] text-emerald-700 dark:text-emerald-400 font-bold">
                    {offerings ? "اختر الخطة المناسبة لك للاستمرار" : "جاري تحميل بيانات الاشتراك من Google Play..."}
                  </p>
                </div>

                <div className="space-y-3 mb-6">
                  <p className="text-[11px] font-black text-slate-500 dark:text-slate-400 uppercase text-right">ماذا يشمل الاشتراك؟</p>
                  <ul className="space-y-2 text-right text-sm font-bold text-slate-700 dark:text-slate-200">
                    <li className="flex items-start justify-end gap-2">
                      <span>تحليل صحي ذكي يومي مبني على القراءات والأدوية والتحاليل.</span>
                      <BrainCircuit className="w-5 h-5 text-blue-500" />
                    </li>
                    <li className="flex items-start justify-end gap-2">
                      <span>لوحة رسوم بيانية لمتابعة تطور ضغط الدم والسكر أسبوعياً.</span>
                      <Activity className="w-5 h-5 text-red-500" />
                    </li>
                    <li className="flex items-start justify-end gap-2">
                      <span>فحص التعارضات الدوائية بالذكاء الاصطناعي عند إضافة دواء جديد.</span>
                      <AlertTriangle className="w-5 h-5 text-amber-500" />
                    </li>
                    <li className="flex items-start justify-end gap-2">
                      <span>دائرة العائلة: شات داخلي للتنسيق بين أفراد الأسرة والمرافق.</span>
                      <MessageCircle className="w-5 h-5 text-purple-500" />
                    </li>
                    <li className="flex items-start justify-end gap-2">
                      <span>أوامر صوتية: سجل أدويتك وأعراضك بصوتك (زر الميكروفون).</span>
                      <Mic className="w-5 h-5 text-emerald-500" />
                    </li>
                    <li className="flex items-start justify-end gap-2">
                      <span>بطاقة طوارئ تظهر دائماً في الإشعارات (فصيلة الدم، الطبيب).</span>
                      <ShieldAlert className="w-5 h-5 text-rose-500" />
                    </li>
                    <li className="flex items-start justify-end gap-2">
                      <span>توليد نظام غذائي صحي متكامل ومخصص لحالتك.</span>
                      <Utensils className="w-5 h-5 text-green-500" />
                    </li>
                  </ul>
                </div>

                {/* Caregiver Benefits Section */}
                <div className="mb-6 p-4 bg-emerald-50 dark:bg-emerald-900/10 rounded-[1.5rem] border border-emerald-100 dark:border-emerald-900/30 text-right">
                   <h3 className="font-bold text-emerald-800 dark:text-emerald-400 text-sm mb-2 flex items-center justify-end gap-2">
                     مميزات وضع المرافق (Caregiver Mode) <UserCog className="w-4 h-4"/>
                   </h3>
                   <ul className="text-[11px] text-emerald-700 dark:text-emerald-500 space-y-1.5 font-bold pr-2 list-disc list-inside">
                     <li className="list-none">✨ متابعة التزام المريض بالأدوية لحظة بلحظة عن بعد.</li>
                     <li className="list-none">🔔 تلقي إشعارات عند تفويت الجرعات أو انخفاض المؤشرات الحيوية.</li>
                     <li className="list-none">📝 إدارة جدول الأدوية والتقارير الصحية نيابة عن المريض.</li>
                   </ul>
                </div>

                <div className="space-y-3 mb-6">
                  <p className="text-[11px] font-black text-slate-500 dark:text-slate-400 uppercase text-right">حالة الاشتراك</p>
                  <div
                    className={`p-4 rounded-2xl flex items-center justify-between border-2 ${
                      state.aiSubscriptionActive
                        ? 'border-emerald-500 bg-emerald-50 dark:bg-emerald-900/10'
                        : 'border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-800/40'
                    }`}
                  >
                    <div className="text-right">
                      <p className="text-sm font-black text-slate-900 dark:text-white">
                        {state.aiSubscriptionActive ? 'الاشتراك مفعل لهذا الحساب' : 'الاشتراك غير مفعل بعد'}
                      </p>
                      <p className="text-[11px] text-slate-500 dark:text-slate-400">
                        عند تفعيل الاشتراك المدفوع، تعمل كل خدمات الذكاء الاصطناعي لهذا الحساب حتى تقوم بإيقافه من نفس الشاشة.
                      </p>
                    </div>
                    <div className="flex items-center justify-center w-10 h-10 rounded-2xl bg-white dark:bg-slate-900 shadow-md">
                      {state.aiSubscriptionActive ? (
                        <CheckCircle className="w-6 h-6 text-emerald-500" />
                      ) : (
                        <Ban className="w-6 h-6 text-slate-400" />
                      )}
                    </div>
                  </div>
                </div>

                <div className="space-y-2 mb-6">
                  <p className="text-[11px] font-black text-slate-500 dark:text-slate-400 uppercase text-right">
                    الدفع الآمن عبر Google Play
                  </p>
                  <div className="p-4 bg-slate-50 dark:bg-slate-800 rounded-2xl border border-slate-200 dark:border-slate-700 text-right">
                     <p className="text-sm font-bold text-slate-700 dark:text-slate-300">يتم الدفع بأمان تام من خلال متجر Google Play</p>
                     <p className="text-[10px] text-slate-500 dark:text-slate-400 mt-1">يمكنك استخدام طرق الدفع المسجلة في حسابك (بطاقات ائتمان، رصيد الهاتف، فوري، وغيرها حسب دولتك).</p>
                  </div>
                </div>



                <div className="space-y-3">
                <button
                  disabled={!offerings}
                  onClick={async () => {
                     if (offerings && offerings.availablePackages.length > 0) {
                         const success = await purchasePackage(offerings.availablePackages[0]);
                         if (success) {
                             setState(prev => ({ ...prev, aiSubscriptionActive: true }));
                             setIsSubscriptionModalOpen(false);
                             alert("تم الاشتراك بنجاح! شكراً لدعمك.");
                         }
                     } else {
                         // Fallback should not happen if disabled, but just in case
                         if (!offerings) {
                             alert("جاري الاتصال بمتجر Google Play... يرجى الانتظار والمحاولة مرة أخرى.");
                         } else {
                             alert("عذراً، لم يتم العثور على باقات اشتراك متاحة حالياً.");
                         }
                     }
                  }}
                  className="w-full py-4 bg-gradient-to-r from-blue-600 to-blue-500 text-white rounded-2xl font-black text-lg shadow-lg shadow-blue-200 dark:shadow-none active:scale-95 transition-transform flex items-center justify-center gap-2 disabled:opacity-50 disabled:cursor-not-allowed"
                >
                  <span>{offerings ? "اشترك الآن" : "جاري تحميل الأسعار..."}</span>
                  <ChevronLeft className="w-5 h-5" />
                </button>
                
                <button 
                  onClick={async () => {
                      const restored = await restorePurchases();
                      if (restored) {
                          setState(prev => ({ ...prev, aiSubscriptionActive: true }));
                          setIsSubscriptionModalOpen(false);
                          alert("تم استعادة مشترياتك السابقة بنجاح.");
                      } else {
                          alert("لم يتم العثور على اشتراكات سابقة نشطة.");
                      }
                  }}
                  className="mt-4 w-full py-2 text-slate-500 dark:text-slate-400 font-bold text-xs"
                >
                  استعادة المشتريات السابقة
                </button>

                  {state.aiSubscriptionActive && (
                    <button
                      onClick={() => {
                        lastLocalActionTime.current = Date.now();
                        isDirty.current = true;
                        setState(prev => ({ ...prev, aiSubscriptionActive: false }));
                        alert("تم إيقاف الاشتراك الذكي لهذا الحساب. لا يمكن تفعيل التجربة المجانية مرة أخرى، ولإعادة التفعيل سيتم تحويلك لشاشة الدفع.");
                      }}
                      className="w-full py-4 rounded-[2rem] bg-slate-100 dark:bg-slate-800 text-slate-700 dark:text-slate-200 font-black text-sm shadow-md active:scale-[0.98]"
                    >
                      إيقاف الاشتراك مؤقتاً
                    </button>
                  )}
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
                <div className="flex flex-col md:flex-row items-center justify-between gap-4 mt-2">
                  <p className="text-[11px] md:text-xs font-bold text-slate-500 dark:text-slate-400 text-right flex-1">
                    يتم حفظ التزامك دوائياً يومياً، ويمكنك إنشاء نسخة احتياطية أو ملف JSON يمكن استرجاعه لاحقاً.
                  </p>
                  <div className="flex flex-wrap items-center justify-center gap-2">
                    <button
                      onClick={async () => {
                        const targetId = state.caregiverMode ? state.caregiverTargetId : state.patientId;
                        if (!targetId) {
                          alert("لا يوجد رمز مريض صالح لحفظ النسخة الاحتياطية.");
                          return;
                        }
                        try {
                          await backupAdherenceHistory(targetId, state);
                          alert("تم حفظ نسخة احتياطية من البيانات بنجاح.");
                        } catch (e) {
                          console.error(e);
                          alert("حدث خطأ أثناء حفظ النسخة الاحتياطية. حاول مرة أخرى لاحقاً.");
                        }
                      }}
                      className="px-4 py-2 rounded-2xl bg-blue-600 text-white text-[11px] md:text-xs font-black shadow-md active:scale-95 transition-all"
                    >
                      حفظ نسخة سحابية
                    </button>
                    <button
                      onClick={exportAdherenceJson}
                      className="px-4 py-2 rounded-2xl bg-emerald-600 text-white text-[11px] md:text-xs font-black shadow-md active:scale-95 transition-all"
                    >
                      تحميل نسخة احتياطية
                    </button>
                    <button
                      onClick={() => adherenceJsonInputRef.current?.click()}
                      className="px-4 py-2 rounded-2xl bg-slate-900 text-white text-[11px] md:text-xs font-black shadow-md active:scale-95 transition-all"
                    >
                      استرجاع من نسخة احتياطية
                    </button>
                    <input
                      ref={adherenceJsonInputRef}
                      type="file"
                      accept="application/json"
                      className="hidden"
                      onChange={handleAdherenceJsonFile}
                    />
                  </div>
                </div>
              </div>
            </div>
          )}

          {isLabsModalOpen && (
            <div className="fixed inset-0 z-[128] flex items-center justify-center p-4 bg-slate-900/95 backdrop-blur-md animate-in fade-in">
              <div className="bg-white dark:bg-slate-900 w-full max-w-2xl rounded-[3rem] p-8 shadow-2xl relative max-h-[92vh] flex flex-col overflow-hidden border-b-[12px] border-rose-500">
                <button onClick={() => setIsLabsModalOpen(false)} className="absolute top-8 left-8 p-3.5 bg-slate-50 dark:bg-slate-800 dark:text-white rounded-2xl">
                  <X className="w-7 h-7" />
                </button>
                <div className="pt-8 mb-6 flex items-center justify-between gap-4">
                  <div className="text-right">
                    <h2 className="text-2xl font-black text-slate-900 dark:text-white mb-1">سجل تحاليل المختبر</h2>
                    <p className="text-rose-600 dark:text-rose-400 text-[10px] font-black uppercase">يتم استخدام هذه البيانات في التحليل الذكي</p>
                  </div>
                  <div className="bg-rose-500/10 p-4 rounded-2xl"><Droplets className="w-8 h-8 text-rose-500" /></div>
                </div>
                <div className="flex-1 overflow-y-auto custom-scrollbar space-y-8 pr-1">
                  {true && (
                    <div className="space-y-4 bg-rose-50/60 dark:bg-rose-900/10 rounded-[2.2rem] p-6 border border-rose-100 dark:border-rose-900/30">
                      <h3 className="text-sm font-black text-rose-700 dark:text-rose-300 mb-2 flex items-center justify-end gap-2">
                        إضافة / تعديل تحليل جديد <Pencil className="w-4 h-4" />
                      </h3>
                      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                        <input
                          type="text"
                          placeholder="اسم التحليل (مثال: CBC, كرياتينين)"
                          className="w-full p-4 bg-white dark:bg-slate-800 border-2 border-rose-100 dark:border-rose-900/40 rounded-2xl text-right text-sm font-bold dark:text-white outline-none"
                          onChange={(e) => {
                            lastLocalActionTime.current = Date.now();
                            isDirty.current = true;
                            setState(prev => ({
                              ...prev,
                              labTestsDraft: {
                                ...prev.labTestsDraft,
                                name: e.target.value
                              }
                            }));
                          }}
                        />
                        <input
                          type="text"
                          placeholder="تاريخ / موعد التحليل (مثال: 2026-01-15 صباحاً)"
                          className="w-full p-4 bg-white dark:bg-slate-800 border-2 border-rose-100 dark:border-rose-900/40 rounded-2xl text-right text-sm font-bold dark:text-white outline-none"
                          onChange={(e) => {
                            lastLocalActionTime.current = Date.now();
                            isDirty.current = true;
                            setState(prev => ({
                              ...prev,
                              labTestsDraft: {
                                ...prev.labTestsDraft,
                                date: e.target.value
                              }
                            }));
                          }}
                        />
                      </div>
                      <textarea
                        placeholder="نتيجة التحليل (مثال: الهيموجلوبين 11، الكرياتينين 1.4، ...)"
                        className="w-full p-4 bg-white dark:bg-slate-800 border-2 border-rose-100 dark:border-rose-900/40 rounded-2xl text-right text-sm font-bold dark:text-white outline-none min-h-[80px] resize-none"
                        onChange={(e) => {
                          lastLocalActionTime.current = Date.now();
                          isDirty.current = true;
                          setState(prev => ({
                            ...prev,
                            labTestsDraft: {
                              ...prev.labTestsDraft,
                              result: e.target.value
                            }
                          }));
                        }}
                      />
                      <div className="flex justify-end">
                        <button
                          onClick={() => {
                            const draft = state.labTestsDraft || {};
                            if (!draft.name || !draft.date || !draft.result) {
                              alert("من فضلك أدخل اسم التحليل، موعده، ونتيجته قبل الحفظ.");
                              return;
                            }
                            lastLocalActionTime.current = Date.now();
                            isDirty.current = true;
                            
                            if (draft.id) {
                                // Update existing
                                setState(prev => ({
                                    ...prev,
                                    labTests: (prev.labTests || []).map(t => t.id === draft.id ? {
                                        ...t,
                                        name: draft.name!,
                                        date: draft.date!,
                                        result: draft.result!,
                                        notes: draft.notes || ''
                                    } : t),
                                    labTestsDraft: undefined
                                }));
                            } else {
                                // Create new
                                setState(prev => ({
                                  ...prev,
                                  labTests: [
                                    ...(prev.labTests || []),
                                    {
                                      id: crypto.randomUUID(),
                                      name: draft.name!,
                                      date: draft.date!,
                                      result: draft.result!,
                                      notes: draft.notes || ''
                                    }
                                  ],
                                  labTestsDraft: undefined
                                }));
                            }
                          }}
                          className="px-6 py-3 rounded-2xl bg-rose-600 text-white text-xs font-black active:scale-95 shadow-md"
                        >
                          {state.labTestsDraft?.id ? 'حفظ التعديلات' : 'حفظ التحليل'}
                        </button>
                      </div>
                    </div>
                  )}

                  <div className="space-y-4">
                    <h3 className="text-sm font-black text-slate-700 dark:text-slate-200 flex items-center justify-end gap-2">
                      قائمة التحاليل المسجلة <ListChecks className="w-4 h-4" />
                    </h3>
                    {state.labTests && state.labTests.length > 0 ? (
                      <div className="space-y-3">
                        {state.labTests.slice().reverse().map(t => (
                          <div key={t?.id} className="flex items-start justify-between gap-4 p-4 rounded-2xl border border-slate-100 dark:border-slate-800 bg-slate-50/60 dark:bg-slate-800/40">
                            <div className="flex-1 text-right space-y-1">
                              <p className="font-black text-sm text-slate-900 dark:text-white">{t?.name}</p>
                              <p className="text-[11px] text-slate-500 dark:text-slate-400">{t?.date}</p>
                              <p className="text-xs text-slate-700 dark:text-slate-200 whitespace-pre-wrap">{t?.result}</p>
                            </div>
                            {true && (
                              <div className="flex flex-col gap-2">
                                <button
                                  onClick={() => {
                                    lastLocalActionTime.current = Date.now();
                                    isDirty.current = true;
                                    setState(prev => ({
                                      ...prev,
                                      labTestsDraft: {
                                        id: t.id,
                                        name: t.name,
                                        date: t.date,
                                        result: t.result,
                                        notes: t.notes
                                      }
                                    }));
                                  }}
                                  className="p-2 rounded-xl bg-blue-50 dark:bg-blue-900/20 text-blue-600 dark:text-blue-300 text-xs font-black"
                                >
                                  تعديل
                                </button>
                                <button
                                  onClick={() => {
                                    lastLocalActionTime.current = Date.now();
                                    isDirty.current = true;
                                    setState(prev => ({
                                      ...prev,
                                      labTests: (prev.labTests || []).filter(x => x.id !== t?.id)
                                    }));
                                  }}
                                  className="p-2 rounded-xl bg-red-50 dark:bg-red-900/20 text-red-600 dark:text-red-300 text-xs font-black"
                                >
                                  حذف
                                </button>
                              </div>
                            )}
                          </div>
                        ))}
                      </div>
                    ) : (
                      <p className="text-xs text-slate-500 dark:text-slate-400 text-right">
                        لا توجد تحاليل مسجلة حتى الآن. يمكنك إضافة التحاليل من الأعلى.
                      </p>
                    )}
                  </div>
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
                        <div className="flex items-center justify-between">
                             <button onClick={async () => {
                                if (!state.aiSubscriptionActive) {
                                    setIsSubscriptionModalOpen(true);
                                    return;
                                }
                                try {
                                    const image = await Camera.getPhoto({ quality: 90, allowEditing: false, resultType: CameraResultType.Base64, source: CameraSource.Prompt });
                                    if (image.base64String) {
                                         setIsProcessingImage(true);
                                         const meds = await generateMedicationPlanFromImage(image.base64String);
                                         setIsProcessingImage(false);
                                         if (meds && meds.length > 0) {
                                             const m = meds[0];
                                             setEditingMed(prev => ({ ...prev, name: m.name, dosage: m.dosage, notes: m.notes, timeSlot: m.timeSlot }));
                                         } else {
                                             alert("لم يتم التعرف على دواء في الصورة.");
                                         }
                                    }
                                } catch (e: any) {
                                    console.error(e);
                                    const errorMessage = e?.message || "غير محدد";
                                    alert(`فشل تحليل الصورة: ${errorMessage}`);
                                    setIsProcessingImage(false);
                                }
                           }} className="p-2 bg-blue-50 dark:bg-blue-900/20 text-blue-600 dark:text-blue-400 rounded-lg text-[10px] font-black flex items-center gap-1 hover:bg-blue-100 transition-colors">
                              <CameraIcon className="w-3 h-3" /> مسح بالكاميرا <span className="text-[9px] bg-amber-100 text-amber-700 px-1 rounded">PRO</span>
                           </button>
                           <label className="text-[11px] font-black text-slate-400 dark:text-slate-500 uppercase tracking-widest mr-2">اسم الدواء</label>
                        </div>
                        <input type="text" value={editingMed.name || ''} onChange={(e) => setEditingMed({...editingMed, name: e.target.value})} className="w-full p-5 bg-slate-50 dark:bg-slate-800 dark:text-white border-2 dark:border-slate-700 focus:border-emerald-500 outline-none rounded-2xl font-black text-lg text-right" placeholder="مثال: Aldomet"/>
                      </div>
                      {!editingMed.id && (
                          <div className="bg-slate-100 dark:bg-slate-800 p-2 rounded-2xl flex items-center gap-2 mb-2">
                              <button 
                                onClick={() => setFrequencyMode('single')} 
                                className={`flex-1 py-3 rounded-xl font-black text-sm transition-all ${frequencyMode === 'single' ? 'bg-white dark:bg-slate-700 shadow text-emerald-600 dark:text-emerald-400' : 'text-slate-500 dark:text-slate-400'}`}
                              >
                                  مرة واحدة
                              </button>
                              <button 
                                onClick={() => setFrequencyMode('recurring')} 
                                className={`flex-1 py-3 rounded-xl font-black text-sm transition-all ${frequencyMode === 'recurring' ? 'bg-white dark:bg-slate-700 shadow text-emerald-600 dark:text-emerald-400' : 'text-slate-500 dark:text-slate-400'}`}
                              >
                                  تكرار
                              </button>
                          </div>
                      )}

                      <div className="space-y-4">
                        <div className="space-y-2">
                          <label className="text-[11px] font-black text-slate-400 dark:text-slate-500 uppercase mr-2">الجرعة</label>
                          <input type="text" value={editingMed.dosage || ''} onChange={(e) => setEditingMed({...editingMed, dosage: e.target.value})} className="w-full p-5 bg-slate-50 dark:bg-slate-800 dark:text-white border-2 dark:border-slate-700 focus:border-emerald-500 outline-none rounded-2xl font-black text-lg text-right" placeholder="مثال: 0.5، 1، 1.5 قرص"/>
                          <div className="flex flex-wrap justify-end gap-2 mt-2">
                            {[0.5, 1, 2, 3, 4].map((dose) => (
                              <button
                                key={dose}
                                onClick={() => setEditingMed({...editingMed, dosage: dose.toString()})}
                                className="px-4 py-2 bg-slate-100 dark:bg-slate-700/50 hover:bg-emerald-100 dark:hover:bg-emerald-900/30 text-slate-600 dark:text-slate-300 hover:text-emerald-700 dark:hover:text-emerald-400 border border-slate-200 dark:border-slate-700 rounded-xl font-bold text-sm transition-all"
                              >
                                {dose}
                              </button>
                            ))}
                          </div>
                        </div>

                        {frequencyMode === 'recurring' && !editingMed.id ? (
                             <div className="space-y-4 animate-in fade-in slide-in-from-top-4">
                                <div className="space-y-2">
                                    <label className="text-[11px] font-black text-slate-400 dark:text-slate-500 uppercase mr-2">عدد الجرعات في اليوم</label>
                                    <div className="flex items-center gap-3 justify-end">
                                        {[2, 3, 4].map(count => (
                                            <button 
                                                key={count}
                                                onClick={() => setRecurringCount(count)}
                                                className={`w-12 h-12 rounded-xl font-black text-lg border-2 transition-all ${recurringCount === count ? 'bg-emerald-500 text-white border-emerald-500' : 'bg-slate-50 dark:bg-slate-800 text-slate-600 dark:text-slate-400 border-slate-200 dark:border-slate-700'}`}
                                            >
                                                {count}
                                            </button>
                                        ))}
                                    </div>
                                </div>
                                
                                <div className="space-y-3 bg-slate-50 dark:bg-slate-800/50 p-4 rounded-2xl border border-slate-100 dark:border-slate-700">
                                    {Array.from({ length: recurringCount }).map((_, idx) => (
                                        <div key={idx} className="space-y-1">
                                            <label className="text-[10px] font-bold text-slate-400 uppercase mr-2">الجرعة {idx + 1}</label>
                                            <select 
                                                value={recurringSlots[idx] || 'morning-fasting'} 
                                                onChange={(e) => {
                                                    const newSlots = [...recurringSlots];
                                                    newSlots[idx] = e.target.value as TimeSlot;
                                                    setRecurringSlots(newSlots);
                                                }}
                                                className="w-full p-4 bg-white dark:bg-slate-800 dark:text-white border-2 dark:border-slate-700 outline-none rounded-xl font-bold text-sm text-right appearance-none"
                                            >
                                                {Object.entries(TIME_SLOT_CONFIG).map(([key, value]) => (<option key={key} value={key}>{value.label}</option>))}
                                            </select>
                                        </div>
                                    ))}
                                </div>
                             </div>
                         ) : (
                            <div className="space-y-2">
                              <label className="text-[11px] font-black text-slate-400 dark:text-slate-500 uppercase mr-2">وقت التناول</label>
                              <select value={editingMed.timeSlot || 'morning-fasting'} onChange={(e) => setEditingMed({...editingMed, timeSlot: e.target.value as TimeSlot})} className="w-full p-5 bg-slate-50 dark:bg-slate-800 dark:text-white border-2 dark:border-slate-700 outline-none rounded-2xl font-black text-lg text-right appearance-none">
                                {Object.entries(TIME_SLOT_CONFIG).map(([key, value]) => {
                                    const time = state.slotHours?.[key as TimeSlot] || SLOT_HOURS[key as TimeSlot];
                                    const formatted = formatHour(time);
                                    return (<option key={key} value={key}>{value.label} ({formatted})</option>);
                                })}
                              </select>
                            </div>
                         )}
                      </div>
                      <div className="space-y-2">
                        <label className="text-[11px] font-black text-slate-400 dark:text-slate-500 uppercase mr-2">مخزون الدواء (عدد الجرعات)</label>
                        <input
                          type="number"
                          min={0}
                          step="0.5"
                          value={editingMed.stock === undefined ? '' : editingMed.stock}
                          onChange={(e) => {
                            const value = e.target.value === '' ? undefined : Math.max(0, parseFloat(e.target.value) || 0);
                            setEditingMed({ ...editingMed, stock: value });
                          }}
                          className="w-full p-5 bg-slate-50 dark:bg-slate-800 dark:text-white border-2 dark:border-slate-700 focus:border-emerald-500 outline-none rounded-2xl font-black text-lg text-right"
                          placeholder="مثال: 30"
                        />
                      </div>
                      <div className="space-y-2">
                        <label className="text-[11px] font-black text-slate-400 dark:text-slate-500 uppercase mr-2">وحدة إعادة الشراء (للصيدلية)</label>
                        <select
                          value={editingMed.refillUnit || 'box'}
                          onChange={(e) => setEditingMed({ ...editingMed, refillUnit: e.target.value as any })}
                          className="w-full p-5 bg-slate-50 dark:bg-slate-800 dark:text-white border-2 dark:border-slate-700 outline-none rounded-2xl font-black text-lg text-right appearance-none"
                        >
                          <option value="box">علبة</option>
                          <option value="strip">شريط</option>
                          <option value="bottle">زجاجة</option>
                          <option value="other">أخرى</option>
                        </select>
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
                      {activeMedications.map(med => {
                        const stock = typeof med.stock === 'number' ? med.stock : 0;
                        const isLowStock = stock > 0 && stock <= 5;
                        const isEmptyStock = stock === 0;
                        return (
                          <div key={med.id} className="p-6 bg-slate-50/80 dark:bg-slate-800/50 rounded-[2.5rem] flex items-center justify-between border-2 border-transparent hover:border-emerald-100 dark:hover:border-emerald-900/30 transition-all shadow-sm">
                            <div className="flex gap-4"><button onClick={() => setEditingMed(med)} className="p-4 bg-white dark:bg-slate-800 text-blue-600 dark:text-blue-400 rounded-[1.4rem] border dark:border-slate-700 active:scale-90 shadow-sm"><Pencil className="w-6 h-6"/></button><button onClick={() => setIdToDelete(med.id)} className="p-4 bg-white dark:bg-slate-800 text-red-600 dark:text-red-400 rounded-[1.4rem] border dark:border-slate-700 active:scale-90 shadow-sm"><Trash2 className="w-6 h-6"/></button></div>
                            <div className="text-right">
                              <p className="font-black text-slate-800 dark:text-slate-100 text-lg">{med.name}</p>
                              <p className="text-xs font-black text-slate-400 dark:text-slate-500 mt-1 uppercase">{med.dosage} • {TIME_SLOT_CONFIG[med.timeSlot]?.label}</p>
                              <p
                                className={`text-[10px] font-bold mt-1 flex items-center justify-end gap-1 ${
                                  isEmptyStock
                                    ? 'text-red-600 dark:text-red-400'
                                    : isLowStock
                                    ? 'text-amber-600 dark:text-amber-400'
                                    : 'text-slate-500 dark:text-slate-400'
                                }`}
                              >
                                <AlertTriangle
                                  className={`w-3 h-3 ${
                                    isEmptyStock
                                      ? 'text-red-500 dark:text-red-400'
                                      : isLowStock
                                      ? 'text-amber-500 dark:text-amber-400'
                                      : 'text-slate-400 dark:text-slate-500'
                                  }`}
                                />
                                {isEmptyStock
                                  ? 'المخزون نفد، يرجى إعادة شراء الدواء'
                                  : isLowStock
                                  ? `مخزون منخفض: ${stock} جرعات متبقية`
                                  : `المخزون المتبقي: ${stock} جرعات`}
                              </p>
                            </div>
                          </div>
                        );
                      })}
                      <div className="grid grid-cols-2 gap-4 mt-6">
                        <button 
                          onClick={() => {
                            setFrequencyMode('single');
                            setRecurringCount(2);
                            setRecurringSlots(['morning-fasting', 'night']);
                            setEditingMed({ name: '', dosage: '', timeSlot: 'morning-fasting', notes: '', isCritical: false, category: 'other', frequencyLabel: '', stock: 0, refillUnit: 'box' });
                          }} 
                          className="py-8 border-4 border-dashed border-slate-100 dark:border-slate-800 rounded-[2rem] text-slate-400 dark:text-slate-600 font-black text-sm md:text-base hover:bg-emerald-50 dark:hover:bg-emerald-900/10 transition-all flex flex-col items-center justify-center gap-3 shadow-inner"
                        >
                          <PlusCircle className="w-8 h-8" />
                          إضافة يدوي
                        </button>
                        <button 
                          onClick={async () => {
                             if (!state.aiSubscriptionActive) {
                                setIsSubscriptionModalOpen(true);
                                return;
                             }
                             try {
                                const image = await Camera.getPhoto({
                                    quality: 90,
                                    allowEditing: true,
                                    resultType: CameraResultType.Base64
                                });
                                if (image.base64String) {
                                    setIsMedManagerOpen(false);
                                    setIsProcessingImage(true);
                                    
                                    try {
                                        const newMeds = await generateMedicationPlanFromImage(image.base64String);
                                        if (newMeds.length > 0) {
                                            setState(prev => ({
                                                ...prev,
                                                medications: [...prev.medications, ...newMeds]
                                            }));
                                            alert(`تم إضافة ${newMeds.length} دواء بنجاح!`);
                                        } else {
                                            alert("لم يتم العثور على أدوية في الصورة. حاول مرة أخرى بصورة أوضح.");
                                        }
                                    } catch (err: any) {
                                        console.error(err);
                                        const errorMessage = err?.message || "غير محدد";
                                        alert(`حدث خطأ أثناء تحليل الصورة.\nالسبب: ${errorMessage}\nيرجى المحاولة مرة أخرى.`);
                                    } finally {
                                        setIsProcessingImage(false);
                                    }
                                }
                             } catch(e) { console.error(e); }
                          }} 
                          className="py-8 border-4 border-dashed border-purple-100 dark:border-purple-900/30 bg-purple-50/50 dark:bg-purple-900/10 rounded-[2rem] text-purple-500 dark:text-purple-400 font-black text-sm md:text-base hover:bg-purple-100 dark:hover:bg-purple-900/20 transition-all flex flex-col items-center justify-center gap-3 shadow-inner relative overflow-hidden"
                        >
                          {!state.aiSubscriptionActive && (
                             <div className="absolute top-3 left-3 bg-yellow-400 text-yellow-900 text-[10px] font-black px-2 py-0.5 rounded-full flex items-center gap-1 shadow-sm">
                                <Sparkles className="w-3 h-3" /> مدفوع
                             </div>
                          )}
                          <CameraIcon className="w-8 h-8" />
                          إضافة بالكاميرا (AI)
                        </button>
                      </div>
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

      {/* Persistent Late Medication Overlay */}
      {state.medications.filter(m => {
        if (state.takenMedications[m.id]) return false;
        const val = state.slotHours?.[m.timeSlot] ?? SLOT_HOURS[m.timeSlot];
        let h = 0, min = 0;
        if (typeof val === 'number') { h = val; min = 0; }
        else if (typeof val === 'string') { const parts = val.split(':'); h = parseInt(parts[0]); min = parseInt(parts[1] || '0'); }
        else return false;
        
        const slotTime = new Date();
        slotTime.setHours(h, min, 0, 0);
        const diff = now.getTime() - slotTime.getTime();
        return diff > 30 * 60 * 1000 && diff < 12 * 60 * 60 * 1000;
      }).length > 0 && (
        <div className="fixed top-24 right-0 z-[200] animate-slide-in-right">
          <div className="bg-red-600 text-white p-4 rounded-l-2xl shadow-2xl max-w-[280px] border-l-4 border-white/20 backdrop-blur-md">
            <div className="flex items-center justify-between mb-3">
              <h3 className="font-black text-lg flex items-center gap-2 animate-pulse"><AlertTriangle className="w-5 h-5 text-yellow-300"/> تنبيه هام</h3>
            </div>
            <p className="text-sm font-bold mb-4 leading-relaxed">
              تأخرت في تناول {state.medications.filter(m => {
                   if (state.takenMedications[m.id]) return false;
                   const val = state.slotHours?.[m.timeSlot] ?? SLOT_HOURS[m.timeSlot];
                   let h = 0, min = 0;
                   if (typeof val === 'number') { h = val; min = 0; }
                   else if (typeof val === 'string') { const parts = val.split(':'); h = parseInt(parts[0]); min = parseInt(parts[1] || '0'); }
                   else return false;

                   const slotTime = new Date();
                   slotTime.setHours(h, min, 0, 0);
                   const diff = now.getTime() - slotTime.getTime();
                   return diff > 30 * 60 * 1000 && diff < 12 * 60 * 60 * 1000;
              }).length} دواء. يرجى التناول الآن!
            </p>
            <button 
              onClick={() => {
                 document.getElementById('medication-list')?.scrollIntoView({ behavior: 'smooth' });
              }}
              className="w-full py-2.5 bg-white text-red-600 rounded-xl font-black text-sm shadow-md hover:bg-red-50 transition-colors"
            >
              عرض الأدوية
            </button>
          </div>
        </div>
      )}


      {/* Loading Overlay */}
      {isProcessingImage && (
        <div className="fixed inset-0 z-[500] bg-black/80 backdrop-blur-sm flex flex-col items-center justify-center p-4">
            <div className="bg-white dark:bg-slate-800 p-8 rounded-[2rem] shadow-2xl flex flex-col items-center text-center space-y-4 max-w-sm w-full animate-in fade-in zoom-in duration-300">
                <div className="w-16 h-16 border-4 border-emerald-500 border-t-transparent rounded-full animate-spin"></div>
                <div>
                    <h3 className="text-xl font-black text-slate-800 dark:text-white mb-2">جاري تحليل الروشتة</h3>
                    <p className="text-slate-500 dark:text-slate-400">يرجى الانتظار بينما يقوم الذكاء الاصطناعي بقراءة الأدوية...</p>
                </div>
            </div>
        </div>
      )}

      <DraggableLateAlert lateMeds={lateMeds} onMarkAsTaken={toggleMedication} />
    </div>
  );
};

export default App;
