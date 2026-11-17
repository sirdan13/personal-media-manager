const API_BASE = 'http://localhost:8000/api/v1';

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
    sortBy?: string;
    offset?: number;
    limit?: number;
  } = {}) {
    const q = new URLSearchParams();
    if (params.mediaType) q.set('media_type', params.mediaType);
    if (params.sourceId) q.set('source_id', params.sourceId);
    if (params.search) q.set('search', params.search);
    if (params.sortBy) q.set('sort_by', params.sortBy);
    if (params.offset !== undefined) q.set('offset', String(params.offset));
    if (params.limit !== undefined) q.set('limit', String(params.limit));
    return this.request<any[]>(`/media?${q.toString()}`);
  }

  public static async getMediaDetail(mediaId: string) {
    return this.request<any>(`/media/${mediaId}`);
  }

  public static async getDuplicates(offset = 0, limit = 50) {
    return this.request<any[]>(`/duplicates?offset=${offset}&limit=${limit}`);
  }

  public static getThumbnailUrl(mediaId: string): string {
    return `${API_BASE}/media/${mediaId}/thumbnail`;
  }
}
