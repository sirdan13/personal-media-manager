import React, { useEffect, useState } from 'react';
import { ApiClient } from '../../services/api';
import {
  Copy,
  CheckCircle2,
  HardDrive,
  FileText,
  Info
} from 'lucide-react';
import { MediaDetailModal } from '../library/MediaDetailModal';

export const DuplicatesView: React.FC = () => {
  const [duplicateGroups, setDuplicateGroups] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [selectedMediaId, setSelectedMediaId] = useState<string | null>(null);

  useEffect(() => {
    loadDuplicates();
  }, []);

  const loadDuplicates = async () => {
    if (!ApiClient.getToken()) {
      setLoading(false);
      return;
    }
    try {
      setLoading(true);
      const groups = await ApiClient.getDuplicates();
      setDuplicateGroups(groups);
    } catch (err) {
      console.error('Error loading duplicates:', err);
    } finally {
      setLoading(false);
    }
  };

  const formatBytes = (bytes: number) => {
    if (!bytes || bytes === 0) return '0 B';
    const k = 1024;
    const sizes = ['B', 'KB', 'MB', 'GB'];
    const i = Math.floor(Math.log(bytes) / Math.log(k));
    return parseFloat((bytes / Math.pow(k, i)).toFixed(2)) + ' ' + sizes[i];
  };

  // Compute total redundant space (total size minus 1 copy for each group)
  const totalWastedBytes = duplicateGroups.reduce((acc, g) => {
    if (g.copies_count > 1 && g.files && g.files.length > 0) {
      const singleCopySize = g.files[0].size_bytes || 0;
      return acc + (singleCopySize * (g.copies_count - 1));
    }
    return acc;
  }, 0);

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '24px' }}>
      {/* Header Banner */}
      <div style={{
        background: 'linear-gradient(135deg, rgba(245, 158, 11, 0.1) 0%, #1e293b 100%)',
        border: '1px solid #f59e0b',
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
            <Copy size={24} color="#f59e0b" />
            <h2 style={{ fontSize: '20px', fontWeight: 'bold' }}>Gruppi di Duplicati Esatti</h2>
          </div>
          <p style={{ color: '#94a3b8', fontSize: '13px', marginTop: '6px', maxWidth: '650px' }}>
            Questi file presentano lo stesso hash SHA-256 binario, pur trovandosi su fonti o cartelle differenti con nomi potenzialmente diversi.
          </p>
        </div>

        <div style={{
          background: '#0f172a',
          border: '1px solid #334155',
          borderRadius: '10px',
          padding: '12px 20px',
          textAlign: 'right'
        }}>
          <div style={{ fontSize: '12px', color: '#94a3b8' }}>Spazio Ridondante Potenzialmente Recuperabile</div>
          <div style={{ fontSize: '22px', fontWeight: 'bold', color: '#f59e0b', marginTop: '4px' }}>
            {formatBytes(totalWastedBytes)}
          </div>
        </div>
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
          <strong>Politica di Sicurezza MVP:</strong> La gestione dei duplicati in questa fase è esclusivamente consultiva e non distruttiva. Nessun file originale viene mai rimosso o modificato dal software.
        </span>
      </div>

      {/* List of Duplicate Groups */}
      {duplicateGroups.length === 0 && !loading ? (
        <div style={{
          textAlign: 'center',
          padding: '80px 20px',
          background: '#1e293b',
          borderRadius: '16px',
          border: '1px solid #334155'
        }}>
          <CheckCircle2 size={48} color="#22c55e" style={{ margin: '0 auto 16px' }} />
          <h3 style={{ fontSize: '18px', fontWeight: 600 }}>Nessun duplicato binario rilevato</h3>
          <p style={{ color: '#94a3b8', fontSize: '13px', marginTop: '6px' }}>
            Tutti i file indicizzati nel catalogo sono univoci.
          </p>
        </div>
      ) : (
        <div style={{ display: 'flex', flexDirection: 'column', gap: '20px' }}>
          {duplicateGroups.map((group) => (
            <div
              key={group.media_id}
              style={{
                background: '#1e293b',
                border: '1px solid #334155',
                borderRadius: '12px',
                overflow: 'hidden'
              }}
            >
              {/* Group Header */}
              <div style={{
                background: '#0f172a',
                padding: '14px 20px',
                borderBottom: '1px solid #334155',
                display: 'flex',
                justifyContent: 'space-between',
                alignItems: 'center',
                flexWrap: 'wrap',
                gap: '12px'
              }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
                  <span style={{
                    background: '#f59e0b',
                    color: 'black',
                    fontSize: '11px',
                    fontWeight: 700,
                    padding: '3px 8px',
                    borderRadius: '6px'
                  }}>
                    {group.copies_count} COPIE FISICHE
                  </span>
                  <span style={{ fontSize: '13px', color: '#94a3b8' }}>
                    Dimensione per copia: <strong>{formatBytes(group.files[0]?.size_bytes)}</strong>
                  </span>
                </div>

                <div style={{ fontSize: '11px', fontFamily: 'monospace', color: '#64748b' }}>
                  SHA: {group.canonical_sha256}
                </div>
              </div>

              {/* Group Body: Thumbnail + Copies list */}
              <div style={{ display: 'flex', flexWrap: 'wrap', padding: '16px 20px', gap: '20px' }}>
                {/* Thumbnail */}
                <div
                  onClick={() => setSelectedMediaId(group.media_id)}
                  style={{
                    width: '120px',
                    height: '120px',
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

                {/* Physical Copies Comparison Table */}
                <div style={{ flex: '1 1 500px', display: 'flex', flexDirection: 'column', gap: '8px' }}>
                  {group.files.map((file: any, idx: number) => (
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
                          color: '#f59e0b',
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

                      <div style={{ display: 'flex', alignItems: 'center', gap: '12px', flexShrink: 0 }}>
                        <div style={{ textAlign: 'right' }}>
                          <div style={{ fontWeight: 500, display: 'flex', alignItems: 'center', gap: '4px' }}>
                            <HardDrive size={13} color="#38bdf8" />
                            {file.source_name || 'Fonte'}
                          </div>
                          <div style={{ color: '#64748b', fontSize: '10px' }}>
                            {file.availability_status}
                          </div>
                        </div>
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            </div>
          ))}
        </div>
      )}

      {/* Modal Detail */}
      <MediaDetailModal
        mediaId={selectedMediaId}
        onClose={() => setSelectedMediaId(null)}
      />
    </div>
  );
};
