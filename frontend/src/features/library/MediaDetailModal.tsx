import React, { useEffect, useState } from 'react';
import { ApiClient } from '../../services/api';
import { useToast } from '../../context/ToastContext';
import {
  X,
  Calendar,
  Camera,
  MapPin,
  HardDrive,
  ExternalLink,
  FileText,
  Folder,
  FolderOpen,
  Tag as TagIcon,
  Plus,
  Play,
  Heart,
  ChevronLeft,
  ChevronRight,
  Download,
  Sparkles,
  ShieldCheck,
  AlertTriangle,
  ShieldAlert
} from 'lucide-react';

interface MediaDetailModalProps {
  mediaId: string | null;
  onClose: () => void;
  onPrev?: () => void;
  onNext?: () => void;
  hasPrev?: boolean;
  hasNext?: boolean;
  onFavoriteChanged?: (mediaId: string, isFavorite: boolean) => void;
}

export const MediaDetailModal: React.FC<MediaDetailModalProps> = ({
  mediaId,
  onClose,
  onPrev,
  onNext,
  hasPrev = false,
  hasNext = false,
  onFavoriteChanged
}) => {
  const { toast } = useToast();
  const [data, setData] = useState<any | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // High Resolution Preview state
  const [loadHd, setLoadHd] = useState(false);
  const [hdError, setHdError] = useState<string | null>(null);

  // Albums & Tags state
  const [availableAlbums, setAvailableAlbums] = useState<any[]>([]);
  const [availableTags, setAvailableTags] = useState<any[]>([]);
  const [showNewAlbumInput, setShowNewAlbumInput] = useState(false);
  const [newAlbumName, setNewAlbumName] = useState('');
  const [showNewTagInput, setShowNewTagInput] = useState(false);
  const [newTagName, setNewTagName] = useState('');

  // Finder reveal state
  const [revealingFileId, setRevealingFileId] = useState<string | null>(null);
  const [isRevealingPrimary, setIsRevealingPrimary] = useState<boolean>(false);

  const handleRevealFile = async (fileId: string, filename?: string) => {
    try {
      setRevealingFileId(fileId);
      await ApiClient.revealFile(fileId);
      toast.success(`Aperto nel Finder: ${filename || 'file'}`);
    } catch (err) {
      toast.error((err as Error).message || 'Impossibile aprire nel Finder');
    } finally {
      setRevealingFileId(null);
    }
  };

  const handleRevealMedia = async () => {
    if (!mediaId) return;
    try {
      setIsRevealingPrimary(true);
      const res = await ApiClient.revealMedia(mediaId);
      toast.success(`Aperto nel Finder: ${res.filename} (${res.source_name})`);
    } catch (err) {
      toast.error((err as Error).message || 'Impossibile aprire nel Finder');
    } finally {
      setIsRevealingPrimary(false);
    }
  };
  const [newTagColor, setNewTagColor] = useState('#38bdf8');
  const [isPlayingVideo, setIsPlayingVideo] = useState(false);
  const [streamError, setStreamError] = useState<string | null>(null);

  // Reset state on mediaId change
  useEffect(() => {
    setIsPlayingVideo(false);
    setStreamError(null);
    setLoadHd(false);
    setHdError(null);
    if (!mediaId) {
      setData(null);
      return;
    }

    const loadDetail = async () => {
      try {
        setLoading(true);
        setError(null);
        const [detail, albums, tags] = await Promise.all([
          ApiClient.getMediaDetail(mediaId),
          ApiClient.getAlbums().catch(() => []),
          ApiClient.getTags().catch(() => [])
        ]);
        setData(detail);
        setAvailableAlbums(albums);
        setAvailableTags(tags);
      } catch (err) {
        setError((err as Error).message || 'Impossibile caricare il dettaglio media');
      } finally {
        setLoading(false);
      }
    };

    loadDetail();
  }, [mediaId]);

  // Keyboard Navigation: Escape, ArrowLeft, ArrowRight, F
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      const target = e.target as HTMLElement;
      if (['INPUT', 'TEXTAREA', 'SELECT'].includes(target?.tagName)) {
        return;
      }
      if (e.key === 'Escape') {
        onClose();
      } else if (e.key === 'ArrowLeft') {
        if (hasPrev && onPrev) onPrev();
      } else if (e.key === 'ArrowRight') {
        if (hasNext && onNext) onNext();
      } else if (e.key === 'f' || e.key === 'F') {
        if (data && mediaId) {
          handleToggleFavoriteModal();
        }
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [mediaId, data, hasPrev, hasNext, onPrev, onNext, onClose]);

  const handleToggleFavoriteModal = async () => {
    if (!mediaId) return;
    try {
      const res = await ApiClient.toggleFavorite(mediaId);
      setData((prev: any) => prev ? { ...prev, is_favorite: res.is_favorite } : prev);
      if (onFavoriteChanged) {
        onFavoriteChanged(mediaId, res.is_favorite);
      }
      toast.success(res.is_favorite ? 'Aggiunto ai preferiti' : 'Rimosso dai preferiti');
    } catch (err) {
      toast.error((err as Error).message);
    }
  };

  if (!mediaId) return null;

  const handleAddMediaToAlbum = async (albumId: string) => {
    if (!mediaId) return;
    try {
      await ApiClient.addMediaToAlbum(albumId, [mediaId]);
      const updated = await ApiClient.getMediaDetail(mediaId);
      setData(updated);
      toast.success('Aggiunto all\'album!');
    } catch (err) {
      toast.error((err as Error).message);
    }
  };

  const handleCreateAndAddAlbum = async () => {
    if (!newAlbumName.trim() || !mediaId) return;
    try {
      const created = await ApiClient.createAlbum(newAlbumName.trim());
      await ApiClient.addMediaToAlbum(created.id, [mediaId]);
      setAvailableAlbums((prev) => [...prev, created]);
      const updated = await ApiClient.getMediaDetail(mediaId);
      setData(updated);
      setNewAlbumName('');
      setShowNewAlbumInput(false);
      toast.success(`Album "${created.name}" creato!`);
    } catch (err) {
      toast.error((err as Error).message);
    }
  };

  const handleRemoveMediaFromAlbum = async (albumId: string) => {
    if (!mediaId) return;
    try {
      await ApiClient.removeMediaFromAlbum(albumId, mediaId);
      setData((prev: any) => ({
        ...prev,
        albums: prev?.albums?.filter((a: any) => a.id !== albumId) || []
      }));
      toast.success('Rimosso dall\'album.');
    } catch (err) {
      toast.error((err as Error).message);
    }
  };

  const handleAddMediaToTag = async (tagId: string) => {
    if (!mediaId) return;
    try {
      await ApiClient.addMediaToTag(tagId, [mediaId]);
      const updated = await ApiClient.getMediaDetail(mediaId);
      setData(updated);
      toast.success('Tag associato!');
    } catch (err) {
      toast.error((err as Error).message);
    }
  };

  const handleCreateAndAddTag = async () => {
    if (!newTagName.trim() || !mediaId) return;
    try {
      const created = await ApiClient.createTag(newTagName.trim(), newTagColor);
      await ApiClient.addMediaToTag(created.id, [mediaId]);
      setAvailableTags((prev) => [...prev, created]);
      const updated = await ApiClient.getMediaDetail(mediaId);
      setData(updated);
      setNewTagName('');
      setShowNewTagInput(false);
      toast.success(`Tag "${created.name}" creato!`);
    } catch (err) {
      toast.error((err as Error).message);
    }
  };

  const handleRemoveMediaFromTag = async (tagId: string) => {
    if (!mediaId) return;
    try {
      await ApiClient.removeMediaFromTag(tagId, mediaId);
      setData((prev: any) => ({
        ...prev,
        tags: prev?.tags?.filter((t: any) => t.id !== tagId) || []
      }));
      toast.success('Tag rimosso.');
    } catch (err) {
      toast.error((err as Error).message);
    }
  };

  const formatBytes = (bytes?: number) => {
    if (!bytes) return '0 B';
    const k = 1024;
    const sizes = ['B', 'KB', 'MB', 'GB'];
    const i = Math.floor(Math.log(bytes) / Math.log(k));
    return parseFloat((bytes / Math.pow(k, i)).toFixed(2)) + ' ' + sizes[i];
  };

  const primaryFile = data?.files && data.files.length > 0 ? data.files[0] : null;
  const targetVideoMediaId = data?.media_type === 'video' ? data.id : (data?.is_live_photo && data?.live_video_media_id ? data.live_video_media_id : null);

  return (
    <div className="modal-overlay" style={{
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
      zIndex: 1050,
      padding: '24px'
    }}>
      <div className="modal-card" style={{
        background: '#1e293b',
        border: '1px solid #334155',
        borderRadius: '16px',
        width: '100%',
        maxWidth: '960px',
        maxHeight: '90vh',
        display: 'flex',
        flexDirection: 'column',
        overflow: 'hidden',
        boxShadow: '0 25px 50px -12px rgba(0, 0, 0, 0.6)'
      }}>
        {/* Header */}
        <div style={{
          display: 'flex',
          justifyContent: 'space-between',
          alignItems: 'center',
          padding: '16px 24px',
          borderBottom: '1px solid #334155'
        }}>
          <div>
            <h3 style={{ fontSize: '18px', fontWeight: 'bold' }}>
              {primaryFile?.filename || 'Dettaglio Media'}
            </h3>
            <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginTop: '4px', flexWrap: 'wrap' }}>
              <span style={{ fontSize: '12px', color: '#94a3b8' }}>
                Contenuto logico • {data?.copies_count || 1} copie fisiche ({data?.distinct_sources_count || 1} {(data?.distinct_sources_count || 1) === 1 ? 'disco' : 'dischi'})
              </span>
              {data?.protection_status === 'protected' && (
                <span style={{
                  fontSize: '11px',
                  fontWeight: 700,
                  padding: '2px 8px',
                  borderRadius: '6px',
                  background: 'rgba(34, 197, 94, 0.15)',
                  color: '#22c55e',
                  border: '1px solid rgba(34, 197, 94, 0.3)',
                  display: 'inline-flex',
                  alignItems: 'center',
                  gap: '4px'
                }}>
                  <ShieldCheck size={13} />
                  Protetto su {data.distinct_sources_count} dischi
                </span>
              )}
              {data?.protection_status === 'intra_source_duplicate' && (
                <span style={{
                  fontSize: '11px',
                  fontWeight: 700,
                  padding: '2px 8px',
                  borderRadius: '6px',
                  background: 'rgba(245, 158, 11, 0.15)',
                  color: '#f59e0b',
                  border: '1px solid rgba(245, 158, 11, 0.3)',
                  display: 'inline-flex',
                  alignItems: 'center',
                  gap: '4px'
                }}>
                  <AlertTriangle size={13} />
                  Doppioni sullo stesso disco
                </span>
              )}
              {data?.protection_status === 'unprotected' && (
                <span style={{
                  fontSize: '11px',
                  fontWeight: 700,
                  padding: '2px 8px',
                  borderRadius: '6px',
                  background: 'rgba(244, 63, 94, 0.15)',
                  color: '#f43f5e',
                  border: '1px solid rgba(244, 63, 94, 0.3)',
                  display: 'inline-flex',
                  alignItems: 'center',
                  gap: '4px'
                }}>
                  <ShieldAlert size={13} />
                  A Rischio (1 Solo Disco)
                </span>
              )}
            </div>
          </div>
          <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
            <button
              onClick={handleRevealMedia}
              disabled={isRevealingPrimary || data?.files?.every((f: any) => f.source_status === 'offline')}
              style={{
                background: 'rgba(51, 65, 85, 0.6)',
                border: '1px solid #475569',
                color: data?.files?.every((f: any) => f.source_status === 'offline') ? '#64748b' : '#38bdf8',
                borderRadius: '8px',
                padding: '6px 12px',
                display: 'flex',
                alignItems: 'center',
                gap: '6px',
                fontSize: '12px',
                fontWeight: 600,
                cursor: data?.files?.every((f: any) => f.source_status === 'offline') ? 'not-allowed' : 'pointer',
                opacity: data?.files?.every((f: any) => f.source_status === 'offline') ? 0.6 : 1
              }}
              title={data?.files?.every((f: any) => f.source_status === 'offline') ? 'Tutti i dischi contenenti copie sono offline' : 'Evidenzia questo file nel Finder sul disco collegato'}
            >
              <FolderOpen size={16} />
              {isRevealingPrimary ? 'Apertura Finder...' : 'Mostra nel Finder'}
            </button>
            <button
              onClick={async () => {
                if (!mediaId) return;
                try {
                  const res = await ApiClient.toggleFavorite(mediaId);
                  setData((prev: any) => ({ ...prev, is_favorite: res.is_favorite }));
                  if (onFavoriteChanged) {
                    onFavoriteChanged(mediaId, res.is_favorite);
                  }
                  toast.success(res.is_favorite ? 'Aggiunto ai preferiti' : 'Rimosso dai preferiti');
                } catch (err) {
                  toast.error((err as Error).message);
                }
              }}
              style={{
                background: data?.is_favorite ? 'rgba(244, 63, 94, 0.2)' : 'rgba(51, 65, 85, 0.6)',
                border: data?.is_favorite ? '1px solid #f43f5e' : '1px solid #475569',
                color: data?.is_favorite ? '#f43f5e' : '#94a3b8',
                borderRadius: '8px',
                padding: '6px 12px',
                display: 'flex',
                alignItems: 'center',
                gap: '6px',
                fontSize: '12px',
                fontWeight: 600,
                cursor: 'pointer'
              }}
            >
              <Heart size={16} fill={data?.is_favorite ? '#f43f5e' : 'none'} color={data?.is_favorite ? '#f43f5e' : 'currentColor'} />
              {data?.is_favorite ? 'Preferito' : 'Aggiungi ai Preferiti'}
            </button>
            <button
              onClick={onClose}
              style={{ background: 'transparent', border: 'none', color: '#94a3b8', padding: '6px', cursor: 'pointer' }}
            >
              <X size={20} />
            </button>
          </div>
        </div>

        {/* Modal Body */}
        <div style={{ display: 'flex', flex: 1, overflowY: 'auto', flexWrap: 'wrap' }}>
          {/* Left Preview Pane */}
          <div className="modal-pane-left" style={{
            flex: '1 1 450px',
            background: '#090d16',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            minHeight: '360px',
            padding: '20px',
            position: 'relative'
          }}>
            {/* Prev Button */}
            {hasPrev && onPrev && (
              <button
                onClick={(e) => { e.stopPropagation(); onPrev(); }}
                style={{
                  position: 'absolute',
                  left: '12px',
                  top: '50%',
                  transform: 'translateY(-50%)',
                  background: 'rgba(15, 23, 42, 0.75)',
                  border: '1px solid #334155',
                  color: 'white',
                  borderRadius: '50%',
                  width: '36px',
                  height: '36px',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  cursor: 'pointer',
                  zIndex: 10,
                  backdropFilter: 'blur(4px)'
                }}
                title="Foto Precedente (←)"
              >
                <ChevronLeft size={20} />
              </button>
            )}

            {/* Next Button */}
            {hasNext && onNext && (
              <button
                onClick={(e) => { e.stopPropagation(); onNext(); }}
                style={{
                  position: 'absolute',
                  right: '12px',
                  top: '50%',
                  transform: 'translateY(-50%)',
                  background: 'rgba(15, 23, 42, 0.75)',
                  border: '1px solid #334155',
                  color: 'white',
                  borderRadius: '50%',
                  width: '36px',
                  height: '36px',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  cursor: 'pointer',
                  zIndex: 10,
                  backdropFilter: 'blur(4px)'
                }}
                title="Foto Successiva (→)"
              >
                <ChevronRight size={20} />
              </button>
            )}

            {isPlayingVideo && targetVideoMediaId ? (
              <div style={{ width: '100%', height: '100%', display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center' }}>
                <video
                  controls
                  autoPlay
                  loop
                  muted
                  playsInline
                  src={ApiClient.getMediaStreamUrl(targetVideoMediaId)}
                  onError={() => setStreamError('Disco sorgente offline o file non accessibile dal server')}
                  style={{
                    maxHeight: '400px',
                    maxWidth: '100%',
                    borderRadius: '8px',
                    boxShadow: '0 10px 25px rgba(0,0,0,0.5)'
                  }}
                />
                {streamError && (
                  <div style={{ color: '#f43f5e', fontSize: '12px', marginTop: '8px', background: 'rgba(244, 63, 94, 0.1)', padding: '4px 8px', borderRadius: '4px' }}>
                    {streamError}
                  </div>
                )}
                <button
                  onClick={() => setIsPlayingVideo(false)}
                  style={{
                    marginTop: '10px',
                    background: '#334155',
                    color: 'white',
                    border: 'none',
                    borderRadius: '6px',
                    padding: '6px 12px',
                    fontSize: '12px',
                    cursor: 'pointer'
                  }}
                >
                  Torna alla miniatura
                </button>
              </div>
            ) : data?.has_thumbnail ? (
              <>
                <img
                  src={loadHd ? ApiClient.getMediaPreviewUrl(data.id) : ApiClient.getThumbnailUrl(data.id)}
                  alt={primaryFile?.filename || 'Media'}
                  onError={() => {
                    if (loadHd) {
                      setHdError('Disco offline o anteprima HD non disponibile.');
                      setLoadHd(false);
                    }
                  }}
                  style={{
                    maxHeight: '440px',
                    maxWidth: '100%',
                    objectFit: 'contain',
                    borderRadius: '8px',
                    boxShadow: '0 10px 25px rgba(0,0,0,0.5)'
                  }}
                />

                {hdError && (
                  <div style={{
                    position: 'absolute',
                    top: '16px',
                    background: 'rgba(244, 63, 94, 0.85)',
                    color: 'white',
                    padding: '4px 10px',
                    borderRadius: '4px',
                    fontSize: '11px',
                    fontWeight: 600
                  }}>
                    {hdError}
                  </div>
                )}

                <div style={{
                  position: 'absolute',
                  bottom: '16px',
                  display: 'flex',
                  alignItems: 'center',
                  gap: '8px',
                  flexWrap: 'wrap',
                  justifyContent: 'center',
                  zIndex: 5
                }}>
                  {data.media_type === 'image' && (
                    <button
                      onClick={() => { setHdError(null); setLoadHd(!loadHd); }}
                      style={{
                        background: loadHd ? 'rgba(34, 197, 94, 0.9)' : 'rgba(15, 23, 42, 0.85)',
                        border: '1px solid #334155',
                        color: 'white',
                        borderRadius: '20px',
                        padding: '6px 14px',
                        fontSize: '11px',
                        fontWeight: 600,
                        cursor: 'pointer',
                        display: 'flex',
                        alignItems: 'center',
                        gap: '6px',
                        backdropFilter: 'blur(4px)'
                      }}
                    >
                      <Sparkles size={13} color={loadHd ? 'white' : '#38bdf8'} />
                      {loadHd ? 'HD Attivo (1920px)' : 'Carica HD'}
                    </button>
                  )}
                  <a
                    href={ApiClient.getMediaDownloadUrl(data.id)}
                    target="_blank"
                    rel="noreferrer"
                    style={{
                      background: 'rgba(15, 23, 42, 0.85)',
                      border: '1px solid #334155',
                      color: 'white',
                      borderRadius: '20px',
                      padding: '6px 14px',
                      fontSize: '11px',
                      fontWeight: 600,
                      cursor: 'pointer',
                      display: 'flex',
                      alignItems: 'center',
                      gap: '6px',
                      textDecoration: 'none',
                      backdropFilter: 'blur(4px)'
                    }}
                  >
                    <Download size={13} color="#38bdf8" />
                    Scarica
                  </a>
                  {targetVideoMediaId && (
                    <button
                      onClick={() => { setStreamError(null); setIsPlayingVideo(true); }}
                      style={{
                        background: 'rgba(2, 132, 199, 0.95)',
                        color: 'white',
                        border: 'none',
                        borderRadius: '20px',
                        padding: '6px 14px',
                        fontSize: '11px',
                        fontWeight: 600,
                        cursor: 'pointer',
                        display: 'flex',
                        alignItems: 'center',
                        gap: '6px',
                        backdropFilter: 'blur(4px)'
                      }}
                    >
                      <Play size={13} fill="white" />
                      {data.is_live_photo ? 'Live Photo' : 'Riproduci Video'}
                    </button>
                  )}
                </div>
              </>
            ) : loading && !data ? (
              <div style={{ textAlign: 'center', color: '#94a3b8', fontSize: '13px' }}>
                Caricamento anteprima...
              </div>
            ) : (
              <div style={{ textAlign: 'center', color: '#64748b' }}>
                <FileText size={56} style={{ margin: '0 auto 12px' }} />
                <div>Miniatura non generata sul server</div>
                {data?.id && (
                  <div style={{ marginTop: '12px', display: 'flex', gap: '8px', justifyContent: 'center' }}>
                    <a
                      href={ApiClient.getMediaDownloadUrl(data.id)}
                      target="_blank"
                      rel="noreferrer"
                      style={{
                        background: '#0284c7',
                        color: 'white',
                        border: 'none',
                        borderRadius: '6px',
                        padding: '8px 14px',
                        fontSize: '12px',
                        fontWeight: 600,
                        cursor: 'pointer',
                        display: 'inline-flex',
                        alignItems: 'center',
                        gap: '6px',
                        textDecoration: 'none'
                      }}
                    >
                      <Download size={14} /> Scarica Originale
                    </a>
                    {targetVideoMediaId && (
                      <button
                        onClick={() => { setStreamError(null); setIsPlayingVideo(true); }}
                        style={{
                          background: '#334155',
                          color: 'white',
                          border: 'none',
                          borderRadius: '6px',
                          padding: '8px 14px',
                          fontSize: '12px',
                          fontWeight: 600,
                          cursor: 'pointer',
                          display: 'inline-flex',
                          alignItems: 'center',
                          gap: '6px'
                        }}
                      >
                        <Play size={14} fill="white" />
                        Riproduci Video
                      </button>
                    )}
                  </div>
                )}
              </div>
            )}
          </div>

          {/* Right Information Pane */}
          <div className="modal-pane-right" style={{ flex: '1 1 380px', padding: '24px', display: 'flex', flexDirection: 'column', gap: '20px' }}>
            {loading && <div style={{ color: '#94a3b8' }}>Caricamento metadati...</div>}
            {error && <div style={{ color: '#f43f5e' }}>{error}</div>}

            {data && (
              <>
                {/* File Specs */}
                <div>
                  <h4 style={{ fontSize: '13px', color: '#94a3b8', fontWeight: 600, textTransform: 'uppercase', marginBottom: '8px' }}>
                    Specifiche Tecniche
                  </h4>
                  <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '8px', fontSize: '13px' }}>
                    <div>
                      <span style={{ color: '#64748b' }}>Tipo:</span>{' '}
                      <strong>{data.media_type.toUpperCase()}</strong>
                    </div>
                    <div>
                      <span style={{ color: '#64748b' }}>Dimensione:</span>{' '}
                      <strong>{formatBytes(primaryFile?.size_bytes)}</strong>
                    </div>
                    <div>
                      <span style={{ color: '#64748b' }}>Risoluzione:</span>{' '}
                      <strong>{data.width && data.height ? `${data.width} × ${data.height}` : 'N/A'}</strong>
                    </div>
                    {data.duration_seconds && (
                      <div>
                        <span style={{ color: '#64748b' }}>Durata:</span>{' '}
                        <strong>{data.duration_seconds}s</strong>
                      </div>
                    )}
                    {data.is_live_photo && (
                      <div style={{ gridColumn: 'span 2', display: 'flex', alignItems: 'center', gap: '6px', marginTop: '4px' }}>
                        <span style={{ color: '#64748b' }}>Funzionalità:</span>{' '}
                        <span style={{
                          background: 'rgba(236, 72, 153, 0.2)',
                          color: '#ec4899',
                          fontWeight: 700,
                          fontSize: '11px',
                          padding: '2px 8px',
                          borderRadius: '4px'
                        }}>
                          Apple Live Photo (Foto + Video clip abbinati)
                        </span>
                      </div>
                    )}
                  </div>
                </div>

                {/* EXIF & Camera */}
                <div>
                  <h4 style={{ fontSize: '13px', color: '#94a3b8', fontWeight: 600, textTransform: 'uppercase', marginBottom: '8px' }}>
                    Metadati EXIF & Acquisizione
                  </h4>
                  <div style={{ display: 'flex', flexDirection: 'column', gap: '8px', fontSize: '13px' }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                      <Calendar size={15} color="#38bdf8" />
                      <span>Data Scatto:{' '}
                        <strong>
                          {data.captured_at ? new Date(data.captured_at).toLocaleString() : 'Non specificata'}
                        </strong>
                      </span>
                    </div>

                    {(data.place_name || (data.latitude && data.longitude)) && (
                      <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                        <MapPin size={15} color="#22c55e" />
                        <span>
                          {data.place_name && <strong>{data.place_name} </strong>}
                          {data.latitude && data.longitude && (
                            <span style={{ color: '#94a3b8', fontSize: '12px' }}>
                              ({data.latitude.toFixed(4)}, {data.longitude.toFixed(4)})
                            </span>
                          )}
                        </span>
                        {data.latitude && data.longitude && (
                          <a
                            href={`https://www.openstreetmap.org/?mlat=${data.latitude}&mlon=${data.longitude}#map=16/${data.latitude}/${data.longitude}`}
                            target="_blank"
                            rel="noopener noreferrer"
                            style={{ color: '#38bdf8', display: 'flex', alignItems: 'center', gap: '2px', fontSize: '11px', marginLeft: '4px' }}
                          >
                            Mappa <ExternalLink size={10} />
                          </a>
                        )}
                      </div>
                    )}

                    {primaryFile?.metadata_json && (() => {
                      try {
                        const meta = JSON.parse(primaryFile.metadata_json);
                        const make = meta.make || meta.Make;
                        const model = meta.model || meta.Model;
                        const lens = meta.lensModel || meta.LensModel || meta.lens || meta.Lens;
                        const fNumber = meta.fNumber || meta.FNumber;
                        const expTime = meta.exposureTime || meta.ExposureTime;
                        const iso = meta.iso || meta.ISO || meta.ISOSpeedRatings;

                        return (
                          <>
                            {(make || model) && (
                              <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                                <Camera size={15} color="#38bdf8" />
                                <span>Fotocamera: <strong>{[make, model].filter(Boolean).join(' ')}</strong></span>
                              </div>
                            )}
                            {lens && (
                              <div style={{ display: 'flex', alignItems: 'center', gap: '8px', fontSize: '12px', color: '#cbd5e1' }}>
                                <span style={{ color: '#64748b' }}>Obiettivo:</span>
                                <strong>{lens}</strong>
                              </div>
                            )}
                            {(fNumber || expTime || iso) && (
                              <div style={{ display: 'flex', gap: '6px', flexWrap: 'wrap', marginTop: '4px' }}>
                                {fNumber && (
                                  <span style={{ background: '#0f172a', border: '1px solid #334155', padding: '2px 8px', borderRadius: '4px', fontSize: '11px', fontWeight: 600, color: '#f8fafc' }}>
                                    ƒ/{fNumber}
                                  </span>
                                )}
                                {expTime && (
                                  <span style={{ background: '#0f172a', border: '1px solid #334155', padding: '2px 8px', borderRadius: '4px', fontSize: '11px', fontWeight: 600, color: '#f8fafc' }}>
                                    {expTime < 1 ? `1/${Math.round(1 / expTime)}s` : `${expTime}s`}
                                  </span>
                                )}
                                {iso && (
                                  <span style={{ background: '#0f172a', border: '1px solid #334155', padding: '2px 8px', borderRadius: '4px', fontSize: '11px', fontWeight: 600, color: '#f8fafc' }}>
                                    ISO {iso}
                                  </span>
                                )}
                              </div>
                            )}
                            {(meta.has_apple_edits || meta.has_xmp_sidecar) && (
                              <div style={{ display: 'flex', gap: '6px', marginTop: '4px' }}>
                                {meta.has_apple_edits && (
                                  <span style={{ background: 'rgba(236, 72, 153, 0.15)', color: '#ec4899', fontSize: '10px', padding: '2px 6px', borderRadius: '4px', fontWeight: 600 }}>
                                    Apple Edits (.AAE)
                                  </span>
                                )}
                                {meta.has_xmp_sidecar && (
                                  <span style={{ background: 'rgba(56, 189, 248, 0.15)', color: '#38bdf8', fontSize: '10px', padding: '2px 6px', borderRadius: '4px', fontWeight: 600 }}>
                                    Lightroom / XMP (.XMP)
                                  </span>
                                )}
                              </div>
                            )}
                          </>
                        );
                      } catch {
                        return null;
                      }
                    })()}
                  </div>
                </div>

                {/* Virtual Albums Section */}
                <div>
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '8px' }}>
                    <h4 style={{ fontSize: '13px', color: '#94a3b8', fontWeight: 600, textTransform: 'uppercase', display: 'flex', alignItems: 'center', gap: '6px' }}>
                      <Folder size={15} color="#38bdf8" />
                      Album Virtuali ({data.albums?.length || 0})
                    </h4>
                    <button
                      onClick={() => setShowNewAlbumInput(!showNewAlbumInput)}
                      style={{
                        background: 'transparent',
                        border: '1px solid #334155',
                        borderRadius: '4px',
                        color: '#38bdf8',
                        padding: '2px 8px',
                        fontSize: '11px',
                        cursor: 'pointer',
                        display: 'flex',
                        alignItems: 'center',
                        gap: '4px'
                      }}
                    >
                      <Plus size={12} /> Nuovo
                    </button>
                  </div>

                  {showNewAlbumInput && (
                    <div style={{ display: 'flex', gap: '6px', marginBottom: '10px' }}>
                      <input
                        type="text"
                        placeholder="Nome nuovo album..."
                        value={newAlbumName}
                        onChange={(e) => setNewAlbumName(e.target.value)}
                        style={{
                          flex: 1,
                          background: '#0f172a',
                          border: '1px solid #334155',
                          borderRadius: '6px',
                          color: '#f8fafc',
                          padding: '4px 8px',
                          fontSize: '12px'
                        }}
                      />
                      <button
                        onClick={handleCreateAndAddAlbum}
                        style={{
                          background: '#0284c7',
                          color: 'white',
                          border: 'none',
                          borderRadius: '6px',
                          padding: '4px 10px',
                          fontSize: '12px',
                          fontWeight: 600,
                          cursor: 'pointer'
                        }}
                      >
                        Crea & Aggiungi
                      </button>
                    </div>
                  )}

                  <div style={{ display: 'flex', flexWrap: 'wrap', gap: '6px', alignItems: 'center' }}>
                    {data.albums && data.albums.length > 0 ? (
                      data.albums.map((alb: any) => (
                        <span
                          key={alb.id}
                          style={{
                            background: '#0f172a',
                            border: '1px solid #38bdf8',
                            color: '#38bdf8',
                            borderRadius: '14px',
                            padding: '3px 10px',
                            fontSize: '12px',
                            display: 'flex',
                            alignItems: 'center',
                            gap: '6px'
                          }}
                        >
                          {alb.name}
                          <button
                            onClick={() => handleRemoveMediaFromAlbum(alb.id)}
                            style={{ background: 'transparent', border: 'none', color: '#94a3b8', cursor: 'pointer', padding: 0 }}
                          >
                            <X size={12} />
                          </button>
                        </span>
                      ))
                    ) : (
                      <span style={{ fontSize: '12px', color: '#64748b' }}>Nessun album assegnato</span>
                    )}

                    {/* Add to existing album dropdown */}
                    {availableAlbums.filter((a) => !data.albums?.some((da: any) => da.id === a.id)).length > 0 && (
                      <select
                        onChange={(e) => {
                          if (e.target.value) {
                            handleAddMediaToAlbum(e.target.value);
                            e.target.value = '';
                          }
                        }}
                        defaultValue=""
                        style={{
                          background: '#0f172a',
                          border: '1px dashed #475569',
                          borderRadius: '14px',
                          color: '#94a3b8',
                          padding: '3px 8px',
                          fontSize: '11px',
                          cursor: 'pointer'
                        }}
                      >
                        <option value="" disabled>+ Aggiungi ad album...</option>
                        {availableAlbums
                          .filter((a) => !data.albums?.some((da: any) => da.id === a.id))
                          .map((a) => (
                            <option key={a.id} value={a.id}>{a.name}</option>
                          ))}
                      </select>
                    )}
                  </div>
                </div>

                {/* Virtual Tags Section */}
                <div>
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '8px' }}>
                    <h4 style={{ fontSize: '13px', color: '#94a3b8', fontWeight: 600, textTransform: 'uppercase', display: 'flex', alignItems: 'center', gap: '6px' }}>
                      <TagIcon size={15} color="#ec4899" />
                      Tag ({data.tags?.length || 0})
                    </h4>
                    <button
                      onClick={() => setShowNewTagInput(!showNewTagInput)}
                      style={{
                        background: 'transparent',
                        border: '1px solid #334155',
                        borderRadius: '4px',
                        color: '#ec4899',
                        padding: '2px 8px',
                        fontSize: '11px',
                        cursor: 'pointer',
                        display: 'flex',
                        alignItems: 'center',
                        gap: '4px'
                      }}
                    >
                      <Plus size={12} /> Nuovo
                    </button>
                  </div>

                  {showNewTagInput && (
                    <div style={{ display: 'flex', gap: '6px', marginBottom: '10px', alignItems: 'center' }}>
                      <input
                        type="text"
                        placeholder="Nome nuovo tag..."
                        value={newTagName}
                        onChange={(e) => setNewTagName(e.target.value)}
                        style={{
                          flex: 1,
                          background: '#0f172a',
                          border: '1px solid #334155',
                          borderRadius: '6px',
                          color: '#f8fafc',
                          padding: '4px 8px',
                          fontSize: '12px'
                        }}
                      />
                      <input
                        type="color"
                        value={newTagColor}
                        onChange={(e) => setNewTagColor(e.target.value)}
                        style={{ width: '28px', height: '28px', border: 'none', background: 'transparent', cursor: 'pointer' }}
                      />
                      <button
                        onClick={handleCreateAndAddTag}
                        style={{
                          background: '#ec4899',
                          color: 'white',
                          border: 'none',
                          borderRadius: '6px',
                          padding: '4px 10px',
                          fontSize: '12px',
                          fontWeight: 600,
                          cursor: 'pointer'
                        }}
                      >
                        Aggiungi
                      </button>
                    </div>
                  )}

                  <div style={{ display: 'flex', flexWrap: 'wrap', gap: '6px', alignItems: 'center' }}>
                    {data.tags && data.tags.length > 0 ? (
                      data.tags.map((t: any) => (
                        <span
                          key={t.id}
                          style={{
                            background: `${t.color || '#38bdf8'}22`,
                            border: `1px solid ${t.color || '#38bdf8'}`,
                            color: t.color || '#38bdf8',
                            borderRadius: '14px',
                            padding: '3px 10px',
                            fontSize: '12px',
                            display: 'flex',
                            alignItems: 'center',
                            gap: '6px'
                          }}
                        >
                          #{t.name}
                          <button
                            onClick={() => handleRemoveMediaFromTag(t.id)}
                            style={{ background: 'transparent', border: 'none', color: '#94a3b8', cursor: 'pointer', padding: 0 }}
                          >
                            <X size={12} />
                          </button>
                        </span>
                      ))
                    ) : (
                      <span style={{ fontSize: '12px', color: '#64748b' }}>Nessun tag assegnato</span>
                    )}

                    {/* Add to existing tag dropdown */}
                    {availableTags.filter((t) => !data.tags?.some((dt: any) => dt.id === t.id)).length > 0 && (
                      <select
                        onChange={(e) => {
                          if (e.target.value) {
                            handleAddMediaToTag(e.target.value);
                            e.target.value = '';
                          }
                        }}
                        defaultValue=""
                        style={{
                          background: '#0f172a',
                          border: '1px dashed #475569',
                          borderRadius: '14px',
                          color: '#94a3b8',
                          padding: '3px 8px',
                          fontSize: '11px',
                          cursor: 'pointer'
                        }}
                      >
                        <option value="" disabled>+ Aggiungi tag...</option>
                        {availableTags
                          .filter((t) => !data.tags?.some((dt: any) => dt.id === t.id))
                          .map((t) => (
                            <option key={t.id} value={t.id}>#{t.name}</option>
                          ))}
                      </select>
                    )}
                  </div>
                </div>

                {/* Cryptographic Hash */}
                <div>
                  <h4 style={{ fontSize: '13px', color: '#94a3b8', fontWeight: 600, textTransform: 'uppercase', marginBottom: '6px' }}>
                    Impronta Digitale (SHA-256)
                  </h4>
                  <div style={{
                    background: '#0f172a',
                    border: '1px solid #334155',
                    borderRadius: '6px',
                    padding: '8px 10px',
                    fontFamily: 'monospace',
                    fontSize: '11px',
                    wordBreak: 'break-all',
                    color: '#38bdf8'
                  }}>
                    {data.canonical_sha256}
                  </div>
                </div>

                {/* Physical Copies Across Sources */}
                <div>
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '8px' }}>
                    <h4 style={{ fontSize: '13px', color: '#94a3b8', fontWeight: 600, textTransform: 'uppercase' }}>
                      Copie Fisiche Identificate ({data.files?.length || 0})
                    </h4>
                  </div>
                  <div style={{ display: 'flex', flexDirection: 'column', gap: '8px', maxHeight: '180px', overflowY: 'auto' }}>
                    {data.files?.map((f: any) => (
                      <div
                        key={f.id}
                        style={{
                          background: '#0f172a',
                          border: '1px solid #334155',
                          borderRadius: '8px',
                          padding: '10px 12px',
                          fontSize: '12px'
                        }}
                      >
                        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                          <span style={{ fontWeight: 600, display: 'flex', alignItems: 'center', gap: '6px' }}>
                            <HardDrive size={14} color={f.source_status === 'offline' ? '#94a3b8' : '#38bdf8'} />
                            {f.source_name || 'Fonte'}
                          </span>
                          <div style={{ display: 'flex', gap: '6px' }}>
                            {f.source_status === 'offline' ? (
                              <span style={{
                                fontSize: '10px',
                                padding: '2px 6px',
                                borderRadius: '4px',
                                background: 'rgba(148, 163, 184, 0.2)',
                                color: '#94a3b8',
                                fontWeight: 600
                              }}>
                                DISCO OFFLINE
                              </span>
                            ) : (
                              <span style={{
                                fontSize: '10px',
                                padding: '2px 6px',
                                borderRadius: '4px',
                                background: 'rgba(34, 197, 94, 0.2)',
                                color: '#22c55e',
                                fontWeight: 600
                              }}>
                                DISCO ONLINE
                              </span>
                            )}
                            {f.availability_status === 'missing' && (
                              <span style={{
                                fontSize: '10px',
                                padding: '2px 6px',
                                borderRadius: '4px',
                                background: 'rgba(244, 63, 94, 0.2)',
                                color: '#f43f5e',
                                fontWeight: 600
                              }}>
                                SPOSTATO / RIMOSSO
                              </span>
                            )}
                          </div>
                        </div>
                        <div style={{ color: '#94a3b8', fontSize: '11px', marginTop: '4px', wordBreak: 'break-all' }}>
                          <code>{f.relative_path}</code>
                        </div>
                        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginTop: '6px' }}>
                          <div style={{ color: '#64748b', fontSize: '10px' }}>
                            {formatBytes(f.size_bytes)} · Ultima verifica: {new Date(f.last_seen_at).toLocaleDateString()}
                          </div>
                          <button
                            type="button"
                            disabled={f.source_status === 'offline' || f.availability_status === 'missing' || revealingFileId === f.id}
                            onClick={(e) => {
                              e.stopPropagation();
                              handleRevealFile(f.id, f.filename);
                            }}
                            style={{
                              display: 'inline-flex',
                              alignItems: 'center',
                              gap: '4px',
                              padding: '3px 8px',
                              borderRadius: '4px',
                              background: f.source_status === 'offline' ? '#1e293b' : 'rgba(2, 132, 199, 0.15)',
                              border: '1px solid ' + (f.source_status === 'offline' ? '#334155' : 'rgba(56, 189, 248, 0.4)'),
                              color: f.source_status === 'offline' ? '#64748b' : '#38bdf8',
                              fontSize: '11px',
                              fontWeight: 500,
                              cursor: f.source_status === 'offline' ? 'not-allowed' : 'pointer',
                              opacity: f.source_status === 'offline' ? 0.6 : 1
                            }}
                            title={f.source_status === 'offline' ? 'Disco non collegato al computer' : 'Evidenzia questo file nel Finder'}
                          >
                            <FolderOpen size={12} />
                            {revealingFileId === f.id ? 'Apertura...' : 'Mostra nel Finder'}
                          </button>
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              </>
            )}
          </div>
        </div>
      </div>
    </div>
  );
};
