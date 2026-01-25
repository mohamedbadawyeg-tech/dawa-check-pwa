import React, { useState } from 'react';
import { ListTodo, Sparkles, Plus, Calendar, Trash2, CheckSquare, Square, Pencil, Save, X } from 'lucide-react';
import { Procedure } from '../types';

interface ProceduresCardProps {
  procedures: Procedure[];
  onAdd: (text: string, date: string) => void;
  onUpdate?: (id: string, text: string, date: string) => void;
  onToggle: (id: string) => void;
  onDelete: (id: string) => void;
  isCaregiver: boolean;
  onOpenModal: () => void;
}

export const ProceduresCard: React.FC<ProceduresCardProps> = ({ 
  procedures, onAdd, onUpdate, onToggle, onDelete, isCaregiver, onOpenModal 
}) => {
  const [newText, setNewText] = useState('');
  const [newDate, setNewDate] = useState('');
  const [editingId, setEditingId] = useState<string | null>(null);

  const handleAdd = () => {
    if (newText.trim()) {
      if (editingId && onUpdate) {
        onUpdate(editingId, newText, newDate);
        setEditingId(null);
      } else {
        onAdd(newText, newDate);
      }
      setNewText('');
      setNewDate('');
    }
  };

  const startEditing = (proc: Procedure) => {
    setEditingId(proc.id);
    setNewText(proc.text);
    setNewDate(proc.date || '');
  };

  const cancelEditing = () => {
    setEditingId(null);
    setNewText('');
    setNewDate('');
  };

  return (
    <section className="bg-gradient-to-br from-white to-amber-50/40 dark:from-slate-900 dark:to-slate-900/80 rounded-[2.8rem] p-8 shadow-xl border-2 border-amber-100 dark:border-amber-900/20 relative group transition-all ring-4 ring-amber-600/5">
      <div className="flex items-center justify-between mb-6 cursor-pointer" onClick={onOpenModal}>
         <div className="bg-amber-500 p-5 rounded-3xl text-white shadow-xl shadow-amber-500/30"><ListTodo className="w-8 h-8" /></div>
         <div className="text-right">
           <h2 className="text-2xl font-black text-slate-800 dark:text-slate-100 mb-1">الإجراءات القادمة</h2>
           <p className="text-amber-600 dark:text-amber-400 text-[10px] font-black uppercase flex items-center justify-end gap-1.5">
             <Sparkles className="w-3 h-3"/> {isCaregiver ? 'إدارة المواعيد والمهام' : 'متابعة المهام'}
           </p>
         </div>
      </div>

      <div className="p-6 bg-white/70 dark:bg-slate-800/50 rounded-[2rem] border border-slate-100 dark:border-slate-700 shadow-inner space-y-4">
        {/* Add/Edit Task Form */}
        <div className="space-y-3">
            <div className="flex items-center justify-between mb-2">
              {editingId ? (
                 <span className="text-xs font-bold text-amber-600 flex items-center gap-1"><Pencil className="w-3 h-3"/> جاري التعديل</span>
              ) : <span></span>}
              {editingId && (
                <button onClick={cancelEditing} className="text-slate-400 hover:text-slate-600"><X className="w-4 h-4"/></button>
              )}
            </div>
            <input 
              type="text" 
              value={newText}
              onChange={(e) => setNewText(e.target.value)}
              placeholder={editingId ? "تعديل المهمة..." : "أضف مهمة أو موعد جديد..."}
              className={`w-full p-3 rounded-xl bg-white dark:bg-slate-900 border ${editingId ? 'border-amber-300 ring-2 ring-amber-100' : 'border-slate-200'} dark:border-slate-700 text-right text-sm focus:outline-none focus:ring-2 focus:ring-amber-500 transition-all`}
            />
            <div className="flex gap-2">
                <button 
                  onClick={handleAdd}
                  disabled={!newText.trim()}
                  className={`${editingId ? 'bg-emerald-500 hover:bg-emerald-600' : 'bg-amber-500 hover:bg-amber-600'} text-white px-4 py-2 rounded-xl disabled:opacity-50 flex items-center gap-1 text-xs font-bold transition-colors shadow-lg shadow-amber-500/20`}
                >
                  {editingId ? <><Save className="w-4 h-4" /> حفظ</> : <><Plus className="w-4 h-4" /> إضافة</>}
                </button>
                <input 
                  type="date" 
                  value={newDate}
                  onChange={(e) => setNewDate(e.target.value)}
                  className="flex-1 p-2 rounded-xl bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-700 text-right text-xs focus:outline-none focus:ring-2 focus:ring-amber-500"
                />
            </div>
        </div>

        {/* List */}
        <div className="space-y-2 max-h-60 overflow-y-auto custom-scrollbar">
           {procedures && procedures.length > 0 ? (
             procedures.map((proc) => (
               <div key={proc.id} className={`flex items-center justify-between gap-3 p-3 rounded-xl transition-all ${editingId === proc.id ? 'bg-amber-50 border border-amber-200 ring-2 ring-amber-100' : proc.completed ? 'bg-slate-100 dark:bg-slate-800/50 opacity-60' : 'bg-white dark:bg-slate-800 shadow-sm'}`}>
                 <div className="flex flex-col gap-1">
                    <button onClick={() => onDelete(proc.id)} className="text-rose-400 hover:text-rose-600 p-1 hover:bg-rose-50 rounded-lg transition-colors">
                        <Trash2 className="w-4 h-4" />
                    </button>
                    {onUpdate && (
                      <button onClick={() => startEditing(proc)} className="text-blue-400 hover:text-blue-600 p-1 hover:bg-blue-50 rounded-lg transition-colors">
                          <Pencil className="w-4 h-4" />
                      </button>
                    )}
                 </div>
                 
                 <div className="flex-1 text-right">
                   <p className={`font-bold text-sm ${proc.completed ? 'line-through text-slate-500' : 'text-slate-800 dark:text-slate-200'}`}>{proc.text}</p>
                   {proc.date && <p className="text-[10px] text-amber-600 flex items-center justify-end gap-1"><Calendar className="w-3 h-3"/> {proc.date}</p>}
                 </div>

                 <button onClick={() => onToggle(proc.id)} className={`p-1 ${proc.completed ? 'text-emerald-500' : 'text-slate-300 hover:text-amber-500'}`}>
                    {proc.completed ? <CheckSquare className="w-6 h-6" /> : <Square className="w-6 h-6" />}
                 </button>
               </div>
             ))
           ) : (
             <p className="text-center text-xs text-slate-400 py-4">لا توجد مهام قادمة</p>
           )}
        </div>
      </div>
    </section>
  );
};
