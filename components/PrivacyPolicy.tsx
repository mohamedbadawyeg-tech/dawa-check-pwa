
import React from 'react';
import { X, ShieldCheck } from 'lucide-react';

interface PrivacyPolicyProps {
  isOpen: boolean;
  onClose: () => void;
}

const PrivacyPolicy: React.FC<PrivacyPolicyProps> = ({ isOpen, onClose }) => {
  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-[60] flex items-center justify-center bg-black/50 backdrop-blur-sm p-4">
      <div className="bg-white dark:bg-slate-900 w-full max-w-2xl rounded-3xl shadow-2xl flex flex-col max-h-[90vh]">
        <div className="p-4 border-b dark:border-slate-800 flex justify-between items-center bg-slate-50 dark:bg-slate-950 rounded-t-3xl">
          <div className="flex items-center gap-2">
            <ShieldCheck className="w-6 h-6 text-green-600" />
            <h2 className="text-xl font-black text-slate-800 dark:text-white">سياسة الخصوصية</h2>
          </div>
          <button onClick={onClose} className="p-2 hover:bg-slate-200 dark:hover:bg-slate-800 rounded-full transition-colors">
            <X className="w-6 h-6 text-slate-500" />
          </button>
        </div>
        
        <div className="p-6 overflow-y-auto custom-scrollbar text-right space-y-4 text-slate-600 dark:text-slate-300">
          <p className="font-bold">آخر تحديث: {new Date().toLocaleDateString('ar-EG')}</p>
          
          <section>
            <h3 className="text-lg font-black text-slate-900 dark:text-white mb-2">1. مقدمة</h3>
            <p>نحن في تطبيق "صحتي" نولي اهتماماً كبيراً لخصوصيتك. توضح هذه السياسة كيفية جمعنا واستخدامنا وحمايتنا لمعلوماتك الشخصية.</p>
          </section>

          <section>
            <h3 className="text-lg font-black text-slate-900 dark:text-white mb-2">2. البيانات التي نجمعها</h3>
            <ul className="list-disc list-inside space-y-1">
              <li>البيانات الصحية: الأدوية، القياسات الحيوية (الضغط، السكر)، الأعراض.</li>
              <li>الصور: صور الروشتات والتحاليل التي تقوم برفعها (تتم معالجتها فقط ولا يتم مشاركتها مع أطراف ثالثة للإعلان).</li>
              <li>بيانات الجهاز: نوع الجهاز ونظام التشغيل لتحسين الأداء.</li>
            </ul>
          </section>

          <section>
            <h3 className="text-lg font-black text-slate-900 dark:text-white mb-2">3. استخدام البيانات</h3>
            <p>نستخدم بياناتك لتقديم الخدمات التالية:</p>
            <ul className="list-disc list-inside space-y-1">
              <li>تذكيرك بمواعيد الدواء.</li>
              <li>تحليل حالتك الصحية وتقديم نصائح عبر الذكاء الاصطناعي.</li>
              <li>إنشاء تقارير صحية لمشاركتها مع طبيبك.</li>
            </ul>
          </section>

          <section>
            <h3 className="text-lg font-black text-slate-900 dark:text-white mb-2">4. الأذونات</h3>
            <p>يطلب التطبيق الأذونات التالية ليعمل بشكل صحيح:</p>
            <ul className="list-disc list-inside space-y-1">
              <li>الكاميرا: لتصوير الروشتات والتحاليل.</li>
              <li>الإشعارات: لإرسال تذكيرات الأدوية.</li>
              <li>الظهور فوق التطبيقات: لعرض التنبيهات الهامة.</li>
            </ul>
          </section>

          <section>
            <h3 className="text-lg font-black text-slate-900 dark:text-white mb-2">5. الأمان</h3>
            <p>نستخدم تقنيات تشفير متقدمة لحماية بياناتك المخزنة على جهازك أو أثناء الإرسال.</p>
          </section>

          <section>
            <h3 className="text-lg font-black text-slate-900 dark:text-white mb-2">6. حذف البيانات</h3>
            <p>يمكنك طلب حذف جميع بياناتك المسجلة في التطبيق في أي وقت من خلال إعدادات التطبيق أو التواصل معنا.</p>
          </section>

          <section>
            <h3 className="text-lg font-black text-slate-900 dark:text-white mb-2">7. اتصل بنا</h3>
            <p>إذا كان لديك أي استفسار، يرجى التواصل معنا عبر البريد الإلكتروني المخصص للدعم.</p>
          </section>
        </div>
      </div>
    </div>
  );
};

export default PrivacyPolicy;
