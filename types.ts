
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
}

export interface DayHistory {
  report: HealthReport;
  takenMedications: Record<string, boolean>;
  summary?: string;
}

export interface AppState {
  patientName: string;
  patientAge: number;
  patientId: string;
  caregiverMode: boolean;
  caregiverTargetId: string | null;
  medications: Medication[];
  takenMedications: Record<string, boolean>;
  notificationsEnabled: boolean;
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
  upcomingProcedures: string; 
  remoteReminder?: {
    timestamp: number;
    medName: string;
  };
}

export interface AIAnalysisResult {
  summary: string;
  recommendations: string[];
  warnings: string[];
  positivePoints: string[];
  potentialSideEffects?: string[];
}
