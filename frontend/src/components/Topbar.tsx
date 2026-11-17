import React from 'react';
import { Plus } from 'lucide-react';

interface TopbarProps {
  currentTab: string;
  onOpenScanner: () => void;
}

export const Topbar: React.FC<TopbarProps> = ({ currentTab, onOpenScanner }) => {
  const getTabTitle = (tab: string) => {
    switch (tab) {
      case 'dashboard': return 'Dashboard & Metriche';
      case 'library': return 'Libreria Multimediale';
      case 'photos': return 'Archivio Fotografico';
      case 'videos': return 'Archivio Video';
      case 'duplicates': return 'Individuazione Duplicati Esatti';
      case 'sources': return 'Fonti e Dispositivi';
      case 'scans': return 'Registro Scansioni';
      case 'settings': return 'Impostazioni di Sistema';
      default: return 'Personal Media Manager';
    }
  };

  return (
    <header style={{
      height: '64px',
      borderBottom: '1px solid #1e293b',
      background: '#0f172a',
      padding: '0 32px',
      display: 'flex',
      alignItems: 'center',
      justifyContent: 'space-between',
      position: 'sticky',
      top: 0,
      zIndex: 100
    }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
        <h2 style={{ fontSize: '18px', fontWeight: 'bold', color: '#f8fafc' }}>
          {getTabTitle(currentTab)}
        </h2>
      </div>

      <div style={{ display: 'flex', alignItems: 'center', gap: '14px' }}>
        <button
          onClick={onOpenScanner}
          style={{
            background: 'linear-gradient(135deg, #0284c7 0%, #38bdf8 100%)',
            color: 'white',
            border: 'none',
            borderRadius: '8px',
            padding: '8px 16px',
            fontSize: '13px',
            fontWeight: 600,
            display: 'flex',
            alignItems: 'center',
            gap: '6px',
            boxShadow: '0 2px 6px rgba(2, 132, 199, 0.4)'
          }}
        >
          <Plus size={16} />
          Nuova Scansione
        </button>
      </div>
    </header>
  );
};
