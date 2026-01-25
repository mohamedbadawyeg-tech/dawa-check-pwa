import React, { Component, ErrorInfo, ReactNode } from 'react';

interface Props {
  children: ReactNode;
}

interface State {
  hasError: boolean;
  error: Error | null;
}

export class ErrorBoundary extends Component<Props, State> {
  public state: State = {
    hasError: false,
    error: null
  };

  public static getDerivedStateFromError(error: Error): State {
    return { hasError: true, error };
  }

  public componentDidCatch(error: Error, errorInfo: ErrorInfo) {
    console.error("Uncaught error:", error, errorInfo);
  }

  public render() {
    if (this.state.hasError) {
      return (
        <div className="flex flex-col items-center justify-center min-h-screen bg-slate-50 p-4 text-center" dir="rtl">
          <h1 className="text-2xl font-bold text-red-600 mb-4">عذراً، حدث خطأ غير متوقع</h1>
          <p className="text-slate-600 mb-4">يرجى إعادة تشغيل التطبيق أو التواصل مع الدعم الفني.</p>
          <div className="bg-slate-200 p-4 rounded-lg text-left text-xs overflow-auto max-w-full w-full mb-6">
            <code className="whitespace-pre-wrap text-red-800 break-words">
              {this.state.error && this.state.error.toString()}
            </code>
          </div>
          <button 
            onClick={() => {
                localStorage.clear();
                window.location.reload();
            }}
            className="px-6 py-3 bg-red-600 text-white rounded-xl font-bold mb-4 w-full"
          >
            مسح البيانات وإعادة التشغيل (حل جذري)
          </button>
          <button 
            onClick={() => window.location.reload()}
            className="px-6 py-3 bg-blue-600 text-white rounded-xl font-bold w-full"
          >
            إعادة التشغيل فقط
          </button>
        </div>
      );
    }

    return this.props.children;
  }
}
