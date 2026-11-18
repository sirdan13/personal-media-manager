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

    return response.json();
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

  public static async createSource(name: string, sourceType = 'browser_folder', rootPath?: string) {
    return this.request<any>('/sources', {
      method: 'POST',
      body: JSON.stringify({ name, source_type: sourceType, root_path: rootPath })
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

  public static async getSourceFingerprints(sourceId: string) {
    return this.request<Record<string, { id: string; size_bytes: number; filesystem_modified_at: string; sha256: string; availability_status: string }>>(`/sources/${sourceId}/fingerprints`);
  }

  public static async reconcileSource(sourceId: string, seenPaths: string[]) {
    return this.request<{ marked_missing: number; restored_available: number; total_active: number }>(`/sources/${sourceId}/reconcile`, {
      method: 'POST',
      body: JSON.stringify({ seen_paths: seenPaths })
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
    latMin?: number;
    latMax?: number;
    lonMin?: number;
    lonMax?: number;
    sortBy?: string;
    offset?: number;
    limit?: number;
  } = {}) {
    const q = new URLSearchParams();
    if (params.mediaType) q.set('media_type', params.mediaType);
    if (params.sourceId) q.set('source_id', params.sourceId);
    if (params.search) q.set('search', params.search);
    if (params.albumId) q.set('album_id', params.albumId);
    if (params.tagId) q.set('tag_id', params.tagId);
    if (params.monthKey) q.set('month_key', params.monthKey);
    if (params.isFavorite !== undefined) q.set('is_favorite', String(params.isFavorite));
    if (params.latMin !== undefined) q.set('lat_min', String(params.latMin));
    if (params.latMax !== undefined) q.set('lat_max', String(params.latMax));
    if (params.lonMin !== undefined) q.set('lon_min', String(params.lonMin));
    if (params.lonMax !== undefined) q.set('lon_max', String(params.lonMax));
    if (params.sortBy) q.set('sort_by', params.sortBy);
    if (params.offset !== undefined) q.set('offset', String(params.offset));
    if (params.limit !== undefined) q.set('limit', String(params.limit));
    return this.request<any[]>(`/media?${q.toString()}`);
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

  // Albums & Tags
  public static async getAlbums() {
    return this.request<{ id: string; user_id: string; name: string; description?: string; created_at: string; media_count: number }[]>('/albums');
  }

  public static async createAlbum(name: string, description?: string) {
    return this.request<any>('/albums', {
      method: 'POST',
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

  public static async getDuplicates(offset = 0, limit = 50) {
    return this.request<any[]>(`/duplicates?offset=${offset}&limit=${limit}`);
  }

  public static async getSimilarPhotos(maxDistance = 6) {
    return this.request<any[]>(`/duplicates/similar?max_distance=${maxDistance}`);
  }

  public static getDuplicateExportUrl(format: 'csv' | 'json'): string {
    const token = this.getToken();
    return `${API_BASE}/duplicates/export?format=${format}${token ? `&token=${encodeURIComponent(token)}` : ''}`;
  }

  public static getThumbnailUrl(mediaId: string): string {
    return `${API_BASE}/media/${mediaId}/thumbnail`;
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
}
