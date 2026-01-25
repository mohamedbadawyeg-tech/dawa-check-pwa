
export type TimeSlot = 
  | 'morning-fasting' 
  | 'after-breakfast' 
  | 'before-lunch' 
  | 'after-lunch' 
  | 'afternoon' 
  | '6pm' 
  | 'after-dinner' 
  | 'before-bed';

export interface Medication {
  id: string;
  name: string;
  dosage: string;
  timeSlot: TimeSlot;
  notes: string;
  isCritical: boolean;
  frequencyLabel: string;
  category?: 'pressure' | 'diabetes' | 'blood-thinner' | 'antibiotic' | 'stomach' | 'other';
  sideEffects?: string[]; 
  stock?: number;
  refillUnit?: 'strip' | 'box' | 'bottle' | 'other';
}

export interface HealthReport {
  date: string;
  healthRating: number;
  painLevel: number;
  sleepQuality: 'good' | 'fair' | 'poor' | '';
  appetite: 'good' | 'fair' | 'poor' | '';
  symptoms: string[];
  otherSymptoms?: string;
  notes: string;
  additionalNotes?: string;
  systolicBP?: number;
  diastolicBP?: number;
  bloodSugar?: number;
  oxygenLevel?: number;
  heartRate?: number;
  waterIntake?: number;
  mood?: 'happy' | 'calm' | 'anxious' | 'sad' | '';
  aiDietPlan?: string;
}

export interface LabTest {
  id: string;
  name: string;
  date: string;
  result: string;
  notes?: string;
}

export interface LabTest {
  id: string;
  name: string;
  date: string;
  result: string;
  notes?: string;
}

export interface DayHistory {
  report: HealthReport;
  takenMedications: Record<string, boolean>;
  summary?: string;
}

export interface Procedure {
  id: string;
  text: string;
  date: string;
  completed: boolean;
}

export interface Diagnosis {
  id: string;
  condition: string;
  date: string;
  doctorName: string;
  notes?: string;
}

export interface Message {
  id: string;
  sender: string;
  message: string;
  timestamp: number;
}

export interface AppState {
  patientName: string;
  patientAge: number;
  patientLocation?: string;
  patientGender?: 'male' | 'female';
  patientId: string;
  caregiverMode: boolean;
  caregiverTargetId: string | null;
  syncCode?: string;
  slotHours: Record<TimeSlot, string>;
  aiSubscriptionActive?: boolean;
  medications: Medication[];
  takenMedications: Record<string, boolean>;
  notificationsEnabled: boolean;
  mandatoryRemindersEnabled?: boolean;
  pharmacyPhone?: string;
  sentNotifications: string[];
  customReminderTimes: Record<string, string>;
  darkMode?: boolean;
  lastDailyTipDate?: string; // تتبع تاريخ آخر نصيحة
  dailyTipContent?: string; // محتوى النصيحة الحالية
  history: Array<{
    date: string;
    action: string;
    details: string;
    timestamp: string;
  }>;
  dailyReports: Record<string, DayHistory>; 
  currentReport: HealthReport;
  medicalHistorySummary: string;
  dietGuidelines: string;
  upcomingProcedures: Procedure[]; 
  diagnoses?: Diagnosis[];
  labTests?: LabTest[];
  pharmacyPhone?: string; // Add pharmacy phone number
  doctorPhone?: string; // Add doctor phone number
  bloodType?: string; // Add blood type
  caregiverHistory?: Array<{ id: string; name: string; lastUsed: string }>;
  familyChat?: Array<{ id: string; sender: string; message: string; timestamp: number }>; // Family chat messages
  aiAnalysisResult?: AIAnalysisResult;
  labTestsDraft?: {
    id?: string;
    name?: string;
    date?: string;
    result?: string;
    notes?: string;
  };
  remoteReminder?: {
    timestamp: number;
    medName: string;
  };
  familyMessages?: Message[];
}

export interface AIAnalysisResult {
  summary: string;
  recommendations: string[];
  warnings: string[];
  positivePoints: string[];
  foodInteractions: string[];
  allowedFoods: string[];
  potentialSideEffects?: string[];
}
