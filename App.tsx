
import React, { useState, useEffect, useRef, useCallback, useMemo } from 'react';
import { MEDICATIONS as DEFAULT_MEDICATIONS, TIME_SLOT_CONFIG, SLOT_HOURS, SYMPTOMS, CATEGORY_COLORS, MEDICAL_HISTORY_SUMMARY, DIET_GUIDELINES } from './constants';
import { AppState, TimeSlot, AIAnalysisResult, HealthReport, Medication, DayHistory } from './types';
import { analyzeHealthStatus } from './services/geminiService';
import { speakText, stopSpeech, playChime, playNotification } from './services/audioService';
import { syncPatientData, listenToPatient, generateSyncId, sendRemoteReminder, requestForToken, onForegroundMessage, saveTokenToDatabase, backupAdherenceHistory } from './services/firebaseService';
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
  ShoppingCart,
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
  ListChecks,
  Frown,
  Meh,
  MessageCircle,
  Send,
  Stethoscope
} from 'lucide-react';

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
  const symptoms = report.symptoms || [];
  const systolic = report.systolicBP || 0;
  const diastolic = report.diastolicBP || 0;
  const sugar = report.bloodSugar || 0;
  const water = report.waterIntake || 0;

  // Use day of month to rotate tips (1-31)
  const dayOfMonth = new Date().getDate();
  const getTip = (options: string[]) => options[dayOfMonth % options.length];

  const hasPressureMeds = meds.some(m => m.category === 'pressure');
  const hasDiabetesMeds = meds.some(m => m.category === 'diabetes');
  const hasBloodThinnerMeds = meds.some(m => m.category === 'blood-thinner');

  const hasSymptom = (s: string) => symptoms.includes(s);

  const age = state.patientAge || 0;
  const gender = state.patientGender;
  const isElder = age >= 55;
  const address = (() => {
    if (gender === 'male') {
      return isElder ? 'يا حاج' : 'يا غالي';
    }
    if (gender === 'female') {
      return isElder ? 'يا حاجة' : 'يا غالية';
    }
    return 'يا غالي';
  })();

  if (hasSymptom('ضيق تنفس') || hasSymptom('آلام صدر')) {
    return `${address}، إذا شعرت اليوم بضيق في النفس أو ألم بالصدر، لا تقلق وحدك واطمئن سريعاً مع طبيبك أو بطلب مساعدة قريبة منك.`;
  }

  if ((systolic > 140 || diastolic > 90) && hasPressureMeds) {
    return getTip([
       `${address}، قراءة الضغط اليوم أعلى من المطلوب قليلاً؛ هدّئ أعصابك، قلل الملح، واشرب ماءً، وإذا استمر الارتفاع تواصل مع طبيبك الحبيب عليك.`,
       `${address}، ضغطك يحتاج راحة؛ حاول تجنب الانفعال اليوم وتناول أدويتك في موعدها، واستشر الطبيب إذا شعرت بصداع.`,
       `${address}، لسلامة قلبك، ابتعد عن الموالح اليوم وخذ قسطاً من الراحة، وراقب ضغطك مرة أخرى بعد ساعة.`
    ]);
  }

  if (sugar > 180 && hasDiabetesMeds) {
    return getTip([
       `${address}، قراءة السكر اليوم مرتفعة بعض الشيء؛ خفف الحلويات، اشرب ماءً، واطمئن مع طبيبك على جرعة الدواء إذا تكرر ذلك.`,
       `${address}، السكر العالي يحتاج حركة خفيفة وشرب ماء كثير، تجنب النشويات في وجبتك القادمة وقس السكر مرة أخرى.`,
       `${address}، انتبه لأكلك اليوم، السكر مرتفع قليلاً. كثر من الخضروات وقلل الخبز والأرز، وراجع طبيبك إذا استمر الارتفاع.`
    ]);
  }

  if (hasBloodThinnerMeds && hasSymptom('كدمات')) {
    return `${address}، لأنك تستخدم أدوية سيولة، ظهور كدمات أو أي نزيف غير معتاد يحتاج اتصالاً هادئاً بطبيبك ليطمئنك أكثر.`;
  }

  if (water > 0 && water < 5) {
    return getTip([
       `${address}، جسمك يتعب من قلة الماء؛ دلّل نفسك اليوم بعدة أكواب صغيرة موزعة على اليوم ما لم يمنعك طبيبك من السوائل.`,
       `${address}، الكلى تحب الماء! حاول تشرب كوب ماء كل ساعة لتنشيط دورتك الدموية وتنظيف جسمك.`,
       `${address}، لا تنس شرب الماء، فهو حياة لكل خلية في جسمك. اجعل زجاجة الماء قريبة منك دائماً.`
    ]);
  }

  if (hasDiabetesMeds) {
    return getTip([
       `${address}، لأجل سكر أكثر استقراراً، وزّع النشويات على وجبات صغيرة ثابتة وحاول المشي دقائق لطيفة بعد الأكل إن استطعت.`,
       `${address}، مريض السكر صديق نفسه؛ حافظ على مواعيد أكلك ودوائك، وتجنب الجوع الشديد أو الشبع المفرط.`,
       `${address}، العناية بقدميك مهمة جداً؛ افحصها يومياً وجففها جيداً بعد الوضوء، وارتدِ حذاءً مريحاً دائماً.`
    ]);
  }

  if (hasPressureMeds) {
    return getTip([
       `${address}، قلبك يستحق الهدوء؛ قلل اليوم من المخللات والملح الزائد، واختَر طعاماً أخف رحمة بجسدك.`,
       `${address}، المشي الخفيف يساعد في خفض الضغط وتحسين المزاج. حاول تمشي 10 دقائق داخل البيت أو في مكان مريح.`,
       `${address}، التوتر عدو الضغط؛ خذ نفساً عميقاً واستغفر الله كثيراً، وابتعد عن الأخبار المزعجة.`
    ]);
  }

  if (hasBloodThinnerMeds) {
    return getTip([
       `${address}، مواعيد أدوية السيولة مهمة لسلامتك؛ لا تضاعف الجرعة إذا نسيت، فقط استشر طبيبك ليطمئن قلبك.`,
       `${address}، حافظ على تناول الورقيات الخضراء باعتدال وثبات، لأن تغيير كمياتها فجأة قد يؤثر على فعالية دواء السيولة.`,
       `${address}، احذر من استخدام أي مسكنات أو أدوية جديدة دون استشارة طبيبك، فبعضها قد يتعارض مع دواء السيولة.`
    ]);
  }

  if (meds.length > 0) {
    return getTip([
       `${address}، حرصك على مواعيد دوائك اليوم رسالة حب منّك لنفسك، تحفظ بإذن الله ضغطك وسكرك من التعب.`,
       `${address}، الدواء في موعده نعمة وشفاء. لا تؤجل جرعتك، فجسمك يعتمد عليك في الحفاظ على صحته.`,
       `${address}، الالتزام بالدواء هو نصف العلاج. استعن بالله ولا تمل من تكرار الروتين، ففيه عافيتك.`
    ]);
  }

  return getTip([
     `${address}، تسجيل قراءاتك وحالتك اليوم خطوة هادئة تحميك على المدى البعيد؛ المتابعة المستمرة أرحم من أي تعب مفاجئ.`,
     `${address}، صحتك هي أغلى ما تملك. اهتم بغذائك ونومك، ولا تتردد في طلب المشورة الطبية عند الحاجة.`,
     `${address}، الوقاية خير من العلاج. حافظ على وزن صحي ونشاط بدني معتدل لتعيش بصحة وعافية.`
  ]);
};

const generateMotivationMessage = (state: AppState, now: Date): string => {
  const hour = now.getHours();
  const isFemale = state.patientGender === 'female';
  const meds = state.medications || [];
  const takenCount = meds.filter(m => state.takenMedications[m.id]).length;
  const totalMeds = meds.length;
  const progress = totalMeds ? Math.round((takenCount / totalMeds) * 100) : 0;
  const mood = state.currentReport?.mood || '';

  const address =
    state.patientAge >= 60
      ? isFemale ? 'يا حاجة' : 'يا حاج'
      : state.patientAge >= 40
      ? isFemale ? 'يا غالية' : 'يا غالي'
      : isFemale ? 'يا بطلة' : 'يا بطل';

  const timeGreeting =
    hour < 12 ? 'صباح الخير' : hour < 18 ? 'مساء الخير' : 'مساء النور';

  let pool: string[] = [];

  if (hour < 12) {
    if (progress >= 80) {
      pool = [
        `${timeGreeting} ${address}، التزامك من بدري بيطمننا عليك وبيحميك.`,
        `${timeGreeting} ${address}، بداية قوية لليوم، كمل على نفس الهدوء ده.`,
        `${timeGreeting} ${address}، شكراً إنك بدأت يومك باهتمام بصحتك قبل أي شيء.`,
        `${timeGreeting} ${address}، واضح إنك صاحي وقلبك مطمّن لأنك ماسك في نظامك.`,
        `${timeGreeting} ${address}، بداية منظمة زي دي تخلي باقي اليوم أسهل على جسمك.`
      ];
    } else if (progress > 0) {
      pool = [
        `${timeGreeting} ${address}، حلو إنك بدأت، كل جرعة ملتزم بيها بتفرّق.`,
        `${timeGreeting} ${address}، خطوة النهاردة تكمل باقي الطريق بهدوء.`,
        `${timeGreeting} ${address}، البداية حتى لو بسيطة أحسن بكتير من التأجيل.`,
        `${timeGreeting} ${address}، كل ما تزود التزامك، بتخفف حمل كبير عن قلبك.`,
        `${timeGreeting} ${address}، خلي الصبح شهادة إنك ماشي في طريق العافية.`
      ];
    } else {
      pool = [
        `${timeGreeting} ${address}، خُد بداية بسيطة ومريحة، وافتكر إن صحتك أولى.`,
        `${timeGreeting} ${address}، جرعات النهاردة بداية حماية لقلبك وكليتك بإذن الله.`,
        `${timeGreeting} ${address}، مجرد إنك ناوي تهتم بنفسك النهاردة يكفينا أمل.`,
        `${timeGreeting} ${address}، هدوء الصبح فرصة لطيفة ترتّب فيها دواءك على مهلك.`,
        `${timeGreeting} ${address}، اعتبر اليوم صفحة جديدة تهدي فيها جسمك اللي يستحقه.`
      ];
    }
  } else if (hour < 18) {
    if (progress >= 80) {
      pool = [
        `${timeGreeting} ${address}، واضح إنك ماشي بخط ثابت النهاردة، ربنا يحفظك.`,
        `${timeGreeting} ${address}، استمرارك في المتابعة هو سر استقرارك.`,
        `${timeGreeting} ${address}، وسط زحمة اليوم، التزامك دواء لراحة جسمك.`,
        `${timeGreeting} ${address}، جميل إن نص يومك عدّى وأنت حريص على نفسك.`,
        `${timeGreeting} ${address}، شطارتك إنك ما سيبتش دواءك يضيع وسط مشاغلك.`
      ];
    } else if (progress > 0) {
      pool = [
        `${timeGreeting} ${address}، اللي عملته لحد دلوقتي مهم، وكمله على مهلك.`,
        `${timeGreeting} ${address}، كل ما تفتكر جرعتك، أنت بتحمي نفسك من تعب مفاجئ.`,
        `${timeGreeting} ${address}، نص اليوم اللي عدّى مقدمة حلوة للباقي.`,
        `${timeGreeting} ${address}، كل جرعة افتكرتها لحد دلوقتي خطوة محسوبة لصحتك.`,
        `${timeGreeting} ${address}، كمل على نفس الهدوء، وما تحملش نفسك فوق طاقتها.`
      ];
    } else {
      pool = [
        `${timeGreeting} ${address}، لسه عندك وقت تكمل جرعاتك بهدوء وبدون استعجال.`,
        `${timeGreeting} ${address}، ما تأجلش اهتمامك بنفسك، خطوة صغيرة دلوقتي تريحك بعدين.`,
        `${timeGreeting} ${address}، خُد دقيقة ترتّب فيها باقي اليوم بما يريح صحتك.`,
        `${timeGreeting} ${address}، كل ما تبدأ بدري، يكون جسمك أهدى مع نهاية اليوم.`,
        `${timeGreeting} ${address}، لا تستصغر أي خطوة، يمكن تكون سبب في راحة كبيرة.`
      ];
    }
  } else {
    if (progress >= 80) {
      pool = [
        `${timeGreeting} ${address}، يومك قرب يخلص وأنت عامل اللي عليك، ربنا يديك راحة.`,
        `${timeGreeting} ${address}، جميل إنك ختمت يومك على التزام وطمأنينة.`,
        `${timeGreeting} ${address}، نهاية اليوم على هدوء والتزام هدية لقلبك.`,
        `${timeGreeting} ${address}، نومك الليلة هيكون أهدى لأنك ما قصّرتش في نفسك.`,
        `${timeGreeting} ${address}، ربنا يبارك في تعبك اللطيف مع صحتك طول اليوم.`
      ];
    } else if (progress > 0) {
      pool = [
        `${timeGreeting} ${address}، باقي اليوم فرصة لطيفة تكمل جرعاتك بهدوء.`,
        `${timeGreeting} ${address}، أي جرعة تكملها قبل النوم بتزود حمايتك بإذن الله.`,
        `${timeGreeting} ${address}، قبل ما اليوم يخلص، كمّله بخطوة أمان لصحتك.`,
        `${timeGreeting} ${address}، ما تبقاش قاسي على نفسك، كفاية إنك لسه حابب تكمل.`,
        `${timeGreeting} ${address}، كل جرعة تلحقها في آخر اليوم تحسب لك مش عليك.`
      ];
    } else {
      pool = [
        `${timeGreeting} ${address}، حتى لو اليوم قرب يخلص، لسه تقدر تهتم بنفسك.`,
        `${timeGreeting} ${address}، خلي ختام يومك خطوة بسيطة لحماية صحتك.`,
        `${timeGreeting} ${address}، خطوة صغيرة قبل النوم يمكن تغيّر إحساسك ببكرة.`,
        `${timeGreeting} ${address}، ما تعتبرش اليوم ضاع، آخر ساعة قادرة تصلّح كتير.`,
        `${timeGreeting} ${address}، نهاية اليوم فرصة هادئة تعطي فيها جسمك حقه.`
      ];
    }
  }

  if (mood === 'anxious' || mood === 'sad') {
    pool = [
      `${timeGreeting} ${address}، لو حاسس النهاردة إنك مش مرتاح، خُد كل حاجة بهدوء وخطوة خطوة.`,
      `${timeGreeting} ${address}، إحساس القلق مفهوم، لكن التزامك البسيط بالعلاج بيطمننا عليك.`,
      `${timeGreeting} ${address}، لو مزاجك مش أحسن حاجة، كفاية إنك بتحاول وتهتم بنفسك.`,
      `${timeGreeting} ${address}، مش لازم تكون في أفضل حال عشان تهتم بصحتك، العكس تماماً.`,
      `${timeGreeting} ${address}، لو قلبك قلقان، خلي دواءك ومتابعتك وسيلة تهدّيه.`,
      `${timeGreeting} ${address}، إحساس الثقل طبيعي، المهم إنك ما توقّفش عنايتك بنفسك.`
    ];
  } else if (mood === 'happy') {
    pool = [
      `${timeGreeting} ${address}، حلو إن مزاجك أفضل، خليك مكمل على نفس الالتزام.`,
      `${timeGreeting} ${address}، فرحتك النهاردة مع التزامك بالعلاج أحسن وصفة لاستقرار صحتك.`,
      `${timeGreeting} ${address}، خلي فرحتك تشجعك تحافظ على قلبك أكتر وأكتر.`,
      `${timeGreeting} ${address}، مزاجك الحلو مع دواءك المنتظم خليط صحة وراحة.`,
      `${timeGreeting} ${address}، استغل طاقة فرحتك إنك تثبّت عاداتك الصحية الجميلة.`
    ];
  } else if (mood === 'calm') {
    pool = [
      `${timeGreeting} ${address}، هدوءك النهاردة فرصة ذهبية تحافظ فيها على ثبات صحتك.`,
      `${timeGreeting} ${address}، الاستقرار اللي حاسس بيه دلوقتي نتيجة حرصك على نفسك.`,
      `${timeGreeting} ${address}، الجو الهادي ده أنسب وقت تهتم فيه بجسمك بهدوء.`,
      `${timeGreeting} ${address}، حافظ على هدوءك، وخلّي دواءك جزء طبيعي من روتينك.`,
      `${timeGreeting} ${address}، استقرارك اليوم ثمرة خطوات صغيرة كررتها بحب لنفسك.`
    ];
  }

  if (pool.length === 0) {
    return `${timeGreeting} ${address}، كل يوم فيه فرصة جديدة تهتم بصحتك بهدوء.`;
  }

  const index = Math.floor(Math.random() * pool.length);
  return pool[index];
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
  const hasGeneratedMotivationRef = useRef<boolean>(false);

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
          patientGender: parsed.patientGender || 'male',
          medications: parsed.medications || DEFAULT_MEDICATIONS,
          medicalHistorySummary: parsed.medicalHistorySummary || MEDICAL_HISTORY_SUMMARY,
          dietGuidelines: parsed.dietGuidelines || DIET_GUIDELINES,
          upcomingProcedures: parsed.upcomingProcedures || "لا توجد إجراءات مسجلة حالياً.",
          labTests: parsed.labTests || [],
          lastDiagnosis: parsed.lastDiagnosis || '',
          diagnosedBy: parsed.diagnosedBy || '',
          takenMedications: isSameDay ? (parsed.takenMedications || {}) : {},
          sentNotifications: isSameDay ? (parsed.sentNotifications || []) : [],
          customReminderTimes: parsed.customReminderTimes || {},
          darkMode: parsed.darkMode ?? false,
          notificationsEnabled: parsed.notificationsEnabled ?? true,
        mandatoryRemindersEnabled: parsed.mandatoryRemindersEnabled ?? false,
        pharmacyPhone: parsed.pharmacyPhone || '',
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
      patientGender: 'male',
      patientId: generateSyncId(),
      caregiverMode: false,
      caregiverTargetId: null,
      medications: DEFAULT_MEDICATIONS,
      medicalHistorySummary: MEDICAL_HISTORY_SUMMARY,
      dietGuidelines: DIET_GUIDELINES,
      upcomingProcedures: "لا توجد إجراءات مسجلة حالياً.",
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
          lastDiagnosis: '',
          diagnosedBy: '',
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
  const [isLabsModalOpen, setIsLabsModalOpen] = useState(false);
  const [isChatOpen, setIsChatOpen] = useState(false);
  const [isDiagnosisEditOpen, setIsDiagnosisEditOpen] = useState(false);
  const [chatMessages, setChatMessages] = useState<Array<{role: 'bot' | 'user', content: React.ReactNode}>>([]);
  const [chatStep, setChatStep] = useState(0);
  const [editingMed, setEditingMed] = useState<Partial<Medication> | null>(null);
  const [idToDelete, setIdToDelete] = useState<string | null>(null);
  const [selectedHistoryDate, setSelectedHistoryDate] = useState<string | null>(null);
  const [motivationMessage, setMotivationMessage] = useState<string | null>(null);

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
    const unsubscribe = onForegroundMessage((payload) => {
      console.log('Foreground message:', payload);
      const { title, body } = payload.notification || {};
      if (title) {
        new Notification(title, { 
          body, 
          icon: 'https://cdn-icons-png.flaticon.com/512/3063/3063176.png' 
        });
        
        if (!isMuted && body && !state.caregiverMode) { 
           playChime().then(() => speakText(body)); 
        }
      }
    });
    return () => unsubscribe && unsubscribe();
  }, [isMuted, state.caregiverMode]);

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
      // Only save if we have valid data to prevent overwriting with empty/corrupt state during reloads
      if (safeState && Object.keys(safeState).length > 0 && safeState.patientId) {
        localStorage.setItem('health_track_v6', JSON.stringify(safeState));
      }
    } catch (e) { console.error("Failed to save state:", e); }
  }, [state]);

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

        if (!isMuted && !state.caregiverMode) {
          const speechText = state.caregiverMode
            ? `تنبيه للمرافق: المريض تأخر في تناول الأدوية التالية: ${medNames}`
            : `تذكير بموعد الدواء: حان الآن وقت تناول الأدوية التالية: ${medNames}. من فضلك لا تنسى أي جرعة.`;
          playNotification(speechText, true);
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

      // Check for End of Day Report Reminder (at 8 PM / 20:00)
      if (h >= 20 && !state.caregiverMode && Notification.permission === 'granted') {
        const reportNotifId = `${todayStr}-daily-report`;
        if (!state.sentNotifications.includes(reportNotifId)) {
           // Check if report is filled (assuming healthRating > 0 means filled)
           if (state.currentReport.healthRating === 0) {
             const title = "تذكير بتقرير اليوم 📝";
             const body = `يا حاج ${state.patientName}، طمنا عليك! لا تنسى تعبئة التقرير اليومي للاطمئنان على صحتك.`;
             
             if ('serviceWorker' in navigator && navigator.serviceWorker.controller) {
                navigator.serviceWorker.ready.then(reg => {
                  reg.showNotification(title, {
                    body,
                    icon: 'https://cdn-icons-png.flaticon.com/512/3063/3063176.png',
                    badge: 'https://cdn-icons-png.flaticon.com/512/3063/3063176.png',
                    vibrate: [100, 50, 100],
                    tag: 'daily-report-reminder',
                    renotify: true
                  } as any);
                });
             } else {
               new Notification(title, { body });
             }

             if (!isMuted) {
               playNotification(body, true);
             }

             setState(prev => ({
               ...prev,
               sentNotifications: [...prev.sentNotifications, reportNotifId]
             }));
           }
        }
      }
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
  const activeReport = state.currentReport;
  const activeName = state.patientName;
  const activeDailyReports = state.dailyReports;
  const currentHour = now.getHours();

  const parseDosage = (dosage: string | undefined): number => {
    if (!dosage) return 1;
    // Try parsing strict number first
    const num = parseFloat(dosage);
    if (!isNaN(num) && num > 0) return num;
    
    // Arabic text matching
    if (dosage.includes('نصف')) return 0.5;
    if (dosage.includes('ربع')) return 0.25;
    if (dosage.includes('قرصين') || dosage.includes('حبتين')) return 2;
    if (dosage.includes('ثلاث')) return 3;
    
    // Fallback regex for "2 tablets" etc.
    const match = dosage.match(/(\d+(\.\d+)?)/);
    if (match) return parseFloat(match[0]);
    
    return 1;
  };

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
      const newTaken = { ...prev.takenMedications, [id]: isTaken };
      const groupName = med?.name;
      const dosageAmount = parseDosage(med?.dosage);

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
        if (isTaken) {
          if (currentStock > 0) newStock = Math.max(0, currentStock - dosageAmount);
        } else {
          newStock = currentStock + dosageAmount;
        }
        // Round to 2 decimal places to avoid floating point errors
        newStock = Math.round(newStock * 100) / 100;
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
      let newMeds = [...prev.medications];
      
      // Case 1: Editing existing medication (Single ID)
      if (editingMed.id) {
        newMeds = newMeds.map(m => {
          if (m.id === editingMed.id) {
            return { ...m, ...editingMed };
          }
          // Update stock for same-named meds
          if (typeof editingMed.stock === 'number' && m.name === editingMed.name) {
            return { ...m, stock: editingMed.stock };
          }
          return m;
        });
      } 
      // Case 2: Adding new medication(s)
      else {
        // Determine stock
        let stock = editingMed.stock;
        if (stock === undefined) {
          const sameName = prev.medications.find(m => m.name === editingMed.name);
          if (sameName && typeof sameName.stock === 'number') {
            stock = sameName.stock;
          }
        }

        // Sub-case 2A: Recurring Mode (Multiple slots)
        if (frequencyMode === 'recurring') {
          const medsToAdd: Medication[] = [];
          recurringSlots.slice(0, recurringCount).forEach((slot, index) => {
             const newMed: Medication = { 
              ...(editingMed as Medication), 
              id: `med-${Date.now()}-${index}`,
              timeSlot: slot,
              frequencyLabel: TIME_SLOT_CONFIG[slot].label,
              stock
            };
            medsToAdd.push(newMed);
          });
          newMeds = [...newMeds, ...medsToAdd];
        } 
        // Sub-case 2B: Single Mode (Standard)
        else {
          const newMed: Medication = { 
            ...(editingMed as Medication), 
            id: `med-${Date.now()}`,
            frequencyLabel: TIME_SLOT_CONFIG[editingMed.timeSlot || 'morning-fasting'].label,
            stock
          };
          newMeds = [...newMeds, newMed];
        }
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
    setIsAnalyzing(true);
    setAiResult(null);
    try {
      const res = await analyzeHealthStatus(state);
      setAiResult(res);
      if (!isMuted) playNotification(res.summary, false);
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

  const overdueMedications = useMemo(() => {
    if (!state.mandatoryRemindersEnabled) return [];
    const h = new Date().getHours();
    return activeMedications.filter(med => {
      const isTaken = !!activeTakenMeds[med.id];
      const slotHour = SLOT_HOURS[med.timeSlot];
      return !isTaken && h >= slotHour;
    });
  }, [activeMedications, activeTakenMeds, state.mandatoryRemindersEnabled]);

  const lowStockMedications = useMemo(() => {
     return activeMedications.filter(m => (typeof m.stock === 'number' ? m.stock : 0) <= 2);
  }, [activeMedications]);

  const startChat = () => {
    setIsChatOpen(true);
    setChatStep(0);
    const firstName = state.patientName.split(' ')[0];
    setChatMessages([{ role: 'bot', content: `أهلاً بك يا ${firstName}. حابب نطمن على صحتك اليوم. كيف كان نومك؟` }]);
  };

  const handleChatSelection = (type: string, value: any, label: string) => {
    setChatMessages(prev => [...prev, { role: 'user', content: label }]);
    
    if (type === 'sleep') updateReport({ sleepQuality: value });
    if (type === 'appetite') updateReport({ appetite: value });
    if (type === 'mood') updateReport({ mood: value });
    
    setTimeout(() => {
        let nextMsg = '';
        let nextStep = 0;
        
        if (type === 'sleep') {
            nextMsg = "تمام، وكيف كانت شهيتك للأكل؟";
            nextStep = 1;
        } else if (type === 'appetite') {
            nextMsg = "وكيف مزاجك اليوم؟";
            nextStep = 2;
        } else if (type === 'mood') {
            nextMsg = "هل حسيت بأي أعراض النهاردة؟ (اختر كل ما ينطبق)";
            nextStep = 3;
        }
        
        if (nextMsg) {
            setChatMessages(prev => [...prev, { role: 'bot', content: nextMsg }]);
            setChatStep(nextStep);
        }
    }, 500);
  };

  const handleSymptomChatSubmit = () => {
     const currentSymptoms = state.currentReport.symptoms || [];
     const label = currentSymptoms.length > 0 ? `عندي: ${currentSymptoms.join('، ')}` : 'لا توجد أعراض والحمد لله';
     setChatMessages(prev => [...prev, { role: 'user', content: label }]);
     
     setTimeout(() => {
         setChatMessages(prev => [...prev, { role: 'bot', content: "شكراً لك! هل تحب تسجل أي قياسات (ضغط، سكر، إلخ)؟" }]);
         setChatStep(4);
     }, 500);
  };

  const handleVitalsChat = (hasVitals: boolean) => {
      setChatMessages(prev => [...prev, { role: 'user', content: hasVitals ? "نعم" : "لا، شكراً" }]);
      
      setTimeout(() => {
          if (hasVitals) {
              setIsChatOpen(false);
              setIsReportOpen(true); 
          } else {
              setChatMessages(prev => [...prev, { role: 'bot', content: "تمام، تم حفظ التقرير. دمتم بصحة وعافية! ❤️" }]);
              saveReportFinal();
              setTimeout(() => setIsChatOpen(false), 2500);
          }
      }, 500);
  };

  const handlePharmacyOrder = () => {
    if (!state.pharmacyPhone) {
      alert("يرجى إدخال رقم واتساب الصيدلية في الإعدادات أولاً.");
      setIsSettingsOpen(true);
      return;
    }
    const cleanPhone = state.pharmacyPhone.replace(/[^0-9]/g, '');
    
    // Deduplicate medications by name
    const uniqueMeds = Array.from(new Set(lowStockMedications.map(m => m.name)))
      .map(name => lowStockMedications.find(m => m.name === name))
      .filter((m): m is import('./types').Medication => !!m);

    const items = uniqueMeds.map(m => {
      const unit = m.reorderUnit === 'pack' ? 'علبة واحدة' : 'شريط واحد';
      return `- ${m.name} - ${unit}`;
    }).join('\n');
    
    const message = `السلام عليكم، محتاج طلبية أدوية ضرورية:\n${items}\n\nشكراً.`;
    window.open(`https://wa.me/${cleanPhone}?text=${encodeURIComponent(message)}`, '_blank');
  };

  return (
    <div className={`${state.darkMode ? 'dark' : ''}`}>
      {overdueMedications.length > 0 && (
        <div className="fixed inset-0 z-[9999] bg-red-600 flex flex-col items-center justify-center p-6 text-white text-center animate-in fade-in duration-300">
          <div className="animate-bounce mb-8 bg-white/20 p-6 rounded-full">
            <Bell className="w-24 h-24" />
          </div>
          <h1 className="text-4xl font-black mb-4">وقت الدواء!</h1>
          <p className="text-xl font-bold mb-12 opacity-90">يرجى تناول الأدوية التالية للمتابعة</p>
          
          <div className="w-full max-w-md space-y-4 mb-12 max-h-[40vh] overflow-y-auto custom-scrollbar">
            {overdueMedications.map(med => (
              <div key={med.id} className="bg-white/10 backdrop-blur-md p-6 rounded-3xl border-2 border-white/20 flex items-center justify-between">
                <div className="text-right">
                  <h3 className="text-2xl font-black">{med.name}</h3>
                  <p className="opacity-80 font-bold">{med.dosage}</p>
                </div>
                <button 
                  onClick={() => toggleMedication(med.id)}
                  className="bg-white text-red-600 px-6 py-3 rounded-xl font-black shadow-lg active:scale-95 transition-all"
                >
                  تم
                </button>
              </div>
            ))}
          </div>
          
          <div className="text-sm font-bold opacity-60">
            لن تختفي هذه الشاشة حتى يتم تأكيد تناول جميع الأدوية المستحقة
          </div>
        </div>
      )}
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
        
          <div className="space-y-4">
            {/* Motivation Card - ABOVE */}
            {(!state.caregiverMode && motivationMessage) && (
               <div className="bg-white dark:bg-slate-900 rounded-[2rem] p-6 shadow-lg border border-slate-100 dark:border-slate-800 flex items-start gap-4 transition-all hover:shadow-xl text-right">
                  <div className="p-3 bg-blue-50 dark:bg-blue-900/20 rounded-2xl text-blue-600 dark:text-blue-400">
                    <Smile className="w-6 h-6" />
                  </div>
                  <div>
                    <h3 className="font-black text-slate-800 dark:text-slate-200 text-sm mb-1">رسالة لك</h3>
                    <p className="text-sm font-bold text-slate-600 dark:text-slate-400 leading-relaxed">{motivationMessage}</p>
                  </div>
               </div>
            )}

            {/* Main Patient Card */}
            <div className={`relative overflow-hidden rounded-[2.5rem] shadow-xl transition-all duration-300 bg-white dark:bg-slate-900 border border-slate-100 dark:border-slate-800 ${state.caregiverMode ? 'border-b-[12px] border-b-emerald-600' : 'border-b-[12px] border-b-blue-600'}`}>
               
               <div className="relative z-10 p-6 md:p-8">
                 <div className="flex flex-col md:flex-row items-start md:items-center justify-between gap-6">
                   <div className="flex items-center gap-5">
                      <div className={`p-3 rounded-2xl shadow-inner ${state.caregiverMode ? 'bg-emerald-50 text-emerald-600 dark:bg-emerald-900/20 dark:text-emerald-400' : 'bg-blue-50 text-blue-600 dark:bg-blue-900/20 dark:text-blue-400'}`}>
                        {state.caregiverMode ? <UserCog className="w-10 h-10" /> : <Heart className="w-10 h-10 fill-current animate-pulse" />}
                      </div>
                      <div className="text-right">
                        <h1 className="text-2xl md:text-4xl font-black tracking-tight mb-2 text-slate-800 dark:text-slate-100">{activeName}</h1>
                        <div className="flex items-center gap-3 text-sm font-bold text-slate-500 dark:text-slate-400">
                           <div className="flex items-center gap-1.5 bg-slate-100 dark:bg-slate-800 px-3 py-1 rounded-full">
                             <span className="opacity-75">الكود:</span>
                             <span className="font-mono tracking-wider text-slate-700 dark:text-slate-300">{state.caregiverMode ? state.caregiverTargetId : state.patientId}</span>
                             <button onClick={copyPatientId} className="active:scale-90 transition-transform hover:text-blue-600"><Copy className="w-3.5 h-3.5" /></button>
                           </div>
                           <div className="flex items-center gap-1.5">
                             {isOnline ? <Wifi className="w-4 h-4 text-emerald-500" /> : <WifiOff className="w-4 h-4 text-red-400" />}
                             {isSyncing ? <RefreshCw className="w-4 h-4 animate-spin text-blue-500" /> : <Cloud className="w-4 h-4 text-slate-400" />}
                           </div>
                        </div>
                      </div>
                   </div>

                   <div className="flex items-center gap-2 p-2 bg-slate-100 dark:bg-slate-800/50 rounded-[1.5rem] shadow-inner border border-slate-200 dark:border-slate-700/50 w-fit self-center md:self-auto">
                      <button onClick={toggleMute} className={`p-3.5 rounded-xl transition-all active:scale-95 ${isMuted ? 'bg-red-100 text-red-500 dark:bg-red-900/30 dark:text-red-400 shadow-sm' : 'text-slate-500 hover:bg-white dark:text-slate-400 dark:hover:bg-slate-700 hover:shadow-sm'}`}>
                         {isMuted ? <VolumeX className="w-6 h-6" /> : <Volume2 className="w-6 h-6" />}
                      </button>
                      <div className="w-px h-8 bg-slate-200 dark:bg-slate-700"></div>
                      <button onClick={() => setIsCalendarOpen(true)} className="p-3.5 text-slate-500 hover:bg-white dark:text-slate-400 dark:hover:bg-slate-700 rounded-xl transition-all active:scale-95 hover:shadow-sm">
                         <CalendarIcon className="w-6 h-6" />
                      </button>
                      <div className="w-px h-8 bg-slate-200 dark:bg-slate-700"></div>
                      <button onClick={() => setIsSettingsOpen(true)} className="p-3.5 text-slate-500 hover:bg-white dark:text-slate-400 dark:hover:bg-slate-700 rounded-xl transition-all active:scale-95 hover:shadow-sm">
                         <Settings className="w-6 h-6" />
                      </button>
                      <div className="w-px h-8 bg-slate-200 dark:bg-slate-700"></div>
                      <button onClick={toggleDarkMode} className="p-3.5 text-slate-500 hover:bg-white dark:text-slate-400 dark:hover:bg-slate-700 rounded-xl transition-all active:scale-95 hover:shadow-sm">
                         {state.darkMode ? <Sun className="w-6 h-6 text-amber-500" /> : <Moon className="w-6 h-6" />}
                      </button>
                   </div>
                 </div>

                 <div className="mt-8 pt-6 border-t border-slate-100 dark:border-slate-800 flex flex-col md:flex-row items-center justify-between gap-4">
                   <div className="w-full md:w-2/3 text-right">
                      <div className="flex justify-between items-end mb-2">
                        <span className="text-xs font-bold text-slate-500 dark:text-slate-400 uppercase tracking-widest">مستوى الالتزام اليومي</span>
                        <span className="text-2xl font-black text-slate-800 dark:text-slate-200">{Math.round(progress)}%</span>
                      </div>
                      <div className="h-3 w-full bg-slate-100 dark:bg-slate-800 rounded-full overflow-hidden">
                        <div className={`h-full rounded-full transition-all duration-1000 ${state.caregiverMode ? 'bg-emerald-500' : 'bg-blue-500'}`} style={{ width: `${progress}%` }}></div>
                      </div>
                   </div>
                   <div className={`flex items-center gap-2 text-sm font-bold px-4 py-2 rounded-xl ${state.caregiverMode ? 'bg-emerald-50 text-emerald-700 dark:bg-emerald-900/20 dark:text-emerald-400' : 'bg-blue-50 text-blue-700 dark:bg-blue-900/20 dark:text-blue-400'}`}>
                      <Activity className="w-4 h-4" />
                      <span>{takenCount} / {totalMeds} جرعة</span>
                   </div>
                 </div>
               </div>
            </div>

            {/* Daily Tip Card - BELOW (Original Position) */}
            {(!state.caregiverMode && state.dailyTipContent) && (
               <div className="relative overflow-hidden bg-blue-600 text-white rounded-[2rem] p-6 shadow-lg transition-all hover:shadow-xl text-right">
                  {/* Background Star Pattern */}
                  <div className="absolute -bottom-6 -left-6 opacity-10 rotate-12 pointer-events-none">
                    <Sparkles className="w-48 h-48 text-white" />
                  </div>
                  
                  <div className="relative z-10 flex items-start justify-between gap-4">
                      <div className="flex-1">
                        <h3 className="font-black text-white text-lg mb-1">نصيحة اليوم</h3>
                        <p className="text-sm font-bold text-blue-50 leading-relaxed">{state.dailyTipContent}</p>
                      </div>
                      <div className="p-3 bg-white/20 rounded-2xl text-white backdrop-blur-md shadow-inner border border-white/20">
                        <Sparkles className="w-6 h-6" />
                      </div>
                  </div>
               </div>
            )}

            {/* Diagnosis Card */}
            <div className="bg-white dark:bg-slate-900 rounded-[2rem] p-6 shadow-lg border border-slate-100 dark:border-slate-800 relative group overflow-hidden">
                <div className="flex items-start justify-between gap-4">
                   <div className="flex-1 text-right">
                      <div className="flex items-center justify-end gap-2 mb-3">
                         <h3 className="font-black text-slate-800 dark:text-slate-200 text-lg">التشخيص الأخير</h3>
                         <div className="p-2 bg-indigo-50 dark:bg-indigo-900/20 rounded-xl text-indigo-600 dark:text-indigo-400">
                           <Activity className="w-5 h-5" />
                         </div>
                      </div>
                      
                      {state.lastDiagnosis ? (
                          <div className="space-y-2">
                             <p className="text-slate-600 dark:text-slate-300 font-bold leading-relaxed">{state.lastDiagnosis}</p>
                             {state.diagnosedBy && (
                                <p className="text-xs text-slate-400 font-bold flex items-center justify-end gap-1">
                                   بواسطة: {state.diagnosedBy} <Stethoscope className="w-3 h-3" />
                                </p>
                             )}
                          </div>
                      ) : (
                          <p className="text-slate-400 text-sm font-bold py-2">لم يتم تسجيل تشخيص بعد.</p>
                      )}
                   </div>
                </div>

                <div className="mt-6 flex gap-3">
                    <button 
                        onClick={() => {
                           const diagnosis = state.lastDiagnosis || '';
                           const by = state.diagnosedBy || '';
                           const text = `السلام عليكم،\n\n*التشخيص الأخير للحالة:*\n${diagnosis}\n${by ? `\nتم التشخيص بواسطة: ${by}` : ''}\n\nيرجى المراجعة والافادة.`;
                           window.open(`https://wa.me/?text=${encodeURIComponent(text)}`, '_blank');
                        }}
                        className="flex-1 py-3 bg-[#25D366] hover:bg-[#20bd5a] text-white rounded-xl font-black text-sm shadow-lg shadow-green-100 dark:shadow-none transition-all active:scale-95 flex items-center justify-center gap-2"
                    >
                        <MessageCircle className="w-4 h-4" /> إرسال للواتساب
                    </button>
                    <button 
                        onClick={() => setIsDiagnosisEditOpen(true)}
                        className="p-3 bg-slate-100 dark:bg-slate-800 text-slate-600 dark:text-slate-300 rounded-xl hover:bg-slate-200 dark:hover:bg-slate-700 transition-colors"
                    >
                        <Edit3 className="w-4 h-4" />
                    </button>
                </div>
            </div>
          </div>

          <main className="grid grid-cols-1 lg:grid-cols-12 gap-6 items-start">
            <div className="lg:col-span-5 space-y-8">
              <div className="flex items-center justify-between px-2">
                <h2 className="text-2xl font-black text-slate-800 dark:text-slate-200 flex items-center gap-3">جدول الأدوية <ClipboardList className="w-7 h-7 text-blue-500" /></h2>
                <div className="flex gap-2">
                  {lowStockMedications.length > 0 && (
                    <button 
                      onClick={handlePharmacyOrder}
                      className="bg-emerald-500 text-white p-3 rounded-2xl shadow-xl active:scale-95 transition-all flex items-center gap-2 animate-pulse"
                      title="طلب الأدوية الناقصة"
                    >
                      <ShoppingCart className="w-5 h-5" />
                      <span className="text-xs font-black hidden md:inline">طلب النواقص</span>
                    </button>
                  )}
                  {state.caregiverMode && (
                    <button 
                      onClick={() => { setEditingMed({ name: '', dosage: '', timeSlot: 'morning-fasting', notes: '', isCritical: false, category: 'other', frequencyLabel: '' }); setIsMedManagerOpen(true); }}
                      className="bg-emerald-600 text-white p-3 rounded-2xl shadow-xl active:scale-95 transition-all"
                    >
                      <PlusCircle className="w-7 h-7" />
                    </button>
                  )}
                </div>
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
                              {state.caregiverMode && (
                                <div className="absolute top-4 left-4 flex gap-2 opacity-0 group-hover:opacity-100 transition-opacity z-20">
                                  <button onClick={() => { handleSendReminder(med.name); alert(`تم إرسال تنبيه للمريض بخصوص ${med.name}`); }} className="p-2.5 bg-white/95 dark:bg-slate-800 shadow-lg border dark:border-slate-700 rounded-xl hover:bg-amber-50 dark:hover:bg-amber-900/20 text-amber-600"><Bell className="w-4 h-4" /></button>
                                  <button onClick={() => { setEditingMed(med); setIsMedManagerOpen(true); }} className="p-2.5 bg-white/95 dark:bg-slate-800 shadow-lg border dark:border-slate-700 rounded-xl hover:bg-blue-50 dark:hover:bg-blue-900/20 text-blue-600"><Pencil className="w-4 h-4" /></button>
                                  <button onClick={() => setIdToDelete(med.id)} className="p-2.5 bg-white/95 dark:bg-slate-800 shadow-lg border dark:border-slate-700 rounded-xl hover:bg-red-50 dark:hover:bg-red-900/20 text-red-600"><Trash2 className="w-4 h-4" /></button>
                                </div>
                              )}
                              <div className="p-6 md:p-7 flex items-center gap-6">
                                <button onClick={() => toggleMedication(med.id)} className={`shrink-0 w-16 h-16 rounded-[1.6rem] flex items-center justify-center transition-all ${isTaken ? 'bg-emerald-500 text-white' : isLate ? 'bg-red-600 text-white' : 'bg-slate-50 dark:bg-slate-800 text-slate-300 dark:text-slate-600'}`}>
                                  {isTaken ? <CheckCircle className="w-10 h-10" /> : isLate ? <AlertTriangle className="w-10 h-10" /> : <Plus className="w-10 h-10" />}
                                </button>
                                <div className="flex-1 text-right min-w-0 pr-2">
                                  <div className="flex items-center justify-end gap-2 mb-2">
                                    {med.isCritical && <span className="flex items-center gap-1 text-[9px] bg-red-100 dark:bg-red-900/30 text-red-700 dark:text-red-400 px-2 py-1 rounded-lg font-black">ضروري</span>}
                                    <h4 className={`text-xl md:text-2xl font-black truncate ${isTaken ? 'line-through text-slate-400 dark:text-slate-600' : 'text-slate-800 dark:text-slate-100'}`}>{med.name}</h4>
                                  </div>
                                  <span className="text-[11px] font-black px-3 py-1 rounded-lg bg-slate-100 dark:bg-slate-800 text-slate-500 dark:text-slate-400">{med.dosage} قرص • {med.frequencyLabel}</span>
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
                       <div key={t.id} className="flex items-center justify-between gap-3">
                         <div className="flex-1">
                           <p className="font-black text-sm text-slate-800 dark:text-slate-100">{t.name}</p>
                           <p className="text-[11px] text-slate-400 dark:text-slate-500">{t.date}</p>
                         </div>
                         <span className="text-xs font-black px-3 py-1 rounded-2xl bg-rose-50 dark:bg-rose-900/20 text-rose-700 dark:text-rose-300">
                           {t.result}
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

          <footer className="fixed bottom-8 left-1/2 -translate-x-1/2 w-fit max-w-[95%] bg-white/25 dark:bg-slate-900/30 backdrop-blur-3xl border border-white/20 dark:border-slate-700/40 px-8 py-5 rounded-[3.5rem] shadow-2xl z-[100] flex items-center justify-center gap-10 transition-colors">
            <button onClick={startChat} className="w-14 h-14 flex items-center justify-center rounded-[1.6rem] text-indigo-600 dark:text-indigo-400 bg-white dark:bg-slate-800 border dark:border-slate-700 active:scale-90 transition-all shadow-sm"><MessageCircle className="w-8 h-8"/></button>
            <button onClick={() => setIsReportOpen(true)} className="w-14 h-14 flex items-center justify-center rounded-[1.6rem] text-blue-600 dark:text-blue-400 bg-white dark:bg-slate-800 border dark:border-slate-700 active:scale-90 transition-all shadow-sm"><DoctorIcon className="w-8 h-8"/></button>
            <button onClick={handleAI} disabled={isAnalyzing} className={`w-18 h-18 rounded-[2rem] text-white shadow-2xl active:scale-95 flex items-center justify-center border-[6px] border-white dark:border-slate-900 ${state.caregiverMode ? 'bg-emerald-600' : 'bg-blue-600'}`}>
              {isAnalyzing ? <RefreshCw className="w-9 h-9 animate-spin" /> : <BrainCircuit className="w-10 h-10" />}
            </button>
            <button onClick={toggleMute} className={`w-14 h-14 flex items-center justify-center rounded-[1.6rem] active:scale-90 transition-all shadow-sm ${isMuted ? 'text-red-500 bg-red-50 dark:bg-red-900/20' : 'text-slate-600 dark:text-slate-300 bg-white dark:bg-slate-800 border dark:border-slate-700'}`}>
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
                  
                  <div className="space-y-4 text-right">
                    <label className="text-[11px] font-black text-slate-400 dark:text-slate-500 mr-2 uppercase">جنس المريض</label>
                    <div className="grid grid-cols-2 gap-4 p-2 bg-slate-100 dark:bg-slate-800 rounded-[2rem]">
                      <button
                        onClick={() => { lastLocalActionTime.current = Date.now(); isDirty.current = true; setState(prev => ({ ...prev, patientGender: 'male' })); }}
                        className={`py-4 rounded-[1.5rem] font-black transition-all ${state.patientGender !== 'female' ? 'bg-white dark:bg-slate-700 text-blue-600 dark:text-blue-400 shadow-xl' : 'text-slate-400 dark:text-slate-500'}`}
                      >
                        ذكر
                      </button>
                      <button
                        onClick={() => { lastLocalActionTime.current = Date.now(); isDirty.current = true; setState(prev => ({ ...prev, patientGender: 'female' })); }}
                        className={`py-4 rounded-[1.5rem] font-black transition-all ${state.patientGender === 'female' ? 'bg-white dark:bg-slate-700 text-pink-600 dark:text-pink-400 shadow-xl' : 'text-slate-400 dark:text-slate-500'}`}
                      >
                        أنثى
                      </button>
                    </div>
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

                  <div className="p-6 bg-red-50 dark:bg-red-900/20 rounded-[2rem] border-2 border-red-100 dark:border-red-900/30 text-right space-y-4">
                    <div className="flex items-center justify-end gap-2 text-red-700 dark:text-red-400 font-black"><AlertTriangle className="w-5 h-5"/> تنبيهات الشاشة الإجبارية</div>
                    <p className="text-xs text-slate-600 dark:text-slate-400 font-bold">تفعيل شاشة كاملة عند وقت الدواء لا تختفي إلا بتأكيد تناول الدواء.</p>
                    <button 
                      onClick={() => {
                        lastLocalActionTime.current = Date.now();
                        isDirty.current = true;
                        setState(prev => ({ ...prev, mandatoryRemindersEnabled: !prev.mandatoryRemindersEnabled }));
                      }}
                      className={`w-full py-4 rounded-2xl font-black text-sm transition-all shadow-md ${
                        state.mandatoryRemindersEnabled 
                          ? 'bg-red-600 text-white' 
                          : 'bg-slate-200 dark:bg-slate-700 text-slate-500 dark:text-slate-400'
                      }`}
                    >
                      {state.mandatoryRemindersEnabled ? 'الخدمة مفعلة حالياً' : 'اضغط للتفعيل'}
                    </button>
                  </div>

                  <div className="space-y-3 text-right">
                    <label className="text-[11px] font-black text-slate-400 dark:text-slate-500 mr-2 uppercase">رقم واتساب الصيدلية</label>
                    <input type="text" placeholder="مثال: 201xxxxxxxxx" value={state.pharmacyPhone || ''} onChange={(e) => { lastLocalActionTime.current = Date.now(); isDirty.current = true; setState(prev => ({ ...prev, pharmacyPhone: e.target.value })); }} className="w-full p-6 bg-slate-50 dark:bg-slate-800 dark:text-white border-2 dark:border-slate-700 focus:border-emerald-500 outline-none rounded-[1.8rem] font-black text-lg text-right shadow-sm" />
                    <p className="text-[10px] text-slate-500 font-bold mr-2">يستخدم لإرسال طلبات الأدوية الناقصة تلقائياً.</p>
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

                  <div className="p-6 bg-slate-50 dark:bg-slate-800 rounded-[2rem] border-2 border-slate-100 dark:border-slate-700 text-right space-y-4">
                    <div className="flex items-center justify-end gap-2 text-slate-700 dark:text-slate-300 font-black"><Save className="w-5 h-5"/> النسخ الاحتياطي الكامل</div>
                    <p className="text-xs text-slate-500 dark:text-slate-400 font-bold">حفظ نسخة كاملة من جميع البيانات والإعدادات واستعادتها عند الحاجة.</p>
                    <div className="flex gap-3">
                       <button 
                         onClick={handleFullBackup}
                         className="flex-1 py-4 bg-blue-600 text-white rounded-2xl font-black text-sm shadow-lg active:scale-95 transition-all flex items-center justify-center gap-2"
                       >
                         <Share2 className="w-4 h-4" /> حفظ نسخة (Backup)
                       </button>
                       <label className="flex-1 py-4 bg-slate-200 dark:bg-slate-700 text-slate-700 dark:text-slate-300 rounded-2xl font-black text-sm shadow-lg active:scale-95 transition-all flex items-center justify-center gap-2 cursor-pointer hover:bg-slate-300 dark:hover:bg-slate-600">
                         <History className="w-4 h-4" /> استعادة (Import)
                         <input type="file" accept="application/json" onChange={handleFullRestore} className="hidden" />
                       </label>
                    </div>
                  </div>

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
                <div className="flex flex-col md:flex-row items-center justify-between gap-4 mt-2">
                  <p className="text-[11px] md:text-xs font-bold text-slate-500 dark:text-slate-400 text-right flex-1">
                    يتم حفظ التزامك دوائياً يومياً، ويمكنك إنشاء نسخة احتياطية يدوية الآن.
                  </p>
                  <div className="flex items-center gap-2">
                    <button
                      onClick={async () => {
                        const targetId = state.caregiverMode ? state.caregiverTargetId : state.patientId;
                        if (!targetId) {
                          alert("لا يوجد رمز مريض صالح لحفظ النسخة الاحتياطية.");
                          return;
                        }
                        try {
                          await backupAdherenceHistory(targetId, state.dailyReports);
                          alert("تم حفظ نسخة احتياطية من تاريخ الالتزام الدوائي بنجاح في السحابة.");
                        } catch (e) {
                          console.error(e);
                          alert("حدث خطأ أثناء حفظ النسخة الاحتياطية. حاول مرة أخرى لاحقاً.");
                        }
                      }}
                      className="px-5 py-3 rounded-2xl bg-blue-600 text-white text-xs md:text-sm font-black shadow-md active:scale-95 transition-all"
                    >
                      حفظ نسخة احتياطية الآن
                    </button>
                    <button
                      onClick={exportAdherenceJson}
                      className="px-5 py-3 rounded-2xl bg-white dark:bg-slate-900 text-slate-700 dark:text-slate-200 text-xs md:text-sm font-black shadow-md border border-slate-200 dark:border-slate-700 active:scale-95 transition-all flex items-center gap-2"
                    >
                      <FileText className="w-4 h-4" />
                      تنزيل JSON
                    </button>
                    <label
                      htmlFor="adherence-json-input"
                      className="px-5 py-3 rounded-2xl bg-slate-900 dark:bg-slate-800 text-white text-xs md:text-sm font-black shadow-md border border-slate-900/70 dark:border-slate-700 active:scale-95 transition-all flex items-center gap-2 cursor-pointer"
                    >
                      <History className="w-4 h-4" />
                      استرجاع من JSON
                    </label>
                  </div>
                  <input
                    id="adherence-json-input"
                    type="file"
                    accept="application/json"
                    className="hidden"
                    onChange={handleImportAdherenceJson}
                  />
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
                  {state.caregiverMode && (
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
                                ...(prev as any).labTestsDraft,
                                name: e.target.value
                              }
                            }) as any);
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
                                ...(prev as any).labTestsDraft,
                                date: e.target.value
                              }
                            }) as any);
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
                              ...(prev as any).labTestsDraft,
                              result: e.target.value
                            }
                          }) as any);
                        }}
                      />
                      <div className="flex justify-end">
                        <button
                          onClick={() => {
                            const draft: any = (state as any).labTestsDraft || {};
                            if (!draft.name || !draft.date || !draft.result) {
                              alert("من فضلك أدخل اسم التحليل، موعده، ونتيجته قبل الحفظ.");
                              return;
                            }
                            lastLocalActionTime.current = Date.now();
                            isDirty.current = true;
                            setState(prev => ({
                              ...prev,
                              labTests: [
                                ...(prev.labTests || []),
                                {
                                  id: crypto.randomUUID(),
                                  name: draft.name,
                                  date: draft.date,
                                  result: draft.result,
                                  notes: draft.notes || ''
                                }
                              ],
                              labTestsDraft: undefined as any
                            }));
                          }}
                          className="px-6 py-3 rounded-2xl bg-rose-600 text-white text-xs font-black active:scale-95 shadow-md"
                        >
                          حفظ التحليل
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
                          <div key={t.id} className="flex items-start justify-between gap-4 p-4 rounded-2xl border border-slate-100 dark:border-slate-800 bg-slate-50/60 dark:bg-slate-800/40">
                            <div className="flex-1 text-right space-y-1">
                              <p className="font-black text-sm text-slate-900 dark:text-white">{t.name}</p>
                              <p className="text-[11px] text-slate-500 dark:text-slate-400">{t.date}</p>
                              <p className="text-xs text-slate-700 dark:text-slate-200 whitespace-pre-wrap">{t.result}</p>
                            </div>
                            {state.caregiverMode && (
                              <button
                                onClick={() => {
                                  lastLocalActionTime.current = Date.now();
                                  isDirty.current = true;
                                  setState(prev => ({
                                    ...prev,
                                    labTests: (prev.labTests || []).filter(x => x.id !== t.id)
                                  }));
                                }}
                                className="p-2 rounded-xl bg-red-50 dark:bg-red-900/20 text-red-600 dark:text-red-300 text-xs font-black"
                              >
                                حذف
                              </button>
                            )}
                          </div>
                        ))}
                      </div>
                    ) : (
                      <p className="text-xs text-slate-500 dark:text-slate-400 text-right">
                        لا توجد تحاليل مسجلة حتى الآن. يمكن للمرافق إضافة التحاليل من الأعلى.
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
                        <label className="text-[11px] font-black text-slate-400 dark:text-slate-500 uppercase tracking-widest mr-2">اسم الدواء</label>
                        <input type="text" value={editingMed.name || ''} onChange={(e) => setEditingMed({...editingMed, name: e.target.value})} className="w-full p-5 bg-slate-50 dark:bg-slate-800 dark:text-white border-2 dark:border-slate-700 focus:border-emerald-500 outline-none rounded-2xl font-black text-lg text-right" placeholder="مثال: Aldomet"/>
                      </div>
                      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                        <div className="space-y-2">
                          <label className="text-[11px] font-black text-slate-400 dark:text-slate-500 uppercase mr-2">الجرعة (عدد الأقراص)</label>
                          <div className="flex flex-wrap gap-2 mb-2">
                            {[0.5, 1, 1.5, 2, 3, 4].map(num => (
                              <button 
                                key={num} 
                                onClick={() => setEditingMed({...editingMed, dosage: num.toString()})}
                                className={`px-3 py-1 rounded-lg text-sm font-black border transition-colors ${editingMed.dosage === num.toString() ? 'bg-emerald-500 text-white border-emerald-500' : 'bg-white dark:bg-slate-700 text-slate-600 dark:text-slate-300 border-slate-200 dark:border-slate-600'}`}
                              >
                                {num}
                              </button>
                            ))}
                          </div>
                          <input type="text" value={editingMed.dosage || ''} onChange={(e) => setEditingMed({...editingMed, dosage: e.target.value})} className="w-full p-5 bg-slate-50 dark:bg-slate-800 dark:text-white border-2 dark:border-slate-700 focus:border-emerald-500 outline-none rounded-2xl font-black text-lg text-right" placeholder="قرص واحد"/>
                        </div>
                        <div className="space-y-4">
                          {!editingMed.id && (
                             <div className="space-y-2">
                               <label className="text-[11px] font-black text-slate-400 dark:text-slate-500 uppercase mr-2">تكرار الجرعة</label>
                               <div className="flex gap-2">
                                 <button onClick={() => setFrequencyMode('single')} className={`flex-1 py-2 rounded-lg font-bold text-xs transition-all border ${frequencyMode === 'single' ? 'bg-emerald-50 border-emerald-500 text-emerald-700' : 'bg-slate-50 border-transparent text-slate-400'}`}>مرة واحدة</button>
                                 <button onClick={() => setFrequencyMode('recurring')} className={`flex-1 py-2 rounded-lg font-bold text-xs transition-all border ${frequencyMode === 'recurring' ? 'bg-emerald-50 border-emerald-500 text-emerald-700' : 'bg-slate-50 border-transparent text-slate-400'}`}>تكرار</button>
                               </div>
                             </div>
                          )}
                          
                          {(!editingMed.id && frequencyMode === 'recurring') ? (
                            <div className="space-y-3">
                               <div className="flex gap-1 mb-2">
                                 {[2, 3, 4].map(count => (
                                   <button key={count} onClick={() => { setRecurringCount(count); const newSlots = [...recurringSlots]; while(newSlots.length < count) newSlots.push('morning-fasting'); setRecurringSlots(newSlots.slice(0, count)); }} className={`flex-1 py-1 rounded text-xs font-bold border ${recurringCount === count ? 'bg-emerald-500 text-white border-emerald-500' : 'bg-white border-slate-200 text-slate-400'}`}>{count} جرعات</button>
                                 ))}
                               </div>
                               <div className="space-y-2 max-h-40 overflow-y-auto pr-1 custom-scrollbar">
                                 {Array.from({ length: recurringCount }).map((_, idx) => (
                                    <select key={idx} value={recurringSlots[idx] || 'morning-fasting'} onChange={(e) => { const newSlots = [...recurringSlots]; newSlots[idx] = e.target.value as TimeSlot; setRecurringSlots(newSlots); }} className="w-full p-3 bg-slate-50 dark:bg-slate-800 dark:text-white border dark:border-slate-700 rounded-xl text-sm font-bold text-right mb-1">
                                      {Object.entries(TIME_SLOT_CONFIG).map(([key, value]) => (<option key={key} value={key}>{idx+1}. {value.label}</option>))}
                                    </select>
                                 ))}
                               </div>
                            </div>
                          ) : (
                            <div className="space-y-2">
                              <label className="text-[11px] font-black text-slate-400 dark:text-slate-500 uppercase mr-2">وقت التناول</label>
                              <select value={editingMed.timeSlot || 'morning-fasting'} onChange={(e) => setEditingMed({...editingMed, timeSlot: e.target.value as TimeSlot})} className="w-full p-5 bg-slate-50 dark:bg-slate-800 dark:text-white border-2 dark:border-slate-700 outline-none rounded-2xl font-black text-lg text-right appearance-none">
                                {Object.entries(TIME_SLOT_CONFIG).map(([key, value]) => (<option key={key} value={key}>{value.label}</option>))}
                              </select>
                            </div>
                          )}
                        </div>
                      </div>
                      <div className="space-y-2">
                        <label className="text-[11px] font-black text-slate-400 dark:text-slate-500 uppercase mr-2">مخزون الدواء (عدد الجرعات)</label>
                        <div className="flex gap-2">
                          <div className="flex-1">
                            <input
                              type="number"
                              min={0}
                              value={editingMed.stock === undefined ? '' : editingMed.stock}
                              onChange={(e) => {
                                const value = e.target.value === '' ? undefined : Math.max(0, parseFloat(e.target.value) || 0);
                                setEditingMed({ ...editingMed, stock: value });
                              }}
                              className="w-full p-5 bg-slate-50 dark:bg-slate-800 dark:text-white border-2 dark:border-slate-700 focus:border-emerald-500 outline-none rounded-2xl font-black text-lg text-right"
                              placeholder="الرصيد الحالي"
                            />
                          </div>
                          <div className="flex-1 flex gap-2">
                             <input 
                               id="refill-qty"
                               type="number" 
                               placeholder="إضافة.." 
                               className="w-full p-5 bg-slate-50 dark:bg-slate-800 dark:text-white border-2 dark:border-slate-700 focus:border-emerald-500 outline-none rounded-2xl font-black text-lg text-right"
                             />
                             <button 
                               onClick={() => {
                                 const input = document.getElementById('refill-qty') as HTMLInputElement;
                                 const qty = parseFloat(input.value);
                                 if (!isNaN(qty) && qty > 0) {
                                   const current = typeof editingMed.stock === 'number' ? editingMed.stock : 0;
                                   setEditingMed({...editingMed, stock: current + qty});
                                   input.value = '';
                                 }
                               }}
                               className="px-4 bg-emerald-100 dark:bg-emerald-900/30 text-emerald-700 dark:text-emerald-400 rounded-2xl font-black text-sm whitespace-nowrap"
                             >
                               تعبئة
                             </button>
                          </div>
                        </div>
                      </div>
                      <div className="space-y-2">
                        <label className="text-[11px] font-black text-slate-400 dark:text-slate-500 uppercase mr-2">وحدة إعادة الشراء (للطلبات)</label>
                        <div className="grid grid-cols-2 gap-4">
                          <button 
                            onClick={() => setEditingMed({...editingMed, reorderUnit: 'strip'})}
                            className={`py-4 rounded-2xl font-black text-sm transition-all border-2 ${
                              (editingMed.reorderUnit || 'strip') === 'strip' 
                                ? 'bg-emerald-50 dark:bg-emerald-900/20 border-emerald-500 text-emerald-700 dark:text-emerald-400' 
                                : 'bg-slate-50 dark:bg-slate-800 border-transparent text-slate-400 dark:text-slate-500'
                            }`}
                          >
                            شريط
                          </button>
                          <button 
                            onClick={() => setEditingMed({...editingMed, reorderUnit: 'pack'})}
                            className={`py-4 rounded-2xl font-black text-sm transition-all border-2 ${
                              editingMed.reorderUnit === 'pack' 
                                ? 'bg-emerald-50 dark:bg-emerald-900/20 border-emerald-500 text-emerald-700 dark:text-emerald-400' 
                                : 'bg-slate-50 dark:bg-slate-800 border-transparent text-slate-400 dark:text-slate-500'
                            }`}
                          >
                            علبة
                          </button>
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
                      <button onClick={() => setEditingMed({ name: '', dosage: '', timeSlot: 'morning-fasting', notes: '', isCritical: false, category: 'other', frequencyLabel: '', stock: 0, reorderUnit: 'strip' })} className="w-full py-10 border-4 border-dashed border-slate-100 dark:border-slate-800 rounded-[2.8rem] text-slate-400 dark:text-slate-600 font-black text-xl hover:bg-emerald-50 dark:hover:bg-emerald-900/10 transition-all flex items-center justify-center gap-5 shadow-inner"><PlusCircle className="w-9 h-9" /> إضافة دواء جديد</button>
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
      {/* Chat Modal */}
      {isChatOpen && (
        <div className="fixed inset-0 z-[150] flex items-end sm:items-center justify-center p-4 sm:p-6 bg-black/50 backdrop-blur-sm animate-in fade-in">
          <div className="bg-white dark:bg-slate-900 w-full max-w-lg rounded-t-[2.5rem] sm:rounded-[2.5rem] shadow-2xl flex flex-col max-h-[90vh] overflow-hidden">
            <div className="p-5 border-b border-slate-100 dark:border-slate-800 flex items-center justify-between bg-slate-50/50 dark:bg-slate-800/50">
               <button onClick={() => setIsChatOpen(false)} className="p-2 hover:bg-slate-200 dark:hover:bg-slate-700 rounded-full transition-colors"><X className="w-6 h-6 text-slate-500" /></button>
               <h3 className="font-black text-slate-800 dark:text-slate-100 text-lg flex items-center gap-2">اطمن عليك <MessageCircle className="w-6 h-6 text-indigo-500"/></h3>
            </div>
            
            <div className="flex-1 overflow-y-auto p-6 space-y-4">
               {chatMessages.map((msg, idx) => (
                  <div key={idx} className={`flex ${msg.role === 'user' ? 'justify-end' : 'justify-start'}`}>
                     <div className={`max-w-[80%] p-4 rounded-2xl text-sm font-bold leading-relaxed shadow-sm ${msg.role === 'user' ? 'bg-indigo-600 text-white rounded-br-none' : 'bg-slate-100 dark:bg-slate-800 text-slate-700 dark:text-slate-200 rounded-bl-none'}`}>
                        {msg.content}
                     </div>
                  </div>
               ))}
               <div ref={(el) => el?.scrollIntoView({ behavior: 'smooth' })} />
            </div>

            <div className="p-5 border-t border-slate-100 dark:border-slate-800 bg-slate-50/50 dark:bg-slate-800/50">
               {chatStep === 0 && (
                  <div className="flex gap-2 justify-center">
                     <button onClick={() => handleChatSelection('sleep', 'poor', 'غير مريح 😴')} className="flex-1 py-3 bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-xl shadow-sm hover:bg-slate-50 dark:hover:bg-slate-700 transition-colors text-slate-600 dark:text-slate-300 font-bold">غير مريح</button>
                     <button onClick={() => handleChatSelection('sleep', 'fair', 'متوسط 😐')} className="flex-1 py-3 bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-xl shadow-sm hover:bg-slate-50 dark:hover:bg-slate-700 transition-colors text-slate-600 dark:text-slate-300 font-bold">متوسط</button>
                     <button onClick={() => handleChatSelection('sleep', 'good', 'جيد 😴')} className="flex-1 py-3 bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-xl shadow-sm hover:bg-slate-50 dark:hover:bg-slate-700 transition-colors text-slate-600 dark:text-slate-300 font-bold">جيد</button>
                  </div>
               )}
               {chatStep === 1 && (
                  <div className="flex gap-2 justify-center">
                     <button onClick={() => handleChatSelection('appetite', 'poor', 'ضعيفة 🍽️')} className="flex-1 py-3 bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-xl shadow-sm hover:bg-slate-50 dark:hover:bg-slate-700 transition-colors text-slate-600 dark:text-slate-300 font-bold">ضعيفة</button>
                     <button onClick={() => handleChatSelection('appetite', 'fair', 'متوسطة 🍽️')} className="flex-1 py-3 bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-xl shadow-sm hover:bg-slate-50 dark:hover:bg-slate-700 transition-colors text-slate-600 dark:text-slate-300 font-bold">متوسطة</button>
                     <button onClick={() => handleChatSelection('appetite', 'good', 'جيدة 🍽️')} className="flex-1 py-3 bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-xl shadow-sm hover:bg-slate-50 dark:hover:bg-slate-700 transition-colors text-slate-600 dark:text-slate-300 font-bold">جيدة</button>
                  </div>
               )}
               {chatStep === 2 && (
                  <div className="flex gap-2 justify-center">
                     <button onClick={() => handleChatSelection('mood', 'sad', 'حزين 😔')} className="flex-1 py-3 bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-xl shadow-sm hover:bg-slate-50 dark:hover:bg-slate-700 transition-colors text-slate-600 dark:text-slate-300 font-bold">حزين</button>
                     <button onClick={() => handleChatSelection('mood', 'anxious', 'قلق 😟')} className="flex-1 py-3 bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-xl shadow-sm hover:bg-slate-50 dark:hover:bg-slate-700 transition-colors text-slate-600 dark:text-slate-300 font-bold">قلق</button>
                     <button onClick={() => handleChatSelection('mood', 'calm', 'هادئ 😌')} className="flex-1 py-3 bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-xl shadow-sm hover:bg-slate-50 dark:hover:bg-slate-700 transition-colors text-slate-600 dark:text-slate-300 font-bold">هادئ</button>
                     <button onClick={() => handleChatSelection('mood', 'happy', 'سعيد 😊')} className="flex-1 py-3 bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-xl shadow-sm hover:bg-slate-50 dark:hover:bg-slate-700 transition-colors text-slate-600 dark:text-slate-300 font-bold">سعيد</button>
                  </div>
               )}
               {chatStep === 3 && (
                   <div className="space-y-3">
                       <div className="flex flex-wrap gap-2 justify-end max-h-40 overflow-y-auto">
                           {SYMPTOMS.map(sym => (
                               <button 
                                 key={sym}
                                 onClick={() => {
                                     const current = state.currentReport.symptoms || [];
                                     const exists = current.includes(sym);
                                     updateReport({ symptoms: exists ? current.filter(s => s !== sym) : [...current, sym] });
                                 }}
                                 className={`px-3 py-1.5 rounded-lg text-xs font-bold transition-all ${state.currentReport.symptoms?.includes(sym) ? 'bg-red-500 text-white shadow-md' : 'bg-slate-100 dark:bg-slate-700 text-slate-600 dark:text-slate-300'}`}
                               >
                                   {sym}
                               </button>
                           ))}
                       </div>
                       <button onClick={handleSymptomChatSubmit} className="w-full py-3 bg-indigo-600 hover:bg-indigo-700 text-white rounded-xl font-black shadow-lg transition-all flex items-center justify-center gap-2">
                           تأكيد ومتابعة <Check className="w-5 h-5" />
                       </button>
                   </div>
               )}
               {chatStep === 4 && (
                   <div className="flex gap-3 justify-center">
                       <button onClick={() => handleVitalsChat(false)} className="flex-1 py-3 bg-slate-100 dark:bg-slate-800 hover:bg-slate-200 dark:hover:bg-slate-700 text-slate-600 dark:text-slate-300 rounded-xl font-black transition-colors">لا، شكراً</button>
                       <button onClick={() => handleVitalsChat(true)} className="flex-1 py-3 bg-indigo-600 hover:bg-indigo-700 text-white rounded-xl font-black shadow-lg transition-colors">نعم، تسجيل قياسات</button>
                   </div>
               )}
            </div>
          </div>
        </div>
      )}

      {/* Diagnosis Edit Modal */}
      {isDiagnosisEditOpen && (
        <div className="fixed inset-0 z-[160] flex items-center justify-center p-4 bg-black/60 backdrop-blur-sm animate-in fade-in">
           <div className="bg-white dark:bg-slate-900 w-full max-w-md rounded-[2rem] p-6 shadow-2xl relative">
              <button onClick={() => setIsDiagnosisEditOpen(false)} className="absolute top-4 left-4 p-2 hover:bg-slate-100 dark:hover:bg-slate-800 rounded-full transition-colors"><X className="w-6 h-6 text-slate-400" /></button>
              <h3 className="text-xl font-black text-slate-800 dark:text-slate-100 mb-6 text-right">تعديل التشخيص الأخير</h3>
              
              <div className="space-y-4">
                  <div className="space-y-2 text-right">
                      <label className="text-sm font-bold text-slate-500">التشخيص</label>
                      <textarea 
                          value={state.lastDiagnosis}
                          onChange={(e) => setState(prev => ({ ...prev, lastDiagnosis: e.target.value }))}
                          className="w-full p-4 rounded-xl bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 text-right font-medium focus:ring-2 focus:ring-blue-500 outline-none resize-none h-32"
                          placeholder="اكتب التشخيص هنا..."
                      />
                  </div>
                  <div className="space-y-2 text-right">
                      <label className="text-sm font-bold text-slate-500">بواسطة (الطبيب/المستشفى)</label>
                      <input 
                          type="text"
                          value={state.diagnosedBy}
                          onChange={(e) => setState(prev => ({ ...prev, diagnosedBy: e.target.value }))}
                          className="w-full p-4 rounded-xl bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 text-right font-medium focus:ring-2 focus:ring-blue-500 outline-none"
                          placeholder="اسم الطبيب"
                      />
                  </div>
                  <button 
                      onClick={() => setIsDiagnosisEditOpen(false)}
                      className="w-full py-4 bg-blue-600 hover:bg-blue-700 text-white rounded-xl font-black shadow-xl shadow-blue-500/30 transition-all active:scale-95"
                  >
                      حفظ التغييرات
                  </button>
              </div>
           </div>
        </div>
      )}
    </div>
  );
};

export default App;
