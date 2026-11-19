import React, { useEffect, useState } from 'react';
import { ApiClient } from '../../services/api';
import {
  Image,
  Video,
  HardDrive,
  Copy,
  Database,
  ArrowRight,
  Clock,
  CheckCircle,
  AlertTriangle,
  FolderPlus,
  Sparkles,
  Camera,
  MapPin,
  Heart,
  Film,
  Layers,
  ChevronRight,
  ShieldCheck
} from 'lucide-react';

interface StorageSourceItem {
  source_id: string;
  source_name: string;
  status: string;
  file_count: number;
  total_bytes: number;
}

interface DashboardStats {
  total_photos: number;
  total_videos: number;
  total_sources: number;
  total_physical_copies: number;
  duplicate_copies: number;
  total_bytes_indexed: number;
  missing_thumbnails_count?: number;
  geotagged_count?: number;
  favorites_count?: number;
  raw_count?: number;
  live_photos_count?: number;
  recoverable_duplicate_bytes?: number;
  protection_coverage_pct?: number;
  protected_media_count?: number;
  unprotected_media_count?: number;
  intra_source_wasted_bytes?: number;
  multi_source_backup_bytes?: number;
  storage_by_source?: StorageSourceItem[];
}

interface DashboardViewProps {
  onNavigate: (tab: string) => void;
  onOpenScanner: () => void;
  onOpenTutorial?: () => void;
}

export const DashboardView: React.FC<DashboardViewProps> = ({ onNavigate, onOpenScanner, onOpenTutorial }) => {
  const [stats, setStats] = useState<DashboardStats | null>(null);
  const [sources, setSources] = useState<any[]>([]);
  const [recentScans, setRecentScans] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);

  const loadData = async () => {
    if (!ApiClient.getToken()) {
      setLoading(false);
      return;
    }
    try {
      setLoading(true);
      const [statsData, sourcesData, scansData] = await Promise.all([
        ApiClient.getDashboardStats().catch(() => null),
        ApiClient.getSources().catch(() => []),
        ApiClient.getScans().catch(() => [])
      ]);
      setStats(statsData);
      setSources(sourcesData);
      setRecentScans(scansData.slice(0, 5));
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadData();
  }, []);

  const formatBytes = (bytes: number) => {
    if (!bytes || bytes === 0) return '0 B';
    const k = 1024;
    const sizes = ['B', 'KB', 'MB', 'GB', 'TB'];
    const i = Math.floor(Math.log(bytes) / Math.log(k));
    return parseFloat((bytes / Math.pow(k, i)).toFixed(2)) + ' ' + sizes[i];
  };

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '28px' }}>
      {/* Welcome Banner */}
      <div style={{
        background: 'linear-gradient(135deg, #1e293b 0%, #0f172a 100%)',
        border: '1px solid #334155',
        borderRadius: '16px',
        padding: '28px',
        display: 'flex',
        justifyContent: 'space-between',
        alignItems: 'center',
        flexWrap: 'wrap',
        gap: '20px'
      }}>
        <div>
          <h2 style={{ fontSize: '24px', fontWeight: 'bold' }}>Panoramica Catalogo</h2>
          <p style={{ color: '#94a3b8', fontSize: '14px', marginTop: '6px', maxWidth: '650px' }}>
            Centralizza l'indice delle tue fotografie e dei tuoi video conservando gli originali sui rispettivi dischi fisici.
          </p>
        </div>
        <div style={{ display: 'flex', gap: '12px', flexWrap: 'wrap' }}>
          {onOpenTutorial && (
            <button
              onClick={onOpenTutorial}
              style={{
                background: 'rgba(56, 189, 248, 0.1)',
                color: '#38bdf8',
                border: '1px solid rgba(56, 189, 248, 0.3)',
                borderRadius: '10px',
                padding: '12px 18px',
                fontSize: '14px',
                fontWeight: 600,
                display: 'flex',
                alignItems: 'center',
                gap: '8px',
                cursor: 'pointer'
              }}
            >
              <Sparkles size={18} />
              Guida & Tutorial iPhone / Dischi
            </button>
          )}
          <button
            onClick={onOpenScanner}
            style={{
              background: '#0284c7',
              color: 'white',
              border: 'none',
              borderRadius: '10px',
              padding: '12px 20px',
              fontSize: '14px',
              fontWeight: 600,
              display: 'flex',
              alignItems: 'center',
              gap: '8px'
            }}
          >
            <FolderPlus size={18} />
            Scansiona Nuova Fonte
          </button>
        </div>
      </div>

      {/* Missing Thumbnails Warning Banner */}
      {stats && (stats.missing_thumbnails_count ?? 0) > 0 && (
        <div style={{
          background: 'rgba(245, 158, 11, 0.1)',
          border: '1px solid rgba(245, 158, 11, 0.35)',
          borderRadius: '12px',
          padding: '16px 20px',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          flexWrap: 'wrap',
          gap: '12px'
        }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
            <div style={{ padding: '8px', background: 'rgba(245, 158, 11, 0.2)', borderRadius: '8px' }}>
              <AlertTriangle size={20} color="#f59e0b" />
            </div>
            <div>
              <div style={{ fontWeight: 600, color: '#f59e0b', fontSize: '14px' }}>
                Miniature mancanti rilevate ({stats.missing_thumbnails_count} elementi)
              </div>
              <div style={{ color: '#94a3b8', fontSize: '12px', marginTop: '2px' }}>
                Alcuni file RAW, HEIC o video non hanno ancora una miniatura WebP ottimizzata. Puoi rigenerarle con la scansione rapida lato server.
              </div>
            </div>
          </div>
          <button
            onClick={() => onNavigate('scans')}
            style={{
              background: '#f59e0b',
              color: '#0f172a',
              border: 'none',
              borderRadius: '8px',
              padding: '8px 14px',
              fontSize: '12px',
              fontWeight: 700,
              cursor: 'pointer',
              display: 'flex',
              alignItems: 'center',
              gap: '6px'
            }}
          >
            Rigenera in Scansioni
            <ChevronRight size={14} />
          </button>
        </div>
      )}

      {/* KPI Cards Grid */}
      <div style={{
        display: 'grid',
        gridTemplateColumns: 'repeat(auto-fit, minmax(210px, 1fr))',
        gap: '16px'
      }}>
        <div
          onClick={() => onNavigate('photos')}
          style={{
            background: '#1e293b',
            border: '1px solid #334155',
            borderRadius: '12px',
            padding: '20px',
            cursor: 'pointer',
            transition: 'transform 0.15s ease'
          }}
        >
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
            <span style={{ fontSize: '13px', color: '#94a3b8', fontWeight: 500 }}>Fotografie Uniche</span>
            <div style={{ padding: '8px', background: 'rgba(56, 189, 248, 0.1)', borderRadius: '8px' }}>
              <Image size={20} color="#38bdf8" />
            </div>
          </div>
          <div style={{ fontSize: '28px', fontWeight: 'bold', marginTop: '12px' }}>
            {loading ? '...' : (stats?.total_photos ?? 0).toLocaleString()}
          </div>
        </div>

        <div
          onClick={() => onNavigate('videos')}
          style={{
            background: '#1e293b',
            border: '1px solid #334155',
            borderRadius: '12px',
            padding: '20px',
            cursor: 'pointer'
          }}
        >
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
            <span style={{ fontSize: '13px', color: '#94a3b8', fontWeight: 500 }}>Video Unici</span>
            <div style={{ padding: '8px', background: 'rgba(168, 85, 247, 0.1)', borderRadius: '8px' }}>
              <Video size={20} color="#a855f7" />
            </div>
          </div>
          <div style={{ fontSize: '28px', fontWeight: 'bold', marginTop: '12px' }}>
            {loading ? '...' : (stats?.total_videos ?? 0).toLocaleString()}
          </div>
        </div>

        <div
          onClick={() => onNavigate('duplicates')}
          style={{
            background: '#1e293b',
            border: '1px solid #334155',
            borderRadius: '12px',
            padding: '20px',
            cursor: 'pointer'
          }}
        >
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
            <span style={{ fontSize: '13px', color: '#94a3b8', fontWeight: 500 }}>Duplicati Esatti</span>
            <div style={{ padding: '8px', background: 'rgba(245, 158, 11, 0.1)', borderRadius: '8px' }}>
              <Copy size={20} color="#f59e0b" />
            </div>
          </div>
          <div style={{ fontSize: '28px', fontWeight: 'bold', marginTop: '12px', color: '#f59e0b' }}>
            {loading ? '...' : (stats?.duplicate_copies ?? 0).toLocaleString()}
          </div>
          <div style={{ fontSize: '12px', color: '#94a3b8', marginTop: '4px' }}>
            Copie ridondanti identiche
          </div>
        </div>

        <div
          onClick={() => onNavigate('duplicates')}
          style={{
            background: '#1e293b',
            border: '1px solid #334155',
            borderRadius: '12px',
            padding: '20px',
            cursor: 'pointer'
          }}
        >
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
            <span style={{ fontSize: '13px', color: '#94a3b8', fontWeight: 500 }}>Salute Backup Multi-Disco</span>
            <div style={{ padding: '8px', background: 'rgba(34, 197, 94, 0.1)', borderRadius: '8px' }}>
              <ShieldCheck size={20} color="#22c55e" />
            </div>
          </div>
          <div style={{ fontSize: '28px', fontWeight: 'bold', marginTop: '12px', color: '#22c55e' }}>
            {loading ? '...' : `${stats?.protection_coverage_pct ?? 0}%`}
          </div>
          <div style={{ fontSize: '12px', color: '#94a3b8', marginTop: '4px' }}>
            {stats?.protected_media_count ?? 0} protetti su 2+ dischi
          </div>
        </div>

        <div
          onClick={() => onNavigate('sources')}
          style={{
            background: '#1e293b',
            border: '1px solid #334155',
            borderRadius: '12px',
            padding: '20px',
            cursor: 'pointer'
          }}
        >
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
            <span style={{ fontSize: '13px', color: '#94a3b8', fontWeight: 500 }}>Fonti Registrate</span>
            <div style={{ padding: '8px', background: 'rgba(34, 197, 94, 0.1)', borderRadius: '8px' }}>
              <HardDrive size={20} color="#22c55e" />
            </div>
          </div>
          <div style={{ fontSize: '28px', fontWeight: 'bold', marginTop: '12px' }}>
            {loading ? '...' : (stats?.total_sources ?? 0).toLocaleString()}
          </div>
          <div style={{ fontSize: '12px', color: '#94a3b8', marginTop: '4px' }}>
            {sources.filter(s => s.status === 'online').length} online
          </div>
        </div>

        <div style={{
          background: '#1e293b',
          border: '1px solid #334155',
          borderRadius: '12px',
          padding: '20px'
        }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
            <span style={{ fontSize: '13px', color: '#94a3b8', fontWeight: 500 }}>Spazio Indicizzato</span>
            <div style={{ padding: '8px', background: 'rgba(56, 189, 248, 0.1)', borderRadius: '8px' }}>
              <Database size={20} color="#38bdf8" />
            </div>
          </div>
          <div style={{ fontSize: '28px', fontWeight: 'bold', marginTop: '12px' }}>
            {loading ? '...' : formatBytes(stats?.total_bytes_indexed ?? 0)}
          </div>
          <div style={{ fontSize: '12px', color: '#94a3b8', marginTop: '4px' }}>
            {stats?.total_physical_copies ?? 0} file fisici complessivi
          </div>
        </div>
      </div>

      {/* Quick Filters / Feature Badges */}
      <div style={{
        display: 'grid',
        gridTemplateColumns: 'repeat(auto-fit, minmax(180px, 1fr))',
        gap: '12px'
      }}>
        <div
          onClick={() => onNavigate('photos')}
          style={{
            background: '#0f172a',
            border: '1px solid #334155',
            borderRadius: '10px',
            padding: '12px 16px',
            cursor: 'pointer',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between',
            transition: 'border-color 0.15s ease'
          }}
        >
          <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
            <Camera size={18} color="#ec4899" />
            <div>
              <div style={{ fontSize: '11px', color: '#94a3b8' }}>Foto RAW</div>
              <div style={{ fontSize: '15px', fontWeight: 700 }}>{stats?.raw_count ?? 0}</div>
            </div>
          </div>
          <ChevronRight size={14} color="#64748b" />
        </div>

        <div
          onClick={() => onNavigate('photos')}
          style={{
            background: '#0f172a',
            border: '1px solid #334155',
            borderRadius: '10px',
            padding: '12px 16px',
            cursor: 'pointer',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between'
          }}
        >
          <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
            <Film size={18} color="#06b6d4" />
            <div>
              <div style={{ fontSize: '11px', color: '#94a3b8' }}>Live Photos</div>
              <div style={{ fontSize: '15px', fontWeight: 700 }}>{stats?.live_photos_count ?? 0}</div>
            </div>
          </div>
          <ChevronRight size={14} color="#64748b" />
        </div>

        <div
          onClick={() => onNavigate('map')}
          style={{
            background: '#0f172a',
            border: '1px solid #334155',
            borderRadius: '10px',
            padding: '12px 16px',
            cursor: 'pointer',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between'
          }}
        >
          <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
            <MapPin size={18} color="#10b981" />
            <div>
              <div style={{ fontSize: '11px', color: '#94a3b8' }}>Con GPS</div>
              <div style={{ fontSize: '15px', fontWeight: 700 }}>{stats?.geotagged_count ?? 0}</div>
            </div>
          </div>
          <ChevronRight size={14} color="#64748b" />
        </div>

        <div
          onClick={() => onNavigate('photos')}
          style={{
            background: '#0f172a',
            border: '1px solid #334155',
            borderRadius: '10px',
            padding: '12px 16px',
            cursor: 'pointer',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between'
          }}
        >
          <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
            <Heart size={18} color="#f43f5e" />
            <div>
              <div style={{ fontSize: '11px', color: '#94a3b8' }}>Preferiti</div>
              <div style={{ fontSize: '15px', fontWeight: 700 }}>{stats?.favorites_count ?? 0}</div>
            </div>
          </div>
          <ChevronRight size={14} color="#64748b" />
        </div>

        <div
          onClick={() => onNavigate('duplicates')}
          style={{
            background: '#0f172a',
            border: '1px solid #334155',
            borderRadius: '10px',
            padding: '12px 16px',
            cursor: 'pointer',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between'
          }}
        >
          <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
            <Layers size={18} color="#f59e0b" />
            <div>
              <div style={{ fontSize: '11px', color: '#94a3b8' }}>Recuperabili</div>
              <div style={{ fontSize: '15px', fontWeight: 700 }}>{formatBytes(stats?.recoverable_duplicate_bytes ?? 0)}</div>
            </div>
          </div>
          <ChevronRight size={14} color="#64748b" />
        </div>
      </div>

      {/* Storage Breakdown by Source */}
      {stats?.storage_by_source && stats.storage_by_source.length > 0 && (
        <div style={{
          background: '#1e293b',
          border: '1px solid #334155',
          borderRadius: '14px',
          padding: '22px'
        }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '16px' }}>
            <h3 style={{ fontSize: '16px', fontWeight: 600, display: 'flex', alignItems: 'center', gap: '8px', margin: 0 }}>
              <HardDrive size={18} color="#38bdf8" />
              Distribuzione Spazio per Disco & Fonte
            </h3>
            <span style={{ fontSize: '12px', color: '#94a3b8' }}>
              Totale indicizzato: {formatBytes(stats.total_bytes_indexed)}
            </span>
          </div>

          <div style={{ display: 'flex', flexDirection: 'column', gap: '14px' }}>
            {stats.storage_by_source.map((src) => {
              const pct = stats.total_bytes_indexed > 0
                ? Math.min(100, Math.round((src.total_bytes / stats.total_bytes_indexed) * 100))
                : 0;

              return (
                <div key={src.source_id} style={{ display: 'flex', flexDirection: 'column', gap: '6px' }}>
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', fontSize: '13px' }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                      <span style={{ fontWeight: 600 }}>{src.source_name}</span>
                      <span style={{
                        fontSize: '10px',
                        fontWeight: 600,
                        padding: '2px 6px',
                        borderRadius: '4px',
                        background: src.status === 'online' ? 'rgba(34, 197, 94, 0.15)' : 'rgba(148, 163, 184, 0.15)',
                        color: src.status === 'online' ? '#22c55e' : '#94a3b8'
                      }}>
                        {src.status.toUpperCase()}
                      </span>
                    </div>
                    <div style={{ color: '#94a3b8', fontSize: '12px' }}>
                      <strong>{formatBytes(src.total_bytes)}</strong> ({pct}%) • {src.file_count.toLocaleString()} file
                    </div>
                  </div>
                  <div style={{
                    width: '100%',
                    height: '8px',
                    background: '#0f172a',
                    borderRadius: '4px',
                    overflow: 'hidden'
                  }}>
                    <div style={{
                      width: `${pct}%`,
                      height: '100%',
                      background: src.status === 'online' ? 'linear-gradient(90deg, #0284c7, #38bdf8)' : '#64748b',
                      borderRadius: '4px',
                      transition: 'width 0.3s ease'
                    }} />
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      )}

      {/* Two Column Layout: Sources Status & Recent Scans */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(400px, 1fr))', gap: '20px' }}>
        {/* Sources Health */}
        <div style={{
          background: '#1e293b',
          border: '1px solid #334155',
          borderRadius: '14px',
          padding: '22px'
        }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '16px' }}>
            <h3 style={{ fontSize: '16px', fontWeight: 600, display: 'flex', alignItems: 'center', gap: '8px' }}>
              <HardDrive size={18} color="#38bdf8" />
              Stato Fonti & Dispositivi
            </h3>
            <button
              onClick={() => onNavigate('sources')}
              style={{ background: 'transparent', border: 'none', color: '#38bdf8', fontSize: '12px', display: 'flex', alignItems: 'center', gap: '4px' }}
            >
              Vedi tutte <ArrowRight size={14} />
            </button>
          </div>

          {sources.length === 0 ? (
            <div style={{ textAlign: 'center', padding: '30px', color: '#94a3b8', fontSize: '13px' }}>
              Nessuna fonte ancora registrata. Avvia la prima scansione per collegare un archivio.
            </div>
          ) : (
            <div style={{ display: 'flex', flexDirection: 'column', gap: '10px' }}>
              {sources.slice(0, 4).map((s) => (
                <div
                  key={s.id}
                  style={{
                    background: '#0f172a',
                    border: '1px solid #334155',
                    borderRadius: '8px',
                    padding: '12px 14px',
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'space-between'
                  }}
                >
                  <div>
                    <div style={{ fontWeight: 600, fontSize: '14px' }}>{s.name}</div>
                    <div style={{ color: '#94a3b8', fontSize: '11px', marginTop: '2px' }}>
                      {s.root_path || 'Cartella browser'} • {s.file_count || 0} file indicizzati
                    </div>
                  </div>
                  <span style={{
                    fontSize: '11px',
                    fontWeight: 600,
                    padding: '3px 8px',
                    borderRadius: '6px',
                    background: s.status === 'online' ? 'rgba(34, 197, 94, 0.15)' :
                               s.status === 'scanning' ? 'rgba(56, 189, 248, 0.15)' : 'rgba(148, 163, 184, 0.15)',
                    color: s.status === 'online' ? '#22c55e' :
                           s.status === 'scanning' ? '#38bdf8' : '#94a3b8'
                  }}>
                    {s.status.toUpperCase()}
                  </span>
                </div>
              ))}
            </div>
          )}
        </div>

        {/* Recent Scans */}
        <div style={{
          background: '#1e293b',
          border: '1px solid #334155',
          borderRadius: '14px',
          padding: '22px'
        }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '16px' }}>
            <h3 style={{ fontSize: '16px', fontWeight: 600, display: 'flex', alignItems: 'center', gap: '8px' }}>
              <Clock size={18} color="#38bdf8" />
              Ultime Scansioni
            </h3>
            <button
              onClick={() => onNavigate('scans')}
              style={{ background: 'transparent', border: 'none', color: '#38bdf8', fontSize: '12px', display: 'flex', alignItems: 'center', gap: '4px' }}
            >
              Registro completo <ArrowRight size={14} />
            </button>
          </div>

          {recentScans.length === 0 ? (
            <div style={{ textAlign: 'center', padding: '30px', color: '#94a3b8', fontSize: '13px' }}>
              Nessuna scansione registrata nel backend.
            </div>
          ) : (
            <div style={{ display: 'flex', flexDirection: 'column', gap: '10px' }}>
              {recentScans.map((scan) => (
                <div
                  key={scan.id}
                  style={{
                    background: '#0f172a',
                    border: '1px solid #334155',
                    borderRadius: '8px',
                    padding: '12px 14px',
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'space-between'
                  }}
                >
                  <div>
                    <div style={{ fontWeight: 600, fontSize: '13px' }}>{scan.source_name || 'Fonte'}</div>
                    <div style={{ color: '#94a3b8', fontSize: '11px', marginTop: '2px' }}>
                      {scan.processed_files} file elaborati • {new Date(scan.started_at).toLocaleString()}
                    </div>
                  </div>
                  <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
                    {scan.status === 'completed' ? (
                      <CheckCircle size={16} color="#22c55e" />
                    ) : scan.status === 'failed' ? (
                      <AlertTriangle size={16} color="#f43f5e" />
                    ) : (
                      <Clock size={16} color="#38bdf8" />
                    )}
                    <span style={{ fontSize: '11px', color: '#94a3b8', textTransform: 'capitalize' }}>
                      {scan.status}
                    </span>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>
    </div>
  );
};
