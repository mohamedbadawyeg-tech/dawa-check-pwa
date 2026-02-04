
import React from 'react';
import { DayHistory } from '../types';
import { Activity } from 'lucide-react';

interface HealthChartsProps {
  reports: Record<string, DayHistory>;
}

export const HealthCharts: React.FC<HealthChartsProps> = ({ reports }) => {
  const safeReports = reports || {};
  const dates = Object.keys(safeReports).sort().slice(-7); // Last 7 days
  const data = dates.map(date => {
    const r = safeReports[date].report;
    return {
      date: date.split('-').slice(1).join('/'),
      systolic: r.systolicBP || 0,
      diastolic: r.diastolicBP || 0,
      sugar: r.bloodSugar || 0
    };
  });

  const maxBP = Math.max(...data.map(d => d.systolic), 180);
  const maxSugar = Math.max(...data.map(d => d.sugar), 300);

  if (data.length === 0) return <div className="p-4 text-center text-gray-500">لا توجد بيانات كافية لعرض الرسوم البيانية</div>;

  return (
    <div className="space-y-6 animate-in fade-in slide-in-from-bottom-4 duration-500">
      <div className="bg-white/50 backdrop-blur-sm rounded-xl p-4 shadow-sm border border-white/20">
        <h3 className="text-lg font-bold text-slate-800 mb-4 flex items-center gap-2">
          <Activity className="w-5 h-5 text-red-500" />
          مؤشرات ضغط الدم (آخر 7 أيام)
        </h3>
        <div className="h-40 flex items-end justify-between gap-2 px-2">
          {data.map((d, i) => (
            <div key={i} className="flex flex-col items-center gap-1 w-full group relative">
              <div className="absolute bottom-full mb-1 bg-slate-800 text-white text-xs px-2 py-1 rounded opacity-0 group-hover:opacity-100 transition-opacity whitespace-nowrap z-10">
                {d.systolic}/{d.diastolic}
              </div>
              <div className="w-full max-w-[30px] bg-slate-200 rounded-t-lg relative h-full flex items-end overflow-hidden">
                <div 
                  className="w-full bg-red-400 absolute bottom-0 transition-all duration-1000"
                  style={{ height: `${(d.systolic / maxBP) * 100}%` }}
                />
                <div 
                  className="w-full bg-red-600 absolute bottom-0 transition-all duration-1000 opacity-70"
                  style={{ height: `${(d.diastolic / maxBP) * 100}%` }}
                />
              </div>
              <span className="text-[10px] text-slate-500 font-medium">{d.date}</span>
            </div>
          ))}
        </div>
      </div>

      <div className="bg-white/50 backdrop-blur-sm rounded-xl p-4 shadow-sm border border-white/20">
        <h3 className="text-lg font-bold text-slate-800 mb-4 flex items-center gap-2">
          <Activity className="w-5 h-5 text-blue-500" />
          مستوى السكر (آخر 7 أيام)
        </h3>
        <div className="h-40 flex items-end justify-between gap-2 px-2">
          {data.map((d, i) => (
            <div key={i} className="flex flex-col items-center gap-1 w-full group relative">
              <div className="absolute bottom-full mb-1 bg-slate-800 text-white text-xs px-2 py-1 rounded opacity-0 group-hover:opacity-100 transition-opacity whitespace-nowrap z-10">
                {d.sugar} mg/dL
              </div>
              <div className="w-full max-w-[30px] bg-slate-200 rounded-t-lg relative h-full flex items-end overflow-hidden">
                <div 
                  className="w-full bg-blue-500 absolute bottom-0 transition-all duration-1000 rounded-t-lg"
                  style={{ height: `${(d.sugar / maxSugar) * 100}%` }}
                />
              </div>
              <span className="text-[10px] text-slate-500 font-medium">{d.date}</span>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
};
