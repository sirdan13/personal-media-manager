import React, { useState, useEffect, useRef } from 'react';
import {
  FolderOpen,
  Play,
  Pause,
  Square,
  Zap,
  HardDrive,
  Copy,
  AlertTriangle,
  CheckCircle2,
  Cpu,
  Layers,
  FileText,
  Clock,
  Sparkles
} from 'lucide-react';
import {
  detectBrowserCapabilities,
  traverseDirectoryHandle,
  traverseFileList,
  BrowserCapabilities
} from './features/scanner/directoryTraverser';
import { ScannerEngine } from './features/scanner/scannerEngine';
import { runBenchmark } from './features/scanner/benchmarkRunner';
import { BenchmarkResult, ScanError, ScannedFile, ScanProgress } from './features/scanner/types';

export const App: React.FC = () => {
  const [capabilities, setCapabilities] = useState<BrowserCapabilities | null>(null);
  const [scannedFiles, setScannedFiles] = useState<ScannedFile[]>([]);
  const [scanErrors, setScanErrors] = useState<ScanError[]>([]);
  const [progress, setProgress] = useState<ScanProgress | null>(null);
  const [benchmarks, setBenchmarks] = useState<BenchmarkResult[]>([]);
  const [concurrency, setConcurrency] = useState<number>(3);
  const [generateThumbnails, setGenerateThumbnails] = useState<boolean>(true);
  const [activeTab, setActiveTab] = useState<'gallery' | 'duplicates' | 'benchmarks' | 'errors'>('gallery');
  const [isRunningBenchmark, setIsRunningBenchmark] = useState<boolean>(false);

  const engineRef = useRef<ScannerEngine | null>(null);
  const fileInputRef = useRef<HTMLInputElement | null>(null);

  useEffect(() => {
    setCapabilities(detectBrowserCapabilities());
  }, []);

  const handleSelectDirectoryNative = async () => {
    try {
      // @ts-expect-error - Chromium API
      const dirHandle = await window.showDirectoryPicker({ mode: 'read' });
      startScan(traverseDirectoryHandle(dirHandle));
    } catch (err) {
      if ((err as Error).name !== 'AbortError') {
        console.error('Directory selection error:', err);
      }
    }
  };

  const handleSelectDirectoryFallback = (e: React.ChangeEvent<HTMLInputElement>) => {
    if (e.target.files && e.target.files.length > 0) {
      startScan(traverseFileList(e.target.files));
    }
  };

  const startScan = async (source: any) => {
    setScannedFiles([]);
    setScanErrors([]);
    setActiveTab('gallery');

    const engine = new ScannerEngine({
      concurrency,
      generateThumbnails,
      onProgress: (p) => setProgress(p),
      onFileScanned: (file) => {
        setScannedFiles((prev) => [file, ...prev.slice(0, 499)]); // Keep latest 500 in live view for DOM performance
      },
      onError: (err) => {
        setScanErrors((prev) => [err, ...prev]);
      }
    });

    engineRef.current = engine;
    await engine.scan(source);
  };

  const handlePause = () => {
    engineRef.current?.pause();
  };

  const handleResume = () => {
    engineRef.current?.resume();
  };

  const handleStop = () => {
    engineRef.current?.abort();
  };

  const runBenchmarkSuite = async (count: number, includeVideos = false) => {
    setIsRunningBenchmark(true);
    setActiveTab('benchmarks');
    try {
      const { result } = await runBenchmark({
        count,
        includeDuplicates: true,
        includeVideos,
        concurrency
      });
      setBenchmarks((prev) => [result, ...prev]);
    } catch (err) {
      console.error('Benchmark error:', err);
    } finally {
      setIsRunningBenchmark(false);
    }
  };

  const duplicates = scannedFiles.filter((f) => f.isDuplicateOf);

  return (
    <div style={{ maxWidth: '1440px', margin: '0 auto', padding: '24px' }}>
      {/* Header */}
      <header style={{
        display: 'flex',
        justifyContent: 'space-between',
        alignItems: 'center',
        borderBottom: '1px solid var(--border-color)',
        paddingBottom: '20px',
        marginBottom: '24px'
      }}>
        <div>
          <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
            <HardDrive size={28} color="var(--primary)" />
            <h1 style={{ fontSize: '24px', fontWeight: 'bold' }}>
              Personal Media Manager
            </h1>
            <span style={{
              background: '#0284c7',
              color: 'white',
              fontSize: '11px',
              padding: '2px 8px',
              borderRadius: '12px',
              fontWeight: 600
            }}>
              Milestone 1 Scanner Prototype
            </span>
          </div>
          <p style={{ color: 'var(--text-muted)', fontSize: '14px', marginTop: '4px' }}>
            Scansione ricorsiva client-side, hashing SHA-256 a chunk, metadati EXIF e deduplicazione esatta
          </p>
        </div>

        {/* Browser capabilities pill */}
        {capabilities && (
          <div style={{
            background: 'var(--bg-card)',
            border: '1px solid var(--border-color)',
            borderRadius: '8px',
            padding: '10px 16px',
            fontSize: '12px'
          }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '4px' }}>
              <Cpu size={14} color="var(--primary)" />
              <strong>{capabilities.browserName}</strong>
            </div>
            <div style={{ display: 'flex', gap: '12px', color: 'var(--text-muted)' }}>
              <span>FSA API: {capabilities.hasFileSystemAccess ? '✅ Attiva' : '❌ Assente (Usa Fallback)'}</span>
              <span>Chunk WASM: {capabilities.hasWebAssembly ? '✅ Attivo' : '❌ WebCrypto'}</span>
            </div>
          </div>
        )}
      </header>

      {/* Control Panel */}
      <section style={{
        background: 'var(--bg-card)',
        border: '1px solid var(--border-color)',
        borderRadius: '12px',
        padding: '20px',
        marginBottom: '24px'
      }}>
        <div style={{ display: 'flex', flexWrap: 'wrap', justifyContent: 'space-between', alignItems: 'center', gap: '16px' }}>
          {/* Main Action Buttons */}
          <div style={{ display: 'flex', gap: '12px', alignItems: 'center' }}>
            {capabilities?.hasFileSystemAccess ? (
              <button
                onClick={handleSelectDirectoryNative}
                disabled={progress?.status === 'scanning'}
                style={{
                  display: 'flex',
                  alignItems: 'center',
                  gap: '8px',
                  background: '#0284c7',
                  color: 'white',
                  border: 'none',
                  borderRadius: '8px',
                  padding: '10px 18px',
                  fontSize: '14px',
                  fontWeight: 600
                }}
              >
                <FolderOpen size={18} />
                Seleziona Cartella (FSA API)
              </button>
            ) : null}

            {/* Always provide fallback input button for Safari/Firefox */}
            <input
              type="file"
              ref={fileInputRef}
              // @ts-expect-error - webkitdirectory standard attribute for folders
              webkitdirectory=""
              directory=""
              multiple
              style={{ display: 'none' }}
              onChange={handleSelectDirectoryFallback}
            />

            <button
              onClick={() => fileInputRef.current?.click()}
              disabled={progress?.status === 'scanning'}
              style={{
                display: 'flex',
                alignItems: 'center',
                gap: '8px',
                background: '#334155',
                color: 'white',
                border: 'none',
                borderRadius: '8px',
                padding: '10px 18px',
                fontSize: '14px',
                fontWeight: 600
              }}
            >
              <FolderOpen size={18} />
              {capabilities?.hasFileSystemAccess ? 'Seleziona con Fallback (webkitdirectory)' : 'Seleziona Cartella (Safari/Firefox)'}
            </button>

            {progress?.status === 'scanning' && (
              <button
                onClick={handlePause}
                style={{
                  display: 'flex',
                  alignItems: 'center',
                  gap: '6px',
                  background: '#f59e0b',
                  color: 'black',
                  border: 'none',
                  borderRadius: '8px',
                  padding: '10px 16px',
                  fontSize: '14px',
                  fontWeight: 600
                }}
              >
                <Pause size={16} /> Pausa
              </button>
            )}

            {progress?.status === 'paused' && (
              <button
                onClick={handleResume}
                style={{
                  display: 'flex',
                  alignItems: 'center',
                  gap: '6px',
                  background: '#22c55e',
                  color: 'white',
                  border: 'none',
                  borderRadius: '8px',
                  padding: '10px 16px',
                  fontSize: '14px',
                  fontWeight: 600
                }}
              >
                <Play size={16} /> Riprendi
              </button>
            )}

            {(progress?.status === 'scanning' || progress?.status === 'paused') && (
              <button
                onClick={handleStop}
                style={{
                  display: 'flex',
                  alignItems: 'center',
                  gap: '6px',
                  background: '#f43f5e',
                  color: 'white',
                  border: 'none',
                  borderRadius: '8px',
                  padding: '10px 16px',
                  fontSize: '14px',
                  fontWeight: 600
                }}
              >
                <Square size={16} /> Interrompi
              </button>
            )}
          </div>

          {/* Engine Tuning Options */}
          <div style={{ display: 'flex', alignItems: 'center', gap: '20px' }}>
            <label style={{ display: 'flex', alignItems: 'center', gap: '8px', fontSize: '13px' }}>
              <span style={{ color: 'var(--text-muted)' }}>Concorrenza:</span>
              <select
                value={concurrency}
                disabled={progress?.status === 'scanning'}
                onChange={(e) => setConcurrency(Number(e.target.value))}
                style={{
                  background: '#0f172a',
                  color: 'white',
                  border: '1px solid var(--border-color)',
                  borderRadius: '6px',
                  padding: '4px 8px',
                  fontSize: '13px'
                }}
              >
                <option value={1}>1 Worker (Sequenziale)</option>
                <option value={2}>2 Workers</option>
                <option value={3}>3 Workers (Consigliato)</option>
                <option value={4}>4 Workers</option>
                <option value={6}>6 Workers (Multicore)</option>
              </select>
            </label>

            <label style={{ display: 'flex', alignItems: 'center', gap: '8px', fontSize: '13px', cursor: 'pointer' }}>
              <input
                type="checkbox"
                checked={generateThumbnails}
                disabled={progress?.status === 'scanning'}
                onChange={(e) => setGenerateThumbnails(e.target.checked)}
              />
              <span>Genera Miniature (384px WebP)</span>
            </label>
          </div>
        </div>

        {/* Automated Benchmark Trigger Row */}
        <div style={{
          marginTop: '16px',
          paddingTop: '16px',
          borderTop: '1px solid var(--border-color)',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          flexWrap: 'wrap',
          gap: '12px'
        }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
            <Zap size={16} color="var(--accent-amber)" />
            <span style={{ fontSize: '13px', fontWeight: 600 }}>Stress Test & Benchmark Automatici:</span>
          </div>
          <div style={{ display: 'flex', gap: '8px' }}>
            <button
              onClick={() => runBenchmarkSuite(100, false)}
              disabled={isRunningBenchmark || progress?.status === 'scanning'}
              style={{
                background: '#334155',
                color: 'white',
                border: '1px solid #475569',
                borderRadius: '6px',
                padding: '6px 12px',
                fontSize: '12px'
              }}
            >
              100 Immagini + Duplicati
            </button>
            <button
              onClick={() => runBenchmarkSuite(1000, true)}
              disabled={isRunningBenchmark || progress?.status === 'scanning'}
              style={{
                background: '#334155',
                color: 'white',
                border: '1px solid #475569',
                borderRadius: '6px',
                padding: '6px 12px',
                fontSize: '12px'
              }}
            >
              1.000 Immagini + Video MP4
            </button>
            <button
              onClick={() => runBenchmarkSuite(5000, false)}
              disabled={isRunningBenchmark || progress?.status === 'scanning'}
              style={{
                background: '#334155',
                color: '#38bdf8',
                border: '1px solid #0284c7',
                borderRadius: '6px',
                padding: '6px 12px',
                fontSize: '12px',
                fontWeight: 600
              }}
            >
              5.000 Immagini (Stress Test)
            </button>
          </div>
        </div>
      </section>

      {/* Progress Telemetry Cards */}
      {progress && (
        <section style={{ marginBottom: '24px' }}>
          {/* Progress bar */}
          <div style={{
            background: 'var(--bg-card)',
            border: '1px solid var(--border-color)',
            borderRadius: '10px',
            padding: '16px',
            marginBottom: '16px'
          }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '8px', fontSize: '13px' }}>
              <span>
                <strong>Stato: </strong>
                <span style={{
                  color: progress.status === 'completed' ? 'var(--accent-green)' :
                         progress.status === 'scanning' ? 'var(--primary)' : 'var(--accent-amber)',
                  textTransform: 'uppercase',
                  fontWeight: 'bold'
                }}>
                  {progress.status}
                </span>
                {progress.currentFile && (
                  <span style={{ color: 'var(--text-muted)', marginLeft: '12px' }}>
                    File corrente: {progress.currentFile}
                  </span>
                )}
              </span>
              <span>
                {progress.processed} di {progress.totalDiscovered} file
                {progress.totalDiscovered > 0 && ` (${Math.round((progress.processed / progress.totalDiscovered) * 100)}%)`}
              </span>
            </div>

            <div style={{
              height: '8px',
              background: '#0f172a',
              borderRadius: '4px',
              overflow: 'hidden'
            }}>
              <div style={{
                height: '100%',
                width: `${progress.totalDiscovered > 0 ? (progress.processed / progress.totalDiscovered) * 100 : 0}%`,
                background: progress.status === 'completed' ? 'var(--accent-green)' : 'var(--primary)',
                transition: 'width 0.2s ease-out'
              }} />
            </div>
          </div>

          {/* Metric KPI cards */}
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))', gap: '16px' }}>
            <div style={{ background: 'var(--bg-card)', border: '1px solid var(--border-color)', borderRadius: '10px', padding: '16px' }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: '8px', color: 'var(--text-muted)', fontSize: '12px' }}>
                <CheckCircle2 size={16} color="var(--accent-green)" />
                File Elaborati
              </div>
              <div style={{ fontSize: '24px', fontWeight: 'bold', marginTop: '6px' }}>
                {progress.processed} <span style={{ fontSize: '14px', color: 'var(--text-muted)' }}>/ {progress.totalDiscovered}</span>
              </div>
            </div>

            <div style={{ background: 'var(--bg-card)', border: '1px solid var(--border-color)', borderRadius: '10px', padding: '16px' }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: '8px', color: 'var(--text-muted)', fontSize: '12px' }}>
                <Copy size={16} color="var(--accent-amber)" />
                Duplicati Esatti Riconosciuti
              </div>
              <div style={{ fontSize: '24px', fontWeight: 'bold', marginTop: '6px', color: 'var(--accent-amber)' }}>
                {progress.duplicatesFound}
              </div>
            </div>

            <div style={{ background: 'var(--bg-card)', border: '1px solid var(--border-color)', borderRadius: '10px', padding: '16px' }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: '8px', color: 'var(--text-muted)', fontSize: '12px' }}>
                <Zap size={16} color="var(--primary)" />
                Velocità Throughput
              </div>
              <div style={{ fontSize: '24px', fontWeight: 'bold', marginTop: '6px' }}>
                {progress.filesPerSecond} <span style={{ fontSize: '13px', color: 'var(--text-muted)' }}>file/s</span>
                <span style={{ fontSize: '13px', color: 'var(--text-muted)', marginLeft: '8px' }}>({progress.mbPerSecond} MB/s)</span>
              </div>
            </div>

            <div style={{ background: 'var(--bg-card)', border: '1px solid var(--border-color)', borderRadius: '10px', padding: '16px' }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: '8px', color: 'var(--text-muted)', fontSize: '12px' }}>
                <Clock size={16} color="var(--primary)" />
                Tempo Trascorso
              </div>
              <div style={{ fontSize: '24px', fontWeight: 'bold', marginTop: '6px' }}>
                {progress.elapsedSeconds}s
              </div>
            </div>

            {progress.heapUsedMb && (
              <div style={{ background: 'var(--bg-card)', border: '1px solid var(--border-color)', borderRadius: '10px', padding: '16px' }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: '8px', color: 'var(--text-muted)', fontSize: '12px' }}>
                  <Cpu size={16} color="var(--primary)" />
                  Memoria RAM Heap
                </div>
                <div style={{ fontSize: '24px', fontWeight: 'bold', marginTop: '6px' }}>
                  {progress.heapUsedMb} <span style={{ fontSize: '13px', color: 'var(--text-muted)' }}>MB</span>
                </div>
              </div>
            )}

            {progress.failed > 0 && (
              <div style={{ background: 'var(--bg-card)', border: '1px solid var(--accent-rose)', borderRadius: '10px', padding: '16px' }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: '8px', color: 'var(--accent-rose)', fontSize: '12px' }}>
                  <AlertTriangle size={16} />
                  Errori File
                </div>
                <div style={{ fontSize: '24px', fontWeight: 'bold', marginTop: '6px', color: 'var(--accent-rose)' }}>
                  {progress.failed}
                </div>
              </div>
            )}
          </div>
        </section>
      )}

      {/* Tabs for Navigation */}
      <div style={{
        display: 'flex',
        gap: '8px',
        borderBottom: '1px solid var(--border-color)',
        marginBottom: '20px'
      }}>
        <button
          onClick={() => setActiveTab('gallery')}
          style={{
            padding: '10px 16px',
            border: 'none',
            background: 'transparent',
            color: activeTab === 'gallery' ? 'var(--primary)' : 'var(--text-muted)',
            borderBottom: activeTab === 'gallery' ? '2px solid var(--primary)' : '2px solid transparent',
            fontWeight: 600,
            fontSize: '14px',
            display: 'flex',
            alignItems: 'center',
            gap: '8px'
          }}
        >
          <Layers size={16} />
          File Scansionati ({scannedFiles.length})
        </button>

        <button
          onClick={() => setActiveTab('duplicates')}
          style={{
            padding: '10px 16px',
            border: 'none',
            background: 'transparent',
            color: activeTab === 'duplicates' ? 'var(--accent-amber)' : 'var(--text-muted)',
            borderBottom: activeTab === 'duplicates' ? '2px solid var(--accent-amber)' : '2px solid transparent',
            fontWeight: 600,
            fontSize: '14px',
            display: 'flex',
            alignItems: 'center',
            gap: '8px'
          }}
        >
          <Copy size={16} />
          Duplicati Esatti ({duplicates.length})
        </button>

        <button
          onClick={() => setActiveTab('benchmarks')}
          style={{
            padding: '10px 16px',
            border: 'none',
            background: 'transparent',
            color: activeTab === 'benchmarks' ? 'var(--primary)' : 'var(--text-muted)',
            borderBottom: activeTab === 'benchmarks' ? '2px solid var(--primary)' : '2px solid transparent',
            fontWeight: 600,
            fontSize: '14px',
            display: 'flex',
            alignItems: 'center',
            gap: '8px'
          }}
        >
          <Zap size={16} />
          Risultati Benchmark ({benchmarks.length})
        </button>

        {scanErrors.length > 0 && (
          <button
            onClick={() => setActiveTab('errors')}
            style={{
              padding: '10px 16px',
              border: 'none',
              background: 'transparent',
              color: activeTab === 'errors' ? 'var(--accent-rose)' : 'var(--text-muted)',
              borderBottom: activeTab === 'errors' ? '2px solid var(--accent-rose)' : '2px solid transparent',
              fontWeight: 600,
              fontSize: '14px',
              display: 'flex',
              alignItems: 'center',
              gap: '8px'
            }}
          >
            <AlertTriangle size={16} />
            Errori ({scanErrors.length})
          </button>
        )}
      </div>

      {/* Tab: Gallery View */}
      {activeTab === 'gallery' && (
        <div>
          {scannedFiles.length === 0 ? (
            <div style={{
              textAlign: 'center',
              padding: '60px 20px',
              background: 'var(--bg-card)',
              borderRadius: '12px',
              border: '1px dashed var(--border-color)'
            }}>
              <FolderOpen size={48} color="var(--text-muted)" style={{ margin: '0 auto 16px' }} />
              <h3 style={{ fontSize: '18px', fontWeight: 600 }}>Nessuna scansione in corso</h3>
              <p style={{ color: 'var(--text-muted)', fontSize: '14px', marginTop: '6px' }}>
                Seleziona una cartella locale o esegui uno stress test per verificare la scansione in tempo reale.
              </p>
            </div>
          ) : (
            <div style={{
              display: 'grid',
              gridTemplateColumns: 'repeat(auto-fill, minmax(280px, 1fr))',
              gap: '16px'
            }}>
              {scannedFiles.map((file) => (
                <div
                  key={file.id}
                  style={{
                    background: 'var(--bg-card)',
                    border: file.isDuplicateOf ? '1px solid var(--accent-amber)' : '1px solid var(--border-color)',
                    borderRadius: '8px',
                    overflow: 'hidden',
                    display: 'flex',
                    flexDirection: 'column'
                  }}
                >
                  {/* Thumbnail */}
                  <div style={{
                    height: '160px',
                    background: '#090d16',
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    position: 'relative'
                  }}>
                    {file.thumbnailDataUrl ? (
                      <img
                        src={file.thumbnailDataUrl}
                        alt={file.name}
                        style={{ maxHeight: '100%', maxWidth: '100%', objectFit: 'contain' }}
                      />
                    ) : (
                      <div style={{ color: 'var(--text-muted)', fontSize: '12px', display: 'flex', flexDirection: 'column', alignItems: 'center', gap: '6px' }}>
                        <FileText size={28} />
                        <span>{file.extension.toUpperCase()}</span>
                      </div>
                    )}

                    {file.isDuplicateOf && (
                      <span style={{
                        position: 'absolute',
                        top: '8px',
                        right: '8px',
                        background: '#f59e0b',
                        color: 'black',
                        fontSize: '10px',
                        fontWeight: 'bold',
                        padding: '2px 6px',
                        borderRadius: '4px'
                      }}>
                        DUPLICATO ESATTO
                      </span>
                    )}

                    <span style={{
                      position: 'absolute',
                      bottom: '8px',
                      left: '8px',
                      background: 'rgba(0,0,0,0.7)',
                      color: 'white',
                      fontSize: '10px',
                      padding: '2px 6px',
                      borderRadius: '4px'
                    }}>
                      {file.mediaType.toUpperCase()} {file.width && file.height ? `• ${file.width}x${file.height}` : ''}
                    </span>
                  </div>

                  {/* Metadata info */}
                  <div style={{ padding: '12px', fontSize: '12px', display: 'flex', flexDirection: 'column', gap: '4px' }}>
                    <div style={{ fontWeight: 600, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }} title={file.name}>
                      {file.name}
                    </div>
                    <div style={{ color: 'var(--text-muted)', fontSize: '11px', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }} title={file.relativePath}>
                      📁 {file.relativePath}
                    </div>

                    <div style={{ display: 'flex', justifyContent: 'space-between', color: 'var(--text-muted)', marginTop: '4px' }}>
                      <span>{(file.size / 1024).toFixed(1)} KB</span>
                      <span title={file.sha256} style={{ fontFamily: 'monospace', fontSize: '10px' }}>
                        SHA: {file.sha256.slice(0, 10)}...
                      </span>
                    </div>

                    {file.capturedAt && (
                      <div style={{ color: 'var(--text-muted)', fontSize: '11px', marginTop: '2px' }}>
                        📅 Scatto: {new Date(file.capturedAt).toLocaleDateString()}
                      </div>
                    )}

                    {file.isDuplicateOf && (
                      <div style={{
                        background: 'rgba(245, 158, 11, 0.1)',
                        color: 'var(--accent-amber)',
                        padding: '4px 6px',
                        borderRadius: '4px',
                        fontSize: '10px',
                        marginTop: '4px'
                      }}>
                        Identico a: {file.isDuplicateOf}
                      </div>
                    )}
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      )}

      {/* Tab: Duplicates View */}
      {activeTab === 'duplicates' && (
        <div>
          {duplicates.length === 0 ? (
            <div style={{
              textAlign: 'center',
              padding: '40px',
              background: 'var(--bg-card)',
              borderRadius: '12px'
            }}>
              <CheckCircle2 size={36} color="var(--accent-green)" style={{ margin: '0 auto 12px' }} />
              <h3>Nessun duplicato esatto individuato nei file scansionati</h3>
            </div>
          ) : (
            <div style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
              {duplicates.map((file) => (
                <div
                  key={file.id}
                  style={{
                    background: 'var(--bg-card)',
                    border: '1px solid var(--accent-amber)',
                    borderRadius: '8px',
                    padding: '16px',
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'space-between',
                    gap: '16px'
                  }}
                >
                  <div style={{ display: 'flex', alignItems: 'center', gap: '16px' }}>
                    {file.thumbnailDataUrl ? (
                      <img
                        src={file.thumbnailDataUrl}
                        alt={file.name}
                        style={{ width: '64px', height: '64px', objectFit: 'cover', borderRadius: '6px' }}
                      />
                    ) : (
                      <div style={{ width: '64px', height: '64px', background: '#334155', borderRadius: '6px', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                        <FileText size={24} />
                      </div>
                    )}
                    <div>
                      <div style={{ fontWeight: 600, fontSize: '15px' }}>{file.name}</div>
                      <div style={{ color: 'var(--text-muted)', fontSize: '12px' }}>
                        Percorso copia: <code>{file.relativePath}</code>
                      </div>
                      <div style={{ color: 'var(--accent-amber)', fontSize: '12px', marginTop: '4px' }}>
                        Binariamente identico a: <code>{file.isDuplicateOf}</code>
                      </div>
                    </div>
                  </div>

                  <div style={{ textAlign: 'right', fontSize: '12px', color: 'var(--text-muted)' }}>
                    <div>Dimensione: {(file.size / 1024).toFixed(1)} KB</div>
                    <div style={{ fontFamily: 'monospace', fontSize: '11px', marginTop: '4px' }}>
                      SHA-256: {file.sha256.slice(0, 16)}...
                    </div>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      )}

      {/* Tab: Benchmarks */}
      {activeTab === 'benchmarks' && (
        <div>
          <div style={{
            background: 'var(--bg-card)',
            border: '1px solid var(--border-color)',
            borderRadius: '12px',
            padding: '20px',
            marginBottom: '20px'
          }}>
            <h3 style={{ fontSize: '16px', fontWeight: 600, marginBottom: '8px', display: 'flex', alignItems: 'center', gap: '8px' }}>
              <Sparkles size={18} color="var(--primary)" />
              Benchmark & Test di Stress Automatizzati
            </h3>
            <p style={{ color: 'var(--text-muted)', fontSize: '13px' }}>
              Questa suite genera dataset sintetici realistici (immagini binarie JPEG con dimensioni variabili, file video simulati e duplicati identici incrociati)
              per misurare e verificare le prestazioni dell'hashing a streaming e la stabilità della memoria RAM.
            </p>
          </div>

          {benchmarks.length === 0 ? (
            <div style={{ textAlign: 'center', padding: '40px', color: 'var(--text-muted)' }}>
              Nessun benchmark ancora eseguito. Clicca su uno dei bottoni in alto per avviare il test da 100, 1.000 o 5.000 file.
            </div>
          ) : (
            <div style={{ overflowX: 'auto' }}>
              <table style={{
                width: '100%',
                borderCollapse: 'collapse',
                background: 'var(--bg-card)',
                borderRadius: '8px',
                overflow: 'hidden'
              }}>
                <thead>
                  <tr style={{ background: '#1e293b', textAlign: 'left', fontSize: '12px', color: 'var(--text-muted)', borderBottom: '1px solid var(--border-color)' }}>
                    <th style={{ padding: '12px' }}>Browser</th>
                    <th style={{ padding: '12px' }}>File Totali</th>
                    <th style={{ padding: '12px' }}>Dimensione</th>
                    <th style={{ padding: '12px' }}>Tempo</th>
                    <th style={{ padding: '12px' }}>Throughput File</th>
                    <th style={{ padding: '12px' }}>Throughput Dati</th>
                    <th style={{ padding: '12px' }}>Duplicati Rilevati</th>
                    <th style={{ padding: '12px' }}>RAM Heap</th>
                    <th style={{ padding: '12px' }}>Successo</th>
                  </tr>
                </thead>
                <tbody>
                  {benchmarks.map((b, idx) => (
                    <tr key={idx} style={{ borderBottom: '1px solid var(--border-color)', fontSize: '13px' }}>
                      <td style={{ padding: '12px', fontWeight: 600 }}>{b.browserName}</td>
                      <td style={{ padding: '12px' }}>{b.fileCount.toLocaleString()}</td>
                      <td style={{ padding: '12px' }}>{b.totalSizeMb} MB</td>
                      <td style={{ padding: '12px' }}>{b.elapsedSeconds}s</td>
                      <td style={{ padding: '12px', color: 'var(--primary)', fontWeight: 600 }}>{b.filesPerSecond} file/s</td>
                      <td style={{ padding: '12px' }}>{b.mbPerSecond} MB/s</td>
                      <td style={{ padding: '12px', color: 'var(--accent-amber)', fontWeight: 600 }}>{b.duplicatesCount}</td>
                      <td style={{ padding: '12px' }}>
                        {b.heapUsedStartMb ? `${b.heapUsedStartMb}MB → ${b.heapUsedEndMb}MB` : 'N/A (Safari/FF)'}
                      </td>
                      <td style={{ padding: '12px', color: 'var(--accent-green)', fontWeight: 600 }}>
                        {b.successRatePercent}%
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>
      )}

      {/* Tab: Errors */}
      {activeTab === 'errors' && (
        <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
          {scanErrors.map((err, i) => (
            <div
              key={i}
              style={{
                background: 'rgba(244, 63, 94, 0.1)',
                border: '1px solid var(--accent-rose)',
                borderRadius: '8px',
                padding: '12px',
                fontSize: '13px',
                display: 'flex',
                alignItems: 'center',
                gap: '12px'
              }}
            >
              <AlertTriangle size={20} color="var(--accent-rose)" />
              <div>
                <div style={{ fontWeight: 600 }}>{err.filename} (Fase: {err.phase})</div>
                <div style={{ color: 'var(--text-muted)', fontSize: '11px' }}>{err.path}</div>
                <div style={{ color: 'var(--accent-rose)', marginTop: '2px' }}>{err.error}</div>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
};
