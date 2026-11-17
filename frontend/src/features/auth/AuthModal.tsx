import React, { useState } from 'react';
import { ApiClient } from '../../services/api';
import { Lock, Mail, User, AlertCircle, Sparkles } from 'lucide-react';

interface AuthModalProps {
  isOpen: boolean;
  onSuccess: (user: any) => void;
  onClose?: () => void;
}

export const AuthModal: React.FC<AuthModalProps> = ({ isOpen, onSuccess }) => {
  const [isRegister, setIsRegister] = useState(false);
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [displayName, setDisplayName] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  if (!isOpen) return null;

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    setLoading(true);

    try {
      if (isRegister) {
        const res = await ApiClient.register(email, password, displayName || undefined);
        onSuccess(res.user);
      } else {
        const res = await ApiClient.login(email, password);
        onSuccess(res.user);
      }
    } catch (err) {
      setError((err as Error).message || 'Operazione fallita');
    } finally {
      setLoading(false);
    }
  };

  const handleQuickDemo = async () => {
    setError(null);
    setLoading(true);
    const demoEmail = 'demo@example.com';
    const demoPassword = 'DemoUser123!';
    try {
      try {
        const res = await ApiClient.login(demoEmail, demoPassword);
        onSuccess(res.user);
      } catch {
        const res = await ApiClient.register(demoEmail, demoPassword, 'Utente Demo');
        onSuccess(res.user);
      }
    } catch (err) {
      setError((err as Error).message || 'Accesso demo fallito');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div style={{
      position: 'fixed',
      top: 0,
      left: 0,
      right: 0,
      bottom: 0,
      backgroundColor: 'rgba(15, 23, 42, 0.85)',
      backdropFilter: 'blur(8px)',
      display: 'flex',
      alignItems: 'center',
      justifyContent: 'center',
      zIndex: 1000,
      padding: '20px'
    }}>
      <div style={{
        background: '#1e293b',
        border: '1px solid #334155',
        borderRadius: '16px',
        width: '100%',
        maxWidth: '420px',
        padding: '32px',
        boxShadow: '0 25px 50px -12px rgba(0, 0, 0, 0.5)'
      }}>
        <div style={{ textAlign: 'center', marginBottom: '24px' }}>
          <div style={{
            display: 'inline-flex',
            alignItems: 'center',
            justifyContent: 'center',
            width: '48px',
            height: '48px',
            borderRadius: '12px',
            background: 'linear-gradient(135deg, #0284c7 0%, #38bdf8 100%)',
            color: 'white',
            marginBottom: '12px'
          }}>
            <Lock size={24} />
          </div>
          <h2 style={{ fontSize: '20px', fontWeight: 'bold' }}>
            {isRegister ? 'Crea il tuo Account' : 'Accedi al Catalogo'}
          </h2>
          <p style={{ color: '#94a3b8', fontSize: '13px', marginTop: '4px' }}>
            I tuoi contenuti rimangono personali, protetti e isolati.
          </p>
        </div>

        {error && (
          <div style={{
            background: 'rgba(244, 63, 94, 0.1)',
            border: '1px solid #f43f5e',
            color: '#f43f5e',
            padding: '10px 14px',
            borderRadius: '8px',
            fontSize: '13px',
            display: 'flex',
            alignItems: 'center',
            gap: '8px',
            marginBottom: '16px'
          }}>
            <AlertCircle size={16} />
            <span>{error}</span>
          </div>
        )}

        <form onSubmit={handleSubmit} style={{ display: 'flex', flexDirection: 'column', gap: '14px' }}>
          {isRegister && (
            <div>
              <label style={{ fontSize: '12px', color: '#94a3b8', display: 'block', marginBottom: '6px' }}>
                Nome completo o Display name
              </label>
              <div style={{ position: 'relative' }}>
                <User size={16} color="#64748b" style={{ position: 'absolute', left: '12px', top: '12px' }} />
                <input
                  type="text"
                  placeholder="Mario Rossi"
                  value={displayName}
                  onChange={(e) => setDisplayName(e.target.value)}
                  style={{
                    width: '100%',
                    background: '#0f172a',
                    border: '1px solid #334155',
                    borderRadius: '8px',
                    padding: '10px 12px 10px 38px',
                    color: 'white',
                    fontSize: '14px'
                  }}
                />
              </div>
            </div>
          )}

          <div>
            <label style={{ fontSize: '12px', color: '#94a3b8', display: 'block', marginBottom: '6px' }}>
              Indirizzo Email
            </label>
            <div style={{ position: 'relative' }}>
              <Mail size={16} color="#64748b" style={{ position: 'absolute', left: '12px', top: '12px' }} />
              <input
                type="email"
                required
                placeholder="nome@esempio.com"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                style={{
                  width: '100%',
                  background: '#0f172a',
                  border: '1px solid #334155',
                  borderRadius: '8px',
                  padding: '10px 12px 10px 38px',
                  color: 'white',
                  fontSize: '14px'
                }}
              />
            </div>
          </div>

          <div>
            <label style={{ fontSize: '12px', color: '#94a3b8', display: 'block', marginBottom: '6px' }}>
              Password
            </label>
            <div style={{ position: 'relative' }}>
              <Lock size={16} color="#64748b" style={{ position: 'absolute', left: '12px', top: '12px' }} />
              <input
                type="password"
                required
                placeholder="••••••••"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                style={{
                  width: '100%',
                  background: '#0f172a',
                  border: '1px solid #334155',
                  borderRadius: '8px',
                  padding: '10px 12px 10px 38px',
                  color: 'white',
                  fontSize: '14px'
                }}
              />
            </div>
          </div>

          <button
            type="submit"
            disabled={loading}
            style={{
              background: '#0284c7',
              color: 'white',
              border: 'none',
              borderRadius: '8px',
              padding: '12px',
              fontSize: '14px',
              fontWeight: 600,
              marginTop: '8px'
            }}
          >
            {loading ? 'Attendi...' : (isRegister ? 'Registrati' : 'Accedi')}
          </button>
        </form>

        <div style={{
          marginTop: '20px',
          paddingTop: '16px',
          borderTop: '1px solid #334155',
          display: 'flex',
          flexDirection: 'column',
          gap: '12px',
          textAlign: 'center'
        }}>
          <button
            type="button"
            onClick={() => { setIsRegister(!isRegister); setError(null); }}
            style={{
              background: 'transparent',
              border: 'none',
              color: '#38bdf8',
              fontSize: '13px'
            }}
          >
            {isRegister ? 'Hai già un account? Accedi' : 'Non hai un account? Registrati'}
          </button>

          <button
            type="button"
            onClick={handleQuickDemo}
            disabled={loading}
            style={{
              background: '#334155',
              border: '1px solid #475569',
              borderRadius: '8px',
              padding: '8px',
              color: '#f8fafc',
              fontSize: '12px',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              gap: '6px'
            }}
          >
            <Sparkles size={14} color="#f59e0b" />
            Accedi Rapido con Account Demo
          </button>
        </div>
      </div>
    </div>
  );
};
