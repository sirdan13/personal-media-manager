import React, { useState, useEffect } from 'react';
import { ApiClient } from './services/api';
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
import { TutorialModal } from './components/TutorialModal';

export const App: React.FC = () => {
  const [currentUser, setCurrentUser] = useState<any | null>(null);
  const [isAuthModalOpen, setIsAuthModalOpen] = useState(false);
  const [isTutorialOpen, setIsTutorialOpen] = useState(false);
  const [currentTab, setCurrentTab] = useState<string>('dashboard');
  const [sourceToScan, setSourceToScan] = useState<any | null>(null);
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
        onTabChange={setCurrentTab}
        currentUser={currentUser}
        onLogout={handleLogout}
      />

      {/* Main Content Area */}
      <div style={{ flex: 1, display: 'flex', flexDirection: 'column', minWidth: 0 }}>
        <Topbar
          currentTab={currentTab}
          onOpenScanner={() => setCurrentTab('scans')}
          onOpenTutorial={() => setIsTutorialOpen(true)}
        />

        <main style={{ flex: 1, padding: '32px', overflowY: 'auto' }}>
          {currentTab === 'dashboard' && (
            <DashboardView
              onNavigate={setCurrentTab}
              onOpenScanner={() => setCurrentTab('scans')}
              onOpenTutorial={() => setIsTutorialOpen(true)}
            />
          )}

          {currentTab === 'library' && (
            <LibraryView initialType="all" />
          )}

          {currentTab === 'photos' && (
            <LibraryView initialType="image" />
          )}

          {currentTab === 'videos' && (
            <LibraryView initialType="video" />
          )}

          {currentTab === 'map' && (
            <MapView />
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
