import React, { useEffect, useState } from 'react';
import { detectBrowserCapabilities, BrowserCapabilities } from '../scanner/directoryTraverser';
import { ApiClient } from '../../services/api';
import {
  Cpu,
  Server,
  User,
  HardDrive,
  CheckCircle2,
  RefreshCw
} from 'lucide-react';

interface SettingsViewProps {
  currentUser: any;
}

export const SettingsView: React.FC<SettingsViewProps> = ({ currentUser }) => {
  const [capabilities, setCapabilities] = useState<BrowserCapabilities | null>(null);
  const [backendHealth, setBackendHealth] = useState<any | null>(null);
  const [storageStats, setStorageStats] = useState<any | null>(null);
  const [compacting, setCompacting] = useState(false);
  const [compactResult, setCompactResult] = useState<string | null>(null);

  const loadStorageStats = async () => {
    try {
      const stats = await ApiClient.getStorageSettings();
      setStorageStats(stats);
    } catch (err) {
      console.warn('Could not load storage stats:', err);
    }
  };

  useEffect(() => {
    setCapabilities(detectBrowserCapabilities());
    fetch('http://localhost:8000/health')
      .then((res) => res.json())
      .then(setBackendHealth)
      .catch(() => setBackendHealth({ status: 'offline' }));
    loadStorageStats();
  }, []);

  const handleProfileChange = async (newProfile: string) => {
    try {
      await ApiClient.updateStorageProfile(newProfile);
      setStorageStats((prev: any) => prev ? { ...prev, thumbnail_profile: newProfile } : null);
    } catch (err) {
      console.error('Error updating profile:', err);
    }
  };

  const handleCompact = async () => {
    setCompacting(true);
    setCompactResult(null);
    try {
      const res = await ApiClient.compactStorage();
      const savedMb = (res.saved_bytes / (1024 * 1024)).toFixed(2);
      setCompactResult(`Ricompatte con successo ${res.compacted_count} miniature! Risparmio: ${savedMb} MB.`);
      await loadStorageStats();
    } catch (err) {
      setCompactResult(`Errore durante la compattazione: ${(err as Error).message}`);
    } finally {
      setCompacting(false);
    }
  };

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '24px', maxWidth: '800px' }}>
      {/* User Account Info */}
      <div style={{
        background: '#1e293b',
        border: '1px solid #334155',
        borderRadius: '16px',
        padding: '24px'
      }}>
        <h3 style={{ fontSize: '16px', fontWeight: 600, display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '16px' }}>
          <User size={18} color="#38bdf8" /> Profilo Utente
        </h3>
        <div style={{ display: 'flex', flexDirection: 'column', gap: '8px', fontSize: '13px' }}>
          <div><span style={{ color: '#94a3b8' }}>Nome:</span> <strong>{currentUser?.display_name || 'N/A'}</strong></div>
          <div><span style={{ color: '#94a3b8' }}>Email:</span> <strong>{currentUser?.email}</strong></div>
          <div><span style={{ color: '#94a3b8' }}>User ID:</span> <code style={{ color: '#38bdf8' }}>{currentUser?.id}</code></div>
        </div>
      </div>

      {/* Thumbnail Optimization & Storage Profile */}
      <div style={{
        background: '#1e293b',
        border: '1px solid #334155',
        borderRadius: '16px',
        padding: '24px'
      }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '16px', flexWrap: 'wrap', gap: '12px' }}>
          <h3 style={{ fontSize: '16px', fontWeight: 600, display: 'flex', alignItems: 'center', gap: '8px', margin: 0 }}>
            <HardDrive size={18} color="#22c55e" /> Ottimizzazione Miniature & Storage
          </h3>
          <span style={{
            fontSize: '11px',
            padding: '3px 8px',
            borderRadius: '6px',
            background: 'rgba(34, 197, 94, 0.15)',
            color: '#22c55e',
            fontWeight: 600
          }}>
            Vero WebP 320px
          </span>
        </div>

        {storageStats && (
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))', gap: '12px', marginBottom: '20px' }}>
            <div style={{ background: '#0f172a', padding: '12px', borderRadius: '10px', border: '1px solid #334155' }}>
              <div style={{ color: '#94a3b8', fontSize: '11px' }}>Miniature Indicizzate</div>
              <div style={{ fontSize: '18px', fontWeight: 'bold', marginTop: '4px', color: '#f8fafc' }}>
                {storageStats.thumbnails_count} file
              </div>
            </div>
            <div style={{ background: '#0f172a', padding: '12px', borderRadius: '10px', border: '1px solid #334155' }}>
              <div style={{ color: '#94a3b8', fontSize: '11px' }}>Spazio Totale Occupato</div>
              <div style={{ fontSize: '18px', fontWeight: 'bold', marginTop: '4px', color: '#38bdf8' }}>
                {(storageStats.total_bytes / (1024 * 1024)).toFixed(1)} MB
              </div>
            </div>
            <div style={{ background: '#0f172a', padding: '12px', borderRadius: '10px', border: '1px solid #334155' }}>
              <div style={{ color: '#94a3b8', fontSize: '11px' }}>Peso Medio per Foto</div>
              <div style={{ fontSize: '18px', fontWeight: 'bold', marginTop: '4px', color: '#22c55e' }}>
                {storageStats.avg_kb} KB
              </div>
            </div>
          </div>
        )}

        <div style={{ display: 'flex', flexDirection: 'column', gap: '14px', fontSize: '13px' }}>
          <div>
            <label style={{ display: 'block', color: '#94a3b8', marginBottom: '8px', fontWeight: 500 }}>
              Profilo di Compressione per le Nuove Scansioni:
            </label>
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(220px, 1fr))', gap: '10px' }}>
              {[
                { key: 'compact', label: 'Compressione Massima', desc: '240px · Qualità 55 (~6 KB/foto)' },
                { key: 'balanced', label: 'Bilanciata (Consigliato)', desc: '320px · Qualità 65 (~11 KB/foto)' },
                { key: 'high', label: 'Alta Risoluzione', desc: '384px · Qualità 75 (~18 KB/foto)' }
              ].map((p) => {
                const isActive = storageStats?.thumbnail_profile === p.key;
                return (
                  <button
                    key={p.key}
                    type="button"
                    onClick={() => handleProfileChange(p.key)}
                    style={{
                      background: isActive ? 'rgba(56, 189, 248, 0.12)' : '#0f172a',
                      border: isActive ? '1px solid #38bdf8' : '1px solid #334155',
                      borderRadius: '8px',
                      padding: '10px 12px',
                      textAlign: 'left',
                      cursor: 'pointer',
                      transition: 'all 0.15s ease'
                    }}
                  >
                    <div style={{ fontWeight: 600, color: isActive ? '#38bdf8' : '#f8fafc', fontSize: '13px' }}>
                      {p.label}
                    </div>
                    <div style={{ color: '#94a3b8', fontSize: '11px', marginTop: '2px' }}>
                      {p.desc}
                    </div>
                  </button>
                );
              })}
            </div>
          </div>

          <div style={{
            marginTop: '8px',
            paddingTop: '16px',
            borderTop: '1px solid #334155',
            display: 'flex',
            justifyContent: 'space-between',
            alignItems: 'center',
            flexWrap: 'wrap',
            gap: '12px'
          }}>
            <p style={{ color: '#94a3b8', fontSize: '12px', margin: 0, maxWidth: '480px' }}>
              Vuoi allineare le miniature già salvate al profilo attivo? Il processo ricodificherà le miniature sul server senza toccare i file originali.
            </p>
            <button
              type="button"
              onClick={handleCompact}
              disabled={compacting}
              style={{
                background: '#0284c7',
                color: 'white',
                border: 'none',
                borderRadius: '8px',
                padding: '10px 16px',
                fontSize: '13px',
                fontWeight: 600,
                cursor: compacting ? 'not-allowed' : 'pointer',
                display: 'flex',
                alignItems: 'center',
                gap: '8px'
              }}
            >
              <RefreshCw size={14} className={compacting ? 'animate-spin' : ''} />
              {compacting ? 'Ricompatto in corso...' : 'Ricompatta Miniature Esistenti'}
            </button>
          </div>

          {compactResult && (
            <div style={{
              background: 'rgba(34, 197, 94, 0.1)',
              border: '1px solid rgba(34, 197, 94, 0.3)',
              borderRadius: '8px',
              padding: '10px 14px',
              color: '#22c55e',
              fontSize: '12px',
              display: 'flex',
              alignItems: 'center',
              gap: '8px'
            }}>
              <CheckCircle2 size={16} />
              {compactResult}
            </div>
          )}
        </div>
      </div>

      {/* Backend & Database Health */}
      <div style={{
        background: '#1e293b',
        border: '1px solid #334155',
        borderRadius: '16px',
        padding: '24px'
      }}>
        <h3 style={{ fontSize: '16px', fontWeight: 600, display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '16px' }}>
          <Server size={18} color="#38bdf8" /> Stato Backend & Database
        </h3>
        <div style={{ display: 'flex', flexDirection: 'column', gap: '8px', fontSize: '13px' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
            <span style={{ color: '#94a3b8' }}>API Server:</span>
            <span style={{
              fontSize: '11px',
              padding: '2px 8px',
              borderRadius: '4px',
              background: backendHealth?.status === 'healthy' ? 'rgba(34, 197, 94, 0.2)' : 'rgba(244, 63, 94, 0.2)',
              color: backendHealth?.status === 'healthy' ? '#22c55e' : '#f43f5e',
              fontWeight: 600
            }}>
              {backendHealth?.status?.toUpperCase() || 'OFFLINE'}
            </span>
          </div>
          <div><span style={{ color: '#94a3b8' }}>Endpoint API:</span> <code>http://localhost:8000/api/v1</code></div>
          <div><span style={{ color: '#94a3b8' }}>Storage Database:</span> SQLite in modalità WAL (Write-Ahead Logging)</div>
          <div><span style={{ color: '#94a3b8' }}>Archivio Miniature:</span> <code>./data/thumbnails</code> (WebP partizionato)</div>
        </div>
      </div>

      {/* Browser Hardware Capabilities */}
      {capabilities && (
        <div style={{
          background: '#1e293b',
          border: '1px solid #334155',
          borderRadius: '16px',
          padding: '24px'
        }}>
          <h3 style={{ fontSize: '16px', fontWeight: 600, display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '16px' }}>
            <Cpu size={18} color="#38bdf8" /> Funzionalità Hardware del Browser
          </h3>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(240px, 1fr))', gap: '12px', fontSize: '13px' }}>
            <div style={{ background: '#0f172a', padding: '10px 12px', borderRadius: '8px', border: '1px solid #334155' }}>
              <div style={{ color: '#94a3b8', fontSize: '11px' }}>Browser Rilevato</div>
              <div style={{ fontWeight: 600, marginTop: '2px' }}>{capabilities.browserName}</div>
            </div>
            <div style={{ background: '#0f172a', padding: '10px 12px', borderRadius: '8px', border: '1px solid #334155' }}>
              <div style={{ color: '#94a3b8', fontSize: '11px' }}>File System Access API</div>
              <div style={{ fontWeight: 600, marginTop: '2px', color: capabilities.hasFileSystemAccess ? '#22c55e' : '#f59e0b' }}>
                {capabilities.hasFileSystemAccess ? 'Supportata (Nativa)' : 'Non supportata (Usa Webkit)'}
              </div>
            </div>
            <div style={{ background: '#0f172a', padding: '10px 12px', borderRadius: '8px', border: '1px solid #334155' }}>
              <div style={{ color: '#94a3b8', fontSize: '11px' }}>WebAssembly SIMD (Hash)</div>
              <div style={{ fontWeight: 600, marginTop: '2px', color: capabilities.hasWebAssembly ? '#22c55e' : '#f43f5e' }}>
                {capabilities.hasWebAssembly ? 'Attivo (> 500 MB/s)' : 'Non supportato'}
              </div>
            </div>
            <div style={{ background: '#0f172a', padding: '10px 12px', borderRadius: '8px', border: '1px solid #334155' }}>
              <div style={{ color: '#94a3b8', fontSize: '11px' }}>Web Workers Concorrenti</div>
              <div style={{ fontWeight: 600, marginTop: '2px', color: '#22c55e' }}>
                Attivi (multi-thread non bloccante)
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
