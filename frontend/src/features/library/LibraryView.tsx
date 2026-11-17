import React, { useEffect, useState, useMemo } from 'react';
import { ApiClient } from '../../services/api';
import {
  Search,
  ArrowUpDown,
  Image,
  Video,
  Copy,
  FolderOpen,
  Calendar,
  Grid as GridIcon
} from 'lucide-react';
import { MediaDetailModal } from './MediaDetailModal';

interface LibraryViewProps {
  initialType?: string; // 'all' | 'image' | 'video'
}

export const LibraryView: React.FC<LibraryViewProps> = ({ initialType = 'all' }) => {
  const [viewMode, setViewMode] = useState<'grid' | 'timeline'>('grid');
  const [mediaList, setMediaList] = useState<any[]>([]);
  const [sources, setSources] = useState<any[]>([]);
  const [albums, setAlbums] = useState<any[]>([]);
  const [tags, setTags] = useState<any[]>([]);
  const [timelineBuckets, setTimelineBuckets] = useState<any[]>([]);

  const [selectedSource, setSelectedSource] = useState<string>('');
  const [selectedAlbum, setSelectedAlbum] = useState<string>('');
  const [selectedTag, setSelectedTag] = useState<string>('');
  const [selectedMonthKey, setSelectedMonthKey] = useState<string>('');
  const [mediaType, setMediaType] = useState<string>(initialType === 'all' ? '' : initialType);
  const [search, setSearch] = useState<string>('');
  const [sortBy, setSortBy] = useState<string>('date_desc');
  const [offset, setOffset] = useState<number>(0);
  const [limit] = useState<number>(60);
  const [hasMore, setHasMore] = useState<boolean>(true);
  const [loading, setLoading] = useState<boolean>(false);
  const [selectedMediaId, setSelectedMediaId] = useState<string | null>(null);

  // Sync initialType when tab changes
  useEffect(() => {
    setMediaType(initialType === 'all' ? '' : initialType);
    setOffset(0);
    setMediaList([]);
  }, [initialType]);

  // Load sources, albums, tags, and timeline buckets on mount
  useEffect(() => {
    if (!ApiClient.getToken()) return;
    ApiClient.getSources().then(setSources).catch(() => setSources([]));
    ApiClient.getAlbums().then(setAlbums).catch(() => setAlbums([]));
    ApiClient.getTags().then(setTags).catch(() => setTags([]));
    ApiClient.getTimeline().then(setTimelineBuckets).catch(() => setTimelineBuckets([]));
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
          albumId: selectedAlbum || undefined,
          tagId: selectedTag || undefined,
          monthKey: selectedMonthKey || undefined,
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
  }, [mediaType, selectedSource, search, selectedAlbum, selectedTag, selectedMonthKey, sortBy, offset, limit]);

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

  const monthNames = [
    'Gennaio', 'Febbraio', 'Marzo', 'Aprile', 'Maggio', 'Giugno',
    'Luglio', 'Agosto', 'Settembre', 'Ottobre', 'Novembre', 'Dicembre'
  ];

  // Group media by Month/Year for Timeline view
  const timelineGroups = useMemo(() => {
    const groups: { [key: string]: any[] } = {};
    mediaList.forEach((item) => {
      const d = item.captured_at ? new Date(item.captured_at) : new Date(item.created_at);
      const m = d.getMonth();
      const y = d.getFullYear();
      const key = `${monthNames[m]} ${y}`;
      if (!groups[key]) groups[key] = [];
      groups[key].push(item);
    });
    return groups;
  }, [mediaList]);

  const renderMediaCard = (media: any) => (
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

        {/* Live Photo badge */}
        {media.is_live_photo && (
          <span style={{
            position: 'absolute',
            top: '8px',
            left: '8px',
            background: 'rgba(236, 72, 153, 0.9)',
            color: 'white',
            fontSize: '10px',
            fontWeight: 700,
            padding: '2px 6px',
            borderRadius: '4px',
            display: 'flex',
            alignItems: 'center',
            gap: '4px',
            boxShadow: '0 2px 4px rgba(0,0,0,0.5)',
            letterSpacing: '0.5px'
          }}>
            LIVE
          </span>
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

      {/* Media Details Footer */}
      <div style={{ padding: '10px 12px', display: 'flex', flexDirection: 'column', gap: '4px' }}>
        <div style={{
          fontSize: '13px',
          fontWeight: 600,
          color: '#f8fafc',
          whiteSpace: 'nowrap',
          overflow: 'hidden',
          textOverflow: 'ellipsis'
        }}>
          {media.primary_filename || 'File senza nome'}
        </div>

        <div style={{
          display: 'flex',
          justifyContent: 'space-between',
          alignItems: 'center',
          fontSize: '11px',
          color: '#94a3b8'
        }}>
          <span>{media.captured_at ? new Date(media.captured_at).toLocaleDateString() : 'N/D'}</span>
          <span>{formatBytes(media.primary_size_bytes)}</span>
        </div>
      </div>
    </div>
  );

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
        <div style={{ position: 'relative', flex: '1 1 240px' }}>
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
        <div style={{ display: 'flex', flexWrap: 'wrap', alignItems: 'center', gap: '10px' }}>
          {/* View Mode Toggle (Griglia vs Timeline) */}
          <div style={{ display: 'flex', background: '#0f172a', border: '1px solid #334155', borderRadius: '8px', padding: '2px' }}>
            <button
              onClick={() => setViewMode('grid')}
              style={{
                padding: '6px 12px',
                borderRadius: '6px',
                border: 'none',
                background: viewMode === 'grid' ? '#0284c7' : 'transparent',
                color: viewMode === 'grid' ? 'white' : '#94a3b8',
                fontSize: '12px',
                fontWeight: 600,
                display: 'flex',
                alignItems: 'center',
                gap: '5px',
                cursor: 'pointer'
              }}
            >
              <GridIcon size={13} /> Griglia
            </button>
            <button
              onClick={() => setViewMode('timeline')}
              style={{
                padding: '6px 12px',
                borderRadius: '6px',
                border: 'none',
                background: viewMode === 'timeline' ? '#0284c7' : 'transparent',
                color: viewMode === 'timeline' ? 'white' : '#94a3b8',
                fontSize: '12px',
                fontWeight: 600,
                display: 'flex',
                alignItems: 'center',
                gap: '5px',
                cursor: 'pointer'
              }}
            >
              <Calendar size={13} /> Timeline
            </button>
          </div>

          {/* Media Type Filter */}
          <div style={{ display: 'flex', background: '#0f172a', border: '1px solid #334155', borderRadius: '8px', padding: '2px' }}>
            <button
              onClick={() => { setMediaType(''); handleFilterChange(); }}
              style={{
                padding: '6px 10px',
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
                padding: '6px 10px',
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
                padding: '6px 10px',
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

          {/* Album Filter */}
          {albums.length > 0 && (
            <select
              value={selectedAlbum}
              onChange={(e) => { setSelectedAlbum(e.target.value); handleFilterChange(); }}
              style={{
                background: '#0f172a',
                color: selectedAlbum ? '#38bdf8' : 'white',
                border: selectedAlbum ? '1px solid #38bdf8' : '1px solid #334155',
                borderRadius: '8px',
                padding: '7px 10px',
                fontSize: '12px'
              }}
            >
              <option value="">📁 Tutti gli Album</option>
              {albums.map((a) => (
                <option key={a.id} value={a.id}>{a.name} ({a.media_count})</option>
              ))}
            </select>
          )}

          {/* Tag Filter */}
          {tags.length > 0 && (
            <select
              value={selectedTag}
              onChange={(e) => { setSelectedTag(e.target.value); handleFilterChange(); }}
              style={{
                background: '#0f172a',
                color: selectedTag ? '#ec4899' : 'white',
                border: selectedTag ? '1px solid #ec4899' : '1px solid #334155',
                borderRadius: '8px',
                padding: '7px 10px',
                fontSize: '12px'
              }}
            >
              <option value="">🏷️ Tutti i Tag</option>
              {tags.map((t) => (
                <option key={t.id} value={t.id}>#{t.name} ({t.media_count})</option>
              ))}
            </select>
          )}

          {/* Source dropdown */}
          <select
            value={selectedSource}
            onChange={(e) => { setSelectedSource(e.target.value); handleFilterChange(); }}
            style={{
              background: '#0f172a',
              color: 'white',
              border: '1px solid #334155',
              borderRadius: '8px',
              padding: '7px 10px',
              fontSize: '12px'
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
          <div style={{ display: 'flex', alignItems: 'center', gap: '4px' }}>
            <ArrowUpDown size={14} color="#94a3b8" />
            <select
              value={sortBy}
              onChange={(e) => { setSortBy(e.target.value); handleFilterChange(); }}
              style={{
                background: '#0f172a',
                color: 'white',
                border: '1px solid #334155',
                borderRadius: '8px',
                padding: '7px 10px',
                fontSize: '12px'
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

      {/* Timeline Month Chips (shown in Timeline mode or when buckets exist) */}
      {viewMode === 'timeline' && timelineBuckets.length > 0 && (
        <div style={{
          display: 'flex',
          gap: '8px',
          overflowX: 'auto',
          paddingBottom: '4px',
          alignItems: 'center'
        }}>
          <span style={{ fontSize: '12px', color: '#64748b', fontWeight: 600, whiteSpace: 'nowrap', marginRight: '4px' }}>
            Mesi:
          </span>
          <button
            onClick={() => { setSelectedMonthKey(''); handleFilterChange(); }}
            style={{
              padding: '4px 10px',
              borderRadius: '16px',
              border: selectedMonthKey === '' ? '1px solid #38bdf8' : '1px solid #334155',
              background: selectedMonthKey === '' ? 'rgba(56, 189, 248, 0.15)' : '#1e293b',
              color: selectedMonthKey === '' ? '#38bdf8' : '#94a3b8',
              fontSize: '12px',
              fontWeight: 600,
              cursor: 'pointer',
              whiteSpace: 'nowrap'
            }}
          >
            Tutti i mesi
          </button>
          {timelineBuckets.map((b) => {
            const isSelected = selectedMonthKey === b.month_key;
            const mName = monthNames[b.month - 1] || b.month_key;
            return (
              <button
                key={b.month_key}
                onClick={() => { setSelectedMonthKey(isSelected ? '' : b.month_key); handleFilterChange(); }}
                style={{
                  padding: '4px 10px',
                  borderRadius: '16px',
                  border: isSelected ? '1px solid #38bdf8' : '1px solid #334155',
                  background: isSelected ? 'rgba(56, 189, 248, 0.15)' : '#1e293b',
                  color: isSelected ? '#38bdf8' : '#94a3b8',
                  fontSize: '12px',
                  fontWeight: 600,
                  cursor: 'pointer',
                  whiteSpace: 'nowrap'
                }}
              >
                {mName} {b.year} ({b.count})
              </button>
            );
          })}
        </div>
      )}

      {/* Main Content Area */}
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
      ) : viewMode === 'timeline' ? (
        /* Timeline View Mode */
        <div style={{ display: 'flex', flexDirection: 'column', gap: '28px' }}>
          {Object.entries(timelineGroups).map(([groupTitle, items]) => (
            <div key={groupTitle} style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
              <div style={{
                display: 'flex',
                alignItems: 'center',
                gap: '8px',
                borderBottom: '1px solid #334155',
                paddingBottom: '8px'
              }}>
                <Calendar size={18} color="#38bdf8" />
                <h3 style={{ fontSize: '16px', fontWeight: 700, color: '#f8fafc', margin: 0 }}>
                  {groupTitle}
                </h3>
                <span style={{ fontSize: '12px', color: '#94a3b8', fontWeight: 500 }}>
                  — {items.length} {items.length === 1 ? 'elemento' : 'elementi'}
                </span>
              </div>
              <div style={{
                display: 'grid',
                gridTemplateColumns: 'repeat(auto-fill, minmax(220px, 1fr))',
                gap: '16px'
              }}>
                {items.map(renderMediaCard)}
              </div>
            </div>
          ))}
        </div>
      ) : (
        /* Standard Grid View Mode */
        <div style={{
          display: 'grid',
          gridTemplateColumns: 'repeat(auto-fill, minmax(220px, 1fr))',
          gap: '16px'
        }}>
          {mediaList.map(renderMediaCard)}
        </div>
      )}

      {/* Pagination / Load more */}
      {hasMore && (
        <div style={{ display: 'flex', justifyContent: 'center', marginTop: '16px' }}>
          <button
            onClick={() => setOffset((prev) => prev + limit)}
            disabled={loading}
            style={{
              background: '#1e293b',
              border: '1px solid #334155',
              borderRadius: '8px',
              padding: '10px 24px',
              color: 'white',
              fontSize: '13px',
              fontWeight: 600,
              cursor: loading ? 'not-allowed' : 'pointer'
            }}
          >
            {loading ? 'Caricamento in corso...' : 'Carica altri elementi'}
          </button>
        </div>
      )}

      {/* Modal for Media Details */}
      <MediaDetailModal
        mediaId={selectedMediaId}
        onClose={() => setSelectedMediaId(null)}
      />
    </div>
  );
};
