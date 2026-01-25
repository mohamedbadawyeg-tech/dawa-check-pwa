import React, { useState, useEffect } from 'react';
import { X, ChevronLeft, ChevronRight } from 'lucide-react';

interface Step {
  targetId: string;
  title: string;
  content: string;
}

interface TourProps {
  steps: Step[];
  isOpen: boolean;
  onClose: () => void;
  onComplete: () => void;
}

export const Tour: React.FC<TourProps> = ({ steps, isOpen, onClose, onComplete }) => {
  const [currentStep, setCurrentStep] = useState(0);
  const [position, setPosition] = useState<{ top: number; left: number; width: number; height: number } | null>(null);

  useEffect(() => {
    if (!isOpen) return;

    const updatePosition = () => {
      const element = document.getElementById(steps[currentStep].targetId);
      if (element) {
        const rect = element.getBoundingClientRect();
        setPosition({
          top: rect.top,
          left: rect.left,
          width: rect.width,
          height: rect.height,
        });
        element.scrollIntoView({ behavior: 'smooth', block: 'center' });
      } else {
        // Skip step if element not found or fallback
        // console.warn(`Element with id ${steps[currentStep].targetId} not found`);
      }
    };

    updatePosition();
    window.addEventListener('resize', updatePosition);
    window.addEventListener('scroll', updatePosition);
    
    // Slight delay to allow UI to settle/render
    const timer = setTimeout(updatePosition, 500);

    return () => {
        window.removeEventListener('resize', updatePosition);
        window.removeEventListener('scroll', updatePosition);
        clearTimeout(timer);
    };
  }, [currentStep, isOpen, steps]);

  if (!isOpen || !position) return null;

  const handleNext = () => {
    if (currentStep < steps.length - 1) {
      setCurrentStep(prev => prev + 1);
    } else {
      onComplete();
    }
  };

  const handlePrev = () => {
    if (currentStep > 0) {
      setCurrentStep(prev => prev - 1);
    }
  };

  return (
    <div className="fixed inset-0 z-[9999] overflow-hidden" dir="rtl">
      {/* Semi-transparent overlay with "hole" using massive box-shadow */}
      <div 
        className="absolute transition-all duration-500 ease-in-out border-2 border-emerald-500 rounded-xl shadow-[0_0_0_9999px_rgba(0,0,0,0.8)] pointer-events-none"
        style={{
          top: position.top - 12,
          left: position.left - 8,
          width: position.width + 16,
          height: position.height + 16,
        }}
      />

      {/* Tooltip */}
      <div 
        className="absolute transition-all duration-500 z-[10000] w-72 md:w-80"
        style={{
          top: position.top + position.height + 20 > window.innerHeight - 250 
            ? position.top - 235 // Show above if too close to bottom
            : position.top + position.height + 15,
          left: Math.max(20, Math.min(window.innerWidth - 300, position.left)),
        }}
      >
        <div className="bg-white dark:bg-slate-900 rounded-2xl p-6 shadow-2xl border border-slate-100 dark:border-slate-800 animate-in fade-in zoom-in-95 duration-300">
            <button onClick={onClose} className="absolute top-4 left-4 text-slate-400 hover:text-slate-600"><X className="w-5 h-5" /></button>
            <div className="mb-4">
                <span className="text-xs font-black text-emerald-600 bg-emerald-50 dark:bg-emerald-900/20 px-2 py-1 rounded-lg">
                    خطوة {currentStep + 1} من {steps.length}
                </span>
            </div>
            <h3 className="text-lg font-black text-slate-900 dark:text-white mb-2">{steps[currentStep].title}</h3>
            <p className="text-sm text-slate-600 dark:text-slate-300 mb-6 leading-relaxed">
                {steps[currentStep].content}
            </p>
            <div className="flex items-center justify-between">
                <button 
                    onClick={handlePrev} 
                    disabled={currentStep === 0}
                    className="p-2 rounded-xl text-slate-400 hover:bg-slate-50 disabled:opacity-30 transition-colors"
                >
                    <ChevronRight className="w-6 h-6" />
                </button>
                <button 
                    onClick={handleNext}
                    className="px-6 py-2 bg-emerald-600 hover:bg-emerald-700 text-white rounded-xl font-bold text-sm transition-colors shadow-lg shadow-emerald-200 dark:shadow-emerald-900/20 flex items-center gap-2"
                >
                    {currentStep === steps.length - 1 ? 'إنهاء' : 'التالي'}
                    {currentStep !== steps.length - 1 && <ChevronLeft className="w-4 h-4" />}
                </button>
            </div>
        </div>
      </div>
    </div>
  );
};
