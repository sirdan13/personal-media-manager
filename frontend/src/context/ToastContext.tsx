import React, { createContext, useContext, useState, useCallback } from 'react';
import { CheckCircle2, AlertCircle, Info, X } from 'lucide-react';

export type ToastType = 'success' | 'error' | 'info';

export interface ToastItem {
  id: string;
  message: string;
  type: ToastType;
}

interface ToastContextValue {
  showToast: (message: string, type?: ToastType) => void;
  toast: {
    success: (message: string) => void;
    error: (message: string) => void;
    info: (message: string) => void;
  };
}

const ToastContext = createContext<ToastContextValue | null>(null);

export const ToastProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const [toasts, setToasts] = useState<ToastItem[]>([]);

  const removeToast = useCallback((id: string) => {
    setToasts((prev) => prev.filter((t) => t.id !== id));
  }, []);

  const showToast = useCallback((message: string, type: ToastType = 'info') => {
    const id = Math.random().toString(36).substring(2, 9);
    setToasts((prev) => [...prev, { id, message, type }]);

    setTimeout(() => {
      removeToast(id);
    }, 3800);
  }, [removeToast]);

  const toastHelpers = {
    success: useCallback((msg: string) => showToast(msg, 'success'), [showToast]),
    error: useCallback((msg: string) => showToast(msg, 'error'), [showToast]),
    info: useCallback((msg: string) => showToast(msg, 'info'), [showToast]),
  };

  return (
    <ToastContext.Provider value={{ showToast, toast: toastHelpers }}>
      {children}
      <div
        style={{
          position: 'fixed',
          bottom: '24px',
          right: '24px',
          zIndex: 9999,
          display: 'flex',
          flexDirection: 'column',
          gap: '10px',
          maxWidth: '420px',
          pointerEvents: 'none'
        }}
      >
        {toasts.map((t) => {
          const isSuccess = t.type === 'success';
          const isError = t.type === 'error';
          const bgColor = isSuccess ? '#064e3b' : isError ? '#7f1d1d' : '#0f172a';
          const borderColor = isSuccess ? '#10b981' : isError ? '#ef4444' : '#38bdf8';
          const textColor = '#f8fafc';

          return (
            <div
              key={t.id}
              style={{
                pointerEvents: 'auto',
                background: bgColor,
                border: `1px solid ${borderColor}`,
                borderRadius: '10px',
                padding: '12px 16px',
                color: textColor,
                boxShadow: '0 10px 25px -5px rgba(0, 0, 0, 0.5), 0 8px 10px -6px rgba(0, 0, 0, 0.5)',
                display: 'flex',
                alignItems: 'center',
                gap: '12px',
                fontSize: '13px',
                lineHeight: '1.4',
                animation: 'fadeIn 0.2s ease-out'
              }}
            >
              <div style={{ flexShrink: 0 }}>
                {isSuccess && <CheckCircle2 size={18} color="#10b981" />}
                {isError && <AlertCircle size={18} color="#ef4444" />}
                {!isSuccess && !isError && <Info size={18} color="#38bdf8" />}
              </div>
              <div style={{ flex: 1, wordBreak: 'break-word' }}>{t.message}</div>
              <button
                onClick={() => removeToast(t.id)}
                style={{
                  background: 'transparent',
                  border: 'none',
                  color: '#94a3b8',
                  cursor: 'pointer',
                  padding: '2px',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center'
                }}
              >
                <X size={16} />
              </button>
            </div>
          );
        })}
      </div>
    </ToastContext.Provider>
  );
};

export const useToast = () => {
  const context = useContext(ToastContext);
  if (!context) {
    throw new Error('useToast must be used within a ToastProvider');
  }
  return context;
};
