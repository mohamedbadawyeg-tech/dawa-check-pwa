import React, { useState } from 'react';
import { X, ExternalLink, ShoppingBag } from 'lucide-react';
import { ScrollHint } from './ScrollHint';

interface PharmacyModalProps {
  isOpen: boolean;
  onClose: () => void;
}

export const PharmacyModal: React.FC<PharmacyModalProps> = ({ isOpen, onClose }) => {
  const [selectedCountry, setSelectedCountry] = useState<'EG' | 'SA' | 'AE'>('EG');

  React.useEffect(() => {
    if (isOpen) {
      try {
        const timeZone = Intl.DateTimeFormat().resolvedOptions().timeZone;
        if (timeZone.includes('Riyadh')) setSelectedCountry('SA');
        else if (timeZone.includes('Dubai') || timeZone.includes('Muscat')) setSelectedCountry('AE');
        else if (timeZone.includes('Cairo')) setSelectedCountry('EG');
      } catch (e) {
        console.error('Failed to detect country from timezone', e);
      }
    }
  }, [isOpen]);

  const pharmacies = {
    EG: [
      { name: 'Chefaa (شفاء)', url: 'https://chefaa.com/', description: 'توصيل الأدوية والروشتات في مصر' },
      { name: 'Noon (نون)', url: 'https://www.noon.com/egypt-ar/', description: 'منتجات العناية والصحة' },
      { name: 'Yodawy (يداوي)', url: 'https://www.yodawy.com/', description: 'صيدلية أونلاين وتأمين طبي' },
    ],
    SA: [
      { name: 'Chefaa (شفاء)', url: 'https://chefaa.com/', description: 'توصيل الأدوية في السعودية' },
      { name: 'Nahdi (النهدي)', url: 'https://www.nahdionline.com/', description: 'صيدلية النهدي أونلاين' },
      { name: 'Noon (نون)', url: 'https://www.noon.com/saudi-ar/', description: 'منتجات العناية والصحة' },
    ],
    AE: [
      { name: 'Life Pharmacy', url: 'https://www.lifepharmacy.com/', description: 'صيدلية لايف - الإمارات' },
      { name: 'Noon (نون)', url: 'https://www.noon.com/uae-ar/', description: 'منتجات العناية والصحة' },
      { name: 'InstaShop', url: 'https://instashop.com/', description: 'توصيل من الصيدليات القريبة' },
    ]
  };

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-[200] flex items-center justify-center p-4 bg-slate-900/95 backdrop-blur-xl animate-in fade-in duration-300">
      <div className="bg-white dark:bg-slate-900 w-full max-w-lg rounded-[3rem] shadow-2xl relative max-h-[90vh] flex flex-col overflow-hidden border-t-[14px] border-emerald-500">
        <div className="p-8 pb-5 border-b border-slate-100 dark:border-slate-800 flex items-center justify-between bg-emerald-50/40 dark:bg-emerald-900/10">
           <button onClick={onClose} className="p-3.5 bg-white dark:bg-slate-800 text-slate-800 dark:text-slate-200 rounded-2xl active:scale-90"><X className="w-7 h-7"/></button>
           <div className="text-right">
             <h2 className="text-2xl font-black text-slate-800 dark:text-white">طلب الأدوية</h2>
             <p className="text-emerald-600 dark:text-emerald-400 text-[10px] font-black uppercase mt-1">خدمات التوصيل المتاحة</p>
           </div>
        </div>
        
        <div className="p-6 border-b border-slate-100 dark:border-slate-800 flex justify-center gap-2">
            {[
                { id: 'EG', label: 'مصر', flag: '🇪🇬' },
                { id: 'SA', label: 'السعودية', flag: '🇸🇦' },
                { id: 'AE', label: 'الإمارات', flag: '🇦🇪' }
            ].map(c => (
                <button
                    key={c.id}
                    onClick={() => setSelectedCountry(c.id as any)}
                    className={`px-4 py-2 rounded-xl text-sm font-bold transition-all ${selectedCountry === c.id ? 'bg-emerald-500 text-white shadow-lg scale-105' : 'bg-slate-100 dark:bg-slate-800 text-slate-500 dark:text-slate-400'}`}
                >
                    {c.flag} {c.label}
                </button>
            ))}
        </div>

        <div className="flex-1 overflow-y-auto p-8 custom-scrollbar text-right space-y-4 bg-white dark:bg-slate-900">
            {pharmacies[selectedCountry].map((pharmacy, idx) => (
                <a 
                    key={idx}
                    href={pharmacy.url}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="flex items-center justify-between p-5 rounded-[2rem] bg-slate-50 dark:bg-slate-800 border-2 border-slate-100 dark:border-slate-700 hover:border-emerald-500 dark:hover:border-emerald-500 transition-all group active:scale-[0.98]"
                >
                    <ExternalLink className="w-5 h-5 text-slate-400 group-hover:text-emerald-500 transition-colors"/>
                    <div className="text-right">
                        <h3 className="font-black text-slate-800 dark:text-white text-lg group-hover:text-emerald-600 transition-colors">{pharmacy.name}</h3>
                        <p className="text-xs font-bold text-slate-400 dark:text-slate-500 mt-1">{pharmacy.description}</p>
                    </div>
                    <div className="w-12 h-12 rounded-full bg-emerald-100 dark:bg-emerald-900/30 flex items-center justify-center text-emerald-600 dark:text-emerald-400">
                        <ShoppingBag className="w-6 h-6" />
                    </div>
                </a>
            ))}
            
            <div className="mt-8 p-4 rounded-2xl bg-amber-50 dark:bg-amber-900/20 text-amber-800 dark:text-amber-200 text-xs font-bold text-center leading-relaxed">
                هذه الروابط خارجية وتقوم بتحويلك لمواقع وتطبيقات الصيدليات المعتمدة. نحن نسهل عليك الوصول فقط.
            </div>
        </div>
        <ScrollHint />
      </div>
    </div>
  );
};
