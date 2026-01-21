
import { GoogleGenAI, Type } from "@google/genai";
import { AppState, AIAnalysisResult, TimeSlot } from "../types";
import { SLOT_HOURS } from "../constants";
import { API_KEY } from "./firebaseService";

export const generateDailyHealthTip = async (state: AppState): Promise<string> => {
  const key = import.meta.env.VITE_GEMINI_API_KEY || API_KEY;
  const ai = new GoogleGenAI({ apiKey: key });

  const report = state.currentReport;
  const medications = state.medications || [];
  const takenCount = medications.filter(m => state.takenMedications[m.id]).length;
  const totalMeds = medications.length;
  const adherencePercent = totalMeds ? Math.round((takenCount / totalMeds) * 100) : 0;
  const currentHour = new Date().getHours();
  const missedMeds = medications.filter(m => {
    const slotHour = SLOT_HOURS[m.timeSlot as TimeSlot];
    return !state.takenMedications[m.id] && slotHour < currentHour;
  });
  const missedNames = missedMeds.map(m => m.name).join(', ');
  
  const prompt = `
    أنت مساعد طبي مصري حنون للحالات المعقدة (قلب، كلى، ضغط).
    اسم المريض: ${state.patientName}.
    خلفية عن حالته المزمنة: ${state.medicalHistorySummary}.
    نظام الأكل الصحي الموصوف له: ${state.dietGuidelines}.

    تقرير اليوم الحالي (يجب أن تعتمد عليه النصيحة):
    - تقييم الصحة العام اليوم: ${report.healthRating || '--'} من 10
    - مستوى الألم اليوم: ${report.painLevel || '--'} من 10
    - جودة النوم: ${report.sleepQuality || 'غير مسجلة'}
    - الشهية: ${report.appetite || 'غير مسجلة'}
    - الحالة المزاجية: ${report.mood || 'غير مسجلة'}
    - كمية شرب الماء: ${report.waterIntake || 0} أكواب
    - الأعراض المسجَّلة: ${report.symptoms.join(', ') || 'لا توجد أعراض مسجَّلة'}
    - ملاحظات إضافية: ${report.notes || report.additionalNotes || 'لا توجد ملاحظات مسجَّلة'}

    حالة الأدوية اليوم:
    - عدد الأدوية الموصوفة: ${totalMeds}
    - ما تم تناوله حتى الآن: ${takenCount}
    - نسبة الالتزام التقريبية: ${adherencePercent}%
    - الأدوية المتأخرة عن مواعيدها حتى الآن: ${missedNames || 'لا يوجد تأخير مسجَّل'}

    المطلوب:
    اكتب "نصيحة اليوم" قصيرة جداً للمريض ${state.patientName} تربط بين:
    - تقرير اليوم الحالي.
    - نظام الأكل الصحي الموصوف له.
    - ملخص حالته الطبية المزمنة.
    - حالة التزامه بالأدوية اليوم.

    الشروط:
    1. لهجة مصرية حنونة وبسيطة جداً، بدون فصحى ثقيلة.
    2. اذكر اسم المريض داخل الجملة مرة واحدة بشكل لطيف.
    3. لا تتجاوز 14 كلمة.
    4. ركز على نقطة واحدة فقط تختارها أنت من البيانات السابقة (ماء، ملح، حركة، نوم، نفسية، التزام بالدواء).
    5. اجعل النبرة مشجعة ومطمئنة وليست مخيفة أو مليئة بالتحذير.
    6. لا تذكر أدوية معينة بالاسم التجاري.

    أجب بالجملة نفسها فقط بدون أي شرح أو مقدمات أو علامات تنصيص.
  `;

  try {
    const response = await ai.models.generateContent({
      model: "gemini-1.5-flash",
      contents: prompt,
      config: { temperature: 0.7 }
    });
    return response.text.trim() || "تذكر شرب الماء بانتظام للحفاظ على صحة كليتيك.";
  } catch (e) {
    return "ابتعد عن الملح والتوتر اليوم من أجل راحة قلبك.";
  }
};

export const analyzeHealthStatus = async (state: AppState): Promise<AIAnalysisResult> => {
  const ai = new GoogleGenAI({ apiKey: import.meta.env.VITE_GEMINI_API_KEY || API_KEY });
  
  const report = state.currentReport;
  const medications = state.medications || [];
  const takenMeds = medications.filter(m => state.takenMedications[m.id]);
  const takenMedsNames = takenMeds.map(m => m.name);
  const labTests = state.labTests || [];
  const labsText = labTests.length
    ? labTests.map(t => `- ${t.name}: ${t.result} (التاريخ: ${t.date})`).join('\n')
    : 'لا توجد تحاليل مخبرية مسجلة حتى الآن';
  
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

    نتائج التحاليل المخبرية الأخيرة:
    ${labsText}

    المطلوب:
    1. تحليل شامل يربط القراءات الحالية بتاريخه الطبي ونظام أكله ونتائج التحاليل.
    2. التنبيه فوراً إذا كانت القراءات تشير لبوادر ارتشاح رئوي.
    3. تقديم نصيحة غذائية واحدة محددة بناءً على المدخلات.
    4. تقديم 3-5 توصيات عملية أخرى.
    5. طمأنة المريض بلهجة حنونة (باللغة العربية).
  `;

  const response = await ai.models.generateContent({
    model: "gemini-1.5-flash",
    contents: prompt,
    config: {
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
