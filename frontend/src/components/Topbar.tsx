import React from 'react';
import { Plus, HelpCircle, Menu } from 'lucide-react';

interface TopbarProps {
  currentTab: string;
  onOpenScanner: () => void;
  onOpenTutorial?: () => void;
  onToggleMobileSidebar?: () => void;
}

export const Topbar: React.FC<TopbarProps> = ({
  currentTab,
  onOpenScanner,
  onOpenTutorial,
  onToggleMobileSidebar
}) => {
  const getTabTitle = (tab: string) => {
    switch (tab) {
      case 'dashboard': return 'Dashboard';
      case 'library':
      case 'photos': return 'Libreria';
      case 'videos': return 'Video';
      case 'favorites': return 'Preferiti';
      case 'albums': return 'Album & Tag';
      case 'map': return 'Mappa GPS';
      case 'duplicates': return 'Duplicati';
      case 'sources': return 'Fonti & Dischi';
      case 'scans': return 'Scansioni';
      case 'settings': return 'Impostazioni';
      default: return 'Media Manager';
    }
  };

  return (
    <header className="topbar-container" style={{
      height: '64px',
      borderBottom: '1px solid #1e293b',
      background: '#0f172a',
      padding: '0 28px',
      display: 'flex',
      alignItems: 'center',
      justifyContent: 'space-between',
      position: 'sticky',
      top: 0,
      zIndex: 100
    }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
        {onToggleMobileSidebar && (
          <button
            onClick={onToggleMobileSidebar}
            style={{
              background: 'transparent',
              border: 'none',
              color: '#94a3b8',
              padding: '6px',
              display: 'flex',
              alignItems: 'center',
              cursor: 'pointer'
            }}
            className="mobile-menu-btn"
          >
            <Menu size={22} />
          </button>
        )}
        <h2 className="topbar-title" style={{ fontSize: '18px', fontWeight: 'bold', color: '#f8fafc', margin: 0 }}>
          {getTabTitle(currentTab)}
        </h2>
      </div>

      <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
        {onOpenTutorial && (
          <button
            onClick={onOpenTutorial}
            className="topbar-btn"
            style={{
              background: 'rgba(56, 189, 248, 0.1)',
              color: '#38bdf8',
              border: '1px solid rgba(56, 189, 248, 0.3)',
              borderRadius: '8px',
              padding: '8px 12px',
              fontSize: '13px',
              fontWeight: 600,
              display: 'flex',
              alignItems: 'center',
              gap: '6px',
              cursor: 'pointer'
            }}
          >
            <HelpCircle size={16} />
            <span className="topbar-btn-text">Guida</span>
          </button>
        )}

        <button
          onClick={onOpenScanner}
          className="topbar-btn"
          style={{
            background: 'linear-gradient(135deg, #0284c7 0%, #38bdf8 100%)',
            color: 'white',
            border: 'none',
            borderRadius: '8px',
            padding: '8px 14px',
            fontSize: '13px',
            fontWeight: 600,
            display: 'flex',
            alignItems: 'center',
            gap: '6px',
            boxShadow: '0 2px 6px rgba(2, 132, 199, 0.4)'
          }}
        >
          <Plus size={16} />
          <span className="topbar-btn-text">Nuova Scansione</span>
        </button>
      </div>
    </header>
  );
};
