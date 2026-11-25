import React, { useEffect, useState, useMemo } from 'react';
import { ApiClient } from '../../services/api';
import { useToast } from '../../context/ToastContext';
import {
  Search,
  ArrowUpDown,
  Image,
  Video,
  FolderOpen,
  Calendar,
  Grid as GridIcon,
  Heart,
  CheckSquare,
  Square,
  Folder,
  Tag as TagIcon,
  ShieldCheck,
  MapPin,
  X,
  Check,
  Eye,
  RefreshCw,
  Trash2,
  AlertTriangle
} from 'lucide-react';
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
  const [verifying, setVerifying] = useState<boolean>(false);
  const [purgingMissing, setPurgingMissing] = useState<boolean>(false);
  const [missingSummary, setMissingSummary] = useState<{ total_missing_files: number; orphan_media_count: number } | null>(null);
  const [reloadTick, setReloadTick] = useState<number>(0);
  const [hoveredLiveMediaId, setHoveredLiveMediaId] = useState<string | null>(null);

  // Context Menu state
  const [contextMenu, setContextMenu] = useState<{
    x: number;
    y: number;
    media: any;
  } | null>(null);

  // Marquee drag-selection state
  const marqueeRef = React.useRef<{
    startX: number;
    startY: number;
    startScrollTop: number;
    startScrollLeft: number;
    isSelecting: boolean;
    initialSelected: Set<string>;
    isCardClick: boolean;
  } | null>(null);
  const [marqueeBox, setMarqueeBox] = useState<{
    left: number;
    top: number;
    width: number;
    height: number;
  } | null>(null);
  const hasDraggedRef = React.useRef<boolean>(false);
  const gridContainerRef = React.useRef<HTMLDivElement>(null);

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
  }, [mediaType, selectedSource, debouncedSearch, selectedAlbum, selectedTag, selectedMonthKey, onlyFavorites, protectionStatus, geoFilter, sortBy, offset, limit, reloadTick]);

  const handleFilterChange = () => {
    setOffset(0);
  };

  const handleToggleFavorite = async (e: React.MouseEvent, id: string) => {
    e.stopPropagation();
    try {
      const res = await ApiClient.toggleFavorite(id);
      setMediaList((prev) => prev.map((m) => m.id === id ? { ...m, is_favorite: res.is_favorite } : m));
      toast.success(res.is_favorite ? 'Aggiunto ai preferiti' : 'Rimosso dai preferiti');
    } catch (err) {
      toast.error((err as Error).message);
    }
  };

  const handleBatchTrash = async () => {
    const ids = Array.from(selectedIds);
    if (ids.length === 0) return;
    if (!window.confirm(`Spostare ${ids.length} elementi nel cestino (.pmm_trash) sui dischi collegati? Potrai ripristinarli o svuotarli definitivamente nella sezione Duplicati -> Cestino.`)) {
      return;
    }
    try {
      const res = await ApiClient.batchTrashMedia(ids, selectedSource || undefined);
      if (res.trashed_files_count > 0) {
        toast.success(`Spostati ${res.trashed_files_count} file nel cestino .pmm_trash`);
        setSelectedIds(new Set());
        setOffset(0);
        setReloadTick((t) => t + 1);
      } else if (res.errors && res.errors.length > 0) {
        toast.error(res.errors[0].error || 'Impossibile cestinare i file selezionati');
      } else {
        toast.error('Nessun file attivo online trovato per la selezione.');
      }
    } catch (err) {
      toast.error((err as Error).message || 'Errore durante lo spostamento nel cestino');
    }
  };

  const handleVerifySources = async () => {
    try {
      setVerifying(true);
      const res = await ApiClient.verifySources(selectedSource || undefined);
      setMissingSummary({ total_missing_files: res.total_missing_files, orphan_media_count: res.orphan_media_count });
      if (res.newly_missing > 0 || res.restored_available > 0) {
        toast.info(`Verifica completata: ${res.newly_missing} eliminati rilevati, ${res.restored_available} ripristinati.`);
        setOffset(0);
        setReloadTick((t) => t + 1);
      } else {
        toast.success(`Verifica completata (${res.checked_files} file controllati): nessuna modifica esterna rilevata.`);
      }
    } catch (err) {
      toast.error((err as Error).message || 'Errore durante la verifica');
    } finally {
      setVerifying(false);
    }
  };

  const handlePurgeMissing = async () => {
    if (!window.confirm('Eliminare definitivamente dal catalogo i riferimenti ai file non più presenti su disco (e le relative miniature orfane)?')) {
      return;
    }
    try {
      setPurgingMissing(true);
      const res = await ApiClient.purgeMissingRecords({ source_id: selectedSource || undefined });
      toast.success(`Pulizia completata: rimossi ${res.purged_files_count} riferimenti e ${res.purged_orphan_media_count} media orfani.`);
      setMissingSummary(null);
      setOffset(0);
      setReloadTick((t) => t + 1);
    } catch (err) {
      toast.error((err as Error).message || 'Errore durante la pulizia');
    } finally {
      setPurgingMissing(false);
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

  const handleCardContextMenu = (e: React.MouseEvent, media: any) => {
    e.preventDefault();
    e.stopPropagation();
    if (!selectedIds.has(media.id)) {
      setSelectedIds(new Set([media.id]));
    }
    const menuWidth = 220;
    const menuHeight = 260;
    const x = Math.min(e.clientX, window.innerWidth - menuWidth - 16);
    const y = Math.min(e.clientY, window.innerHeight - menuHeight - 16);
    setContextMenu({ x, y, media });
  };

  // Close context menu on outside clicks / scroll / Escape
  useEffect(() => {
    if (!contextMenu) return;
    const handleClose = () => setContextMenu(null);
    window.addEventListener('click', handleClose);
    window.addEventListener('scroll', handleClose, true);
    const handleKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') setContextMenu(null);
    };
    window.addEventListener('keydown', handleKey);
    return () => {
      window.removeEventListener('click', handleClose);
      window.removeEventListener('scroll', handleClose, true);
      window.removeEventListener('keydown', handleKey);
    };
  }, [contextMenu]);

  // Global Marquee drag-selection (works from main padding, above cards, between cards, and across cards)
  useEffect(() => {
    const handleGlobalMouseDown = (e: MouseEvent) => {
      if (e.button !== 0) return;
      if (selectedMediaId !== null) return;

      const target = e.target as HTMLElement;
      if (!target) return;

      // Exclude interactive widgets and navigation
      const isExcluded = Boolean(
        target.closest(
          'aside, .sidebar-desktop, .sidebar-open, ' +
          'header, .topbar-container, ' +
          '.modal-overlay, .modal-card, ' +
          'button, input, select, textarea, a, ' +
          '.media-card-checkbox, .media-card-favorite, ' +
          '.floating-batch-bar, .context-menu-popup, ' +
          '.filter-bar-container, .timeline-quick-jump'
        )
      );
      if (isExcluded) return;

      // Ensure click is within main content area
      const mainEl = target.closest('.main-content-layout') as HTMLElement | null;
      if (!mainEl) return;

      hasDraggedRef.current = false;
      const isModifier = e.shiftKey || e.metaKey || e.ctrlKey;
      const isCard = Boolean(target.closest('[data-media-id]'));

      marqueeRef.current = {
        startX: e.clientX,
        startY: e.clientY,
        startScrollTop: mainEl.scrollTop,
        startScrollLeft: mainEl.scrollLeft,
        isSelecting: false,
        initialSelected: isModifier ? new Set(selectedIds) : new Set(),
        isCardClick: isCard
      };
    };

    const handleMouseMove = (e: MouseEvent) => {
      if (!marqueeRef.current) return;
      const { startX, startY, startScrollTop, startScrollLeft, isSelecting, initialSelected } = marqueeRef.current;
      const dist = Math.hypot(e.clientX - startX, e.clientY - startY);

      if (!isSelecting && dist < 6) {
        return;
      }

      e.preventDefault();
      marqueeRef.current.isSelecting = true;
      hasDraggedRef.current = true;

      const mainEl = document.querySelector('.main-content-layout') as HTMLElement | null;
      const scrollDeltaY = mainEl ? mainEl.scrollTop - startScrollTop : 0;
      const scrollDeltaX = mainEl ? mainEl.scrollLeft - startScrollLeft : 0;
      const anchorX = startX - scrollDeltaX;
      const anchorY = startY - scrollDeltaY;

      const boxLeft = Math.min(anchorX, e.clientX);
      const boxTop = Math.min(anchorY, e.clientY);
      const boxRight = Math.max(anchorX, e.clientX);
      const boxBottom = Math.max(anchorY, e.clientY);

      setMarqueeBox({
        left: boxLeft,
        top: boxTop,
        width: boxRight - boxLeft,
        height: boxBottom - boxTop
      });

      const cards = document.querySelectorAll('[data-media-id]');
      const currentSelection = new Set(initialSelected);

      cards.forEach((card) => {
        const id = card.getAttribute('data-media-id');
        if (!id) return;
        const rect = card.getBoundingClientRect();
        const intersects = !(
          rect.right < boxLeft ||
          rect.left > boxRight ||
          rect.bottom < boxTop ||
          rect.top > boxBottom
        );
        if (intersects) {
          currentSelection.add(id);
        }
      });

      setSelectedIds(currentSelection);
    };

    const handleMouseUp = () => {
      if (marqueeRef.current) {
        if (marqueeRef.current.isSelecting) {
          hasDraggedRef.current = true;
          setTimeout(() => {
            hasDraggedRef.current = false;
          }, 100);
        } else if (!marqueeRef.current.isCardClick) {
          // Deselect on simple background click when no modifier was held
          if (marqueeRef.current.initialSelected.size === 0) {
            setSelectedIds(new Set());
          }
        }
      }
      marqueeRef.current = null;
      setMarqueeBox(null);
    };

    const handleDragStart = (e: DragEvent) => {
      if (marqueeRef.current?.isSelecting) {
        e.preventDefault();
      }
    };

    window.addEventListener('mousedown', handleGlobalMouseDown);
    window.addEventListener('mousemove', handleMouseMove, { passive: false });
    window.addEventListener('mouseup', handleMouseUp);
    window.addEventListener('dragstart', handleDragStart);

    return () => {
      window.removeEventListener('mousedown', handleGlobalMouseDown);
      window.removeEventListener('mousemove', handleMouseMove);
      window.removeEventListener('mouseup', handleMouseUp);
      window.removeEventListener('dragstart', handleDragStart);
    };
  }, [selectedMediaId, selectedIds]);

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
    const isSelected = selectedIds.has(media.id);
    const isHoveredLive = hoveredLiveMediaId === media.id;
    const liveVideoId = media.is_live_photo && media.live_video_media_id ? media.live_video_media_id : null;

    return (
    <div
      key={media.id}
      data-media-id={media.id}
      draggable={false}
      onClick={(e) => {
        if (hasDraggedRef.current || marqueeRef.current?.isSelecting) return;
        if (e.shiftKey || e.metaKey || e.ctrlKey || isSelectionMode) {
          handleToggleSelect(e, media.id);
        } else {
          setSelectedMediaId(media.id);
        }
      }}
      onContextMenu={(e) => handleCardContextMenu(e, media)}
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
        boxShadow: isSelected ? '0 0 0 2px rgba(56, 189, 248, 0.3)' : 'none',
        borderRadius: '10px',
        overflow: 'hidden',
        cursor: 'pointer',
        display: 'flex',
        flexDirection: 'column',
        position: 'relative',
        transition: 'transform 0.15s ease, border-color 0.15s ease',
        userSelect: 'none'
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
        overflow: 'hidden',
        userSelect: 'none'
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
            draggable={false}
            onDragStart={(e) => e.preventDefault()}
            style={{
              width: '100%',
              height: '100%',
              objectFit: 'cover',
              userSelect: 'none',
              pointerEvents: 'none'
            }}
          />
        ) : (
          <div style={{ color: '#475569', display: 'flex', flexDirection: 'column', alignItems: 'center', gap: '4px' }}>
            {media.media_type === 'video' ? <Video size={36} /> : <Image size={36} />}
          </div>
        )}

        {/* Selection Flag / Checkbox in Top-Left */}
        <div
          onClick={(e) => handleToggleSelect(e, media.id)}
          className="media-card-checkbox"
          style={{
            position: 'absolute',
            top: '8px',
            left: '8px',
            background: isSelected ? '#0284c7' : 'rgba(15, 23, 42, 0.75)',
            border: isSelected ? '1px solid #38bdf8' : '1px solid rgba(255, 255, 255, 0.35)',
            borderRadius: '6px',
            width: '24px',
            height: '24px',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            color: 'white',
            cursor: 'pointer',
            zIndex: 10,
            opacity: isSelected || isSelectionMode ? 1 : 0.65,
            transition: 'all 0.15s ease'
          }}
          title={isSelected ? "Deseleziona" : "Seleziona"}
        >
          {isSelected ? <CheckSquare size={16} /> : <Square size={16} />}
        </div>

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
          title={media.is_favorite ? 'Rimuovi dai Preferiti' : 'Aggiungi ai Preferiti'}
        >
          <Heart size={14} fill={media.is_favorite ? 'white' : 'none'} color="white" />
        </button>
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
            textOverflow: 'ellipsis',
            display: 'flex',
            alignItems: 'center',
            gap: '3px'
          }}>
            <MapPin size={11} style={{ flexShrink: 0 }} />
            <span>{media.place_name}</span>
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
          <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
            {media.distinct_sources_count > 1 && (
              <span title={`Backup presente su ${media.distinct_sources_count} dischi`} style={{ color: '#22c55e', display: 'inline-flex', alignItems: 'center', gap: '2px', fontWeight: 600 }}>
                <ShieldCheck size={11} /> {media.distinct_sources_count}
              </span>
            )}
            <span>{formatBytes(media.primary_size_bytes)}</span>
          </div>
        </div>
      </div>
    </div>
    );
  };

  return (
    <div
      style={{
        display: 'flex',
        flexDirection: 'column',
        gap: '20px',
        minHeight: '100%',
        flex: 1,
        userSelect: marqueeBox ? 'none' : 'auto'
      }}
    >
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
            <MapPin size={15} style={{ flexShrink: 0 }} />
            <span>Filtrato per posizione: <strong>{geoFilter.label || 'Area Geografica Selezionata sulla Mappa'}</strong></span>
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
                display: 'flex',
                alignItems: 'center'
              }}
            >
              <X size={14} />
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
              <option value="">Tutti gli Album</option>
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
              <option value="">Tutti i Tag</option>
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
              color: protectionStatus === 'missing' ? '#f43f5e' : 'white',
              border: protectionStatus === 'missing' ? '1px solid #f43f5e' : '1px solid #334155',
              borderRadius: '8px',
              padding: '7px 10px',
              fontSize: '12px'
            }}
          >
            <option value="">Tutti gli stati backup</option>
            <option value="protected">Protetti (2+ Dischi)</option>
            <option value="unprotected">A Rischio (1 Solo Disco)</option>
            <option value="intra_source_duplicate">Duplicati Intra-Disco (Spreco)</option>
            <option value="missing">Mancanti / Eliminati dal disco</option>
          </select>

          {/* Quick Verify button */}
          <button
            onClick={handleVerifySources}
            disabled={verifying}
            title="Verifica rapidamente (<1s) se i file sui dischi collegati sono stati eliminati dal Finder"
            style={{
              background: '#0f172a',
              border: '1px solid #334155',
              color: verifying ? '#38bdf8' : '#cbd5e1',
              borderRadius: '8px',
              padding: '7px 12px',
              fontSize: '12px',
              fontWeight: 600,
              display: 'flex',
              alignItems: 'center',
              gap: '6px',
              cursor: verifying ? 'wait' : 'pointer'
            }}
          >
            <RefreshCw size={13} className={verifying ? 'spin' : ''} />
            {verifying ? 'Verifica...' : 'Verifica Dischi'}
          </button>

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

      {/* Floating Batch Action Bar: Fixed overlay floating at bottom, ZERO layout shift */}
      {selectedIds.size > 0 && (
        <div className="floating-batch-bar" style={{
          position: 'fixed',
          bottom: '24px',
          left: '50%',
          transform: 'translateX(-50%)',
          zIndex: 900,
          background: 'rgba(15, 23, 42, 0.96)',
          backdropFilter: 'blur(12px)',
          border: '1px solid #0284c7',
          borderRadius: '16px',
          padding: '10px 20px',
          display: 'flex',
          flexWrap: 'wrap',
          alignItems: 'center',
          justifyContent: 'center',
          gap: '12px',
          boxShadow: '0 20px 40px rgba(0,0,0,0.7), 0 0 0 1px rgba(56, 189, 248, 0.25)',
          animation: 'slideUpBar 0.2s cubic-bezier(0.16, 1, 0.3, 1)'
        }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
            <span style={{ fontSize: '13px', fontWeight: 700, color: '#38bdf8', display: 'flex', alignItems: 'center', gap: '4px' }}>
              <Check size={14} />
              {selectedIds.size} {selectedIds.size === 1 ? 'selezionato' : 'selezionati'}
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
              onClick={handleBatchTrash}
              style={{
                background: 'rgba(244, 63, 94, 0.15)',
                border: '1px solid rgba(244, 63, 94, 0.5)',
                color: '#fda4af',
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
              <Trash2 size={14} /> Cestina (.pmm_trash)
            </button>

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

      {/* Missing / Orphan Files Banner */}
      {(protectionStatus === 'missing' || (missingSummary && missingSummary.orphan_media_count > 0)) && (
        <div style={{
          background: 'rgba(244, 63, 94, 0.12)',
          border: '1px solid rgba(244, 63, 94, 0.4)',
          borderRadius: '10px',
          padding: '12px 16px',
          display: 'flex',
          flexWrap: 'wrap',
          alignItems: 'center',
          justifyContent: 'space-between',
          gap: '12px'
        }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '10px', color: '#fda4af', fontSize: '13px' }}>
            <AlertTriangle size={18} color="#f43f5e" />
            <span>
              {protectionStatus === 'missing'
                ? 'Stai visualizzando i media non più presenti su nessun disco fisico.'
                : `Rilevati ${missingSummary?.orphan_media_count} media orfani (${missingSummary?.total_missing_files} file mancanti su disco).`}
            </span>
          </div>
          <div style={{ display: 'flex', gap: '8px', alignItems: 'center' }}>
            {protectionStatus !== 'missing' && (
              <button
                onClick={() => { setProtectionStatus('missing'); handleFilterChange(); }}
                style={{
                  background: '#1e293b',
                  border: '1px solid #475569',
                  color: '#f8fafc',
                  borderRadius: '6px',
                  padding: '6px 12px',
                  fontSize: '12px',
                  fontWeight: 600,
                  cursor: 'pointer'
                }}
              >
                Mostra Orfani
              </button>
            )}
            <button
              onClick={handlePurgeMissing}
              disabled={purgingMissing}
              style={{
                background: '#e11d48',
                border: 'none',
                color: 'white',
                borderRadius: '6px',
                padding: '6px 12px',
                fontSize: '12px',
                fontWeight: 600,
                cursor: purgingMissing ? 'wait' : 'pointer',
                display: 'flex',
                alignItems: 'center',
                gap: '6px'
              }}
            >
              <Trash2 size={14} />
              {purgingMissing ? 'Pulizia...' : 'Pulisci file mancanti dal catalogo'}
            </button>
          </div>
        </div>
      )}

      {/* Discretionary Total Count Banner */}
      {totalCount !== null && totalCount > 0 && (
        <div style={{ fontSize: '12px', color: '#94a3b8', display: 'flex', justifyContent: 'space-between', alignItems: 'center', margin: '-4px 0 -4px 0' }}>
          <span>Visualizzati <strong>{mediaList.length}</strong> di <strong>{totalCount}</strong> elementi</span>
        </div>
      )}

      {/* Main Content Area */}
      <div
        ref={gridContainerRef}
        style={{
          position: 'relative',
          flex: 1,
          minHeight: '400px',
          userSelect: marqueeBox ? 'none' : 'auto'
        }}
      >
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
      </div>

      {/* Marquee Rubber-Band Selection Rectangle */}
      {marqueeBox && (
        <div
          style={{
            position: 'fixed',
            left: marqueeBox.left,
            top: marqueeBox.top,
            width: marqueeBox.width,
            height: marqueeBox.height,
            background: 'rgba(56, 189, 248, 0.18)',
            border: '1.5px solid #38bdf8',
            borderRadius: '4px',
            pointerEvents: 'none',
            zIndex: 9999
          }}
        />
      )}

      {/* Right-Click Context Menu Popup */}
      {contextMenu && (
        <div
          className="context-menu-popup"
          style={{
            position: 'fixed',
            left: contextMenu.x,
            top: contextMenu.y,
            background: '#0f172a',
            border: '1px solid #334155',
            borderRadius: '10px',
            padding: '6px',
            boxShadow: '0 20px 35px -5px rgba(0, 0, 0, 0.7), 0 0 1px 1px rgba(255,255,255,0.05)',
            zIndex: 10000,
            minWidth: '220px',
            display: 'flex',
            flexDirection: 'column',
            gap: '2px',
            animation: 'fadeInMenu 0.12s ease-out'
          }}
          onClick={(e) => e.stopPropagation()}
        >
          <div style={{ padding: '6px 10px', fontSize: '11px', fontWeight: 600, color: '#64748b', borderBottom: '1px solid #1e293b', marginBottom: '4px' }}>
            {selectedIds.size > 1 ? `${selectedIds.size} elementi selezionati` : (contextMenu.media.primary_filename || 'Elemento')}
          </div>

          {/* Apri Dettaglio */}
          <button
            onClick={() => {
              setSelectedMediaId(contextMenu.media.id);
              setContextMenu(null);
            }}
            className="context-menu-item"
            style={{
              display: 'flex', alignItems: 'center', gap: '8px', padding: '8px 10px', background: 'transparent', border: 'none', color: '#f8fafc', fontSize: '12px', borderRadius: '6px', cursor: 'pointer', textAlign: 'left', width: '100%'
            }}
          >
            <Eye size={14} color="#38bdf8" /> Apri dettaglio
          </button>

          {/* Mostra nel Finder */}
          <button
            onClick={async () => {
              const mId = contextMenu.media.id;
              setContextMenu(null);
              try {
                await ApiClient.revealMedia(mId);
                toast.success('Aperto nel Finder');
              } catch (err) {
                toast.error((err as Error).message);
              }
            }}
            className="context-menu-item"
            style={{
              display: 'flex', alignItems: 'center', gap: '8px', padding: '8px 10px', background: 'transparent', border: 'none', color: '#f8fafc', fontSize: '12px', borderRadius: '6px', cursor: 'pointer', textAlign: 'left', width: '100%'
            }}
          >
            <FolderOpen size={14} color="#38bdf8" /> Mostra nel Finder
          </button>

          {/* Preferiti */}
          <button
            onClick={() => {
              const makeFav = !contextMenu.media.is_favorite;
              handleBatchFavorite(makeFav);
              setContextMenu(null);
            }}
            className="context-menu-item"
            style={{
              display: 'flex', alignItems: 'center', gap: '8px', padding: '8px 10px', background: 'transparent', border: 'none', color: '#f8fafc', fontSize: '12px', borderRadius: '6px', cursor: 'pointer', textAlign: 'left', width: '100%'
            }}
          >
            <Heart size={14} color="#f43f5e" fill={contextMenu.media.is_favorite ? '#f43f5e' : 'none'} />
            {contextMenu.media.is_favorite ? 'Rimuovi dai Preferiti' : 'Aggiungi ai Preferiti'}
          </button>

          <div style={{ height: '1px', background: '#1e293b', margin: '4px 0' }} />

          {/* Nuovo Album */}
          <button
            onClick={async () => {
              setContextMenu(null);
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
            className="context-menu-item"
            style={{
              display: 'flex', alignItems: 'center', gap: '8px', padding: '8px 10px', background: 'transparent', border: 'none', color: '#f8fafc', fontSize: '12px', borderRadius: '6px', cursor: 'pointer', textAlign: 'left', width: '100%'
            }}
          >
            <Folder size={14} color="#a855f7" /> + Crea Album con selezione...
          </button>

          {/* Sposta nel cestino */}
          <button
            onClick={() => {
              setContextMenu(null);
              handleBatchTrash();
            }}
            className="context-menu-item"
            style={{
              display: 'flex', alignItems: 'center', gap: '8px', padding: '8px 10px', background: 'transparent', border: 'none', color: '#fda4af', fontSize: '12px', borderRadius: '6px', cursor: 'pointer', textAlign: 'left', width: '100%'
            }}
          >
            <Trash2 size={14} color="#f43f5e" /> Sposta nel Cestino (.pmm_trash)
          </button>

          {/* Deseleziona */}
          {selectedIds.size > 0 && (
            <button
              onClick={() => {
                setSelectedIds(new Set());
                setContextMenu(null);
              }}
              className="context-menu-item"
              style={{
                display: 'flex', alignItems: 'center', gap: '8px', padding: '8px 10px', background: 'transparent', border: 'none', color: '#94a3b8', fontSize: '12px', borderRadius: '6px', cursor: 'pointer', textAlign: 'left', width: '100%', borderTop: '1px solid #1e293b', marginTop: '2px'
              }}
            >
              <X size={14} /> Deseleziona tutto
            </button>
          )}
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
