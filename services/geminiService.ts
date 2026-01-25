
import { GoogleGenAI, Type } from "@google/genai";
import { AppState, AIAnalysisResult, TimeSlot, Medication } from "../types";
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
  
  const diagnosisText = state.diagnoses && state.diagnoses.length > 0
    ? state.diagnoses.map(d => `- ${d.condition} (${d.date})`).join(', ')
    : '';

  const labsText = state.labTests && state.labTests.length > 0
    ? state.labTests.filter(t => t).map(t => `- ${t?.name || 'تحليل'}: ${t?.result || ''} (بتاريخ ${t?.date || 'غير محدد'})`).join('\n')
    : 'لا توجد تحاليل مسجلة';

  const prompt = `
    أنت مساعد طبي مصري حنون للحالات المعقدة (قلب، كلى، ضغط).
    بيانات المريض الأساسية:
    - الاسم: ${state.patientName}
    - السن: ${state.patientAge || 'غير مسجل'}
    - النوع: ${state.patientGender === 'male' ? 'ذكر' : (state.patientGender === 'female' ? 'أنثى' : 'غير محدد')}

    خلفية عن حالته المزمنة: ${state.medicalHistorySummary}.
    التشخيصات المسجلة: ${diagnosisText}
    نظام الأكل الصحي الموصوف له: ${state.dietGuidelines}.
    
    آخر التحاليل الطبية:
    ${labsText}

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
    - السن والنوع (إذا كانا مؤثرين).
    - تقرير اليوم الحالي.
    - نظام الأكل الصحي الموصوف له.
    - ملخص حالته الطبية المزمنة وتحاليله الأخيرة.
    - حالة التزامه بالأدوية اليوم.

    الشروط:
    1. لهجة مصرية حنونة وبسيطة جداً، بدون فصحى ثقيلة.
    2. نادِ المريض بلقب يناسب سنه (يا بطل/آنسة للشباب تحت 40، يا أستاذ/أستاذة للوسط، يا حاج/حاجة للكبار فوق 60).
    3. اذكر اسم المريض داخل الجملة مرة واحدة بشكل لطيف.
    4. لا تتجاوز 14 كلمة.
    5. ركز على نقطة واحدة فقط تختارها أنت من البيانات السابقة (ماء، ملح، حركة، نوم، نفسية، التزام بالدواء، نتيجة تحليل).
    6. اجعل النبرة مشجعة ومطمئنة وليست مخيفة أو مليئة بالتحذير.
    7. لا تذكر أدوية معينة بالاسم التجاري.

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
  const key = (process.env.API_KEY && process.env.API_KEY !== 'PLACEHOLDER_API_KEY') 
    ? process.env.API_KEY 
    : API_KEY;
  const ai = new GoogleGenAI({ apiKey: key });
  const report = state.currentReport;

  const medications = state.medications || [];
  const takenMeds = medications.filter(m => state.takenMedications[m.id]);
  const takenMedsNames = takenMeds.map(m => m.name);
  const labTests = state.labTests || [];
  const labsText = labTests.length
    ? labTests.slice(0, 5).map(t => `- ${t?.name || 'تحليل'}: ${t?.result || ''} (التاريخ: ${t?.date || 'غير محدد'})`).join('\n')
    : 'لا توجد تحاليل مخبرية مسجلة حديثاً';
  
  const diagnosisText = state.diagnoses && state.diagnoses.length > 0
    ? state.diagnoses.map(d => `- ${d.condition}`).join(', ')
    : 'لا توجد تشخيصات مسجلة';

  const currentHour = new Date().getHours();
  const missedMeds = medications.filter(m => {
    const slotHour = state.timeSlotSettings?.[m.timeSlot]?.hour ?? SLOT_HOURS[m.timeSlot as TimeSlot];
    return !state.takenMedications[m.id] && currentHour > slotHour;
  });

  const vitalsText = `
    - ضغط الدم: ${report.systolicBP || '--'}/${report.diastolicBP || '--'}
    - سكر الدم: ${report.bloodSugar || '--'} mg/dL
    - نسبة الأكسجين: ${report.oxygenLevel || '--'}%
    - نبض القلب: ${report.heartRate || '--'} نبضة/دقيقة
    - كمية الماء: ${report.waterIntake || 0} أكواب
  `;

  const prompt = `
    أنت مساعد طبي ذكي متخصص في إدارة اي حالة مرضية وفقا لمدخلات المستخدم 
    مهمتك هي تحليل حالة المريض بشكل شامل يربط بين جميع بياناته الطبية والغذائية والدوائية.
    
    البيانات المدخلة:
    1. بيانات المريض:
       - الاسم: ${state.patientName}
       - العمر: ${state.patientAge}
       - التشخيص الطبي الأخير: ${state.medicalHistorySummary}
       - قائمة التشخيصات المسجلة:
       ${diagnosisText}
       - التاريخ المرضي: ${state.medicalHistorySummary}
    
    2. النظام الغذائي:
       - التعليمات المتبعة: ${state.dietGuidelines}
    
    3. العلامات الحيوية (اليوم):
       ${vitalsText}
    
    4. حالة الأدوية:
       - الأدوية التي تم تناولها: ${takenMedsNames.join(', ') || 'لم يتم تسجيل أدوية بعد'}
       - الأدوية المتأخرة: ${missedMeds.map(m => m.name).join(', ') || 'لا يوجد تأخير'}
    
    5. الأعراض والتحاليل:
       - الأعراض الحالية: ${report.symptoms.join(', ') || 'لا توجد'}
       - نتائج التحاليل الأخيرة:
       ${labsText}
    
    المطلوب منك بدقة (المخرجات):
    1. تحليل شامل: اربط بين القراءات الحالية، التاريخ المرضي، ونظام الأكل. هل هناك علاقة بين ما أكله المريض وبين ارتفاع الضغط أو السكر اليوم؟
    2. تحذير عاجل: نبه فوراً إذا كانت القراءات (خاصة الأكسجين والضغط) تشير لبوادر ارتشاح رئوي أو خطر وشيك.
    3. التفاعلات الغذائية الدوائية (هام جداً): اذكر بدقة أي تعارض بين أدويته الحالية وبين أنواع معينة من الطعام (مثل: مدرات البول والبرتقال/الموز، أو الورفارين والورقيات).
    4. الأطعمة المسموحة: اقترح قائمة أطعمة مفيدة جداً وآمنة لحالته الصحية الحالية بناءً على تحاليله.
    5. الدعم النفسي: وجه رسالة طمأنة قصيرة بلهجة مصرية حنونة.
    
    شروط الإجابة:
    - يجب أن تكون المخرجات بتنسيق JSON دقيق يحتوي على الحقول: (summary, recommendations, warnings, positivePoints, foodInteractions, allowedFoods).
    - اللهجة: طبية مبسطة ومفهومة للمريض العربي.
  `;

  const response = await ai.models.generateContent({
    model: "gemini-1.5-flash",
    contents: prompt,
    config: {
      responseMimeType: "application/json",
      responseSchema: {
        type: Type.OBJECT,
        properties: {
          summary: { type: Type.STRING, description: "تحليل شامل يربط بين القراءات والتاريخ المرضي" },
          recommendations: { type: Type.ARRAY, items: { type: Type.STRING }, description: "نصائح طبية وعلاجية" },
          warnings: { type: Type.ARRAY, items: { type: Type.STRING }, description: "تحذيرات عاجلة عند الخطر" },
          positivePoints: { type: Type.ARRAY, items: { type: Type.STRING }, description: "رسالة طمأنة ودعم نفسي" },
          foodInteractions: { type: Type.ARRAY, items: { type: Type.STRING }, description: "تفاعلات غذائية دوائية هامة" },
          allowedFoods: { type: Type.ARRAY, items: { type: Type.STRING }, description: "قائمة أطعمة مسموحة ومفيدة" }
        },
        required: ["summary", "recommendations", "warnings", "positivePoints", "foodInteractions", "allowedFoods"]
      }
    }
  });

  const text = response.text;
  if (!text) throw new Error("AI response was empty");
  
  try {
    const cleanText = text.replace(/```json\n?|\n?```/g, "").trim();
    return JSON.parse(cleanText) as AIAnalysisResult;
  } catch (e) {
    console.error("Failed to parse JSON:", text);
    throw new Error("Invalid AI output format");
  }
};

export const generateDietPlan = async (state: AppState): Promise<string> => {
  const key = (process.env.API_KEY && process.env.API_KEY !== 'PLACEHOLDER_API_KEY') 
    ? process.env.API_KEY 
    : API_KEY;
  const ai = new GoogleGenAI({ apiKey: key });

  const diagnosisText = state.diagnoses && state.diagnoses.length > 0
    ? state.diagnoses.map(d => `- ${d.condition}`).join(', ')
    : 'لا توجد تشخيصات مسجلة';

  const prompt = `
    أنت خبير تغذية علاجي متخصص.
    المريض: ${state.patientName} (${state.patientAge} سنة).
    التشخيصات: ${state.medicalHistorySummary}, ${diagnosisText}.
    تعليمات غذائية حالية: ${state.dietGuidelines}.
    
    المطلوب:
    اكتب خطة غذائية ليوم واحد (إفطار، غداء، عشاء، وجبة خفيفة) تناسب حالته الصحية تماماً.
    - راعِ أي أمراض مزمنة (ضغط، سكر، كلى).
    - استخدم أطعمة مصرية/عربية متوفرة.
    - اكتب النتيجة كنص منظم ومختصر (Markdown) بدون مقدمات طويلة.
  `;

  try {
    const response = await ai.models.generateContent({
      model: "gemini-1.5-flash",
      contents: prompt,
      config: { temperature: 0.7 }
    });
    return response.text.trim() || "يرجى استشارة الطبيب لتحديد النظام الغذائي المناسب.";
  } catch (e) {
    console.error("Diet generation failed", e);
    return "لا يمكن توليد النظام الغذائي حالياً.";
  }
};

export const generateMedicationPlanFromText = async (rawInput: string): Promise<Medication[]> => {
  const key = (process.env.API_KEY && process.env.API_KEY !== 'PLACEHOLDER_API_KEY') 
    ? process.env.API_KEY 
    : API_KEY;
  const ai = new GoogleGenAI({ apiKey: key });

  const prompt = `
    المستخدم أدخل وصفاً للأدوية والجرعات ومواعيدها باللغة العربية أو الإنجليزية.
    المطلوب:
    1. استخرج قائمة الأدوية بشكل منظم.
    2. لكل دواء حدد:
       - name: الاسم كما هو مكتوب تقريباً.
       - dosage: وصف الجرعة النصي (مثال: قرص واحد، نصف قرص).
       - timeSlot: واحد فقط من القيم التالية:
         "morning-fasting", "after-breakfast", "before-lunch", "after-lunch", "afternoon", "6pm", "after-dinner", "before-bed".
       - frequencyLabel: وصف الوقت بشكل مفهوم للمريض (مثال: 7:00 صباحاً، 8:00 مساءً).
       - notes: ملاحظة قصيرة إن وُجدت.
       - category: واحدة من "pressure", "diabetes", "blood-thinner", "antibiotic", "stomach", "other".
       - isCritical: true إذا كان دواءً لا يجب تفويته، وإلا false.

    الشروط:
    - التزم تماماً بقيم timeSlot المذكورة أعلاه.
    - أعد فقط JSON بالصيغة المحددة بدون أي نص خارج JSON.

    النص الذي كتبه المستخدم:
    ${rawInput}
  `;

  const response = await ai.models.generateContent({
    model: "gemini-1.5-flash",
    contents: prompt,
    config: {
      responseMimeType: "application/json",
      responseSchema: {
        type: Type.ARRAY,
        items: {
          type: Type.OBJECT,
          properties: {
            name: { type: Type.STRING },
            dosage: { type: Type.STRING },
            timeSlot: { type: Type.STRING, enum: ["morning-fasting", "after-breakfast", "before-lunch", "after-lunch", "afternoon", "6pm", "after-dinner", "before-bed"] },
            frequencyLabel: { type: Type.STRING },
            notes: { type: Type.STRING },
            category: { type: Type.STRING, enum: ["pressure", "diabetes", "blood-thinner", "antibiotic", "stomach", "other"] },
            isCritical: { type: Type.BOOLEAN }
          },
          required: ["name", "dosage", "timeSlot", "frequencyLabel", "category", "isCritical"]
        }
      }
    }
  });

  const text = response.text;
  if (!text) throw new Error("AI response was empty");
  return JSON.parse(text) as Medication[];
};

export const generateMedicationPlanFromImage = async (base64Image: string): Promise<Medication[]> => {
  const key = (process.env.API_KEY && process.env.API_KEY !== 'PLACEHOLDER_API_KEY') 
    ? process.env.API_KEY 
    : API_KEY;
  const ai = new GoogleGenAI({ apiKey: key });

  const prompt = `
    أنت صيدلي خبير. قم بتحليل صورة الروشتة أو عبوة الدواء هذه بدقة عالية.
    استخرج جميع الأدوية المذكورة في الصورة.
    
    لكل دواء، حدد ما يلي:
    1. الاسم (name): الاسم العلمي أو التجاري الواضح.
    2. الجرعة (dosage): التركيز أو عدد الأقراص (مثال: 500mg, 1 tablet).
    3. الموعد (timeSlot): خمن الموعد المناسب بناءً على التعليمات (مثال: "صباحاً" -> morning-fasting, "بعد الغداء" -> after-lunch). اختر أقرب قيمة من القائمة القياسية.
    4. التكرار (frequencyLabel): وصف نصي للتكرار (مثال: مرة يومياً بعد الإفطار).
    5. ملاحظات (notes): أي تعليمات إضافية.
    6. الفئة (category): صنف الدواء (pressure, diabetes, blood-thinner, antibiotic, stomach, other).
    7. هل هو حرج (isCritical): true لأدوية القلب والسكر والضغط والسيولة.

    قائمة TimeSlot المسموحة:
    morning-fasting, after-breakfast, before-lunch, after-lunch, afternoon, 6pm, after-dinner, before-bed

    أعد النتيجة بصيغة JSON Array فقط.
  `;

  const response = await ai.models.generateContent({
    model: "gemini-1.5-flash",
    contents: [
      { text: prompt },
      { inlineData: { mimeType: "image/jpeg", data: base64Image } }
    ],
    config: {
      responseMimeType: "application/json",
      responseSchema: {
        type: Type.ARRAY,
        items: {
          type: Type.OBJECT,
          properties: {
            name: { type: Type.STRING },
            dosage: { type: Type.STRING },
            timeSlot: { type: Type.STRING, enum: ["morning-fasting", "after-breakfast", "before-lunch", "after-lunch", "afternoon", "6pm", "after-dinner", "before-bed"] },
            frequencyLabel: { type: Type.STRING },
            notes: { type: Type.STRING },
            category: { type: Type.STRING, enum: ["pressure", "diabetes", "blood-thinner", "antibiotic", "stomach", "other"] },
            isCritical: { type: Type.BOOLEAN }
          },
          required: ["name", "dosage", "timeSlot", "frequencyLabel", "category", "isCritical"]
        }
      }
    }
  });

  const text = response.text;
  if (!text) throw new Error("AI response was empty");
  return JSON.parse(text) as Medication[];
};

export const checkDrugInteractions = async (newMedName: string, currentMeds: Medication[]): Promise<{ hasInteraction: boolean; warning?: string }> => {
  if (!currentMeds || currentMeds.length === 0) return { hasInteraction: false };
  
  const key = (process.env.API_KEY && process.env.API_KEY !== 'PLACEHOLDER_API_KEY') 
    ? process.env.API_KEY 
    : API_KEY;
  const ai = new GoogleGenAI({ apiKey: key });

  const medList = currentMeds.map(m => m.name).join(', ');

  const prompt = `
    أنت صيدلي خبير. المريض يتناول الأدوية التالية:
    ${medList}
    
    ويريد إضافة دواء جديد: "${newMedName}".
    
    هل يوجد تداخل دوائي خطير (Major/Moderate Interaction) بين الدواء الجديد وأي من الأدوية الحالية؟
    
    المطلوب:
    - أجب بـ JSON يحتوي على:
      1. hasInteraction: boolean (true في حالة وجود تعارض خطير فقط).
      2. warning: رسالة تحذيرية قصيرة وواضحة جداً بالعربية تشرح التعارض (فقط إن وجد).
    
    مثال للإجابة:
    { "hasInteraction": true, "warning": "تحذير: تناول الأسبرين مع الوارفارين قد يزيد خطر النزيف." }
  `;

  try {
    const response = await ai.models.generateContent({
      model: "gemini-1.5-flash",
      contents: prompt,
      config: {
        responseMimeType: "application/json",
        responseSchema: {
          type: Type.OBJECT,
          properties: {
            hasInteraction: { type: Type.BOOLEAN },
            warning: { type: Type.STRING }
          },
          required: ["hasInteraction"]
        }
      }
    });

    const text = response.text;
    if (!text) return { hasInteraction: false };
    return JSON.parse(text);
  } catch (e) {
    console.error("Interaction check failed", e);
    return { hasInteraction: false };
  }
};
