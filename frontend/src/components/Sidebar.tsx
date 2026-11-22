import React from 'react';
import {
  LayoutDashboard,
  Grid,
  Video,
  Copy,
  HardDrive,
  Clock,
  Settings,
  LogOut,
  MapPin,
  Heart,
  Folder
} from 'lucide-react';

interface SidebarProps {
  currentTab: string;
  onTabChange: (tab: string) => void;
  currentUser: any;
  onLogout: () => void;
  isOpenMobile?: boolean;
  onCloseMobile?: () => void;
}

export const Sidebar: React.FC<SidebarProps> = ({
  currentTab,
  onTabChange,
  currentUser,
  onLogout,
  isOpenMobile = false,
  onCloseMobile
}) => {
  const menuItems: Array<{ id: string; label: string; icon: any; color?: string; badge?: string }> = [
    { id: 'dashboard', label: 'Dashboard', icon: LayoutDashboard },
    { id: 'library', label: 'Libreria', icon: Grid },
    { id: 'videos', label: 'Video', icon: Video },
    { id: 'favorites', label: 'Preferiti', icon: Heart, color: '#f43f5e' },
    { id: 'albums', label: 'Album & Tag', icon: Folder },
    { id: 'map', label: 'Mappa GPS', icon: MapPin },
    { id: 'duplicates', label: 'Duplicati', icon: Copy },
    { id: 'sources', label: 'Fonti & Dischi', icon: HardDrive },
    { id: 'scans', label: 'Scansioni', icon: Clock },
    { id: 'settings', label: 'Impostazioni', icon: Settings }
  ];

  return (
    <>
      {/* Mobile backdrop */}
      {isOpenMobile && (
        <div
          onClick={onCloseMobile}
          style={{
            position: 'fixed',
            inset: 0,
            background: 'rgba(0, 0, 0, 0.65)',
            backdropFilter: 'blur(3px)',
            zIndex: 150
          }}
        />
      )}

      <aside
        style={{
          width: '260px',
          background: '#0f172a',
          borderRight: '1px solid #1e293b',
          display: 'flex',
          flexDirection: 'column',
          justifyContent: 'space-between',
          padding: '24px 16px',
          height: '100vh',
          position: 'fixed',
          top: 0,
          left: 0,
          zIndex: 160,
          transform: isOpenMobile ? 'translateX(0)' : undefined,
          transition: 'transform 0.25s ease-in-out',
          flexShrink: 0
        }}
        className={isOpenMobile ? 'sidebar-open' : 'sidebar-desktop'}
      >
      <div>
        {/* Logo and Brand */}
        <div style={{ display: 'flex', alignItems: 'center', gap: '10px', padding: '0 8px 24px', borderBottom: '1px solid #1e293b' }}>
          <div style={{
            width: '36px',
            height: '36px',
            borderRadius: '10px',
            background: 'linear-gradient(135deg, #0284c7 0%, #38bdf8 100%)',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            color: 'white'
          }}>
            <HardDrive size={20} />
          </div>
          <div>
            <div style={{ fontWeight: 'bold', fontSize: '15px', color: '#f8fafc', letterSpacing: '-0.3px' }}>
              Media Manager
            </div>
            <div style={{ fontSize: '11px', color: '#0284c7', fontWeight: 600 }}>
              Personal Edition
            </div>
          </div>
        </div>

        {/* Navigation Items */}
        <nav style={{ display: 'flex', flexDirection: 'column', gap: '4px', marginTop: '20px' }}>
          {menuItems.map((item) => {
            const Icon = item.icon;
            const isActive = currentTab === item.id;
            return (
              <button
                key={item.id}
                onClick={() => {
                  onTabChange(item.id);
                  if (onCloseMobile) onCloseMobile();
                }}
                style={{
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'space-between',
                  padding: '10px 14px',
                  borderRadius: '10px',
                  border: 'none',
                  background: isActive ? '#1e293b' : 'transparent',
                  color: isActive ? '#38bdf8' : '#94a3b8',
                  fontSize: '13px',
                  fontWeight: isActive ? 600 : 500,
                  textAlign: 'left',
                  transition: 'all 0.15s ease'
                }}
              >
                <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
                  <Icon size={18} color={isActive ? '#38bdf8' : '#64748b'} />
                  <span>{item.label}</span>
                </div>
                {item.badge && (
                  <span style={{
                    fontSize: '10px',
                    background: 'rgba(245, 158, 11, 0.15)',
                    color: '#f59e0b',
                    padding: '2px 6px',
                    borderRadius: '4px',
                    fontWeight: 600
                  }}>
                    {item.badge}
                  </span>
                )}
              </button>
            );
          })}
        </nav>
      </div>

      {/* User Card & Logout */}
      <div style={{ borderTop: '1px solid #1e293b', paddingTop: '16px' }}>
        <div style={{
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          padding: '8px 10px',
          background: '#1e293b',
          borderRadius: '10px'
        }}>
          <div
            title={currentUser?.email || currentUser?.display_name || 'Utente'}
            style={{
              display: 'flex',
              alignItems: 'center',
              gap: '10px',
              minWidth: 0,
              paddingRight: '8px',
              cursor: 'default'
            }}
          >
            <div style={{
              width: '28px',
              height: '28px',
              borderRadius: '50%',
              background: '#334155',
              color: '#38bdf8',
              fontSize: '12px',
              fontWeight: 700,
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              flexShrink: 0
            }}>
              {(currentUser?.display_name || currentUser?.username || 'U').charAt(0).toUpperCase()}
            </div>
            <div style={{
              fontSize: '13px',
              fontWeight: 600,
              color: '#f8fafc',
              overflow: 'hidden',
              textOverflow: 'ellipsis',
              whiteSpace: 'nowrap'
            }}>
              {currentUser?.display_name || 'Utente'}
            </div>
          </div>
          <button
            onClick={onLogout}
            title="Disconnetti"
            style={{
              background: 'transparent',
              border: 'none',
              color: '#94a3b8',
              padding: '6px',
              borderRadius: '6px',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center'
            }}
          >
            <LogOut size={16} />
          </button>
        </div>
      </div>
    </aside>
    </>
  );
};
