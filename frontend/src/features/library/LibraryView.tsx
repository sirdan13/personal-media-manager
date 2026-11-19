import React, { useEffect, useState, useMemo } from 'react';
import { ApiClient } from '../../services/api';
import { useToast } from '../../context/ToastContext';
import {
  Search,
  ArrowUpDown,
  Image,
  Video,
  Copy,
  FolderOpen,
  Calendar,
  Grid as GridIcon,
  Heart,
  CheckSquare,
  Square,
  Play,
  Folder,
  Tag as TagIcon
} from 'lucide-react';
import { isRawExtension } from '../scanner/formatDetector';
import { MediaDetailModal } from './MediaDetailModal';

interface LibraryViewProps {
  initialType?: string; // 'all' | 'image' | 'video'
  initialFavorite?: boolean;
  initialAlbumId?: string | null;
  initialTagId?: string | null;
  initialGeoFilter?: {
    latMin: number;
    latMax: number;
    lonMin: number;
    lonMax: number;
    label?: string;
  } | null;
  onClearGeoFilter?: () => void;
  onClearAlbumFilter?: () => void;
  onClearTagFilter?: () => void;
}

export const LibraryView: React.FC<LibraryViewProps> = ({
  initialType = 'all',
  initialFavorite = false,
  initialAlbumId = null,
  initialTagId = null,
  initialGeoFilter = null,
  onClearGeoFilter,
  onClearAlbumFilter,
  onClearTagFilter
}) => {
  const { toast } = useToast();
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
  const [onlyFavorites, setOnlyFavorites] = useState<boolean>(initialFavorite);
  const [mediaType, setMediaType] = useState<string>(initialType === 'all' ? '' : initialType);
  const [protectionStatus, setProtectionStatus] = useState<string>('');
  const [search, setSearch] = useState<string>('');
  const [debouncedSearch, setDebouncedSearch] = useState<string>('');
  const [totalCount, setTotalCount] = useState<number | null>(null);
  const [geoFilter, setGeoFilter] = useState<{ latMin: number; latMax: number; lonMin: number; lonMax: number; label?: string } | null>(initialGeoFilter);
  const [sortBy, setSortBy] = useState<string>('date_desc');
  const [offset, setOffset] = useState<number>(0);
  const [limit] = useState<number>(60);
  const [hasMore, setHasMore] = useState<boolean>(true);
  const [loading, setLoading] = useState<boolean>(false);
  const [selectedMediaId, setSelectedMediaId] = useState<string | null>(null);

  // Batch selection state
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
  const [isSelectionMode, setIsSelectionMode] = useState<boolean>(false);
  const [hoveredLiveMediaId, setHoveredLiveMediaId] = useState<string | null>(null);

  // Sync initialType and geoFilter when props change
  useEffect(() => {
    setMediaType(initialType === 'all' ? '' : initialType);
    setOnlyFavorites(initialFavorite);
    setOffset(0);
    setMediaList([]);
    setSelectedIds(new Set());
  }, [initialType, initialFavorite]);

  useEffect(() => {
    setGeoFilter(initialGeoFilter);
    setOffset(0);
    setMediaList([]);
  }, [initialGeoFilter]);

  useEffect(() => {
    if (initialAlbumId) {
      setSelectedAlbum(initialAlbumId);
      setOffset(0);
    }
  }, [initialAlbumId]);

  useEffect(() => {
    if (initialTagId) {
      setSelectedTag(initialTagId);
      setOffset(0);
    }
  }, [initialTagId]);

  // Load sources, albums, tags, and timeline buckets on mount
  useEffect(() => {
    if (!ApiClient.getToken()) return;
    ApiClient.getSources().then(setSources).catch(() => setSources([]));
    ApiClient.getAlbums().then(setAlbums).catch(() => setAlbums([]));
    ApiClient.getTags().then(setTags).catch(() => setTags([]));
    ApiClient.getTimeline().then(setTimelineBuckets).catch(() => setTimelineBuckets([]));
  }, []);

  // Debounce search input by 300ms
  useEffect(() => {
    const timer = setTimeout(() => {
      setDebouncedSearch(search);
      setOffset(0);
    }, 300);
    return () => clearTimeout(timer);
  }, [search]);

  // Fetch media on filter changes with AbortController
  useEffect(() => {
    if (!ApiClient.getToken()) return;
    const controller = new AbortController();

    const fetchMedia = async () => {
      setLoading(true);
      try {
        const { items, totalCount: count } = await ApiClient.getMediaWithTotal({
          mediaType: mediaType || undefined,
          sourceId: selectedSource || undefined,
          search: debouncedSearch.trim() || undefined,
          albumId: selectedAlbum || undefined,
          tagId: selectedTag || undefined,
          monthKey: selectedMonthKey || undefined,
          isFavorite: onlyFavorites ? true : undefined,
          protectionStatus: protectionStatus || undefined,
          latMin: geoFilter?.latMin,
          latMax: geoFilter?.latMax,
          lonMin: geoFilter?.lonMin,
          lonMax: geoFilter?.lonMax,
          sortBy,
          offset,
          limit
        }, controller.signal);

        setTotalCount(count);

        if (offset === 0) {
          setMediaList(items);
        } else {
          setMediaList((prev) => [...prev, ...items]);
        }
        setHasMore(items.length === limit);
      } catch (err) {
        if ((err as Error).name !== 'AbortError') {
          console.error('Error fetching media:', err);
        }
      } finally {
        setLoading(false);
      }
    };

    fetchMedia();
    return () => controller.abort();
  }, [mediaType, selectedSource, debouncedSearch, selectedAlbum, selectedTag, selectedMonthKey, onlyFavorites, protectionStatus, geoFilter, sortBy, offset, limit]);

  const handleFilterChange = () => {
    setOffset(0);
  };

  const handleToggleFavorite = async (e: React.MouseEvent, id: string) => {
    e.stopPropagation();
    try {
      const res = await ApiClient.toggleFavorite(id);
      setMediaList((prev) => prev.map((m) => m.id === id ? { ...m, is_favorite: res.is_favorite } : m));
      toast.success(res.is_favorite ? 'Aggiunto ai preferiti ❤️' : 'Rimosso dai preferiti');
    } catch (err) {
      toast.error((err as Error).message);
    }
  };

  const handleToggleSelect = (e: React.MouseEvent, id: string) => {
    e.stopPropagation();
    setSelectedIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

  const handleSelectAll = () => {
    if (selectedIds.size === mediaList.length) {
      setSelectedIds(new Set());
    } else {
      setSelectedIds(new Set(mediaList.map((m) => m.id)));
    }
  };

  const handleBatchFavorite = async (makeFavorite: boolean) => {
    const ids = Array.from(selectedIds);
    if (ids.length === 0) return;
    try {
      await ApiClient.batchFavorite(ids, makeFavorite);
      setMediaList((prev) => prev.map((m) => ids.includes(m.id) ? { ...m, is_favorite: makeFavorite } : m));
      toast.success(makeFavorite ? `Aggiunti ${ids.length} ai preferiti` : `Rimossi ${ids.length} dai preferiti`);
      setSelectedIds(new Set());
      setIsSelectionMode(false);
    } catch (err) {
      toast.error((err as Error).message);
    }
  };

  const handleBatchAddToAlbum = async (albumId: string) => {
    const ids = Array.from(selectedIds);
    if (ids.length === 0 || !albumId) return;
    try {
      await ApiClient.addMediaToAlbum(albumId, ids);
      toast.success(`Aggiunti ${ids.length} elementi all'album!`);
      setSelectedIds(new Set());
      setIsSelectionMode(false);
    } catch (err) {
      toast.error((err as Error).message);
    }
  };

  const handleBatchAddToTag = async (tagId: string) => {
    const ids = Array.from(selectedIds);
    if (ids.length === 0 || !tagId) return;
    try {
      await ApiClient.addMediaToTag(tagId, ids);
      toast.success(`Aggiunto il tag a ${ids.length} elementi!`);
      setSelectedIds(new Set());
      setIsSelectionMode(false);
    } catch (err) {
      toast.error((err as Error).message);
    }
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

  const renderMediaCard = (media: any) => {
    const fileExt = media.primary_extension || (media.primary_filename ? media.primary_filename.split('.').pop() || '' : '');
    const isRaw = fileExt ? isRawExtension(fileExt) : false;
    const isSelected = selectedIds.has(media.id);
    const isHoveredLive = hoveredLiveMediaId === media.id;
    const liveVideoId = media.is_live_photo && media.live_video_media_id ? media.live_video_media_id : null;

    return (
    <div
      key={media.id}
      onClick={(e) => {
        if (isSelectionMode) {
          handleToggleSelect(e, media.id);
        } else {
          setSelectedMediaId(media.id);
        }
      }}
      onMouseEnter={() => {
        if (media.is_live_photo && liveVideoId) {
          setHoveredLiveMediaId(media.id);
        }
      }}
      onMouseLeave={() => {
        if (hoveredLiveMediaId === media.id) {
          setHoveredLiveMediaId(null);
        }
      }}
      style={{
        background: '#1e293b',
        border: isSelected
          ? '2px solid #38bdf8'
          : (media.protection_status === 'intra_source_duplicate'
              ? '1px solid #f59e0b'
              : (media.protection_status === 'protected'
                  ? '1px solid rgba(34, 197, 94, 0.4)'
                  : '1px solid #334155')),
        borderRadius: '10px',
        overflow: 'hidden',
        cursor: 'pointer',
        display: 'flex',
        flexDirection: 'column',
        position: 'relative',
        transition: 'transform 0.15s ease, border-color 0.15s ease'
      }}
    >
      {/* Thumbnail / Video Container */}
      <div className="media-card-thumb" style={{
        height: '170px',
        background: '#090d16',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        position: 'relative',
        overflow: 'hidden'
      }}>
        {isHoveredLive && liveVideoId ? (
          <video
            autoPlay
            loop
            muted
            playsInline
            src={ApiClient.getMediaStreamUrl(liveVideoId)}
            style={{
              width: '100%',
              height: '100%',
              objectFit: 'cover'
            }}
          />
        ) : media.has_thumbnail ? (
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

        {/* Selection Checkbox */}
        {(isSelectionMode || isSelected) && (
          <div
            onClick={(e) => handleToggleSelect(e, media.id)}
            style={{
              position: 'absolute',
              top: '8px',
              left: '8px',
              background: isSelected ? '#0284c7' : 'rgba(15, 23, 42, 0.7)',
              borderRadius: '6px',
              padding: '4px',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              color: 'white',
              cursor: 'pointer',
              zIndex: 10
            }}
          >
            {isSelected ? <CheckSquare size={16} /> : <Square size={16} />}
          </div>
        )}

        {/* Favorite Heart Button */}
        <button
          onClick={(e) => handleToggleFavorite(e, media.id)}
          style={{
            position: 'absolute',
            top: '8px',
            right: '8px',
            background: media.is_favorite ? 'rgba(244, 63, 94, 0.9)' : 'rgba(15, 23, 42, 0.6)',
            border: 'none',
            borderRadius: '50%',
            width: '28px',
            height: '28px',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            color: 'white',
            cursor: 'pointer',
            zIndex: 10,
            transition: 'background 0.15s ease'
          }}
        >
          <Heart size={14} fill={media.is_favorite ? 'white' : 'none'} color="white" />
        </button>

        {/* Live Photo badge */}
        {media.is_live_photo && (
          <span style={{
            position: 'absolute',
            bottom: '8px',
            right: '8px',
            background: isHoveredLive ? '#22c55e' : 'rgba(236, 72, 153, 0.9)',
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
            {isHoveredLive ? <Play size={10} fill="white" /> : null}
            LIVE
          </span>
        )}

        {/* RAW badge */}
        {isRaw && (
          <span style={{
            position: 'absolute',
            bottom: '8px',
            left: '8px',
            background: '#f59e0b',
            color: '#0f172a',
            fontSize: '10px',
            fontWeight: 800,
            padding: '2px 6px',
            borderRadius: '4px',
            display: 'flex',
            alignItems: 'center',
            gap: '3px',
            boxShadow: '0 2px 4px rgba(0,0,0,0.5)',
            letterSpacing: '0.5px'
          }}>
            RAW · {fileExt.toUpperCase()}
          </span>
        )}

        {/* Protection / Multiple copies badge */}
        {media.protection_status === 'protected' ? (
          <span style={{
            position: 'absolute',
            top: '8px',
            right: '42px',
            background: '#22c55e',
            color: '#064e3b',
            fontSize: '10px',
            fontWeight: 800,
            padding: '2px 7px',
            borderRadius: '4px',
            display: 'flex',
            alignItems: 'center',
            gap: '4px',
            boxShadow: '0 2px 4px rgba(0,0,0,0.5)'
          }}>
            🛡️ {media.distinct_sources_count || 2} DISCHI
          </span>
        ) : media.protection_status === 'intra_source_duplicate' ? (
          <span style={{
            position: 'absolute',
            top: '8px',
            right: '42px',
            background: '#f59e0b',
            color: '#0f172a',
            fontSize: '10px',
            fontWeight: 800,
            padding: '2px 7px',
            borderRadius: '4px',
            display: 'flex',
            alignItems: 'center',
            gap: '4px',
            boxShadow: '0 2px 4px rgba(0,0,0,0.5)'
          }}>
            <Copy size={11} />
            ⚠️ {media.copies_count} COPIE · {media.distinct_sources_count || 1} {(media.distinct_sources_count || 1) === 1 ? 'DISCO' : 'DISCHI'}
          </span>
        ) : (!media.protection_status && media.copies_count > 1) ? (
          <span style={{
            position: 'absolute',
            top: '8px',
            right: '42px',
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
        ) : null}
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

        {media.place_name && (
          <div style={{
            fontSize: '11px',
            color: '#38bdf8',
            whiteSpace: 'nowrap',
            overflow: 'hidden',
            textOverflow: 'ellipsis'
          }}>
            📍 {media.place_name}
          </div>
        )}

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
  };

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '20px' }}>
      {/* Active Geo Filter Pill if coming from Map */}
      {geoFilter && (
        <div style={{
          background: 'rgba(2, 132, 199, 0.15)',
          border: '1px solid #0284c7',
          borderRadius: '8px',
          padding: '10px 16px',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          color: '#38bdf8',
          fontSize: '13px'
        }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
            <span>📍 Filtrato per posizione: <strong>{geoFilter.label || 'Area Geografica Selezionata sulla Mappa'}</strong></span>
          </div>
          <button
            onClick={() => {
              setGeoFilter(null);
              if (onClearGeoFilter) onClearGeoFilter();
              handleFilterChange();
            }}
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
            Rimuovi Filtro Mappa
          </button>
        </div>
      )}

      {/* Active Album Filter Pill */}
      {selectedAlbum && (
        <div style={{
          background: 'rgba(56, 189, 248, 0.15)',
          border: '1px solid #38bdf8',
          borderRadius: '8px',
          padding: '10px 16px',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          color: '#38bdf8',
          fontSize: '13px'
        }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
            <Folder size={16} />
            <span>Filtrato per album: <strong>{albums.find((a) => a.id === selectedAlbum)?.name || selectedAlbum}</strong></span>
          </div>
          <button
            onClick={() => {
              setSelectedAlbum('');
              onClearAlbumFilter?.();
              handleFilterChange();
            }}
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
            Rimuovi Filtro Album
          </button>
        </div>
      )}

      {/* Active Tag Filter Pill */}
      {selectedTag && (
        <div style={{
          background: 'rgba(236, 72, 153, 0.15)',
          border: '1px solid #ec4899',
          borderRadius: '8px',
          padding: '10px 16px',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          color: '#ec4899',
          fontSize: '13px'
        }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
            <TagIcon size={16} />
            <span>Filtrato per tag: <strong>{tags.find((t) => t.id === selectedTag)?.name || selectedTag}</strong></span>
          </div>
          <button
            onClick={() => {
              setSelectedTag('');
              onClearTagFilter?.();
              handleFilterChange();
            }}
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
            Rimuovi Filtro Tag
          </button>
        </div>
      )}
      <div className="filter-bar-container" style={{
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
        <div className="filter-search-box" style={{ position: 'relative', flex: '1 1 280px' }}>
          <Search size={16} color="#64748b" style={{ position: 'absolute', left: '12px', top: '11px' }} />
          <input
            type="text"
            placeholder="Cerca foto, fotocamera, modello, lente, tag, cartella o anno..."
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
          {search && (
            <button
              onClick={() => { setSearch(''); handleFilterChange(); }}
              style={{
                position: 'absolute',
                right: '10px',
                top: '8px',
                background: 'transparent',
                border: 'none',
                color: '#94a3b8',
                cursor: 'pointer',
                fontSize: '14px'
              }}
            >
              ✕
            </button>
          )}
        </div>

        {/* Filter controls */}
        <div className="filter-controls-row" style={{ display: 'flex', flexWrap: 'wrap', alignItems: 'center', gap: '10px' }}>
          {/* Multi-Selection Mode Toggle */}
          <button
            onClick={() => {
              setIsSelectionMode(!isSelectionMode);
              if (isSelectionMode) setSelectedIds(new Set());
            }}
            style={{
              padding: '6px 12px',
              borderRadius: '8px',
              border: isSelectionMode ? '1px solid #38bdf8' : '1px solid #334155',
              background: isSelectionMode ? 'rgba(56, 189, 248, 0.2)' : '#0f172a',
              color: isSelectionMode ? '#38bdf8' : '#94a3b8',
              fontSize: '12px',
              fontWeight: 600,
              display: 'flex',
              alignItems: 'center',
              gap: '6px',
              cursor: 'pointer'
            }}
          >
            <CheckSquare size={14} /> {isSelectionMode ? 'Fine Selezione' : 'Seleziona'}
          </button>

          {/* Favorites Filter Button */}
          <button
            onClick={() => {
              setOnlyFavorites(!onlyFavorites);
              handleFilterChange();
            }}
            style={{
              padding: '6px 12px',
              borderRadius: '8px',
              border: onlyFavorites ? '1px solid #f43f5e' : '1px solid #334155',
              background: onlyFavorites ? 'rgba(244, 63, 94, 0.2)' : '#0f172a',
              color: onlyFavorites ? '#f43f5e' : '#94a3b8',
              fontSize: '12px',
              fontWeight: 600,
              display: 'flex',
              alignItems: 'center',
              gap: '6px',
              cursor: 'pointer'
            }}
          >
            <Heart size={14} fill={onlyFavorites ? '#f43f5e' : 'none'} color={onlyFavorites ? '#f43f5e' : 'currentColor'} />
            Preferiti
          </button>

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
            <button
              onClick={() => { setMediaType('raw'); handleFilterChange(); }}
              style={{
                padding: '6px 10px',
                borderRadius: '6px',
                border: 'none',
                background: mediaType === 'raw' ? '#f59e0b' : 'transparent',
                color: mediaType === 'raw' ? '#0f172a' : '#94a3b8',
                fontSize: '12px',
                fontWeight: 700,
                display: 'flex',
                alignItems: 'center',
                gap: '4px'
              }}
            >
              Solo RAW
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

          {/* Protection / Backup status filter dropdown */}
          <select
            value={protectionStatus}
            onChange={(e) => { setProtectionStatus(e.target.value); handleFilterChange(); }}
            style={{
              background: '#0f172a',
              color: 'white',
              border: '1px solid #334155',
              borderRadius: '8px',
              padding: '7px 10px',
              fontSize: '12px'
            }}
          >
            <option value="">🛡️ Tutti gli stati backup</option>
            <option value="protected">🟢 Protetti (2+ Dischi)</option>
            <option value="unprotected">🔴 A Rischio (1 Solo Disco)</option>
            <option value="intra_source_duplicate">🟠 Duplicati Intra-Disco (Spreco)</option>
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

      {/* Floating Batch Action Bar */}
      {selectedIds.size > 0 && (
        <div className="floating-batch-bar" style={{
          position: 'sticky',
          top: '16px',
          zIndex: 90,
          background: '#0f172a',
          border: '1px solid #0284c7',
          borderRadius: '12px',
          padding: '12px 20px',
          display: 'flex',
          flexWrap: 'wrap',
          alignItems: 'center',
          justifyContent: 'space-between',
          gap: '12px',
          boxShadow: '0 10px 25px rgba(0,0,0,0.5)'
        }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
            <span style={{ fontSize: '13px', fontWeight: 700, color: '#38bdf8' }}>
              ✓ {selectedIds.size} {selectedIds.size === 1 ? 'selezionato' : 'selezionati'}
            </span>
            <button
              onClick={handleSelectAll}
              style={{
                background: 'transparent',
                border: '1px solid #334155',
                color: '#94a3b8',
                borderRadius: '6px',
                padding: '4px 8px',
                fontSize: '11px',
                cursor: 'pointer'
              }}
            >
              {selectedIds.size === mediaList.length ? 'Deseleziona tutti' : 'Seleziona tutti'}
            </button>
          </div>

          <div style={{ display: 'flex', flexWrap: 'wrap', alignItems: 'center', gap: '8px' }}>
            {/* Batch Favorite */}
            <button
              onClick={() => handleBatchFavorite(true)}
              style={{
                background: 'rgba(244, 63, 94, 0.2)',
                border: '1px solid #f43f5e',
                color: '#f43f5e',
                borderRadius: '6px',
                padding: '6px 12px',
                fontSize: '12px',
                fontWeight: 600,
                display: 'flex',
                alignItems: 'center',
                gap: '6px',
                cursor: 'pointer'
              }}
            >
              <Heart size={14} fill="#f43f5e" /> Preferiti
            </button>

            {/* Batch Add Album */}
            <button
              onClick={async () => {
                const name = window.prompt("Nome del nuovo album virtuale:");
                if (!name || !name.trim()) return;
                try {
                  const created = await ApiClient.createAlbum(name.trim());
                  await ApiClient.addMediaToAlbum(created.id, Array.from(selectedIds));
                  const updatedAlbums = await ApiClient.getAlbums();
                  setAlbums(updatedAlbums);
                  toast.success(`Album "${created.name}" creato con ${selectedIds.size} foto!`);
                  setSelectedIds(new Set());
                } catch (err) {
                  toast.error((err as Error).message);
                }
              }}
              style={{
                background: '#0284c7',
                border: 'none',
                color: 'white',
                borderRadius: '6px',
                padding: '6px 12px',
                fontSize: '12px',
                fontWeight: 600,
                display: 'flex',
                alignItems: 'center',
                gap: '6px',
                cursor: 'pointer'
              }}
            >
              <Folder size={14} /> + Crea Album
            </button>

            {albums.length > 0 && (
              <select
                onChange={(e) => {
                  if (e.target.value) handleBatchAddToAlbum(e.target.value);
                  e.target.value = '';
                }}
                defaultValue=""
                style={{
                  background: '#1e293b',
                  color: 'white',
                  border: '1px solid #334155',
                  borderRadius: '6px',
                  padding: '6px 10px',
                  fontSize: '12px',
                  cursor: 'pointer'
                }}
              >
                <option value="" disabled>+ Aggiungi ad Album</option>
                {albums.map((a) => (
                  <option key={a.id} value={a.id}>{a.name}</option>
                ))}
              </select>
            )}

            {/* Batch Add Tag */}
            {tags.length > 0 && (
              <select
                onChange={(e) => {
                  if (e.target.value) handleBatchAddToTag(e.target.value);
                  e.target.value = '';
                }}
                defaultValue=""
                style={{
                  background: '#1e293b',
                  color: 'white',
                  border: '1px solid #334155',
                  borderRadius: '6px',
                  padding: '6px 10px',
                  fontSize: '12px',
                  cursor: 'pointer'
                }}
              >
                <option value="" disabled>+ Aggiungi Tag</option>
                {tags.map((t) => (
                  <option key={t.id} value={t.id}>#{t.name}</option>
                ))}
              </select>
            )}

            <button
              onClick={() => setSelectedIds(new Set())}
              style={{
                background: '#334155',
                color: 'white',
                border: 'none',
                borderRadius: '6px',
                padding: '6px 12px',
                fontSize: '12px',
                cursor: 'pointer'
              }}
            >
              Annulla
            </button>
          </div>
        </div>
      )}

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

      {/* Discretionary Total Count Banner */}
      {totalCount !== null && totalCount > 0 && (
        <div style={{ fontSize: '12px', color: '#94a3b8', display: 'flex', justifyContent: 'space-between', alignItems: 'center', margin: '-4px 0 -4px 0' }}>
          <span>Visualizzati <strong>{mediaList.length}</strong> di <strong>{totalCount}</strong> elementi</span>
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
              <div className="media-grid-container" style={{
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
        <div className="media-grid-container" style={{
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
      {(() => {
        const currentIdx = mediaList.findIndex((m) => m.id === selectedMediaId);
        const hasPrev = currentIdx > 0;
        const hasNext = currentIdx >= 0 && currentIdx < mediaList.length - 1;
        return (
          <MediaDetailModal
            mediaId={selectedMediaId}
            onClose={() => setSelectedMediaId(null)}
            hasPrev={hasPrev}
            hasNext={hasNext}
            onPrev={() => hasPrev && setSelectedMediaId(mediaList[currentIdx - 1].id)}
            onNext={() => hasNext && setSelectedMediaId(mediaList[currentIdx + 1].id)}
            onFavoriteChanged={(id, isFav) => {
              setMediaList((prev) => prev.map((m) => m.id === id ? { ...m, is_favorite: isFav } : m));
            }}
          />
        );
      })()}
    </div>
  );
};
