import React, { useEffect, useState, useRef } from 'react';
import { ApiClient } from '../../services/api';
import {
  FolderOpen,
  Square,
  Cpu
} from 'lucide-react';
import {
  detectBrowserCapabilities,
  traverseDirectoryHandle,
  traverseFileList,
  BrowserCapabilities
} from '../scanner/directoryTraverser';
import { ScannerEngine } from '../scanner/scannerEngine';
import { ScanProgress } from '../scanner/types';

interface ScansViewProps {
  selectedSourceForScan?: any | null;
  onScanCompleted?: () => void;
}

export const ScansView: React.FC<ScansViewProps> = ({ selectedSourceForScan, onScanCompleted }) => {
  const [scans, setScans] = useState<any[]>([]);
  const [sources, setSources] = useState<any[]>([]);
  const [selectedSourceId, setSelectedSourceId] = useState<string>(selectedSourceForScan?.id || '');
  const [capabilities, setCapabilities] = useState<BrowserCapabilities | null>(null);

  // Scanning live state
  const [isScanning, setIsScanning] = useState(false);
  const [progress, setProgress] = useState<ScanProgress | null>(null);

  const fileInputRef = useRef<HTMLInputElement | null>(null);
  const engineRef = useRef<ScannerEngine | null>(null);
  const activeScanJobRef = useRef<any | null>(null);

  useEffect(() => {
    setCapabilities(detectBrowserCapabilities());
    loadHistory();
    loadSources();
  }, []);

  useEffect(() => {
    if (selectedSourceForScan) {
      setSelectedSourceId(selectedSourceForScan.id);
    }
  }, [selectedSourceForScan]);

  const loadHistory = async () => {
    if (!ApiClient.getToken()) return;
    try {
      const data = await ApiClient.getScans();
      setScans(data);
    } catch (err) {
      console.error('Error loading scans:', err);
    }
  };

  const loadSources = async () => {
    if (!ApiClient.getToken()) return;
    try {
      const data = await ApiClient.getSources();
      setSources(data);
      if (!selectedSourceId && data.length > 0) {
        setSelectedSourceId(data[0].id);
      }
    } catch (err) {
      console.error('Error loading sources:', err);
    }
  };

  const startScanWorkflow = async (filesGenerator: any) => {
    if (!selectedSourceId) {
      alert('Seleziona prima una fonte a cui associare la scansione.');
      return;
    }

    try {
      setIsScanning(true);

      // 1. Create scan job on backend
      const job = await ApiClient.startScan(selectedSourceId, 0);
      activeScanJobRef.current = job;

      // 2. Setup batch buffer and engine
      let buffer: any[] = [];
      const BATCH_SIZE = 25; // Flush to backend every 25 files

      const flushBatch = async () => {
        if (buffer.length === 0 || !activeScanJobRef.current) return;
        const toSend = [...buffer];
        buffer = [];
        try {
          await ApiClient.sendBatch(
            activeScanJobRef.current.id,
            toSend,
            toSend[toSend.length - 1].relative_path
          );
        } catch (err) {
          console.error('Batch upload error:', err);
        }
      };

      const engine = new ScannerEngine({
        concurrency: 3,
        generateThumbnails: true,
        onProgress: (p) => setProgress(p),
        onFileScanned: (file) => {
          // Push into batch buffer
          buffer.push({
            filename: file.name,
            relative_path: file.relativePath,
            extension: file.extension,
            mime_type: file.mimeType,
            size_bytes: file.size,
            sha256: file.sha256,
            captured_at: file.capturedAt,
            modified_at: file.modifiedAt,
            width: file.width,
            height: file.height,
            duration_seconds: file.duration,
            metadata_json: file.metadata,
            thumbnail_base64: file.thumbnailDataUrl
          });

          if (buffer.length >= BATCH_SIZE) {
            flushBatch();
          }
        },
        onError: (err) => {
          console.warn('File scan error:', err);
        }
      });

      engineRef.current = engine;
      const result = await engine.scan(filesGenerator);

      // Final batch flush
      await flushBatch();

      // Complete scan job on backend
      await ApiClient.completeScan(
        job.id,
        result.files.length,
        result.errors.length
      );

      await loadHistory();
      if (onScanCompleted) {
        onScanCompleted();
      }
    } catch (err) {
      console.error('Scan failed:', err);
    } finally {
      setIsScanning(false);
    }
  };

  const handleSelectFSA = async () => {
    try {
      // @ts-expect-error - Chromium showDirectoryPicker
      const dirHandle = await window.showDirectoryPicker({ mode: 'read' });
      startScanWorkflow(traverseDirectoryHandle(dirHandle));
    } catch (err) {
      if ((err as Error).name !== 'AbortError') {
        console.error(err);
      }
    }
  };

  const handleSelectFallback = (e: React.ChangeEvent<HTMLInputElement>) => {
    if (e.target.files && e.target.files.length > 0) {
      startScanWorkflow(traverseFileList(e.target.files));
    }
  };

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '24px' }}>
      {/* Scanner Control Center */}
      <div style={{
        background: '#1e293b',
        border: '1px solid #334155',
        borderRadius: '16px',
        padding: '24px'
      }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: '16px', marginBottom: '20px' }}>
          <div>
            <h2 style={{ fontSize: '20px', fontWeight: 'bold' }}>Centro di Scansione Browser</h2>
            <p style={{ color: '#94a3b8', fontSize: '13px', marginTop: '4px' }}>
              Analizza cartelle locali direttamente dal browser con calcolo hash a streaming e sincronizzazione automatica sul backend.
            </p>
          </div>

          {/* Browser badge */}
          {capabilities && (
            <div style={{
              background: '#0f172a',
              border: '1px solid #334155',
              borderRadius: '8px',
              padding: '6px 12px',
              fontSize: '12px',
              display: 'flex',
              alignItems: 'center',
              gap: '8px'
            }}>
              <Cpu size={14} color="#38bdf8" />
              <span>{capabilities.browserName}</span>
              <span style={{ color: capabilities.hasFileSystemAccess ? '#22c55e' : '#f59e0b' }}>
                ({capabilities.hasFileSystemAccess ? 'FSA API Nativa' : 'Fallback Webkit'})
              </span>
            </div>
          )}
        </div>

        {/* Action Bar */}
        <div style={{
          background: '#0f172a',
          border: '1px solid #334155',
          borderRadius: '12px',
          padding: '16px',
          display: 'flex',
          flexWrap: 'wrap',
          alignItems: 'center',
          justifyContent: 'space-between',
          gap: '16px'
        }}>
          {/* Select Source */}
          <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
            <span style={{ fontSize: '13px', color: '#94a3b8' }}>Fonte di Destinazione:</span>
            <select
              value={selectedSourceId}
              disabled={isScanning}
              onChange={(e) => setSelectedSourceId(e.target.value)}
              style={{
                background: '#1e293b',
                color: 'white',
                border: '1px solid #334155',
                borderRadius: '8px',
                padding: '8px 12px',
                fontSize: '13px'
              }}
            >
              {sources.map((s) => (
                <option key={s.id} value={s.id}>
                  {s.name} ({s.source_type})
                </option>
              ))}
            </select>
          </div>

          {/* Start Buttons */}
          <div style={{ display: 'flex', gap: '10px' }}>
            {capabilities?.hasFileSystemAccess ? (
              <button
                onClick={handleSelectFSA}
                disabled={isScanning || !selectedSourceId}
                style={{
                  background: '#0284c7',
                  color: 'white',
                  border: 'none',
                  borderRadius: '8px',
                  padding: '10px 18px',
                  fontSize: '13px',
                  fontWeight: 600,
                  display: 'flex',
                  alignItems: 'center',
                  gap: '8px'
                }}
              >
                <FolderOpen size={16} />
                Seleziona Cartella (FSA API)
              </button>
            ) : null}

            <input
              type="file"
              ref={fileInputRef}
              // @ts-expect-error - webkitdirectory
              webkitdirectory=""
              directory=""
              multiple
              style={{ display: 'none' }}
              onChange={handleSelectFallback}
            />

            <button
              onClick={() => fileInputRef.current?.click()}
              disabled={isScanning || !selectedSourceId}
              style={{
                background: '#334155',
                color: 'white',
                border: 'none',
                borderRadius: '8px',
                padding: '10px 18px',
                fontSize: '13px',
                fontWeight: 600,
                display: 'flex',
                alignItems: 'center',
                gap: '8px'
              }}
            >
              <FolderOpen size={16} />
              {capabilities?.hasFileSystemAccess ? 'Fallback (Cartella Safari/FF)' : 'Seleziona Cartella'}
            </button>

            {isScanning && (
              <button
                onClick={() => engineRef.current?.abort()}
                style={{
                  background: '#f43f5e',
                  color: 'white',
                  border: 'none',
                  borderRadius: '8px',
                  padding: '10px 16px',
                  fontSize: '13px',
                  fontWeight: 600,
                  display: 'flex',
                  alignItems: 'center',
                  gap: '6px'
                }}
              >
                <Square size={14} /> Ferma
              </button>
            )}
          </div>
        </div>

        {/* Live Progress Bar and Metrics (if active) */}
        {progress && isScanning && (
          <div style={{ marginTop: '20px' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '8px', fontSize: '13px' }}>
              <span>
                <strong>Scansione in corso: </strong>
                <span style={{ color: '#38bdf8' }}>{progress.processed} di {progress.totalDiscovered} file</span>
              </span>
              <span style={{ color: '#94a3b8' }}>
                Velocità: <strong>{progress.filesPerSecond} file/s</strong> ({progress.mbPerSecond} MB/s)
              </span>
            </div>

            <div style={{ height: '8px', background: '#0f172a', borderRadius: '4px', overflow: 'hidden' }}>
              <div style={{
                height: '100%',
                width: `${progress.totalDiscovered > 0 ? (progress.processed / progress.totalDiscovered) * 100 : 0}%`,
                background: '#0284c7',
                transition: 'width 0.2s ease-out'
              }} />
            </div>

            {progress.currentFile && (
              <div style={{ color: '#64748b', fontSize: '11px', marginTop: '6px', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                Elaborazione: {progress.currentFile}
              </div>
            )}
          </div>
        )}
      </div>

      {/* History Table */}
      <div style={{
        background: '#1e293b',
        border: '1px solid #334155',
        borderRadius: '16px',
        padding: '24px'
      }}>
        <h3 style={{ fontSize: '16px', fontWeight: 600, marginBottom: '16px' }}>
          Storico Sessioni di Scansione
        </h3>

        {scans.length === 0 ? (
          <div style={{ textAlign: 'center', padding: '40px', color: '#94a3b8', fontSize: '13px' }}>
            Nessuna sessione di scansione registrata nel backend.
          </div>
        ) : (
          <div style={{ overflowX: 'auto' }}>
            <table style={{ width: '100%', borderCollapse: 'collapse', textAlign: 'left', fontSize: '13px' }}>
              <thead>
                <tr style={{ borderBottom: '1px solid #334155', color: '#94a3b8', fontSize: '12px' }}>
                  <th style={{ padding: '12px' }}>Stato</th>
                  <th style={{ padding: '12px' }}>Fonte</th>
                  <th style={{ padding: '12px' }}>File Elaborati</th>
                  <th style={{ padding: '12px' }}>Errori</th>
                  <th style={{ padding: '12px' }}>Inizio</th>
                  <th style={{ padding: '12px' }}>Fine</th>
                </tr>
              </thead>
              <tbody>
                {scans.map((scan) => (
                  <tr key={scan.id} style={{ borderBottom: '1px solid #1e293b' }}>
                    <td style={{ padding: '12px' }}>
                      <span style={{
                        display: 'inline-flex',
                        alignItems: 'center',
                        gap: '6px',
                        fontSize: '11px',
                        fontWeight: 600,
                        padding: '3px 8px',
                        borderRadius: '6px',
                        background: scan.status === 'completed' ? 'rgba(34, 197, 94, 0.15)' :
                                   scan.status === 'failed' ? 'rgba(244, 63, 94, 0.15)' : 'rgba(56, 189, 248, 0.15)',
                        color: scan.status === 'completed' ? '#22c55e' :
                               scan.status === 'failed' ? '#f43f5e' : '#38bdf8'
                      }}>
                        {scan.status.toUpperCase()}
                      </span>
                    </td>
                    <td style={{ padding: '12px', fontWeight: 500 }}>
                      {scan.source_name || 'Fonte'}
                    </td>
                    <td style={{ padding: '12px' }}>
                      <strong>{scan.processed_files}</strong> / {scan.total_files_discovered || scan.processed_files}
                    </td>
                    <td style={{ padding: '12px', color: scan.failed_files > 0 ? '#f43f5e' : '#94a3b8' }}>
                      {scan.failed_files}
                    </td>
                    <td style={{ padding: '12px', color: '#94a3b8' }}>
                      {new Date(scan.started_at).toLocaleString()}
                    </td>
                    <td style={{ padding: '12px', color: '#94a3b8' }}>
                      {scan.completed_at ? new Date(scan.completed_at).toLocaleTimeString() : 'In corso'}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  );
};
