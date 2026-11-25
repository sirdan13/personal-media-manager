const API_BASE = '/api/v1';

export class ApiClient {
  private static token: string | null = localStorage.getItem('pmm_token');

  public static setToken(token: string | null) {
    this.token = token;
    if (token) {
      localStorage.setItem('pmm_token', token);
    } else {
      localStorage.removeItem('pmm_token');
    }
  }

  public static getToken(): string | null {
    return this.token;
  }

  private static async request<T>(endpoint: string, options: RequestInit = {}): Promise<T> {
    const headers = new Headers(options.headers || {});
    if (this.token) {
      headers.set('Authorization', `Bearer ${this.token}`);
    }
    if (!(options.body instanceof FormData) && !headers.has('Content-Type')) {
      headers.set('Content-Type', 'application/json');
    }

    const response = await fetch(`${API_BASE}${endpoint}`, {
      ...options,
      headers
    });

    if (!response.ok) {
      const errorData = await response.json().catch(() => ({ detail: response.statusText }));
      throw new Error(errorData.detail || `Request failed with status ${response.status}`);
    }

    if (response.status === 204) {
      return undefined as T;
    }
    const text = await response.text();
    return (text ? JSON.parse(text) : undefined) as T;
  }

  // Auth
  public static async register(email: string, password: string, displayName?: string) {
    const res = await this.request<{ access_token: string; user: any }>('/auth/register', {
      method: 'POST',
      body: JSON.stringify({ email, password, display_name: displayName })
    });
    this.setToken(res.access_token);
    return res;
  }

  public static async login(email: string, password: string) {
    const res = await this.request<{ access_token: string; user: any }>('/auth/login', {
      method: 'POST',
      body: JSON.stringify({ email, password })
    });
    this.setToken(res.access_token);
    return res;
  }

  public static async getMe() {
    return this.request<any>('/auth/me');
  }

  // Sources
  public static async getSources() {
    return this.request<any[]>('/sources');
  }

  public static async createSource(name: string, sourceType = 'browser_folder', rootPath?: string, role = 'primary', excludedPaths?: string) {
    return this.request<any>('/sources', {
      method: 'POST',
      body: JSON.stringify({ name, source_type: sourceType, root_path: rootPath, role, excluded_paths: excludedPaths })
    });
  }

  public static async updateSource(sourceId: string, payload: { name?: string; status?: string; root_path?: string; role?: string; excluded_paths?: string }) {
    return this.request<any>(`/sources/${sourceId}`, {
      method: 'PATCH',
      body: JSON.stringify(payload)
    });
  }

  public static async getSourceFolders(sourceId: string) {
    return this.request<{ folder: string; file_count: number }[]>(`/sources/${sourceId}/folders`);
  }

  public static async setSourceExclusions(sourceId: string, excludedPaths: string, purgeExisting = true) {
    return this.request<{ source_id: string; excluded_paths: string; purged_files: number; purged_media: number }>(`/sources/${sourceId}/exclusions`, {
      method: 'POST',
      body: JSON.stringify({ excluded_paths: excludedPaths, purge_existing: purgeExisting })
    });
  }

  public static async toggleSourceStatus(sourceId: string) {
    return this.request<any>(`/sources/${sourceId}/toggle-status`, {
      method: 'POST'
    });
  }

  public static async deleteSource(sourceId: string) {
    return this.request<void>(`/sources/${sourceId}`, {
      method: 'DELETE'
    });
  }

  public static async browseFilesystem(path?: string) {
    const query = path ? `?path=${encodeURIComponent(path)}` : '';
    return this.request<{
      current_path: string;
      parent_path: string | null;
      subdirectories: { name: string; path: string }[];
      volumes: { name: string; path: string; is_removable: boolean; type: string }[];
      user_shortcuts: { name: string; path: string; type: string }[];
    }>(`/sources/browse/filesystem${query}`);
  }

  public static async getSourceFingerprints(sourceId: string) {
    return this.request<Record<string, { id: string; size_bytes: number; filesystem_modified_at: string; sha256: string; availability_status: string }>>(`/sources/${sourceId}/fingerprints`);
  }

  public static async reconcileSource(sourceId: string, seenPaths: string[]) {
    return this.request<{ marked_missing: number; restored_available: number; moved_cleaned?: number; total_active: number }>(`/sources/${sourceId}/reconcile`, {
      method: 'POST',
      body: JSON.stringify({ seen_paths: seenPaths })
    });
  }

  public static async verifySources(sourceId?: string) {
    return this.request<{
      checked_sources: number;
      checked_files: number;
      newly_missing: number;
      restored_available: number;
      total_missing_files: number;
      orphan_media_count: number;
    }>('/sources/verify', {
      method: 'POST',
      body: JSON.stringify({ source_id: sourceId || null })
    });
  }

  public static async purgeMissingRecords(payload?: { source_id?: string; media_ids?: string[] }) {
    return this.request<{
      purged_files_count: number;
      purged_orphan_media_count: number;
    }>('/sources/purge-missing', {
      method: 'POST',
      body: JSON.stringify(payload || {})
    });
  }

  public static async compareSources(primaryId: string, secondaryId: string) {
    return this.request<{
      primary_source_id: string;
      secondary_source_id: string;
      total_primary_media: number;
      backed_up_media: number;
      missing_count: number;
      missing_bytes: number;
      coverage_pct: number;
      by_folder: Array<{ folder: string; count: number; bytes: number }>;
      missing_items: Array<{
        media_id: string;
        canonical_sha256: string;
        filename: string;
        relative_path: string;
        size_bytes: number;
        captured_at?: string;
        is_favorite: boolean;
        has_thumbnail: boolean;
        media_type: string;
      }>;
    }>(`/sources/compare?primary_id=${encodeURIComponent(primaryId)}&secondary_id=${encodeURIComponent(secondaryId)}`);
  }

  public static async backupCopyToSource(mediaIds: string[], targetSourceId: string, targetSubfolder = '') {
    return this.request<{
      copied_count: number;
      skipped_count: number;
      copied_bytes: number;
      copied_items: any[];
      errors: any[];
    }>('/sources/backup-copy', {
      method: 'POST',
      body: JSON.stringify({
        media_ids: mediaIds,
        target_source_id: targetSourceId,
        target_subfolder: targetSubfolder
      })
    });
  }

  // Scans
  public static async getScans() {
    return this.request<any[]>('/scans');
  }

  public static async startScan(sourceId: string, totalFilesDiscovered = 0) {
    return this.request<any>(`/scans/${sourceId}/start`, {
      method: 'POST',
      body: JSON.stringify({ total_files_discovered: totalFilesDiscovered })
    });
  }

  public static async sendBatch(scanId: string, items: any[], checkpointPath?: string) {
    return this.request<any>(`/scans/${scanId}/batch`, {
      method: 'POST',
      body: JSON.stringify({ items, checkpoint_path: checkpointPath })
    });
  }

  public static async getScanStatus(scanId: string) {
    return this.request<any>(`/scans/${scanId}`);
  }

  public static async startServerScan(sourceId: string, backfillThumbnailsOnly = false) {
    return this.request<any>(`/scans/${sourceId}/server-scan`, {
      method: 'POST',
      body: JSON.stringify({ backfill_thumbnails_only: backfillThumbnailsOnly })
    });
  }

  public static async cancelScan(scanId: string) {
    return this.request<any>(`/scans/${scanId}/cancel`, {
      method: 'POST'
    });
  }

  public static async completeScan(scanId: string, totalProcessed: number, failedFiles = 0, errorMessage?: string) {
    return this.request<any>(`/scans/${scanId}/complete`, {
      method: 'POST',
      body: JSON.stringify({
        total_processed: totalProcessed,
        failed_files: failedFiles,
        error_message: errorMessage
      })
    });
  }

  // Media & Duplicates
  public static async getDashboardStats() {
    return this.request<any>('/media/dashboard/stats');
  }

  public static async getMedia(params: {
    mediaType?: string;
    sourceId?: string;
    search?: string;
    albumId?: string;
    tagId?: string;
    monthKey?: string;
    isFavorite?: boolean;
    protectionStatus?: string;
    latMin?: number;
    latMax?: number;
    lonMin?: number;
    lonMax?: number;
    sortBy?: string;
    offset?: number;
    limit?: number;
  } = {}, signal?: AbortSignal) {
    const res = await this.getMediaWithTotal(params, signal);
    return res.items;
  }

  public static async getMediaWithTotal(params: {
    mediaType?: string;
    sourceId?: string;
    search?: string;
    albumId?: string;
    tagId?: string;
    monthKey?: string;
    isFavorite?: boolean;
    protectionStatus?: string;
    latMin?: number;
    latMax?: number;
    lonMin?: number;
    lonMax?: number;
    sortBy?: string;
    offset?: number;
    limit?: number;
  } = {}, signal?: AbortSignal): Promise<{ items: any[]; totalCount: number }> {
    const q = new URLSearchParams();
    if (params.mediaType) q.set('media_type', params.mediaType);
    if (params.sourceId) q.set('source_id', params.sourceId);
    if (params.search) q.set('search', params.search);
    if (params.albumId) q.set('album_id', params.albumId);
    if (params.tagId) q.set('tag_id', params.tagId);
    if (params.monthKey) q.set('month_key', params.monthKey);
    if (params.isFavorite !== undefined) q.set('is_favorite', String(params.isFavorite));
    if (params.protectionStatus) q.set('protection_status', params.protectionStatus);
    if (params.latMin !== undefined) q.set('lat_min', String(params.latMin));
    if (params.latMax !== undefined) q.set('lat_max', String(params.latMax));
    if (params.lonMin !== undefined) q.set('lon_min', String(params.lonMin));
    if (params.lonMax !== undefined) q.set('lon_max', String(params.lonMax));
    if (params.sortBy) q.set('sort_by', params.sortBy);
    if (params.offset !== undefined) q.set('offset', String(params.offset));
    if (params.limit !== undefined) q.set('limit', String(params.limit));

    const headers = new Headers();
    if (this.token) {
      headers.set('Authorization', `Bearer ${this.token}`);
    }
    const response = await fetch(`${API_BASE}/media?${q.toString()}`, {
      headers,
      signal
    });

    if (!response.ok) {
      const errorData = await response.json().catch(() => ({ detail: response.statusText }));
      throw new Error(errorData.detail || `Request failed with status ${response.status}`);
    }

    const totalHeader = response.headers.get('X-Total-Count');
    const totalCount = totalHeader ? parseInt(totalHeader, 10) : 0;
    const items = await response.json();
    return { items, totalCount };
  }

  public static async getTimeline() {
    return this.request<{ month_key: string; year: number; month: number; count: number }[]>('/media/timeline');
  }

  public static async getMapMedia() {
    return this.request<{
      id: string;
      latitude: number;
      longitude: number;
      primary_filename?: string;
      captured_at?: string;
      has_thumbnail: boolean;
      media_type: string;
    }[]>('/media/map');
  }

  public static async toggleFavorite(mediaId: string) {
    return this.request<{ id: string; is_favorite: boolean }>(`/media/${mediaId}/favorite`, {
      method: 'POST'
    });
  }

  public static async batchFavorite(mediaIds: string[], isFavorite: boolean) {
    return this.request<{ updated_count: number; is_favorite: boolean }>('/media/batch/favorite', {
      method: 'POST',
      body: JSON.stringify({ media_ids: mediaIds, is_favorite: isFavorite })
    });
  }

  public static async batchTrashMedia(mediaIds: string[], sourceId?: string) {
    return this.request<{
      trashed_media_count: number;
      trashed_files_count: number;
      freed_bytes: number;
      items: any[];
      errors: any[];
    }>('/media/batch/trash', {
      method: 'POST',
      body: JSON.stringify({ media_ids: mediaIds, source_id: sourceId || null })
    });
  }

  // Albums & Tags
  public static async getAlbums() {
    return this.request<{
      id: string;
      user_id: string;
      name: string;
      description?: string;
      created_at: string;
      media_count: number;
      cover_media_id?: string;
    }[]>('/albums');
  }

  public static async createAlbum(name: string, description?: string) {
    return this.request<any>('/albums', {
      method: 'POST',
      body: JSON.stringify({ name, description })
    });
  }

  public static async updateAlbum(albumId: string, name?: string, description?: string) {
    return this.request<any>(`/albums/${albumId}`, {
      method: 'PATCH',
      body: JSON.stringify({ name, description })
    });
  }

  public static async deleteAlbum(albumId: string) {
    return this.request<void>(`/albums/${albumId}`, { method: 'DELETE' });
  }

  public static async addMediaToAlbum(albumId: string, mediaIds: string[]) {
    return this.request<{ status: string; added_count: number }>(`/albums/${albumId}/media`, {
      method: 'POST',
      body: JSON.stringify({ media_ids: mediaIds })
    });
  }

  public static async removeMediaFromAlbum(albumId: string, mediaId: string) {
    return this.request<{ status: string; removed: boolean }>(`/albums/${albumId}/media/${mediaId}`, {
      method: 'DELETE'
    });
  }

  public static async getTags() {
    return this.request<{ id: string; user_id: string; name: string; color: string; created_at: string; media_count: number }[]>('/tags');
  }

  public static async createTag(name: string, color?: string) {
    return this.request<any>('/tags', {
      method: 'POST',
      body: JSON.stringify({ name, color })
    });
  }

  public static async deleteTag(tagId: string) {
    return this.request<void>(`/tags/${tagId}`, { method: 'DELETE' });
  }

  public static async addMediaToTag(tagId: string, mediaIds: string[]) {
    return this.request<{ status: string; added_count: number }>(`/tags/${tagId}/media`, {
      method: 'POST',
      body: JSON.stringify({ media_ids: mediaIds })
    });
  }

  public static async removeMediaFromTag(tagId: string, mediaId: string) {
    return this.request<{ status: string; removed: boolean }>(`/tags/${tagId}/media/${mediaId}`, {
      method: 'DELETE'
    });
  }

  public static async getMediaDetail(mediaId: string) {
    return this.request<any>(`/media/${mediaId}`);
  }

  public static async revealFile(fileId: string) {
    return this.request<{ status: string; file_id: string; filename: string; source_name: string; path: string }>(
      `/media/files/${fileId}/reveal`,
      { method: 'POST' }
    );
  }

  public static async revealMedia(mediaId: string, fileId?: string) {
    const query = fileId ? `?file_id=${encodeURIComponent(fileId)}` : '';
    return this.request<{ status: string; file_id: string; filename: string; source_name: string; path: string }>(
      `/media/${mediaId}/reveal${query}`,
      { method: 'POST' }
    );
  }

  public static async getDuplicates(
    offset = 0,
    limit = 50,
    mode: 'all' | 'intra_source' | 'multi_source' = 'all',
    sortBy: string = 'size_desc'
  ) {
    return this.request<any[]>(`/duplicates?offset=${offset}&limit=${limit}&mode=${mode}&sort_by=${sortBy}`);
  }

  public static async getDuplicatesSummary() {
    return this.request<{
      total_groups: number;
      intra_source_groups?: number;
      healthy_multi_source_groups?: number;
      unprotected_media_count?: number;
      unprotected_favorites_count?: number;
      protected_media_count?: number;
      protection_coverage_pct?: number;
      intra_source_wasted_bytes?: number;
      multi_source_backup_bytes?: number;
      total_redundant_copies: number;
      total_recoverable_bytes: number;
    }>('/duplicates/summary');
  }

  public static async getBackupGap(primarySourceId: string, backupSourceId: string, onlyFavorites = false) {
    return this.request<{
      primary_source_id: string;
      backup_source_id: string;
      total_primary_media: number;
      backed_up_media: number;
      missing_on_backup_count: number;
      missing_on_backup_bytes: number;
      coverage_pct: number;
      missing_items: any[];
    }>(`/duplicates/backup-gap?primary_source_id=${encodeURIComponent(primarySourceId)}&backup_source_id=${encodeURIComponent(backupSourceId)}&only_favorites=${onlyFavorites}`);
  }

  public static getBackupGapExportUrl(primarySourceId: string, backupSourceId: string, format: 'csv' | 'json' | 'rsync_txt', onlyFavorites = false): string {
    const token = this.getToken();
    const authQuery = token ? `&token=${encodeURIComponent(token)}` : '';
    return `${API_BASE}/duplicates/backup-gap?primary_source_id=${encodeURIComponent(primarySourceId)}&backup_source_id=${encodeURIComponent(backupSourceId)}&export_format=${format}&only_favorites=${onlyFavorites}${authQuery}`;
  }

  public static async getSimilarPhotos(maxDistance = 6, maxTimeDiffHours?: number) {
    let url = `/duplicates/similar?max_distance=${maxDistance}`;
    if (maxTimeDiffHours !== undefined) {
      url += `&max_time_diff_hours=${maxTimeDiffHours}`;
    }
    return this.request<any[]>(url);
  }

  public static async trashDuplicateFiles(fileIds: string[], keepFileIds?: string[]) {
    return this.request<{
      trashed_count: number;
      trashed_bytes: number;
      items: any[];
      errors: any[];
    }>('/duplicates/trash', {
      method: 'POST',
      body: JSON.stringify({ file_ids: fileIds, keep_file_ids: keepFileIds })
    });
  }

  public static async getTrashedFiles(sourceId?: string) {
    const q = sourceId ? `?source_id=${encodeURIComponent(sourceId)}` : '';
    return this.request<{
      total_count: number;
      total_bytes: number;
      by_source: Array<{
        source_id: string;
        source_name: string;
        root_path?: string;
        trash_folder_path?: string;
        is_online: boolean;
        count: number;
        bytes: number;
      }>;
      items: Array<{
        file_id: string;
        media_id: string;
        source_id: string;
        source_name: string;
        is_source_online: boolean;
        filename: string;
        original_relative_path: string;
        trash_relative_path: string;
        size_bytes: number;
        sha256: string;
        trashed_at?: string;
        has_thumbnail: boolean;
      }>;
    }>(`/duplicates/trash${q}`);
  }

  public static async restoreTrashedFiles(fileIds: string[]) {
    return this.request<{
      restored_count: number;
      restored_bytes: number;
      items: any[];
      errors: any[];
    }>('/duplicates/trash/restore', {
      method: 'POST',
      body: JSON.stringify({ file_ids: fileIds })
    });
  }

  public static async emptyTrash(payload?: { source_id?: string; file_ids?: string[] }) {
    return this.request<{
      deleted_files_count: number;
      freed_bytes: number;
      deleted_media_count: number;
      errors: any[];
    }>('/duplicates/trash/empty', {
      method: 'POST',
      body: JSON.stringify(payload || {})
    });
  }

  public static getDuplicateExportUrl(
    format: 'csv' | 'json',
    preferredSourceId?: string,
    mode: 'all' | 'intra_source' | 'multi_source' = 'all',
    sortBy: string = 'size_desc'
  ): string {
    const token = this.getToken();
    let url = `${API_BASE}/duplicates/export?format=${format}&mode=${mode}&sort_by=${encodeURIComponent(sortBy)}`;
    if (preferredSourceId) {
      url += `&preferred_source_id=${encodeURIComponent(preferredSourceId)}`;
    }
    if (token) {
      url += `&token=${encodeURIComponent(token)}`;
    }
    return url;
  }

  public static getThumbnailUrl(mediaId: string): string {
    const token = this.getToken();
    return `${API_BASE}/media/${mediaId}/thumbnail${token ? `?token=${encodeURIComponent(token)}` : ''}`;
  }

  public static getMediaDownloadUrl(mediaId: string): string {
    const token = this.getToken();
    return `${API_BASE}/media/${mediaId}/stream?download=true${token ? `&token=${encodeURIComponent(token)}` : ''}`;
  }

  public static getMediaPreviewUrl(mediaId: string, maxEdge = 1920): string {
    const token = this.getToken();
    return `${API_BASE}/media/${mediaId}/preview?max_edge=${maxEdge}${token ? `&token=${encodeURIComponent(token)}` : ''}`;
  }

  public static getMediaStreamUrl(mediaId: string): string {
    const token = this.getToken();
    return `${API_BASE}/media/${mediaId}/stream${token ? `?token=${encodeURIComponent(token)}` : ''}`;
  }

  // Storage Optimization & Profile Settings
  public static async getStorageSettings() {
    return this.request<{
      thumbnail_profile: string;
      thumbnails_count: number;
      total_bytes: number;
      avg_kb: number;
      available_profiles: Record<string, { max_edge: number; quality: number }>;
    }>('/settings/storage');
  }

  public static async updateStorageProfile(thumbnailProfile: string) {
    return this.request<{ message: string; thumbnail_profile: string }>('/settings/storage', {
      method: 'PUT',
      body: JSON.stringify({ thumbnail_profile: thumbnailProfile })
    });
  }

  public static async compactStorage() {
    return this.request<{
      compacted_count: number;
      before_bytes: number;
      after_bytes: number;
      saved_bytes: number;
      profile_applied: string;
    }>('/settings/storage/compact', {
      method: 'POST'
    });
  }

  public static getDatabaseBackupUrl(): string {
    const token = this.getToken();
    return `${API_BASE}/settings/backup/db${token ? `?token=${encodeURIComponent(token)}` : ''}`;
  }

  public static async downloadDatabaseBackup(): Promise<void> {
    const token = this.getToken();
    const headers: Record<string, string> = {};
    if (token) headers['Authorization'] = `Bearer ${token}`;

    const res = await fetch(`${API_BASE}/settings/backup/db`, {
      method: 'GET',
      headers
    });
    if (!res.ok) {
      const errJson = await res.json().catch(() => ({}));
      throw new Error(errJson.detail || `Backup fallito con codice ${res.status}`);
    }
    const blob = await res.blob();
    const disposition = res.headers.get('content-disposition');
    let filename = 'personal_media_manager_backup.db';
    if (disposition && disposition.includes('filename=')) {
      const match = disposition.match(/filename="?([^";]+)"?/);
      if (match && match[1]) filename = match[1];
    }
    const url = window.URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = filename;
    document.body.appendChild(a);
    a.click();
    a.remove();
    window.URL.revokeObjectURL(url);
  }

  public static async runGeotagBackfill(): Promise<{ updated_count: number }> {
    return this.request<{ updated_count: number }>('/settings/maintenance/geotag-backfill', {
      method: 'POST'
    });
  }

  public static async cleanupStaleScans(): Promise<{ recovered_count: number }> {
    return this.request<{ recovered_count: number }>('/settings/maintenance/cleanup-stale-scans', {
      method: 'POST'
    });
  }

  // AI Advisor & Smart Curation
  public static async getAISettings(): Promise<AISettingsData> {
    return this.request<AISettingsData>('/ai/settings');
  }

  public static async updateAISettings(payload: AISettingsUpdatePayload): Promise<AISettingsData> {
    return this.request<AISettingsData>('/ai/settings', {
      method: 'PUT',
      body: JSON.stringify(payload)
    });
  }

  public static async getAIModels(params?: { provider_name?: string; api_key?: string; ollama_base_url?: string }): Promise<AIModelItem[]> {
    const searchParams = new URLSearchParams();
    if (params?.provider_name) searchParams.append('provider_name', params.provider_name);
    if (params?.api_key) searchParams.append('api_key', params.api_key);
    if (params?.ollama_base_url) searchParams.append('ollama_base_url', params.ollama_base_url);
    const qs = searchParams.toString();
    return this.request<AIModelItem[]>(`/ai/models${qs ? `?${qs}` : ''}`);
  }

  public static async testAI(payload?: { provider?: string; api_key?: string; model?: string; ollama_base_url?: string }): Promise<AITestResult> {
    return this.request<AITestResult>('/ai/test', {
      method: 'POST',
      body: payload ? JSON.stringify(payload) : undefined
    });
  }

  public static async suggestKeepCopies(mediaIds: string[], preferredSourceId?: string): Promise<DuplicateKeepSuggestion[]> {
    return this.request<DuplicateKeepSuggestion[]>('/ai/duplicates/suggest-keep', {
      method: 'POST',
      body: JSON.stringify({ media_ids: mediaIds, preferred_source_id: preferredSourceId })
    });
  }

  public static async analyzeFolderAdvisor(sourceId?: string, useAi = true): Promise<FolderAdvisorAnalysisResult> {
    return this.request<FolderAdvisorAnalysisResult>('/ai/folder-advisor/analyze', {
      method: 'POST',
      body: JSON.stringify({ source_id: sourceId, use_ai: useAi })
    });
  }

  public static async previewFolderRule(sourceId: string, keepFolder: string, trashFolder: string): Promise<FolderRulePreview> {
    return this.request<FolderRulePreview>('/ai/folder-advisor/preview', {
      method: 'POST',
      body: JSON.stringify({ source_id: sourceId, keep_folder: keepFolder, trash_folder: trashFolder })
    });
  }

  public static async suggestBestShot(mediaIds: string[], useAi = true): Promise<BestShotResult> {
    return this.request<BestShotResult>('/ai/similar/best-shot', {
      method: 'POST',
      body: JSON.stringify({ media_ids: mediaIds, use_ai: useAi })
    });
  }

  public static async trashSimilarMedia(keepMediaId: string, trashMediaIds: string[], maxDistance = 10): Promise<any> {
    return this.request<any>('/duplicates/trash-similar', {
      method: 'POST',
      body: JSON.stringify({
        keep_media_id: keepMediaId,
        trash_media_ids: trashMediaIds,
        max_distance: maxDistance
      })
    });
  }

  public static async suggestSmartAlbums(useAi = true, minMedia = 15): Promise<SmartAlbumSuggestResult> {
    return this.request<SmartAlbumSuggestResult>('/ai/smart-albums/suggest', {
      method: 'POST',
      body: JSON.stringify({ use_ai: useAi, min_media: minMedia })
    });
  }

  public static async createSmartAlbum(payload: {
    event_id: string;
    name: string;
    description?: string;
    tags?: string[];
  }): Promise<{ album_id: string; added_count: number; tags_applied: number }> {
    return this.request<{ album_id: string; added_count: number; tags_applied: number }>('/ai/smart-albums/create', {
      method: 'POST',
      body: JSON.stringify(payload)
    });
  }
}

export interface AISettingsData {
  provider: 'none' | 'gemini' | 'ollama';
  model_text?: string | null;
  model_vision?: string | null;
  has_api_key: boolean;
  api_key_hint?: string | null;
  api_key_from_env: boolean;
  ollama_base_url?: string | null;
  allow_cloud_images: boolean;
  daily_request_cap: number;
  usage_today: {
    requests: number;
    input_tokens: number;
    output_tokens: number;
  };
}

export interface AISettingsUpdatePayload {
  provider?: string;
  model_text?: string | null;
  model_vision?: string | null;
  api_key?: string | null;
  ollama_base_url?: string | null;
  allow_cloud_images?: boolean;
  daily_request_cap?: number;
}

export interface AIModelItem {
  id: string;
  display_name: string;
  input_token_limit?: number;
}

export interface AITestResult {
  ok: boolean;
  provider?: string;
  model?: string;
  latency_ms?: number;
  error?: string;
}

export interface DuplicateKeepSuggestion {
  media_id: string;
  engine: string;
  keep_file_ids: string[];
  trash_file_ids: string[];
  skipped_offline_file_ids: string[];
  scores: Record<string, number>;
  reasons: Record<string, string>;
  confidence: number;
}

export interface FolderPairInfo {
  pair_id: string;
  source_id: string;
  source_name: string;
  dir_a: { path: string; total_files: number; path_score: number };
  dir_b: { path: string; total_files: number; path_score: number };
  shared_media_count: number;
  shared_bytes: number;
}

export interface FolderRule {
  pair_id: string;
  keep_folder: string;
  trash_folder: string;
  rationale: string;
  confidence: number;
  engine: string;
}

export interface FolderAdvisorAnalysisResult {
  engine_used: string;
  ai_error?: string | null;
  pairs: FolderPairInfo[];
  rules: FolderRule[];
}

export interface FolderRulePreview {
  file_ids: string[];
  keep_file_ids: string[];
  count: number;
  bytes: number;
  sample: {
    file_id: string;
    filename: string;
    relative_path: string;
    size_bytes: number;
    media_id: string;
    has_thumbnail: boolean;
  }[];
}

export interface BestShotResult {
  engine: string;
  ai_error?: string | null;
  best_media_id: string;
  keep_media_ids: string[];
  trash_media_ids: string[];
  reasons: Record<string, string>;
  summary: string;
  heuristic_scores?: Record<string, any>;
}

export interface SmartAlbumEvent {
  event_id: string;
  start: string;
  end: string;
  media_count: number;
  top_places: { place_name: string; count: number }[];
  top_folders: { folder: string; count: number }[];
  cover_media_id: string;
  suggested_name: string;
  suggested_description: string;
  suggested_tags: string[];
}

export interface SmartAlbumSuggestResult {
  engine: string;
  ai_error?: string | null;
  events: SmartAlbumEvent[];
}

