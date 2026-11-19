import React, { useEffect, useState } from 'react';
import { ApiClient } from '../../services/api';
import {
  Copy,
  CheckCircle2,
  HardDrive,
  FileText,
  Info,
  Download,
  Sparkles,
  ShieldCheck,
  AlertTriangle,
  ArrowRight,
  ArrowLeftRight,
  Check,
  FileCode
} from 'lucide-react';
import { MediaDetailModal } from '../library/MediaDetailModal';

type DuplicateTab = 'intra_source' | 'multi_source' | 'backup_gap' | 'similar';

export const DuplicatesView: React.FC = () => {
  const [activeTab, setActiveTab] = useState<DuplicateTab>('intra_source');
  const [duplicateGroups, setDuplicateGroups] = useState<any[]>([]);
  const [similarGroups, setSimilarGroups] = useState<any[]>([]);
  const [summary, setSummary] = useState<any | null>(null);
  const [sources, setSources] = useState<any[]>([]);
  const [preferredSourceId, setPreferredSourceId] = useState<string>('');
  const [loading, setLoading] = useState(true);
  const [loadingMore, setLoadingMore] = useState(false);
  const [loadingSimilar, setLoadingSimilar] = useState(false);
  const [selectedMediaId, setSelectedMediaId] = useState<string | null>(null);

  // Backup Gap state
  const [primarySourceId, setPrimarySourceId] = useState<string>('');
  const [backupSourceId, setBackupSourceId] = useState<string>('');
  const [gapOnlyFavorites, setGapOnlyFavorites] = useState<boolean>(false);
  const [gapData, setGapData] = useState<any | null>(null);
  const [loadingGap, setLoadingGap] = useState<boolean>(false);
  const [copiedRsyncCmd, setCopiedRsyncCmd] = useState<boolean>(false);

  // Similar photos controls
  const [maxDistance, setMaxDistance] = useState<number>(6);
  const [within24h, setWithin24h] = useState<boolean>(false);
  const [offset, setOffset] = useState<number>(0);

  useEffect(() => {
    loadSummary();
    loadSources();
  }, []);

  const loadSources = async () => {
    try {
      const srcList = await ApiClient.getSources();
      setSources(srcList);
      if (srcList.length >= 2) {
        if (!primarySourceId) setPrimarySourceId(srcList[0].id);
        if (!backupSourceId) setBackupSourceId(srcList[1].id);
      } else if (srcList.length === 1) {
        if (!primarySourceId) setPrimarySourceId(srcList[0].id);
      }
    } catch (e) {
      console.warn('Could not load sources for duplicates view', e);
    }
  };

  const loadSummary = async () => {
    try {
      const s = await ApiClient.getDuplicatesSummary();
      setSummary(s);
    } catch (e) {
      console.warn('Could not load duplicates summary', e);
    }
  };

  // Load duplicates according to active tab mode
  const loadDuplicates = async (mode: 'intra_source' | 'multi_source') => {
    if (!ApiClient.getToken()) {
      setLoading(false);
      return;
    }
    try {
      setLoading(true);
      setOffset(0);
      const groups = await ApiClient.getDuplicates(0, 50, mode);
      setDuplicateGroups(groups);
    } catch (err) {
      console.error('Error loading duplicates:', err);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    if (activeTab === 'intra_source' || activeTab === 'multi_source') {
      loadDuplicates(activeTab);
    } else if (activeTab === 'similar' && similarGroups.length === 0) {
      loadSimilar();
    } else if (activeTab === 'backup_gap') {
      if (primarySourceId && backupSourceId && primarySourceId !== backupSourceId) {
        loadGap();
      }
    }
  }, [activeTab]);

  const loadGap = async () => {
    if (!primarySourceId || !backupSourceId || primarySourceId === backupSourceId) return;
    try {
      setLoadingGap(true);
      const res = await ApiClient.getBackupGap(primarySourceId, backupSourceId, gapOnlyFavorites);
      setGapData(res);
    } catch (err) {
      console.error('Error computing backup gap:', err);
    } finally {
      setLoadingGap(false);
    }
  };

  useEffect(() => {
    if (activeTab === 'backup_gap' && primarySourceId && backupSourceId) {
      loadGap();
    }
  }, [primarySourceId, backupSourceId, gapOnlyFavorites]);

  const handleLoadMore = async () => {
    const nextOffset = offset + 50;
    setLoadingMore(true);
    try {
      const mode = activeTab === 'multi_source' ? 'multi_source' : 'intra_source';
      const nextGroups = await ApiClient.getDuplicates(nextOffset, 50, mode);
      setDuplicateGroups((prev) => [...prev, ...nextGroups]);
      setOffset(nextOffset);
    } catch (err) {
      console.error('Error loading more duplicates:', err);
    } finally {
      setLoadingMore(false);
    }
  };

  const loadSimilar = async (dist = maxDistance, timeDiff = within24h ? 24 : undefined) => {
    try {
      setLoadingSimilar(true);
      const clusters = await ApiClient.getSimilarPhotos(dist, timeDiff);
      setSimilarGroups(clusters);
    } catch (err) {
      console.error('Error loading similar photos:', err);
    } finally {
      setLoadingSimilar(false);
    }
  };

  const handleExport = async (format: 'csv' | 'json') => {
    try {
      const mode = activeTab === 'multi_source' ? 'multi_source' : 'intra_source';
      const url = ApiClient.getDuplicateExportUrl(format, preferredSourceId || undefined, mode);
      const res = await fetch(url, {
        headers: {
          Authorization: `Bearer ${ApiClient.getToken()}`
        }
      });
      const blob = await res.blob();
      const downloadUrl = window.URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = downloadUrl;
      a.download = `report_${mode}_${new Date().toISOString().slice(0, 10)}.${format}`;
      document.body.appendChild(a);
      a.click();
      a.remove();
    } catch (err) {
      console.error('Export error:', err);
    }
  };

  const handleExportGap = async (format: 'csv' | 'json' | 'rsync_txt') => {
    if (!primarySourceId || !backupSourceId) return;
    try {
      const url = ApiClient.getBackupGapExportUrl(primarySourceId, backupSourceId, format, gapOnlyFavorites);
      const res = await fetch(url, {
        headers: {
          Authorization: `Bearer ${ApiClient.getToken()}`
        }
      });
      const blob = await res.blob();
      const downloadUrl = window.URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = downloadUrl;
      const ext = format === 'rsync_txt' ? 'txt' : format;
      a.download = `mancanti_backup_${new Date().toISOString().slice(0, 10)}.${ext}`;
      document.body.appendChild(a);
      a.click();
      a.remove();
    } catch (err) {
      console.error('Export gap error:', err);
    }
  };

  const formatBytes = (bytes?: number) => {
    if (!bytes || bytes === 0) return '0 B';
    const k = 1024;
    const sizes = ['B', 'KB', 'MB', 'GB', 'TB'];
    const i = Math.floor(Math.log(bytes) / Math.log(k));
    return parseFloat((bytes / Math.pow(k, i)).toFixed(2)) + ' ' + sizes[i];
  };

  const primarySourceObj = sources.find((s) => s.id === primarySourceId);
  const backupSourceObj = sources.find((s) => s.id === backupSourceId);
  const rsyncExampleCmd = primarySourceObj?.root_path && backupSourceObj?.root_path
    ? `rsync -av --files-from=missing_on_backup_rsync.txt "${primarySourceObj.root_path}/" "${backupSourceObj.root_path}/"`
    : `rsync -av --files-from=missing_on_backup_rsync.txt "/Volumes/FontePrimaria/" "/Volumes/FonteBackup/"`;

  const copyRsyncToClipboard = () => {
    navigator.clipboard.writeText(rsyncExampleCmd);
    setCopiedRsyncCmd(true);
    setTimeout(() => setCopiedRsyncCmd(false), 2500);
  };

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '24px' }}>
      {/* Header Banner */}
      <div style={{
        background: 'linear-gradient(135deg, #1e293b 0%, #0f172a 100%)',
        border: '1px solid #334155',
        borderRadius: '16px',
        padding: '24px',
        display: 'flex',
        justifyContent: 'space-between',
        alignItems: 'center',
        flexWrap: 'wrap',
        gap: '16px'
      }}>
        <div>
          <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
            <ShieldCheck size={26} color="#22c55e" />
            <h2 style={{ fontSize: '20px', fontWeight: 'bold' }}>Protezione Backup, Ridondanza & Duplicati</h2>
          </div>
          <p style={{ color: '#94a3b8', fontSize: '13px', marginTop: '6px', maxWidth: '680px' }}>
            Distingue le <strong>copie di backup sane su dischi diversi</strong> dallo <strong>spreco puro di file duplicati sullo stesso disco</strong>, con analisi dei buchi di backup tra due supporti.
          </p>
        </div>

        {/* 4 KPI Cards Grid */}
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(135px, 1fr))', gap: '10px', width: '100%', maxWidth: '640px' }}>
          <div style={{ background: '#0f172a', border: '1px solid rgba(34, 197, 94, 0.3)', borderRadius: '10px', padding: '10px 14px' }}>
            <div style={{ fontSize: '11px', color: '#94a3b8' }}>Copertura Backup</div>
            <div style={{ fontSize: '18px', fontWeight: 800, color: '#22c55e', marginTop: '2px' }}>
              {summary?.protection_coverage_pct ?? 0}%
            </div>
            <div style={{ fontSize: '10px', color: '#64748b' }}>{summary?.protected_media_count ?? 0} su 2+ dischi</div>
          </div>

          <div style={{ background: '#0f172a', border: '1px solid rgba(244, 63, 94, 0.3)', borderRadius: '10px', padding: '10px 14px' }}>
            <div style={{ fontSize: '11px', color: '#94a3b8' }}>A Rischio (1 Disco)</div>
            <div style={{ fontSize: '18px', fontWeight: 800, color: '#f43f5e', marginTop: '2px' }}>
              {summary?.unprotected_media_count ?? 0}
            </div>
            <div style={{ fontSize: '10px', color: '#f43f5e' }}>{summary?.unprotected_favorites_count ?? 0} ❤️ preferiti</div>
          </div>

          <div style={{ background: '#0f172a', border: '1px solid rgba(245, 158, 11, 0.3)', borderRadius: '10px', padding: '10px 14px' }}>
            <div style={{ fontSize: '11px', color: '#94a3b8' }}>Spreco Stesso Disco</div>
            <div style={{ fontSize: '18px', fontWeight: 800, color: '#f59e0b', marginTop: '2px' }}>
              {formatBytes(summary?.intra_source_wasted_bytes ?? 0)}
            </div>
            <div style={{ fontSize: '10px', color: '#64748b' }}>{summary?.intra_source_groups ?? 0} doppioni interni</div>
          </div>

          <div style={{ background: '#0f172a', border: '1px solid rgba(56, 189, 248, 0.3)', borderRadius: '10px', padding: '10px 14px' }}>
            <div style={{ fontSize: '11px', color: '#94a3b8' }}>Spazio in Backup</div>
            <div style={{ fontSize: '18px', fontWeight: 800, color: '#38bdf8', marginTop: '2px' }}>
              {formatBytes(summary?.multi_source_backup_bytes ?? 0)}
            </div>
            <div style={{ fontSize: '10px', color: '#64748b' }}>{summary?.healthy_multi_source_groups ?? 0} repliche sane</div>
          </div>
        </div>
      </div>

      {/* Tabs Selector */}
      <div style={{
        display: 'flex',
        background: '#0f172a',
        border: '1px solid #334155',
        borderRadius: '10px',
        padding: '4px',
        width: 'fit-content',
        flexWrap: 'wrap',
        gap: '4px'
      }}>
        <button
          onClick={() => setActiveTab('intra_source')}
          style={{
            background: activeTab === 'intra_source' ? '#f59e0b' : 'transparent',
            color: activeTab === 'intra_source' ? '#0f172a' : '#94a3b8',
            border: 'none',
            borderRadius: '6px',
            padding: '8px 16px',
            fontSize: '13px',
            fontWeight: 700,
            cursor: 'pointer',
            display: 'flex',
            alignItems: 'center',
            gap: '8px'
          }}
        >
          <AlertTriangle size={15} />
          Doppioni Stesso Disco (Spreco)
        </button>

        <button
          onClick={() => setActiveTab('multi_source')}
          style={{
            background: activeTab === 'multi_source' ? '#10b981' : 'transparent',
            color: activeTab === 'multi_source' ? '#064e3b' : '#94a3b8',
            border: 'none',
            borderRadius: '6px',
            padding: '8px 16px',
            fontSize: '13px',
            fontWeight: 700,
            cursor: 'pointer',
            display: 'flex',
            alignItems: 'center',
            gap: '8px'
          }}
        >
          <ShieldCheck size={15} />
          Repliche Multi-Disco (Backup Sani)
        </button>

        <button
          onClick={() => setActiveTab('backup_gap')}
          style={{
            background: activeTab === 'backup_gap' ? '#0284c7' : 'transparent',
            color: activeTab === 'backup_gap' ? 'white' : '#94a3b8',
            border: 'none',
            borderRadius: '6px',
            padding: '8px 16px',
            fontSize: '13px',
            fontWeight: 700,
            cursor: 'pointer',
            display: 'flex',
            alignItems: 'center',
            gap: '8px'
          }}
        >
          <ArrowLeftRight size={15} />
          Verifica Copertura & Gap tra 2 Dischi
        </button>

        <button
          onClick={() => setActiveTab('similar')}
          style={{
            background: activeTab === 'similar' ? '#8b5cf6' : 'transparent',
            color: activeTab === 'similar' ? 'white' : '#94a3b8',
            border: 'none',
            borderRadius: '6px',
            padding: '8px 16px',
            fontSize: '13px',
            fontWeight: 700,
            cursor: 'pointer',
            display: 'flex',
            alignItems: 'center',
            gap: '8px'
          }}
        >
          <Sparkles size={15} />
          Foto Simili (dHash)
        </button>
      </div>

      {/* Info notice about read-only policy */}
      <div style={{
        background: 'rgba(56, 189, 248, 0.08)',
        border: '1px solid rgba(56, 189, 248, 0.3)',
        borderRadius: '8px',
        padding: '12px 16px',
        fontSize: '12px',
        color: '#94a3b8',
        display: 'flex',
        alignItems: 'center',
        gap: '10px'
      }}>
        <Info size={16} color="#38bdf8" />
        <span>
          <strong>Politica 100% Read-Only:</strong> Personal Media Manager non cancella né sposta mai in automatico i tuoi file originali. Le liste e i comandi esportati servono a guidare le tue decisioni in totale controllo e sicurezza.
        </span>
      </div>

      {/* TAB 1 & 2: INTRA_SOURCE DUPLICATES OR HEALTHY MULTI-SOURCE REPLICAS */}
      {(activeTab === 'intra_source' || activeTab === 'multi_source') && (
        <div style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>
          {/* Controls / Export Bar */}
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: '12px' }}>
            <div style={{ fontSize: '13px', color: '#94a3b8' }}>
              {activeTab === 'intra_source' ? (
                <span>Visualizzati <strong>{duplicateGroups.length}</strong> gruppi con doppioni duplicati sullo stesso supporto.</span>
              ) : (
                <span>Visualizzati <strong>{duplicateGroups.length}</strong> file con copie sane replicate su 2 o più supporti distinti.</span>
              )}
            </div>

            <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
              {sources.length > 0 && (
                <select
                  value={preferredSourceId}
                  onChange={(e) => setPreferredSourceId(e.target.value)}
                  style={{
                    background: '#0f172a',
                    color: '#94a3b8',
                    border: '1px solid #334155',
                    borderRadius: '6px',
                    padding: '6px 10px',
                    fontSize: '12px'
                  }}
                >
                  <option value="">Fonte prioritaria: Prima trovata</option>
                  {sources.map((s) => (
                    <option key={s.id} value={s.id}>Prioritaria: {s.name}</option>
                  ))}
                </select>
              )}
              <button
                onClick={() => handleExport('csv')}
                style={{
                  background: '#0284c7',
                  color: 'white',
                  border: 'none',
                  borderRadius: '6px',
                  padding: '6px 12px',
                  fontSize: '12px',
                  fontWeight: 600,
                  cursor: 'pointer',
                  display: 'flex',
                  alignItems: 'center',
                  gap: '4px'
                }}
              >
                <Download size={13} /> Esporta CSV
              </button>
              <button
                onClick={() => handleExport('json')}
                style={{
                  background: '#0f172a',
                  color: '#cbd5e1',
                  border: '1px solid #334155',
                  borderRadius: '6px',
                  padding: '6px 12px',
                  fontSize: '12px',
                  fontWeight: 600,
                  cursor: 'pointer',
                  display: 'flex',
                  alignItems: 'center',
                  gap: '4px'
                }}
              >
                <Download size={13} /> JSON
              </button>
            </div>
          </div>

          {duplicateGroups.length === 0 && !loading ? (
            <div style={{
              textAlign: 'center',
              padding: '70px 20px',
              background: '#1e293b',
              borderRadius: '16px',
              border: '1px solid #334155'
            }}>
              <CheckCircle2 size={48} color="#22c55e" style={{ margin: '0 auto 16px' }} />
              <h3 style={{ fontSize: '18px', fontWeight: 600 }}>
                {activeTab === 'intra_source' ? 'Nessun doppione intra-disco rilevato!' : 'Nessuna replica multi-disco trovata.'}
              </h3>
              <p style={{ color: '#94a3b8', fontSize: '13px', marginTop: '6px' }}>
                {activeTab === 'intra_source'
                  ? 'Tutti i file su ciascun disco fisico sono unici. Zero spreco di spazio interno.'
                  : 'Nessun file risulta attualmente replicato su 2 o più dischi distinti.'}
              </p>
            </div>
          ) : (
            <div style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>
              {duplicateGroups.map((group) => {
                const isHealthy = group.redundancy_type === 'healthy_multi_source';
                const isIntra = group.redundancy_type === 'intra_source_duplicate';
                const seenSourcesInGroup = new Set<string>();

                return (
                  <div
                    key={group.media_id}
                    style={{
                      background: '#1e293b',
                      border: isHealthy ? '1px solid rgba(34, 197, 94, 0.4)' : '1px solid #334155',
                      borderRadius: '12px',
                      overflow: 'hidden'
                    }}
                  >
                    {/* Group Header */}
                    <div style={{
                      background: '#0f172a',
                      padding: '12px 18px',
                      borderBottom: '1px solid #334155',
                      display: 'flex',
                      justifyContent: 'space-between',
                      alignItems: 'center',
                      flexWrap: 'wrap',
                      gap: '12px'
                    }}>
                      <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
                        {isHealthy ? (
                          <span style={{
                            background: 'rgba(34, 197, 94, 0.15)',
                            color: '#22c55e',
                            border: '1px solid rgba(34, 197, 94, 0.3)',
                            fontSize: '11px',
                            fontWeight: 800,
                            padding: '3px 8px',
                            borderRadius: '6px'
                          }}>
                            🛡️ BACKUP SU {group.distinct_sources_count} DISCHI DISTINTI
                          </span>
                        ) : isIntra ? (
                          <span style={{
                            background: 'rgba(245, 158, 11, 0.15)',
                            color: '#f59e0b',
                            border: '1px solid rgba(245, 158, 11, 0.3)',
                            fontSize: '11px',
                            fontWeight: 800,
                            padding: '3px 8px',
                            borderRadius: '6px'
                          }}>
                            ⚠️ {group.copies_count} COPIE SULLO STESSO DISCO (SPRECO)
                          </span>
                        ) : (
                          <span style={{
                            background: 'rgba(56, 189, 248, 0.15)',
                            color: '#38bdf8',
                            fontSize: '11px',
                            fontWeight: 800,
                            padding: '3px 8px',
                            borderRadius: '6px'
                          }}>
                            {group.copies_count} COPIE ({group.distinct_sources_count} DISCHI)
                          </span>
                        )}

                        <span style={{ fontSize: '13px', color: '#94a3b8' }}>
                          Singola copia: <strong>{formatBytes(group.files[0]?.size_bytes)}</strong>
                          {group.intra_source_wasted_bytes > 0 && (
                            <span style={{ color: '#f59e0b', marginLeft: '8px' }}>
                              (Spreco reale: {formatBytes(group.intra_source_wasted_bytes)})
                            </span>
                          )}
                        </span>
                      </div>

                      <div style={{ fontSize: '11px', fontFamily: 'monospace', color: '#64748b' }}>
                        SHA: {group.canonical_sha256.substring(0, 16)}...
                      </div>
                    </div>

                    {/* Group Body: Thumbnail + Copies list */}
                    <div style={{ display: 'flex', flexWrap: 'wrap', padding: '16px 18px', gap: '16px' }}>
                      <div
                        onClick={() => setSelectedMediaId(group.media_id)}
                        style={{
                          width: '110px',
                          height: '110px',
                          borderRadius: '8px',
                          background: '#090d16',
                          cursor: 'pointer',
                          display: 'flex',
                          alignItems: 'center',
                          justifyContent: 'center',
                          overflow: 'hidden',
                          flexShrink: 0
                        }}
                      >
                        {group.has_thumbnail ? (
                          <img
                            src={ApiClient.getThumbnailUrl(group.media_id)}
                            alt="Thumbnail"
                            style={{ width: '100%', height: '100%', objectFit: 'cover' }}
                          />
                        ) : (
                          <FileText size={32} color="#64748b" />
                        )}
                      </div>

                      <div style={{ flex: '1 1 480px', display: 'flex', flexDirection: 'column', gap: '8px' }}>
                        {group.files.map((file: any, idx: number) => {
                          const isFirstOnSource = !seenSourcesInGroup.has(file.source_id);
                          seenSourcesInGroup.add(file.source_id);

                          return (
                            <div
                              key={file.id}
                              style={{
                                background: '#0f172a',
                                border: '1px solid #334155',
                                borderRadius: '8px',
                                padding: '10px 14px',
                                display: 'flex',
                                alignItems: 'center',
                                justifyContent: 'space-between',
                                gap: '12px',
                                fontSize: '12px'
                              }}
                            >
                              <div style={{ display: 'flex', alignItems: 'center', gap: '10px', minWidth: 0 }}>
                                <span style={{
                                  color: isFirstOnSource ? '#22c55e' : '#f59e0b',
                                  fontWeight: 'bold',
                                  width: '20px',
                                  textAlign: 'center'
                                }}>
                                  #{idx + 1}
                                </span>
                                <div style={{ minWidth: 0 }}>
                                  <div style={{ fontWeight: 600, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                                    {file.filename}
                                  </div>
                                  <div style={{ color: '#94a3b8', fontSize: '11px', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                                    📁 {file.relative_path}
                                  </div>
                                </div>
                              </div>

                              <div style={{ display: 'flex', alignItems: 'center', gap: '8px', flexShrink: 0 }}>
                                <div style={{ textAlign: 'right' }}>
                                  <div style={{ fontWeight: 500, display: 'flex', alignItems: 'center', gap: '4px', justifyContent: 'flex-end' }}>
                                    <HardDrive size={13} color={file.source_status === 'offline' ? '#94a3b8' : '#38bdf8'} />
                                    <span>{file.source_name || 'Fonte'}</span>
                                  </div>
                                  <div style={{ display: 'flex', gap: '4px', justifyContent: 'flex-end', marginTop: '4px' }}>
                                    {isFirstOnSource ? (
                                      <span style={{
                                        fontSize: '10px',
                                        padding: '2px 6px',
                                        borderRadius: '4px',
                                        background: 'rgba(34, 197, 94, 0.15)',
                                        color: '#22c55e',
                                        fontWeight: 700
                                      }}>
                                        REPLICA DI SICUREZZA
                                      </span>
                                    ) : (
                                      <span style={{
                                        fontSize: '10px',
                                        padding: '2px 6px',
                                        borderRadius: '4px',
                                        background: 'rgba(245, 158, 11, 0.15)',
                                        color: '#f59e0b',
                                        fontWeight: 700
                                      }}>
                                        SPRECO STESSO DISCO
                                      </span>
                                    )}
                                  </div>
                                </div>
                              </div>
                            </div>
                          );
                        })}
                      </div>
                    </div>
                  </div>
                );
              })}

              <div style={{ display: 'flex', justifyContent: 'center', marginTop: '12px' }}>
                <button
                  onClick={handleLoadMore}
                  disabled={loadingMore}
                  style={{
                    background: '#1e293b',
                    border: '1px solid #334155',
                    color: 'white',
                    padding: '10px 20px',
                    borderRadius: '8px',
                    fontSize: '13px',
                    fontWeight: 600,
                    cursor: loadingMore ? 'not-allowed' : 'pointer'
                  }}
                >
                  {loadingMore ? 'Caricamento...' : 'Carica altri gruppi (+50)'}
                </button>
              </div>
            </div>
          )}
        </div>
      )}

      {/* TAB 3: BACKUP GAP ANALYSIS */}
      {activeTab === 'backup_gap' && (
        <div style={{ display: 'flex', flexDirection: 'column', gap: '20px' }}>
          {/* Source Selection & Option Header */}
          <div style={{
            background: '#1e293b',
            border: '1px solid #334155',
            borderRadius: '12px',
            padding: '20px',
            display: 'flex',
            flexDirection: 'column',
            gap: '16px'
          }}>
            <h3 style={{ fontSize: '16px', fontWeight: 600, display: 'flex', alignItems: 'center', gap: '8px', margin: 0 }}>
              <ArrowLeftRight size={18} color="#38bdf8" />
              Confronto Copertura tra 2 Fonti (Gap Analysis)
            </h3>
            <p style={{ color: '#94a3b8', fontSize: '13px', margin: 0 }}>
              Seleziona la <strong>Fonte Primaria</strong> (es. SSD del Mac o iPhone) e la <strong>Fonte di Backup</strong> (es. Hard Disk esterno o NAS). L'analisi individuerà quali file della Fonte Primaria non sono ancora stati copiati sul disco di backup.
            </p>

            <div style={{ display: 'flex', alignItems: 'center', gap: '14px', flexWrap: 'wrap' }}>
              <div style={{ display: 'flex', flexDirection: 'column', gap: '4px', flex: '1 1 240px' }}>
                <label style={{ fontSize: '12px', color: '#94a3b8', fontWeight: 600 }}>Fonte Primaria (Originali):</label>
                <select
                  value={primarySourceId}
                  onChange={(e) => setPrimarySourceId(e.target.value)}
                  style={{
                    background: '#0f172a',
                    border: '1px solid #334155',
                    borderRadius: '8px',
                    color: 'white',
                    padding: '8px 12px',
                    fontSize: '13px'
                  }}
                >
                  {sources.map((s) => (
                    <option key={s.id} value={s.id}>{s.name} ({s.file_count || 0} file)</option>
                  ))}
                </select>
              </div>

              <div style={{ paddingTop: '20px' }}>
                <ArrowRight size={20} color="#64748b" />
              </div>

              <div style={{ display: 'flex', flexDirection: 'column', gap: '4px', flex: '1 1 240px' }}>
                <label style={{ fontSize: '12px', color: '#94a3b8', fontWeight: 600 }}>Fonte di Backup (Destinazione):</label>
                <select
                  value={backupSourceId}
                  onChange={(e) => setBackupSourceId(e.target.value)}
                  style={{
                    background: '#0f172a',
                    border: '1px solid #334155',
                    borderRadius: '8px',
                    color: 'white',
                    padding: '8px 12px',
                    fontSize: '13px'
                  }}
                >
                  {sources.map((s) => (
                    <option key={s.id} value={s.id}>{s.name} ({s.file_count || 0} file)</option>
                  ))}
                </select>
              </div>

              <div style={{ display: 'flex', alignItems: 'center', gap: '8px', paddingTop: '22px' }}>
                <label style={{ fontSize: '13px', display: 'flex', alignItems: 'center', gap: '6px', cursor: 'pointer' }}>
                  <input
                    type="checkbox"
                    checked={gapOnlyFavorites}
                    onChange={(e) => setGapOnlyFavorites(e.target.checked)}
                    style={{ accentColor: '#f43f5e', cursor: 'pointer' }}
                  />
                  <span>Solo Preferiti ❤️</span>
                </label>
              </div>
            </div>
          </div>

          {/* Gap Results Card */}
          {loadingGap ? (
            <div style={{ textAlign: 'center', padding: '50px', color: '#94a3b8' }}>
              Calcolo gap di backup in corso...
            </div>
          ) : gapData ? (
            <div style={{ display: 'flex', flexDirection: 'column', gap: '20px' }}>
              {/* Coverage KPI & Progress */}
              <div style={{
                background: '#1e293b',
                border: '1px solid #334155',
                borderRadius: '12px',
                padding: '20px',
                display: 'flex',
                flexDirection: 'column',
                gap: '14px'
              }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: '10px' }}>
                  <div>
                    <span style={{ fontSize: '13px', color: '#94a3b8' }}>Stato Copertura Backup:</span>
                    <div style={{ fontSize: '24px', fontWeight: 800, color: gapData.coverage_pct === 100 ? '#22c55e' : '#f59e0b', marginTop: '2px' }}>
                      {gapData.coverage_pct}% Copiato
                    </div>
                  </div>
                  <div style={{ textAlign: 'right', fontSize: '13px', color: '#94a3b8' }}>
                    <div><strong>{gapData.backed_up_media}</strong> su <strong>{gapData.total_primary_media}</strong> media salvati</div>
                    <div style={{ color: gapData.missing_on_backup_count > 0 ? '#f43f5e' : '#22c55e', fontWeight: 600, marginTop: '2px' }}>
                      {gapData.missing_on_backup_count} mancanti ({formatBytes(gapData.missing_on_backup_bytes)})
                    </div>
                  </div>
                </div>

                <div style={{ width: '100%', height: '10px', background: '#0f172a', borderRadius: '5px', overflow: 'hidden' }}>
                  <div style={{
                    width: `${gapData.coverage_pct}%`,
                    height: '100%',
                    background: gapData.coverage_pct === 100 ? '#22c55e' : 'linear-gradient(90deg, #f59e0b, #22c55e)',
                    borderRadius: '5px',
                    transition: 'width 0.4s ease'
                  }} />
                </div>

                {/* Export Buttons */}
                {gapData.missing_on_backup_count > 0 && (
                  <div style={{ display: 'flex', gap: '10px', flexWrap: 'wrap', marginTop: '6px' }}>
                    <button
                      onClick={() => handleExportGap('csv')}
                      style={{
                        background: '#0284c7',
                        color: 'white',
                        border: 'none',
                        borderRadius: '6px',
                        padding: '8px 14px',
                        fontSize: '12px',
                        fontWeight: 600,
                        cursor: 'pointer',
                        display: 'flex',
                        alignItems: 'center',
                        gap: '6px'
                      }}
                    >
                      <Download size={14} /> Esporta CSV Mancanti
                    </button>
                    <button
                      onClick={() => handleExportGap('rsync_txt')}
                      style={{
                        background: '#334155',
                        color: '#f8fafc',
                        border: '1px solid #475569',
                        borderRadius: '6px',
                        padding: '8px 14px',
                        fontSize: '12px',
                        fontWeight: 600,
                        cursor: 'pointer',
                        display: 'flex',
                        alignItems: 'center',
                        gap: '6px'
                      }}
                    >
                      <FileCode size={14} /> Esporta Lista rsync (.txt)
                    </button>
                  </div>
                )}
              </div>

              {/* Rsync Helper Card */}
              {gapData.missing_on_backup_count > 0 && (
                <div style={{
                  background: '#0f172a',
                  border: '1px solid #334155',
                  borderRadius: '10px',
                  padding: '16px',
                  display: 'flex',
                  flexDirection: 'column',
                  gap: '8px'
                }}>
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                    <span style={{ fontSize: '12px', fontWeight: 600, color: '#38bdf8' }}>
                      💡 Comando rapido da terminale macOS/Linux per sincronizzare solo i mancanti:
                    </span>
                    <button
                      onClick={copyRsyncToClipboard}
                      style={{
                        background: 'transparent',
                        border: '1px solid #475569',
                        borderRadius: '4px',
                        color: copiedRsyncCmd ? '#22c55e' : '#cbd5e1',
                        padding: '4px 8px',
                        fontSize: '11px',
                        cursor: 'pointer',
                        display: 'flex',
                        alignItems: 'center',
                        gap: '4px'
                      }}
                    >
                      {copiedRsyncCmd ? <Check size={12} /> : <Copy size={12} />}
                      {copiedRsyncCmd ? 'Copiato!' : 'Copia'}
                    </button>
                  </div>
                  <pre style={{
                    background: '#020617',
                    padding: '10px 12px',
                    borderRadius: '6px',
                    fontSize: '11px',
                    color: '#22c55e',
                    overflowX: 'auto',
                    margin: 0
                  }}>
                    {rsyncExampleCmd}
                  </pre>
                </div>
              )}

              {/* Missing Items Grid */}
              {gapData.missing_on_backup_count === 0 ? (
                <div style={{
                  textAlign: 'center',
                  padding: '60px 20px',
                  background: '#1e293b',
                  borderRadius: '12px',
                  border: '1px solid #334155'
                }}>
                  <CheckCircle2 size={40} color="#22c55e" style={{ margin: '0 auto 12px' }} />
                  <h4 style={{ fontSize: '16px', fontWeight: 600 }}>Tutti i file sono protetti su questo disco!</h4>
                  <p style={{ color: '#94a3b8', fontSize: '13px', marginTop: '4px' }}>
                    La Fonte di Backup selezionata contiene già una copia di tutti i file presenti sulla Fonte Primaria.
                  </p>
                </div>
              ) : (
                <div style={{ display: 'flex', flexDirection: 'column', gap: '10px' }}>
                  <div style={{ fontSize: '13px', fontWeight: 600, color: '#94a3b8' }}>
                    File presenti sulla Fonte Primaria mancanti sul Backup ({gapData.missing_items.length}):
                  </div>
                  <div style={{
                    display: 'grid',
                    gridTemplateColumns: 'repeat(auto-fill, minmax(260px, 1fr))',
                    gap: '12px'
                  }}>
                    {gapData.missing_items.slice(0, 100).map((item: any) => (
                      <div
                        key={item.media_id}
                        onClick={() => setSelectedMediaId(item.media_id)}
                        style={{
                          background: '#1e293b',
                          border: '1px solid #334155',
                          borderRadius: '8px',
                          padding: '10px 12px',
                          display: 'flex',
                          alignItems: 'center',
                          gap: '12px',
                          cursor: 'pointer'
                        }}
                      >
                        <div style={{
                          width: '50px',
                          height: '50px',
                          borderRadius: '6px',
                          background: '#090d16',
                          overflow: 'hidden',
                          flexShrink: 0,
                          display: 'flex',
                          alignItems: 'center',
                          justifyContent: 'center'
                        }}>
                          {item.has_thumbnail ? (
                            <img
                              src={ApiClient.getThumbnailUrl(item.media_id)}
                              alt="thumb"
                              style={{ width: '100%', height: '100%', objectFit: 'cover' }}
                            />
                          ) : (
                            <FileText size={20} color="#64748b" />
                          )}
                        </div>
                        <div style={{ minWidth: 0, flex: 1 }}>
                          <div style={{ fontWeight: 600, fontSize: '12px', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                            {item.filename}
                          </div>
                          <div style={{ color: '#94a3b8', fontSize: '11px', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', marginTop: '2px' }}>
                            📁 {item.relative_path}
                          </div>
                          <div style={{ fontSize: '10px', color: '#f43f5e', fontWeight: 600, marginTop: '2px' }}>
                            {formatBytes(item.size_bytes)} {item.is_favorite ? '• ❤️' : ''}
                          </div>
                        </div>
                      </div>
                    ))}
                  </div>
                  {gapData.missing_items.length > 100 && (
                    <div style={{ textAlign: 'center', fontSize: '12px', color: '#94a3b8', marginTop: '8px' }}>
                      Visualizzati i primi 100 di {gapData.missing_items.length} file mancanti. Esporta il report completo via CSV.
                    </div>
                  )}
                </div>
              )}
            </div>
          ) : null}
        </div>
      )}

      {/* TAB 4: SIMILAR PHOTOS (dHash) */}
      {activeTab === 'similar' && (
        <div style={{ display: 'flex', flexDirection: 'column', gap: '20px' }}>
          {/* Controls Bar */}
          <div style={{
            background: '#1e293b',
            border: '1px solid #334155',
            borderRadius: '12px',
            padding: '16px 20px',
            display: 'flex',
            justifyContent: 'space-between',
            alignItems: 'center',
            flexWrap: 'wrap',
            gap: '14px'
          }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: '16px', flexWrap: 'wrap' }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                <span style={{ fontSize: '13px', color: '#94a3b8' }}>Sensibilità distanza:</span>
                <select
                  value={maxDistance}
                  onChange={(e) => {
                    const val = Number(e.target.value);
                    setMaxDistance(val);
                    loadSimilar(val, within24h ? 24 : undefined);
                  }}
                  style={{
                    background: '#0f172a',
                    border: '1px solid #334155',
                    color: 'white',
                    borderRadius: '6px',
                    padding: '6px 10px',
                    fontSize: '12px'
                  }}
                >
                  <option value={2}>Quasi identiche (dist &lt;= 2)</option>
                  <option value={4}>Molto simili / Raffiche (dist &lt;= 4)</option>
                  <option value={6}>Simili / Stessa scena (dist &lt;= 6 - Default)</option>
                  <option value={10}>Composizione simile (dist &lt;= 10)</option>
                </select>
              </div>

              <label style={{ display: 'flex', alignItems: 'center', gap: '6px', fontSize: '13px', cursor: 'pointer' }}>
                <input
                  type="checkbox"
                  checked={within24h}
                  onChange={(e) => {
                    setWithin24h(e.target.checked);
                    loadSimilar(maxDistance, e.target.checked ? 24 : undefined);
                  }}
                  style={{ accentColor: '#38bdf8', cursor: 'pointer' }}
                />
                <span>Solo scatti entro 24 ore (Raffiche reali)</span>
              </label>
            </div>

            <button
              onClick={() => loadSimilar(maxDistance, within24h ? 24 : undefined)}
              disabled={loadingSimilar}
              style={{
                background: '#8b5cf6',
                color: 'white',
                border: 'none',
                borderRadius: '6px',
                padding: '8px 16px',
                fontSize: '12px',
                fontWeight: 600,
                cursor: loadingSimilar ? 'not-allowed' : 'pointer',
                display: 'flex',
                alignItems: 'center',
                gap: '6px'
              }}
            >
              <Sparkles size={14} />
              {loadingSimilar ? 'Ricerca in corso...' : 'Rianalizza Foto Simili'}
            </button>
          </div>

          {/* Results list */}
          {loadingSimilar ? (
            <div style={{ textAlign: 'center', padding: '60px', color: '#94a3b8' }}>
              Calcolo distanze Hamming e clustering percorsi in corso...
            </div>
          ) : similarGroups.length === 0 ? (
            <div style={{
              textAlign: 'center',
              padding: '60px 20px',
              background: '#1e293b',
              borderRadius: '16px',
              border: '1px solid #334155'
            }}>
              <Sparkles size={40} color="#8b5cf6" style={{ margin: '0 auto 12px' }} />
              <h3 style={{ fontSize: '18px', fontWeight: 600 }}>Nessuna foto simile trovata</h3>
              <p style={{ color: '#94a3b8', fontSize: '13px', marginTop: '6px' }}>
                Prova ad aumentare la sensibilità di distanza o disattivare il filtro temporale delle 24 ore.
              </p>
            </div>
          ) : (
            <div style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>
              {similarGroups.map((group, gIdx) => (
                <div
                  key={group.group_id || gIdx}
                  style={{
                    background: '#1e293b',
                    border: '1px solid #334155',
                    borderRadius: '12px',
                    padding: '16px 20px',
                    display: 'flex',
                    flexDirection: 'column',
                    gap: '12px'
                  }}
                >
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                    <span style={{ fontSize: '13px', fontWeight: 700, color: '#a78bfa', display: 'flex', alignItems: 'center', gap: '6px' }}>
                      <Sparkles size={14} />
                      Gruppo Simile #{gIdx + 1} ({group.media_items?.length || group.count} foto)
                    </span>
                    <span style={{ fontSize: '11px', color: '#94a3b8' }}>
                      {group.time_span_hours ? `Intervallo: ${group.time_span_hours.toFixed(1)} ore` : 'Stessa sessione'}
                    </span>
                  </div>

                  <div style={{ display: 'flex', gap: '12px', overflowX: 'auto', paddingBottom: '6px' }}>
                    {(group.media_items || []).map((item: any) => (
                      <div
                        key={item.id}
                        onClick={() => setSelectedMediaId(item.id)}
                        style={{
                          width: '120px',
                          flexShrink: 0,
                          cursor: 'pointer',
                          display: 'flex',
                          flexDirection: 'column',
                          gap: '6px'
                        }}
                      >
                        <div style={{
                          width: '120px',
                          height: '120px',
                          borderRadius: '8px',
                          background: '#090d16',
                          overflow: 'hidden',
                          display: 'flex',
                          alignItems: 'center',
                          justifyContent: 'center'
                        }}>
                          {item.has_thumbnail ? (
                            <img
                              src={ApiClient.getThumbnailUrl(item.id)}
                              alt="thumb"
                              style={{ width: '100%', height: '100%', objectFit: 'cover' }}
                            />
                          ) : (
                            <FileText size={28} color="#64748b" />
                          )}
                        </div>
                        <div style={{ fontSize: '11px', color: '#cbd5e1', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                          {item.primary_filename || 'Foto'}
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      )}

      {/* Media Detail Modal */}
      {selectedMediaId && (
        <MediaDetailModal
          mediaId={selectedMediaId}
          onClose={() => setSelectedMediaId(null)}
        />
      )}
    </div>
  );
};
