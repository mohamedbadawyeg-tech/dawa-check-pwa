import React, { useState, useRef, useEffect } from 'react';
import { AlertTriangle, X, GripHorizontal, CheckCircle } from 'lucide-react';
import { Medication } from '../types';

interface DraggableLateAlertProps {
  lateMeds: Medication[];
  onMarkAsTaken: (id: string) => void;
}

export const DraggableLateAlert: React.FC<DraggableLateAlertProps> = ({ lateMeds, onMarkAsTaken }) => {
  const [position, setPosition] = useState({ x: 20, y: 100 });
  const [isDragging, setIsDragging] = useState(false);
  const [offset, setOffset] = useState({ x: 0, y: 0 });
  const [isMinimized, setIsMinimized] = useState(false);
  
  const alertRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    // Reset position if out of bounds (simple check)
    if (window.innerWidth > 0 && position.x > window.innerWidth - 50) {
        setPosition(p => ({ ...p, x: window.innerWidth - 320 }));
    }
  }, [window.innerWidth]);

  const handlePointerDown = (e: React.PointerEvent) => {
    if (!alertRef.current) return;
    setIsDragging(true);
    const rect = alertRef.current.getBoundingClientRect();
    setOffset({
      x: e.clientX - rect.left,
      y: e.clientY - rect.top
    });
    // Capture pointer to track even if it leaves the element
    alertRef.current.setPointerCapture(e.pointerId);
  };

  const handlePointerMove = (e: React.PointerEvent) => {
    if (!isDragging) return;
    setPosition({
      x: e.clientX - offset.x,
      y: e.clientY - offset.y
    });
  };

  const handlePointerUp = (e: React.PointerEvent) => {
    setIsDragging(false);
    if (alertRef.current) {
        alertRef.current.releasePointerCapture(e.pointerId);
    }
  };

  if (lateMeds.length === 0) return null;

  return (
    <div
      ref={alertRef}
      style={{
        position: 'fixed',
        left: position.x,
        top: position.y,
        zIndex: 9999, // High z-index to be on top
        touchAction: 'none', // Prevent scrolling while dragging
        cursor: isDragging ? 'grabbing' : 'grab',
      }}
      onPointerDown={handlePointerDown}
      onPointerMove={handlePointerMove}
      onPointerUp={handlePointerUp}
      className={`bg-red-600 text-white rounded-2xl shadow-2xl transition-all duration-200 ${isDragging ? 'scale-105 opacity-90' : ''}`}
    >
      <div className="p-1 flex items-center justify-center border-b border-red-500/30 cursor-grab active:cursor-grabbing">
         <GripHorizontal className="w-6 h-6 text-red-200/50" />
      </div>
      
      {!isMinimized ? (
        <div className="p-4 max-w-[300px]">
            <div className="flex items-start justify-between gap-3 mb-3">
                <button 
                   onClick={(e) => { e.stopPropagation(); setIsMinimized(true); }}
                   className="text-red-200 hover:text-white"
                >
                    <X className="w-5 h-5" />
                </button>
                <div className="text-right flex-1">
                    <h3 className="font-black text-lg flex items-center justify-end gap-2">
                        أدوية متأخرة <AlertTriangle className="w-5 h-5 animate-pulse" />
                    </h3>
                    <p className="text-xs text-red-100 font-medium mt-1">يرجى أخذ الأدوية التالية فوراً</p>
                </div>
            </div>

            <div className="space-y-2 max-h-[200px] overflow-y-auto pr-1 custom-scrollbar">
                {lateMeds.map(med => (
                    <div key={med.id} className="bg-red-700/50 p-2 rounded-xl flex items-center justify-between gap-2" dir="rtl">
                        <span className="text-sm font-bold truncate flex-1 text-right">{med.name}</span>
                        <button 
                            onPointerDown={(e) => e.stopPropagation()} // Prevent drag start on button click
                            onClick={(e) => {
                                e.stopPropagation();
                                onMarkAsTaken(med.id);
                            }}
                            className="bg-white text-red-600 p-1.5 rounded-lg shadow-sm hover:bg-red-50 active:scale-95 transition-all"
                            title="تم أخذ الدواء"
                        >
                            <CheckCircle className="w-4 h-4" />
                        </button>
                    </div>
                ))}
            </div>
        </div>
      ) : (
        <button 
           onClick={() => setIsMinimized(false)}
           className="p-3 flex items-center gap-2 animate-pulse"
        >
            <span className="bg-white text-red-600 text-xs font-black px-1.5 rounded-md">{lateMeds.length}</span>
            <AlertTriangle className="w-6 h-6" />
        </button>
      )}
    </div>
  );
};
