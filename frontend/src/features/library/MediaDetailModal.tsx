import React, { useEffect, useState } from 'react';
import { ApiClient } from '../../services/api';
import {
  X,
  Calendar,
  Camera,
  MapPin,
  HardDrive,
  ExternalLink,
  FileText
} from 'lucide-react';

interface MediaDetailModalProps {
  mediaId: string | null;
  onClose: () => void;
}

export const MediaDetailModal: React.FC<MediaDetailModalProps> = ({ mediaId, onClose }) => {
  const [data, setData] = useState<any | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!mediaId) {
      setData(null);
      return;
    }

    const loadDetail = async () => {
      try {
        setLoading(true);
        setError(null);
        const detail = await ApiClient.getMediaDetail(mediaId);
        setData(detail);
      } catch (err) {
        setError((err as Error).message || 'Impossibile caricare il dettaglio media');
      } finally {
        setLoading(false);
      }
    };

    loadDetail();
  }, [mediaId]);

  if (!mediaId) return null;

  const formatBytes = (bytes?: number) => {
    if (!bytes) return '0 B';
    const k = 1024;
    const sizes = ['B', 'KB', 'MB', 'GB'];
    const i = Math.floor(Math.log(bytes) / Math.log(k));
    return parseFloat((bytes / Math.pow(k, i)).toFixed(2)) + ' ' + sizes[i];
  };

  const primaryFile = data?.files && data.files.length > 0 ? data.files[0] : null;

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
            {data?.has_thumbnail ? (
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
            ) : (
              <div style={{ textAlign: 'center', color: '#64748b' }}>
                <FileText size={56} style={{ margin: '0 auto 12px' }} />
                <div>Miniatura non generata sul server</div>
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
