import React, { useEffect, useState } from 'react';
import { ApiClient } from '../../services/api';
import {
  HardDrive,
  FolderPlus,
  Play,
  X
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
          onClick={() => setIsModalOpen(true)}
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
            maxWidth: '440px',
            padding: '24px',
            boxShadow: '0 25px 50px -12px rgba(0, 0, 0, 0.5)'
          }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '20px' }}>
              <h3 style={{ fontSize: '18px', fontWeight: 'bold' }}>Registra Nuova Fonte</h3>
              <button
                onClick={() => setIsModalOpen(false)}
                style={{ background: 'transparent', border: 'none', color: '#94a3b8' }}
              >
                <X size={20} />
              </button>
            </div>

            <form onSubmit={handleCreateSource} style={{ display: 'flex', flexDirection: 'column', gap: '14px' }}>
              <div>
                <label style={{ fontSize: '12px', color: '#94a3b8', display: 'block', marginBottom: '6px' }}>
                  Nome Identificativo della Fonte *
                </label>
                <input
                  type="text"
                  required
                  placeholder="Es. Hard Disk Esterno WD 4TB"
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

              <div>
                <label style={{ fontSize: '12px', color: '#94a3b8', display: 'block', marginBottom: '6px' }}>
                  Etichetta Percorso o Montaggio (Opzionale)
                </label>
                <input
                  type="text"
                  placeholder="Es. /Volumes/WD_4TB/Foto o Archivio_2022"
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
                    fontSize: '13px'
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
                    fontWeight: 600
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
