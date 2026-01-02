
import { GoogleGenAI, Type } from "@google/genai";
import { AppState, AIAnalysisResult, TimeSlot } from "../types";
import { SLOT_HOURS } from "../constants";
import { API_KEY } from "./firebaseService";

export const generateDailyHealthTip = async (state: AppState): Promise<string> => {
  const key = (process.env.API_KEY && process.env.API_KEY !== 'PLACEHOLDER_API_KEY') 
    ? process.env.API_KEY 
    : API_KEY;
  const ai = new GoogleGenAI({ apiKey: key });
  
  const prompt = `
    أنت مساعد طبي خبير للحالات المعقدة (قلب، كلى، ضغط).
    بناءً على ملف المريض: ${state.medicalHistorySummary} 
    ونظامه الغذائي: ${state.dietGuidelines}
    
    اكتب "نصيحة اليوم" لهذا المريض. 
    الشروط:
    1. لغة عربية حنونة وبسيطة.
    2. لا تتجاوز 12 كلمة (يجب أن تظهر كاملة في إشعار الموبايل).
    3. ركز على شيء واحد (الماء، الملح، الحركة، أو الحالة النفسية).
    4. لا تذكر نصائح عامة، اجعلها مرتبطة بمرضه (مثلاً: تنبيه عن الملح لمريض الضغط).
    
    أجب بالنصيحة فقط بدون مقدمات.
  `;

  try {
    const response = await ai.models.generateContent({
      model: "gemini-3-flash-preview",
      contents: prompt,
      config: { temperature: 0.7 }
    });
    return response.text.trim() || "تذكر شرب الماء بانتظام للحفاظ على صحة كليتيك.";
  } catch (e) {
    return "ابتعد عن الملح والتوتر اليوم من أجل راحة قلبك.";
  }
};

export const analyzeHealthStatus = async (state: AppState): Promise<AIAnalysisResult> => {
  const ai = new GoogleGenAI({ apiKey: process.env.API_KEY });
  
  const report = state.currentReport;
  const medications = state.medications || [];
  const takenMeds = medications.filter(m => state.takenMedications[m.id]);
  const takenMedsNames = takenMeds.map(m => m.name);
  
  const currentHour = new Date().getHours();
  const missedMeds = medications.filter(m => {
    const slotHour = SLOT_HOURS[m.timeSlot as TimeSlot];
    return !state.takenMedications[m.id] && currentHour > slotHour;
  });

  const vitalsText = `
    - ضغط الدم: ${report.systolicBP || '--'}/${report.diastolicBP || '--'}
    - سكر الدم: ${report.bloodSugar || '--'} mg/dL
    - نسبة الأكسجين: ${report.oxygenLevel || '--'}%
    - نبض القلب: ${report.heartRate || '--'} نبضة/دقيقة
    - الحالة المزاجية: ${report.mood || 'غير محدد'}
    - كمية شرب الماء اليوم: ${report.waterIntake || 0} أكواب
  `;

  const prompt = `
    أنت مساعد طبي ذكي متخصص في إدارة حالات القلب والكلى المعقدة لكبار السن. 
    حلل حالة المريض ${state.patientName} (العمر: ${state.patientAge}).

    خلفية طبية هامة جداً للمريض:
    ${state.medicalHistorySummary}
    
    نظام التغذية المتبع (يجب ربط التحليل به):
    ${state.dietGuidelines}

    البيانات الحيوية اليومية المسجلة الآن:
    ${vitalsText}

    الأدوية التي تم تناولها اليوم:
    ${takenMedsNames.join(', ') || 'لم يتم تسجيل أدوية بعد'}

    الأدوية التي تأخر المريض عن موعدها:
    ${missedMeds.map(m => m.name).join(', ') || 'لا يوجد تأخير'}

    الأعراض الحالية:
    - الأعراض المختارة: ${report.symptoms.join(', ') || 'لا توجد'}
    - أعراض إضافية كتبها المريض: ${report.otherSymptoms || 'لا يوجد'}

    المطلوب:
    1. تحليل شامل يربط القراءات الحالية بتاريخه الطبي ونظام أكله.
    2. التنبيه فوراً إذا كانت القراءات تشير لبوادر ارتشاح رئوي.
    3. تقديم نصيحة غذائية واحدة محددة بناءً على المدخلات.
    4. تقديم 3-5 توصيات عملية أخرى.
    5. طمأنة المريض بلهجة حنونة (باللغة العربية).
  `;

  const response = await ai.models.generateContent({
    model: "gemini-3-pro-preview",
    contents: prompt,
    config: {
      thinkingConfig: { thinkingBudget: 32768 },
      responseMimeType: "application/json",
      responseSchema: {
        type: Type.OBJECT,
        properties: {
          summary: { type: Type.STRING, description: "تحليل دقيق يربط بين التاريخ المرضي والتغذية والقراءات الحالية" },
          recommendations: { type: Type.ARRAY, items: { type: Type.STRING }, description: "نصائح طبية وغذائية مخصصة" },
          warnings: { type: Type.ARRAY, items: { type: Type.STRING }, description: "تحذيرات عاجلة" },
          positivePoints: { type: Type.ARRAY, items: { type: Type.STRING }, description: "كلمات دعم مشجعة" }
        },
        required: ["summary", "recommendations", "warnings", "positivePoints"]
      }
    }
  });

  const text = response.text;
  if (!text) throw new Error("AI response was empty");
  
  try {
    return JSON.parse(text) as AIAnalysisResult;
  } catch (e) {
    console.error("Failed to parse JSON:", text);
    throw new Error("Invalid AI output format");
  }
};
