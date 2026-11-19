import React, { useEffect, useState } from 'react';
import { detectBrowserCapabilities, BrowserCapabilities } from '../scanner/directoryTraverser';
import { ApiClient } from '../../services/api';
import { useToast } from '../../context/ToastContext';
import {
  Cpu,
  Server,
  User,
  HardDrive,
  CheckCircle2,
  RefreshCw,
  Download,
  MapPin,
  Wrench,
  Database
} from 'lucide-react';

interface SettingsViewProps {
  currentUser: any;
}

export const SettingsView: React.FC<SettingsViewProps> = ({ currentUser }) => {
  const { toast } = useToast();
  const [capabilities, setCapabilities] = useState<BrowserCapabilities | null>(null);
  const [backendHealth, setBackendHealth] = useState<any | null>(null);
  const [storageStats, setStorageStats] = useState<any | null>(null);
  const [compacting, setCompacting] = useState(false);
  const [compactResult, setCompactResult] = useState<string | null>(null);
  const [downloadingBackup, setDownloadingBackup] = useState(false);
  const [runningBackfill, setRunningBackfill] = useState(false);
  const [cleaningScans, setCleaningScans] = useState(false);

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
    fetch('/api/v1/health')
      .then((res) => res.json())
      .then(setBackendHealth)
      .catch(() => setBackendHealth({ status: 'offline' }));
    loadStorageStats();
  }, []);

  const handleProfileChange = async (newProfile: string) => {
    try {
      await ApiClient.updateStorageProfile(newProfile);
      setStorageStats((prev: any) => prev ? { ...prev, thumbnail_profile: newProfile } : null);
      toast.success(`Profilo di storage aggiornato a ${newProfile}!`);
    } catch (err) {
      toast.error(`Errore aggiornamento profilo: ${(err as Error).message}`);
    }
  };

  const handleCompact = async () => {
    setCompacting(true);
    setCompactResult(null);
    try {
      const res = await ApiClient.compactStorage();
      const savedMb = (res.saved_bytes / (1024 * 1024)).toFixed(2);
      const msg = `Ricompatte con successo ${res.compacted_count} miniature! Risparmio: ${savedMb} MB.`;
      setCompactResult(msg);
      toast.success(msg);
      await loadStorageStats();
    } catch (err) {
      const errMsg = `Errore compattazione: ${(err as Error).message}`;
      setCompactResult(errMsg);
      toast.error(errMsg);
    } finally {
      setCompacting(false);
    }
  };

  const handleDownloadBackup = async () => {
    try {
      setDownloadingBackup(true);
      toast.info('Generazione backup consistente del database in corso...');
      await ApiClient.downloadDatabaseBackup();
      toast.success('Backup scaricato con successo!');
    } catch (err) {
      toast.error(`Errore durante il download del backup: ${(err as Error).message}`);
    } finally {
      setDownloadingBackup(false);
    }
  };

  const handleBackfillGps = async () => {
    try {
      setRunningBackfill(true);
      toast.info('Risoluzione inversa coordinate GPS offline in corso...');
      const res = await ApiClient.runGeotagBackfill();
      toast.success(`Aggiornate le località per ${res.updated_count} media!`);
    } catch (err) {
      toast.error(`Errore backfill GPS: ${(err as Error).message}`);
    } finally {
      setRunningBackfill(false);
    }
  };

  const handleCleanupStaleScans = async () => {
    try {
      setCleaningScans(true);
      const res = await ApiClient.cleanupStaleScans();
      if (res.recovered_count > 0) {
        toast.success(`Ripristinati ${res.recovered_count} processi di scansione interrotti!`);
      } else {
        toast.info('Nessuna scansione bloccata da ripristinare.');
      }
    } catch (err) {
      toast.error(`Errore ripristino scansioni: ${(err as Error).message}`);
    } finally {
      setCleaningScans(false);
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

      {/* WAL-Safe Database Backup & Maintenance Tools */}
      <div style={{
        background: '#1e293b',
        border: '1px solid #334155',
        borderRadius: '16px',
        padding: '24px'
      }}>
        <div style={{ marginBottom: '16px' }}>
          <h3 style={{ fontSize: '16px', fontWeight: 600, display: 'flex', alignItems: 'center', gap: '8px', margin: 0 }}>
            <Database size={18} color="#38bdf8" /> Backup & Manutenzione Catalogo
          </h3>
          <p style={{ color: '#94a3b8', fontSize: '12px', marginTop: '4px' }}>
            Proteggi il tuo catalogo SQLite e mantieni consistente l'indice locale senza mai toccare gli originali.
          </p>
        </div>

        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(220px, 1fr))', gap: '14px' }}>
          <div style={{
            background: '#0f172a',
            border: '1px solid #334155',
            borderRadius: '10px',
            padding: '16px',
            display: 'flex',
            flexDirection: 'column',
            justifyContent: 'space-between',
            gap: '12px'
          }}>
            <div>
              <div style={{ fontWeight: 600, fontSize: '14px', display: 'flex', alignItems: 'center', gap: '6px' }}>
                <Download size={16} color="#38bdf8" /> Backup Catalogo (.db)
              </div>
              <div style={{ color: '#94a3b8', fontSize: '11px', marginTop: '4px' }}>
                Copia WAL-safe a caldo del database SQLite consistente per esportazione rapida.
              </div>
            </div>
            <button
              onClick={handleDownloadBackup}
              disabled={downloadingBackup}
              style={{
                background: '#0284c7',
                color: 'white',
                border: 'none',
                borderRadius: '6px',
                padding: '8px 12px',
                fontSize: '12px',
                fontWeight: 600,
                cursor: downloadingBackup ? 'not-allowed' : 'pointer',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                gap: '6px'
              }}
            >
              <Download size={14} />
              {downloadingBackup ? 'Download in corso...' : 'Scarica Backup Database'}
            </button>
          </div>

          <div style={{
            background: '#0f172a',
            border: '1px solid #334155',
            borderRadius: '10px',
            padding: '16px',
            display: 'flex',
            flexDirection: 'column',
            justifyContent: 'space-between',
            gap: '12px'
          }}>
            <div>
              <div style={{ fontWeight: 600, fontSize: '14px', display: 'flex', alignItems: 'center', gap: '6px' }}>
                <MapPin size={16} color="#10b981" /> Risoluzione Località GPS
              </div>
              <div style={{ color: '#94a3b8', fontSize: '11px', marginTop: '4px' }}>
                Ricalcola offline nomi di città e nazioni per tutte le foto con coordinate lat/lon.
              </div>
            </div>
            <button
              onClick={handleBackfillGps}
              disabled={runningBackfill}
              style={{
                background: '#10b981',
                color: '#064e3b',
                border: 'none',
                borderRadius: '6px',
                padding: '8px 12px',
                fontSize: '12px',
                fontWeight: 700,
                cursor: runningBackfill ? 'not-allowed' : 'pointer',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                gap: '6px'
              }}
            >
              <RefreshCw size={14} className={runningBackfill ? 'animate-spin' : ''} />
              {runningBackfill ? 'Elaborazione...' : 'Aggiorna Località GPS'}
            </button>
          </div>

          <div style={{
            background: '#0f172a',
            border: '1px solid #334155',
            borderRadius: '10px',
            padding: '16px',
            display: 'flex',
            flexDirection: 'column',
            justifyContent: 'space-between',
            gap: '12px'
          }}>
            <div>
              <div style={{ fontWeight: 600, fontSize: '14px', display: 'flex', alignItems: 'center', gap: '6px' }}>
                <Wrench size={16} color="#f59e0b" /> Scansioni Bloccate
              </div>
              <div style={{ color: '#94a3b8', fontSize: '11px', marginTop: '4px' }}>
                Sblocca fonti e job rimasti in stato 'running' a seguito di riavvio improvviso o arresto forzato.
              </div>
            </div>
            <button
              onClick={handleCleanupStaleScans}
              disabled={cleaningScans}
              style={{
                background: '#334155',
                color: '#f8fafc',
                border: '1px solid #475569',
                borderRadius: '6px',
                padding: '8px 12px',
                fontSize: '12px',
                fontWeight: 600,
                cursor: cleaningScans ? 'not-allowed' : 'pointer',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                gap: '6px'
              }}
            >
              <RefreshCw size={14} className={cleaningScans ? 'animate-spin' : ''} />
              {cleaningScans ? 'Verifica...' : 'Ripristina Scansioni'}
            </button>
          </div>
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
