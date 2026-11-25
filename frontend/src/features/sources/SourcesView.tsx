import React, { useEffect, useState } from 'react';
import { ApiClient } from '../../services/api';
import { useToast } from '../../context/ToastContext';
import {
  HardDrive,
  FolderPlus,
  Play,
  X,
  Trash2,
  FolderSearch,
  Folder,
  FolderX,
  ArrowLeft,
  Info,
  Check,
  HelpCircle,
  RefreshCw,
  Copy,
  Database,
  Clock,
  ShieldCheck,
  Search
} from 'lucide-react';

interface SourcesViewProps {
  onStartScanForSource: (source: any) => void;
}

export const SourcesView: React.FC<SourcesViewProps> = ({ onStartScanForSource }) => {
  const { toast } = useToast();
  const [sources, setSources] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [name, setName] = useState('');
  const [sourceType, setSourceType] = useState('external_drive');
  const [rootPath, setRootPath] = useState('');
  const [role, setRole] = useState<'primary' | 'backup' | 'archive'>('primary');
  const [createExcludedPaths, setCreateExcludedPaths] = useState('');
  const [saving, setSaving] = useState(false);

  // Exclusions management modal state
  const [exclusionsModalSource, setExclusionsModalSource] = useState<any | null>(null);
  const [sourceFolders, setSourceFolders] = useState<{ folder: string; file_count: number }[]>([]);
  const [loadingFolders, setLoadingFolders] = useState(false);
  const [editExclusionsText, setEditExclusionsText] = useState('');
  const [folderSearchFilter, setFolderSearchFilter] = useState('');
  const [purgeExisting, setPurgeExisting] = useState(true);
  const [savingExclusions, setSavingExclusions] = useState(false);

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
    setRole('primary');
    setSourceType('external_drive');
    setCreateExcludedPaths('');
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
      toast.info('Usa il pulsante Sfoglia Dischi del Mac o inserisci il percorso del volume.');
    }
  };

  const loadSources = async (showToast: boolean = false) => {
    if (!ApiClient.getToken()) {
      setLoading(false);
      return;
    }
    try {
      setLoading(true);
      const data = await ApiClient.getSources();
      setSources(data);
      if (showToast) {
        const connectedCount = data.filter((s: any) => s.status === 'online').length;
        toast.success(`Stato aggiornato: ${connectedCount} di ${data.length} dischi collegati al Mac.`);
      }
    } catch (err) {
      console.error('Error loading sources:', err);
      if (showToast) toast.error('Impossibile aggiornare lo stato dei dischi.');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadSources();
  }, []);

  const handleCheckDriveConnection = async (source: any) => {
    try {
      const refreshed = await ApiClient.getSources();
      setSources(refreshed);
      const updated = refreshed.find((s: any) => s.id === source.id);
      if (updated && updated.status === 'online') {
        toast.success(`Disco "${source.name}" rilevato e collegato al Mac!`);
      } else {
        toast.info(`Disco "${source.name}" non ancora rilevato in ${source.root_path || '/Volumes'}. Assicurati di aver collegato il cavo USB.`);
      }
    } catch (err) {
      console.error('Error checking drive:', err);
      toast.error('Errore durante la verifica del disco');
    }
  };

  const handleCopyPath = (path: string) => {
    navigator.clipboard.writeText(path);
    toast.success('Percorso copiato negli appunti!');
  };

  const formatDate = (dateStr?: string) => {
    if (!dateStr) return 'Mai scansionata';
    try {
      const d = new Date(dateStr);
      return d.toLocaleDateString('it-IT', {
        day: '2-digit',
        month: 'short',
        hour: '2-digit',
        minute: '2-digit'
      });
    } catch {
      return dateStr;
    }
  };

  const [verifyingSourceId, setVerifyingSourceId] = useState<string | null>(null);
  const [comparePrimaryId, setComparePrimaryId] = useState<string>('');
  const [compareSecondaryId, setCompareSecondaryId] = useState<string>('');
  const [compareResult, setCompareResult] = useState<any | null>(null);
  const [comparing, setComparing] = useState<boolean>(false);
  const [copyingBackup, setCopyingBackup] = useState<boolean>(false);

  const formatBytes = (bytes?: number) => {
    if (!bytes || bytes === 0) return '0 B';
    const k = 1024;
    const sizes = ['B', 'KB', 'MB', 'GB', 'TB'];
    const i = Math.floor(Math.log(bytes) / Math.log(k));
    return parseFloat((bytes / Math.pow(k, i)).toFixed(2)) + ' ' + sizes[i];
  };

  const handleCompareSources = async () => {
    if (!comparePrimaryId || !compareSecondaryId) {
      toast.error('Seleziona entrambi i dischi da confrontare.');
      return;
    }
    if (comparePrimaryId === compareSecondaryId) {
      toast.error('Seleziona due dischi diversi.');
      return;
    }
    try {
      setComparing(true);
      const res = await ApiClient.compareSources(comparePrimaryId, compareSecondaryId);
      setCompareResult(res);
    } catch (err: any) {
      toast.error(err?.message || 'Errore durante il confronto dei dischi');
    } finally {
      setComparing(false);
    }
  };

  const handleCopyMissingToSecondary = async () => {
    if (!compareResult || !compareResult.missing_items?.length) return;
    const targetSrc = sources.find((s) => s.id === compareSecondaryId);
    const confirmed = window.confirm(
      `Copiare ${compareResult.missing_count} file (${formatBytes(compareResult.missing_bytes)}) sul disco "${targetSrc?.name || 'Destinazione'}"?\n\n` +
      `Ogni file verrà copiato preservando la struttura originale e verificato tramite SHA-256.`
    );
    if (!confirmed) return;

    try {
      setCopyingBackup(true);
      const mediaIds = compareResult.missing_items.map((x: any) => x.media_id);
      const res = await ApiClient.backupCopyToSource(mediaIds, compareSecondaryId);
      if (res.errors && res.errors.length > 0) {
        toast.info(`Copiati ${res.copied_count} file (${formatBytes(res.copied_bytes)}). ${res.errors.length} errori riscontrati.`);
      } else {
        toast.success(`Backup completato! Copiati e verificati ${res.copied_count} file (${formatBytes(res.copied_bytes)}).`);
      }
      await loadSources();
      const updated = await ApiClient.compareSources(comparePrimaryId, compareSecondaryId);
      setCompareResult(updated);
    } catch (err: any) {
      toast.error(err?.message || 'Errore durante la copia di backup');
    } finally {
      setCopyingBackup(false);
    }
  };

  const handleVerifySource = async (s: any) => {
    try {
      setVerifyingSourceId(s.id);
      const res = await ApiClient.verifySources(s.id);
      if (res.newly_missing > 0 || res.restored_available > 0) {
        toast.info(`"${s.name}": ${res.newly_missing} file mancanti rilevati, ${res.restored_available} ripristinati.`);
      } else {
        toast.success(`"${s.name}" integro (${res.checked_files} file verificati).`);
      }
      await loadSources();
    } catch (err: any) {
      toast.error(err?.message || 'Errore verifica disco');
    } finally {
      setVerifyingSourceId(null);
    }
  };

  const handleDeleteSource = async (sourceId: string, sourceName: string) => {
    const confirmed = window.confirm(
      `Sei sicuro di voler eliminare la fonte "${sourceName}" dal catalogo?\n\n` +
      `ATTENZIONE (100% Read-Only): I file originali presenti sul tuo disco/cartella NON verranno MAI toccati né cancellati.\n` +
      `Verranno rimossi soltanto i record dal catalogo e le miniature generate in cache.`
    );
    if (!confirmed) return;

    try {
      await ApiClient.deleteSource(sourceId);
      toast.success(`Fonte "${sourceName}" eliminata dal catalogo.`);
      await loadSources();
    } catch (err: any) {
      console.error('Error deleting source:', err);
      toast.error(`Errore eliminazione: ${err?.message || 'Errore di connessione'}`);
    }
  };

  const handleCreateSource = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!name.trim()) return;
    setSaving(true);
    try {
      await ApiClient.createSource(
        name.trim(),
        sourceType,
        rootPath.trim() || undefined,
        role,
        createExcludedPaths.trim() || undefined
      );
      setIsModalOpen(false);
      setName('');
      setRootPath('');
      setCreateExcludedPaths('');
      setRole('primary');
      toast.success('Fonte registrata con successo!');
      await loadSources();
    } catch (err: any) {
      console.error('Error creating source:', err);
      toast.error(err?.message || 'Errore nella creazione della fonte');
    } finally {
      setSaving(false);
    }
  };

  const handleOpenExclusionsModal = async (source: any) => {
    setExclusionsModalSource(source);
    setEditExclusionsText(source.excluded_paths || '');
    setFolderSearchFilter('');
    setPurgeExisting(true);
    setLoadingFolders(true);
    try {
      const folders = await ApiClient.getSourceFolders(source.id);
      setSourceFolders(folders);
    } catch (err) {
      console.error('Error loading source folders:', err);
      setSourceFolders([]);
    } finally {
      setLoadingFolders(false);
    }
  };

  const handleAddFolderToExclusions = (folderName: string) => {
    const current = editExclusionsText
      .split(',')
      .map((s) => s.trim())
      .filter(Boolean);
    if (!current.includes(folderName)) {
      current.push(folderName);
      setEditExclusionsText(current.join(', '));
    }
  };

  const handleSaveExclusions = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!exclusionsModalSource) return;
    setSavingExclusions(true);
    try {
      const res = await ApiClient.setSourceExclusions(
        exclusionsModalSource.id,
        editExclusionsText.trim(),
        purgeExisting
      );
      if (res.purged_files > 0) {
        toast.success(`Esclusioni applicate! Rimossi ${res.purged_files} file e ripulite ${res.purged_media} foto orfane dal catalogo.`);
      } else {
        toast.success('Regole di esclusione salvate per le future scansioni!');
      }
      setExclusionsModalSource(null);
      await loadSources();
    } catch (err: any) {
      console.error('Error saving exclusions:', err);
      toast.error(err?.message || 'Errore nel salvataggio delle esclusioni');
    } finally {
      setSavingExclusions(false);
    }
  };

  const filteredFolders = sourceFolders.filter((sf) =>
    sf.folder.toLowerCase().includes(folderSearchFilter.toLowerCase())
  );

  const totalIndexedFiles = sources.reduce((acc, s) => acc + (s.file_count || 0), 0);
  const onlineCount = sources.filter((s) => s.status === 'online').length;

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '24px' }}>
      {/* Top Header Bar */}
      <div style={{
        display: 'flex',
        justifyContent: 'space-between',
        alignItems: 'center',
        flexWrap: 'wrap',
        gap: '16px'
      }}>
        <div>
          <h2 style={{ fontSize: '22px', fontWeight: 700, color: '#f8fafc', letterSpacing: '-0.02em' }}>
            Fonti di Archiviazione
          </h2>
          <p style={{ color: '#94a3b8', fontSize: '13px', marginTop: '4px' }}>
            Dischi esterni, SSD portatili, archivi di rete e volumi locali sincronizzati nel catalogo.
          </p>
        </div>

        <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
          <button
            onClick={() => loadSources(true)}
            title="Verifica stato dei dischi collegati al Mac"
            style={{
              background: '#1e293b',
              color: '#cbd5e1',
              border: '1px solid #334155',
              borderRadius: '10px',
              padding: '10px 14px',
              fontSize: '13px',
              fontWeight: 500,
              display: 'flex',
              alignItems: 'center',
              gap: '7px',
              cursor: 'pointer'
            }}
          >
            <RefreshCw size={14} color="#38bdf8" />
            Aggiorna Dischi
          </button>

          <button
            onClick={handleOpenCreateModal}
            style={{
              background: 'linear-gradient(135deg, #0284c7 0%, #0369a1 100%)',
              color: 'white',
              border: 'none',
              borderRadius: '10px',
              padding: '10px 18px',
              fontSize: '13px',
              fontWeight: 600,
              display: 'flex',
              alignItems: 'center',
              gap: '8px',
              cursor: 'pointer',
              boxShadow: '0 4px 14px rgba(2, 132, 199, 0.35)'
            }}
          >
            <FolderPlus size={16} />
            Registra Nuova Fonte
          </button>
        </div>
      </div>

      {/* KPI Overview Summary Banner */}
      {sources.length > 0 && (
        <div style={{
          display: 'grid',
          gridTemplateColumns: 'repeat(auto-fit, minmax(220px, 1fr))',
          gap: '14px'
        }}>
          <div style={{
            background: 'linear-gradient(145deg, #1e293b 0%, #151f30 100%)',
            border: '1px solid #334155',
            borderRadius: '12px',
            padding: '16px 18px',
            display: 'flex',
            alignItems: 'center',
            gap: '14px'
          }}>
            <div style={{
              width: '42px',
              height: '42px',
              borderRadius: '10px',
              background: 'rgba(56, 189, 248, 0.12)',
              border: '1px solid rgba(56, 189, 248, 0.25)',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              color: '#38bdf8',
              flexShrink: 0
            }}>
              <HardDrive size={22} />
            </div>
            <div>
              <div style={{ fontSize: '12px', color: '#94a3b8', fontWeight: 500 }}>Dischi Registrati</div>
              <div style={{ fontSize: '20px', fontWeight: 700, color: '#f8fafc', marginTop: '2px' }}>
                {sources.length} {sources.length === 1 ? 'Volume' : 'Volumi'}
              </div>
            </div>
          </div>

          <div style={{
            background: 'linear-gradient(145deg, #1e293b 0%, #151f30 100%)',
            border: '1px solid #334155',
            borderRadius: '12px',
            padding: '16px 18px',
            display: 'flex',
            alignItems: 'center',
            gap: '14px'
          }}>
            <div style={{
              width: '42px',
              height: '42px',
              borderRadius: '10px',
              background: 'rgba(34, 197, 94, 0.12)',
              border: '1px solid rgba(34, 197, 94, 0.25)',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              color: '#4ade80',
              flexShrink: 0
            }}>
              <Database size={22} />
            </div>
            <div>
              <div style={{ fontSize: '12px', color: '#94a3b8', fontWeight: 500 }}>File Totali nel Catalogo</div>
              <div style={{ fontSize: '20px', fontWeight: 700, color: '#f8fafc', marginTop: '2px' }}>
                {totalIndexedFiles.toLocaleString('it-IT')}
              </div>
            </div>
          </div>

          <div style={{
            background: 'linear-gradient(145deg, #1e293b 0%, #151f30 100%)',
            border: '1px solid #334155',
            borderRadius: '12px',
            padding: '16px 18px',
            display: 'flex',
            alignItems: 'center',
            gap: '14px'
          }}>
            <div style={{
              width: '42px',
              height: '42px',
              borderRadius: '10px',
              background: onlineCount > 0 ? 'rgba(16, 185, 129, 0.12)' : 'rgba(148, 163, 184, 0.12)',
              border: `1px solid ${onlineCount > 0 ? 'rgba(16, 185, 129, 0.3)' : 'rgba(148, 163, 184, 0.25)'}`,
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              color: onlineCount > 0 ? '#34d399' : '#94a3b8',
              flexShrink: 0
            }}>
              <ShieldCheck size={22} />
            </div>
            <div>
              <div style={{ fontSize: '12px', color: '#94a3b8', fontWeight: 500 }}>Dischi Collegati al Mac</div>
              <div style={{ fontSize: '14px', fontWeight: 600, color: '#f8fafc', marginTop: '2px' }}>
                {onlineCount > 0 ? (
                  <span style={{ color: '#34d399' }}>{onlineCount} di {sources.length} Collegati</span>
                ) : (
                  <span style={{ color: '#94a3b8' }}>Disconnessi ({sources.length})</span>
                )}
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Sources Cards Grid */}
      {sources.length === 0 && !loading ? (
        <div style={{
          textAlign: 'center',
          padding: '80px 20px',
          background: 'linear-gradient(145deg, #1e293b 0%, #151f30 100%)',
          borderRadius: '16px',
          border: '1px dashed #334155'
        }}>
          <HardDrive size={48} color="#64748b" style={{ margin: '0 auto 16px' }} />
          <h3 style={{ fontSize: '18px', fontWeight: 600, color: 'white' }}>Nessuna fonte registrata</h3>
          <p style={{ color: '#94a3b8', fontSize: '13px', marginTop: '6px' }}>
            Registra una fonte per iniziare a indicizzare i tuoi archivi fisici.
          </p>
        </div>
      ) : (
        <div style={{
          display: 'grid',
          gridTemplateColumns: 'repeat(auto-fill, minmax(360px, 1fr))',
          gap: '20px'
        }}>
          {sources.map((s) => (
            <div
              key={s.id}
              style={{
                background: 'linear-gradient(145deg, #1e293b 0%, #151f30 100%)',
                border: '1px solid #334155',
                borderRadius: '16px',
                padding: '22px',
                display: 'flex',
                flexDirection: 'column',
                justifyContent: 'space-between',
                gap: '18px',
                boxShadow: '0 8px 24px -4px rgba(0, 0, 0, 0.35)',
                transition: 'border-color 0.15s ease, box-shadow 0.15s ease'
              }}
            >
              <div>
                {/* Header: Icon, Name, Role, Type and Status Pill */}
                <div style={{
                  display: 'flex',
                  justifyContent: 'space-between',
                  alignItems: 'flex-start',
                  gap: '12px',
                  marginBottom: '16px'
                }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: '12px', minWidth: 0, flex: 1 }}>
                    <div style={{
                      width: '46px',
                      height: '46px',
                      borderRadius: '12px',
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'center',
                      background: s.status === 'online'
                        ? 'linear-gradient(135deg, rgba(56, 189, 248, 0.2) 0%, rgba(2, 132, 199, 0.08) 100%)'
                        : 'linear-gradient(135deg, rgba(148, 163, 184, 0.15) 0%, rgba(71, 85, 105, 0.08) 100%)',
                      border: `1px solid ${s.status === 'online' ? 'rgba(56, 189, 248, 0.3)' : 'rgba(148, 163, 184, 0.2)'}`,
                      flexShrink: 0
                    }}>
                      <HardDrive size={24} color={s.status === 'online' ? '#38bdf8' : '#94a3b8'} />
                    </div>

                    <div style={{ minWidth: 0, flex: 1 }}>
                      <h4
                        style={{
                          fontSize: '17px',
                          fontWeight: 700,
                          color: '#f8fafc',
                          whiteSpace: 'nowrap',
                          overflow: 'hidden',
                          textOverflow: 'ellipsis',
                          letterSpacing: '-0.01em',
                          margin: 0
                        }}
                        title={s.name}
                      >
                        {s.name}
                      </h4>

                      <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginTop: '4px', flexWrap: 'wrap' }}>
                        <span style={{
                          fontSize: '11px',
                          fontWeight: 600,
                          padding: '2px 8px',
                          borderRadius: '6px',
                          background: s.role === 'backup'
                            ? 'rgba(34, 197, 94, 0.15)'
                            : s.role === 'archive'
                            ? 'rgba(168, 85, 247, 0.15)'
                            : 'rgba(56, 189, 248, 0.15)',
                          color: s.role === 'backup' ? '#4ade80' : s.role === 'archive' ? '#c084fc' : '#38bdf8',
                          border: `1px solid ${s.role === 'backup' ? 'rgba(34, 197, 94, 0.3)' : s.role === 'archive' ? 'rgba(168, 85, 247, 0.3)' : 'rgba(56, 189, 248, 0.3)'}`
                        }}>
                          {s.role === 'backup' ? 'Backup' : s.role === 'archive' ? 'Archivio' : 'Primario'}
                        </span>

                        <span style={{ fontSize: '11px', color: '#94a3b8', fontWeight: 500 }}>
                          {s.source_type === 'external_drive'
                            ? 'SSD / Disco Esterno'
                            : s.source_type === 'browser_folder'
                            ? 'Cartella Locale'
                            : s.source_type}
                        </span>
                      </div>
                    </div>
                  </div>

                  {/* Status Indicator */}
                  <div style={{
                    display: 'flex',
                    alignItems: 'center',
                    gap: '6px',
                    padding: '4px 10px',
                    borderRadius: '20px',
                    fontSize: '11px',
                    fontWeight: 600,
                    background: s.status === 'online' ? 'rgba(16, 185, 129, 0.12)' : 'rgba(148, 163, 184, 0.1)',
                    color: s.status === 'online' ? '#34d399' : '#94a3b8',
                    border: `1px solid ${s.status === 'online' ? 'rgba(16, 185, 129, 0.3)' : 'rgba(148, 163, 184, 0.2)'}`,
                    flexShrink: 0
                  }}>
                    <span style={{
                      width: '7px',
                      height: '7px',
                      borderRadius: '50%',
                      background: s.status === 'online' ? '#10b981' : '#64748b',
                      boxShadow: s.status === 'online' ? '0 0 6px #10b981' : 'none'
                    }} />
                    {s.status === 'online' ? 'Collegato' : 'Non collegato'}
                  </div>
                </div>

                {/* Dashboard Metrics Panel */}
                <div style={{
                  background: '#090d16',
                  border: '1px solid #1e293b',
                  borderRadius: '12px',
                  padding: '14px',
                  display: 'flex',
                  flexDirection: 'column',
                  gap: '12px'
                }}>
                  {/* Two Stats Columns */}
                  <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '10px' }}>
                    <div style={{
                      background: '#0f172a',
                      borderRadius: '8px',
                      padding: '10px 12px',
                      border: '1px solid #1e293b'
                    }}>
                      <div style={{ fontSize: '11px', color: '#94a3b8', display: 'flex', alignItems: 'center', gap: '5px', marginBottom: '4px' }}>
                        <Database size={13} color="#38bdf8" />
                        File indicizzati
                      </div>
                      <div style={{ fontSize: '18px', fontWeight: 700, color: '#f8fafc' }}>
                        {(s.file_count || 0).toLocaleString('it-IT')}
                      </div>
                    </div>

                    <div style={{
                      background: '#0f172a',
                      borderRadius: '8px',
                      padding: '10px 12px',
                      border: '1px solid #1e293b'
                    }}>
                      <div style={{ fontSize: '11px', color: '#94a3b8', display: 'flex', alignItems: 'center', gap: '5px', marginBottom: '4px' }}>
                        <Clock size={13} color="#94a3b8" />
                        Ultima scansione
                      </div>
                      <div
                        style={{
                          fontSize: '12px',
                          fontWeight: 600,
                          color: '#cbd5e1',
                          whiteSpace: 'nowrap',
                          overflow: 'hidden',
                          textOverflow: 'ellipsis',
                          marginTop: '4px'
                        }}
                        title={s.last_scanned_at ? new Date(s.last_scanned_at).toLocaleString() : 'Mai'}
                      >
                        {formatDate(s.last_scanned_at)}
                      </div>
                    </div>
                  </div>

                  {/* Path with Copy Button */}
                  <div style={{
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'space-between',
                    background: '#0f172a',
                    border: '1px solid #1e293b',
                    borderRadius: '8px',
                    padding: '8px 10px',
                    fontSize: '11px',
                    gap: '8px'
                  }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: '6px', minWidth: 0, overflow: 'hidden' }}>
                      <Folder size={13} color="#94a3b8" style={{ flexShrink: 0 }} />
                      <span
                        style={{
                          fontFamily: 'ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, monospace',
                          color: '#94a3b8',
                          overflow: 'hidden',
                          textOverflow: 'ellipsis',
                          whiteSpace: 'nowrap'
                        }}
                        title={s.root_path || 'Selezionata dal browser'}
                      >
                        {s.root_path || 'Cartella selezionata via browser'}
                      </span>
                    </div>
                    {s.root_path && (
                      <button
                        type="button"
                        onClick={() => handleCopyPath(s.root_path)}
                        title="Copia percorso"
                        style={{
                          background: 'none',
                          border: 'none',
                          color: '#64748b',
                          cursor: 'pointer',
                          padding: '2px',
                          display: 'flex',
                          alignItems: 'center',
                          flexShrink: 0
                        }}
                      >
                        <Copy size={13} />
                      </button>
                    )}
                  </div>

                  {/* Active Exclusions Chip */}
                  {s.excluded_paths && (
                    <div
                      onClick={() => handleOpenExclusionsModal(s)}
                      style={{
                        cursor: 'pointer',
                        fontSize: '11px',
                        color: '#f59e0b',
                        background: 'rgba(245, 158, 11, 0.08)',
                        border: '1px solid rgba(245, 158, 11, 0.25)',
                        borderRadius: '8px',
                        padding: '6px 10px',
                        display: 'flex',
                        alignItems: 'center',
                        justifyContent: 'space-between',
                        gap: '6px'
                      }}
                      title="Clicca per modificare le esclusioni"
                    >
                      <div style={{ display: 'flex', alignItems: 'center', gap: '6px', minWidth: 0, overflow: 'hidden' }}>
                        <FolderX size={13} style={{ flexShrink: 0 }} />
                        <span style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                          <strong>Esclusioni:</strong> {s.excluded_paths}
                        </span>
                      </div>
                      <span style={{ fontSize: '10px', textDecoration: 'underline', flexShrink: 0 }}>Modifica</span>
                    </div>
                  )}

                  {/* Disconnected Notice */}
                  {s.status === 'offline' && s.root_path && (
                    <div style={{
                      fontSize: '11px',
                      color: '#94a3b8',
                      background: 'rgba(30, 41, 59, 0.5)',
                      border: '1px dashed #334155',
                      borderRadius: '8px',
                      padding: '7px 10px',
                      display: 'flex',
                      alignItems: 'center',
                      gap: '7px'
                    }}>
                      <Info size={13} color="#64748b" style={{ flexShrink: 0 }} />
                      <span>Disco USB non presente in /Volumes. Collega il cavo al Mac per scansionare.</span>
                    </div>
                  )}
                </div>
              </div>

              {/* Action Buttons Footer */}
              <div style={{ display: 'flex', gap: '8px', alignItems: 'center' }}>
                {s.status === 'online' ? (
                  <>
                    <button
                      onClick={() => onStartScanForSource(s)}
                      style={{
                        flex: 1,
                        background: 'linear-gradient(135deg, #0284c7 0%, #0369a1 100%)',
                        color: 'white',
                        border: 'none',
                        borderRadius: '10px',
                        padding: '10px 14px',
                        fontSize: '13px',
                        fontWeight: 600,
                        display: 'flex',
                        alignItems: 'center',
                        justifyContent: 'center',
                        gap: '7px',
                        cursor: 'pointer',
                        boxShadow: '0 2px 8px rgba(2, 132, 199, 0.3)'
                      }}
                    >
                      <Play size={14} fill="white" />
                      Scansiona
                    </button>
                    <button
                      onClick={() => handleVerifySource(s)}
                      disabled={verifyingSourceId === s.id}
                      title="Verifica Integrità (<1s): rileva file eliminati dal Finder"
                      style={{
                        padding: '10px 12px',
                        background: '#1e293b',
                        color: '#38bdf8',
                        border: '1px solid #334155',
                        borderRadius: '10px',
                        fontSize: '12px',
                        fontWeight: 600,
                        display: 'flex',
                        alignItems: 'center',
                        gap: '6px',
                        cursor: verifyingSourceId === s.id ? 'wait' : 'pointer'
                      }}
                    >
                      <RefreshCw size={13} className={verifyingSourceId === s.id ? 'spin' : ''} />
                      {verifyingSourceId === s.id ? '...' : 'Verifica'}
                    </button>
                  </>
                ) : (
                  <button
                    onClick={() => handleCheckDriveConnection(s)}
                    title="Verifica se il disco è stato collegato al Mac"
                    style={{
                      flex: 1,
                      background: '#1e293b',
                      color: '#e2e8f0',
                      border: '1px solid #475569',
                      borderRadius: '10px',
                      padding: '10px 14px',
                      fontSize: '12px',
                      fontWeight: 600,
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'center',
                      gap: '7px',
                      cursor: 'pointer'
                    }}
                  >
                    <RefreshCw size={13} color="#38bdf8" />
                    Verifica Connessione
                  </button>
                )}

                <button
                  onClick={() => handleOpenExclusionsModal(s)}
                  title="Gestisci cartelle ed esclusioni dal catalogo"
                  style={{
                    padding: '10px 14px',
                    background: s.excluded_paths ? 'rgba(245, 158, 11, 0.12)' : '#1e293b',
                    color: s.excluded_paths ? '#f59e0b' : '#cbd5e1',
                    border: `1px solid ${s.excluded_paths ? 'rgba(245, 158, 11, 0.35)' : '#334155'}`,
                    borderRadius: '10px',
                    fontSize: '12px',
                    fontWeight: 600,
                    display: 'flex',
                    alignItems: 'center',
                    gap: '6px',
                    cursor: 'pointer'
                  }}
                >
                  <FolderX size={14} color={s.excluded_paths ? '#f59e0b' : '#94a3b8'} />
                  Esclusioni
                </button>

                <button
                  onClick={() => handleDeleteSource(s.id, s.name)}
                  title="Elimina fonte dal catalogo"
                  style={{
                    padding: '10px',
                    background: 'rgba(239, 68, 68, 0.08)',
                    color: '#ef4444',
                    border: '1px solid rgba(239, 68, 68, 0.25)',
                    borderRadius: '10px',
                    cursor: 'pointer',
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center'
                  }}
                >
                  <Trash2 size={15} />
                </button>
              </div>
            </div>
          ))}
        </div>
      )}

      {/* Confronta & Sincronizza Dischi Panel */}
      {sources.length >= 2 && (
        <div style={{
          background: '#1e293b',
          border: '1px solid #334155',
          borderRadius: '14px',
          padding: '22px',
          display: 'flex',
          flexDirection: 'column',
          gap: '16px'
        }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: '12px' }}>
            <div>
              <h3 style={{ fontSize: '16px', fontWeight: 700, margin: 0, color: '#f8fafc' }}>
                Confronta & Sincronizza Dischi
              </h3>
              <p style={{ fontSize: '12px', color: '#94a3b8', margin: '4px 0 0' }}>
                Scopri quali foto e video presenti su un disco mancano su un secondo disco di backup e copiali con verifica SHA-256.
              </p>
            </div>
          </div>

          <div style={{ display: 'flex', flexWrap: 'wrap', gap: '12px', alignItems: 'flex-end' }}>
            <div style={{ flex: '1 1 220px' }}>
              <label style={{ display: 'block', fontSize: '11px', color: '#94a3b8', marginBottom: '4px', fontWeight: 600 }}>
                Disco Origine (A)
              </label>
              <select
                value={comparePrimaryId}
                onChange={(e) => { setComparePrimaryId(e.target.value); setCompareResult(null); }}
                style={{ width: '100%', background: '#0f172a', border: '1px solid #334155', borderRadius: '8px', padding: '9px 12px', color: 'white', fontSize: '13px' }}
              >
                <option value="">Seleziona disco origine...</option>
                {sources.map((s) => (
                  <option key={s.id} value={s.id}>{s.name} ({s.status === 'online' ? 'Online' : 'Offline'})</option>
                ))}
              </select>
            </div>

            <div style={{ flex: '1 1 220px' }}>
              <label style={{ display: 'block', fontSize: '11px', color: '#94a3b8', marginBottom: '4px', fontWeight: 600 }}>
                Disco Destinazione Backup (B)
              </label>
              <select
                value={compareSecondaryId}
                onChange={(e) => { setCompareSecondaryId(e.target.value); setCompareResult(null); }}
                style={{ width: '100%', background: '#0f172a', border: '1px solid #334155', borderRadius: '8px', padding: '9px 12px', color: 'white', fontSize: '13px' }}
              >
                <option value="">Seleziona disco backup...</option>
                {sources.map((s) => (
                  <option key={s.id} value={s.id}>{s.name} ({s.status === 'online' ? 'Online' : 'Offline'})</option>
                ))}
              </select>
            </div>

            <button
              onClick={handleCompareSources}
              disabled={comparing || !comparePrimaryId || !compareSecondaryId}
              style={{
                background: '#0284c7',
                border: 'none',
                borderRadius: '8px',
                padding: '10px 18px',
                color: 'white',
                fontSize: '13px',
                fontWeight: 600,
                cursor: comparing ? 'wait' : 'pointer'
              }}
            >
              {comparing ? 'Confronto...' : 'Confronta Dischi'}
            </button>
          </div>

          {compareResult && (
            <div style={{
              background: '#0f172a',
              border: '1px solid #334155',
              borderRadius: '10px',
              padding: '16px',
              display: 'flex',
              flexDirection: 'column',
              gap: '12px'
            }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: '12px' }}>
                <div style={{ fontSize: '13px', color: '#e2e8f0' }}>
                  Copertura backup: <strong style={{ color: compareResult.coverage_pct === 100 ? '#22c55e' : '#38bdf8' }}>{compareResult.coverage_pct}%</strong>
                  {' · '}
                  Mancanti su B: <strong style={{ color: compareResult.missing_count > 0 ? '#f59e0b' : '#22c55e' }}>{compareResult.missing_count}</strong> file ({formatBytes(compareResult.missing_bytes)})
                </div>

                {compareResult.missing_count > 0 && (() => {
                  const srcA = sources.find((s) => s.id === comparePrimaryId);
                  const srcB = sources.find((s) => s.id === compareSecondaryId);
                  const bothOnline = srcA?.status === 'online' && srcB?.status === 'online';
                  return (
                    <button
                      onClick={handleCopyMissingToSecondary}
                      disabled={!bothOnline || copyingBackup}
                      title={!bothOnline ? 'Entrambi i dischi devono essere collegati (Online) per eseguire la copia' : 'Copia i file mancanti verificando SHA-256'}
                      style={{
                        background: bothOnline ? '#16a34a' : '#334155',
                        border: 'none',
                        borderRadius: '8px',
                        padding: '8px 16px',
                        color: 'white',
                        fontSize: '12px',
                        fontWeight: 700,
                        cursor: !bothOnline ? 'not-allowed' : (copyingBackup ? 'wait' : 'pointer'),
                        opacity: bothOnline ? 1 : 0.65
                      }}
                    >
                      {copyingBackup ? 'Copia e verifica SHA-256 in corso...' : `Copia ${compareResult.missing_count} file mancanti su ${srcB?.name || 'Disco B'}`}
                    </button>
                  );
                })()}
              </div>

              {compareResult.by_folder && compareResult.by_folder.length > 0 && (
                <div style={{ display: 'flex', flexWrap: 'wrap', gap: '8px' }}>
                  {compareResult.by_folder.slice(0, 10).map((f: any) => (
                    <span
                      key={f.folder}
                      style={{
                        fontSize: '11px',
                        background: '#1e293b',
                        border: '1px solid #334155',
                        borderRadius: '6px',
                        padding: '4px 10px',
                        color: '#cbd5e1'
                      }}
                    >
                      📁 {f.folder}: <strong>{f.count}</strong> ({formatBytes(f.bytes)})
                    </span>
                  ))}
                </div>
              )}
            </div>
          )}
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
            background: 'linear-gradient(145deg, #1e293b 0%, #151f30 100%)',
            border: '1px solid #334155',
            borderRadius: '16px',
            width: '100%',
            maxWidth: '560px',
            maxHeight: '90vh',
            overflowY: 'auto',
            padding: '24px',
            boxShadow: '0 25px 50px -12px rgba(0, 0, 0, 0.6)'
          }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '20px' }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
                <div style={{
                  padding: '8px',
                  borderRadius: '10px',
                  background: 'rgba(56, 189, 248, 0.15)',
                  color: '#38bdf8'
                }}>
                  <FolderPlus size={20} />
                </div>
                <h3 style={{ fontSize: '18px', fontWeight: 700, color: 'white' }}>Registra Nuova Fonte</h3>
              </div>
              <button
                onClick={() => setIsModalOpen(false)}
                style={{ background: 'transparent', border: 'none', color: '#94a3b8', cursor: 'pointer' }}
              >
                <X size={20} />
              </button>
            </div>

            <form onSubmit={handleCreateSource} style={{ display: 'flex', flexDirection: 'column', gap: '18px' }}>
              <div>
                <label style={{ fontSize: '12px', fontWeight: 600, color: '#cbd5e1', display: 'block', marginBottom: '6px' }}>
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

              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '12px' }}>
                <div>
                  <label style={{ fontSize: '12px', fontWeight: 600, color: '#cbd5e1', display: 'block', marginBottom: '6px' }}>
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
                    <option value="external_drive">Hard Disk / SSD Esterno</option>
                    <option value="browser_folder">Cartella Locale (Browser)</option>
                    <option value="network_share">Condivisione di Rete / NAS</option>
                    <option value="internal_drive">Disco Interno</option>
                  </select>
                </div>

                <div>
                  <label style={{ fontSize: '12px', fontWeight: 600, color: '#cbd5e1', display: 'block', marginBottom: '6px' }}>
                    Ruolo Ridondanza
                  </label>
                  <select
                    value={role}
                    onChange={(e) => setRole(e.target.value as any)}
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
                    <option value="primary">Disco Principale (Primary)</option>
                    <option value="backup">Disco di Backup (Backup)</option>
                    <option value="archive">Archivio Storico (Archive)</option>
                  </select>
                </div>
              </div>

              {/* Percorso o Montaggio con Explorer e Guida */}
              <div>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '6px' }}>
                  <label style={{ fontSize: '12px', fontWeight: 600, color: '#cbd5e1' }}>
                    Percorso o Cartella di Montaggio
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
                    placeholder="Es. /Volumes/SSD_512_Sam o /Volumes/TOSHIBA"
                    value={rootPath}
                    onChange={(e) => setRootPath(e.target.value)}
                    style={{
                      width: '100%',
                      background: '#0f172a',
                      border: '1px solid #334155',
                      borderRadius: '8px',
                      padding: '10px 12px',
                      color: 'white',
                      fontSize: '13px',
                      fontFamily: 'monospace'
                    }}
                  />
                </div>

                {/* Pulsanti Sfoglia Dischi */}
                <div style={{ display: 'flex', flexWrap: 'wrap', gap: '8px', marginTop: '8px' }}>
                  <button
                    type="button"
                    onClick={() => {
                      if (!showExplorer && !fsData) loadFsPath();
                      setShowExplorer(!showExplorer);
                    }}
                    style={{
                      background: showExplorer ? '#0284c7' : 'rgba(56, 189, 248, 0.12)',
                      color: showExplorer ? 'white' : '#38bdf8',
                      border: '1px solid rgba(56, 189, 248, 0.3)',
                      borderRadius: '8px',
                      padding: '7px 12px',
                      fontSize: '11px',
                      fontWeight: 600,
                      display: 'flex',
                      alignItems: 'center',
                      gap: '6px',
                      cursor: 'pointer'
                    }}
                  >
                    <FolderSearch size={14} />
                    {showExplorer ? 'Chiudi Esplora Dischi' : 'Sfoglia Dischi & Cartelle Mac'}
                  </button>

                  {'showDirectoryPicker' in window && (
                    <button
                      type="button"
                      onClick={handlePickBrowserFolder}
                      style={{
                        background: 'rgba(148, 163, 184, 0.1)',
                        color: '#94a3b8',
                        border: '1px solid #475569',
                        borderRadius: '8px',
                        padding: '7px 12px',
                        fontSize: '11px',
                        display: 'flex',
                        alignItems: 'center',
                        gap: '6px',
                        cursor: 'pointer'
                      }}
                    >
                      <Folder size={14} />
                      Scegli da Browser
                    </button>
                  )}
                </div>

                {/* Dischi rimovibili Mac rilevati */}
                {fsData?.volumes && fsData.volumes.filter(v => v.is_removable).length > 0 && (
                  <div style={{ marginTop: '12px' }}>
                    <div style={{ fontSize: '11px', color: '#94a3b8', marginBottom: '6px', fontWeight: 600 }}>
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
                            borderRadius: '8px',
                            padding: '6px 10px',
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

                {/* Guida */}
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
                      • <strong>Dischi Esterni USB o SSD (Mac)</strong>: Su macOS tutti i dischi esterni si trovano nella cartella <code>/Volumes/</code> (es. <code>/Volumes/SSD_512_Sam</code>).<br />
                      • <strong>Copia percorso da macOS Finder</strong>: Apri Finder, fai clic destro sul disco tenendo premuto <code>Opzione (Option / Alt)</code> e clicca su <em>"Copia come percorso"</em>.
                    </div>
                  </div>
                )}

                {/* File Explorer integrato */}
                {showExplorer && (
                  <div style={{
                    background: '#090d16',
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
                        fontSize: '11px'
                      }}>
                        {fsError}
                      </div>
                    )}
                    <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: '8px' }}>
                      <div style={{ display: 'flex', alignItems: 'center', gap: '6px', overflow: 'hidden' }}>
                        {fsData?.parent_path && (
                          <button
                            type="button"
                            onClick={() => loadFsPath(fsData.parent_path!)}
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
                          display: 'inline-flex',
                          alignItems: 'center',
                          gap: '4px',
                          padding: '5px 10px',
                          fontSize: '11px',
                          fontWeight: 600,
                          cursor: 'pointer'
                        }}
                      >
                        <Check size={12} />
                        Usa Questa Cartella
                      </button>
                    </div>

                    {/* Sottocartelle navigabili */}
                    <div>
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
                          overflowY: 'auto'
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
                          Nessuna sottocartella trovata.
                        </div>
                      )}
                    </div>
                  </div>
                )}
              </div>

              {/* Esclusioni iniziali */}
              <div>
                <label style={{ fontSize: '12px', fontWeight: 600, color: '#cbd5e1', display: 'block', marginBottom: '6px' }}>
                  Cartelle o Pattern da Escludere a Monte (Opzionale)
                </label>
                <input
                  type="text"
                  placeholder="Es. Musica, Covers, VirtualMachines, *iso*"
                  value={createExcludedPaths}
                  onChange={(e) => setCreateExcludedPaths(e.target.value)}
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
                <span style={{ fontSize: '11px', color: '#64748b', marginTop: '4px', display: 'block' }}>
                  Separa con virgola i nomi delle cartelle che il server deve ignorare durante la scansione.
                </span>
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
                    background: 'linear-gradient(135deg, #0284c7 0%, #0369a1 100%)',
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

      {/* Modal Gestione Esclusioni & Pulizia Retroattiva */}
      {exclusionsModalSource && (
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
            background: 'linear-gradient(145deg, #1e293b 0%, #151f30 100%)',
            border: '1px solid #334155',
            borderRadius: '16px',
            width: '100%',
            maxWidth: '560px',
            maxHeight: '90vh',
            overflowY: 'auto',
            padding: '24px',
            boxShadow: '0 25px 50px -12px rgba(0, 0, 0, 0.6)'
          }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '18px' }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
                <div style={{
                  padding: '8px',
                  borderRadius: '10px',
                  background: 'rgba(245, 158, 11, 0.15)',
                  color: '#f59e0b'
                }}>
                  <FolderX size={20} />
                </div>
                <div>
                  <h3 style={{ fontSize: '18px', fontWeight: 700, color: 'white' }}>
                    Gestione Esclusioni
                  </h3>
                  <div style={{ fontSize: '12px', color: '#94a3b8' }}>
                    Fonte: <strong style={{ color: '#f8fafc' }}>{exclusionsModalSource.name}</strong>
                  </div>
                </div>
              </div>
              <button
                onClick={() => setExclusionsModalSource(null)}
                style={{ background: 'transparent', border: 'none', color: '#94a3b8', cursor: 'pointer' }}
              >
                <X size={20} />
              </button>
            </div>

            <form onSubmit={handleSaveExclusions} style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>
              <div>
                <label style={{ fontSize: '12px', fontWeight: 600, color: '#cbd5e1', display: 'block', marginBottom: '6px' }}>
                  Regole di Esclusione (Nomi o Pattern)
                </label>
                <input
                  type="text"
                  placeholder="Es. Musica, CD Covers, VirtualMachines, *cover*"
                  value={editExclusionsText}
                  onChange={(e) => setEditExclusionsText(e.target.value)}
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
                <span style={{ fontSize: '11px', color: '#64748b', marginTop: '4px', display: 'block' }}>
                  Separa i percorsi con virgola. Verranno ignorati per le scansioni future.
                </span>
              </div>

              {/* Cartelle scansionate con filtro rapido */}
              <div>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '8px' }}>
                  <label style={{ fontSize: '12px', fontWeight: 600, color: '#cbd5e1' }}>
                    Cartelle Rilevate nel Disco ({sourceFolders.length})
                  </label>
                  {sourceFolders.length > 5 && (
                    <div style={{ position: 'relative', width: '180px' }}>
                      <input
                        type="text"
                        placeholder="Filtra cartelle..."
                        value={folderSearchFilter}
                        onChange={(e) => setFolderSearchFilter(e.target.value)}
                        style={{
                          width: '100%',
                          background: '#0f172a',
                          border: '1px solid #334155',
                          borderRadius: '6px',
                          padding: '4px 8px 4px 24px',
                          fontSize: '11px',
                          color: 'white'
                        }}
                      />
                      <Search size={11} color="#64748b" style={{ position: 'absolute', left: '7px', top: '7px' }} />
                    </div>
                  )}
                </div>

                {loadingFolders ? (
                  <div style={{ fontSize: '12px', color: '#94a3b8', padding: '16px', textAlign: 'center' }}>
                    Caricamento cartelle in corso...
                  </div>
                ) : filteredFolders.length > 0 ? (
                  <div style={{
                    maxHeight: '180px',
                    overflowY: 'auto',
                    display: 'flex',
                    flexWrap: 'wrap',
                    gap: '6px',
                    background: '#090d16',
                    border: '1px solid #1e293b',
                    borderRadius: '10px',
                    padding: '10px'
                  }}>
                    {filteredFolders.map((sf) => {
                      const isExcluded = editExclusionsText
                        .toLowerCase()
                        .split(',')
                        .map(s => s.trim())
                        .includes(sf.folder.toLowerCase());

                      return (
                        <button
                          key={sf.folder}
                          type="button"
                          onClick={() => handleAddFolderToExclusions(sf.folder)}
                          style={{
                            background: isExcluded ? 'rgba(239, 68, 68, 0.15)' : '#1e293b',
                            border: `1px solid ${isExcluded ? 'rgba(239, 68, 68, 0.4)' : '#334155'}`,
                            color: isExcluded ? '#f87171' : '#f8fafc',
                            borderRadius: '8px',
                            padding: '6px 10px',
                            fontSize: '11px',
                            display: 'flex',
                            alignItems: 'center',
                            gap: '6px',
                            cursor: 'pointer',
                            transition: 'all 0.15s ease'
                          }}
                        >
                          <Folder size={12} color={isExcluded ? '#f87171' : '#38bdf8'} />
                          <strong>{sf.folder}</strong>
                          <span style={{
                            background: 'rgba(15, 23, 42, 0.6)',
                            padding: '1px 5px',
                            borderRadius: '4px',
                            color: '#94a3b8',
                            fontSize: '10px'
                          }}>
                            {sf.file_count.toLocaleString('it-IT')}
                          </span>
                          {!isExcluded && (
                            <span style={{ color: '#f59e0b', fontSize: '12px', fontWeight: 'bold' }}>+</span>
                          )}
                        </button>
                      );
                    })}
                  </div>
                ) : (
                  <div style={{ fontSize: '12px', color: '#64748b', fontStyle: 'italic', padding: '8px 0' }}>
                    {sourceFolders.length === 0 ? 'Nessuna sottocartella indicizzata trovata.' : 'Nessuna cartella corrisponde alla ricerca.'}
                  </div>
                )}
              </div>

              {/* Box Opzione Purge retroattivo */}
              <div style={{
                background: 'rgba(245, 158, 11, 0.08)',
                border: '1px solid rgba(245, 158, 11, 0.25)',
                borderRadius: '10px',
                padding: '14px',
                display: 'flex',
                flexDirection: 'column',
                gap: '8px'
              }}>
                <label style={{ display: 'flex', alignItems: 'center', gap: '8px', cursor: 'pointer', fontSize: '13px', fontWeight: 600, color: '#f59e0b' }}>
                  <input
                    type="checkbox"
                    checked={purgeExisting}
                    onChange={(e) => setPurgeExisting(e.target.checked)}
                    style={{ cursor: 'pointer', width: '16px', height: '16px' }}
                  />
                  Rimuovi subito dal catalogo i file già scansionati corrispondenti
                </label>
                <p style={{ margin: 0, fontSize: '11px', color: '#cbd5e1', lineHeight: '1.5' }}>
                  I file presenti in queste cartelle verranno eliminati dall'indice del database e le loro miniature in cache liberate.<br />
                  <span style={{ color: '#38bdf8', fontWeight: 600, display: 'inline-flex', alignItems: 'center', gap: '4px' }}>
                    <ShieldCheck size={14} />
                    100% Read-Only Sicuro: I file fisici originali sul tuo hard disk NON verranno mai modificati né cancellati.
                  </span>
                </p>
              </div>

              <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '10px', marginTop: '8px' }}>
                <button
                  type="button"
                  onClick={() => setExclusionsModalSource(null)}
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
                  disabled={savingExclusions}
                  style={{
                    background: 'linear-gradient(135deg, #f59e0b 0%, #d97706 100%)',
                    color: 'black',
                    border: 'none',
                    borderRadius: '8px',
                    padding: '10px 18px',
                    fontSize: '13px',
                    fontWeight: 700,
                    cursor: savingExclusions ? 'not-allowed' : 'pointer',
                    display: 'flex',
                    alignItems: 'center',
                    gap: '6px',
                    boxShadow: '0 4px 12px rgba(245, 158, 11, 0.3)'
                  }}
                >
                  {savingExclusions ? 'Applicazione in corso...' : 'Salva ed Applica Esclusioni'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
};
