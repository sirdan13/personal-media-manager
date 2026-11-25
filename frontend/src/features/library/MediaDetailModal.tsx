import React, { useEffect, useState } from 'react';
import { ApiClient } from '../../services/api';
import { useToast } from '../../context/ToastContext';
import {
  X,
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
  ShieldAlert,
  Copy,
  Check
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
  const [copiedSha, setCopiedSha] = useState<boolean>(false);
  const [copiedPathId, setCopiedPathId] = useState<string | null>(null);

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
        if (detail?.files?.some((f: any) => f.source_status === 'online') && detail.media_type === 'image') {
          setLoadHd(true);
        }
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
      if (e.key === 'Escape' || e.key === ' ') {
        e.preventDefault();
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
        width: '92vw',
        maxWidth: '1060px',
        height: '84vh',
        maxHeight: '820px',
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
          padding: '14px 20px',
          borderBottom: '1px solid #334155'
        }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '10px', minWidth: 0 }}>
            <h3 style={{ fontSize: '16px', fontWeight: 'bold', color: '#f8fafc', margin: 0, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
              {primaryFile?.filename || 'Dettaglio Media'}
            </h3>
            {data?.protection_status === 'protected' && (
              <span style={{
                fontSize: '11px',
                fontWeight: 600,
                padding: '2px 8px',
                borderRadius: '6px',
                background: 'rgba(34, 197, 94, 0.15)',
                color: '#22c55e',
                border: '1px solid rgba(34, 197, 94, 0.3)',
                display: 'inline-flex',
                alignItems: 'center',
                gap: '4px',
                flexShrink: 0
              }}>
                <ShieldCheck size={12} />
                Protetto ({data.distinct_sources_count} dischi)
              </span>
            )}
            {data?.protection_status === 'intra_source_duplicate' && (
              <span style={{
                fontSize: '11px',
                fontWeight: 600,
                padding: '2px 8px',
                borderRadius: '6px',
                background: 'rgba(245, 158, 11, 0.15)',
                color: '#f59e0b',
                border: '1px solid rgba(245, 158, 11, 0.3)',
                display: 'inline-flex',
                alignItems: 'center',
                gap: '4px',
                flexShrink: 0
              }}>
                <AlertTriangle size={12} />
                Doppione stesso disco
              </span>
            )}
            {data?.protection_status === 'unprotected' && (
              <span style={{
                fontSize: '11px',
                fontWeight: 600,
                padding: '2px 8px',
                borderRadius: '6px',
                background: 'rgba(244, 63, 94, 0.15)',
                color: '#f43f5e',
                border: '1px solid rgba(244, 63, 94, 0.3)',
                display: 'inline-flex',
                alignItems: 'center',
                gap: '4px',
                flexShrink: 0
              }}>
                <ShieldAlert size={12} />
                1 solo disco
              </span>
            )}
          </div>
          <div style={{ display: 'flex', alignItems: 'center', gap: '8px', flexShrink: 0 }}>
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
        <div className="modal-body-container" style={{
          display: 'flex',
          flex: 1,
          minHeight: 0,
          overflow: 'hidden',
          flexDirection: 'row'
        }}>
          {/* Left Preview Pane */}
          <div className="modal-pane-left" style={{
            flex: '1 1 0',
            minWidth: 0,
            height: '100%',
            background: '#090d16',
            display: 'flex',
            flexDirection: 'column',
            alignItems: 'center',
            justifyContent: 'center',
            padding: '16px 20px 56px',
            position: 'relative',
            overflow: 'hidden'
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
                    maxHeight: '100%',
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
                <div style={{
                  flex: 1,
                  width: '100%',
                  height: '100%',
                  minHeight: 0,
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  padding: '12px'
                }}>
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
                      width: '100%',
                      height: '100%',
                      maxWidth: '100%',
                      maxHeight: '100%',
                      objectFit: 'contain',
                      borderRadius: '8px',
                      boxShadow: '0 8px 24px rgba(0,0,0,0.5)'
                    }}
                  />
                </div>

                {hdError && (
                  <div style={{
                    position: 'absolute',
                    top: '16px',
                    background: 'rgba(244, 63, 94, 0.85)',
                    color: 'white',
                    padding: '4px 10px',
                    borderRadius: '4px',
                    fontSize: '11px',
                    fontWeight: 600,
                    zIndex: 10
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
          <div className="modal-pane-right" style={{
            width: '360px',
            minWidth: '320px',
            flexShrink: 0,
            height: '100%',
            overflowY: 'auto',
            padding: '18px 20px',
            display: 'flex',
            flexDirection: 'column',
            gap: '14px',
            borderLeft: '1px solid #334155',
            background: '#1e293b'
          }}>
            {loading && <div style={{ color: '#94a3b8' }}>Caricamento metadati...</div>}
            {error && <div style={{ color: '#f43f5e' }}>{error}</div>}

            {data && (
              <div style={{ display: 'flex', flexDirection: 'column', gap: '14px' }}>
                {/* 1. SEZIONE PRIORITARIA: COPIE FISICHE & DISCHI */}
                <div style={{
                  background: '#0f172a',
                  border: '1px solid #334155',
                  borderRadius: '10px',
                  padding: '14px',
                  display: 'flex',
                  flexDirection: 'column',
                  gap: '10px'
                }}>
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                    <h4 style={{
                      fontSize: '12px',
                      fontWeight: 700,
                      color: '#cbd5e1',
                      textTransform: 'uppercase',
                      letterSpacing: '0.5px',
                      display: 'flex',
                      alignItems: 'center',
                      gap: '6px',
                      margin: 0
                    }}>
                      <HardDrive size={14} color="#38bdf8" />
                      Copie Fisiche su Disco ({data.files?.length || 0})
                    </h4>
                    {data.distinct_sources_count > 1 ? (
                      <span style={{
                        fontSize: '11px',
                        fontWeight: 600,
                        color: '#4ade80',
                        background: 'rgba(34, 197, 94, 0.1)',
                        padding: '2px 8px',
                        borderRadius: '4px',
                        border: '1px solid rgba(34, 197, 94, 0.25)',
                        display: 'inline-flex',
                        alignItems: 'center',
                        gap: '4px'
                      }}>
                        <ShieldCheck size={12} />
                        {data.distinct_sources_count} Dischi
                      </span>
                    ) : (
                      <span style={{
                        fontSize: '11px',
                        fontWeight: 600,
                        color: '#f87171',
                        background: 'rgba(239, 68, 68, 0.1)',
                        padding: '2px 8px',
                        borderRadius: '4px',
                        border: '1px solid rgba(239, 68, 68, 0.25)',
                        display: 'inline-flex',
                        alignItems: 'center',
                        gap: '4px'
                      }}>
                        <ShieldAlert size={12} />
                        1 Solo Disco
                      </span>
                    )}
                  </div>

                  <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
                    {data.files?.map((f: any) => {
                      const isOffline = f.source_status === 'offline';
                      const isMissing = f.availability_status === 'missing';
                      return (
                        <div
                          key={f.id}
                          style={{
                            background: '#090d16',
                            border: '1px solid #1e293b',
                            borderRadius: '8px',
                            padding: '10px 12px',
                            display: 'flex',
                            flexDirection: 'column',
                            gap: '6px'
                          }}
                        >
                          {/* Header riga copia: Disco + Status Dot */}
                          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                            <span style={{ fontWeight: 600, fontSize: '13px', color: '#f8fafc', display: 'flex', alignItems: 'center', gap: '6px' }}>
                              <HardDrive size={13} color={isOffline ? '#64748b' : '#38bdf8'} />
                              {f.source_name || 'Disco'}
                            </span>
                            <div style={{ display: 'flex', alignItems: 'center', gap: '6px', fontSize: '11px' }}>
                              {isMissing ? (
                                <span style={{ color: '#fda4af', fontSize: '10px', fontWeight: 700, background: 'rgba(244, 63, 94, 0.2)', border: '1px solid rgba(244, 63, 94, 0.4)', padding: '2px 6px', borderRadius: '4px' }}>
                                  ELIMINATO DAL DISCO
                                </span>
                              ) : (
                                <>
                                  <span style={{
                                    width: '6px',
                                    height: '6px',
                                    borderRadius: '50%',
                                    background: isOffline ? '#64748b' : '#22c55e',
                                    flexShrink: 0
                                  }} />
                                  <span style={{ color: isOffline ? '#94a3b8' : '#22c55e', fontWeight: 500 }}>
                                    {isOffline ? 'Offline' : 'Online'}
                                  </span>
                                </>
                              )}
                            </div>
                          </div>

                          {/* Percorso relativo */}
                          <div style={{
                            color: isMissing ? '#f87171' : '#94a3b8',
                            fontSize: '11px',
                            fontFamily: 'monospace',
                            wordBreak: 'break-all',
                            background: '#020617',
                            padding: '4px 8px',
                            borderRadius: '4px',
                            border: isMissing ? '1px solid rgba(244, 63, 94, 0.35)' : '1px solid #1e293b',
                            display: 'flex',
                            alignItems: 'center',
                            gap: '6px'
                          }}>
                            <Folder size={11} color="#64748b" style={{ flexShrink: 0 }} />
                            <span style={{ flex: 1, minWidth: 0, textDecoration: isMissing ? 'line-through' : 'none' }}>{f.relative_path}</span>
                          </div>

                          {/* Footer riga copia: Dimensione, Data e Azione Finder */}
                          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginTop: '2px' }}>
                            <span style={{ fontSize: '11px', color: '#64748b' }}>
                              {formatBytes(f.size_bytes)}
                            </span>
                            <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
                              {isMissing && (
                                <button
                                  type="button"
                                  onClick={async () => {
                                    try {
                                      await ApiClient.purgeMissingRecords({ source_id: f.source_id, media_ids: [data.id] });
                                      toast.success('Riferimento morto rimosso dal catalogo');
                                      const refreshed = await ApiClient.getMediaDetail(data.id).catch(() => null);
                                      if (refreshed) {
                                        setData(refreshed);
                                      } else {
                                        onClose();
                                      }
                                    } catch (err) {
                                      toast.error((err as Error).message);
                                    }
                                  }}
                                  style={{
                                    background: 'rgba(244, 63, 94, 0.15)',
                                    border: '1px solid rgba(244, 63, 94, 0.45)',
                                    color: '#fda4af',
                                    borderRadius: '4px',
                                    padding: '3px 8px',
                                    fontSize: '10px',
                                    fontWeight: 600,
                                    cursor: 'pointer'
                                  }}
                                >
                                  Rimuovi riferimento
                                </button>
                              )}
                              <button
                                type="button"
                                onClick={() => {
                                  navigator.clipboard.writeText(f.relative_path);
                                  setCopiedPathId(f.id);
                                  setTimeout(() => setCopiedPathId(null), 1500);
                                  toast.success('Percorso copiato');
                                }}
                                title="Copia percorso relativo"
                                style={{
                                  background: 'transparent',
                                  border: '1px solid #334155',
                                  color: copiedPathId === f.id ? '#22c55e' : '#94a3b8',
                                  borderRadius: '4px',
                                  padding: '3px 7px',
                                  fontSize: '10px',
                                  cursor: 'pointer',
                                  display: 'inline-flex',
                                  alignItems: 'center',
                                  gap: '3px'
                                }}
                              >
                                {copiedPathId === f.id ? <Check size={11} /> : <Copy size={11} />}
                                <span>{copiedPathId === f.id ? 'Copiato' : 'Copia'}</span>
                              </button>
                              <button
                                type="button"
                                disabled={isOffline || isMissing || revealingFileId === f.id}
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
                                  background: isOffline ? '#1e293b' : 'rgba(2, 132, 199, 0.15)',
                                  border: '1px solid ' + (isOffline ? '#334155' : 'rgba(56, 189, 248, 0.4)'),
                                  color: isOffline ? '#64748b' : '#38bdf8',
                                  fontSize: '11px',
                                  fontWeight: 600,
                                  cursor: isOffline ? 'not-allowed' : 'pointer',
                                  opacity: isOffline ? 0.6 : 1
                                }}
                                title={isOffline ? 'Disco non collegato al computer' : 'Mostra nel Finder'}
                              >
                                <FolderOpen size={12} />
                                {revealingFileId === f.id ? 'Apertura...' : 'Mostra nel Finder'}
                              </button>
                            </div>
                          </div>
                        </div>
                      );
                    })}
                  </div>
                </div>

                {/* 2. SEZIONE DETTAGLI TECNICI & SCATTO EXIF */}
                <div style={{
                  background: '#0f172a',
                  border: '1px solid #334155',
                  borderRadius: '10px',
                  padding: '14px',
                  display: 'flex',
                  flexDirection: 'column',
                  gap: '10px'
                }}>
                  <h4 style={{
                    fontSize: '12px',
                    fontWeight: 700,
                    color: '#cbd5e1',
                    textTransform: 'uppercase',
                    letterSpacing: '0.5px',
                    display: 'flex',
                    alignItems: 'center',
                    gap: '6px',
                    margin: 0
                  }}>
                    <Camera size={14} color="#38bdf8" />
                    Scatto & Fotocamera
                  </h4>

                  {(() => {
                    try {
                      const meta = primaryFile?.metadata_json ? JSON.parse(primaryFile.metadata_json) : {};
                      const make = meta.make || meta.Make;
                      const model = meta.model || meta.Model;
                      const lens = meta.lensModel || meta.LensModel || meta.lens || meta.Lens;
                      const fNumber = meta.fNumber || meta.FNumber;
                      const expTime = meta.exposureTime || meta.ExposureTime;
                      const iso = meta.iso || meta.ISO || meta.ISOSpeedRatings;

                      return (
                        <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
                          {(make || model || lens) && (
                            <div style={{ fontSize: '13px', color: '#f8fafc' }}>
                              <strong>{[make, model].filter(Boolean).join(' ') || 'Fotocamera'}</strong>
                              {lens && <span style={{ color: '#94a3b8', marginLeft: '6px' }}>· {lens}</span>}
                            </div>
                          )}

                          {(fNumber || expTime || iso) && (
                            <div style={{ display: 'flex', gap: '6px', flexWrap: 'wrap' }}>
                              {fNumber && (
                                <span style={{ background: '#090d16', border: '1px solid #334155', padding: '2px 7px', borderRadius: '4px', fontSize: '11px', fontWeight: 600, color: '#f8fafc' }}>
                                  ƒ/{fNumber}
                                </span>
                              )}
                              {expTime && (
                                <span style={{ background: '#090d16', border: '1px solid #334155', padding: '2px 7px', borderRadius: '4px', fontSize: '11px', fontWeight: 600, color: '#f8fafc' }}>
                                  {expTime < 1 ? `1/${Math.round(1 / expTime)}s` : `${expTime}s`}
                                </span>
                              )}
                              {iso && (
                                <span style={{ background: '#090d16', border: '1px solid #334155', padding: '2px 7px', borderRadius: '4px', fontSize: '11px', fontWeight: 600, color: '#f8fafc' }}>
                                  ISO {iso}
                                </span>
                              )}
                            </div>
                          )}
                        </div>
                      );
                    } catch {
                      return null;
                    }
                  })()}

                  <div style={{
                    display: 'grid',
                    gridTemplateColumns: 'repeat(2, 1fr)',
                    gap: '8px',
                    paddingTop: '6px',
                    borderTop: '1px solid #1e293b',
                    fontSize: '12px'
                  }}>
                    <div>
                      <span style={{ color: '#64748b' }}>Data:</span>{' '}
                      <strong style={{ color: '#f1f5f9' }}>{data.captured_at ? new Date(data.captured_at).toLocaleDateString() : 'N/D'}</strong>
                    </div>
                    <div>
                      <span style={{ color: '#64748b' }}>Peso:</span>{' '}
                      <strong style={{ color: '#f1f5f9' }}>{formatBytes(primaryFile?.size_bytes)}</strong>
                    </div>
                    <div>
                      <span style={{ color: '#64748b' }}>Risoluzione:</span>{' '}
                      <strong style={{ color: '#f1f5f9' }}>{data.width && data.height ? `${data.width} × ${data.height}` : 'N/D'}</strong>
                    </div>
                    <div>
                      <span style={{ color: '#64748b' }}>Formato:</span>{' '}
                      <strong style={{ color: '#f1f5f9' }}>{primaryFile?.extension?.toUpperCase() || data.media_type?.toUpperCase()}</strong>
                    </div>
                  </div>

                  {(data.place_name || (data.latitude && data.longitude)) && (
                    <div style={{ display: 'flex', alignItems: 'center', gap: '6px', fontSize: '12px', color: '#38bdf8', paddingTop: '4px' }}>
                      <MapPin size={13} color="#22c55e" style={{ flexShrink: 0 }} />
                      <span>{data.place_name || `${data.latitude?.toFixed(4)}, ${data.longitude?.toFixed(4)}`}</span>
                      {data.latitude && data.longitude && (
                        <a
                          href={`https://www.openstreetmap.org/?mlat=${data.latitude}&mlon=${data.longitude}#map=16/${data.latitude}/${data.longitude}`}
                          target="_blank"
                          rel="noopener noreferrer"
                          style={{ color: '#38bdf8', display: 'inline-flex', alignItems: 'center', gap: '2px', fontSize: '11px', marginLeft: 'auto' }}
                        >
                          Mappa <ExternalLink size={10} />
                        </a>
                      )}
                    </div>
                  )}

                  {data.is_live_photo && (
                    <div style={{ fontSize: '11px', color: '#ec4899', background: 'rgba(236, 72, 153, 0.1)', padding: '4px 8px', borderRadius: '4px', border: '1px solid rgba(236, 72, 153, 0.25)' }}>
                      Apple Live Photo (clip video abbinata)
                    </div>
                  )}
                </div>

                {/* 3. SEZIONE ORGANIZZAZIONE (Album & Tag) */}
                <div style={{
                  background: '#0f172a',
                  border: '1px solid #334155',
                  borderRadius: '10px',
                  padding: '14px',
                  display: 'flex',
                  flexDirection: 'column',
                  gap: '12px'
                }}>
                  {/* Riga Album */}
                  <div style={{ display: 'flex', flexDirection: 'column', gap: '6px' }}>
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                      <span style={{ fontSize: '12px', fontWeight: 600, color: '#94a3b8', display: 'flex', alignItems: 'center', gap: '6px' }}>
                        <Folder size={13} color="#38bdf8" />
                        Album ({data.albums?.length || 0})
                      </span>
                      <button
                        onClick={() => setShowNewAlbumInput(!showNewAlbumInput)}
                        style={{
                          background: 'transparent',
                          border: 'none',
                          color: '#38bdf8',
                          fontSize: '11px',
                          fontWeight: 600,
                          cursor: 'pointer',
                          display: 'inline-flex',
                          alignItems: 'center',
                          gap: '3px'
                        }}
                      >
                        <Plus size={11} /> Nuovo
                      </button>
                    </div>

                    {showNewAlbumInput && (
                      <div style={{ display: 'flex', gap: '6px' }}>
                        <input
                          type="text"
                          placeholder="Nome album..."
                          value={newAlbumName}
                          onChange={(e) => setNewAlbumName(e.target.value)}
                          style={{
                            flex: 1,
                            background: '#090d16',
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
                          Crea
                        </button>
                      </div>
                    )}

                    <div style={{ display: 'flex', flexWrap: 'wrap', gap: '6px', alignItems: 'center' }}>
                      {data.albums && data.albums.length > 0 ? (
                        data.albums.map((alb: any) => (
                          <span
                            key={alb.id}
                            style={{
                              background: 'rgba(56, 189, 248, 0.1)',
                              border: '1px solid rgba(56, 189, 248, 0.3)',
                              color: '#38bdf8',
                              borderRadius: '12px',
                              padding: '2px 8px',
                              fontSize: '11px',
                              fontWeight: 500,
                              display: 'inline-flex',
                              alignItems: 'center',
                              gap: '5px'
                            }}
                          >
                            {alb.name}
                            <button
                              onClick={() => handleRemoveMediaFromAlbum(alb.id)}
                              style={{ background: 'transparent', border: 'none', color: '#94a3b8', cursor: 'pointer', padding: 0, display: 'flex' }}
                            >
                              <X size={10} />
                            </button>
                          </span>
                        ))
                      ) : (
                        <span style={{ fontSize: '11px', color: '#64748b', fontStyle: 'italic' }}>Nessun album assegnato</span>
                      )}

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
                            background: '#090d16',
                            border: '1px dashed #334155',
                            borderRadius: '12px',
                            color: '#94a3b8',
                            padding: '2px 8px',
                            fontSize: '11px',
                            cursor: 'pointer'
                          }}
                        >
                          <option value="" disabled>+ Aggiungi...</option>
                          {availableAlbums
                            .filter((a) => !data.albums?.some((da: any) => da.id === a.id))
                            .map((a) => (
                              <option key={a.id} value={a.id}>{a.name}</option>
                            ))}
                        </select>
                      )}
                    </div>
                  </div>

                  {/* Riga Tag */}
                  <div style={{ display: 'flex', flexDirection: 'column', gap: '6px', paddingTop: '8px', borderTop: '1px solid #1e293b' }}>
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                      <span style={{ fontSize: '12px', fontWeight: 600, color: '#94a3b8', display: 'flex', alignItems: 'center', gap: '6px' }}>
                        <TagIcon size={13} color="#ec4899" />
                        Tag ({data.tags?.length || 0})
                      </span>
                      <button
                        onClick={() => setShowNewTagInput(!showNewTagInput)}
                        style={{
                          background: 'transparent',
                          border: 'none',
                          color: '#ec4899',
                          fontSize: '11px',
                          fontWeight: 600,
                          cursor: 'pointer',
                          display: 'inline-flex',
                          alignItems: 'center',
                          gap: '3px'
                        }}
                      >
                        <Plus size={11} /> Nuovo
                      </button>
                    </div>

                    {showNewTagInput && (
                      <div style={{ display: 'flex', gap: '6px', alignItems: 'center' }}>
                        <input
                          type="text"
                          placeholder="Nome tag..."
                          value={newTagName}
                          onChange={(e) => setNewTagName(e.target.value)}
                          style={{
                            flex: 1,
                            background: '#090d16',
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
                          style={{ width: '26px', height: '26px', border: 'none', background: 'transparent', cursor: 'pointer' }}
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
                              background: `${t.color || '#38bdf8'}18`,
                              border: `1px solid ${t.color || '#38bdf8'}50`,
                              color: t.color || '#38bdf8',
                              borderRadius: '12px',
                              padding: '2px 8px',
                              fontSize: '11px',
                              fontWeight: 500,
                              display: 'inline-flex',
                              alignItems: 'center',
                              gap: '5px'
                            }}
                          >
                            #{t.name}
                            <button
                              onClick={() => handleRemoveMediaFromTag(t.id)}
                              style={{ background: 'transparent', border: 'none', color: '#94a3b8', cursor: 'pointer', padding: 0, display: 'flex' }}
                            >
                              <X size={10} />
                            </button>
                          </span>
                        ))
                      ) : (
                        <span style={{ fontSize: '11px', color: '#64748b', fontStyle: 'italic' }}>Nessun tag assegnato</span>
                      )}

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
                            background: '#090d16',
                            border: '1px dashed #334155',
                            borderRadius: '12px',
                            color: '#94a3b8',
                            padding: '2px 8px',
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
                </div>

                {/* 4. FOOTER TECNICO: IMPRONTA SHA-256 (DISCRETA E COMPATTA) */}
                <div style={{
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'space-between',
                  padding: '8px 12px',
                  background: '#090d16',
                  border: '1px solid #1e293b',
                  borderRadius: '8px',
                  fontSize: '11px',
                  color: '#64748b'
                }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: '6px', minWidth: 0, overflow: 'hidden' }}>
                    <span style={{ fontWeight: 600, color: '#94a3b8', flexShrink: 0 }}>SHA-256:</span>
                    <code style={{ color: '#475569', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                      {data.canonical_sha256}
                    </code>
                  </div>
                  <button
                    type="button"
                    onClick={() => {
                      navigator.clipboard.writeText(data.canonical_sha256);
                      setCopiedSha(true);
                      setTimeout(() => setCopiedSha(false), 1500);
                      toast.success('SHA-256 copiato');
                    }}
                    title="Copia hash SHA-256"
                    style={{
                      background: 'transparent',
                      border: 'none',
                      color: copiedSha ? '#22c55e' : '#94a3b8',
                      cursor: 'pointer',
                      padding: '2px 6px',
                      display: 'inline-flex',
                      alignItems: 'center',
                      gap: '4px',
                      fontSize: '11px',
                      flexShrink: 0
                    }}
                  >
                    {copiedSha ? <Check size={12} /> : <Copy size={12} />}
                    <span>{copiedSha ? 'Copiato' : 'Copia'}</span>
                  </button>
                </div>
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
};
