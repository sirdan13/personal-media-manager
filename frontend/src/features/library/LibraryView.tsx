import React, { useEffect, useState } from 'react';
import { ApiClient } from '../../services/api';
import {
  Search,
  ArrowUpDown,
  Image,
  Video,
  Copy,
  FolderOpen
} from 'lucide-react';
import { MediaDetailModal } from './MediaDetailModal';

interface LibraryViewProps {
  initialType?: string; // 'all' | 'image' | 'video'
}

export const LibraryView: React.FC<LibraryViewProps> = ({ initialType = 'all' }) => {
  const [mediaList, setMediaList] = useState<any[]>([]);
  const [sources, setSources] = useState<any[]>([]);
  const [selectedSource, setSelectedSource] = useState<string>('');
  const [mediaType, setMediaType] = useState<string>(initialType === 'all' ? '' : initialType);
  const [search, setSearch] = useState<string>('');
  const [sortBy, setSortBy] = useState<string>('date_desc');
  const [offset, setOffset] = useState<number>(0);
  const [limit] = useState<number>(48);
  const [hasMore, setHasMore] = useState<boolean>(true);
  const [loading, setLoading] = useState<boolean>(false);
  const [selectedMediaId, setSelectedMediaId] = useState<string | null>(null);

  // Sync initialType when tab changes
  useEffect(() => {
    setMediaType(initialType === 'all' ? '' : initialType);
    setOffset(0);
    setMediaList([]);
  }, [initialType]);

  // Load sources for filter dropdown
  useEffect(() => {
    if (!ApiClient.getToken()) return;
    ApiClient.getSources()
      .then(setSources)
      .catch(() => setSources([]));
  }, []);

  // Fetch media on filter changes
  useEffect(() => {
    if (!ApiClient.getToken()) return;
    const fetchMedia = async () => {
      setLoading(true);
      try {
        const items = await ApiClient.getMedia({
          mediaType: mediaType || undefined,
          sourceId: selectedSource || undefined,
          search: search.trim() || undefined,
          sortBy,
          offset,
          limit
        });

        if (offset === 0) {
          setMediaList(items);
        } else {
          setMediaList((prev) => [...prev, ...items]);
        }
        setHasMore(items.length === limit);
      } catch (err) {
        console.error('Error fetching media:', err);
      } finally {
        setLoading(false);
      }
    };

    fetchMedia();
  }, [mediaType, selectedSource, search, sortBy, offset, limit]);

  const handleFilterChange = () => {
    setOffset(0);
  };

  const formatBytes = (bytes?: number) => {
    if (!bytes) return '';
    const k = 1024;
    const sizes = ['B', 'KB', 'MB', 'GB'];
    const i = Math.floor(Math.log(bytes) / Math.log(k));
    return parseFloat((bytes / Math.pow(k, i)).toFixed(1)) + ' ' + sizes[i];
  };

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '20px' }}>
      {/* Top Filter Bar */}
      <div style={{
        background: '#1e293b',
        border: '1px solid #334155',
        borderRadius: '12px',
        padding: '16px',
        display: 'flex',
        flexWrap: 'wrap',
        alignItems: 'center',
        justifyContent: 'space-between',
        gap: '16px'
      }}>
        {/* Search input */}
        <div style={{ position: 'relative', flex: '1 1 260px' }}>
          <Search size={16} color="#64748b" style={{ position: 'absolute', left: '12px', top: '11px' }} />
          <input
            type="text"
            placeholder="Cerca per nome file..."
            value={search}
            onChange={(e) => { setSearch(e.target.value); handleFilterChange(); }}
            style={{
              width: '100%',
              background: '#0f172a',
              border: '1px solid #334155',
              borderRadius: '8px',
              padding: '8px 12px 8px 36px',
              color: 'white',
              fontSize: '13px'
            }}
          />
        </div>

        {/* Filter controls */}
        <div style={{ display: 'flex', flexWrap: 'wrap', alignItems: 'center', gap: '12px' }}>
          {/* Media Type Filter */}
          <div style={{ display: 'flex', background: '#0f172a', border: '1px solid #334155', borderRadius: '8px', padding: '2px' }}>
            <button
              onClick={() => { setMediaType(''); handleFilterChange(); }}
              style={{
                padding: '6px 12px',
                borderRadius: '6px',
                border: 'none',
                background: mediaType === '' ? '#0284c7' : 'transparent',
                color: mediaType === '' ? 'white' : '#94a3b8',
                fontSize: '12px',
                fontWeight: 600
              }}
            >
              Tutti
            </button>
            <button
              onClick={() => { setMediaType('image'); handleFilterChange(); }}
              style={{
                padding: '6px 12px',
                borderRadius: '6px',
                border: 'none',
                background: mediaType === 'image' ? '#0284c7' : 'transparent',
                color: mediaType === 'image' ? 'white' : '#94a3b8',
                fontSize: '12px',
                fontWeight: 600,
                display: 'flex',
                alignItems: 'center',
                gap: '4px'
              }}
            >
              <Image size={13} /> Foto
            </button>
            <button
              onClick={() => { setMediaType('video'); handleFilterChange(); }}
              style={{
                padding: '6px 12px',
                borderRadius: '6px',
                border: 'none',
                background: mediaType === 'video' ? '#0284c7' : 'transparent',
                color: mediaType === 'video' ? 'white' : '#94a3b8',
                fontSize: '12px',
                fontWeight: 600,
                display: 'flex',
                alignItems: 'center',
                gap: '4px'
              }}
            >
              <Video size={13} /> Video
            </button>
          </div>

          {/* Source dropdown */}
          <select
            value={selectedSource}
            onChange={(e) => { setSelectedSource(e.target.value); handleFilterChange(); }}
            style={{
              background: '#0f172a',
              color: 'white',
              border: '1px solid #334155',
              borderRadius: '8px',
              padding: '8px 12px',
              fontSize: '13px'
            }}
          >
            <option value="">Tutte le Fonti</option>
            {sources.map((s) => (
              <option key={s.id} value={s.id}>
                {s.name} {s.status === 'offline' ? '(Offline)' : `(${s.file_count || 0} file)`}
              </option>
            ))}
          </select>

          {/* Sort order dropdown */}
          <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
            <ArrowUpDown size={15} color="#94a3b8" />
            <select
              value={sortBy}
              onChange={(e) => { setSortBy(e.target.value); handleFilterChange(); }}
              style={{
                background: '#0f172a',
                color: 'white',
                border: '1px solid #334155',
                borderRadius: '8px',
                padding: '8px 12px',
                fontSize: '13px'
              }}
            >
              <option value="date_desc">Data più recente</option>
              <option value="date_asc">Data più vecchia</option>
              <option value="name_asc">Nome A-Z</option>
              <option value="name_desc">Nome Z-A</option>
              <option value="size_desc">Dimensione (maggiore)</option>
              <option value="size_asc">Dimensione (minore)</option>
            </select>
          </div>
        </div>
      </div>

      {/* Gallery Grid */}
      {mediaList.length === 0 && !loading ? (
        <div style={{
          textAlign: 'center',
          padding: '80px 20px',
          background: '#1e293b',
          borderRadius: '16px',
          border: '1px dashed #334155'
        }}>
          <FolderOpen size={48} color="#64748b" style={{ margin: '0 auto 16px' }} />
          <h3 style={{ fontSize: '18px', fontWeight: 600 }}>Nessun elemento trovato nel catalogo</h3>
          <p style={{ color: '#94a3b8', fontSize: '13px', marginTop: '6px' }}>
            Non ci sono elementi corrispondenti ai filtri o non hai ancora completato una scansione.
          </p>
        </div>
      ) : (
        <div style={{
          display: 'grid',
          gridTemplateColumns: 'repeat(auto-fill, minmax(220px, 1fr))',
          gap: '16px'
        }}>
          {mediaList.map((media) => (
            <div
              key={media.id}
              onClick={() => setSelectedMediaId(media.id)}
              style={{
                background: '#1e293b',
                border: media.copies_count > 1 ? '1px solid #f59e0b' : '1px solid #334155',
                borderRadius: '10px',
                overflow: 'hidden',
                cursor: 'pointer',
                display: 'flex',
                flexDirection: 'column',
                transition: 'transform 0.15s ease, border-color 0.15s ease'
              }}
            >
              {/* Thumbnail Container */}
              <div style={{
                height: '170px',
                background: '#090d16',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                position: 'relative',
                overflow: 'hidden'
              }}>
                {media.has_thumbnail ? (
                  <img
                    src={ApiClient.getThumbnailUrl(media.id)}
                    alt={media.primary_filename || 'Thumbnail'}
                    loading="lazy"
                    style={{
                      width: '100%',
                      height: '100%',
                      objectFit: 'cover'
                    }}
                  />
                ) : (
                  <div style={{ color: '#475569', display: 'flex', flexDirection: 'column', alignItems: 'center', gap: '4px' }}>
                    {media.media_type === 'video' ? <Video size={36} /> : <Image size={36} />}
                  </div>
                )}

                {/* Multiple copies badge */}
                {media.copies_count > 1 && (
                  <span style={{
                    position: 'absolute',
                    top: '8px',
                    right: '8px',
                    background: '#f59e0b',
                    color: 'black',
                    fontSize: '10px',
                    fontWeight: 700,
                    padding: '2px 7px',
                    borderRadius: '4px',
                    display: 'flex',
                    alignItems: 'center',
                    gap: '4px',
                    boxShadow: '0 2px 4px rgba(0,0,0,0.5)'
                  }}>
                    <Copy size={11} />
                    {media.copies_count} COPIE
                  </span>
                )}

                {/* Resolution / duration badge */}
                <span style={{
                  position: 'absolute',
                  bottom: '8px',
                  left: '8px',
                  background: 'rgba(15, 23, 42, 0.75)',
                  backdropFilter: 'blur(4px)',
                  color: 'white',
                  fontSize: '10px',
                  padding: '2px 6px',
                  borderRadius: '4px',
                  display: 'flex',
                  alignItems: 'center',
                  gap: '4px'
                }}>
                  {media.media_type === 'video' && <Video size={10} color="#a855f7" />}
                  {media.width && media.height ? `${media.width}×${media.height}` : media.media_type.toUpperCase()}
                  {media.duration_seconds ? ` • ${media.duration_seconds}s` : ''}
                </span>
              </div>

              {/* Card Footer */}
              <div style={{ padding: '10px 12px', fontSize: '12px' }}>
                <div style={{
                  fontWeight: 600,
                  overflow: 'hidden',
                  textOverflow: 'ellipsis',
                  whiteSpace: 'nowrap'
                }} title={media.primary_filename || 'Elemento'}>
                  {media.primary_filename || 'Elemento Multimediale'}
                </div>

                <div style={{ display: 'flex', justifyContent: 'space-between', color: '#94a3b8', fontSize: '11px', marginTop: '4px' }}>
                  <span>
                    {media.captured_at ? new Date(media.captured_at).toLocaleDateString() : 'Nessuna data'}
                  </span>
                  <span>{formatBytes(media.primary_size_bytes)}</span>
                </div>
              </div>
            </div>
          ))}
        </div>
      )}

      {/* Pagination Load More */}
      {hasMore && mediaList.length > 0 && (
        <div style={{ textAlign: 'center', marginTop: '16px' }}>
          <button
            onClick={() => setOffset((prev) => prev + limit)}
            disabled={loading}
            style={{
              background: '#334155',
              color: 'white',
              border: '1px solid #475569',
              borderRadius: '8px',
              padding: '10px 24px',
              fontSize: '13px',
              fontWeight: 600
            }}
          >
            {loading ? 'Caricamento...' : 'Carica altri elementi'}
          </button>
        </div>
      )}

      {/* Detail Modal */}
      <MediaDetailModal
        mediaId={selectedMediaId}
        onClose={() => setSelectedMediaId(null)}
      />
    </div>
  );
};
