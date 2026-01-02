
import React from 'react';
import { Medication, TimeSlot } from './types';
import { Sun, Coffee, Utensils, CloudSun, Clock, Moon, Bed } from 'lucide-react';

// التاريخ الطبي الشامل للحاج ممدوح - يستخدم كمرجع للذكاء الاصطناعي
export const MEDICAL_HISTORY_SUMMARY = `🧾 ملخص التاريخ المرضي – الحاج ممدوح عبد العال
- السن: 75 سنة.
- الأمراض المزمنة: سكري، ضغط دم مرتفع، قصور بالشرايين التاجية.
- جراحات سابقة: تغيير صمام أورطي (صمام نسيجي).
- الحالة الأخيرة: دخول العناية المركزة بسبب ارتشاح رئوي قلبي (Cardiogenic Pulmonary Edema) وفشل تنفسي من النوع الأول.
- ملاحظات هامة: 
  * يمنع تماماً تناول دواء Neophilin (يسبب إجهاد للقلب).
  * يعاني من متلازمة قلبي-كلوية (تأثر الكلى بضعف القلب).
  * تاريخ من نقص الأكسجين (يحتاج متابعة SPO2 بدقة).
  * يتناول مميعات دم (Eliquis, Plavix) مما يزيد خطر النزيف.`;

// نظام الأكل المخصص للحالة
export const DIET_GUIDELINES = `🥗 نظام الأكل المخصص (قلب + رئة + ضغط + كُلى)

✅ الأكل المسموح:
- الفطار: عيش سن/بلدي (نصف رغيف)، بيضة مسلوقة، جبنة قريش، فول خفيف، زبادي لايت، شاي/قهوة خفيفة.
- الغداء: فراخ مسلوقة/مشوية، سمك مشوي (مرتين أسبوعياً)، لحمة حمراء مسلوقة (مرة أسبوعياً).
- الخضار: كوسة، فاصوليا خضراء، بسلة، جزر.
- الفاكهة (1-2 ثمرة): تفاح، كمثرى، برتقال، نصف موزة.
- السوائل: مياه 1.5 لتر يومياً.

❌ الممنوعات:
- ملح زيادة، مخللات، جبن قديمة/رومي.
- مقليات، كبدة، مخ، سمنة، شوربة لحمة ثقيلة.
- مشروبات غازية، عرقسوس.

⚠️ ملاحظات:
- الملح: أقل شيء ممكن.
- الطهي: مسلوق، مشوي، أو في الفرن فقط.
- 5 وجبات صغيرة أفضل من وجبتين كبار.
- النوم بعد الأكل مباشرة ممنوع.`;

export const MEDICATIONS: Medication[] = [
  { 
    id: 'examide', name: 'Examide 20 mg', dosage: 'قرص واحد', timeSlot: 'morning-fasting', 
    notes: 'مدر للبول - على معدة فارغة', isCritical: false, frequencyLabel: '7:00 صباحاً', category: 'other',
    sideEffects: ['دوخة', 'جفاف الفم', 'تشنج عضلات']
  },
  { 
    id: 'norvasc', name: 'Norvasc 10 mg', dosage: 'قرص واحد', timeSlot: 'morning-fasting', 
    notes: 'لضغط الدم', isCritical: false, frequencyLabel: '7:00 صباحاً', category: 'pressure',
    sideEffects: ['تورم القدمين', 'صداع', 'إرهاق']
  },
  { 
    id: 'contorloc', name: 'Contorloc 40 mg', dosage: 'قرص واحد', timeSlot: 'morning-fasting', 
    notes: 'لحموضة المعدة', isCritical: false, frequencyLabel: '7:00 صباحاً', category: 'stomach',
    sideEffects: ['إسهال', 'ألم بطن']
  },
  { 
    id: 'corvid', name: 'Corvid 6.25 mg', dosage: 'نصف قرص', timeSlot: 'morning-fasting', 
    notes: 'لضغط الدم والقلب', isCritical: false, frequencyLabel: '7:00 صباحاً', category: 'pressure',
    sideEffects: ['تباطؤ نبض القلب', 'دوخة عند الوقوف']
  },
  { 
    id: 'aldomet-1', name: 'Aldomet 250 mg', dosage: 'قرصين', timeSlot: 'after-breakfast', 
    notes: 'الجرعة الأولى (كل 8 ساعات)', isCritical: false, frequencyLabel: '9:00 صباحاً', category: 'pressure',
    sideEffects: ['نعاس', 'ضعف عام', 'جفاف فم']
  },
  { 
    id: 'eliquis-1', name: 'Eliquis 2.5 mg', dosage: 'قرص واحد', timeSlot: 'after-breakfast', 
    notes: 'مميع للدم - خطر نزيف', isCritical: true, frequencyLabel: '9:00 صباحاً', category: 'blood-thinner',
    sideEffects: ['نزيف لثة', 'كدمات زرقاء', 'نزيف أنف']
  },
  { 
    id: 'acetyl-1', name: 'Acetyl Cysteine', dosage: 'كيس واحد', timeSlot: 'after-breakfast', 
    notes: 'مذيب للبلغم', isCritical: false, frequencyLabel: '9:00 صباحاً', category: 'other',
    sideEffects: ['غثيان']
  },
  { 
    id: 'forxiga', name: 'Forxiga 10 mg', dosage: 'قرص واحد', timeSlot: 'before-lunch', 
    notes: 'للسكري - اشرب مياه كافية', isCritical: false, frequencyLabel: '2:00 ظهراً', category: 'diabetes',
    sideEffects: ['تبول متكرر', 'عطش شديد']
  },
  { 
    id: 'eraloner', name: 'Eraloner 25 mg', dosage: 'قرص واحد', timeSlot: 'afternoon', 
    notes: 'مضاد للاكتئاب/القلق', isCritical: false, frequencyLabel: '5:00 عصراً', category: 'other',
    sideEffects: ['جفاف فم', 'نعاس', 'تعرق']
  },
  { 
    id: 'aldomet-2', name: 'Aldomet 250 mg', dosage: 'قرصين', timeSlot: 'afternoon', 
    notes: 'الجرعة الثانية (بعد 8 ساعات)', isCritical: false, frequencyLabel: '5:00 عصراً', category: 'pressure'
  },
  { 
    id: 'cardura', name: 'Cardura 4 mg', dosage: 'قرص واحد', timeSlot: '6pm', 
    notes: 'لضغط الدم', isCritical: false, frequencyLabel: '6:00 مساءً', category: 'pressure',
    sideEffects: ['دوخة', 'خفقان قلب']
  },
  { 
    id: 'plavix', name: 'Plavix 75 mg', dosage: 'قرص واحد', timeSlot: 'after-dinner', 
    notes: 'مميع للدم - خطر نزيف عالي', isCritical: true, frequencyLabel: '8:00 مساءً', category: 'blood-thinner',
    sideEffects: ['نزيف طويل من الجروح', 'كدمات']
  },
  { 
    id: 'lipitor', name: 'Lipitor 40 mg', dosage: 'قرص واحد', timeSlot: 'after-dinner', 
    notes: 'للكوليسترول', isCritical: false, frequencyLabel: '8:00 مساءً', category: 'other',
    sideEffects: ['ألم عضلات', 'تعب']
  },
  { 
    id: 'spiriva', name: 'Spiriva 18 mcg', dosage: 'بخة واحدة', timeSlot: 'after-dinner', 
    notes: 'بخاخة استنشاق', isCritical: false, frequencyLabel: '8:00 مساءً', category: 'other',
    sideEffects: ['جفاف حلق']
  },
  { 
    id: 'eliquis-2', name: 'Eliquis 2.5 mg', dosage: 'قرص واحد', timeSlot: 'before-bed', 
    notes: 'الجرعة المسائية', isCritical: true, frequencyLabel: '10:00 مساءً', category: 'blood-thinner'
  },
  { 
    id: 'aldomet-3', name: 'Aldomet 250 mg', dosage: 'قرصين', timeSlot: 'before-bed', 
    notes: 'الجرعة الثالثة والأخيرة', isCritical: false, frequencyLabel: '10:00 مساءً', category: 'pressure'
  },
  { 
    id: 'acetyl-2', name: 'Acetyl Cysteine', dosage: 'كيس واحد', timeSlot: 'before-bed', 
    notes: 'الجرعة المسائية', isCritical: false, frequencyLabel: '10:00 مساءً', category: 'other'
  },
];

export const CATEGORY_COLORS: Record<string, string> = {
  'pressure': 'text-blue-600',
  'diabetes': 'text-green-600',
  'blood-thinner': 'text-red-600',
  'antibiotic': 'text-purple-600',
  'stomach': 'text-orange-600',
  'other': 'text-slate-600'
};

export const SLOT_HOURS: Record<TimeSlot, number> = {
  'morning-fasting': 7,
  'after-breakfast': 9,
  'before-lunch': 14,
  'after-lunch': 15,
  'afternoon': 17,
  '6pm': 18,
  'after-dinner': 20,
  'before-bed': 22,
};

export const TIME_SLOT_CONFIG: Record<TimeSlot, { label: string, icon: React.ReactElement, color: string }> = {
  'morning-fasting': { label: 'الصباح على الريق', icon: <Sun className="w-5 h-5" />, color: 'bg-yellow-50 border-yellow-200' },
  'after-breakfast': { label: 'بعد الفطار', icon: <Coffee className="w-5 h-5" />, color: 'bg-orange-50 border-orange-200' },
  'before-lunch': { label: 'قبل الغداء', icon: <Utensils className="w-5 h-5" />, color: 'bg-green-50 border-green-200' },
  'after-lunch': { label: 'بعد الغداء', icon: <Utensils className="w-5 h-5" />, color: 'bg-blue-50 border-blue-200' },
  'afternoon': { label: 'العصر', icon: <CloudSun className="w-5 h-5" />, color: 'bg-indigo-50 border-indigo-200' },
  '6pm': { label: 'الساعة 6 مساءً', icon: <Clock className="w-5 h-5" />, color: 'bg-purple-50 border-purple-200' },
  'after-dinner': { label: 'بعد العشاء', icon: <Moon className="w-5 h-5" />, color: 'bg-slate-50 border-slate-200' },
  'before-bed': { label: 'قبل النوم', icon: <Bed className="w-5 h-5" />, color: 'bg-cyan-50 border-cyan-200' },
};

export const SYMPTOMS = [
  'صداع', 'دوخة', 'غثيان', 'تعب عام', 'ضيق تنفس', 'آلام صدر', 'كحة', 'وجع مفاصل', 'زغللة عين', 'إسهال', 'تورم قدمين', 'نزيف لثة', 'كدمات'
];
