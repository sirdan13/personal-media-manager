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
  AlertTriangle,
  HardDrive,
  List as ListIcon,
  SlidersHorizontal,
  Columns,
  Camera
} from 'lucide-react';
import { MediaDetailModal } from './MediaDetailModal';

type ListColumnKey =
  | 'file'
  | 'extension'
  | 'captured_at'
  | 'size'
  | 'resolution'
  | 'backup_status'
  | 'sources'
  | 'relative_path'
  | 'camera_make'
  | 'camera_model'
  | 'lens_model'
  | 'exif_settings'
  | 'place_name'
  | 'gps_coords'
  | 'duration'
  | 'sha256';

const LIST_COLUMN_DEFS: Array<{ key: ListColumnKey; label: string; defaultVisible: boolean }> = [
  { key: 'file', label: 'Nome File', defaultVisible: true },
  { key: 'extension', label: 'Formato', defaultVisible: true },
  { key: 'captured_at', label: 'Data Scatto', defaultVisible: true },
  { key: 'size', label: 'Dimensione', defaultVisible: true },
  { key: 'resolution', label: 'Risoluzione', defaultVisible: true },
  { key: 'backup_status', label: 'Stato Backup', defaultVisible: true },
  { key: 'sources', label: 'Dischi', defaultVisible: true },
  { key: 'relative_path', label: 'Percorso su Disco', defaultVisible: true },
  { key: 'camera_make', label: 'Produttore', defaultVisible: false },
  { key: 'camera_model', label: 'Modello Fotocamera', defaultVisible: true },
  { key: 'lens_model', label: 'Obiettivo', defaultVisible: false },
  { key: 'exif_settings', label: 'Parametri Scatto (f/ · s · ISO)', defaultVisible: false },
  { key: 'place_name', label: 'Località GPS', defaultVisible: false },
  { key: 'gps_coords', label: 'Coordinate GPS', defaultVisible: false },
  { key: 'duration', label: 'Durata Video', defaultVisible: false },
  { key: 'sha256', label: 'Hash SHA-256', defaultVisible: false }
];

const DEFAULT_VISIBLE_COLUMNS: ListColumnKey[] = LIST_COLUMN_DEFS.filter((c) => c.defaultVisible).map((c) => c.key);

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
  const [viewMode, setViewMode] = useState<'grid' | 'timeline' | 'list'>(() => {
    const saved = localStorage.getItem('pmm_view_mode');
    return saved === 'timeline' || saved === 'list' ? saved : 'grid';
  });
  useEffect(() => {
    localStorage.setItem('pmm_view_mode', viewMode);
  }, [viewMode]);

  const [mediaList, setMediaList] = useState<any[]>([]);
  const [sources, setSources] = useState<any[]>([]);
  const [albums, setAlbums] = useState<any[]>([]);
  const [tags, setTags] = useState<any[]>([]);
  const [timelineBuckets, setTimelineBuckets] = useState<any[]>([]);

  const [selectedSource, setSelectedSource] = useState<string>('');
  const [selectedFolder, setSelectedFolder] = useState<string>('');
  const [sourceFolders, setSourceFolders] = useState<Array<{ folder: string; file_count: number }>>([]);
  const [selectedAlbum, setSelectedAlbum] = useState<string>('');
  const [selectedTag, setSelectedTag] = useState<string>('');
  const [selectedMonthKey, setSelectedMonthKey] = useState<string>('');
  const [onlyFavorites, setOnlyFavorites] = useState<boolean>(initialFavorite);
  const [mediaType, setMediaType] = useState<string>(initialType === 'all' ? '' : initialType);
  const [protectionStatus, setProtectionStatus] = useState<string>('');
  const [cameraMake, setCameraMake] = useState<string>('');
  const [cameraModel, setCameraModel] = useState<string>('');
  const [lensModel, setLensModel] = useState<string>('');
  const [extensionFilter, setExtensionFilter] = useState<string>('');
  const [dateFrom, setDateFrom] = useState<string>('');
  const [dateTo, setDateTo] = useState<string>('');
  const [hasGps, setHasGps] = useState<'' | 'yes' | 'no'>('');
  const [onlyLivePhotos, setOnlyLivePhotos] = useState<boolean>(false);
  const [showFiltersModal, setShowFiltersModal] = useState<boolean>(false);
  const [filterOptions, setFilterOptions] = useState<{
    makes: string[];
    models: Array<{ make: string; model: string }>;
    lenses: string[];
    extensions: string[];
  }>({ makes: [], models: [], lenses: [], extensions: [] });
  const [loadingFilterOptions, setLoadingFilterOptions] = useState<boolean>(false);

  const [visibleColumns, setVisibleColumns] = useState<ListColumnKey[]>(() => {
    try {
      const saved = localStorage.getItem('pmm_list_columns');
      if (saved) {
        const parsed = JSON.parse(saved);
        if (Array.isArray(parsed) && parsed.length > 0) return parsed;
      }
    } catch {
      // ignore
    }
    return DEFAULT_VISIBLE_COLUMNS;
  });
  const [showColumnsPopover, setShowColumnsPopover] = useState<boolean>(false);
  useEffect(() => {
    localStorage.setItem('pmm_list_columns', JSON.stringify(visibleColumns));
  }, [visibleColumns]);

  const toggleColumn = (key: ListColumnKey) => {
    setVisibleColumns((prev) =>
      prev.includes(key)
        ? (prev.length > 1 ? prev.filter((k) => k !== key) : prev)
        : [...prev, key]
    );
  };

  const [search, setSearch] = useState<string>('');
  const [debouncedSearch, setDebouncedSearch] = useState<string>('');
  const [totalCount, setTotalCount] = useState<number | null>(null);
  const [geoFilter, setGeoFilter] = useState<{ latMin: number; latMax: number; lonMin: number; lonMax: number; label?: string } | null>(initialGeoFilter);
  const [sortBy, setSortBy] = useState<string>('date_desc');
  const [offset, setOffset] = useState<number>(0);
  const effectiveLimit = viewMode === 'list' ? 200 : 60;
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
  const [gridSize, setGridSize] = useState<number>(() => {
    const saved = localStorage.getItem('pmm_grid_size');
    const parsed = saved ? parseInt(saved, 10) : 220;
    return isNaN(parsed) ? 220 : Math.min(320, Math.max(130, parsed));
  });

  useEffect(() => {
    localStorage.setItem('pmm_grid_size', String(gridSize));
  }, [gridSize]);

  // Grid keyboard shortcuts (Space = QuickLook, F = Favorite, Escape = Deselect)
  useEffect(() => {
    const handleGridKeyDown = (e: KeyboardEvent) => {
      if (selectedMediaId !== null) return;
      const target = e.target as HTMLElement;
      if (['INPUT', 'TEXTAREA', 'SELECT'].includes(target?.tagName)) return;

      if (e.key === ' ' && selectedIds.size > 0) {
        e.preventDefault();
        setSelectedMediaId(Array.from(selectedIds)[0]);
      } else if ((e.key === 'f' || e.key === 'F') && selectedIds.size > 0) {
        e.preventDefault();
        handleBatchFavorite(true);
      } else if (e.key === 'Escape' && selectedIds.size > 0) {
        setSelectedIds(new Set());
      }
    };
    window.addEventListener('keydown', handleGridKeyDown);
    return () => window.removeEventListener('keydown', handleGridKeyDown);
  }, [selectedMediaId, selectedIds]);
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

  // Load distinct EXIF/extension filter options lazily when Advanced Filters modal opens
  useEffect(() => {
    if (!showFiltersModal || !ApiClient.getToken()) return;
    if (filterOptions.makes.length > 0 || filterOptions.extensions.length > 0) return;
    setLoadingFilterOptions(true);
    ApiClient.getMediaFilterOptions()
      .then(setFilterOptions)
      .catch(() => {})
      .finally(() => setLoadingFilterOptions(false));
  }, [showFiltersModal]);

  // Debounce search input by 300ms
  useEffect(() => {
    const timer = setTimeout(() => {
      setDebouncedSearch(search);
      setOffset(0);
    }, 300);
    return () => clearTimeout(timer);
  }, [search]);

  // Load folders when a specific source is selected
  useEffect(() => {
    setSelectedFolder('');
    if (!selectedSource || !ApiClient.getToken()) {
      setSourceFolders([]);
      return;
    }
    ApiClient.getSourceFolders(selectedSource).then(setSourceFolders).catch(() => setSourceFolders([]));
  }, [selectedSource]);

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
          folder: selectedFolder || undefined,
          search: debouncedSearch.trim() || undefined,
          albumId: selectedAlbum || undefined,
          tagId: selectedTag || undefined,
          monthKey: selectedMonthKey || undefined,
          isFavorite: onlyFavorites ? true : undefined,
          protectionStatus: protectionStatus || undefined,
          cameraMake: cameraMake || undefined,
          cameraModel: cameraModel || undefined,
          lensModel: lensModel || undefined,
          extension: extensionFilter || undefined,
          dateFrom: dateFrom || undefined,
          dateTo: dateTo || undefined,
          hasGps: hasGps === 'yes' ? true : (hasGps === 'no' ? false : undefined),
          isLivePhoto: onlyLivePhotos ? true : undefined,
          latMin: geoFilter?.latMin,
          latMax: geoFilter?.latMax,
          lonMin: geoFilter?.lonMin,
          lonMax: geoFilter?.lonMax,
          sortBy,
          offset,
          limit: effectiveLimit
        }, controller.signal);

        setTotalCount(count);

        if (offset === 0) {
          setMediaList(items);
        } else {
          setMediaList((prev) => [...prev, ...items]);
        }
        setHasMore(items.length === effectiveLimit);
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
  }, [mediaType, selectedSource, selectedFolder, debouncedSearch, selectedAlbum, selectedTag, selectedMonthKey, onlyFavorites, protectionStatus, cameraMake, cameraModel, lensModel, extensionFilter, dateFrom, dateTo, hasGps, onlyLivePhotos, geoFilter, sortBy, offset, effectiveLimit, reloadTick]);

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

  const handleBatchBackupCopy = async (targetSourceId: string) => {
    const ids = Array.from(selectedIds);
    if (ids.length === 0 || !targetSourceId) return;
    const targetSrc = sources.find((s) => s.id === targetSourceId);
    if (!window.confirm(`Copiare ${ids.length} elementi selezionati sul disco "${targetSrc?.name || 'Destinazione'}" con verifica SHA-256?`)) {
      return;
    }
    try {
      const res = await ApiClient.backupCopyToSource(ids, targetSourceId);
      if (res.copied_count > 0) {
        toast.success(`Copiati e verificati ${res.copied_count} file su "${targetSrc?.name}"! (${res.skipped_count} già presenti)`);
        setSelectedIds(new Set());
        setOffset(0);
        setReloadTick((t) => t + 1);
      } else if (res.skipped_count > 0 && (!res.errors || res.errors.length === 0)) {
        toast.info(`Tutti i ${res.skipped_count} file selezionati sono già presenti su "${targetSrc?.name}".`);
      } else if (res.errors && res.errors.length > 0) {
        toast.error(res.errors[0].error || 'Errore durante la copia su disco');
      }
    } catch (err) {
      toast.error((err as Error).message || 'Errore durante la copia su disco');
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
        height: `${Math.round(gridSize * 0.78)}px`,
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

      {/* Media Details Footer (hidden in compact Apple Photos mode when gridSize < 160) */}
      {gridSize >= 160 && (
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
      )}
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

          {/* View Mode Toggle (Griglia vs Timeline vs Elenco) */}
          <div style={{ display: 'flex', background: '#0f172a', border: '1px solid #334155', borderRadius: '8px', padding: '2px' }}>
            <button
              onClick={() => { if (viewMode === 'list') setOffset(0); setViewMode('grid'); }}
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
              onClick={() => { if (viewMode === 'list') setOffset(0); setViewMode('timeline'); }}
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
            <button
              onClick={() => { if (viewMode !== 'list') setOffset(0); setViewMode('list'); }}
              title="Vista elenco ad alta densità (200 file per pagina, senza caricare miniature)"
              style={{
                padding: '6px 12px',
                borderRadius: '6px',
                border: 'none',
                background: viewMode === 'list' ? '#0284c7' : 'transparent',
                color: viewMode === 'list' ? 'white' : '#94a3b8',
                fontSize: '12px',
                fontWeight: 600,
                display: 'flex',
                alignItems: 'center',
                gap: '5px',
                cursor: 'pointer'
              }}
            >
              <ListIcon size={13} /> Elenco
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

          {/* Folder dropdown (when a Source is selected) */}
          {selectedSource && sourceFolders.length > 0 && (
            <select
              value={selectedFolder}
              onChange={(e) => { setSelectedFolder(e.target.value); handleFilterChange(); }}
              style={{
                background: '#0f172a',
                color: selectedFolder ? '#38bdf8' : 'white',
                border: selectedFolder ? '1px solid #38bdf8' : '1px solid #334155',
                borderRadius: '8px',
                padding: '7px 10px',
                fontSize: '12px',
                maxWidth: '220px'
              }}
            >
              <option value="">Tutte le Cartelle</option>
              {sourceFolders.map((f) => (
                <option key={f.folder} value={f.folder}>
                  📁 {f.folder} ({f.file_count})
                </option>
              ))}
            </select>
          )}

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

          {/* Grid Zoom Slider (only in grid/timeline modes) */}
          {viewMode !== 'list' ? (
          <div
            title={`Dimensione miniature: ${gridSize}px`}
            style={{
              display: 'flex',
              alignItems: 'center',
              gap: '6px',
              background: '#0f172a',
              border: '1px solid #334155',
              borderRadius: '8px',
              padding: '5px 10px'
            }}
          >
            <button
              type="button"
              onClick={() => setGridSize((s) => Math.max(130, s - 20))}
              style={{ background: 'transparent', border: 'none', color: '#94a3b8', cursor: 'pointer', fontSize: '13px', fontWeight: 700, padding: '0 2px' }}
              title="Rimpicciolisci miniature"
            >
              -
            </button>
            <input
              type="range"
              min={130}
              max={320}
              step={10}
              value={gridSize}
              onChange={(e) => setGridSize(Number(e.target.value))}
              style={{ width: '74px', accentColor: '#38bdf8', cursor: 'pointer' }}
            />
            <button
              type="button"
              onClick={() => setGridSize((s) => Math.min(320, s + 20))}
              style={{ background: 'transparent', border: 'none', color: '#94a3b8', cursor: 'pointer', fontSize: '13px', fontWeight: 700, padding: '0 2px' }}
              title="Ingrandisci miniature"
            >
              +
            </button>
          </div>
          ) : (
            /* Column Chooser Button + Popover in List Mode */
            <div style={{ position: 'relative' }}>
              <button
                type="button"
                onClick={() => setShowColumnsPopover((v) => !v)}
                style={{
                  background: showColumnsPopover ? 'rgba(56, 189, 248, 0.2)' : '#0f172a',
                  border: showColumnsPopover ? '1px solid #38bdf8' : '1px solid #334155',
                  color: showColumnsPopover ? '#38bdf8' : '#cbd5e1',
                  borderRadius: '8px',
                  padding: '7px 12px',
                  fontSize: '12px',
                  fontWeight: 600,
                  display: 'flex',
                  alignItems: 'center',
                  gap: '6px',
                  cursor: 'pointer'
                }}
              >
                <Columns size={13} /> Colonne ({visibleColumns.length})
              </button>

              {showColumnsPopover && (
                <div
                  style={{
                    position: 'absolute',
                    top: 'calc(100% + 8px)',
                    right: 0,
                    width: '280px',
                    background: '#0f172a',
                    border: '1px solid #334155',
                    borderRadius: '12px',
                    padding: '12px',
                    boxShadow: '0 20px 35px rgba(0,0,0,0.65)',
                    zIndex: 500,
                    display: 'flex',
                    flexDirection: 'column',
                    gap: '10px'
                  }}
                >
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                    <span style={{ fontSize: '12px', fontWeight: 700, color: '#f8fafc' }}>Colonne visibili</span>
                    <button
                      type="button"
                      onClick={() => setShowColumnsPopover(false)}
                      style={{ background: 'transparent', border: 'none', color: '#94a3b8', cursor: 'pointer', padding: '2px' }}
                    >
                      <X size={14} />
                    </button>
                  </div>

                  {/* Quick Presets */}
                  <div style={{ display: 'flex', flexWrap: 'wrap', gap: '4px' }}>
                    <button
                      type="button"
                      onClick={() => setVisibleColumns(DEFAULT_VISIBLE_COLUMNS)}
                      style={{ fontSize: '10px', padding: '3px 7px', borderRadius: '5px', background: '#1e293b', border: '1px solid #334155', color: '#cbd5e1', cursor: 'pointer' }}
                    >
                      Default
                    </button>
                    <button
                      type="button"
                      onClick={() => setVisibleColumns(['file', 'extension', 'captured_at', 'camera_make', 'camera_model', 'lens_model', 'exif_settings', 'resolution'])}
                      style={{ fontSize: '10px', padding: '3px 7px', borderRadius: '5px', background: '#1e293b', border: '1px solid #334155', color: '#38bdf8', cursor: 'pointer' }}
                    >
                      Fotografo (EXIF)
                    </button>
                    <button
                      type="button"
                      onClick={() => setVisibleColumns(['file', 'extension', 'size', 'backup_status', 'sources', 'relative_path', 'sha256'])}
                      style={{ fontSize: '10px', padding: '3px 7px', borderRadius: '5px', background: '#1e293b', border: '1px solid #334155', color: '#4ade80', cursor: 'pointer' }}
                    >
                      Gestione Dischi
                    </button>
                    <button
                      type="button"
                      onClick={() => setVisibleColumns(LIST_COLUMN_DEFS.map((c) => c.key))}
                      style={{ fontSize: '10px', padding: '3px 7px', borderRadius: '5px', background: '#1e293b', border: '1px solid #334155', color: '#f59e0b', cursor: 'pointer' }}
                    >
                      Tutte
                    </button>
                  </div>

                  <div style={{ maxHeight: '260px', overflowY: 'auto', display: 'flex', flexDirection: 'column', gap: '4px' }}>
                    {LIST_COLUMN_DEFS.map((col) => {
                      const checked = visibleColumns.includes(col.key);
                      return (
                        <label
                          key={col.key}
                          style={{
                            display: 'flex',
                            alignItems: 'center',
                            gap: '8px',
                            padding: '4px 6px',
                            borderRadius: '6px',
                            cursor: 'pointer',
                            fontSize: '12px',
                            color: checked ? '#f8fafc' : '#94a3b8',
                            background: checked ? 'rgba(56, 189, 248, 0.08)' : 'transparent'
                          }}
                        >
                          <input
                            type="checkbox"
                            checked={checked}
                            onChange={() => toggleColumn(col.key)}
                            style={{ accentColor: '#38bdf8' }}
                          />
                          <span>{col.label}</span>
                        </label>
                      );
                    })}
                  </div>
                </div>
              )}
            </div>
          )}

          {/* Advanced Filters Modal Button */}
          {(() => {
            const advCount = [cameraMake, cameraModel, lensModel, extensionFilter, dateFrom, dateTo, hasGps, onlyLivePhotos ? '1' : ''].filter(Boolean).length;
            return (
              <button
                type="button"
                onClick={() => setShowFiltersModal(true)}
                style={{
                  background: advCount > 0 ? 'rgba(168, 85, 247, 0.2)' : '#0f172a',
                  border: advCount > 0 ? '1px solid #a855f7' : '1px solid #334155',
                  color: advCount > 0 ? '#e9d5ff' : '#cbd5e1',
                  borderRadius: '8px',
                  padding: '7px 12px',
                  fontSize: '12px',
                  fontWeight: 600,
                  display: 'flex',
                  alignItems: 'center',
                  gap: '6px',
                  cursor: 'pointer'
                }}
              >
                <SlidersHorizontal size={13} color={advCount > 0 ? '#c084fc' : '#94a3b8'} />
                Filtri Avanzati
                {advCount > 0 && (
                  <span style={{
                    background: '#a855f7',
                    color: 'white',
                    borderRadius: '999px',
                    padding: '1px 6px',
                    fontSize: '10px',
                    fontWeight: 700
                  }}>
                    {advCount}
                  </span>
                )}
              </button>
            );
          })()}
        </div>
      </div>

      {/* Active Advanced Filter Chips */}
      {(cameraMake || cameraModel || lensModel || extensionFilter || dateFrom || dateTo || hasGps || onlyLivePhotos || selectedFolder) && (
        <div style={{ display: 'flex', flexWrap: 'wrap', gap: '8px', alignItems: 'center' }}>
          {cameraMake && (
            <span style={{ fontSize: '11px', background: 'rgba(168, 85, 247, 0.16)', border: '1px solid rgba(168, 85, 247, 0.45)', color: '#e9d5ff', padding: '4px 10px', borderRadius: '999px', display: 'inline-flex', alignItems: 'center', gap: '6px' }}>
              <Camera size={12} /> Produttore: <strong>{cameraMake}</strong>
              <button type="button" onClick={() => { setCameraMake(''); handleFilterChange(); }} style={{ background: 'transparent', border: 'none', color: '#e9d5ff', cursor: 'pointer', padding: 0, display: 'inline-flex' }}><X size={12} /></button>
            </span>
          )}
          {cameraModel && (
            <span style={{ fontSize: '11px', background: 'rgba(56, 189, 248, 0.16)', border: '1px solid rgba(56, 189, 248, 0.45)', color: '#bae6fd', padding: '4px 10px', borderRadius: '999px', display: 'inline-flex', alignItems: 'center', gap: '6px' }}>
              Modello: <strong>{cameraModel}</strong>
              <button type="button" onClick={() => { setCameraModel(''); handleFilterChange(); }} style={{ background: 'transparent', border: 'none', color: '#bae6fd', cursor: 'pointer', padding: 0, display: 'inline-flex' }}><X size={12} /></button>
            </span>
          )}
          {lensModel && (
            <span style={{ fontSize: '11px', background: 'rgba(56, 189, 248, 0.16)', border: '1px solid rgba(56, 189, 248, 0.45)', color: '#bae6fd', padding: '4px 10px', borderRadius: '999px', display: 'inline-flex', alignItems: 'center', gap: '6px' }}>
              Obiettivo: <strong>{lensModel}</strong>
              <button type="button" onClick={() => { setLensModel(''); handleFilterChange(); }} style={{ background: 'transparent', border: 'none', color: '#bae6fd', cursor: 'pointer', padding: 0, display: 'inline-flex' }}><X size={12} /></button>
            </span>
          )}
          {extensionFilter && (
            <span style={{ fontSize: '11px', background: 'rgba(245, 158, 11, 0.16)', border: '1px solid rgba(245, 158, 11, 0.45)', color: '#fde68a', padding: '4px 10px', borderRadius: '999px', display: 'inline-flex', alignItems: 'center', gap: '6px' }}>
              Formato: <strong>.{extensionFilter.toUpperCase()}</strong>
              <button type="button" onClick={() => { setExtensionFilter(''); handleFilterChange(); }} style={{ background: 'transparent', border: 'none', color: '#fde68a', cursor: 'pointer', padding: 0, display: 'inline-flex' }}><X size={12} /></button>
            </span>
          )}
          {selectedFolder && (
            <span style={{ fontSize: '11px', background: 'rgba(34, 197, 94, 0.16)', border: '1px solid rgba(34, 197, 94, 0.45)', color: '#bbf7d0', padding: '4px 10px', borderRadius: '999px', display: 'inline-flex', alignItems: 'center', gap: '6px' }}>
              Cartella: <strong>{selectedFolder}</strong>
              <button type="button" onClick={() => { setSelectedFolder(''); handleFilterChange(); }} style={{ background: 'transparent', border: 'none', color: '#bbf7d0', cursor: 'pointer', padding: 0, display: 'inline-flex' }}><X size={12} /></button>
            </span>
          )}
          {(dateFrom || dateTo) && (
            <span style={{ fontSize: '11px', background: 'rgba(56, 189, 248, 0.16)', border: '1px solid rgba(56, 189, 248, 0.45)', color: '#bae6fd', padding: '4px 10px', borderRadius: '999px', display: 'inline-flex', alignItems: 'center', gap: '6px' }}>
              Periodo: <strong>{dateFrom || '...'} → {dateTo || '...'}</strong>
              <button type="button" onClick={() => { setDateFrom(''); setDateTo(''); handleFilterChange(); }} style={{ background: 'transparent', border: 'none', color: '#bae6fd', cursor: 'pointer', padding: 0, display: 'inline-flex' }}><X size={12} /></button>
            </span>
          )}
          {hasGps && (
            <span style={{ fontSize: '11px', background: 'rgba(16, 185, 129, 0.16)', border: '1px solid rgba(16, 185, 129, 0.45)', color: '#a7f3d0', padding: '4px 10px', borderRadius: '999px', display: 'inline-flex', alignItems: 'center', gap: '6px' }}>
              GPS: <strong>{hasGps === 'yes' ? 'Con posizione' : 'Senza GPS'}</strong>
              <button type="button" onClick={() => { setHasGps(''); handleFilterChange(); }} style={{ background: 'transparent', border: 'none', color: '#a7f3d0', cursor: 'pointer', padding: 0, display: 'inline-flex' }}><X size={12} /></button>
            </span>
          )}
          {onlyLivePhotos && (
            <span style={{ fontSize: '11px', background: 'rgba(6, 182, 212, 0.16)', border: '1px solid rgba(6, 182, 212, 0.45)', color: '#a5f3fc', padding: '4px 10px', borderRadius: '999px', display: 'inline-flex', alignItems: 'center', gap: '6px' }}>
              Solo Live Photos
              <button type="button" onClick={() => { setOnlyLivePhotos(false); handleFilterChange(); }} style={{ background: 'transparent', border: 'none', color: '#a5f3fc', cursor: 'pointer', padding: 0, display: 'inline-flex' }}><X size={12} /></button>
            </span>
          )}
        </div>
      )}

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

            {sources.some((s) => s.status === 'online') && (
              <select
                onChange={(e) => {
                  if (e.target.value) handleBatchBackupCopy(e.target.value);
                  e.target.value = '';
                }}
                defaultValue=""
                style={{
                  background: '#1e293b',
                  color: '#4ade80',
                  border: '1px solid rgba(34, 197, 94, 0.4)',
                  borderRadius: '6px',
                  padding: '6px 10px',
                  fontSize: '12px',
                  fontWeight: 600,
                  cursor: 'pointer'
                }}
              >
                <option value="" disabled>Copia su disco...</option>
                {sources.filter((s) => s.status === 'online').map((s) => (
                  <option key={s.id} value={s.id}>→ {s.name}</option>
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
                  gridTemplateColumns: `repeat(auto-fill, minmax(${gridSize}px, 1fr))`,
                  gap: gridSize < 160 ? '8px' : '16px'
                }}>
                  {items.map(renderMediaCard)}
                </div>
              </div>
            ))}
          </div>
        ) : viewMode === 'list' ? (
          /* High-Density Configurable File List View (Zero Thumbnail Preloading) */
          <div style={{
            background: '#1e293b',
            border: '1px solid #334155',
            borderRadius: '12px',
            overflow: 'hidden',
            overflowX: 'auto'
          }}>
            <table style={{ width: '100%', borderCollapse: 'collapse', textAlign: 'left', fontSize: '13px' }}>
              <thead>
                <tr style={{ background: '#0f172a', borderBottom: '1px solid #334155', color: '#94a3b8', fontSize: '11px', textTransform: 'uppercase', letterSpacing: '0.5px' }}>
                  <th style={{ padding: '10px 12px', width: '36px' }}>
                    <button
                      type="button"
                      onClick={handleSelectAll}
                      title={selectedIds.size === mediaList.length ? 'Deseleziona tutti' : 'Seleziona tutti'}
                      style={{ background: 'transparent', border: 'none', color: selectedIds.size === mediaList.length && mediaList.length > 0 ? '#38bdf8' : '#64748b', cursor: 'pointer', display: 'flex', alignItems: 'center', padding: 0 }}
                    >
                      {selectedIds.size === mediaList.length && mediaList.length > 0 ? <CheckSquare size={15} /> : <Square size={15} />}
                    </button>
                  </th>
                  {visibleColumns.includes('file') && <th style={{ padding: '10px 12px' }}>File</th>}
                  {visibleColumns.includes('extension') && <th style={{ padding: '10px 10px' }}>Formato</th>}
                  {visibleColumns.includes('captured_at') && <th style={{ padding: '10px 10px' }}>Data Scatto</th>}
                  {visibleColumns.includes('size') && <th style={{ padding: '10px 10px' }}>Dimensione</th>}
                  {visibleColumns.includes('resolution') && <th style={{ padding: '10px 10px' }}>Risoluzione</th>}
                  {visibleColumns.includes('backup_status') && <th style={{ padding: '10px 10px' }}>Stato Backup</th>}
                  {visibleColumns.includes('sources') && <th style={{ padding: '10px 10px' }}>Dischi</th>}
                  {visibleColumns.includes('relative_path') && <th style={{ padding: '10px 10px' }}>Percorso su Disco</th>}
                  {visibleColumns.includes('camera_make') && <th style={{ padding: '10px 10px' }}>Produttore</th>}
                  {visibleColumns.includes('camera_model') && <th style={{ padding: '10px 10px' }}>Modello</th>}
                  {visibleColumns.includes('lens_model') && <th style={{ padding: '10px 10px' }}>Obiettivo</th>}
                  {visibleColumns.includes('exif_settings') && <th style={{ padding: '10px 10px' }}>Parametri Scatto</th>}
                  {visibleColumns.includes('place_name') && <th style={{ padding: '10px 10px' }}>Località</th>}
                  {visibleColumns.includes('gps_coords') && <th style={{ padding: '10px 10px' }}>GPS</th>}
                  {visibleColumns.includes('duration') && <th style={{ padding: '10px 10px' }}>Durata</th>}
                  {visibleColumns.includes('sha256') && <th style={{ padding: '10px 10px' }}>SHA-256</th>}
                  <th style={{ padding: '10px 12px', textAlign: 'right' }}>Azioni</th>
                </tr>
              </thead>
              <tbody>
                {mediaList.map((media) => {
                  const isSelected = selectedIds.has(media.id);
                  const ext = (media.primary_extension || '').toUpperCase() || (media.media_type === 'video' ? 'VID' : 'IMG');
                  const prot = media.protection_status;
                  const protLabel =
                    prot === 'protected'
                      ? `Protetto (${media.distinct_sources_count} dischi)`
                      : prot === 'intra_source_duplicate'
                        ? 'Duplicato stesso disco'
                        : prot === 'missing'
                          ? 'Mancante su disco'
                          : '1 Solo Disco';
                  const protColor =
                    prot === 'protected'
                      ? '#4ade80'
                      : prot === 'intra_source_duplicate'
                        ? '#fbbf24'
                        : '#f87171';
                  const protBg =
                    prot === 'protected'
                      ? 'rgba(34, 197, 94, 0.12)'
                      : prot === 'intra_source_duplicate'
                        ? 'rgba(245, 158, 11, 0.12)'
                        : 'rgba(244, 63, 94, 0.12)';

                  const exifParts: string[] = [];
                  if (media.f_number) exifParts.push(`f/${media.f_number}`);
                  if (media.exposure_time) {
                    exifParts.push(media.exposure_time < 1 ? `1/${Math.round(1 / media.exposure_time)}s` : `${media.exposure_time}s`);
                  }
                  if (media.iso) exifParts.push(`ISO ${media.iso}`);

                  return (
                    <tr
                      key={media.id}
                      data-media-id={media.id}
                      onClick={(e) => {
                        if (hasDraggedRef.current || marqueeRef.current?.isSelecting) return;
                        if (e.shiftKey || e.metaKey || e.ctrlKey || isSelectionMode) {
                          handleToggleSelect(e, media.id);
                        } else {
                          setSelectedMediaId(media.id);
                        }
                      }}
                      onContextMenu={(e) => handleCardContextMenu(e, media)}
                      style={{
                        borderBottom: '1px solid #1e293b',
                        background: isSelected ? 'rgba(2, 132, 199, 0.18)' : 'transparent',
                        cursor: 'pointer',
                        userSelect: 'none'
                      }}
                    >
                      <td style={{ padding: '8px 12px' }} onClick={(e) => handleToggleSelect(e, media.id)}>
                        <span style={{ color: isSelected ? '#38bdf8' : '#64748b', display: 'flex', alignItems: 'center' }}>
                          {isSelected ? <CheckSquare size={15} /> : <Square size={15} />}
                        </span>
                      </td>
                      {visibleColumns.includes('file') && (
                        <td style={{ padding: '8px 12px', maxWidth: '280px' }}>
                          <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                            {media.media_type === 'video' ? (
                              <Video size={15} color="#a855f7" style={{ flexShrink: 0 }} />
                            ) : (
                              <Image size={15} color="#38bdf8" style={{ flexShrink: 0 }} />
                            )}
                            <span style={{ fontWeight: 600, color: '#f8fafc', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
                              {media.primary_filename || 'File senza nome'}
                            </span>
                          </div>
                        </td>
                      )}
                      {visibleColumns.includes('extension') && (
                        <td style={{ padding: '8px 10px', color: '#94a3b8', fontSize: '11px', fontWeight: 600 }}>
                          {ext}
                        </td>
                      )}
                      {visibleColumns.includes('captured_at') && (
                        <td style={{ padding: '8px 10px', color: '#cbd5e1', fontSize: '12px', whiteSpace: 'nowrap' }}>
                          {media.captured_at ? new Date(media.captured_at).toLocaleDateString() : 'N/D'}
                        </td>
                      )}
                      {visibleColumns.includes('size') && (
                        <td style={{ padding: '8px 10px', color: '#cbd5e1', fontSize: '12px', whiteSpace: 'nowrap' }}>
                          {formatBytes(media.primary_size_bytes)}
                        </td>
                      )}
                      {visibleColumns.includes('resolution') && (
                        <td style={{ padding: '8px 10px', color: '#94a3b8', fontSize: '12px', whiteSpace: 'nowrap' }}>
                          {media.width && media.height ? `${media.width} × ${media.height}` : '—'}
                        </td>
                      )}
                      {visibleColumns.includes('backup_status') && (
                        <td style={{ padding: '8px 10px', whiteSpace: 'nowrap' }}>
                          <span style={{
                            fontSize: '11px',
                            fontWeight: 600,
                            color: protColor,
                            background: protBg,
                            padding: '2px 8px',
                            borderRadius: '6px'
                          }}>
                            {protLabel}
                          </span>
                        </td>
                      )}
                      {visibleColumns.includes('sources') && (
                        <td style={{ padding: '8px 10px', color: '#cbd5e1', fontSize: '12px', whiteSpace: 'nowrap' }}>
                          {media.source_names && media.source_names.length > 0 ? media.source_names.join(', ') : '—'}
                        </td>
                      )}
                      {visibleColumns.includes('relative_path') && (
                        <td style={{ padding: '8px 10px', color: '#94a3b8', fontSize: '11px', fontFamily: 'monospace', maxWidth: '280px', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }} title={media.primary_relative_path || ''}>
                          {media.primary_relative_path || '—'}
                        </td>
                      )}
                      {visibleColumns.includes('camera_make') && (
                        <td style={{ padding: '8px 10px', color: '#cbd5e1', fontSize: '12px', whiteSpace: 'nowrap' }}>
                          {media.camera_make || '—'}
                        </td>
                      )}
                      {visibleColumns.includes('camera_model') && (
                        <td style={{ padding: '8px 10px', color: '#38bdf8', fontSize: '12px', whiteSpace: 'nowrap' }}>
                          {media.camera_model || '—'}
                        </td>
                      )}
                      {visibleColumns.includes('lens_model') && (
                        <td style={{ padding: '8px 10px', color: '#94a3b8', fontSize: '11px', maxWidth: '200px', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }} title={media.lens_model || ''}>
                          {media.lens_model || '—'}
                        </td>
                      )}
                      {visibleColumns.includes('exif_settings') && (
                        <td style={{ padding: '8px 10px', color: '#94a3b8', fontSize: '11px', whiteSpace: 'nowrap' }}>
                          {exifParts.length > 0 ? exifParts.join(' · ') : '—'}
                        </td>
                      )}
                      {visibleColumns.includes('place_name') && (
                        <td style={{ padding: '8px 10px', color: '#38bdf8', fontSize: '12px', maxWidth: '220px', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
                          {media.place_name || '—'}
                        </td>
                      )}
                      {visibleColumns.includes('gps_coords') && (
                        <td style={{ padding: '8px 10px', color: '#94a3b8', fontSize: '11px', fontFamily: 'monospace', whiteSpace: 'nowrap' }}>
                          {media.latitude != null && media.longitude != null ? `${Number(media.latitude).toFixed(4)}, ${Number(media.longitude).toFixed(4)}` : '—'}
                        </td>
                      )}
                      {visibleColumns.includes('duration') && (
                        <td style={{ padding: '8px 10px', color: '#94a3b8', fontSize: '12px', whiteSpace: 'nowrap' }}>
                          {media.duration_seconds ? `${Math.floor(media.duration_seconds / 60)}:${String(Math.floor(media.duration_seconds % 60)).padStart(2, '0')}` : '—'}
                        </td>
                      )}
                      {visibleColumns.includes('sha256') && (
                        <td style={{ padding: '8px 10px', color: '#64748b', fontSize: '11px', fontFamily: 'monospace', whiteSpace: 'nowrap' }} title={media.canonical_sha256}>
                          {media.canonical_sha256 ? `${media.canonical_sha256.slice(0, 12)}…` : '—'}
                        </td>
                      )}
                      <td style={{ padding: '8px 12px', textAlign: 'right', whiteSpace: 'nowrap' }} onClick={(e) => e.stopPropagation()}>
                        <div style={{ display: 'inline-flex', alignItems: 'center', gap: '6px' }}>
                          <button
                            type="button"
                            onClick={(e) => handleToggleFavorite(e, media.id)}
                            title={media.is_favorite ? 'Rimuovi dai Preferiti' : 'Aggiungi ai Preferiti'}
                            style={{ background: 'transparent', border: 'none', color: media.is_favorite ? '#f43f5e' : '#64748b', cursor: 'pointer', padding: '4px', display: 'inline-flex' }}
                          >
                            <Heart size={14} fill={media.is_favorite ? '#f43f5e' : 'none'} />
                          </button>
                          <button
                            type="button"
                            onClick={async () => {
                              try {
                                await ApiClient.revealMedia(media.id);
                                toast.success('Aperto nel Finder');
                              } catch (err) {
                                toast.error((err as Error).message);
                              }
                            }}
                            title="Mostra nel Finder"
                            style={{ background: 'transparent', border: 'none', color: '#38bdf8', cursor: 'pointer', padding: '4px', display: 'inline-flex' }}
                          >
                            <FolderOpen size={14} />
                          </button>
                          <button
                            type="button"
                            onClick={() => setSelectedMediaId(media.id)}
                            title="Apri dettaglio / anteprima"
                            style={{ background: 'transparent', border: 'none', color: '#94a3b8', cursor: 'pointer', padding: '4px', display: 'inline-flex' }}
                          >
                            <Eye size={14} />
                          </button>
                        </div>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        ) : (
          /* Standard Grid View Mode */
          <div className="media-grid-container" style={{
            display: 'grid',
            gridTemplateColumns: `repeat(auto-fill, minmax(${gridSize}px, 1fr))`,
            gap: gridSize < 160 ? '8px' : '16px'
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

          {/* Copia su altro disco */}
          {sources.filter((s) => s.status === 'online').map((s) => (
            <button
              key={`ctx-copy-${s.id}`}
              onClick={() => {
                setContextMenu(null);
                handleBatchBackupCopy(s.id);
              }}
              className="context-menu-item"
              style={{
                display: 'flex', alignItems: 'center', gap: '8px', padding: '8px 10px', background: 'transparent', border: 'none', color: '#4ade80', fontSize: '12px', borderRadius: '6px', cursor: 'pointer', textAlign: 'left', width: '100%'
              }}
            >
              <HardDrive size={14} color="#22c55e" /> Copia su {s.name}
            </button>
          ))}

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
            onClick={() => setOffset((prev) => prev + effectiveLimit)}
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

      {/* Modal for Advanced Filters */}
      {showFiltersModal && (
        <div
          className="modal-overlay"
          onClick={() => setShowFiltersModal(false)}
          style={{
            position: 'fixed',
            inset: 0,
            background: 'rgba(15, 23, 42, 0.8)',
            backdropFilter: 'blur(6px)',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            zIndex: 1050,
            padding: '20px'
          }}
        >
          <div
            className="modal-card"
            onClick={(e) => e.stopPropagation()}
            style={{
              background: '#1e293b',
              border: '1px solid #334155',
              borderRadius: '16px',
              width: '100%',
              maxWidth: '760px',
              maxHeight: '88vh',
              display: 'flex',
              flexDirection: 'column',
              overflow: 'hidden',
              boxShadow: '0 25px 50px -12px rgba(0, 0, 0, 0.7)'
            }}
          >
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '16px 20px', borderBottom: '1px solid #334155' }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
                <SlidersHorizontal size={18} color="#a855f7" />
                <h3 style={{ margin: 0, fontSize: '16px', fontWeight: 700, color: '#f8fafc' }}>
                  Filtri Avanzati & Dispositivi
                </h3>
                {loadingFilterOptions && (
                  <span style={{ fontSize: '11px', color: '#94a3b8' }}>Caricamento opzioni dal DB...</span>
                )}
              </div>
              <button
                type="button"
                onClick={() => setShowFiltersModal(false)}
                style={{ background: 'transparent', border: 'none', color: '#94a3b8', cursor: 'pointer', padding: '4px' }}
              >
                <X size={20} />
              </button>
            </div>

            <div style={{ padding: '20px', overflowY: 'auto', display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(220px, 1fr))', gap: '16px' }}>
              {/* Produttore */}
              <div>
                <label style={{ display: 'block', fontSize: '11px', fontWeight: 600, color: '#94a3b8', marginBottom: '6px' }}>
                  Produttore Fotocamera / Telefono
                </label>
                <select
                  value={cameraMake}
                  onChange={(e) => { setCameraMake(e.target.value); setCameraModel(''); handleFilterChange(); }}
                  style={{ width: '100%', background: '#0f172a', border: '1px solid #334155', borderRadius: '8px', padding: '8px 10px', color: 'white', fontSize: '13px' }}
                >
                  <option value="">Tutti i produttori ({filterOptions.makes.length})</option>
                  {filterOptions.makes.map((mk) => (
                    <option key={mk} value={mk}>{mk}</option>
                  ))}
                </select>
              </div>

              {/* Modello */}
              <div>
                <label style={{ display: 'block', fontSize: '11px', fontWeight: 600, color: '#94a3b8', marginBottom: '6px' }}>
                  Modello Dispositivo
                </label>
                <select
                  value={cameraModel}
                  onChange={(e) => { setCameraModel(e.target.value); handleFilterChange(); }}
                  style={{ width: '100%', background: '#0f172a', border: '1px solid #334155', borderRadius: '8px', padding: '8px 10px', color: 'white', fontSize: '13px' }}
                >
                  <option value="">Tutti i modelli</option>
                  {filterOptions.models
                    .filter((m) => !cameraMake || m.make.toLowerCase() === cameraMake.toLowerCase())
                    .map((m) => (
                      <option key={`${m.make}-${m.model}`} value={m.model}>
                        {m.model}{!cameraMake && m.make ? ` (${m.make})` : ''}
                      </option>
                    ))}
                </select>
              </div>

              {/* Obiettivo */}
              <div>
                <label style={{ display: 'block', fontSize: '11px', fontWeight: 600, color: '#94a3b8', marginBottom: '6px' }}>
                  Obiettivo / Lente
                </label>
                <select
                  value={lensModel}
                  onChange={(e) => { setLensModel(e.target.value); handleFilterChange(); }}
                  style={{ width: '100%', background: '#0f172a', border: '1px solid #334155', borderRadius: '8px', padding: '8px 10px', color: 'white', fontSize: '13px' }}
                >
                  <option value="">Tutti gli obiettivi ({filterOptions.lenses.length})</option>
                  {filterOptions.lenses.map((ln) => (
                    <option key={ln} value={ln}>{ln}</option>
                  ))}
                </select>
              </div>

              {/* Estensione */}
              <div>
                <label style={{ display: 'block', fontSize: '11px', fontWeight: 600, color: '#94a3b8', marginBottom: '6px' }}>
                  Estensione File
                </label>
                <select
                  value={extensionFilter}
                  onChange={(e) => { setExtensionFilter(e.target.value); handleFilterChange(); }}
                  style={{ width: '100%', background: '#0f172a', border: '1px solid #334155', borderRadius: '8px', padding: '8px 10px', color: 'white', fontSize: '13px' }}
                >
                  <option value="">Tutte le estensioni</option>
                  {filterOptions.extensions.map((ext) => (
                    <option key={ext} value={ext}>.{ext.toUpperCase()}</option>
                  ))}
                </select>
              </div>

              {/* Data Da */}
              <div>
                <label style={{ display: 'block', fontSize: '11px', fontWeight: 600, color: '#94a3b8', marginBottom: '6px' }}>
                  Data Scatto Da
                </label>
                <input
                  type="date"
                  value={dateFrom}
                  onChange={(e) => { setDateFrom(e.target.value); handleFilterChange(); }}
                  style={{ width: '100%', background: '#0f172a', border: '1px solid #334155', borderRadius: '8px', padding: '8px 10px', color: 'white', fontSize: '13px' }}
                />
              </div>

              {/* Data A */}
              <div>
                <label style={{ display: 'block', fontSize: '11px', fontWeight: 600, color: '#94a3b8', marginBottom: '6px' }}>
                  Data Scatto A
                </label>
                <input
                  type="date"
                  value={dateTo}
                  onChange={(e) => { setDateTo(e.target.value); handleFilterChange(); }}
                  style={{ width: '100%', background: '#0f172a', border: '1px solid #334155', borderRadius: '8px', padding: '8px 10px', color: 'white', fontSize: '13px' }}
                />
              </div>

              {/* GPS */}
              <div>
                <label style={{ display: 'block', fontSize: '11px', fontWeight: 600, color: '#94a3b8', marginBottom: '6px' }}>
                  Coordinate GPS
                </label>
                <select
                  value={hasGps}
                  onChange={(e) => { setHasGps(e.target.value as '' | 'yes' | 'no'); handleFilterChange(); }}
                  style={{ width: '100%', background: '#0f172a', border: '1px solid #334155', borderRadius: '8px', padding: '8px 10px', color: 'white', fontSize: '13px' }}
                >
                  <option value="">Tutti (con e senza GPS)</option>
                  <option value="yes">Solo con posizione GPS</option>
                  <option value="no">Solo senza GPS</option>
                </select>
              </div>

              {/* Live Photos */}
              <div style={{ display: 'flex', alignItems: 'center', paddingTop: '20px' }}>
                <label style={{ display: 'flex', alignItems: 'center', gap: '8px', cursor: 'pointer', fontSize: '13px', color: '#e2e8f0', fontWeight: 600 }}>
                  <input
                    type="checkbox"
                    checked={onlyLivePhotos}
                    onChange={(e) => { setOnlyLivePhotos(e.target.checked); handleFilterChange(); }}
                    style={{ accentColor: '#06b6d4', width: '16px', height: '16px' }}
                  />
                  Solo Live Photos (Apple)
                </label>
              </div>
            </div>

            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '14px 20px', borderTop: '1px solid #334155', background: '#0f172a' }}>
              <button
                type="button"
                onClick={() => {
                  setCameraMake('');
                  setCameraModel('');
                  setLensModel('');
                  setExtensionFilter('');
                  setDateFrom('');
                  setDateTo('');
                  setHasGps('');
                  setOnlyLivePhotos(false);
                  setSelectedFolder('');
                  handleFilterChange();
                }}
                style={{
                  background: 'transparent',
                  border: '1px solid #475569',
                  color: '#cbd5e1',
                  borderRadius: '8px',
                  padding: '8px 14px',
                  fontSize: '12px',
                  fontWeight: 600,
                  cursor: 'pointer'
                }}
              >
                Ripristina Filtri Avanzati
              </button>
              <button
                type="button"
                onClick={() => setShowFiltersModal(false)}
                style={{
                  background: '#0284c7',
                  border: 'none',
                  color: 'white',
                  borderRadius: '8px',
                  padding: '8px 20px',
                  fontSize: '13px',
                  fontWeight: 700,
                  cursor: 'pointer'
                }}
              >
                Applica e Chiudi
              </button>
            </div>
          </div>
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
