import React, { useEffect, useState } from 'react';
import { ApiClient } from '../../services/api';
import {
  HardDrive,
  FolderPlus,
  Play,
  X,
  Trash2,
  FolderSearch,
  Folder,
  ChevronRight,
  ArrowLeft,
  Info,
  Check,
  Laptop,
  HelpCircle
} from 'lucide-react';

interface SourcesViewProps {
  onStartScanForSource: (source: any) => void;
}

export const SourcesView: React.FC<SourcesViewProps> = ({ onStartScanForSource }) => {
  const [sources, setSources] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [name, setName] = useState('');
  const [sourceType, setSourceType] = useState('browser_folder');
  const [rootPath, setRootPath] = useState('');
  const [saving, setSaving] = useState(false);

  // Filesystem explorer & guide state
  const [showExplorer, setShowExplorer] = useState(false);
  const [showGuide, setShowGuide] = useState(false);
  const [fsLoading, setFsLoading] = useState(false);
  const [fsError, setFsError] = useState<string | null>(null);
  const [fsData, setFsData] = useState<{
    current_path: string;
    parent_path: string | null;
    subdirectories: { name: string; path: string }[];
    volumes: { name: string; path: string; is_removable: boolean; type: string }[];
    user_shortcuts: { name: string; path: string; type: string }[];
  } | null>(null);

  const loadFsPath = async (targetPath?: string) => {
    try {
      setFsLoading(true);
      setFsError(null);
      const res = await ApiClient.browseFilesystem(targetPath);
      setFsData(res);
    } catch (err: any) {
      console.error('Error browsing filesystem:', err);
      setFsError(err?.message || 'Errore nel caricamento dei dischi');
    } finally {
      setFsLoading(false);
    }
  };

  const handleOpenCreateModal = () => {
    setIsModalOpen(true);
    setName('');
    setRootPath('');
    setSourceType('browser_folder');
    setShowExplorer(false);
    setShowGuide(false);
    setFsError(null);
    loadFsPath(); // Pre-fetch available volumes & shortcuts
  };

  const handleSelectPath = (selectedPath: string, suggestedName?: string, isVolume: boolean = false) => {
    setRootPath(selectedPath);
    if (!name.trim() && suggestedName) {
      setName(suggestedName);
    }
    if (isVolume) {
      setSourceType('external_drive');
    }
  };

  const handlePickBrowserFolder = async () => {
    if ('showDirectoryPicker' in window) {
      try {
        const handle = await (window as any).showDirectoryPicker();
        if (handle && handle.name) {
          if (!name.trim()) setName(handle.name);
          setRootPath(handle.name);
          setSourceType('browser_folder');
        }
      } catch (err) {
        // User cancelled picker
      }
    } else {
      alert('Il tuo browser attuale non supporta la selezione diretta tramite cartella di sistema. Usa il pulsante Sfoglia Dischi del Mac o inserisci il percorso.');
    }
  };

  const loadSources = async () => {
    if (!ApiClient.getToken()) {
      setLoading(false);
      return;
    }
    try {
      setLoading(true);
      const data = await ApiClient.getSources();
      setSources(data);
    } catch (err) {
      console.error('Error loading sources:', err);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadSources();
  }, []);

  const handleToggleStatus = async (sourceId: string) => {
    try {
      await ApiClient.toggleSourceStatus(sourceId);
      await loadSources();
    } catch (err) {
      console.error('Error toggling status:', err);
    }
  };

  const handleDeleteSource = async (sourceId: string, sourceName: string) => {
    const confirmed = window.confirm(
      `Sei sicuro di voler eliminare la fonte "${sourceName}" dal catalogo?\n\n` +
      `ATTENZIONE: I file originali presenti sul tuo disco/cartella NON verranno MAI toccati né cancellati (modalità 100% Read-Only).\n` +
      `Verranno rimossi soltanto i record dal catalogo e le relative miniature nella cache dell'app.`
    );
    if (!confirmed) return;

    try {
      await ApiClient.deleteSource(sourceId);
      await loadSources();
    } catch (err: any) {
      console.error('Error deleting source:', err);
      alert(`Errore durante l'eliminazione della fonte: ${err?.message || 'Errore di connessione'}`);
    }
  };

  const handleCreateSource = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!name.trim()) return;
    setSaving(true);
    try {
      await ApiClient.createSource(name.trim(), sourceType, rootPath.trim() || undefined);
      setIsModalOpen(false);
      setName('');
      setRootPath('');
      await loadSources();
    } catch (err) {
      console.error('Error creating source:', err);
    } finally {
      setSaving(false);
    }
  };

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '24px' }}>
      {/* Header */}
      <div style={{
        display: 'flex',
        justifyContent: 'space-between',
        alignItems: 'center',
        flexWrap: 'wrap',
        gap: '16px'
      }}>
        <div>
          <h2 style={{ fontSize: '20px', fontWeight: 'bold' }}>Fonti di Archiviazione</h2>
          <p style={{ color: '#94a3b8', fontSize: '13px', marginTop: '4px' }}>
            Dischi esterni, SSD portatili, cartelle locali o archivi di rete indicizzati nel catalogo.
          </p>
        </div>

        <button
          onClick={handleOpenCreateModal}
          style={{
            background: '#0284c7',
            color: 'white',
            border: 'none',
            borderRadius: '8px',
            padding: '10px 18px',
            fontSize: '13px',
            fontWeight: 600,
            display: 'flex',
            alignItems: 'center',
            gap: '8px'
          }}
        >
          <FolderPlus size={16} />
          Registra Nuova Fonte
        </button>
      </div>

      {/* Sources Grid */}
      {sources.length === 0 && !loading ? (
        <div style={{
          textAlign: 'center',
          padding: '80px 20px',
          background: '#1e293b',
          borderRadius: '16px',
          border: '1px dashed #334155'
        }}>
          <HardDrive size={48} color="#64748b" style={{ margin: '0 auto 16px' }} />
          <h3 style={{ fontSize: '18px', fontWeight: 600 }}>Nessuna fonte registrata</h3>
          <p style={{ color: '#94a3b8', fontSize: '13px', marginTop: '6px' }}>
            Registra una fonte per iniziare a indicizzare i tuoi archivi fisici.
          </p>
        </div>
      ) : (
        <div style={{
          display: 'grid',
          gridTemplateColumns: 'repeat(auto-fill, minmax(320px, 1fr))',
          gap: '20px'
        }}>
          {sources.map((s) => (
            <div
              key={s.id}
              style={{
                background: '#1e293b',
                border: '1px solid #334155',
                borderRadius: '14px',
                padding: '20px',
                display: 'flex',
                flexDirection: 'column',
                justifyContent: 'space-between',
                gap: '16px'
              }}
            >
              <div>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: '12px' }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
                    <div style={{
                      padding: '10px',
                      background: 'rgba(56, 189, 248, 0.1)',
                      borderRadius: '10px'
                    }}>
                      <HardDrive size={22} color="#38bdf8" />
                    </div>
                    <div>
                      <h4 style={{ fontSize: '16px', fontWeight: 600 }}>{s.name}</h4>
                      <span style={{ fontSize: '11px', color: '#94a3b8' }}>
                        {s.source_type.replace('_', ' ').toUpperCase()}
                      </span>
                    </div>
                  </div>

                  <span style={{
                    fontSize: '11px',
                    fontWeight: 600,
                    padding: '3px 8px',
                    borderRadius: '6px',
                    background: s.status === 'online' ? 'rgba(34, 197, 94, 0.15)' : 'rgba(148, 163, 184, 0.15)',
                    color: s.status === 'online' ? '#22c55e' : '#94a3b8'
                  }}>
                    {s.status.toUpperCase()}
                  </span>
                </div>

                <div style={{
                  background: '#0f172a',
                  border: '1px solid #334155',
                  borderRadius: '8px',
                  padding: '10px 12px',
                  fontSize: '12px',
                  color: '#94a3b8'
                }}>
                  <div style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                    <strong>Percorso radice:</strong> {s.root_path || 'Selezionata dal browser'}
                  </div>
                  <div style={{ marginTop: '4px' }}>
                    <strong>File indicizzati:</strong> <span style={{ color: 'white', fontWeight: 600 }}>{s.file_count || 0}</span>
                  </div>
                  <div style={{ marginTop: '4px' }}>
                    <strong>Ultima scansione:</strong>{' '}
                    {s.last_scanned_at ? new Date(s.last_scanned_at).toLocaleString() : 'Mai scansionata'}
                  </div>
                </div>
              </div>

              <div style={{ display: 'flex', gap: '8px', marginTop: '12px' }}>
                <button
                  onClick={() => handleToggleStatus(s.id)}
                  style={{
                    flex: 1,
                    background: s.status === 'online' ? '#334155' : 'rgba(34, 197, 94, 0.15)',
                    color: s.status === 'online' ? '#94a3b8' : '#22c55e',
                    border: '1px solid #475569',
                    borderRadius: '8px',
                    padding: '8px',
                    fontSize: '12px',
                    fontWeight: 600
                  }}
                >
                  {s.status === 'online' ? 'Scollega' : 'Ricollega'}
                </button>

                <button
                  onClick={() => onStartScanForSource(s)}
                  style={{
                    flex: 1,
                    background: '#0284c7',
                    color: 'white',
                    border: 'none',
                    borderRadius: '8px',
                    padding: '8px',
                    fontSize: '12px',
                    fontWeight: 600,
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    gap: '6px'
                  }}
                >
                  <Play size={13} />
                  Scansiona
                </button>

                <button
                  onClick={() => handleDeleteSource(s.id, s.name)}
                  title="Elimina fonte dal catalogo"
                  style={{
                    background: 'rgba(239, 68, 68, 0.12)',
                    color: '#ef4444',
                    border: '1px solid rgba(239, 68, 68, 0.3)',
                    borderRadius: '8px',
                    padding: '8px 12px',
                    cursor: 'pointer',
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center'
                  }}
                >
                  <Trash2 size={14} />
                </button>
              </div>
            </div>
          ))}
        </div>
      )}

      {/* Modal Add Source */}
      {isModalOpen && (
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
            maxWidth: '520px',
            maxHeight: '90vh',
            overflowY: 'auto',
            padding: '24px',
            boxShadow: '0 25px 50px -12px rgba(0, 0, 0, 0.5)'
          }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '20px' }}>
              <h3 style={{ fontSize: '18px', fontWeight: 'bold' }}>Registra Nuova Fonte</h3>
              <button
                onClick={() => setIsModalOpen(false)}
                style={{ background: 'transparent', border: 'none', color: '#94a3b8', cursor: 'pointer' }}
              >
                <X size={20} />
              </button>
            </div>

            <form onSubmit={handleCreateSource} style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>
              <div>
                <label style={{ fontSize: '12px', color: '#94a3b8', display: 'block', marginBottom: '6px' }}>
                  Nome Identificativo della Fonte *
                </label>
                <input
                  type="text"
                  required
                  placeholder="Es. Hard Disk Esterno WD 4TB o SSD 512"
                  value={name}
                  onChange={(e) => setName(e.target.value)}
                  style={{
                    width: '100%',
                    background: '#0f172a',
                    border: '1px solid #334155',
                    borderRadius: '8px',
                    padding: '10px 12px',
                    color: 'white',
                    fontSize: '13px'
                  }}
                />
              </div>

              <div>
                <label style={{ fontSize: '12px', color: '#94a3b8', display: 'block', marginBottom: '6px' }}>
                  Tipologia Fonte
                </label>
                <select
                  value={sourceType}
                  onChange={(e) => setSourceType(e.target.value)}
                  style={{
                    width: '100%',
                    background: '#0f172a',
                    border: '1px solid #334155',
                    borderRadius: '8px',
                    padding: '10px 12px',
                    color: 'white',
                    fontSize: '13px'
                  }}
                >
                  <option value="browser_folder">Cartella Locale (Browser)</option>
                  <option value="external_drive">Hard Disk / SSD Esterno</option>
                  <option value="network_share">Condivisione di Rete / NAS</option>
                  <option value="internal_drive">Disco Interno</option>
                </select>
              </div>

              {/* Box 3: Percorso o Montaggio con Explorer e Guida */}
              <div>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '6px' }}>
                  <label style={{ fontSize: '12px', color: '#94a3b8' }}>
                    Etichetta Percorso o Montaggio (Opzionale)
                  </label>
                  <button
                    type="button"
                    onClick={() => setShowGuide(!showGuide)}
                    style={{
                      background: 'none',
                      border: 'none',
                      color: '#38bdf8',
                      fontSize: '11px',
                      cursor: 'pointer',
                      display: 'flex',
                      alignItems: 'center',
                      gap: '4px'
                    }}
                  >
                    <HelpCircle size={12} />
                    {showGuide ? 'Nascondi Guida' : 'Come scegliere?'}
                  </button>
                </div>

                <div style={{ position: 'relative' }}>
                  <input
                    type="text"
                    placeholder="Es. /Volumes/SSD_512_Sam/DL o Foto_2024"
                    value={rootPath}
                    onChange={(e) => setRootPath(e.target.value)}
                    style={{
                      width: '100%',
                      background: '#0f172a',
                      border: '1px solid #334155',
                      borderRadius: '8px',
                      padding: '10px 12px',
                      color: 'white',
                      fontSize: '13px'
                    }}
                  />
                </div>

                {/* Pulsanti Rapidi Sfoglia ed Explorer */}
                <div style={{ display: 'flex', flexWrap: 'wrap', gap: '8px', marginTop: '8px' }}>
                  <button
                    type="button"
                    onClick={() => {
                      if (!showExplorer && !fsData) loadFsPath();
                      setShowExplorer(!showExplorer);
                    }}
                    style={{
                      background: showExplorer ? '#0284c7' : 'rgba(56, 189, 248, 0.1)',
                      color: showExplorer ? 'white' : '#38bdf8',
                      border: '1px solid rgba(56, 189, 248, 0.3)',
                      borderRadius: '6px',
                      padding: '6px 10px',
                      fontSize: '11px',
                      fontWeight: 600,
                      display: 'flex',
                      alignItems: 'center',
                      gap: '5px',
                      cursor: 'pointer'
                    }}
                  >
                    <FolderSearch size={13} />
                    {showExplorer ? 'Chiudi Esplora Dischi' : '🔍 Sfoglia Dischi & Cartelle Mac'}
                  </button>

                  {'showDirectoryPicker' in window && (
                    <button
                      type="button"
                      onClick={handlePickBrowserFolder}
                      style={{
                        background: 'rgba(148, 163, 184, 0.1)',
                        color: '#94a3b8',
                        border: '1px solid #475569',
                        borderRadius: '6px',
                        padding: '6px 10px',
                        fontSize: '11px',
                        display: 'flex',
                        alignItems: 'center',
                        gap: '5px',
                        cursor: 'pointer'
                      }}
                    >
                      <Folder size={13} />
                      Scegli dal Computer (Browser)
                    </button>
                  )}
                </div>

                {/* Dischi esterni rimovibili rilevati automaticamente */}
                {fsData?.volumes && fsData.volumes.filter(v => v.is_removable).length > 0 && (
                  <div style={{ marginTop: '10px' }}>
                    <div style={{ fontSize: '11px', color: '#94a3b8', marginBottom: '4px' }}>
                      Dischi esterni collegati al Mac:
                    </div>
                    <div style={{ display: 'flex', flexWrap: 'wrap', gap: '6px' }}>
                      {fsData.volumes.filter(v => v.is_removable).map((vol) => (
                        <button
                          key={vol.path}
                          type="button"
                          onClick={() => handleSelectPath(vol.path, vol.name, true)}
                          style={{
                            background: rootPath.startsWith(vol.path) ? 'rgba(34, 197, 94, 0.15)' : 'rgba(30, 41, 59, 0.9)',
                            border: `1px solid ${rootPath.startsWith(vol.path) ? '#22c55e' : '#475569'}`,
                            color: rootPath.startsWith(vol.path) ? '#22c55e' : 'white',
                            borderRadius: '6px',
                            padding: '5px 9px',
                            fontSize: '11px',
                            display: 'flex',
                            alignItems: 'center',
                            gap: '6px',
                            cursor: 'pointer'
                          }}
                        >
                          <HardDrive size={13} color={rootPath.startsWith(vol.path) ? '#22c55e' : '#38bdf8'} />
                          <strong>{vol.name}</strong>
                          <span style={{ color: '#94a3b8', fontSize: '10px' }}>({vol.path})</span>
                          {rootPath.startsWith(vol.path) && <Check size={12} />}
                        </button>
                      ))}
                    </div>
                  </div>
                )}

                {/* Guida / Spiegazione */}
                {showGuide && (
                  <div style={{
                    background: 'rgba(56, 189, 248, 0.08)',
                    border: '1px solid rgba(56, 189, 248, 0.25)',
                    borderRadius: '8px',
                    padding: '12px',
                    marginTop: '10px',
                    fontSize: '11px',
                    color: '#cbd5e1',
                    lineHeight: '1.6'
                  }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: '6px', color: '#38bdf8', fontWeight: 600, marginBottom: '6px' }}>
                      <Info size={14} /> Come inserire il percorso corretto:
                    </div>
                    <div>
                      • <strong>Dischi Esterni USB o SSD (Mac)</strong>: Su macOS tutti i dischi esterni si trovano nella cartella <code>/Volumes/</code> (es. <code>/Volumes/SSD_512_Sam</code>). Clicca su <em>"Sfoglia Dischi"</em> per selezionarli all'istante.<br />
                      • <strong>Copia percorso da macOS Finder</strong>: Apri Finder, fai clic destro sul disco o sulla cartella tenendo premuto il tasto <code>Opzione (⌥)</code> e clicca su <em>"Copia [nome] come percorso"</em>. Poi incollalo qui.<br />
                      • <strong>Scansione da Browser (es. Safari/Chrome su iPhone o Mac)</strong>: Se scansionerai i file direttamente selezionandoli dalla schermata di scansione, questo campo è opzionale e serve solo da etichetta identificativa.
                    </div>
                  </div>
                )}

                {/* File Explorer integrato nel Modal */}
                {showExplorer && (
                  <div style={{
                    background: '#0f172a',
                    border: '1px solid #334155',
                    borderRadius: '10px',
                    padding: '12px',
                    marginTop: '10px',
                    display: 'flex',
                    flexDirection: 'column',
                    gap: '10px'
                  }}>
                    {fsError && (
                      <div style={{
                        padding: '8px 12px',
                        background: 'rgba(239, 68, 68, 0.1)',
                        border: '1px solid rgba(239, 68, 68, 0.3)',
                        borderRadius: '6px',
                        color: '#f87171',
                        fontSize: '11px',
                        display: 'flex',
                        justifyContent: 'space-between',
                        alignItems: 'center'
                      }}>
                        <span>{fsError}</span>
                        <button
                          type="button"
                          onClick={() => loadFsPath(fsData?.current_path)}
                          style={{
                            background: '#ef4444',
                            color: 'white',
                            border: 'none',
                            borderRadius: '4px',
                            padding: '3px 8px',
                            fontSize: '10px',
                            cursor: 'pointer'
                          }}
                        >
                          Riprova
                        </button>
                      </div>
                    )}
                    {/* Intestazione e Navigazione Percorso */}
                    <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: '8px' }}>
                      <div style={{ display: 'flex', alignItems: 'center', gap: '6px', overflow: 'hidden' }}>
                        {fsData?.parent_path && (
                          <button
                            type="button"
                            onClick={() => loadFsPath(fsData.parent_path!)}
                            title="Cartella Superiore"
                            style={{
                              background: '#1e293b',
                              border: '1px solid #475569',
                              color: 'white',
                              borderRadius: '6px',
                              padding: '4px 8px',
                              cursor: 'pointer',
                              display: 'flex',
                              alignItems: 'center',
                              gap: '4px',
                              fontSize: '11px'
                            }}
                          >
                            <ArrowLeft size={12} />
                            Su
                          </button>
                        )}
                        <span style={{ fontSize: '11px', color: '#94a3b8', whiteSpace: 'nowrap', textOverflow: 'ellipsis', overflow: 'hidden' }}>
                          {fsData?.current_path || '/Volumes'}
                        </span>
                      </div>

                      <button
                        type="button"
                        onClick={() => {
                          if (fsData?.current_path) {
                            handleSelectPath(fsData.current_path, fsData.current_path.split('/').pop(), false);
                            setShowExplorer(false);
                          }
                        }}
                        style={{
                          background: '#0284c7',
                          border: 'none',
                          color: 'white',
                          borderRadius: '6px',
                          padding: '4px 10px',
                          fontSize: '11px',
                          fontWeight: 600,
                          cursor: 'pointer',
                          whiteSpace: 'nowrap'
                        }}
                      >
                        ✓ Usa Questa Cartella
                      </button>
                    </div>

                    {/* Scorciatoie Dischi / Volumi */}
                    {fsData?.volumes && fsData.volumes.length > 0 && (
                      <div>
                        <div style={{ fontSize: '10px', textTransform: 'uppercase', color: '#64748b', fontWeight: 600, marginBottom: '4px' }}>
                          Dischi Rilevati
                        </div>
                        <div style={{ display: 'flex', flexWrap: 'wrap', gap: '6px' }}>
                          {fsData.volumes.map((v) => (
                            <button
                              key={v.path}
                              type="button"
                              onClick={() => loadFsPath(v.path)}
                              style={{
                                background: fsData.current_path === v.path ? 'rgba(56, 189, 248, 0.2)' : '#1e293b',
                                border: `1px solid ${fsData.current_path === v.path ? '#38bdf8' : '#334155'}`,
                                color: fsData.current_path === v.path ? '#38bdf8' : 'white',
                                borderRadius: '6px',
                                padding: '4px 8px',
                                fontSize: '11px',
                                display: 'flex',
                                alignItems: 'center',
                                gap: '5px',
                                cursor: 'pointer'
                              }}
                            >
                              {v.is_removable ? <HardDrive size={12} color="#38bdf8" /> : <Laptop size={12} color="#94a3b8" />}
                              <span>{v.name}</span>
                              <ChevronRight size={10} color="#64748b" />
                            </button>
                          ))}
                        </div>
                      </div>
                    )}

                    {/* Scorciatoie Utente Mac */}
                    {fsData?.user_shortcuts && fsData.user_shortcuts.length > 0 && (
                      <div>
                        <div style={{ fontSize: '10px', textTransform: 'uppercase', color: '#64748b', fontWeight: 600, marginBottom: '4px' }}>
                          Cartelle Personali Mac
                        </div>
                        <div style={{ display: 'flex', flexWrap: 'wrap', gap: '6px' }}>
                          {fsData.user_shortcuts.map((u) => (
                            <button
                              key={u.path}
                              type="button"
                              onClick={() => loadFsPath(u.path)}
                              style={{
                                background: fsData.current_path === u.path ? 'rgba(56, 189, 248, 0.2)' : '#1e293b',
                                border: `1px solid ${fsData.current_path === u.path ? '#38bdf8' : '#334155'}`,
                                color: fsData.current_path === u.path ? '#38bdf8' : 'white',
                                borderRadius: '6px',
                                padding: '4px 8px',
                                fontSize: '11px',
                                display: 'flex',
                                alignItems: 'center',
                                gap: '5px',
                                cursor: 'pointer'
                              }}
                            >
                              <Folder size={12} color="#f59e0b" />
                              <span>{u.name}</span>
                              <ChevronRight size={10} color="#64748b" />
                            </button>
                          ))}
                        </div>
                      </div>
                    )}

                    {/* Lista Sottocartelle navigabili */}
                    <div>
                      <div style={{ fontSize: '10px', textTransform: 'uppercase', color: '#64748b', fontWeight: 600, marginBottom: '4px' }}>
                        Cartelle in {fsData?.current_path ? fsData.current_path.split('/').pop() || fsData.current_path : 'questo percorso'}:
                      </div>

                      {fsLoading ? (
                        <div style={{ fontSize: '11px', color: '#94a3b8', padding: '10px 0', textAlign: 'center' }}>
                          Caricamento cartelle in corso...
                        </div>
                      ) : fsData?.subdirectories && fsData.subdirectories.length > 0 ? (
                        <div style={{
                          display: 'grid',
                          gridTemplateColumns: 'repeat(auto-fill, minmax(180px, 1fr))',
                          gap: '6px',
                          maxHeight: '160px',
                          overflowY: 'auto',
                          paddingRight: '4px'
                        }}>
                          {fsData.subdirectories.map((dir) => (
                            <div
                              key={dir.path}
                              style={{
                                display: 'flex',
                                alignItems: 'center',
                                justifyContent: 'space-between',
                                background: '#1e293b',
                                border: '1px solid #334155',
                                borderRadius: '6px',
                                padding: '4px 8px'
                              }}
                            >
                              <button
                                type="button"
                                onClick={() => loadFsPath(dir.path)}
                                style={{
                                  background: 'none',
                                  border: 'none',
                                  color: 'white',
                                  fontSize: '11px',
                                  display: 'flex',
                                  alignItems: 'center',
                                  gap: '6px',
                                  cursor: 'pointer',
                                  overflow: 'hidden',
                                  textOverflow: 'ellipsis',
                                  whiteSpace: 'nowrap',
                                  flex: 1,
                                  textAlign: 'left'
                                }}
                              >
                                <Folder size={13} color="#38bdf8" style={{ flexShrink: 0 }} />
                                <span style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                                  {dir.name}
                                </span>
                              </button>
                              <button
                                type="button"
                                onClick={() => {
                                  handleSelectPath(dir.path, dir.name, false);
                                  setShowExplorer(false);
                                }}
                                title="Seleziona questa cartella"
                                style={{
                                  background: 'rgba(34, 197, 94, 0.15)',
                                  border: '1px solid rgba(34, 197, 94, 0.3)',
                                  color: '#22c55e',
                                  borderRadius: '4px',
                                  padding: '2px 5px',
                                  fontSize: '10px',
                                  fontWeight: 600,
                                  cursor: 'pointer',
                                  marginLeft: '4px',
                                  flexShrink: 0
                                }}
                              >
                                Scegli
                              </button>
                            </div>
                          ))}
                        </div>
                      ) : (
                        <div style={{ fontSize: '11px', color: '#64748b', fontStyle: 'italic', padding: '6px 0' }}>
                          Nessuna sottocartella trovata in questa cartella.
                        </div>
                      )}
                    </div>
                  </div>
                )}
              </div>

              <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '10px', marginTop: '10px' }}>
                <button
                  type="button"
                  onClick={() => setIsModalOpen(false)}
                  style={{
                    background: '#334155',
                    color: '#94a3b8',
                    border: 'none',
                    borderRadius: '8px',
                    padding: '10px 16px',
                    fontSize: '13px',
                    cursor: 'pointer'
                  }}
                >
                  Annulla
                </button>
                <button
                  type="submit"
                  disabled={saving}
                  style={{
                    background: '#0284c7',
                    color: 'white',
                    border: 'none',
                    borderRadius: '8px',
                    padding: '10px 18px',
                    fontSize: '13px',
                    fontWeight: 600,
                    cursor: 'pointer'
                  }}
                >
                  {saving ? 'Salvataggio...' : 'Crea Fonte'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
};
