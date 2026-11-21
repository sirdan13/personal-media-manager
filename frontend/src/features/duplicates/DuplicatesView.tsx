import React, { useEffect, useState, useMemo } from 'react';
import { useToast } from '../../context/ToastContext';
import {
  Copy,
  CheckCircle2,
  HardDrive,
  FileText,
  Info,
  Download,
  Sparkles,
  ShieldCheck,
  AlertTriangle,
  ArrowRight,
  ArrowLeftRight,
  Check,
  FileCode,
  Trash2,
  RotateCcw,
  Zap,
  X,
  Brain,
  FolderTree,
  Heart,
  Folder,
  FolderOpen,
  Lightbulb,
  Star,
  MessageSquare,
  MoreHorizontal,
  ChevronDown,
  Video
} from 'lucide-react';
import {
  ApiClient,
  DuplicateKeepSuggestion,
  FolderAdvisorAnalysisResult,
  FolderRule,
  FolderRulePreview,
  BestShotResult
} from '../../services/api';
import { MediaDetailModal } from '../library/MediaDetailModal';

type DuplicateTab = 'intra_source' | 'multi_source' | 'backup_gap' | 'similar' | 'trash' | 'folder_advisor';

export const DuplicatesView: React.FC = () => {
  const { toast } = useToast();
  const [activeTab, setActiveTab] = useState<DuplicateTab>('intra_source');
  const [duplicateGroups, setDuplicateGroups] = useState<any[]>([]);
  const [similarGroups, setSimilarGroups] = useState<any[]>([]);
  const [summary, setSummary] = useState<any | null>(null);
  const [sources, setSources] = useState<any[]>([]);
  const [preferredSourceId, setPreferredSourceId] = useState<string>('');
  const [loading, setLoading] = useState(true);
  const [loadingMore, setLoadingMore] = useState(false);
  const [loadingSimilar, setLoadingSimilar] = useState(false);
  const [selectedMediaId, setSelectedMediaId] = useState<string | null>(null);

  // Heuristic Duplicate Keep Suggestions
  const [keepSuggestions, setKeepSuggestions] = useState<Record<string, DuplicateKeepSuggestion>>({});
  const [loadingSuggestions, setLoadingSuggestions] = useState<boolean>(false);

  // Folder Advisor State
  const [advisorSourceId, setAdvisorSourceId] = useState<string>('');
  const [advisorUseAi, setAdvisorUseAi] = useState<boolean>(true);
  const [advisorLoading, setAdvisorLoading] = useState<boolean>(false);
  const [advisorResult, setAdvisorResult] = useState<FolderAdvisorAnalysisResult | null>(null);
  const [previewModalOpen, setPreviewModalOpen] = useState<boolean>(false);
  const [previewData, setPreviewData] = useState<FolderRulePreview | null>(null);
  const [previewLoading, setPreviewLoading] = useState<boolean>(false);
  const [activeRuleForPreview, setActiveRuleForPreview] = useState<FolderRule | null>(null);
  const [isApplyingFolderRule, setIsApplyingFolderRule] = useState<boolean>(false);

  // Best Shot Picker State (Similar Cluster)
  const [bestShotResults, setBestShotResults] = useState<Record<string, BestShotResult>>({});
  const [analyzingClusterId, setAnalyzingClusterId] = useState<string | null>(null);
  const [confirmTrashSimilarModal, setConfirmTrashSimilarModal] = useState<{
    open: boolean;
    clusterKey: string;
    keepMediaId: string;
    trashMediaIds: string[];
  } | null>(null);
  const [isTrashingSimilar, setIsTrashingSimilar] = useState<boolean>(false);

  // Safe Trash (.pmm_trash) state
  const [selectedForTrash, setSelectedForTrash] = useState<Set<string>>(new Set());
  const [customKeepMap, setCustomKeepMap] = useState<Record<string, string>>({});
  const [trashData, setTrashData] = useState<any | null>(null);
  const [loadingTrash, setLoadingTrash] = useState<boolean>(false);
  const [confirmModalOpen, setConfirmModalOpen] = useState<boolean>(false);
  const [isTrashing, setIsTrashing] = useState<boolean>(false);
  const [restoringFileIds, setRestoringFileIds] = useState<Set<string>>(new Set());
  const [trashSourceFilter, setTrashSourceFilter] = useState<string>('');

  // Backup Gap state
  const [primarySourceId, setPrimarySourceId] = useState<string>('');
  const [backupSourceId, setBackupSourceId] = useState<string>('');
  const [gapOnlyFavorites, setGapOnlyFavorites] = useState<boolean>(false);
  const [gapData, setGapData] = useState<any | null>(null);
  const [loadingGap, setLoadingGap] = useState<boolean>(false);
  const [copiedRsyncCmd, setCopiedRsyncCmd] = useState<boolean>(false);

  // Similar photos controls
  const [maxDistance, setMaxDistance] = useState<number>(6);
  const [within24h, setWithin24h] = useState<boolean>(true);
  const [offset, setOffset] = useState<number>(0);

  // UI Redesign States
  const [showTrashInfo, setShowTrashInfo] = useState<boolean>(() => {
    return localStorage.getItem('pmm_hide_trash_info') !== 'true';
  });
  const [infoPopoverOpen, setInfoPopoverOpen] = useState<boolean>(false);
  const [sortBy, setSortBy] = useState<'wasted_desc' | 'size_desc' | 'name_asc' | 'date_desc'>('wasted_desc');
  const [toolsMenuOpen, setToolsMenuOpen] = useState<boolean>(false);
  const [exportMenuOpen, setExportMenuOpen] = useState<boolean>(false);
  const [copiedShaMediaId, setCopiedShaMediaId] = useState<string | null>(null);

  // Finder reveal state
  const [revealingFileId, setRevealingFileId] = useState<string | null>(null);

  const handleRevealFile = async (e: React.MouseEvent, fileId: string, filename?: string) => {
    e.stopPropagation();
    try {
      setRevealingFileId(fileId);
      await ApiClient.revealFile(fileId);
      toast.success(`Aperto nel Finder: ${filename || 'file'}`);
    } catch (err) {
      toast.error((err as Error).message || 'Impossibile aprire nel Finder');
    } finally {
      setRevealingFileId(null);
    }
  };

  const handleCopySha = (canonicalSha: string, mediaId: string, e: React.MouseEvent) => {
    e.stopPropagation();
    navigator.clipboard.writeText(canonicalSha);
    setCopiedShaMediaId(mediaId);
    toast.success('SHA-256 copiato negli appunti');
    setTimeout(() => {
      setCopiedShaMediaId((prev) => (prev === mediaId ? null : prev));
    }, 2000);
  };

  const handleDismissTrashInfoForever = () => {
    localStorage.setItem('pmm_hide_trash_info', 'true');
    setShowTrashInfo(false);
    setInfoPopoverOpen(false);
    toast.info('Avviso di sicurezza nascosto. Puoi sempre riaprirlo cliccando l\'icona (i).');
  };

  const displayedDuplicateGroups = useMemo(() => {
    let list = [...duplicateGroups];
    if (preferredSourceId) {
      list = list.filter((g) => g.files.some((f: any) => f.source_id === preferredSourceId));
    }
    if (sortBy === 'wasted_desc') {
      list.sort((a, b) => (b.intra_source_wasted_bytes || 0) - (a.intra_source_wasted_bytes || 0));
    } else if (sortBy === 'size_desc') {
      list.sort((a, b) => (b.files?.[0]?.size_bytes || 0) - (a.files?.[0]?.size_bytes || 0));
    } else if (sortBy === 'name_asc') {
      list.sort((a, b) => (a.files?.[0]?.filename || '').localeCompare(b.files?.[0]?.filename || ''));
    } else if (sortBy === 'date_desc') {
      list.sort((a, b) => {
        const da = a.files?.[0]?.captured_at || a.files?.[0]?.created_at || '';
        const db = b.files?.[0]?.captured_at || b.files?.[0]?.created_at || '';
        return db.localeCompare(da);
      });
    }
    return list;
  }, [duplicateGroups, preferredSourceId, sortBy]);

  const renderSmartPath = (filePath: string, allPaths: string[]) => {
    if (!filePath) return <span style={{ color: '#94a3b8' }}>/</span>;
    const dir = filePath.includes('/') ? filePath.substring(0, filePath.lastIndexOf('/')) : '';
    if (!dir) return <span style={{ color: '#94a3b8' }}>/</span>;

    const allDirs = allPaths.map((p) => (p && p.includes('/') ? p.substring(0, p.lastIndexOf('/')) : ''));
    const uniqueDirs = new Set(allDirs);
    if (uniqueDirs.size <= 1) {
      return (
        <span style={{ color: '#94a3b8', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
          {dir}
        </span>
      );
    }

    const segments = dir.split('/');
    const otherDirs = allDirs.filter((d) => d !== dir);
    const commonPrefix: string[] = [];
    const diffSegments: string[] = [];
    let foundDiff = false;

    for (let i = 0; i < segments.length; i++) {
      const seg = segments[i];
      const matchesAll = otherDirs.length > 0 && otherDirs.every((od) => {
        const odParts = od.split('/');
        return odParts[i] === seg;
      });
      if (matchesAll && !foundDiff) {
        commonPrefix.push(seg);
      } else {
        foundDiff = true;
        diffSegments.push(seg);
      }
    }

    return (
      <span
        style={{
          display: 'inline-flex',
          alignItems: 'center',
          gap: '2px',
          overflow: 'hidden',
          textOverflow: 'ellipsis',
          whiteSpace: 'nowrap',
          maxWidth: '100%'
        }}
      >
        {commonPrefix.length > 0 && (
          <span style={{ color: '#64748b' }}>{commonPrefix.join('/')}/</span>
        )}
        <span
          style={{
            color: '#38bdf8',
            background: 'rgba(56, 189, 248, 0.12)',
            padding: '1px 5px',
            borderRadius: '4px',
            fontWeight: 600
          }}
        >
          {diffSegments.join('/') || dir}
        </span>
      </span>
    );
  };

  useEffect(() => {
    loadSummary();
    loadSources();
    loadTrash();
  }, []);

  const loadTrash = async (sourceId = trashSourceFilter) => {
    try {
      setLoadingTrash(true);
      const data = await ApiClient.getTrashedFiles(sourceId || undefined);
      setTrashData(data);
    } catch (e) {
      console.warn('Could not load trashed files', e);
    } finally {
      setLoadingTrash(false);
    }
  };

  const loadSources = async () => {
    try {
      const srcList = await ApiClient.getSources();
      setSources(srcList);
      if (srcList.length >= 2) {
        if (!primarySourceId) setPrimarySourceId(srcList[0].id);
        if (!backupSourceId) setBackupSourceId(srcList[1].id);
      } else if (srcList.length === 1) {
        if (!primarySourceId) setPrimarySourceId(srcList[0].id);
      }
    } catch (e) {
      console.warn('Could not load sources for duplicates view', e);
    }
  };

  const loadSummary = async () => {
    try {
      const s = await ApiClient.getDuplicatesSummary();
      setSummary(s);
    } catch (e) {
      console.warn('Could not load duplicates summary', e);
    }
  };

  // Task 9.1 & 9.7: Suggest Keep Copies via Heuristics
  const handleSuggestKeepCopies = async () => {
    const mediaIds = duplicateGroups.map(g => g.media_id);
    if (mediaIds.length === 0) return;
    try {
      setLoadingSuggestions(true);
      const suggestions = await ApiClient.suggestKeepCopies(mediaIds, preferredSourceId || undefined);
      const newMap: Record<string, DuplicateKeepSuggestion> = {};
      const newTrashSet = new Set(selectedForTrash);

      for (const s of suggestions) {
        newMap[s.media_id] = s;
        for (const fid of s.trash_file_ids) {
          newTrashSet.add(fid);
        }
      }
      setKeepSuggestions(newMap);
      setSelectedForTrash(newTrashSet);
      toast.success(`Analisi euristica completata! Suggerite ${suggestions.length} scelte e marcati ${newTrashSet.size} file da spostare.`);
    } catch (err) {
      toast.error(`Errore suggerimento copie: ${(err as Error).message}`);
    } finally {
      setLoadingSuggestions(false);
    }
  };

  // Task 9.3 & 9.7: Folder Advisor
  const loadFolderAdvisor = async () => {
    try {
      setAdvisorLoading(true);
      const res = await ApiClient.analyzeFolderAdvisor(advisorSourceId || undefined, advisorUseAi);
      setAdvisorResult(res);
      if (res.ai_error) {
        toast.info(`AI non disponibile (${res.ai_error}): applicate regole euristiche.`);
      } else {
        toast.success(`Analisi completata (${res.engine_used}): individuate ${res.rules.length} regole di pulizia.`);
      }
    } catch (err) {
      toast.error(`Errore analisi cartelle: ${(err as Error).message}`);
    } finally {
      setAdvisorLoading(false);
    }
  };

  const handleSwapFolderRule = (idx: number) => {
    if (!advisorResult) return;
    const rules = [...advisorResult.rules];
    const r = { ...rules[idx] };
    const tmp = r.keep_folder;
    r.keep_folder = r.trash_folder;
    r.trash_folder = tmp;
    r.rationale = `Invertita manualmente: tieni ${r.keep_folder}, cestina ${r.trash_folder}`;
    rules[idx] = r;
    setAdvisorResult({ ...advisorResult, rules });
  };

  const handlePreviewFolderRule = async (rule: FolderRule) => {
    if (!advisorResult) return;
    const pair = advisorResult.pairs.find(p => p.pair_id === rule.pair_id);
    if (!pair) return;
    try {
      setActiveRuleForPreview(rule);
      setPreviewLoading(true);
      setPreviewModalOpen(true);
      const preview = await ApiClient.previewFolderRule(pair.source_id, rule.keep_folder, rule.trash_folder);
      setPreviewData(preview);
    } catch (err) {
      toast.error(`Errore anteprima regola: ${(err as Error).message}`);
      setPreviewModalOpen(false);
    } finally {
      setPreviewLoading(false);
    }
  };

  const handleApplyFolderRule = async () => {
    if (!previewData || !previewData.file_ids.length) return;
    try {
      setIsApplyingFolderRule(true);
      const res = await ApiClient.trashDuplicateFiles(previewData.file_ids, previewData.keep_file_ids);
      const freedMb = (res.trashed_bytes / (1024 * 1024)).toFixed(1);
      toast.success(`Spostate ${res.trashed_count} copie in .pmm_trash! Spazio liberato: ${freedMb} MB.`);
      setPreviewModalOpen(false);
      setPreviewData(null);
      await loadSummary();
      await loadTrash();
      await loadFolderAdvisor();
    } catch (err) {
      toast.error(`Errore durante lo spostamento: ${(err as Error).message}`);
    } finally {
      setIsApplyingFolderRule(false);
    }
  };

  // Task 9.4 & 9.7: Best Shot Picker
  const handleSuggestBestShot = async (clusterKey: string, mediaItems: any[]) => {
    const mediaIds = mediaItems.map(m => m.id);
    if (mediaIds.length < 2) return;
    try {
      setAnalyzingClusterId(clusterKey);
      const res = await ApiClient.suggestBestShot(mediaIds, true);
      setBestShotResults(prev => ({ ...prev, [clusterKey]: res }));
      if (res.ai_error) {
        toast.info(`AI non disponibile (${res.ai_error}): applicato ranking euristico.`);
      } else {
        toast.success(`Miglior scatto individuato (${res.engine})!`);
      }
    } catch (err) {
      toast.error(`Errore selezione miglior scatto: ${(err as Error).message}`);
    } finally {
      setAnalyzingClusterId(null);
    }
  };

  const handlePromoteBestShot = (clusterKey: string, newBestMediaId: string) => {
    const current = bestShotResults[clusterKey];
    if (!current) return;
    const updatedKeep = Array.from(new Set([...current.keep_media_ids, newBestMediaId]));
    const updatedTrash = current.trash_media_ids.filter(id => id !== newBestMediaId);
    setBestShotResults(prev => ({
      ...prev,
      [clusterKey]: {
        ...current,
        best_media_id: newBestMediaId,
        keep_media_ids: updatedKeep,
        trash_media_ids: updatedTrash,
        reasons: {
          ...current.reasons,
          [newBestMediaId]: 'Selezionato manualmente come scatto migliore'
        }
      }
    }));
  };

  const handleToggleTrashSimilarItem = (clusterKey: string, mediaId: string) => {
    const current = bestShotResults[clusterKey];
    if (!current || current.best_media_id === mediaId) return;
    const isCurrentlyTrash = current.trash_media_ids.includes(mediaId);
    let updatedTrash: string[];
    let updatedKeep: string[];
    if (isCurrentlyTrash) {
      updatedTrash = current.trash_media_ids.filter(id => id !== mediaId);
      updatedKeep = Array.from(new Set([...current.keep_media_ids, mediaId]));
    } else {
      updatedTrash = Array.from(new Set([...current.trash_media_ids, mediaId]));
      updatedKeep = current.keep_media_ids.filter(id => id !== mediaId);
    }
    setBestShotResults(prev => ({
      ...prev,
      [clusterKey]: {
        ...current,
        keep_media_ids: updatedKeep,
        trash_media_ids: updatedTrash
      }
    }));
  };

  const handleExecuteTrashSimilar = async () => {
    if (!confirmTrashSimilarModal) return;
    try {
      setIsTrashingSimilar(true);
      const { keepMediaId, trashMediaIds, clusterKey } = confirmTrashSimilarModal;
      const res = await ApiClient.trashSimilarMedia(keepMediaId, trashMediaIds, 10);
      const freedMb = (res.freed_bytes / (1024 * 1024)).toFixed(1);
      toast.success(`Spostate ${res.trashed_media_count} foto (${res.trashed_files_count} file) in .pmm_trash! Spazio liberato: ${freedMb} MB.`);
      setConfirmTrashSimilarModal(null);
      setBestShotResults(prev => {
        const copy = { ...prev };
        delete copy[clusterKey];
        return copy;
      });
      await loadSummary();
      await loadTrash();
      await loadSimilar(maxDistance, within24h ? 24 : undefined);
    } catch (err) {
      toast.error(`Errore spostamento foto simili: ${(err as Error).message}`);
    } finally {
      setIsTrashingSimilar(false);
    }
  };


  // Load duplicates according to active tab mode
  const loadDuplicates = async (mode: 'intra_source' | 'multi_source') => {
    if (!ApiClient.getToken()) {
      setLoading(false);
      return;
    }
    try {
      setLoading(true);
      setOffset(0);
      const groups = await ApiClient.getDuplicates(0, 50, mode);
      setDuplicateGroups(groups);
      if (mode === 'intra_source') {
        const autoTrash = new Set<string>();
        for (const g of groups) {
          const seenSources = new Set<string>();
          for (const f of g.files) {
            if (!seenSources.has(f.source_id)) {
              seenSources.add(f.source_id);
            } else if (f.source_status !== 'offline') {
              autoTrash.add(f.id);
            }
          }
        }
        setSelectedForTrash(autoTrash);
      } else {
        setSelectedForTrash(new Set());
      }
    } catch (err) {
      console.error('Error loading duplicates:', err);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    if (activeTab === 'intra_source' || activeTab === 'multi_source') {
      loadDuplicates(activeTab);
    } else if (activeTab === 'similar' && similarGroups.length === 0) {
      loadSimilar();
    } else if (activeTab === 'backup_gap') {
      if (primarySourceId && backupSourceId && primarySourceId !== backupSourceId) {
        loadGap();
      }
    } else if (activeTab === 'trash') {
      loadTrash();
    } else if (activeTab === 'folder_advisor') {
      if (!advisorResult && !advisorLoading) {
        loadFolderAdvisor();
      }
    }
  }, [activeTab]);

  const loadGap = async () => {
    if (!primarySourceId || !backupSourceId || primarySourceId === backupSourceId) return;
    try {
      setLoadingGap(true);
      const res = await ApiClient.getBackupGap(primarySourceId, backupSourceId, gapOnlyFavorites);
      setGapData(res);
    } catch (err) {
      console.error('Error computing backup gap:', err);
    } finally {
      setLoadingGap(false);
    }
  };

  useEffect(() => {
    if (activeTab === 'backup_gap' && primarySourceId && backupSourceId) {
      loadGap();
    }
  }, [primarySourceId, backupSourceId, gapOnlyFavorites]);

  const handleLoadMore = async () => {
    const nextOffset = offset + 50;
    setLoadingMore(true);
    try {
      const mode = activeTab === 'multi_source' ? 'multi_source' : 'intra_source';
      const nextGroups = await ApiClient.getDuplicates(nextOffset, 50, mode);
      setDuplicateGroups((prev) => [...prev, ...nextGroups]);
      setOffset(nextOffset);
      if (mode === 'intra_source') {
        setSelectedForTrash((prev) => {
          const next = new Set(prev);
          for (const g of nextGroups) {
            const seenSources = new Set<string>();
            for (const f of g.files) {
              if (!seenSources.has(f.source_id)) {
                seenSources.add(f.source_id);
              } else if (f.source_status !== 'offline') {
                next.add(f.id);
              }
            }
          }
          return next;
        });
      }
    } catch (err) {
      console.error('Error loading more duplicates:', err);
    } finally {
      setLoadingMore(false);
    }
  };

  const loadSimilar = async (dist = maxDistance, timeDiff = within24h ? 24 : undefined) => {
    try {
      setLoadingSimilar(true);
      const clusters = await ApiClient.getSimilarPhotos(dist, timeDiff);
      setSimilarGroups(clusters);
    } catch (err) {
      console.error('Error loading similar photos:', err);
    } finally {
      setLoadingSimilar(false);
    }
  };

  const handleExport = async (format: 'csv' | 'json') => {
    try {
      const mode = activeTab === 'multi_source' ? 'multi_source' : 'intra_source';
      const url = ApiClient.getDuplicateExportUrl(format, preferredSourceId || undefined, mode);
      const res = await fetch(url, {
        headers: {
          Authorization: `Bearer ${ApiClient.getToken()}`
        }
      });
      const blob = await res.blob();
      const downloadUrl = window.URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = downloadUrl;
      a.download = `report_${mode}_${new Date().toISOString().slice(0, 10)}.${format}`;
      document.body.appendChild(a);
      a.click();
      a.remove();
    } catch (err) {
      console.error('Export error:', err);
    }
  };

  // Safe Trash (.pmm_trash) logic
  const selectedTrashBytes = useMemo(() => {
    let bytes = 0;
    for (const group of duplicateGroups) {
      for (const f of group.files) {
        if (selectedForTrash.has(f.id)) {
          bytes += (f.size_bytes || 0);
        }
      }
    }
    return bytes;
  }, [selectedForTrash, duplicateGroups]);

  const toggleFileTrash = (group: any, fileId: string) => {
    const next = new Set(selectedForTrash);
    if (next.has(fileId)) {
      next.delete(fileId);
      setSelectedForTrash(next);
      return;
    }

    const remainingKept = group.files.filter((f: any) => f.id !== fileId && !next.has(f.id));
    if (remainingKept.length < 1) {
      toast.info('Devi conservare almeno 1 copia attiva per ogni foto o video!');
      return;
    }

    next.add(fileId);
    setSelectedForTrash(next);
  };

  const getKeeperFileIdForSource = (group: any, sourceId: string): string => {
    const key = `${group.media_id}_${sourceId}`;
    if (customKeepMap[key]) {
      return customKeepMap[key];
    }
    if (customKeepMap[group.media_id]) {
      const match = group.files.find((f: any) => f.id === customKeepMap[group.media_id] && f.source_id === sourceId);
      if (match) return match.id;
    }
    const suggestion = keepSuggestions[group.media_id];
    if (suggestion && suggestion.keep_file_ids && suggestion.keep_file_ids.length > 0) {
      const suggested = group.files.find((f: any) => f.source_id === sourceId && suggestion.keep_file_ids.includes(f.id));
      if (suggested) return suggested.id;
    }
    const filesOnSource = group.files.filter((f: any) => f.source_id === sourceId);
    if (filesOnSource.length > 0) {
      const sorted = [...filesOnSource].sort((a, b) => (a.relative_path?.length || 0) - (b.relative_path?.length || 0));
      return sorted[0].id;
    }
    return group.files[0]?.id;
  };

  const setPrimaryKeepInGroup = (group: any, keepFileId: string) => {
    const keepFile = group.files.find((f: any) => f.id === keepFileId);
    if (!keepFile) return;

    setCustomKeepMap((prev) => ({
      ...prev,
      [`${group.media_id}_${keepFile.source_id}`]: keepFileId,
      [group.media_id]: keepFileId
    }));

    const next = new Set(selectedForTrash);
    next.delete(keepFileId);

    for (const f of group.files) {
      if (f.id !== keepFileId && f.source_id === keepFile.source_id) {
        if (f.source_status !== 'offline') {
          next.add(f.id);
        }
      }
    }
    setSelectedForTrash(next);
    toast.info(`Copia principale per ${keepFile.source_name || 'questo disco'} impostata.`);
  };

  const autoSelectIntraWasted = () => {
    const next = new Set<string>();
    let markedCount = 0;

    for (const group of duplicateGroups) {
      const bySource: Record<string, any[]> = {};
      for (const f of group.files) {
        if (!bySource[f.source_id]) bySource[f.source_id] = [];
        bySource[f.source_id].push(f);
      }

      for (const srcId in bySource) {
        const filesOnSrc = bySource[srcId];
        if (filesOnSrc.length > 1) {
          filesOnSrc.sort((a, b) => a.relative_path.length - b.relative_path.length);
          for (let i = 1; i < filesOnSrc.length; i++) {
            if (filesOnSrc[i].source_status !== 'offline') {
              next.add(filesOnSrc[i].id);
              markedCount++;
            }
          }
        }
      }
    }

    setSelectedForTrash(next);
    if (markedCount > 0) {
      toast.success(`Selezionate ${markedCount} copie ridondanti sullo stesso disco per .pmm_trash`);
    } else {
      const hasOffline = duplicateGroups.some((g) => g.files.some((f: any) => f.source_status === 'offline'));
      if (hasOffline) {
        toast.info('I doppioni rilevati appartengono a dischi attualmente non collegati (offline). Ricollega il disco per poterli cestinare.');
      } else {
        toast.info('Nessun doppione superfluo selezionabile rilevato tra i file caricati.');
      }
    }
  };

  const handleConfirmTrash = async () => {
    if (selectedForTrash.size === 0) return;
    setIsTrashing(true);
    try {
      const fileIds = Array.from(selectedForTrash);
      const res = await ApiClient.trashDuplicateFiles(fileIds);
      if (res.errors && res.errors.length > 0) {
        toast.info(`Spostati ${res.trashed_count} file. ${res.errors.length} errori riscontrati.`);
      } else {
        toast.success(`Spostati ${res.trashed_count} file nel cestino del disco (${formatBytes(res.trashed_bytes)})`);
      }
      setSelectedForTrash(new Set());
      setConfirmModalOpen(false);
      const mode = activeTab === 'multi_source' ? 'multi_source' : 'intra_source';
      await Promise.all([loadDuplicates(mode), loadSummary(), loadTrash()]);
    } catch (err: any) {
      console.error('Error trashing files:', err);
      toast.error(err?.message || 'Errore durante lo spostamento nel cestino.');
    } finally {
      setIsTrashing(false);
    }
  };

  const handleTrashSingleGroup = async (group: any) => {
    let toTrash: string[] = group.files.filter((f: any) => selectedForTrash.has(f.id)).map((f: any) => f.id);
    if (toTrash.length === 0) {
      const bySource: Record<string, any[]> = {};
      for (const f of group.files) {
        if (!bySource[f.source_id]) bySource[f.source_id] = [];
        bySource[f.source_id].push(f);
      }
      for (const sId in bySource) {
        const filesOnSrc = bySource[sId];
        if (filesOnSrc.length > 1) {
          filesOnSrc.sort((a, b) => a.relative_path.length - b.relative_path.length);
          for (let i = 1; i < filesOnSrc.length; i++) {
            if (filesOnSrc[i].source_status !== 'offline') {
              toTrash.push(filesOnSrc[i].id);
            }
          }
        }
      }
    }

    if (toTrash.length === 0) {
      toast.info('Nessuna copia ridondante online da cestinare per questo gruppo.');
      return;
    }

    const confirmed = window.confirm(
      `Spostare ${toTrash.length} copia/e ridondante/i nella cartella protetta .pmm_trash sullo stesso disco?\n\n` +
      `Almeno 1 copia originale resterà intatta e potrai ripristinare i file in qualsiasi momento dal Cestino Dischi.`
    );
    if (!confirmed) return;

    try {
      const res = await ApiClient.trashDuplicateFiles(toTrash);
      toast.success(`Spostate ${res.trashed_count} copie in .pmm_trash!`);
      const next = new Set(selectedForTrash);
      toTrash.forEach((id) => next.delete(id));
      setSelectedForTrash(next);
      const mode = activeTab === 'multi_source' ? 'multi_source' : 'intra_source';
      await Promise.all([loadDuplicates(mode), loadSummary(), loadTrash()]);
    } catch (err: any) {
      toast.error(err?.message || 'Errore durante lo spostamento');
    }
  };

  const handleRestoreFiles = async (fileIds: string[]) => {
    if (!fileIds || fileIds.length === 0) return;
    const nextRestoring = new Set(restoringFileIds);
    fileIds.forEach((id) => nextRestoring.add(id));
    setRestoringFileIds(nextRestoring);

    try {
      const res = await ApiClient.restoreTrashedFiles(fileIds);
      if (res.errors && res.errors.length > 0) {
        toast.info(`Ripristinati ${res.restored_count} file. ${res.errors.length} errori riscontrati.`);
      } else {
        toast.success(`Ripristinati con successo ${res.restored_count} file nella posizione originale!`);
      }
      await Promise.all([loadTrash(), loadSummary()]);
    } catch (err: any) {
      console.error('Error restoring files:', err);
      toast.error(err?.message || 'Errore durante il ripristino del file.');
    } finally {
      const updatedRestoring = new Set(restoringFileIds);
      fileIds.forEach((id) => updatedRestoring.delete(id));
      setRestoringFileIds(updatedRestoring);
    }
  };

  const handleExportGap = async (format: 'csv' | 'json' | 'rsync_txt') => {
    if (!primarySourceId || !backupSourceId) return;
    try {
      const url = ApiClient.getBackupGapExportUrl(primarySourceId, backupSourceId, format, gapOnlyFavorites);
      const res = await fetch(url, {
        headers: {
          Authorization: `Bearer ${ApiClient.getToken()}`
        }
      });
      const blob = await res.blob();
      const downloadUrl = window.URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = downloadUrl;
      const ext = format === 'rsync_txt' ? 'txt' : format;
      a.download = `mancanti_backup_${new Date().toISOString().slice(0, 10)}.${ext}`;
      document.body.appendChild(a);
      a.click();
      a.remove();
    } catch (err) {
      console.error('Export gap error:', err);
    }
  };

  const formatBytes = (bytes?: number) => {
    if (!bytes || bytes === 0) return '0 B';
    const k = 1024;
    const sizes = ['B', 'KB', 'MB', 'GB', 'TB'];
    const i = Math.floor(Math.log(bytes) / Math.log(k));
    return parseFloat((bytes / Math.pow(k, i)).toFixed(2)) + ' ' + sizes[i];
  };

  const primarySourceObj = sources.find((s) => s.id === primarySourceId);
  const backupSourceObj = sources.find((s) => s.id === backupSourceId);
  const rsyncExampleCmd = primarySourceObj?.root_path && backupSourceObj?.root_path
    ? `rsync -av --files-from=missing_on_backup_rsync.txt "${primarySourceObj.root_path}/" "${backupSourceObj.root_path}/"`
    : `rsync -av --files-from=missing_on_backup_rsync.txt "/Volumes/FontePrimaria/" "/Volumes/FonteBackup/"`;

  const copyRsyncToClipboard = () => {
    navigator.clipboard.writeText(rsyncExampleCmd);
    setCopiedRsyncCmd(true);
    setTimeout(() => setCopiedRsyncCmd(false), 2500);
  };

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>
      {/* 1. Header & Inline KPI Strip */}
      <div style={{
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'space-between',
        flexWrap: 'wrap',
        gap: '12px',
        paddingBottom: '2px'
      }}>
        {/* Title + Info Icon Popover */}
        <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
          <ShieldCheck size={22} color="#38bdf8" />
          <h2 style={{ fontSize: '18px', fontWeight: 700, color: '#f8fafc', margin: 0 }}>
            Duplicati & Ridondanza
          </h2>

          <div style={{ position: 'relative' }}>
            <button
              onClick={() => setInfoPopoverOpen(!infoPopoverOpen)}
              title="Informazioni sulla protezione e sicurezza (.pmm_trash)"
              style={{
                background: infoPopoverOpen ? '#334155' : 'transparent',
                border: 'none',
                color: infoPopoverOpen ? '#38bdf8' : '#94a3b8',
                padding: '4px',
                borderRadius: '6px',
                cursor: 'pointer',
                display: 'flex',
                alignItems: 'center',
                transition: 'all 0.15s ease'
              }}
            >
              <Info size={16} />
            </button>

            {infoPopoverOpen && (
              <div style={{
                position: 'absolute',
                top: '30px',
                left: 0,
                width: '360px',
                zIndex: 1000,
                background: '#0f172a',
                border: '1px solid #334155',
                boxShadow: '0 12px 30px rgba(0,0,0,0.6)',
                borderRadius: '10px',
                padding: '14px 16px',
                fontSize: '12px',
                color: '#cbd5e1'
              }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: '8px' }}>
                  <div style={{ fontWeight: 700, color: '#f8fafc', display: 'flex', alignItems: 'center', gap: '6px' }}>
                    <ShieldCheck size={14} color="#22c55e" />
                    Sicurezza & Protezione Cestino
                  </div>
                  <button
                    onClick={() => setInfoPopoverOpen(false)}
                    style={{ background: 'transparent', border: 'none', color: '#64748b', cursor: 'pointer', padding: 0 }}
                  >
                    <X size={14} />
                  </button>
                </div>
                <p style={{ margin: '0 0 10px 0', lineHeight: 1.5, color: '#94a3b8' }}>
                  Nessun file originale viene mai eliminato o distrutto. Le copie selezionate vengono spostate istantaneamente nella cartella protetta <code>.pmm_trash/files/</code> sulla radice dello stesso disco, con ripristino in 1 click. Almeno 1 copia per ciascun media resta sempre intatta nella sua posizione originale.
                </p>
                <div style={{ display: 'flex', justifyContent: 'flex-end', borderTop: '1px solid #1e293b', paddingTop: '8px' }}>
                  <button
                    onClick={handleDismissTrashInfoForever}
                    style={{
                      background: '#1e293b',
                      color: '#94a3b8',
                      border: '1px solid #334155',
                      padding: '4px 10px',
                      borderRadius: '6px',
                      fontSize: '11px',
                      cursor: 'pointer'
                    }}
                  >
                    Non mostrare più
                  </button>
                </div>
              </div>
            )}
          </div>
        </div>

        {/* Inline KPI Strip (single line, no heavy card) */}
        <div style={{
          display: 'flex',
          alignItems: 'center',
          gap: '12px',
          fontSize: '13px',
          color: '#cbd5e1',
          background: '#0f172a',
          border: '1px solid #334155',
          borderRadius: '8px',
          padding: '6px 14px'
        }}>
          {activeTab === 'intra_source' && (
            <>
              <span>Spreco totale: <strong style={{ color: '#fbbf24' }}>{formatBytes(summary?.intra_source_wasted_bytes ?? 0)}</strong></span>
              <span style={{ color: '#475569' }}>·</span>
              <span><strong>{summary?.intra_source_groups ?? duplicateGroups.length}</strong> gruppi con doppioni</span>
            </>
          )}

          {activeTab === 'multi_source' && (
            <>
              <span>Spazio in backup: <strong style={{ color: '#4ade80' }}>{formatBytes(summary?.multi_source_backup_bytes ?? 0)}</strong></span>
              <span style={{ color: '#475569' }}>·</span>
              <span><strong>{summary?.healthy_multi_source_groups ?? duplicateGroups.length}</strong> repliche sane</span>
            </>
          )}

          {activeTab === 'backup_gap' && (
            <>
              <span>Copertura: <strong style={{ color: '#38bdf8' }}>{summary?.protection_coverage_pct ?? 0}%</strong></span>
              <span style={{ color: '#475569' }}>·</span>
              <span><strong>{summary?.unprotected_media_count ?? 0}</strong> a rischio ({summary?.unprotected_favorites_count ?? 0} preferiti)</span>
            </>
          )}

          {activeTab === 'similar' && (
            <>
              <span><strong>{similarGroups.length}</strong> cluster simili rilevati</span>
            </>
          )}

          {activeTab === 'folder_advisor' && (
            <>
              <span>Consulente Cartelle & Riorganizzazione AI</span>
            </>
          )}

          {activeTab === 'trash' && (
            <>
              <span><strong>{trashData?.total_count ?? 0}</strong> file nel cestino</span>
              <span style={{ color: '#475569' }}>·</span>
              <span>Spazio recuperabile: <strong style={{ color: '#f87171' }}>{formatBytes(trashData?.total_bytes ?? 0)}</strong></span>
            </>
          )}
        </div>
      </div>

      {/* 2. Tabs Selector (4 visible tabs + Strumenti dropdown) */}
      <div style={{
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'space-between',
        flexWrap: 'wrap',
        gap: '8px'
      }}>
        <div style={{
          display: 'flex',
          background: '#0f172a',
          border: '1px solid #334155',
          borderRadius: '8px',
          padding: '3px',
          gap: '3px'
        }}>
          {/* Tab 1: Spreco */}
          <button
            onClick={() => setActiveTab('intra_source')}
            style={{
              background: activeTab === 'intra_source' ? '#1e293b' : 'transparent',
              color: activeTab === 'intra_source' ? '#f8fafc' : '#94a3b8',
              border: activeTab === 'intra_source' ? '1px solid #475569' : '1px solid transparent',
              borderRadius: '6px',
              padding: '6px 12px',
              fontSize: '12px',
              fontWeight: activeTab === 'intra_source' ? 600 : 500,
              cursor: 'pointer',
              display: 'flex',
              alignItems: 'center',
              gap: '6px'
            }}
          >
            {activeTab === 'intra_source' && <AlertTriangle size={13} color="#f59e0b" />}
            <span>Spreco</span>
            <span style={{
              fontSize: '10px',
              background: activeTab === 'intra_source' ? 'rgba(245, 158, 11, 0.2)' : '#1e293b',
              color: activeTab === 'intra_source' ? '#fbbf24' : '#64748b',
              padding: '1px 5px',
              borderRadius: '4px',
              fontWeight: 600
            }}>
              {summary?.intra_source_groups ?? duplicateGroups.length}
            </span>
          </button>

          {/* Tab 2: Backup sani */}
          <button
            onClick={() => setActiveTab('multi_source')}
            style={{
              background: activeTab === 'multi_source' ? '#1e293b' : 'transparent',
              color: activeTab === 'multi_source' ? '#f8fafc' : '#94a3b8',
              border: activeTab === 'multi_source' ? '1px solid #475569' : '1px solid transparent',
              borderRadius: '6px',
              padding: '6px 12px',
              fontSize: '12px',
              fontWeight: activeTab === 'multi_source' ? 600 : 500,
              cursor: 'pointer',
              display: 'flex',
              alignItems: 'center',
              gap: '6px'
            }}
          >
            {activeTab === 'multi_source' && <ShieldCheck size={13} color="#22c55e" />}
            <span>Backup sani</span>
            <span style={{
              fontSize: '10px',
              background: activeTab === 'multi_source' ? 'rgba(34, 197, 94, 0.2)' : '#1e293b',
              color: activeTab === 'multi_source' ? '#4ade80' : '#64748b',
              padding: '1px 5px',
              borderRadius: '4px',
              fontWeight: 600
            }}>
              {summary?.healthy_multi_source_groups ?? 0}
            </span>
          </button>

          {/* Tab 3: Copertura */}
          <button
            onClick={() => setActiveTab('backup_gap')}
            style={{
              background: activeTab === 'backup_gap' ? '#1e293b' : 'transparent',
              color: activeTab === 'backup_gap' ? '#f8fafc' : '#94a3b8',
              border: activeTab === 'backup_gap' ? '1px solid #475569' : '1px solid transparent',
              borderRadius: '6px',
              padding: '6px 12px',
              fontSize: '12px',
              fontWeight: activeTab === 'backup_gap' ? 600 : 500,
              cursor: 'pointer',
              display: 'flex',
              alignItems: 'center',
              gap: '6px'
            }}
          >
            {activeTab === 'backup_gap' && <ArrowLeftRight size={13} color="#38bdf8" />}
            <span>Copertura</span>
          </button>

          {/* Tab 4: Foto simili */}
          <button
            onClick={() => setActiveTab('similar')}
            style={{
              background: activeTab === 'similar' ? '#1e293b' : 'transparent',
              color: activeTab === 'similar' ? '#f8fafc' : '#94a3b8',
              border: activeTab === 'similar' ? '1px solid #475569' : '1px solid transparent',
              borderRadius: '6px',
              padding: '6px 12px',
              fontSize: '12px',
              fontWeight: activeTab === 'similar' ? 600 : 500,
              cursor: 'pointer',
              display: 'flex',
              alignItems: 'center',
              gap: '6px'
            }}
          >
            {activeTab === 'similar' && <Sparkles size={13} color="#c084fc" />}
            <span>Foto simili</span>
            {similarGroups.length > 0 && (
              <span style={{
                fontSize: '10px',
                background: activeTab === 'similar' ? 'rgba(192, 132, 252, 0.2)' : '#1e293b',
                color: activeTab === 'similar' ? '#c084fc' : '#64748b',
                padding: '1px 5px',
                borderRadius: '4px',
                fontWeight: 600
              }}>
                {similarGroups.length}
              </span>
            )}
          </button>
        </div>

        {/* Tools Menu (Dropdown on the right) */}
        <div style={{ position: 'relative' }}>
          <button
            onClick={() => setToolsMenuOpen(!toolsMenuOpen)}
            style={{
              background: (activeTab === 'folder_advisor' || activeTab === 'trash') ? '#1e293b' : '#0f172a',
              color: (activeTab === 'folder_advisor' || activeTab === 'trash') ? '#f8fafc' : '#94a3b8',
              border: (activeTab === 'folder_advisor' || activeTab === 'trash') ? '1px solid #475569' : '1px solid #334155',
              borderRadius: '8px',
              padding: '6px 12px',
              fontSize: '12px',
              fontWeight: 500,
              cursor: 'pointer',
              display: 'flex',
              alignItems: 'center',
              gap: '6px'
            }}
          >
            <MoreHorizontal size={14} />
            <span>
              {activeTab === 'folder_advisor' ? 'Consulente' : activeTab === 'trash' ? 'Cestino' : 'Strumenti'}
            </span>
            <ChevronDown size={12} color="#64748b" />
          </button>

          {toolsMenuOpen && (
            <div style={{
              position: 'absolute',
              top: '36px',
              right: 0,
              width: '210px',
              zIndex: 1000,
              background: '#0f172a',
              border: '1px solid #334155',
              boxShadow: '0 12px 24px rgba(0,0,0,0.5)',
              borderRadius: '8px',
              padding: '4px',
              display: 'flex',
              flexDirection: 'column',
              gap: '2px'
            }}>
              <button
                onClick={() => {
                  setActiveTab('folder_advisor');
                  setToolsMenuOpen(false);
                }}
                style={{
                  background: activeTab === 'folder_advisor' ? '#1e293b' : 'transparent',
                  color: activeTab === 'folder_advisor' ? '#c084fc' : '#cbd5e1',
                  border: 'none',
                  borderRadius: '6px',
                  padding: '8px 10px',
                  fontSize: '12px',
                  fontWeight: 500,
                  cursor: 'pointer',
                  display: 'flex',
                  alignItems: 'center',
                  gap: '8px',
                  textAlign: 'left'
                }}
              >
                <Brain size={14} color="#c084fc" />
                <span>Consulente Cartelle</span>
              </button>

              <button
                onClick={() => {
                  setActiveTab('trash');
                  setToolsMenuOpen(false);
                }}
                style={{
                  background: activeTab === 'trash' ? '#1e293b' : 'transparent',
                  color: activeTab === 'trash' ? '#f87171' : '#cbd5e1',
                  border: 'none',
                  borderRadius: '6px',
                  padding: '8px 10px',
                  fontSize: '12px',
                  fontWeight: 500,
                  cursor: 'pointer',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'space-between',
                  textAlign: 'left'
                }}
              >
                <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                  <Trash2 size={14} color="#ef4444" />
                  <span>Cestino Dischi</span>
                </div>
                {trashData?.total_count ? (
                  <span style={{
                    fontSize: '10px',
                    background: 'rgba(239, 68, 68, 0.15)',
                    color: '#f87171',
                    padding: '1px 5px',
                    borderRadius: '4px',
                    fontWeight: 600
                  }}>
                    {trashData.total_count}
                  </span>
                ) : null}
              </button>
            </div>
          )}
        </div>
      </div>

      {/* Optional dismissible trash safety notice (only if not permanently hidden) */}
      {showTrashInfo && (
        <div style={{
          background: '#0f172a',
          border: '1px solid #334155',
          borderRadius: '8px',
          padding: '8px 14px',
          fontSize: '12px',
          color: '#94a3b8',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          gap: '10px'
        }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
            <Info size={14} color="#38bdf8" style={{ flexShrink: 0 }} />
            <span>
              <strong>Protezione Non-Distruttiva:</strong> I file non vengono eliminati, ma spostati nella cartella protetta <code>.pmm_trash/files/</code> del rispettivo disco con ripristino in 1 click.
            </span>
          </div>
          <button
            onClick={handleDismissTrashInfoForever}
            title="Non mostrare più questo avviso"
            style={{
              background: 'transparent',
              border: 'none',
              color: '#64748b',
              fontSize: '11px',
              cursor: 'pointer',
              display: 'flex',
              alignItems: 'center',
              gap: '4px',
              flexShrink: 0
            }}
          >
            <span>Non mostrare più</span>
            <X size={12} />
          </button>
        </div>
      )}

      {/* TAB 1 & 2: INTRA_SOURCE DUPLICATES OR HEALTHY MULTI-SOURCE REPLICAS */}
      {(activeTab === 'intra_source' || activeTab === 'multi_source') && (
        <div style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
          {/* Controls Bar: Left (Counter + Filters) | Right (Primary Action + Split + Export) */}
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: '10px' }}>
            {/* Left: Counter, Source Filter, Sort Filter */}
            <div style={{ display: 'flex', alignItems: 'center', gap: '8px', flexWrap: 'wrap' }}>
              <div style={{ fontSize: '12px', color: '#94a3b8', fontWeight: 500, marginRight: '4px' }}>
                <strong style={{ color: '#f8fafc' }}>{displayedDuplicateGroups.length}</strong> di {summary?.intra_source_groups ?? duplicateGroups.length} gruppi
              </div>

              {sources.length > 0 && (
                <select
                  value={preferredSourceId}
                  onChange={(e) => setPreferredSourceId(e.target.value)}
                  style={{
                    background: '#0f172a',
                    color: '#cbd5e1',
                    border: '1px solid #334155',
                    borderRadius: '6px',
                    padding: '5px 8px',
                    fontSize: '12px'
                  }}
                >
                  <option value="">Tutti i dischi</option>
                  {sources.map((s) => (
                    <option key={s.id} value={s.id}>{s.name}</option>
                  ))}
                </select>
              )}

              <select
                value={sortBy}
                onChange={(e) => setSortBy(e.target.value as any)}
                style={{
                  background: '#0f172a',
                  color: '#cbd5e1',
                  border: '1px solid #334155',
                  borderRadius: '6px',
                  padding: '5px 8px',
                  fontSize: '12px'
                }}
              >
                <option value="wasted_desc">Ordina: Spreco decrescente ↓</option>
                <option value="size_desc">Ordina: Dimensione file ↓</option>
                <option value="name_asc">Ordina: Nome file (A-Z)</option>
                <option value="date_desc">Ordina: Data recente ↓</option>
              </select>
            </div>

            {/* Right: Primary Action + Secondary Heuristic + Unified Export */}
            <div style={{ display: 'flex', alignItems: 'center', gap: '8px', flexWrap: 'wrap' }}>
              {activeTab === 'intra_source' && duplicateGroups.length > 0 && (
                <>
                  {/* Primary Action Button */}
                  <button
                    onClick={autoSelectIntraWasted}
                    title="Mantiene 1 copia originale per ogni disco e marca tutte le altre copie extra dello stesso disco per lo spostamento in .pmm_trash"
                    style={{
                      background: '#0284c7',
                      color: 'white',
                      border: 'none',
                      borderRadius: '6px',
                      padding: '6px 12px',
                      fontSize: '12px',
                      fontWeight: 600,
                      cursor: 'pointer',
                      display: 'flex',
                      alignItems: 'center',
                      gap: '5px'
                    }}
                  >
                    <Zap size={13} />
                    Seleziona spreco (tieni 1 per disco)
                  </button>

                  {/* Secondary Heuristic Option */}
                  <button
                    onClick={handleSuggestKeepCopies}
                    disabled={loadingSuggestions}
                    title="Valuta la qualità dei percorsi (date, nomi descrittivi, cartelle generiche) con l'euristica locale e suggerisce quali copie tenere"
                    style={{
                      background: '#1e293b',
                      color: '#cbd5e1',
                      border: '1px solid #334155',
                      borderRadius: '6px',
                      padding: '6px 10px',
                      fontSize: '12px',
                      fontWeight: 500,
                      cursor: loadingSuggestions ? 'not-allowed' : 'pointer',
                      display: 'flex',
                      alignItems: 'center',
                      gap: '5px'
                    }}
                  >
                    <Sparkles size={13} color="#c084fc" />
                    {loadingSuggestions ? 'Analisi...' : 'Suggerisci (euristica)'}
                  </button>
                </>
              )}

              {/* Unified Export Dropdown */}
              <div style={{ position: 'relative' }}>
                <button
                  onClick={() => setExportMenuOpen(!exportMenuOpen)}
                  style={{
                    background: '#1e293b',
                    color: '#cbd5e1',
                    border: '1px solid #334155',
                    borderRadius: '6px',
                    padding: '6px 10px',
                    fontSize: '12px',
                    fontWeight: 500,
                    cursor: 'pointer',
                    display: 'flex',
                    alignItems: 'center',
                    gap: '5px'
                  }}
                >
                  <Download size={13} color="#38bdf8" />
                  <span>Esporta</span>
                  <ChevronDown size={11} color="#64748b" />
                </button>

                {exportMenuOpen && (
                  <div style={{
                    position: 'absolute',
                    top: '32px',
                    right: 0,
                    width: '130px',
                    zIndex: 1000,
                    background: '#0f172a',
                    border: '1px solid #334155',
                    boxShadow: '0 8px 20px rgba(0,0,0,0.5)',
                    borderRadius: '6px',
                    padding: '3px',
                    display: 'flex',
                    flexDirection: 'column',
                    gap: '2px'
                  }}>
                    <button
                      onClick={() => {
                        handleExport('csv');
                        setExportMenuOpen(false);
                      }}
                      style={{
                        background: 'transparent',
                        color: '#cbd5e1',
                        border: 'none',
                        borderRadius: '4px',
                        padding: '6px 8px',
                        fontSize: '12px',
                        cursor: 'pointer',
                        textAlign: 'left'
                      }}
                    >
                      Esporta CSV
                    </button>
                    <button
                      onClick={() => {
                        handleExport('json');
                        setExportMenuOpen(false);
                      }}
                      style={{
                        background: 'transparent',
                        color: '#cbd5e1',
                        border: 'none',
                        borderRadius: '4px',
                        padding: '6px 8px',
                        fontSize: '12px',
                        cursor: 'pointer',
                        textAlign: 'left'
                      }}
                    >
                      Esporta JSON
                    </button>
                  </div>
                )}
              </div>
            </div>
          </div>

          {displayedDuplicateGroups.length === 0 && !loading ? (
            <div style={{
              textAlign: 'center',
              padding: '60px 20px',
              background: '#1e293b',
              borderRadius: '12px',
              border: '1px solid #334155'
            }}>
              <CheckCircle2 size={44} color="#22c55e" style={{ margin: '0 auto 14px' }} />
              <h3 style={{ fontSize: '17px', fontWeight: 600 }}>
                {activeTab === 'intra_source' ? 'Nessun doppione intra-disco rilevato!' : 'Nessuna replica multi-disco trovata.'}
              </h3>
              <p style={{ color: '#94a3b8', fontSize: '13px', marginTop: '6px' }}>
                {activeTab === 'intra_source'
                  ? 'Tutti i file su ciascun disco fisico sono unici. Zero spreco di spazio interno.'
                  : 'Nessun file risulta attualmente replicato su 2 o più dischi distinti.'}
              </p>
            </div>
          ) : (
            <div style={{ display: 'flex', flexDirection: 'column', gap: '10px' }}>
              {displayedDuplicateGroups.map((group) => {
                const isHealthy = group.redundancy_type === 'healthy_multi_source';

                // Check if all copies are on the same source
                const uniqueSources = Array.from(new Set<string>(group.files.map((f: any) => String(f.source_name || 'Fonte'))));
                const isSingleSourceGroup = uniqueSources.length === 1;
                const commonSourceName: string | null = isSingleSourceGroup ? uniqueSources[0] : null;

                // Check wasted files in this group: any file on a source where copies > 1 that is NOT the keeper for that source
                const wastedFilesInGroup = group.files.filter((file: any) => {
                  const countOnSource = group.files.filter((f: any) => f.source_id === file.source_id).length;
                  if (countOnSource <= 1) return false;
                  const keeperId = getKeeperFileIdForSource(group, file.source_id);
                  return file.id !== keeperId && file.source_status !== 'offline';
                });
                const allWastedSelected = wastedFilesInGroup.length > 0 && wastedFilesInGroup.every((f: any) => selectedForTrash.has(f.id));

                const toggleAllWastedInGroup = () => {
                  const next = new Set(selectedForTrash);
                  if (allWastedSelected) {
                    wastedFilesInGroup.forEach((f: any) => next.delete(f.id));
                  } else {
                    wastedFilesInGroup.forEach((f: any) => next.add(f.id));
                  }
                  setSelectedForTrash(next);
                };

                const isVideo = group.files[0]?.mime_type?.startsWith('video') ||
                  !!group.files[0]?.filename?.match(/\.(mp4|mov|m4v|avi|mkv|webm)$/i);

                return (
                  <div
                    key={group.media_id}
                    style={{
                      background: '#1e293b',
                      border: isHealthy ? '1px solid rgba(34, 197, 94, 0.3)' : '1px solid #334155',
                      borderRadius: '10px',
                      overflow: 'hidden',
                      transition: 'border-color 0.15s ease'
                    }}
                  >
                    {/* Compact Group Header (Single row) */}
                    <div style={{
                      background: '#0f172a',
                      padding: '8px 14px',
                      borderBottom: '1px solid #1e293b',
                      display: 'flex',
                      justifyContent: 'space-between',
                      alignItems: 'center',
                      gap: '10px'
                    }}>
                      {/* Left: Checkbox, Filename, Disk (if single), Copies badge (>2), Waste metric */}
                      <div style={{ display: 'flex', alignItems: 'center', gap: '8px', minWidth: 0, flex: 1, flexWrap: 'wrap' }}>
                        {wastedFilesInGroup.length > 0 && (
                          <input
                            type="checkbox"
                            checked={allWastedSelected}
                            onChange={toggleAllWastedInGroup}
                            title={allWastedSelected ? "Deseleziona spreco del gruppo" : "Seleziona spreco del gruppo"}
                            style={{ cursor: 'pointer', accentColor: '#0284c7', flexShrink: 0 }}
                          />
                        )}

                        <div
                          onClick={() => setSelectedMediaId(group.media_id)}
                          title={`${group.files[0]?.filename} (clicca per visualizzare i dettagli)`}
                          style={{
                            fontWeight: 600,
                            fontSize: '13px',
                            color: '#f8fafc',
                            overflow: 'hidden',
                            textOverflow: 'ellipsis',
                            whiteSpace: 'nowrap',
                            cursor: 'pointer'
                          }}
                        >
                          {group.files[0]?.filename}
                        </div>

                        {/* Common Disk Badge */}
                        {commonSourceName && (
                          <span style={{
                            background: '#1e293b',
                            border: '1px solid #334155',
                            color: '#94a3b8',
                            fontSize: '11px',
                            padding: '2px 7px',
                            borderRadius: '5px',
                            display: 'inline-flex',
                            alignItems: 'center',
                            gap: '4px',
                            flexShrink: 0
                          }}>
                            <HardDrive size={11} color="#94a3b8" />
                            <span>{commonSourceName}</span>
                          </span>
                        )}

                        {/* Copies badge only if > 2 */}
                        {group.copies_count > 2 && (
                          <span style={{
                            background: 'rgba(245, 158, 11, 0.1)',
                            color: '#fbbf24',
                            border: '1px solid rgba(245, 158, 11, 0.3)',
                            fontSize: '11px',
                            fontWeight: 700,
                            padding: '1px 6px',
                            borderRadius: '4px',
                            flexShrink: 0
                          }}>
                            ×{group.copies_count}
                          </span>
                        )}

                        {/* Waste Metric (if there is intra-source waste) */}
                        {group.intra_source_wasted_bytes > 0 && (
                          <span style={{
                            fontSize: '12px',
                            color: '#fbbf24',
                            fontWeight: 600,
                            flexShrink: 0
                          }}>
                            Spreco {formatBytes(group.intra_source_wasted_bytes)}
                          </span>
                        )}

                        {/* Healthy multi-source coverage badge */}
                        {group.distinct_sources_count >= 2 && (
                          <span style={{
                            fontSize: '12px',
                            color: '#4ade80',
                            fontWeight: 600,
                            display: 'inline-flex',
                            alignItems: 'center',
                            gap: '4px',
                            flexShrink: 0
                          }}>
                            <ShieldCheck size={12} />
                            Backup su {group.distinct_sources_count} dischi
                          </span>
                        )}
                      </div>

                      {/* Right: Copy SHA & Group Trash Action */}
                      <div style={{ display: 'flex', alignItems: 'center', gap: '8px', flexShrink: 0 }}>
                        <button
                          onClick={(e) => handleCopySha(group.canonical_sha256, group.media_id, e)}
                          title="Copia l'hash SHA-256 univoco del file"
                          style={{
                            background: copiedShaMediaId === group.media_id ? 'rgba(34, 197, 94, 0.15)' : '#1e293b',
                            color: copiedShaMediaId === group.media_id ? '#4ade80' : '#64748b',
                            border: '1px solid #334155',
                            borderRadius: '5px',
                            padding: '3px 8px',
                            fontSize: '10px',
                            fontFamily: 'monospace',
                            cursor: 'pointer',
                            display: 'inline-flex',
                            alignItems: 'center',
                            gap: '4px'
                          }}
                        >
                          <Copy size={11} />
                          <span>{copiedShaMediaId === group.media_id ? 'Copiato!' : group.canonical_sha256.substring(0, 8)}</span>
                        </button>

                        <button
                          onClick={() => handleTrashSingleGroup(group)}
                          title="Sposta le copie ridondanti di questo gruppo nel cestino del disco"
                          style={{
                            background: 'transparent',
                            color: '#94a3b8',
                            border: '1px solid #334155',
                            borderRadius: '5px',
                            padding: '4px 6px',
                            cursor: 'pointer',
                            display: 'flex',
                            alignItems: 'center',
                            justifyContent: 'center',
                            transition: 'all 0.15s ease'
                          }}
                        >
                          <Trash2 size={13} color="#f87171" />
                        </button>
                      </div>
                    </div>

                    {/* Group Body: Compact 64px Thumbnail + Tabular Copy Rows */}
                    <div style={{ display: 'flex', alignItems: 'center', padding: '10px 14px', gap: '14px' }}>
                      {/* Compact 64x64px Thumbnail with Overlays */}
                      <div
                        onClick={() => setSelectedMediaId(group.media_id)}
                        style={{
                          width: '64px',
                          height: '64px',
                          borderRadius: '8px',
                          background: '#090d16',
                          cursor: 'pointer',
                          position: 'relative',
                          overflow: 'hidden',
                          flexShrink: 0,
                          border: '1px solid #334155'
                        }}
                      >
                        {group.has_thumbnail ? (
                          <img
                            src={ApiClient.getThumbnailUrl(group.media_id)}
                            alt="Thumbnail"
                            style={{ width: '100%', height: '100%', objectFit: 'cover' }}
                          />
                        ) : (
                          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', height: '100%' }}>
                            <FileText size={22} color="#64748b" />
                          </div>
                        )}

                        {/* Video indicator badge */}
                        {isVideo && (
                          <div style={{
                            position: 'absolute',
                            top: '3px',
                            left: '3px',
                            background: 'rgba(0, 0, 0, 0.75)',
                            borderRadius: '3px',
                            padding: '1px 3px',
                            display: 'flex',
                            alignItems: 'center'
                          }}>
                            <Video size={10} color="#38bdf8" />
                          </div>
                        )}

                        {/* File size badge */}
                        <div style={{
                          position: 'absolute',
                          bottom: '2px',
                          right: '2px',
                          background: 'rgba(0, 0, 0, 0.8)',
                          color: '#cbd5e1',
                          fontSize: '9px',
                          fontWeight: 600,
                          padding: '0 4px',
                          borderRadius: '3px',
                          lineHeight: '13px'
                        }}>
                          {formatBytes(group.files[0]?.size_bytes)}
                        </div>
                      </div>

                      {/* Tabular Grid Copy Rows: [Radio] | [Path] | [Disk] | [Status] | [Action] */}
                      <div style={{ flex: 1, display: 'flex', flexDirection: 'column', gap: '5px', minWidth: 0 }}>
                        {group.files.map((file: any) => {
                          const countOnSameSource = group.files.filter((f: any) => f.source_id === file.source_id).length;
                          const isDuplicateOnSource = countOnSameSource > 1;
                          const keeperIdForSource = isDuplicateOnSource ? getKeeperFileIdForSource(group, file.source_id) : file.id;
                          const isKeeper = file.id === keeperIdForSource;
                          const isMarkedForTrash = selectedForTrash.has(file.id);
                          const isOffline = file.source_status === 'offline';
                          const suggestion = keepSuggestions[group.media_id];
                          const fileScore = suggestion?.scores?.[file.id];
                          const fileReason = suggestion?.reasons?.[file.id];

                          return (
                            <div
                              key={file.id}
                              style={{
                                display: 'grid',
                                gridTemplateColumns: '24px 1fr 120px 75px 80px 105px',
                                alignItems: 'center',
                                gap: '10px',
                                height: '36px',
                                minHeight: '36px',
                                maxHeight: '36px',
                                boxSizing: 'border-box',
                                background: isMarkedForTrash ? 'rgba(239, 68, 68, 0.04)' : '#0b0f19',
                                border: isMarkedForTrash
                                  ? '1px solid rgba(239, 68, 68, 0.25)'
                                  : isKeeper
                                    ? '1px solid rgba(34, 197, 94, 0.2)'
                                    : '1px solid #1e293b',
                                borderRadius: '6px',
                                padding: '0 12px',
                                fontSize: '12px',
                                transition: 'all 0.15s ease'
                              }}
                            >
                              {/* Col 1: Selection Radio (for intra duplicates) or Shield Icon (for single backup copy) */}
                              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', height: '100%' }}>
                                {isDuplicateOnSource ? (
                                  <input
                                    type="radio"
                                    name={`keep_${group.media_id}_${file.source_id}`}
                                    checked={isKeeper}
                                    onChange={() => setPrimaryKeepInGroup(group, file.id)}
                                    title="Seleziona questa copia come principale da conservare"
                                    style={{
                                      cursor: 'pointer',
                                      accentColor: '#22c55e',
                                      width: '15px',
                                      height: '15px',
                                      margin: 0,
                                      display: 'block'
                                    }}
                                  />
                                ) : (
                                  <div title="Copia di backup unica su questo supporto" style={{ display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                                    <ShieldCheck size={15} color="#38bdf8" />
                                  </div>
                                )}
                              </div>

                              {/* Col 2: Folder Path with Smart Diff & Score */}
                              <div style={{ display: 'flex', alignItems: 'center', gap: '8px', minWidth: 0, overflow: 'hidden', height: '100%' }}>
                                <Folder size={12} color="#64748b" style={{ flexShrink: 0 }} />
                                <div style={{ minWidth: 0, overflow: 'hidden' }}>
                                  {renderSmartPath(file.relative_path, group.files.map((f: any) => f.relative_path))}
                                </div>
                                {fileScore !== undefined && (
                                  <span
                                    title={fileReason || `Punteggio qualità percorso: ${fileScore}/100`}
                                    style={{
                                      fontSize: '10px',
                                      padding: '1px 5px',
                                      borderRadius: '4px',
                                      background: '#1e293b',
                                      border: '1px solid #334155',
                                      color: '#94a3b8',
                                      fontWeight: 500,
                                      cursor: 'help',
                                      flexShrink: 0
                                    }}
                                  >
                                    Score {fileScore}
                                  </span>
                                )}
                              </div>

                              {/* Col 3: Disk / Source Name */}
                              <div
                                title={file.source_name || 'Fonte'}
                                style={{
                                  display: 'flex',
                                  alignItems: 'center',
                                  gap: '6px',
                                  color: '#cbd5e1',
                                  fontSize: '12px',
                                  minWidth: 0,
                                  overflow: 'hidden',
                                  height: '100%'
                                }}
                              >
                                <HardDrive size={12} color="#64748b" style={{ flexShrink: 0 }} />
                                <span style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                                  {file.source_name || 'Fonte'}
                                </span>
                              </div>

                              {/* Col 4: Hardware Status (Clean neutral slate dot & text) */}
                              <div style={{
                                display: 'flex',
                                alignItems: 'center',
                                gap: '6px',
                                fontSize: '11px',
                                color: isOffline ? '#64748b' : '#94a3b8',
                                height: '100%'
                              }}>
                                <span style={{
                                  width: '6px',
                                  height: '6px',
                                  borderRadius: '50%',
                                  background: isOffline ? '#475569' : '#22c55e',
                                  flexShrink: 0
                                }} />
                                <span>{isOffline ? 'Offline' : 'Online'}</span>
                              </div>

                              {/* Col 5: Dedicated Finder Reveal Column */}
                              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', height: '100%' }}>
                                <button
                                  type="button"
                                  disabled={isOffline || revealingFileId === file.id}
                                  onClick={(e) => handleRevealFile(e, file.id, file.filename)}
                                  title={isOffline ? "Disco offline: impossibile aprire nel Finder" : "Mostra questo file nel Finder"}
                                  style={{
                                    height: '24px',
                                    width: '100%',
                                    boxSizing: 'border-box',
                                    background: 'transparent',
                                    border: '1px solid ' + (isOffline ? '#334155' : 'rgba(56, 189, 248, 0.35)'),
                                    color: isOffline ? '#475569' : '#38bdf8',
                                    cursor: isOffline ? 'not-allowed' : 'pointer',
                                    padding: '0 6px',
                                    borderRadius: '5px',
                                    display: 'inline-flex',
                                    alignItems: 'center',
                                    justifyContent: 'center',
                                    gap: '4px',
                                    fontSize: '11px',
                                    fontWeight: 500,
                                    opacity: isOffline ? 0.45 : 0.95,
                                    lineHeight: 1,
                                    margin: 0
                                  }}
                                >
                                  <FolderOpen size={11} />
                                  <span>{revealingFileId === file.id ? '...' : 'Finder'}</span>
                                </button>
                              </div>

                              {/* Col 6: Dedicated Destination Role / Action Column */}
                              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', height: '100%' }}>
                                {isDuplicateOnSource ? (
                                  isKeeper ? (
                                    <span
                                      title="Copia principale conservata"
                                      style={{
                                        height: '24px',
                                        width: '100%',
                                        boxSizing: 'border-box',
                                        display: 'inline-flex',
                                        alignItems: 'center',
                                        justifyContent: 'center',
                                        gap: '4px',
                                        fontSize: '11px',
                                        fontWeight: 600,
                                        color: '#4ade80',
                                        background: 'rgba(34, 197, 94, 0.1)',
                                        border: '1px solid rgba(34, 197, 94, 0.25)',
                                        borderRadius: '5px',
                                        lineHeight: 1,
                                        margin: 0,
                                        padding: '0 8px'
                                      }}
                                    >
                                      <Check size={11} />
                                      Principale
                                    </span>
                                  ) : isOffline ? (
                                    <span
                                      title="Doppione da eliminare (collega il disco per spostare nel cestino)"
                                      style={{
                                        height: '24px',
                                        width: '100%',
                                        boxSizing: 'border-box',
                                        display: 'inline-flex',
                                        alignItems: 'center',
                                        justifyContent: 'center',
                                        gap: '4px',
                                        fontSize: '11px',
                                        fontWeight: 500,
                                        color: '#f87171',
                                        background: 'rgba(239, 68, 68, 0.08)',
                                        border: '1px solid rgba(239, 68, 68, 0.2)',
                                        borderRadius: '5px',
                                        opacity: 0.85,
                                        lineHeight: 1,
                                        margin: 0,
                                        padding: '0 8px'
                                      }}
                                    >
                                      <Trash2 size={11} />
                                      Cestino
                                    </span>
                                  ) : (
                                    <button
                                      onClick={() => toggleFileTrash(group, file.id)}
                                      title={isMarkedForTrash ? "Deseleziona dal cestino" : "Marca per il cestino"}
                                      style={{
                                        height: '24px',
                                        width: '100%',
                                        boxSizing: 'border-box',
                                        background: isMarkedForTrash ? 'rgba(239, 68, 68, 0.15)' : 'transparent',
                                        color: isMarkedForTrash ? '#f87171' : '#94a3b8',
                                        border: `1px solid ${isMarkedForTrash ? 'rgba(239, 68, 68, 0.4)' : '#334155'}`,
                                        borderRadius: '5px',
                                        fontSize: '11px',
                                        fontWeight: 600,
                                        cursor: 'pointer',
                                        display: 'inline-flex',
                                        alignItems: 'center',
                                        justifyContent: 'center',
                                        gap: '4px',
                                        transition: 'all 0.15s ease',
                                        lineHeight: 1,
                                        margin: 0,
                                        padding: '0 8px'
                                      }}
                                    >
                                      <Trash2 size={11} />
                                      {isMarkedForTrash ? 'Nel Cestino' : 'Cestina'}
                                    </button>
                                  )
                                ) : (
                                  <span
                                    title="Copia unica e sicura su questo disco"
                                    style={{
                                      height: '24px',
                                      width: '100%',
                                      boxSizing: 'border-box',
                                      display: 'inline-flex',
                                      alignItems: 'center',
                                      justifyContent: 'center',
                                      gap: '4px',
                                      fontSize: '11px',
                                      color: '#38bdf8',
                                      background: 'rgba(56, 189, 248, 0.08)',
                                      border: '1px solid rgba(56, 189, 248, 0.2)',
                                      borderRadius: '5px',
                                      lineHeight: 1,
                                      margin: 0,
                                      padding: '0 8px'
                                    }}
                                  >
                                    <ShieldCheck size={11} />
                                    Backup Sano
                                  </span>
                                )}
                              </div>
                            </div>
                          );
                        })}
                      </div>
                    </div>
                  </div>
                );
              })}

              <div style={{ display: 'flex', justifyContent: 'center', marginTop: '12px' }}>
                <button
                  onClick={handleLoadMore}
                  disabled={loadingMore}
                  style={{
                    background: '#1e293b',
                    border: '1px solid #334155',
                    color: 'white',
                    padding: '10px 20px',
                    borderRadius: '8px',
                    fontSize: '13px',
                    fontWeight: 600,
                    cursor: loadingMore ? 'not-allowed' : 'pointer'
                  }}
                >
                  {loadingMore ? 'Caricamento...' : 'Carica altri gruppi (+50)'}
                </button>
              </div>
            </div>
          )}
        </div>
      )}

      {/* TAB 3: BACKUP GAP ANALYSIS */}
      {activeTab === 'backup_gap' && (
        <div style={{ display: 'flex', flexDirection: 'column', gap: '20px' }}>
          {/* Source Selection & Option Header */}
          <div style={{
            background: '#1e293b',
            border: '1px solid #334155',
            borderRadius: '12px',
            padding: '20px',
            display: 'flex',
            flexDirection: 'column',
            gap: '16px'
          }}>
            <h3 style={{ fontSize: '16px', fontWeight: 600, display: 'flex', alignItems: 'center', gap: '8px', margin: 0 }}>
              <ArrowLeftRight size={18} color="#38bdf8" />
              Confronto Copertura tra 2 Fonti (Gap Analysis)
            </h3>
            <p style={{ color: '#94a3b8', fontSize: '13px', margin: 0 }}>
              Seleziona la <strong>Fonte Primaria</strong> (es. SSD del Mac o iPhone) e la <strong>Fonte di Backup</strong> (es. Hard Disk esterno o NAS). L'analisi individuerà quali file della Fonte Primaria non sono ancora stati copiati sul disco di backup.
            </p>

            <div style={{ display: 'flex', alignItems: 'center', gap: '14px', flexWrap: 'wrap' }}>
              <div style={{ display: 'flex', flexDirection: 'column', gap: '4px', flex: '1 1 240px' }}>
                <label style={{ fontSize: '12px', color: '#94a3b8', fontWeight: 600 }}>Fonte Primaria (Originali):</label>
                <select
                  value={primarySourceId}
                  onChange={(e) => setPrimarySourceId(e.target.value)}
                  style={{
                    background: '#0f172a',
                    border: '1px solid #334155',
                    borderRadius: '8px',
                    color: 'white',
                    padding: '8px 12px',
                    fontSize: '13px'
                  }}
                >
                  {sources.map((s) => (
                    <option key={s.id} value={s.id}>{s.name} ({s.file_count || 0} file)</option>
                  ))}
                </select>
              </div>

              <div style={{ paddingTop: '20px' }}>
                <ArrowRight size={20} color="#64748b" />
              </div>

              <div style={{ display: 'flex', flexDirection: 'column', gap: '4px', flex: '1 1 240px' }}>
                <label style={{ fontSize: '12px', color: '#94a3b8', fontWeight: 600 }}>Fonte di Backup (Destinazione):</label>
                <select
                  value={backupSourceId}
                  onChange={(e) => setBackupSourceId(e.target.value)}
                  style={{
                    background: '#0f172a',
                    border: '1px solid #334155',
                    borderRadius: '8px',
                    color: 'white',
                    padding: '8px 12px',
                    fontSize: '13px'
                  }}
                >
                  {sources.map((s) => (
                    <option key={s.id} value={s.id}>{s.name} ({s.file_count || 0} file)</option>
                  ))}
                </select>
              </div>

              <div style={{ display: 'flex', alignItems: 'center', gap: '8px', paddingTop: '22px' }}>
                <label style={{ fontSize: '13px', display: 'flex', alignItems: 'center', gap: '6px', cursor: 'pointer' }}>
                  <input
                    type="checkbox"
                    checked={gapOnlyFavorites}
                    onChange={(e) => setGapOnlyFavorites(e.target.checked)}
                    style={{ accentColor: '#f43f5e', cursor: 'pointer' }}
                  />
                  <span style={{ display: 'flex', alignItems: 'center', gap: '4px' }}>
                    Solo Preferiti
                    <Heart size={12} fill="#f43f5e" color="#f43f5e" />
                  </span>
                </label>
              </div>
            </div>
          </div>

          {/* Gap Results Card */}
          {loadingGap ? (
            <div style={{ textAlign: 'center', padding: '50px', color: '#94a3b8' }}>
              Calcolo gap di backup in corso...
            </div>
          ) : gapData ? (
            <div style={{ display: 'flex', flexDirection: 'column', gap: '20px' }}>
              {/* Coverage KPI & Progress */}
              <div style={{
                background: '#1e293b',
                border: '1px solid #334155',
                borderRadius: '12px',
                padding: '20px',
                display: 'flex',
                flexDirection: 'column',
                gap: '14px'
              }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: '10px' }}>
                  <div>
                    <span style={{ fontSize: '13px', color: '#94a3b8' }}>Stato Copertura Backup:</span>
                    <div style={{ fontSize: '24px', fontWeight: 800, color: gapData.coverage_pct === 100 ? '#22c55e' : '#f59e0b', marginTop: '2px' }}>
                      {gapData.coverage_pct}% Copiato
                    </div>
                  </div>
                  <div style={{ textAlign: 'right', fontSize: '13px', color: '#94a3b8' }}>
                    <div><strong>{gapData.backed_up_media}</strong> su <strong>{gapData.total_primary_media}</strong> media salvati</div>
                    <div style={{ color: gapData.missing_on_backup_count > 0 ? '#f43f5e' : '#22c55e', fontWeight: 600, marginTop: '2px' }}>
                      {gapData.missing_on_backup_count} mancanti ({formatBytes(gapData.missing_on_backup_bytes)})
                    </div>
                  </div>
                </div>

                <div style={{ width: '100%', height: '10px', background: '#0f172a', borderRadius: '5px', overflow: 'hidden' }}>
                  <div style={{
                    width: `${gapData.coverage_pct}%`,
                    height: '100%',
                    background: gapData.coverage_pct === 100 ? '#22c55e' : 'linear-gradient(90deg, #f59e0b, #22c55e)',
                    borderRadius: '5px',
                    transition: 'width 0.4s ease'
                  }} />
                </div>

                {/* Export Buttons */}
                {gapData.missing_on_backup_count > 0 && (
                  <div style={{ display: 'flex', gap: '10px', flexWrap: 'wrap', marginTop: '6px' }}>
                    <button
                      onClick={() => handleExportGap('csv')}
                      style={{
                        background: '#0284c7',
                        color: 'white',
                        border: 'none',
                        borderRadius: '6px',
                        padding: '8px 14px',
                        fontSize: '12px',
                        fontWeight: 600,
                        cursor: 'pointer',
                        display: 'flex',
                        alignItems: 'center',
                        gap: '6px'
                      }}
                    >
                      <Download size={14} /> Esporta CSV Mancanti
                    </button>
                    <button
                      onClick={() => handleExportGap('rsync_txt')}
                      style={{
                        background: '#334155',
                        color: '#f8fafc',
                        border: '1px solid #475569',
                        borderRadius: '6px',
                        padding: '8px 14px',
                        fontSize: '12px',
                        fontWeight: 600,
                        cursor: 'pointer',
                        display: 'flex',
                        alignItems: 'center',
                        gap: '6px'
                      }}
                    >
                      <FileCode size={14} /> Esporta Lista rsync (.txt)
                    </button>
                  </div>
                )}
              </div>

              {/* Rsync Helper Card */}
              {gapData.missing_on_backup_count > 0 && (
                <div style={{
                  background: '#0f172a',
                  border: '1px solid #334155',
                  borderRadius: '10px',
                  padding: '16px',
                  display: 'flex',
                  flexDirection: 'column',
                  gap: '8px'
                }}>
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                    <span style={{ fontSize: '12px', fontWeight: 600, color: '#38bdf8', display: 'flex', alignItems: 'center', gap: '5px' }}>
                      <Lightbulb size={14} style={{ flexShrink: 0 }} />
                      Comando rapido da terminale macOS/Linux per sincronizzare solo i mancanti:
                    </span>
                    <button
                      onClick={copyRsyncToClipboard}
                      style={{
                        background: 'transparent',
                        border: '1px solid #475569',
                        borderRadius: '4px',
                        color: copiedRsyncCmd ? '#22c55e' : '#cbd5e1',
                        padding: '4px 8px',
                        fontSize: '11px',
                        cursor: 'pointer',
                        display: 'flex',
                        alignItems: 'center',
                        gap: '4px'
                      }}
                    >
                      {copiedRsyncCmd ? <Check size={12} /> : <Copy size={12} />}
                      {copiedRsyncCmd ? 'Copiato!' : 'Copia'}
                    </button>
                  </div>
                  <pre style={{
                    background: '#020617',
                    padding: '10px 12px',
                    borderRadius: '6px',
                    fontSize: '11px',
                    color: '#22c55e',
                    overflowX: 'auto',
                    margin: 0
                  }}>
                    {rsyncExampleCmd}
                  </pre>
                </div>
              )}

              {/* Missing Items Grid */}
              {gapData.missing_on_backup_count === 0 ? (
                <div style={{
                  textAlign: 'center',
                  padding: '60px 20px',
                  background: '#1e293b',
                  borderRadius: '12px',
                  border: '1px solid #334155'
                }}>
                  <CheckCircle2 size={40} color="#22c55e" style={{ margin: '0 auto 12px' }} />
                  <h4 style={{ fontSize: '16px', fontWeight: 600 }}>Tutti i file sono protetti su questo disco!</h4>
                  <p style={{ color: '#94a3b8', fontSize: '13px', marginTop: '4px' }}>
                    La Fonte di Backup selezionata contiene già una copia di tutti i file presenti sulla Fonte Primaria.
                  </p>
                </div>
              ) : (
                <div style={{ display: 'flex', flexDirection: 'column', gap: '10px' }}>
                  <div style={{ fontSize: '13px', fontWeight: 600, color: '#94a3b8' }}>
                    File presenti sulla Fonte Primaria mancanti sul Backup ({gapData.missing_items.length}):
                  </div>
                  <div style={{
                    display: 'grid',
                    gridTemplateColumns: 'repeat(auto-fill, minmax(260px, 1fr))',
                    gap: '12px'
                  }}>
                    {gapData.missing_items.slice(0, 100).map((item: any) => (
                      <div
                        key={item.media_id}
                        onClick={() => setSelectedMediaId(item.media_id)}
                        style={{
                          background: '#1e293b',
                          border: '1px solid #334155',
                          borderRadius: '8px',
                          padding: '10px 12px',
                          display: 'flex',
                          alignItems: 'center',
                          gap: '12px',
                          cursor: 'pointer'
                        }}
                      >
                        <div style={{
                          width: '50px',
                          height: '50px',
                          borderRadius: '6px',
                          background: '#090d16',
                          overflow: 'hidden',
                          flexShrink: 0,
                          display: 'flex',
                          alignItems: 'center',
                          justifyContent: 'center'
                        }}>
                          {item.has_thumbnail ? (
                            <img
                              src={ApiClient.getThumbnailUrl(item.media_id)}
                              alt="thumb"
                              style={{ width: '100%', height: '100%', objectFit: 'cover' }}
                            />
                          ) : (
                            <FileText size={20} color="#64748b" />
                          )}
                        </div>
                        <div style={{ minWidth: 0, flex: 1 }}>
                          <div style={{ fontWeight: 600, fontSize: '12px', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                            {item.filename}
                          </div>
                          <div style={{ color: '#94a3b8', fontSize: '11px', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', marginTop: '2px', display: 'flex', alignItems: 'center', gap: '3px' }}>
                            <Folder size={11} style={{ flexShrink: 0 }} />
                            <span>{item.relative_path}</span>
                          </div>
                          <div style={{ fontSize: '10px', color: '#f43f5e', fontWeight: 600, marginTop: '2px', display: 'flex', alignItems: 'center', gap: '4px' }}>
                            <span>{formatBytes(item.size_bytes)}</span>
                            {item.is_favorite && (
                              <>
                                <span>•</span>
                                <Heart size={10} fill="#f43f5e" />
                              </>
                            )}
                          </div>
                        </div>
                      </div>
                    ))}
                  </div>
                  {gapData.missing_items.length > 100 && (
                    <div style={{ textAlign: 'center', fontSize: '12px', color: '#94a3b8', marginTop: '8px' }}>
                      Visualizzati i primi 100 di {gapData.missing_items.length} file mancanti. Esporta il report completo via CSV.
                    </div>
                  )}
                </div>
              )}
            </div>
          ) : null}
        </div>
      )}

      {/* TAB 4: SIMILAR PHOTOS (dHash) */}
      {activeTab === 'similar' && (
        <div style={{ display: 'flex', flexDirection: 'column', gap: '20px' }}>
          {/* Controls Bar */}
          <div style={{
            background: '#1e293b',
            border: '1px solid #334155',
            borderRadius: '12px',
            padding: '16px 20px',
            display: 'flex',
            justifyContent: 'space-between',
            alignItems: 'center',
            flexWrap: 'wrap',
            gap: '14px'
          }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: '16px', flexWrap: 'wrap' }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                <span style={{ fontSize: '13px', color: '#94a3b8' }}>Sensibilità distanza:</span>
                <select
                  value={maxDistance}
                  onChange={(e) => {
                    const val = Number(e.target.value);
                    setMaxDistance(val);
                    loadSimilar(val, within24h ? 24 : undefined);
                  }}
                  style={{
                    background: '#0f172a',
                    border: '1px solid #334155',
                    color: 'white',
                    borderRadius: '6px',
                    padding: '6px 10px',
                    fontSize: '12px'
                  }}
                >
                  <option value={2}>Quasi identiche (dist &lt;= 2)</option>
                  <option value={4}>Molto simili / Raffiche (dist &lt;= 4)</option>
                  <option value={6}>Simili / Stessa scena (dist &lt;= 6 - Default)</option>
                  <option value={10}>Composizione simile (dist &lt;= 10)</option>
                </select>
              </div>

              <label style={{ display: 'flex', alignItems: 'center', gap: '6px', fontSize: '13px', cursor: 'pointer' }}>
                <input
                  type="checkbox"
                  checked={within24h}
                  onChange={(e) => {
                    setWithin24h(e.target.checked);
                    loadSimilar(maxDistance, e.target.checked ? 24 : undefined);
                  }}
                  style={{ accentColor: '#38bdf8', cursor: 'pointer' }}
                />
                <span>Solo scatti entro 24 ore (Raffiche reali)</span>
              </label>
            </div>

            <button
              onClick={() => loadSimilar(maxDistance, within24h ? 24 : undefined)}
              disabled={loadingSimilar}
              style={{
                background: '#8b5cf6',
                color: 'white',
                border: 'none',
                borderRadius: '6px',
                padding: '8px 16px',
                fontSize: '12px',
                fontWeight: 600,
                cursor: loadingSimilar ? 'not-allowed' : 'pointer',
                display: 'flex',
                alignItems: 'center',
                gap: '6px'
              }}
            >
              <Sparkles size={14} />
              {loadingSimilar ? 'Ricerca in corso...' : 'Rianalizza Foto Simili'}
            </button>
          </div>

          {/* Results list */}
          {loadingSimilar ? (
            <div style={{ textAlign: 'center', padding: '60px', color: '#94a3b8' }}>
              Calcolo distanze Hamming e clustering percorsi in corso...
            </div>
          ) : similarGroups.length === 0 ? (
            <div style={{
              textAlign: 'center',
              padding: '60px 20px',
              background: '#1e293b',
              borderRadius: '16px',
              border: '1px solid #334155'
            }}>
              <Sparkles size={40} color="#8b5cf6" style={{ margin: '0 auto 12px' }} />
              <h3 style={{ fontSize: '18px', fontWeight: 600 }}>Nessuna foto simile trovata</h3>
              <p style={{ color: '#94a3b8', fontSize: '13px', marginTop: '6px' }}>
                Prova ad aumentare la sensibilità di distanza o disattivare il filtro temporale delle 24 ore.
              </p>
            </div>
          ) : (
            <div style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>
              {similarGroups.map((group, gIdx) => {
                const clusterKey = group.group_id || String(gIdx);
                const bestShot = bestShotResults[clusterKey];
                const isAnalyzing = analyzingClusterId === clusterKey;

                return (
                  <div
                    key={clusterKey}
                    style={{
                      background: '#1e293b',
                      border: '1px solid #334155',
                      borderRadius: '12px',
                      padding: '16px 20px',
                      display: 'flex',
                      flexDirection: 'column',
                      gap: '12px'
                    }}
                  >
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: '8px' }}>
                      <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
                        <span style={{ fontSize: '13px', fontWeight: 700, color: '#a78bfa', display: 'flex', alignItems: 'center', gap: '6px' }}>
                          <Sparkles size={14} />
                          Gruppo Simile #{gIdx + 1} ({group.media_items?.length || group.count} foto)
                        </span>
                        <span style={{ fontSize: '11px', color: '#94a3b8' }}>
                          {group.time_span_hours ? `Intervallo: ${group.time_span_hours.toFixed(1)} ore` : 'Stessa sessione'}
                        </span>
                      </div>

                      <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                        <button
                          onClick={() => handleSuggestBestShot(clusterKey, group.media_items || [])}
                          disabled={isAnalyzing}
                          style={{
                            background: 'rgba(168, 85, 247, 0.15)',
                            color: '#c084fc',
                            border: '1px solid rgba(168, 85, 247, 0.4)',
                            borderRadius: '6px',
                            padding: '5px 12px',
                            fontSize: '11px',
                            fontWeight: 600,
                            cursor: isAnalyzing ? 'not-allowed' : 'pointer',
                            display: 'flex',
                            alignItems: 'center',
                            gap: '4px'
                          }}
                        >
                          <Sparkles size={12} className={isAnalyzing ? 'animate-spin' : ''} />
                          {isAnalyzing ? 'Analisi...' : 'Scegli lo scatto migliore'}
                        </button>

                        {bestShot && bestShot.trash_media_ids.length > 0 && (
                          <button
                            onClick={() => setConfirmTrashSimilarModal({
                              open: true,
                              clusterKey,
                              keepMediaId: bestShot.best_media_id,
                              trashMediaIds: bestShot.trash_media_ids
                            })}
                            style={{
                              background: '#ef4444',
                              color: 'white',
                              border: 'none',
                              borderRadius: '6px',
                              padding: '5px 12px',
                              fontSize: '11px',
                              fontWeight: 700,
                              cursor: 'pointer',
                              display: 'flex',
                              alignItems: 'center',
                              gap: '4px'
                            }}
                          >
                            <Trash2 size={12} />
                            Sposta {bestShot.trash_media_ids.length} scarti in .pmm_trash
                          </button>
                        )}
                      </div>
                    </div>

                    {/* Best shot summary banner if present */}
                    {bestShot && (
                      <div style={{
                        background: 'rgba(168, 85, 247, 0.1)',
                        border: '1px solid rgba(168, 85, 247, 0.3)',
                        borderRadius: '8px',
                        padding: '10px 14px',
                        fontSize: '12px',
                        color: '#e2e8f0',
                        display: 'flex',
                        flexDirection: 'column',
                        gap: '4px'
                      }}>
                        <div style={{ display: 'flex', alignItems: 'center', gap: '6px', fontWeight: 600 }}>
                          <span style={{
                            fontSize: '10px',
                            padding: '2px 6px',
                            borderRadius: '4px',
                            background: '#a855f7',
                            color: 'white'
                          }}>
                            {bestShot.engine.toUpperCase()}
                          </span>
                          <span>{bestShot.summary}</span>
                        </div>
                        <div style={{ color: '#94a3b8', fontSize: '11px' }}>
                          Fai clic su "Imposta come migliore" o "Scarta" per personalizzare la scelta prima di confermare lo spostamento.
                        </div>
                      </div>
                    )}

                    <div style={{ display: 'flex', gap: '14px', overflowX: 'auto', paddingBottom: '10px' }}>
                      {(group.media_items || []).map((item: any) => {
                        const isBest = bestShot && bestShot.best_media_id === item.id;
                        const isTrash = bestShot && bestShot.trash_media_ids.includes(item.id);

                        return (
                          <div
                            key={item.id}
                            style={{
                              width: '140px',
                              flexShrink: 0,
                              display: 'flex',
                              flexDirection: 'column',
                              gap: '6px'
                            }}
                          >
                            <div
                              onClick={() => setSelectedMediaId(item.id)}
                              style={{
                                width: '140px',
                                height: '140px',
                                borderRadius: '8px',
                                background: '#090d16',
                                overflow: 'hidden',
                                display: 'flex',
                                alignItems: 'center',
                                justifyContent: 'center',
                                cursor: 'pointer',
                                position: 'relative',
                                border: isBest ? '3px solid #22c55e' : isTrash ? '2px dashed #f43f5e' : '1px solid #334155'
                              }}
                            >
                              {item.has_thumbnail !== false ? (
                                <img
                                  src={ApiClient.getThumbnailUrl(item.id || item.media_id)}
                                  alt="thumb"
                                  style={{ width: '100%', height: '100%', objectFit: 'cover' }}
                                  onError={(e) => {
                                    (e.currentTarget as HTMLElement).style.display = 'none';
                                  }}
                                />
                              ) : (
                                <FileText size={28} color="#64748b" />
                              )}

                              {isBest && (
                                <div style={{
                                  position: 'absolute',
                                  top: '6px',
                                  left: '6px',
                                  background: '#22c55e',
                                  color: '#052e16',
                                  fontSize: '9px',
                                  fontWeight: 800,
                                  padding: '2px 6px',
                                  borderRadius: '4px',
                                  boxShadow: '0 2px 4px rgba(0,0,0,0.4)'
                                }}>
                                  MIGLIORE
                                </div>
                              )}

                              {isTrash && (
                                <div style={{
                                  position: 'absolute',
                                  top: '6px',
                                  left: '6px',
                                  background: '#ef4444',
                                  color: 'white',
                                  fontSize: '9px',
                                  fontWeight: 800,
                                  padding: '2px 6px',
                                  borderRadius: '4px',
                                  boxShadow: '0 2px 4px rgba(0,0,0,0.4)'
                                }}>
                                  SCARTO
                                </div>
                              )}
                            </div>

                            <div style={{ fontSize: '11px', color: '#cbd5e1', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                              {item.primary_filename || 'Foto'}
                            </div>

                            {bestShot?.reasons?.[item.id] && (
                              <div style={{ fontSize: '10px', color: '#94a3b8', lineHeight: '1.3' }}>
                                {bestShot.reasons[item.id]}
                              </div>
                            )}

                            {bestShot && (
                              <div style={{ display: 'flex', gap: '4px', marginTop: '2px' }}>
                                {!isBest ? (
                                  <>
                                    <button
                                      onClick={() => handlePromoteBestShot(clusterKey, item.id)}
                                      title="Imposta come scatto migliore"
                                      style={{
                                        background: '#334155',
                                        color: '#22c55e',
                                        border: 'none',
                                        borderRadius: '4px',
                                        padding: '3px 6px',
                                        fontSize: '10px',
                                        fontWeight: 600,
                                        cursor: 'pointer',
                                        flex: 1,
                                        display: 'inline-flex',
                                        alignItems: 'center',
                                        justifyContent: 'center',
                                        gap: '3px'
                                      }}
                                    >
                                      <Star size={10} fill="#22c55e" />
                                      Migliore
                                    </button>
                                    <button
                                      onClick={() => handleToggleTrashSimilarItem(clusterKey, item.id)}
                                      title={isTrash ? "Tieni questo scatto" : "Marca come scarto"}
                                      style={{
                                        background: isTrash ? 'rgba(239, 68, 68, 0.2)' : '#334155',
                                        color: isTrash ? '#ef4444' : '#94a3b8',
                                        border: 'none',
                                        borderRadius: '4px',
                                        padding: '3px 6px',
                                        fontSize: '10px',
                                        fontWeight: 600,
                                        cursor: 'pointer'
                                      }}
                                    >
                                      {isTrash ? 'Annulla' : 'Scarta'}
                                    </button>
                                  </>
                                ) : (
                                  <span style={{ fontSize: '10px', color: '#22c55e', fontWeight: 600, display: 'inline-flex', alignItems: 'center', gap: '3px' }}>
                                    <Check size={11} />
                                    Conservata
                                  </span>
                                )}
                              </div>
                            )}
                          </div>
                        );
                      })}
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </div>
      )}

      {/* TAB 4.5: FOLDER CLEANUP ADVISOR */}
      {activeTab === 'folder_advisor' && (
        <div style={{ display: 'flex', flexDirection: 'column', gap: '20px' }}>
          {/* Controls Bar */}
          <div style={{
            background: '#1e293b',
            border: '1px solid #334155',
            borderRadius: '12px',
            padding: '16px 20px',
            display: 'flex',
            justifyContent: 'space-between',
            alignItems: 'center',
            flexWrap: 'wrap',
            gap: '14px'
          }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: '16px', flexWrap: 'wrap' }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                <span style={{ fontSize: '13px', color: '#94a3b8' }}>Filtra Fonte/Disco:</span>
                <select
                  value={advisorSourceId}
                  onChange={(e) => setAdvisorSourceId(e.target.value)}
                  style={{
                    background: '#0f172a',
                    border: '1px solid #334155',
                    color: 'white',
                    borderRadius: '6px',
                    padding: '6px 10px',
                    fontSize: '12px'
                  }}
                >
                  <option value="">Tutte le fonti</option>
                  {sources.map(s => (
                    <option key={s.id} value={s.id}>{s.name}</option>
                  ))}
                </select>
              </div>

              <label style={{ display: 'flex', alignItems: 'center', gap: '6px', fontSize: '13px', cursor: 'pointer' }}>
                <input
                  type="checkbox"
                  checked={advisorUseAi}
                  onChange={(e) => setAdvisorUseAi(e.target.checked)}
                  style={{ accentColor: '#a855f7', cursor: 'pointer' }}
                />
                <span>Usa AI per formulare motivazioni (se provider attivo)</span>
              </label>
            </div>

            <button
              onClick={loadFolderAdvisor}
              disabled={advisorLoading}
              style={{
                background: '#a855f7',
                color: 'white',
                border: 'none',
                borderRadius: '6px',
                padding: '8px 16px',
                fontSize: '12px',
                fontWeight: 600,
                cursor: advisorLoading ? 'not-allowed' : 'pointer',
                display: 'flex',
                alignItems: 'center',
                gap: '6px'
              }}
            >
              <Brain size={14} className={advisorLoading ? 'animate-spin' : ''} />
              {advisorLoading ? 'Analisi cartelle in corso...' : 'Analizza Cartelle'}
            </button>
          </div>

          {/* AI Error / Fallback Banner */}
          {advisorResult?.ai_error && (
            <div style={{
              background: 'rgba(245, 158, 11, 0.1)',
              border: '1px solid rgba(245, 158, 11, 0.3)',
              borderRadius: '8px',
              padding: '10px 14px',
              fontSize: '12px',
              color: '#fbbf24',
              display: 'flex',
              alignItems: 'center',
              gap: '8px'
            }}>
              <AlertTriangle size={16} />
              <span>AI non disponibile ({advisorResult.ai_error}): applicati suggerimenti euristici locali.</span>
            </div>
          )}

          {/* Results list */}
          {advisorLoading ? (
            <div style={{ textAlign: 'center', padding: '60px', color: '#94a3b8' }}>
              Identificazione cartelle duplicate sullo stesso disco in corso...
            </div>
          ) : !advisorResult || advisorResult.rules.length === 0 ? (
            <div style={{
              textAlign: 'center',
              padding: '60px 20px',
              background: '#1e293b',
              borderRadius: '16px',
              border: '1px solid #334155'
            }}>
              <FolderTree size={40} color="#a855f7" style={{ margin: '0 auto 12px' }} />
              <h3 style={{ fontSize: '18px', fontWeight: 600 }}>Nessuna coppia di cartelle duplicate</h3>
              <p style={{ color: '#94a3b8', fontSize: '13px', marginTop: '6px' }}>
                Non ci sono cartelle sullo stesso disco che condividono file duplicati esatti. L'archivio è organizzato!
              </p>
            </div>
          ) : (
            <div style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>
              <div style={{ fontSize: '13px', fontWeight: 600, color: '#94a3b8' }}>
                Regole di pulizia suggerite ({advisorResult.rules.length}):
              </div>

              {advisorResult.rules.map((rule, rIdx) => {
                const pair = advisorResult.pairs.find(p => p.pair_id === rule.pair_id);
                const sharedMb = pair ? (pair.shared_bytes / (1024 * 1024)).toFixed(1) : '0';

                return (
                  <div
                    key={rule.pair_id || rIdx}
                    style={{
                      background: '#1e293b',
                      border: '1px solid #334155',
                      borderRadius: '12px',
                      padding: '16px 20px',
                      display: 'flex',
                      flexDirection: 'column',
                      gap: '14px'
                    }}
                  >
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: '8px' }}>
                      <div style={{ display: 'flex', alignItems: 'center', gap: '8px', fontSize: '12px' }}>
                        <HardDrive size={14} color="#38bdf8" />
                        <span style={{ fontWeight: 600, color: '#e2e8f0' }}>{pair?.source_name || 'Fonte'}</span>
                        <span style={{ color: '#64748b' }}>•</span>
                        <span style={{ color: '#f59e0b', fontWeight: 600 }}>{pair?.shared_media_count} foto duplicate ({sharedMb} MB)</span>
                      </div>

                      <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
                        <span style={{
                          fontSize: '10px',
                          padding: '2px 8px',
                          borderRadius: '4px',
                          background: rule.engine === 'heuristic' ? 'rgba(56, 189, 248, 0.15)' : 'rgba(168, 85, 247, 0.2)',
                          color: rule.engine === 'heuristic' ? '#38bdf8' : '#c084fc',
                          fontWeight: 700,
                          border: `1px solid ${rule.engine === 'heuristic' ? '#0284c7' : '#a855f7'}`
                        }}>
                          {rule.engine.toUpperCase()}
                        </span>
                        <span style={{ fontSize: '11px', color: '#94a3b8' }}>
                          Affidabilità: {Math.round(rule.confidence * 100)}%
                        </span>
                      </div>
                    </div>

                    {/* Folders Comparison */}
                    <div style={{ display: 'grid', gridTemplateColumns: '1fr auto 1fr', alignItems: 'center', gap: '12px' }}>
                      <div style={{
                        background: 'rgba(34, 197, 94, 0.08)',
                        border: '1px solid rgba(34, 197, 94, 0.3)',
                        borderRadius: '8px',
                        padding: '12px 14px'
                      }}>
                        <div style={{ fontSize: '10px', fontWeight: 700, color: '#22c55e', textTransform: 'uppercase', marginBottom: '4px', display: 'flex', alignItems: 'center', gap: '4px' }}>
                          <Check size={12} />
                          <span>Conserva cartella</span>
                        </div>
                        <div style={{ fontSize: '13px', fontWeight: 600, color: 'white', wordBreak: 'break-all', display: 'flex', alignItems: 'center', gap: '4px' }}>
                          <Folder size={13} style={{ flexShrink: 0 }} />
                          <span>{rule.keep_folder}</span>
                        </div>
                      </div>

                      <button
                        onClick={() => handleSwapFolderRule(rIdx)}
                        title="Inverti quale cartella tenere e quale cestinare"
                        style={{
                          background: '#0f172a',
                          border: '1px solid #475569',
                          color: '#f8fafc',
                          borderRadius: '50%',
                          width: '36px',
                          height: '36px',
                          display: 'flex',
                          alignItems: 'center',
                          justifyContent: 'center',
                          cursor: 'pointer'
                        }}
                      >
                        <ArrowLeftRight size={14} />
                      </button>

                      <div style={{
                        background: 'rgba(239, 68, 68, 0.08)',
                        border: '1px solid rgba(239, 68, 68, 0.3)',
                        borderRadius: '8px',
                        padding: '12px 14px'
                      }}>
                        <div style={{ fontSize: '10px', fontWeight: 700, color: '#ef4444', textTransform: 'uppercase', marginBottom: '4px', display: 'flex', alignItems: 'center', gap: '4px' }}>
                          <Trash2 size={12} />
                          <span>Sposta duplicati in .pmm_trash</span>
                        </div>
                        <div style={{ fontSize: '13px', fontWeight: 600, color: 'white', wordBreak: 'break-all', display: 'flex', alignItems: 'center', gap: '4px' }}>
                          <Folder size={13} style={{ flexShrink: 0 }} />
                          <span>{rule.trash_folder}</span>
                        </div>
                      </div>
                    </div>

                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: '8px', borderTop: '1px solid #334155', paddingTop: '10px' }}>
                      <div style={{ fontSize: '12px', color: '#cbd5e1', display: 'flex', alignItems: 'center', gap: '6px' }}>
                        <MessageSquare size={13} style={{ flexShrink: 0 }} />
                        <em>{rule.rationale}</em>
                      </div>

                      <div style={{ display: 'flex', gap: '8px' }}>
                        <button
                          onClick={() => handlePreviewFolderRule(rule)}
                          style={{
                            background: '#334155',
                            color: '#f8fafc',
                            border: '1px solid #475569',
                            borderRadius: '6px',
                            padding: '6px 12px',
                            fontSize: '12px',
                            fontWeight: 600,
                            cursor: 'pointer'
                          }}
                        >
                          Anteprima file ({pair?.shared_media_count})
                        </button>
                      </div>
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </div>
      )}

      {/* TAB 5: DISK TRASH (.pmm_trash) */}
      {activeTab === 'trash' && (
        <div style={{ display: 'flex', flexDirection: 'column', gap: '20px' }}>
          {/* Header Card */}
          <div style={{
            background: '#1e293b',
            border: '1px solid #334155',
            borderRadius: '12px',
            padding: '20px',
            display: 'flex',
            flexDirection: 'column',
            gap: '12px'
          }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: '12px' }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
                <div style={{ padding: '8px', background: 'rgba(239, 68, 68, 0.15)', borderRadius: '8px' }}>
                  <Trash2 size={22} color="#ef4444" />
                </div>
                <div>
                  <h3 style={{ fontSize: '18px', fontWeight: 'bold', margin: 0 }}>Cestino Protetto su Disco (.pmm_trash)</h3>
                  <p style={{ color: '#94a3b8', fontSize: '13px', margin: '3px 0 0' }}>
                    File duplicati spostati in quarantena sullo stesso disco di appartenenza. Zero cancellazioni distruttive, ripristino immediato in 1 click.
                  </p>
                </div>
              </div>

              <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
                {sources.length > 0 && (
                  <select
                    value={trashSourceFilter}
                    onChange={(e) => {
                      setTrashSourceFilter(e.target.value);
                      loadTrash(e.target.value);
                    }}
                    style={{
                      background: '#0f172a',
                      color: 'white',
                      border: '1px solid #334155',
                      borderRadius: '8px',
                      padding: '8px 12px',
                      fontSize: '12px'
                    }}
                  >
                    <option value="">Tutti i Dischi / Fonti</option>
                    {sources.map((s) => (
                      <option key={s.id} value={s.id}>{s.name}</option>
                    ))}
                  </select>
                )}

                <button
                  onClick={() => loadTrash()}
                  disabled={loadingTrash}
                  style={{
                    background: '#0f172a',
                    color: '#94a3b8',
                    border: '1px solid #334155',
                    borderRadius: '8px',
                    padding: '8px 12px',
                    fontSize: '12px',
                    fontWeight: 600,
                    cursor: loadingTrash ? 'not-allowed' : 'pointer'
                  }}
                >
                  {loadingTrash ? 'Aggiornamento...' : 'Ricarica Cestino'}
                </button>
              </div>
            </div>

            {/* Trash summary metrics */}
            <div style={{
              display: 'grid',
              gridTemplateColumns: 'repeat(auto-fit, minmax(220px, 1fr))',
              gap: '12px',
              marginTop: '6px'
            }}>
              <div style={{ background: '#0f172a', border: '1px solid #334155', borderRadius: '8px', padding: '12px' }}>
                <span style={{ fontSize: '12px', color: '#94a3b8' }}>Totale File nel Cestino</span>
                <div style={{ fontSize: '20px', fontWeight: 800, color: 'white', marginTop: '2px' }}>
                  {trashData?.total_count ?? 0} file
                </div>
              </div>
              <div style={{ background: '#0f172a', border: '1px solid #334155', borderRadius: '8px', padding: '12px' }}>
                <span style={{ fontSize: '12px', color: '#94a3b8' }}>Spazio Occupato nel Cestino</span>
                <div style={{ fontSize: '20px', fontWeight: 800, color: '#f59e0b', marginTop: '2px' }}>
                  {formatBytes(trashData?.total_bytes ?? 0)}
                </div>
              </div>
            </div>
          </div>

          {/* By Source Trash Summary */}
          {trashData?.by_source && trashData.by_source.length > 0 && (
            <div style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
              <h4 style={{ fontSize: '14px', fontWeight: 600, color: '#cbd5e1', margin: 0 }}>
                Cartelle Cestino sui Dischi Fisici:
              </h4>
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(320px, 1fr))', gap: '12px' }}>
                {trashData.by_source.map((src: any) => (
                  <div
                    key={src.source_id}
                    style={{
                      background: '#1e293b',
                      border: '1px solid #334155',
                      borderRadius: '10px',
                      padding: '14px',
                      display: 'flex',
                      flexDirection: 'column',
                      gap: '8px'
                    }}
                  >
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                      <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                        <HardDrive size={16} color={src.is_online ? '#22c55e' : '#94a3b8'} />
                        <span style={{ fontWeight: 600, fontSize: '14px' }}>{src.source_name}</span>
                      </div>
                      <span style={{
                        fontSize: '11px',
                        padding: '2px 6px',
                        borderRadius: '4px',
                        background: src.is_online ? 'rgba(34, 197, 94, 0.15)' : 'rgba(148, 163, 184, 0.15)',
                        color: src.is_online ? '#22c55e' : '#94a3b8'
                      }}>
                        {src.is_online ? 'ONLINE' : 'OFFLINE'}
                      </span>
                    </div>

                    <div style={{ fontSize: '11px', color: '#94a3b8', wordBreak: 'break-all' }}>
                      Cartella: <code>{src.trash_folder_path || '.pmm_trash'}</code>
                    </div>

                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginTop: '6px' }}>
                      <span style={{ fontSize: '12px', color: '#cbd5e1' }}>
                        <strong>{src.count}</strong> file ({formatBytes(src.bytes)})
                      </span>

                      {src.count > 0 && src.is_online && (
                        <button
                          onClick={() => {
                            const filesOnSrc = (trashData.items || []).filter((i: any) => i.source_id === src.source_id).map((i: any) => i.file_id);
                            handleRestoreFiles(filesOnSrc);
                          }}
                          style={{
                            background: 'rgba(34, 197, 94, 0.15)',
                            color: '#22c55e',
                            border: '1px solid rgba(34, 197, 94, 0.3)',
                            borderRadius: '6px',
                            padding: '4px 10px',
                            fontSize: '11px',
                            fontWeight: 600,
                            cursor: 'pointer',
                            display: 'flex',
                            alignItems: 'center',
                            gap: '5px'
                          }}
                        >
                          <RotateCcw size={12} />
                          Ripristina Tutto su {src.source_name}
                        </button>
                      )}
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* List of individual trashed files */}
          <div style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
              <h4 style={{ fontSize: '15px', fontWeight: 600, margin: 0 }}>
                Elenco File in Quarantena ({trashData?.total_count || 0})
              </h4>

              {trashData?.items && trashData.items.length > 1 && (
                <button
                  onClick={() => {
                    const allIds = trashData.items.filter((i: any) => i.is_source_online).map((i: any) => i.file_id);
                    handleRestoreFiles(allIds);
                  }}
                  style={{
                    background: 'rgba(34, 197, 94, 0.2)',
                    color: '#22c55e',
                    border: '1px solid rgba(34, 197, 94, 0.4)',
                    borderRadius: '6px',
                    padding: '6px 14px',
                    fontSize: '12px',
                    fontWeight: 700,
                    cursor: 'pointer',
                    display: 'flex',
                    alignItems: 'center',
                    gap: '6px'
                  }}
                >
                  <RotateCcw size={13} />
                  Ripristina Tutti i File ({trashData.items.length})
                </button>
              )}
            </div>

            {loadingTrash ? (
              <div style={{ textAlign: 'center', padding: '60px', color: '#94a3b8' }}>
                Caricamento file nel cestino...
              </div>
            ) : !trashData || trashData.items.length === 0 ? (
              <div style={{
                textAlign: 'center',
                padding: '60px 20px',
                background: '#1e293b',
                borderRadius: '16px',
                border: '1px solid #334155'
              }}>
                <CheckCircle2 size={42} color="#22c55e" style={{ margin: '0 auto 12px' }} />
                <h3 style={{ fontSize: '17px', fontWeight: 600 }}>Il Cestino dei Dischi è vuoto</h3>
                <p style={{ color: '#94a3b8', fontSize: '13px', marginTop: '6px' }}>
                  Nessun file si trova attualmente nella cartella protetta <code>.pmm_trash</code> sui tuoi dischi.
                </p>
              </div>
            ) : (
              <div style={{ display: 'flex', flexDirection: 'column', gap: '10px' }}>
                {trashData.items.map((item: any) => {
                  const isRestoring = restoringFileIds.has(item.file_id);

                  return (
                    <div
                      key={item.file_id}
                      style={{
                        background: '#1e293b',
                        border: '1px solid #334155',
                        borderRadius: '10px',
                        padding: '12px 16px',
                        display: 'flex',
                        alignItems: 'center',
                        justifyContent: 'space-between',
                        gap: '16px',
                        flexWrap: 'wrap'
                      }}
                    >
                      <div style={{ display: 'flex', alignItems: 'center', gap: '14px', minWidth: 0, flex: 1 }}>
                        <div
                          onClick={() => setSelectedMediaId(item.media_id)}
                          style={{
                            width: '54px',
                            height: '54px',
                            borderRadius: '6px',
                            background: '#090d16',
                            overflow: 'hidden',
                            flexShrink: 0,
                            cursor: 'pointer',
                            display: 'flex',
                            alignItems: 'center',
                            justifyContent: 'center'
                          }}
                        >
                          {item.has_thumbnail ? (
                            <img
                              src={ApiClient.getThumbnailUrl(item.media_id)}
                              alt="thumb"
                              style={{ width: '100%', height: '100%', objectFit: 'cover' }}
                            />
                          ) : (
                            <FileText size={22} color="#64748b" />
                          )}
                        </div>

                        <div style={{ minWidth: 0, flex: 1 }}>
                          <div style={{ fontWeight: 600, fontSize: '13px', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                            {item.filename}
                          </div>
                          <div style={{ fontSize: '11px', color: '#94a3b8', marginTop: '2px', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', display: 'flex', alignItems: 'center', gap: '4px' }}>
                            <Folder size={12} style={{ flexShrink: 0 }} />
                            <span><strong>Origine:</strong> {item.original_relative_path}</span>
                          </div>
                          <div style={{ fontSize: '11px', color: '#64748b', marginTop: '1px', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', display: 'flex', alignItems: 'center', gap: '4px' }}>
                            <Trash2 size={12} style={{ flexShrink: 0 }} />
                            <span><strong>Cestino:</strong> {item.trash_relative_path}</span>
                          </div>
                        </div>
                      </div>

                      <div style={{ display: 'flex', alignItems: 'center', gap: '16px', flexShrink: 0 }}>
                        <div style={{ textAlign: 'right', fontSize: '12px' }}>
                          <div style={{ color: '#cbd5e1', fontWeight: 600 }}>{formatBytes(item.size_bytes)}</div>
                          <div style={{ color: '#64748b', fontSize: '11px', marginTop: '2px' }}>
                            {item.source_name} ({item.is_source_online ? 'online' : 'offline'})
                          </div>
                        </div>

                        <button
                          onClick={() => handleRestoreFiles([item.file_id])}
                          disabled={!item.is_source_online || isRestoring}
                          title={!item.is_source_online ? 'Disco offline: ricollega il disco per ripristinare il file' : 'Ripristina il file nella sua cartella originale'}
                          style={{
                            background: item.is_source_online ? '#0284c7' : '#334155',
                            color: item.is_source_online ? 'white' : '#64748b',
                            border: 'none',
                            borderRadius: '6px',
                            padding: '8px 14px',
                            fontSize: '12px',
                            fontWeight: 600,
                            cursor: item.is_source_online && !isRestoring ? 'pointer' : 'not-allowed',
                            display: 'flex',
                            alignItems: 'center',
                            gap: '6px'
                          }}
                        >
                          <RotateCcw size={13} />
                          {isRestoring ? 'Ripristino...' : 'Ripristina Originale'}
                        </button>
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
          </div>
        </div>
      )}

      {/* Floating Action Bar (Sticky at bottom when duplicates are selected for trash) */}
      {selectedForTrash.size > 0 && activeTab !== 'trash' && (
        <div style={{
          position: 'fixed',
          bottom: '24px',
          left: '50%',
          transform: 'translateX(-50%)',
          zIndex: 900,
          background: '#0f172a',
          border: '1px solid rgba(239, 68, 68, 0.6)',
          boxShadow: '0 20px 40px -10px rgba(0, 0, 0, 0.7)',
          borderRadius: '12px',
          padding: '12px 20px',
          display: 'flex',
          alignItems: 'center',
          gap: '18px'
        }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
            <div style={{ padding: '6px', background: 'rgba(239, 68, 68, 0.2)', borderRadius: '6px' }}>
              <Trash2 size={16} color="#ef4444" />
            </div>
            <div style={{ fontSize: '13px', fontWeight: 600, color: 'white' }}>
              <span>{selectedForTrash.size} {selectedForTrash.size === 1 ? 'file selezionato' : 'file selezionati'}</span>
              <span style={{ color: '#64748b', margin: '0 6px' }}>·</span>
              <span style={{ color: '#fbbf24' }}>{formatBytes(selectedTrashBytes)} recuperabili</span>
            </div>
          </div>

          <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
            <button
              onClick={() => setSelectedForTrash(new Set())}
              style={{
                background: 'transparent',
                color: '#94a3b8',
                border: '1px solid #334155',
                borderRadius: '6px',
                padding: '6px 12px',
                fontSize: '12px',
                fontWeight: 600,
                cursor: 'pointer'
              }}
            >
              Annulla
            </button>

            <button
              onClick={() => setConfirmModalOpen(true)}
              style={{
                background: '#ef4444',
                color: 'white',
                border: 'none',
                borderRadius: '6px',
                padding: '6px 14px',
                fontSize: '12px',
                fontWeight: 600,
                cursor: 'pointer',
                display: 'flex',
                alignItems: 'center',
                gap: '6px'
              }}
            >
              <Trash2 size={13} />
              Sposta nel cestino
            </button>
          </div>
        </div>
      )}

      {/* Confirmation Modal */}
      {confirmModalOpen && (
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
            maxWidth: '540px',
            padding: '24px',
            boxShadow: '0 25px 50px -12px rgba(0, 0, 0, 0.5)',
            display: 'flex',
            flexDirection: 'column',
            gap: '18px'
          }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
                <div style={{ padding: '8px', background: 'rgba(239, 68, 68, 0.15)', borderRadius: '8px' }}>
                  <Trash2 size={22} color="#ef4444" />
                </div>
                <h3 style={{ fontSize: '18px', fontWeight: 'bold', margin: 0 }}>Conferma Spostamento Cestino Disco</h3>
              </div>
              <button
                onClick={() => setConfirmModalOpen(false)}
                disabled={isTrashing}
                style={{ background: 'transparent', border: 'none', color: '#94a3b8', cursor: 'pointer' }}
              >
                <X size={20} />
              </button>
            </div>

            <div style={{ fontSize: '13px', color: '#cbd5e1', lineHeight: '1.6', display: 'flex', flexDirection: 'column', gap: '10px' }}>
              <p style={{ margin: 0 }}>
                Stai per spostare <strong>{selectedForTrash.size}</strong> copie duplicate per un totale di <strong>{formatBytes(selectedTrashBytes)}</strong>.
              </p>

              <div style={{ background: '#0f172a', border: '1px solid #334155', borderRadius: '10px', padding: '14px', display: 'flex', flexDirection: 'column', gap: '8px' }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: '8px', color: '#22c55e', fontSize: '12px', fontWeight: 600 }}>
                  <Check size={16} />
                  <span>Nessun file viene eliminato: spostamento atomico in <code>.pmm_trash/files/</code></span>
                </div>
                <div style={{ display: 'flex', alignItems: 'center', gap: '8px', color: '#22c55e', fontSize: '12px', fontWeight: 600 }}>
                  <Check size={16} />
                  <span>Per ogni foto o video, almeno 1 copia originale resta intatta nella sua cartella.</span>
                </div>
                <div style={{ display: 'flex', alignItems: 'center', gap: '8px', color: '#22c55e', fontSize: '12px', fontWeight: 600 }}>
                  <Check size={16} />
                  <span>Potrai ripristinare qualsiasi file con 1 click dalla scheda Cestino Dischi.</span>
                </div>
              </div>
            </div>

            <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '10px', marginTop: '6px' }}>
              <button
                onClick={() => setConfirmModalOpen(false)}
                disabled={isTrashing}
                style={{
                  background: '#334155',
                  color: 'white',
                  border: 'none',
                  borderRadius: '8px',
                  padding: '10px 18px',
                  fontSize: '13px',
                  fontWeight: 600,
                  cursor: isTrashing ? 'not-allowed' : 'pointer'
                }}
              >
                Annulla
              </button>

              <button
                onClick={handleConfirmTrash}
                disabled={isTrashing}
                style={{
                  background: '#ef4444',
                  color: 'white',
                  border: 'none',
                  borderRadius: '8px',
                  padding: '10px 20px',
                  fontSize: '13px',
                  fontWeight: 700,
                  cursor: isTrashing ? 'not-allowed' : 'pointer',
                  display: 'flex',
                  alignItems: 'center',
                  gap: '8px'
                }}
              >
                <Trash2 size={15} />
                {isTrashing ? 'Spostamento in corso...' : 'Conferma Spostamento in .pmm_trash'}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Folder Rule Preview Modal */}
      {previewModalOpen && (
        <div style={{
          position: 'fixed',
          inset: 0,
          background: 'rgba(0,0,0,0.75)',
          backdropFilter: 'blur(4px)',
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
            maxWidth: '700px',
            width: '100%',
            maxHeight: '90vh',
            display: 'flex',
            flexDirection: 'column',
            overflow: 'hidden'
          }}>
            <div style={{ padding: '18px 20px', borderBottom: '1px solid #334155', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
              <div>
                <h3 style={{ fontSize: '16px', fontWeight: 700, margin: 0, display: 'flex', alignItems: 'center', gap: '8px' }}>
                  <FolderTree size={18} color="#a855f7" /> Anteprima Pulizia Cartella
                </h3>
                {activeRuleForPreview && (
                  <p style={{ color: '#94a3b8', fontSize: '12px', margin: '4px 0 0' }}>
                    Spostamento copie da <code>{activeRuleForPreview.trash_folder}</code> verso .pmm_trash (conservando <code>{activeRuleForPreview.keep_folder}</code>)
                  </p>
                )}
              </div>
              <button
                onClick={() => setPreviewModalOpen(false)}
                disabled={isApplyingFolderRule}
                style={{ background: 'transparent', border: 'none', color: '#94a3b8', cursor: 'pointer' }}
              >
                <X size={20} />
              </button>
            </div>

            <div style={{ padding: '20px', overflowY: 'auto', display: 'flex', flexDirection: 'column', gap: '14px' }}>
              {previewLoading ? (
                <div style={{ textAlign: 'center', padding: '40px', color: '#94a3b8' }}>
                  Caricamento anteprima file duplicati...
                </div>
              ) : previewData ? (
                <>
                  <div style={{
                    background: '#0f172a',
                    border: '1px solid #334155',
                    borderRadius: '8px',
                    padding: '12px 16px',
                    fontSize: '12px',
                    display: 'flex',
                    justifyContent: 'space-between',
                    alignItems: 'center'
                  }}>
                    <span>File da spostare: <strong>{previewData.count}</strong></span>
                    <span>Spazio liberato: <strong>{formatBytes(previewData.bytes)}</strong></span>
                  </div>

                  <div style={{ fontSize: '12px', color: '#94a3b8', fontWeight: 600 }}>
                    Campione file interessati (primi {previewData.sample.length}):
                  </div>

                  <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(130px, 1fr))', gap: '10px' }}>
                    {previewData.sample.map((s) => (
                      <div key={s.file_id} style={{ background: '#0f172a', border: '1px solid #334155', borderRadius: '8px', padding: '8px', display: 'flex', flexDirection: 'column', gap: '4px' }}>
                        <div style={{ width: '100%', height: '90px', borderRadius: '6px', background: '#090d16', overflow: 'hidden', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                          {s.has_thumbnail ? (
                            <img src={ApiClient.getThumbnailUrl(s.media_id)} alt="thumb" style={{ width: '100%', height: '100%', objectFit: 'cover' }} />
                          ) : (
                            <FileText size={24} color="#64748b" />
                          )}
                        </div>
                        <div style={{ fontSize: '11px', fontWeight: 600, color: '#f8fafc', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                          {s.filename}
                        </div>
                        <div style={{ fontSize: '10px', color: '#94a3b8' }}>
                          {formatBytes(s.size_bytes)}
                        </div>
                      </div>
                    ))}
                  </div>

                  <div style={{
                    background: 'rgba(34, 197, 94, 0.08)',
                    border: '1px solid rgba(34, 197, 94, 0.3)',
                    borderRadius: '8px',
                    padding: '10px 12px',
                    fontSize: '11px',
                    color: '#22c55e',
                    display: 'flex',
                    alignItems: 'center',
                    gap: '6px'
                  }}>
                    <Check size={14} style={{ flexShrink: 0 }} />
                    <span>Per ciascun file spostato, una copia identica rimarrà attiva nella cartella conservata. Nessun media viene orfanato.</span>
                  </div>
                </>
              ) : null}
            </div>

            <div style={{ padding: '14px 20px', borderTop: '1px solid #334155', display: 'flex', justifyContent: 'flex-end', gap: '10px' }}>
              <button
                onClick={() => setPreviewModalOpen(false)}
                disabled={isApplyingFolderRule}
                style={{ background: '#334155', color: 'white', border: 'none', borderRadius: '8px', padding: '8px 16px', fontSize: '12px', fontWeight: 600, cursor: 'pointer' }}
              >
                Chiudi
              </button>

              {previewData && previewData.count > 0 && (
                <button
                  onClick={handleApplyFolderRule}
                  disabled={isApplyingFolderRule}
                  style={{
                    background: '#ef4444',
                    color: 'white',
                    border: 'none',
                    borderRadius: '8px',
                    padding: '8px 18px',
                    fontSize: '12px',
                    fontWeight: 700,
                    cursor: isApplyingFolderRule ? 'not-allowed' : 'pointer',
                    display: 'flex',
                    alignItems: 'center',
                    gap: '6px'
                  }}
                >
                  <Trash2 size={14} />
                  {isApplyingFolderRule ? 'Spostamento in corso...' : `Sposta ${previewData.count} file in .pmm_trash`}
                </button>
              )}
            </div>
          </div>
        </div>
      )}

      {/* Confirm Trash Similar Modal */}
      {confirmTrashSimilarModal && (
        <div style={{
          position: 'fixed',
          inset: 0,
          background: 'rgba(0,0,0,0.75)',
          backdropFilter: 'blur(4px)',
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
            maxWidth: '520px',
            width: '100%',
            padding: '24px',
            display: 'flex',
            flexDirection: 'column',
            gap: '16px'
          }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
                <div style={{ padding: '8px', background: 'rgba(239, 68, 68, 0.15)', borderRadius: '8px' }}>
                  <Trash2 size={20} color="#ef4444" />
                </div>
                <h3 style={{ fontSize: '17px', fontWeight: 700, margin: 0 }}>Cestinamento Scarti Simili</h3>
              </div>
              <button
                onClick={() => setConfirmTrashSimilarModal(null)}
                disabled={isTrashingSimilar}
                style={{ background: 'transparent', border: 'none', color: '#94a3b8', cursor: 'pointer' }}
              >
                <X size={18} />
              </button>
            </div>

            <div style={{ fontSize: '13px', color: '#cbd5e1', lineHeight: '1.6' }}>
              Verranno spostate nel cestino protetto del disco (<code>.pmm_trash</code>) <strong>tutte le copie</strong> dei <strong>{confirmTrashSimilarModal.trashMediaIds.length}</strong> scatti scartati.
              <br /><br />
              Lo scatto migliore resterà intatto nella sua cartella originale. L'operazione è <strong>100% reversibile</strong> e potrai ripristinare qualsiasi scarto dal tab Cestino.
            </div>

            <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '10px', marginTop: '6px' }}>
              <button
                onClick={() => setConfirmTrashSimilarModal(null)}
                disabled={isTrashingSimilar}
                style={{ background: '#334155', color: 'white', border: 'none', borderRadius: '8px', padding: '8px 16px', fontSize: '12px', fontWeight: 600, cursor: 'pointer' }}
              >
                Annulla
              </button>
              <button
                onClick={handleExecuteTrashSimilar}
                disabled={isTrashingSimilar}
                style={{
                  background: '#ef4444',
                  color: 'white',
                  border: 'none',
                  borderRadius: '8px',
                  padding: '8px 18px',
                  fontSize: '12px',
                  fontWeight: 700,
                  cursor: isTrashingSimilar ? 'not-allowed' : 'pointer',
                  display: 'flex',
                  alignItems: 'center',
                  gap: '6px'
                }}
              >
                <Trash2 size={14} />
                {isTrashingSimilar ? 'Spostamento in corso...' : 'Sposta Scarti in .pmm_trash'}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Media Detail Modal */}
      {selectedMediaId && (
        <MediaDetailModal
          mediaId={selectedMediaId}
          onClose={() => setSelectedMediaId(null)}
        />
      )}
    </div>
  );
};
