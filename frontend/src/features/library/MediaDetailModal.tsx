import React, { useEffect, useState } from 'react';
import { ApiClient } from '../../services/api';
import {
  X,
  Calendar,
  Camera,
  MapPin,
  HardDrive,
  ExternalLink,
  FileText,
  Folder,
  Tag as TagIcon,
  Plus,
  Play
} from 'lucide-react';

interface MediaDetailModalProps {
  mediaId: string | null;
  onClose: () => void;
}

export const MediaDetailModal: React.FC<MediaDetailModalProps> = ({ mediaId, onClose }) => {
  const [data, setData] = useState<any | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Albums & Tags state
  const [availableAlbums, setAvailableAlbums] = useState<any[]>([]);
  const [availableTags, setAvailableTags] = useState<any[]>([]);
  const [showNewAlbumInput, setShowNewAlbumInput] = useState(false);
  const [newAlbumName, setNewAlbumName] = useState('');
  const [showNewTagInput, setShowNewTagInput] = useState(false);
  const [newTagName, setNewTagName] = useState('');
  const [newTagColor, setNewTagColor] = useState('#38bdf8');
  const [isPlayingVideo, setIsPlayingVideo] = useState(false);
  const [streamError, setStreamError] = useState<string | null>(null);

  useEffect(() => {
    setIsPlayingVideo(false);
    setStreamError(null);
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

  if (!mediaId) return null;

  const handleAddMediaToAlbum = async (albumId: string) => {
    if (!mediaId) return;
    try {
      await ApiClient.addMediaToAlbum(albumId, [mediaId]);
      const updated = await ApiClient.getMediaDetail(mediaId);
      setData(updated);
    } catch (err) {
      alert((err as Error).message);
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
    } catch (err) {
      alert((err as Error).message);
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
    } catch (err) {
      alert((err as Error).message);
    }
  };

  const handleAddMediaToTag = async (tagId: string) => {
    if (!mediaId) return;
    try {
      await ApiClient.addMediaToTag(tagId, [mediaId]);
      const updated = await ApiClient.getMediaDetail(mediaId);
      setData(updated);
    } catch (err) {
      alert((err as Error).message);
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
    } catch (err) {
      alert((err as Error).message);
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
    } catch (err) {
      alert((err as Error).message);
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
      zIndex: 1050,
      padding: '24px'
    }}>
      <div style={{
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
            <span style={{ fontSize: '12px', color: '#94a3b8' }}>
              Contenuto logico • {data?.copies_count || 1} copie fisiche collegate
            </span>
          </div>
          <button
            onClick={onClose}
            style={{ background: 'transparent', border: 'none', color: '#94a3b8', padding: '6px' }}
          >
            <X size={20} />
          </button>
        </div>

        {/* Modal Body */}
        <div style={{ display: 'flex', flex: 1, overflowY: 'auto', flexWrap: 'wrap' }}>
          {/* Left Preview Pane */}
          <div style={{
            flex: '1 1 450px',
            background: '#090d16',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            minHeight: '360px',
            padding: '20px',
            position: 'relative'
          }}>
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
                  src={ApiClient.getThumbnailUrl(data.id)}
                  alt={primaryFile?.filename || 'Media'}
                  style={{
                    maxHeight: '440px',
                    maxWidth: '100%',
                    objectFit: 'contain',
                    borderRadius: '8px',
                    boxShadow: '0 10px 25px rgba(0,0,0,0.5)'
                  }}
                />
                {targetVideoMediaId && (
                  <button
                    onClick={() => { setStreamError(null); setIsPlayingVideo(true); }}
                    style={{
                      position: 'absolute',
                      bottom: '20px',
                      background: 'rgba(2, 132, 199, 0.95)',
                      color: 'white',
                      border: 'none',
                      borderRadius: '20px',
                      padding: '8px 16px',
                      fontSize: '12px',
                      fontWeight: 600,
                      cursor: 'pointer',
                      display: 'flex',
                      alignItems: 'center',
                      gap: '6px',
                      boxShadow: '0 4px 12px rgba(0,0,0,0.4)',
                      backdropFilter: 'blur(4px)'
                    }}
                  >
                    <Play size={14} fill="white" />
                    {data.is_live_photo ? 'Riproduci Live Photo (se disco online)' : 'Riproduci Video (se disco online)'}
                  </button>
                )}
              </>
            ) : (
              <div style={{ textAlign: 'center', color: '#64748b' }}>
                <FileText size={56} style={{ margin: '0 auto 12px' }} />
                <div>Miniatura non generata sul server</div>
                {targetVideoMediaId && (
                  <button
                    onClick={() => { setStreamError(null); setIsPlayingVideo(true); }}
                    style={{
                      marginTop: '16px',
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
                      gap: '6px'
                    }}
                  >
                    <Play size={14} fill="white" />
                    Riproduci Video (se disco online)
                  </button>
                )}
              </div>
            )}
          </div>

          {/* Right Information Pane */}
          <div style={{ flex: '1 1 380px', padding: '24px', display: 'flex', flexDirection: 'column', gap: '20px' }}>
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
                  <div style={{ display: 'flex', flexDirection: 'column', gap: '6px', fontSize: '13px' }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                      <Calendar size={15} color="#38bdf8" />
                      <span>Data Scatto:{' '}
                        <strong>
                          {data.captured_at ? new Date(data.captured_at).toLocaleString() : 'Non specificata'}
                        </strong>
                      </span>
                    </div>

                    {primaryFile?.metadata_json && (() => {
                      try {
                        const meta = JSON.parse(primaryFile.metadata_json);
                        return (
                          <>
                            {(meta.make || meta.model) && (
                              <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                                <Camera size={15} color="#38bdf8" />
                                <span>Fotocamera: <strong>{[meta.make, meta.model].filter(Boolean).join(' ')}</strong></span>
                              </div>
                            )}
                            {meta.latitude && meta.longitude && (
                              <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                                <MapPin size={15} color="#22c55e" />
                                <span>GPS: <strong>{meta.latitude.toFixed(5)}, {meta.longitude.toFixed(5)}</strong></span>
                                <a
                                  href={`https://www.openstreetmap.org/?mlat=${meta.latitude}&mlon=${meta.longitude}#map=16/${meta.latitude}/${meta.longitude}`}
                                  target="_blank"
                                  rel="noopener noreferrer"
                                  style={{ color: '#38bdf8', display: 'flex', alignItems: 'center', gap: '2px', fontSize: '11px' }}
                                >
                                  Mappa <ExternalLink size={10} />
                                </a>
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
                        <div style={{ color: '#64748b', fontSize: '10px', marginTop: '4px' }}>
                          Ultima verifica: {new Date(f.last_seen_at).toLocaleDateString()}
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
