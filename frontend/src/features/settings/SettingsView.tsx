import React, { useEffect, useState } from 'react';
import { detectBrowserCapabilities, BrowserCapabilities } from '../scanner/directoryTraverser';
import {
  Cpu,
  Server,
  User
} from 'lucide-react';

interface SettingsViewProps {
  currentUser: any;
}

export const SettingsView: React.FC<SettingsViewProps> = ({ currentUser }) => {
  const [capabilities, setCapabilities] = useState<BrowserCapabilities | null>(null);
  const [backendHealth, setBackendHealth] = useState<any | null>(null);

  useEffect(() => {
    setCapabilities(detectBrowserCapabilities());
    fetch('http://localhost:8000/health')
      .then((res) => res.json())
      .then(setBackendHealth)
      .catch(() => setBackendHealth({ status: 'offline' }));
  }, []);

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
