import React, { useState, useEffect, useRef } from 'react';
import { ApiClient } from './services/api';
import { useToast } from './context/ToastContext';
import { Sidebar } from './components/Sidebar';
import { Topbar } from './components/Topbar';
import { AuthModal } from './features/auth/AuthModal';
import { DashboardView } from './features/dashboard/DashboardView';
import { LibraryView } from './features/library/LibraryView';
import { DuplicatesView } from './features/duplicates/DuplicatesView';
import { SourcesView } from './features/sources/SourcesView';
import { ScansView } from './features/scans/ScansView';
import { SettingsView } from './features/settings/SettingsView';
import { MapView } from './features/map/MapView';
import { AlbumsView } from './features/albums/AlbumsView';
import { TutorialModal } from './components/TutorialModal';
import { Grid, Heart, MapPin, LayoutDashboard } from 'lucide-react';

export const App: React.FC = () => {
  const { toast } = useToast();
  const lastProactiveEventIdRef = useRef<string | undefined>(undefined);
  const [currentUser, setCurrentUser] = useState<any | null>(null);
  const [isAuthModalOpen, setIsAuthModalOpen] = useState(false);
  const [isTutorialOpen, setIsTutorialOpen] = useState(false);
  const [currentTab, setCurrentTab] = useState<string>('dashboard');
  const [sourceToScan, setSourceToScan] = useState<any | null>(null);
  const [selectedAlbumId, setSelectedAlbumId] = useState<string | null>(null);
  const [selectedTagId, setSelectedTagId] = useState<string | null>(null);
  const [geoFilter, setGeoFilter] = useState<{ latMin: number; latMax: number; lonMin: number; lonMax: number; label?: string } | null>(null);
  const [isMobileSidebarOpen, setIsMobileSidebarOpen] = useState(false);
  const [initializing, setInitializing] = useState(true);

  // Check login on load
  useEffect(() => {
    const token = ApiClient.getToken();
    if (token) {
      ApiClient.getMe()
        .then((user) => {
          setCurrentUser(user);
        })
        .catch(() => {
          ApiClient.setToken(null);
          setIsAuthModalOpen(true);
        })
        .finally(() => setInitializing(false));
    } else {
      setIsAuthModalOpen(true);
      setInitializing(false);
    }
  }, []);

  // Poll proactive background monitor events (USB drive mount/unmount & local folder integrity)
  useEffect(() => {
    if (!currentUser) return;
    let cancelled = false;

    // Seed initial cursor without replaying historical events
    ApiClient.getSourceEvents()
      .then((res) => {
        if (!cancelled && res.events.length > 0) {
          lastProactiveEventIdRef.current = res.events[res.events.length - 1].id;
        }
      })
      .catch(() => {});

    const interval = setInterval(async () => {
      try {
        const res = await ApiClient.getSourceEvents(lastProactiveEventIdRef.current);
        if (cancelled || !res.events || res.events.length === 0) return;
        lastProactiveEventIdRef.current = res.events[res.events.length - 1].id;
        for (const ev of res.events) {
          if (ev.event_type === 'disk_connected') {
            toast.success(ev.message);
          } else if (ev.event_type === 'external_changes_detected') {
            toast.info(ev.message);
          } else {
            toast.info(ev.message);
          }
        }
      } catch {
        // Ignore transient network errors during polling
      }
    }, 15000);

    return () => {
      cancelled = true;
      clearInterval(interval);
    };
  }, [currentUser]);

  const handleLogout = () => {
    ApiClient.setToken(null);
    setCurrentUser(null);
    setIsAuthModalOpen(true);
  };

  const handleAuthSuccess = (user: any) => {
    setCurrentUser(user);
    setIsAuthModalOpen(false);
  };

  const handleStartScanForSource = (source: any) => {
    setSourceToScan(source);
    setCurrentTab('scans');
  };

  const handleNavigateToLocation = (lat: number, lon: number, radiusKm = 3) => {
    // 1 deg lat ~= 111km, 1 deg lon ~= 111 * cos(lat)
    const latDelta = radiusKm / 111.0;
    const lonDelta = radiusKm / (111.0 * Math.cos((lat * Math.PI) / 180.0));
    setGeoFilter({
      latMin: lat - latDelta,
      latMax: lat + latDelta,
      lonMin: lon - lonDelta,
      lonMax: lon + lonDelta,
      label: `${lat.toFixed(4)}, ${lon.toFixed(4)} (raggio ~${radiusKm}km)`
    });
    setCurrentTab('library');
  };

  if (initializing) {
    return (
      <div style={{
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        height: '100vh',
        background: '#0f172a',
        color: '#94a3b8',
        fontSize: '14px'
      }}>
        Inizializzazione Personal Media Manager...
      </div>
    );
  }

  return (
    <div style={{ display: 'flex', minHeight: '100vh', background: '#0b1120' }}>
      {/* Sidebar Navigation */}
      <Sidebar
        currentTab={currentTab}
        onTabChange={(tab) => {
          setCurrentTab(tab);
          setIsMobileSidebarOpen(false);
        }}
        currentUser={currentUser}
        onLogout={handleLogout}
        isOpenMobile={isMobileSidebarOpen}
        onCloseMobile={() => setIsMobileSidebarOpen(false)}
      />

      {/* Main Content Area */}
      <div style={{ flex: 1, display: 'flex', flexDirection: 'column', minWidth: 0 }}>
        <Topbar
          currentTab={currentTab}
          onOpenScanner={() => setCurrentTab('scans')}
          onOpenTutorial={() => setIsTutorialOpen(true)}
          onToggleMobileSidebar={() => setIsMobileSidebarOpen(!isMobileSidebarOpen)}
        />

        <main className="main-content-layout" style={{ flex: 1, padding: '32px', overflowY: 'auto', display: 'flex', flexDirection: 'column' }}>
          {currentTab === 'dashboard' && (
            <DashboardView
              onNavigate={setCurrentTab}
              onOpenScanner={() => setCurrentTab('scans')}
              onOpenTutorial={() => setIsTutorialOpen(true)}
            />
          )}

          {(currentTab === 'library' || currentTab === 'photos') && (
            <LibraryView
              initialType="all"
              initialGeoFilter={geoFilter}
              initialAlbumId={selectedAlbumId}
              initialTagId={selectedTagId}
              onClearGeoFilter={() => setGeoFilter(null)}
              onClearAlbumFilter={() => setSelectedAlbumId(null)}
              onClearTagFilter={() => setSelectedTagId(null)}
            />
          )}

          {currentTab === 'videos' && (
            <LibraryView
              initialType="video"
              initialGeoFilter={geoFilter}
              initialAlbumId={selectedAlbumId}
              initialTagId={selectedTagId}
              onClearGeoFilter={() => setGeoFilter(null)}
              onClearAlbumFilter={() => setSelectedAlbumId(null)}
              onClearTagFilter={() => setSelectedTagId(null)}
            />
          )}

          {currentTab === 'favorites' && (
            <LibraryView
              initialType="all"
              initialFavorite={true}
              initialGeoFilter={geoFilter}
              initialAlbumId={selectedAlbumId}
              initialTagId={selectedTagId}
              onClearGeoFilter={() => setGeoFilter(null)}
              onClearAlbumFilter={() => setSelectedAlbumId(null)}
              onClearTagFilter={() => setSelectedTagId(null)}
            />
          )}

          {currentTab === 'albums' && (
            <AlbumsView
              onSelectAlbum={(albumId) => {
                setSelectedAlbumId(albumId);
                setSelectedTagId(null);
                setCurrentTab('library');
              }}
              onSelectTag={(tagId) => {
                setSelectedTagId(tagId);
                setSelectedAlbumId(null);
                setCurrentTab('library');
              }}
            />
          )}

          {currentTab === 'map' && (
            <MapView onNavigateToLocation={handleNavigateToLocation} />
          )}

          {currentTab === 'duplicates' && (
            <DuplicatesView />
          )}

          {currentTab === 'sources' && (
            <SourcesView
              onStartScanForSource={handleStartScanForSource}
            />
          )}

          {currentTab === 'scans' && (
            <ScansView
              selectedSourceForScan={sourceToScan}
              onScanCompleted={() => setSourceToScan(null)}
            />
          )}

          {currentTab === 'settings' && (
            <SettingsView currentUser={currentUser} />
          )}
        </main>
      </div>

      {/* Mobile Bottom Navigation Bar (iOS / Android Native Style) */}
      <nav className="mobile-bottom-nav" style={{
        position: 'fixed',
        bottom: 0,
        left: 0,
        right: 0,
        height: '60px',
        background: '#0f172a',
        borderTop: '1px solid #1e293b',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'space-around',
        zIndex: 140,
        paddingBottom: 'env(safe-area-inset-bottom)'
      }}>
        <button
          onClick={() => setCurrentTab('library')}
          style={{
            background: 'transparent',
            border: 'none',
            display: 'flex',
            flexDirection: 'column',
            alignItems: 'center',
            gap: '3px',
            color: currentTab === 'library' || currentTab === 'photos' ? '#38bdf8' : '#94a3b8',
            fontSize: '11px',
            fontWeight: 600
          }}
        >
          <Grid size={18} />
          Libreria
        </button>

        <button
          onClick={() => setCurrentTab('favorites')}
          style={{
            background: 'transparent',
            border: 'none',
            display: 'flex',
            flexDirection: 'column',
            alignItems: 'center',
            gap: '3px',
            color: currentTab === 'favorites' ? '#f43f5e' : '#94a3b8',
            fontSize: '11px',
            fontWeight: 600
          }}
        >
          <Heart size={18} fill={currentTab === 'favorites' ? '#f43f5e' : 'none'} />
          Preferiti
        </button>

        <button
          onClick={() => setCurrentTab('map')}
          style={{
            background: 'transparent',
            border: 'none',
            display: 'flex',
            flexDirection: 'column',
            alignItems: 'center',
            gap: '3px',
            color: currentTab === 'map' ? '#22c55e' : '#94a3b8',
            fontSize: '11px',
            fontWeight: 600
          }}
        >
          <MapPin size={18} />
          Mappa
        </button>

        <button
          onClick={() => setCurrentTab('dashboard')}
          style={{
            background: 'transparent',
            border: 'none',
            display: 'flex',
            flexDirection: 'column',
            alignItems: 'center',
            gap: '3px',
            color: currentTab === 'dashboard' ? '#38bdf8' : '#94a3b8',
            fontSize: '11px',
            fontWeight: 600
          }}
        >
          <LayoutDashboard size={18} />
          Altro
        </button>
      </nav>

      {/* Tutorial Guide Modal */}
      <TutorialModal
        isOpen={isTutorialOpen}
        onClose={() => setIsTutorialOpen(false)}
      />

      {/* Auth Modal */}
      <AuthModal
        isOpen={isAuthModalOpen}
        onSuccess={handleAuthSuccess}
      />
    </div>
  );
};
