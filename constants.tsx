
import React from 'react';
import { Medication, TimeSlot } from './types';
import { Sun, Coffee, Utensils, CloudSun, Clock, Moon, Bed } from 'lucide-react';

export const MEDICAL_HISTORY_SUMMARY = '';
 
export const DIET_GUIDELINES = '';
 
export const MEDICATIONS: Medication[] = [];

export const CATEGORY_COLORS: Record<string, string> = {
  'pressure': 'text-blue-600',
  'diabetes': 'text-green-600',
  'blood-thinner': 'text-red-600',
  'antibiotic': 'text-purple-600',
  'stomach': 'text-orange-600',
  'other': 'text-slate-600'
};

export const SLOT_HOURS: Record<TimeSlot, string> = {
  'morning-fasting': '07:00',
  'after-breakfast': '09:00',
  'before-lunch': '14:00',
  'after-lunch': '15:00',
  'afternoon': '17:00',
  '6pm': '18:00',
  'after-dinner': '20:00',
  'before-bed': '22:00',
};

export const TIME_SLOT_CONFIG: Record<TimeSlot, { label: string, icon: React.ReactElement, color: string }> = {
  'morning-fasting': { label: 'الصباح على الريق', icon: <Sun className="w-5 h-5" />, color: 'bg-yellow-50 border-yellow-200' },
  'after-breakfast': { label: 'بعد الفطار', icon: <Coffee className="w-5 h-5" />, color: 'bg-orange-50 border-orange-200' },
  'before-lunch': { label: 'قبل الغداء', icon: <Utensils className="w-5 h-5" />, color: 'bg-green-50 border-green-200' },
  'after-lunch': { label: 'بعد الغداء', icon: <Utensils className="w-5 h-5" />, color: 'bg-blue-50 border-blue-200' },
  'afternoon': { label: 'العصر', icon: <CloudSun className="w-5 h-5" />, color: 'bg-indigo-50 border-indigo-200' },
  '6pm': { label: 'مساءً', icon: <Clock className="w-5 h-5" />, color: 'bg-purple-50 border-purple-200' },
  'after-dinner': { label: 'بعد العشاء', icon: <Moon className="w-5 h-5" />, color: 'bg-slate-50 border-slate-200' },
  'before-bed': { label: 'قبل النوم', icon: <Bed className="w-5 h-5" />, color: 'bg-cyan-50 border-cyan-200' },
};

export const SYMPTOMS = [
  'صداع', 'دوخة', 'غثيان', 'تعب عام', 'ضيق تنفس', 'آلام صدر', 'كحة', 'وجع مفاصل', 'زغللة عين', 'إسهال', 'تورم قدمين', 'نزيف لثة', 'كدمات'
];
