import React, { useEffect, useState } from 'react';
import { detectBrowserCapabilities, BrowserCapabilities } from '../scanner/directoryTraverser';
import { useToast } from '../../context/ToastContext';
import {
  Cpu,
  Server,
  HardDrive,
  CheckCircle2,
  RefreshCw,
  Download,
  MapPin,
  Wrench,
  Database,
  Sparkles,
  Bot,
  ShieldAlert,
  ExternalLink,
  Copy,
  Check,
  Eye,
  EyeOff,
  Brain,
  User,
  Layers
} from 'lucide-react';
import { ApiClient, AISettingsData, AIModelItem } from '../../services/api';

interface SettingsViewProps {
  currentUser: any;
}

type SettingsTab = 'all' | 'profile' | 'ai' | 'storage' | 'maintenance' | 'system';

const GEMINI_KNOWN_MODELS: AIModelItem[] = [
  { id: 'auto', display_name: 'Automatico (Scelta ottimale con fallback intelligente)' },
  { id: 'gemini-1.5-flash', display_name: 'gemini-1.5-flash (Alta disponibilità, consigliato)' },
  { id: 'gemini-2.0-flash', display_name: 'gemini-2.0-flash' },
  { id: 'gemini-3.8-flash', display_name: 'gemini-3.8-flash' },
  { id: 'gemini-1.5-pro', display_name: 'gemini-1.5-pro' },
  { id: 'gemini-2.0-flash-lite', display_name: 'gemini-2.0-flash-lite' },
];

const OLLAMA_KNOWN_MODELS: AIModelItem[] = [
  { id: 'auto', display_name: 'Automatico (Primo modello locale disponibile)' },
  { id: 'llama3.2', display_name: 'llama3.2 (Leggero, default)' },
  { id: 'llama3.1', display_name: 'llama3.1' },
  { id: 'mistral', display_name: 'mistral' },
  { id: 'qwen2.5', display_name: 'qwen2.5' },
  { id: 'llava', display_name: 'llava (Multimodale/Vision)' },
  { id: 'qwen2.5-vl', display_name: 'qwen2.5-vl (Vision)' },
];

export const SettingsView: React.FC<SettingsViewProps> = ({ currentUser }) => {
  const { toast } = useToast();
  const [activeTab, setActiveTab] = useState<SettingsTab>('all');
  const [capabilities, setCapabilities] = useState<BrowserCapabilities | null>(null);
  const [backendHealth, setBackendHealth] = useState<any | null>(null);
  const [storageStats, setStorageStats] = useState<any | null>(null);
  const [compacting, setCompacting] = useState(false);
  const [compactResult, setCompactResult] = useState<string | null>(null);
  const [downloadingBackup, setDownloadingBackup] = useState(false);
  const [runningBackfill, setRunningBackfill] = useState(false);
  const [cleaningScans, setCleaningScans] = useState(false);

  // AI Assistant State
  const [aiSettings, setAiSettings] = useState<AISettingsData | null>(null);
  const [apiKeyInput, setApiKeyInput] = useState('');
  const [showApiKey, setShowApiKey] = useState(false);
  const [ollamaUrlInput, setOllamaUrlInput] = useState('http://localhost:11434');
  const [availableModels, setAvailableModels] = useState<AIModelItem[]>([]);
  const [loadingModels, setLoadingModels] = useState(false);
  const [testingAI, setTestingAI] = useState(false);
  const [savingAISettings, setSavingAISettings] = useState(false);
  const [copiedId, setCopiedId] = useState(false);
  const [customModelText, setCustomModelText] = useState(false);
  const [customModelVision, setCustomModelVision] = useState(false);

  const loadAISettings = async () => {
    try {
      const data = await ApiClient.getAISettings();
      setAiSettings(data);
      if (data.ollama_base_url) {
        setOllamaUrlInput(data.ollama_base_url);
      }
    } catch (err) {
      console.warn('Could not load AI settings:', err);
    }
  };

  const loadStorageStats = async () => {
    try {
      const stats = await ApiClient.getStorageSettings();
      setStorageStats(stats);
    } catch (err) {
      console.warn('Could not load storage stats:', err);
    }
  };

  useEffect(() => {
    setCapabilities(detectBrowserCapabilities());
    fetch('/api/v1/health')
      .then((res) => res.json())
      .then(setBackendHealth)
      .catch(() => setBackendHealth({ status: 'offline' }));
    loadStorageStats();
    loadAISettings();
  }, []);

  const handleCopyUserId = () => {
    if (currentUser?.id) {
      navigator.clipboard.writeText(currentUser.id);
      setCopiedId(true);
      toast.info('User ID copiato negli appunti');
      setTimeout(() => setCopiedId(false), 2000);
    }
  };

  const handleLoadAIModels = async () => {
    try {
      setLoadingModels(true);
      const models = await ApiClient.getAIModels({
        provider_name: aiSettings?.provider,
        api_key: apiKeyInput.trim() || undefined,
        ollama_base_url: ollamaUrlInput || undefined
      });
      setAvailableModels(models);
      if (models.length > 0) {
        toast.success(`Caricati ${models.length} modelli disponibili.`);
      } else {
        toast.info('Nessun modello trovato per il provider attuale.');
      }
    } catch (err) {
      toast.error(`Errore caricamento modelli: ${(err as Error).message}`);
    } finally {
      setLoadingModels(false);
    }
  };

  const handleTestAI = async () => {
    try {
      setTestingAI(true);
      toast.info('Test connessione AI in corso...');
      const fallbackDefault = 'auto';
      const targetModel = aiSettings?.model_text || fallbackDefault;
      const res = await ApiClient.testAI({
        provider: aiSettings?.provider,
        api_key: apiKeyInput.trim() || undefined,
        model: targetModel,
        ollama_base_url: ollamaUrlInput || undefined
      });
      if (res.ok) {
        toast.success(`Connessione AI riuscita (${res.provider} / ${res.model}) in ${res.latency_ms} ms!`);
        if (availableModels.length === 0) {
          handleLoadAIModels();
        }
      } else {
        toast.error(`Test AI fallito: ${res.error || 'Errore sconosciuto'}`);
      }
    } catch (err) {
      toast.error(`Errore durante il test AI: ${(err as Error).message}`);
    } finally {
      setTestingAI(false);
    }
  };

  const handleSaveAISettings = async () => {
    if (!aiSettings) return;
    try {
      setSavingAISettings(true);
      const fallbackDefault = 'auto';
      const payload: any = {
        provider: aiSettings.provider,
        model_text: aiSettings.model_text || fallbackDefault,
        model_vision: aiSettings.model_vision || null,
        ollama_base_url: ollamaUrlInput,
        allow_cloud_images: aiSettings.allow_cloud_images,
        daily_request_cap: aiSettings.daily_request_cap
      };
      if (apiKeyInput.trim()) {
        payload.api_key = apiKeyInput.trim();
      }
      const updated = await ApiClient.updateAISettings(payload);
      setAiSettings(updated);
      setApiKeyInput('');
      toast.success('Impostazioni AI salvate con successo!');
    } catch (err) {
      toast.error(`Errore salvataggio impostazioni AI: ${(err as Error).message}`);
    } finally {
      setSavingAISettings(false);
    }
  };

  const handleRemoveApiKey = async () => {
    try {
      setSavingAISettings(true);
      const updated = await ApiClient.updateAISettings({ api_key: '' });
      setAiSettings(updated);
      setApiKeyInput('');
      toast.success('Chiave API rimossa con successo dal database.');
    } catch (err) {
      toast.error(`Errore rimozione chiave API: ${(err as Error).message}`);
    } finally {
      setSavingAISettings(false);
    }
  };

  const handleProfileChange = async (newProfile: string) => {
    try {
      await ApiClient.updateStorageProfile(newProfile);
      setStorageStats((prev: any) => prev ? { ...prev, thumbnail_profile: newProfile } : null);
      toast.success(`Profilo di storage aggiornato a ${newProfile}!`);
    } catch (err) {
      toast.error(`Errore aggiornamento profilo: ${(err as Error).message}`);
    }
  };

  const handleCompact = async () => {
    setCompacting(true);
    setCompactResult(null);
    try {
      const res = await ApiClient.compactStorage();
      const savedMb = (res.saved_bytes / (1024 * 1024)).toFixed(2);
      const msg = `Ricompatte con successo ${res.compacted_count} miniature! Risparmio: ${savedMb} MB.`;
      setCompactResult(msg);
      toast.success(msg);
      await loadStorageStats();
    } catch (err) {
      const errMsg = `Errore compattazione: ${(err as Error).message}`;
      setCompactResult(errMsg);
      toast.error(errMsg);
    } finally {
      setCompacting(false);
    }
  };

  const handleDownloadBackup = async () => {
    try {
      setDownloadingBackup(true);
      toast.info('Generazione backup consistente del database in corso...');
      await ApiClient.downloadDatabaseBackup();
      toast.success('Backup scaricato con successo!');
    } catch (err) {
      toast.error(`Errore durante il download del backup: ${(err as Error).message}`);
    } finally {
      setDownloadingBackup(false);
    }
  };

  const handleBackfillGps = async () => {
    try {
      setRunningBackfill(true);
      toast.info('Risoluzione inversa coordinate GPS offline in corso...');
      const res = await ApiClient.runGeotagBackfill();
      toast.success(`Aggiornate le località per ${res.updated_count} media!`);
    } catch (err) {
      toast.error(`Errore backfill GPS: ${(err as Error).message}`);
    } finally {
      setRunningBackfill(false);
    }
  };

  const handleCleanupStaleScans = async () => {
    try {
      setCleaningScans(true);
      const res = await ApiClient.cleanupStaleScans();
      if (res.recovered_count > 0) {
        toast.success(`Ripristinati ${res.recovered_count} processi di scansione interrotti!`);
      } else {
        toast.info('Nessuna scansione bloccata da ripristinare.');
      }
    } catch (err) {
      toast.error(`Errore ripristino scansioni: ${(err as Error).message}`);
    } finally {
      setCleaningScans(false);
    }
  };

  const getInitials = (name?: string) => {
    if (!name) return 'U';
    const parts = name.trim().split(/\s+/);
    if (parts.length >= 2) {
      return (parts[0][0] + parts[parts.length - 1][0]).toUpperCase();
    }
    return name.slice(0, 2).toUpperCase();
  };

  // Reusable Pill Style for card header status badges
  const getHeaderPillStyle = (colorType: 'blue' | 'green' | 'purple' | 'amber' | 'slate' | 'rose') => {
    const colorMap = {
      blue: { bg: 'rgba(56, 189, 248, 0.12)', border: 'rgba(56, 189, 248, 0.3)', text: '#38bdf8' },
      green: { bg: 'rgba(34, 197, 94, 0.12)', border: 'rgba(34, 197, 94, 0.3)', text: '#22c55e' },
      purple: { bg: 'rgba(168, 85, 247, 0.12)', border: 'rgba(168, 85, 247, 0.3)', text: '#c084fc' },
      amber: { bg: 'rgba(245, 158, 11, 0.12)', border: 'rgba(245, 158, 11, 0.3)', text: '#fbbf24' },
      slate: { bg: 'rgba(148, 163, 184, 0.12)', border: 'rgba(148, 163, 184, 0.3)', text: '#94a3b8' },
      rose: { bg: 'rgba(244, 63, 94, 0.12)', border: 'rgba(244, 63, 94, 0.3)', text: '#f43f5e' }
    };
    const c = colorMap[colorType];
    return {
      display: 'inline-flex',
      alignItems: 'center',
      gap: '6px',
      fontSize: '11px',
      fontWeight: 600,
      padding: '4px 12px',
      borderRadius: '20px',
      background: c.bg,
      border: `1px solid ${c.border}`,
      color: c.text,
      letterSpacing: '0.3px',
      whiteSpace: 'nowrap' as const,
      flexShrink: 0
    };
  };

  const navTabs: { id: SettingsTab; label: string; icon: React.ReactNode; badge?: string }[] = [
    { id: 'all', label: 'Tutte le Impostazioni', icon: <Layers size={14} /> },
    { id: 'profile', label: 'Profilo Utente', icon: <User size={14} /> },
    {
      id: 'ai',
      label: 'Assistente AI',
      icon: <Sparkles size={14} />,
      badge: aiSettings ? aiSettings.provider.toUpperCase() : undefined
    },
    { id: 'storage', label: 'Miniature & Storage', icon: <HardDrive size={14} /> },
    { id: 'maintenance', label: 'Backup & Database', icon: <Database size={14} /> },
    { id: 'system', label: 'Sistema & Hardware', icon: <Server size={14} /> }
  ];

  const shouldShow = (tab: SettingsTab) => activeTab === 'all' || activeTab === tab;

  return (
    <div style={{
      maxWidth: '1040px',
      margin: '0 auto',
      width: '100%',
      display: 'flex',
      flexDirection: 'column',
      gap: '24px'
    }}>
      {/* Top Banner / Section Header */}
      <div style={{
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'space-between',
        flexWrap: 'wrap',
        gap: '12px',
        borderBottom: '1px solid #1e293b',
        paddingBottom: '16px'
      }}>
        <div>
          <h2 style={{ fontSize: '22px', fontWeight: 700, color: '#f8fafc', margin: 0 }}>
            Centro Impostazioni & Controllo Sistema
          </h2>
          <p style={{ color: '#94a3b8', fontSize: '13px', marginTop: '4px', margin: 0 }}>
            Gestisci preferenze di storage, intelligenza artificiale, consistenza dati SQLite e risorse hardware locali.
          </p>
        </div>
        <div>
          <span style={getHeaderPillStyle(backendHealth?.status === 'healthy' ? 'green' : 'rose')}>
            <span style={{
              width: '7px',
              height: '7px',
              borderRadius: '50%',
              backgroundColor: backendHealth?.status === 'healthy' ? '#22c55e' : '#f43f5e',
              boxShadow: backendHealth?.status === 'healthy' ? '0 0 8px #22c55e' : '0 0 8px #f43f5e'
            }} />
            Backend {backendHealth?.status === 'healthy' ? 'Attivo' : 'Offline'}
          </span>
        </div>
      </div>

      {/* Horizontal Category Navigation Tabs / Pills */}
      <div style={{
        display: 'flex',
        alignItems: 'center',
        gap: '8px',
        overflowX: 'auto',
        paddingBottom: '4px'
      }}>
        {navTabs.map((tab) => {
          const isActive = activeTab === tab.id;
          return (
            <button
              key={tab.id}
              type="button"
              onClick={() => setActiveTab(tab.id)}
              style={{
                display: 'inline-flex',
                alignItems: 'center',
                gap: '7px',
                padding: '8px 14px',
                borderRadius: '20px',
                fontSize: '12px',
                fontWeight: 600,
                cursor: 'pointer',
                transition: 'all 0.15s ease',
                whiteSpace: 'nowrap',
                background: isActive ? '#0284c7' : '#1e293b',
                color: isActive ? '#ffffff' : '#94a3b8',
                border: isActive ? '1px solid #38bdf8' : '1px solid #334155',
                boxShadow: isActive ? '0 2px 10px rgba(2, 132, 199, 0.35)' : 'none'
              }}
            >
              {tab.icon}
              {tab.label}
              {tab.badge && (
                <span style={{
                  fontSize: '10px',
                  padding: '1px 6px',
                  borderRadius: '10px',
                  background: isActive ? 'rgba(255, 255, 255, 0.25)' : 'rgba(168, 85, 247, 0.2)',
                  color: isActive ? '#ffffff' : '#c084fc',
                  fontWeight: 700
                }}>
                  {tab.badge}
                </span>
              )}
            </button>
          );
        })}
      </div>

      {/* Unified Single Column Flow:
          100% full-width cards in vertical sequence.
          Every card has identical margins, left/right edges, and perfectly aligned pill badges! */}
      <div style={{ display: 'flex', flexDirection: 'column', gap: '24px' }}>

        {/* ================= 1. PROFILO UTENTE ================= */}
        {shouldShow('profile') && (
          <div style={{
            background: 'linear-gradient(145deg, #1e293b 0%, #151e2e 100%)',
            border: '1px solid #334155',
            borderRadius: '16px',
            padding: '24px',
            boxShadow: '0 4px 20px -2px rgba(0,0,0,0.25)',
            display: 'flex',
            flexDirection: 'column',
            gap: '16px'
          }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: '14px' }}>
                <div style={{
                  width: '50px',
                  height: '50px',
                  borderRadius: '14px',
                  background: 'linear-gradient(135deg, #0284c7 0%, #38bdf8 100%)',
                  color: '#ffffff',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  fontSize: '18px',
                  fontWeight: 700,
                  boxShadow: '0 4px 12px rgba(56, 189, 248, 0.35)',
                  flexShrink: 0
                }}>
                  {getInitials(currentUser?.display_name)}
                </div>
                <div>
                  <h3 style={{ fontSize: '18px', fontWeight: 700, color: '#f8fafc', margin: 0 }}>
                    {currentUser?.display_name || 'Utente Locale'}
                  </h3>
                  <div style={{ color: '#94a3b8', fontSize: '12px', marginTop: '2px' }}>
                    {currentUser?.email || 'Nessuna email configurata'}
                  </div>
                </div>
              </div>
              <span style={getHeaderPillStyle('blue')}>
                Amministratore
              </span>
            </div>

            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(220px, 1fr))', gap: '12px' }}>
              <div style={{ background: '#0f172a', padding: '10px 14px', borderRadius: '8px', border: '1px solid #1e293b' }}>
                <span style={{ color: '#64748b', fontSize: '11px', display: 'block' }}>Ruolo Sistema</span>
                <span style={{ color: '#f8fafc', fontSize: '13px', fontWeight: 600 }}>Owner / Amministratore</span>
              </div>
              <div style={{ background: '#0f172a', padding: '10px 14px', borderRadius: '8px', border: '1px solid #1e293b' }}>
                <span style={{ color: '#64748b', fontSize: '11px', display: 'block' }}>Tipo Sessione</span>
                <span style={{ color: '#22c55e', fontSize: '13px', fontWeight: 600 }}>Locale Protetto</span>
              </div>
              <div style={{
                background: '#0f172a',
                padding: '10px 14px',
                borderRadius: '8px',
                border: '1px solid #1e293b',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'space-between',
                gap: '8px',
                gridColumn: 'span 2'
              }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: '8px', minWidth: 0 }}>
                  <span style={{ color: '#64748b', fontSize: '11px', fontWeight: 600, textTransform: 'uppercase' }}>User ID:</span>
                  <code style={{ color: '#38bdf8', fontSize: '12px' }}>{currentUser?.id || 'non disponibile'}</code>
                </div>
                <button
                  type="button"
                  onClick={handleCopyUserId}
                  style={{
                    background: 'transparent',
                    border: '1px solid #334155',
                    color: copiedId ? '#22c55e' : '#94a3b8',
                    borderRadius: '20px',
                    padding: '4px 12px',
                    fontSize: '11px',
                    cursor: 'pointer',
                    display: 'flex',
                    alignItems: 'center',
                    gap: '5px'
                  }}
                >
                  {copiedId ? <Check size={12} color="#22c55e" /> : <Copy size={12} />}
                  {copiedId ? 'Copiato' : 'Copia'}
                </button>
              </div>
            </div>
          </div>
        )}

        {/* ================= 2. ASSISTENTE AI & SMART CURATION ================= */}
        {shouldShow('ai') && (
          <div style={{
            background: 'linear-gradient(145deg, #1e293b 0%, #171c2f 100%)',
            border: '1px solid #334155',
            borderRadius: '16px',
            padding: '24px',
            boxShadow: '0 4px 20px -2px rgba(0,0,0,0.25)',
            display: 'flex',
            flexDirection: 'column',
            gap: '16px'
          }}>
            {/* Header */}
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: '10px' }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
                <div style={{
                  width: '36px',
                  height: '36px',
                  borderRadius: '10px',
                  background: 'rgba(168, 85, 247, 0.15)',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center'
                }}>
                  <Sparkles size={20} color="#a855f7" />
                </div>
                <div>
                  <h3 style={{ fontSize: '16px', fontWeight: 700, color: '#f8fafc', margin: 0 }}>
                    Assistente AI & Smart Curation
                  </h3>
                  <div style={{ color: '#94a3b8', fontSize: '11px', marginTop: '2px' }}>
                    Curatela intelligente, clustering album semantico e selezione dello scatto migliore (Best Shot)
                  </div>
                </div>
              </div>

              {aiSettings && (
                <span style={getHeaderPillStyle(aiSettings.provider === 'none' ? 'slate' : 'purple')}>
                  Attivo: {aiSettings.provider.toUpperCase()}
                </span>
              )}
            </div>

            {aiSettings && (
              <div style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>
                {/* 3 Provider Cards */}
                <div>
                  <label style={{ display: 'block', color: '#cbd5e1', fontSize: '12px', fontWeight: 600, marginBottom: '8px' }}>
                    Seleziona Motore di Intelligenza Artificiale:
                  </label>
                  <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: '12px' }}>
                    {/* None Card */}
                    <button
                      type="button"
                      onClick={() => setAiSettings({ ...aiSettings, provider: 'none' })}
                      style={{
                        background: aiSettings.provider === 'none' ? 'rgba(56, 189, 248, 0.12)' : '#0f172a',
                        border: aiSettings.provider === 'none' ? '2px solid #38bdf8' : '1px solid #334155',
                        borderRadius: '12px',
                        padding: '12px 14px',
                        textAlign: 'left',
                        cursor: 'pointer',
                        transition: 'all 0.15s ease',
                        minHeight: '82px',
                        display: 'flex',
                        flexDirection: 'column',
                        justifyContent: 'space-between'
                      }}
                    >
                      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                        <Brain size={18} color={aiSettings.provider === 'none' ? '#38bdf8' : '#94a3b8'} />
                        {aiSettings.provider === 'none' ? <CheckCircle2 size={16} color="#38bdf8" /> : <div style={{ width: 16, height: 16 }} />}
                      </div>
                      <div>
                        <div style={{ fontSize: '13px', fontWeight: 700, color: aiSettings.provider === 'none' ? '#38bdf8' : '#f8fafc' }}>
                          Euristica Locale
                        </div>
                        <div style={{ color: '#94a3b8', fontSize: '11px', marginTop: '2px' }}>
                          100% Offline & Gratuito
                        </div>
                      </div>
                    </button>

                    {/* Gemini Card */}
                    <button
                      type="button"
                      onClick={() => setAiSettings({ ...aiSettings, provider: 'gemini' })}
                      style={{
                        background: aiSettings.provider === 'gemini' ? 'rgba(168, 85, 247, 0.12)' : '#0f172a',
                        border: aiSettings.provider === 'gemini' ? '2px solid #a855f7' : '1px solid #334155',
                        borderRadius: '12px',
                        padding: '12px 14px',
                        textAlign: 'left',
                        cursor: 'pointer',
                        transition: 'all 0.15s ease',
                        minHeight: '82px',
                        display: 'flex',
                        flexDirection: 'column',
                        justifyContent: 'space-between'
                      }}
                    >
                      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                        <Sparkles size={18} color={aiSettings.provider === 'gemini' ? '#c084fc' : '#94a3b8'} />
                        {aiSettings.provider === 'gemini' ? <CheckCircle2 size={16} color="#a855f7" /> : <div style={{ width: 16, height: 16 }} />}
                      </div>
                      <div>
                        <div style={{ fontSize: '13px', fontWeight: 700, color: aiSettings.provider === 'gemini' ? '#c084fc' : '#f8fafc' }}>
                          Google Gemini
                        </div>
                        <div style={{ color: '#94a3b8', fontSize: '11px', marginTop: '2px' }}>
                          Cloud Free Tier
                        </div>
                      </div>
                    </button>

                    {/* Ollama Card */}
                    <button
                      type="button"
                      onClick={() => setAiSettings({ ...aiSettings, provider: 'ollama' })}
                      style={{
                        background: aiSettings.provider === 'ollama' ? 'rgba(34, 197, 94, 0.12)' : '#0f172a',
                        border: aiSettings.provider === 'ollama' ? '2px solid #22c55e' : '1px solid #334155',
                        borderRadius: '12px',
                        padding: '12px 14px',
                        textAlign: 'left',
                        cursor: 'pointer',
                        transition: 'all 0.15s ease',
                        minHeight: '82px',
                        display: 'flex',
                        flexDirection: 'column',
                        justifyContent: 'space-between'
                      }}
                    >
                      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                        <Bot size={18} color={aiSettings.provider === 'ollama' ? '#22c55e' : '#94a3b8'} />
                        {aiSettings.provider === 'ollama' ? <CheckCircle2 size={16} color="#22c55e" /> : <div style={{ width: 16, height: 16 }} />}
                      </div>
                      <div>
                        <div style={{ fontSize: '13px', fontWeight: 700, color: aiSettings.provider === 'ollama' ? '#22c55e' : '#f8fafc' }}>
                          Ollama
                        </div>
                        <div style={{ color: '#94a3b8', fontSize: '11px', marginTop: '2px' }}>
                          Server Locale Offline
                        </div>
                      </div>
                    </button>
                  </div>

                  <div style={{ color: '#64748b', fontSize: '11px', marginTop: '6px' }}>
                    L'euristica locale su metadati ed EXIF resta sempre attiva come motore di base e fallback automatico in assenza di rete.
                  </div>
                </div>

                {/* Gemini Form */}
                {aiSettings.provider === 'gemini' && (
                  <div style={{
                    background: '#0f172a',
                    border: '1px solid #334155',
                    borderRadius: '12px',
                    padding: '16px',
                    display: 'flex',
                    flexDirection: 'column',
                    gap: '12px'
                  }}>
                    <div>
                      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '6px' }}>
                        <label style={{ color: '#cbd5e1', fontSize: '12px', fontWeight: 600 }}>
                          Google AI Studio API Key
                        </label>
                        <a
                          href="https://aistudio.google.com/app/apikey"
                          target="_blank"
                          rel="noreferrer"
                          style={{
                            color: '#38bdf8',
                            fontSize: '11px',
                            display: 'flex',
                            alignItems: 'center',
                            gap: '4px',
                            textDecoration: 'none',
                            background: 'rgba(56, 189, 248, 0.1)',
                            padding: '4px 12px',
                            borderRadius: '20px'
                          }}
                        >
                          Ottieni chiave gratuita <ExternalLink size={11} />
                        </a>
                      </div>

                      {aiSettings.api_key_from_env && (
                        <div style={{ display: 'inline-flex', alignItems: 'center', gap: '4px', marginBottom: '8px', background: 'rgba(34, 197, 94, 0.15)', color: '#22c55e', fontSize: '11px', padding: '3px 10px', borderRadius: '20px' }}>
                          <CheckCircle2 size={12} /> Caricata da variabile d'ambiente <code>GEMINI_API_KEY</code>
                        </div>
                      )}

                      {aiSettings.has_api_key && !aiSettings.api_key_from_env && (
                        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '6px', fontSize: '12px', color: '#94a3b8' }}>
                          <span>Chiave salvata: <code style={{ color: '#38bdf8' }}>{aiSettings.api_key_hint}</code></span>
                          <button
                            type="button"
                            onClick={handleRemoveApiKey}
                            style={{ background: 'transparent', color: '#f43f5e', border: 'none', padding: 0, cursor: 'pointer', fontSize: '11px', textDecoration: 'underline' }}
                          >
                            Rimuovi chiave dal DB
                          </button>
                        </div>
                      )}

                      <div style={{ position: 'relative' }}>
                        <input
                          type={showApiKey ? 'text' : 'password'}
                          placeholder={aiSettings.has_api_key ? "Inserisci nuova chiave per sovrascrivere..." : "Incolla qui la tua API Key di Google AI Studio..."}
                          value={apiKeyInput}
                          onChange={(e) => setApiKeyInput(e.target.value)}
                          style={{
                            width: '100%',
                            background: '#1e293b',
                            color: '#f8fafc',
                            border: '1px solid #334155',
                            borderRadius: '8px',
                            padding: '10px 40px 10px 14px',
                            fontSize: '13px',
                            boxSizing: 'border-box'
                          }}
                        />
                        <button
                          type="button"
                          onClick={() => setShowApiKey(!showApiKey)}
                          style={{
                            position: 'absolute',
                            right: '12px',
                            top: '50%',
                            transform: 'translateY(-50%)',
                            background: 'transparent',
                            border: 'none',
                            color: '#94a3b8',
                            cursor: 'pointer',
                            padding: 0,
                            display: 'flex',
                            alignItems: 'center'
                          }}
                        >
                          {showApiKey ? <EyeOff size={16} /> : <Eye size={16} />}
                        </button>
                      </div>
                    </div>

                    <div style={{
                      background: 'rgba(245, 158, 11, 0.08)',
                      border: '1px solid rgba(245, 158, 11, 0.25)',
                      borderRadius: '8px',
                      padding: '10px 14px',
                      fontSize: '12px',
                      color: '#fbbf24',
                      display: 'flex',
                      alignItems: 'flex-start',
                      gap: '10px'
                    }}>
                      <ShieldAlert size={16} style={{ flexShrink: 0, marginTop: '2px' }} />
                      <div style={{ lineHeight: '1.4' }}>
                        <strong>Nota Privacy & Gratuita:</strong> Il piano gratuito Gemini offre un'ampia quota giornaliera a costo zero. Per la massima riservatezza puoi salvare la chiave in <code>GEMINI_API_KEY</code> nell'ambiente oppure usare Ollama interamente sul tuo dispositivo.
                      </div>
                    </div>
                  </div>
                )}

                {/* Ollama Form */}
                {aiSettings.provider === 'ollama' && (
                  <div style={{
                    background: '#0f172a',
                    border: '1px solid #334155',
                    borderRadius: '12px',
                    padding: '16px'
                  }}>
                    <label style={{ display: 'block', color: '#cbd5e1', fontSize: '12px', fontWeight: 600, marginBottom: '6px' }}>
                      Indirizzo Server Ollama Locale
                    </label>
                    <input
                      type="text"
                      placeholder="http://localhost:11434"
                      value={ollamaUrlInput}
                      onChange={(e) => setOllamaUrlInput(e.target.value)}
                      style={{
                        width: '100%',
                        background: '#1e293b',
                        color: '#f8fafc',
                        border: '1px solid #334155',
                        borderRadius: '8px',
                        padding: '10px 14px',
                        fontSize: '13px',
                        boxSizing: 'border-box'
                      }}
                    />
                    <div style={{ color: '#64748b', fontSize: '11px', marginTop: '6px' }}>
                      Ollama elabora le richieste esclusivamente sul tuo hardware. Nessun dato lascia il tuo computer.
                    </div>
                  </div>
                )}

                {/* Models and Quota */}
                {aiSettings.provider !== 'none' && (
                  <div style={{
                    background: '#0f172a',
                    border: '1px solid #334155',
                    borderRadius: '12px',
                    padding: '16px',
                    display: 'flex',
                    flexDirection: 'column',
                    gap: '12px'
                  }}>
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                      <span style={{ fontWeight: 600, fontSize: '13px', color: '#e2e8f0' }}>
                        Configurazione Modelli & Parametri
                      </span>
                      <button
                        type="button"
                        onClick={handleLoadAIModels}
                        disabled={loadingModels}
                        style={{
                          background: '#1e293b',
                          color: '#f8fafc',
                          border: '1px solid #334155',
                          borderRadius: '20px',
                          padding: '4px 12px',
                          fontSize: '11px',
                          cursor: loadingModels ? 'not-allowed' : 'pointer',
                          display: 'flex',
                          alignItems: 'center',
                          gap: '6px'
                        }}
                      >
                        <RefreshCw size={11} className={loadingModels ? 'animate-spin' : ''} />
                        {loadingModels ? 'Caricamento...' : 'Interroga Modelli'}
                      </button>
                    </div>

                    {(() => {
                      const knownPresets = aiSettings.provider === 'gemini' ? GEMINI_KNOWN_MODELS : OLLAMA_KNOWN_MODELS;
                      const mergedModels: AIModelItem[] = [...knownPresets];
                      availableModels.forEach(am => {
                        if (!mergedModels.some(m => m.id === am.id)) {
                          mergedModels.push(am);
                        }
                      });
                      if (aiSettings.model_text && !mergedModels.some(m => m.id === aiSettings.model_text)) {
                        mergedModels.push({ id: aiSettings.model_text, display_name: `${aiSettings.model_text} (Personalizzato)` });
                      }
                      const defaultModelText = 'auto';
                      const currentTextValue = customModelText
                        ? '__custom__'
                        : (aiSettings.model_text || defaultModelText);

                      const currentVisionValue = customModelVision
                        ? '__custom__'
                        : (aiSettings.model_vision || '');

                      return (
                        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(2, 1fr)', gap: '14px' }}>
                          <div>
                            <label style={{ display: 'block', color: '#94a3b8', fontSize: '11px', marginBottom: '6px' }}>
                              Modello Testo (Album & Consulente)
                            </label>
                            <select
                              value={currentTextValue}
                              onChange={(e) => {
                                if (e.target.value === '__custom__') {
                                  setCustomModelText(true);
                                } else {
                                  setCustomModelText(false);
                                  setAiSettings({ ...aiSettings, model_text: e.target.value });
                                }
                              }}
                              style={{ width: '100%', background: '#1e293b', color: '#f8fafc', border: '1px solid #334155', borderRadius: '8px', padding: '8px 12px', fontSize: '12px', cursor: 'pointer' }}
                            >
                              {mergedModels.map(m => (
                                <option key={m.id} value={m.id}>{m.display_name || m.id}</option>
                              ))}
                              <option value="__custom__">Altro (scrivi a mano)...</option>
                            </select>

                            {customModelText && (
                              <input
                                type="text"
                                placeholder="Es. gemini-3.8-flash o modello-custom"
                                value={aiSettings.model_text || ''}
                                onChange={(e) => setAiSettings({ ...aiSettings, model_text: e.target.value })}
                                style={{ width: '100%', background: '#0f172a', color: '#f8fafc', border: '1px solid #a855f7', borderRadius: '8px', padding: '8px 12px', fontSize: '12px', boxSizing: 'border-box', marginTop: '6px' }}
                                autoFocus
                              />
                            )}
                          </div>

                          <div>
                            <label style={{ display: 'block', color: '#94a3b8', fontSize: '11px', marginBottom: '6px' }}>
                              Modello Visione (Best Shot)
                            </label>
                            <select
                              value={currentVisionValue}
                              onChange={(e) => {
                                if (e.target.value === '__custom__') {
                                  setCustomModelVision(true);
                                } else {
                                  setCustomModelVision(false);
                                  setAiSettings({ ...aiSettings, model_vision: e.target.value || null });
                                }
                              }}
                              style={{ width: '100%', background: '#1e293b', color: '#f8fafc', border: '1px solid #334155', borderRadius: '8px', padding: '8px 12px', fontSize: '12px', cursor: 'pointer' }}
                            >
                              <option value="">(Default: usa Modello Testo se multimodale)</option>
                              {mergedModels.map(m => (
                                <option key={m.id} value={m.id}>{m.display_name || m.id}</option>
                              ))}
                              <option value="__custom__">Altro (scrivi a mano)...</option>
                            </select>

                            {customModelVision && (
                              <input
                                type="text"
                                placeholder="Es. llava, qwen2.5-vl"
                                value={aiSettings.model_vision || ''}
                                onChange={(e) => setAiSettings({ ...aiSettings, model_vision: e.target.value })}
                                style={{ width: '100%', background: '#0f172a', color: '#f8fafc', border: '1px solid #a855f7', borderRadius: '8px', padding: '8px 12px', fontSize: '12px', boxSizing: 'border-box', marginTop: '6px' }}
                                autoFocus
                              />
                            )}
                          </div>
                        </div>
                      );
                    })()}

                    {/* Cloud Images Checkbox */}
                    <div style={{ display: 'flex', alignItems: 'center', gap: '8px', paddingTop: '4px' }}>
                      <input
                        type="checkbox"
                        id="allow_cloud_images"
                        checked={aiSettings.allow_cloud_images}
                        onChange={(e) => setAiSettings({ ...aiSettings, allow_cloud_images: e.target.checked })}
                        style={{ cursor: 'pointer' }}
                      />
                      <label htmlFor="allow_cloud_images" style={{ fontSize: '12px', color: '#cbd5e1', cursor: 'pointer' }}>
                        Consenti invio miniature WebP per analisi visiva avanzata (Best Shot)
                      </label>
                    </div>

                    {/* Quota & Daily Cap */}
                    <div style={{ display: 'flex', flexWrap: 'wrap', alignItems: 'center', justifyContent: 'space-between', gap: '8px', borderTop: '1px solid #1e293b', paddingTop: '10px' }}>
                      <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                        <label style={{ color: '#94a3b8', fontSize: '12px' }}>Tetto max richieste/giorno:</label>
                        <input
                          type="number"
                          min={1}
                          max={5000}
                          value={aiSettings.daily_request_cap}
                          onChange={(e) => setAiSettings({ ...aiSettings, daily_request_cap: parseInt(e.target.value) || 100 })}
                          style={{ width: '75px', background: '#1e293b', color: '#f8fafc', border: '1px solid #334155', borderRadius: '6px', padding: '4px 8px', fontSize: '12px' }}
                        />
                      </div>
                      <div style={{ fontSize: '12px', color: '#94a3b8' }}>
                        Oggi: <strong style={{ color: '#38bdf8' }}>{aiSettings.usage_today.requests}</strong> / {aiSettings.daily_request_cap} req ({aiSettings.usage_today.input_tokens + aiSettings.usage_today.output_tokens} token consumati)
                      </div>
                    </div>
                  </div>
                )}

                {/* AI Action Buttons */}
                <div style={{ display: 'flex', gap: '12px', flexWrap: 'wrap' }}>
                  <button
                    type="button"
                    onClick={handleSaveAISettings}
                    disabled={savingAISettings}
                    style={{
                      background: 'linear-gradient(135deg, #a855f7 0%, #7c3aed 100%)',
                      color: '#ffffff',
                      border: 'none',
                      borderRadius: '20px',
                      padding: '10px 22px',
                      fontSize: '13px',
                      fontWeight: 600,
                      cursor: savingAISettings ? 'not-allowed' : 'pointer',
                      display: 'flex',
                      alignItems: 'center',
                      gap: '8px',
                      boxShadow: '0 4px 12px rgba(168, 85, 247, 0.35)'
                    }}
                  >
                    <CheckCircle2 size={16} />
                    {savingAISettings ? 'Salvataggio in corso...' : 'Salva Impostazioni AI'}
                  </button>

                  {aiSettings.provider !== 'none' && (
                    <button
                      type="button"
                      onClick={handleTestAI}
                      disabled={testingAI}
                      style={{
                        background: '#0f172a',
                        color: '#f8fafc',
                        border: '1px solid #334155',
                        borderRadius: '20px',
                        padding: '10px 18px',
                        fontSize: '13px',
                        fontWeight: 600,
                        cursor: testingAI ? 'not-allowed' : 'pointer',
                        display: 'flex',
                        alignItems: 'center',
                        gap: '6px'
                      }}
                    >
                      <Bot size={16} color="#38bdf8" />
                      {testingAI ? 'Test in corso...' : 'Test Connessione AI'}
                    </button>
                  )}
                </div>
              </div>
            )}
          </div>
        )}

        {/* ================= 3. OTTIMIZZAZIONE MINIATURE & STORAGE ================= */}
        {shouldShow('storage') && (
          <div style={{
            background: '#1e293b',
            border: '1px solid #334155',
            borderRadius: '16px',
            padding: '24px',
            boxShadow: '0 4px 20px -2px rgba(0,0,0,0.25)',
            display: 'flex',
            flexDirection: 'column',
            gap: '16px'
          }}>
            {/* Header */}
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: '10px' }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
                <div style={{
                  width: '36px',
                  height: '36px',
                  borderRadius: '10px',
                  background: 'rgba(34, 197, 94, 0.15)',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center'
                }}>
                  <HardDrive size={20} color="#22c55e" />
                </div>
                <div>
                  <h3 style={{ fontSize: '16px', fontWeight: 700, color: '#f8fafc', margin: 0 }}>
                    Ottimizzazione Miniature & Storage
                  </h3>
                  <div style={{ color: '#94a3b8', fontSize: '11px', marginTop: '2px' }}>
                    Compressione intelligente WebP su misura per massime prestazioni
                  </div>
                </div>
              </div>
              <span style={getHeaderPillStyle('green')}>
                WebP Partizionato 320px
              </span>
            </div>

            {/* Storage Metric KPI Cards */}
            {storageStats && (
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: '14px' }}>
                <div style={{
                  background: '#0f172a',
                  padding: '14px 16px',
                  borderRadius: '12px',
                  border: '1px solid #334155',
                  textAlign: 'center'
                }}>
                  <div style={{ color: '#94a3b8', fontSize: '12px', fontWeight: 500 }}>Miniature Totali</div>
                  <div style={{ fontSize: '20px', fontWeight: 700, marginTop: '4px', color: '#f8fafc' }}>
                    {storageStats.thumbnails_count}
                  </div>
                  <div style={{ color: '#64748b', fontSize: '11px', marginTop: '2px' }}>file indicizzati</div>
                </div>
                <div style={{
                  background: '#0f172a',
                  padding: '14px 16px',
                  borderRadius: '12px',
                  border: '1px solid #334155',
                  textAlign: 'center'
                }}>
                  <div style={{ color: '#94a3b8', fontSize: '12px', fontWeight: 500 }}>Spazio Occupato</div>
                  <div style={{ fontSize: '20px', fontWeight: 700, marginTop: '4px', color: '#38bdf8' }}>
                    {(storageStats.total_bytes / (1024 * 1024)).toFixed(1)} MB
                  </div>
                  <div style={{ color: '#64748b', fontSize: '11px', marginTop: '2px' }}>su disco locale</div>
                </div>
                <div style={{
                  background: '#0f172a',
                  padding: '14px 16px',
                  borderRadius: '12px',
                  border: '1px solid #334155',
                  textAlign: 'center'
                }}>
                  <div style={{ color: '#94a3b8', fontSize: '12px', fontWeight: 500 }}>Peso Medio</div>
                  <div style={{ fontSize: '20px', fontWeight: 700, marginTop: '4px', color: '#22c55e' }}>
                    {storageStats.avg_kb} KB
                  </div>
                  <div style={{ color: '#64748b', fontSize: '11px', marginTop: '2px' }}>per singola foto</div>
                </div>
              </div>
            )}

            {/* Profile Selection */}
            <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
              <label style={{ color: '#cbd5e1', fontSize: '12px', fontWeight: 600 }}>
                Profilo di Compressione per le Nuove Scansioni:
              </label>
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: '12px' }}>
                {[
                  { key: 'compact', label: 'Compressione Massima', desc: '240px · Qualità 55 (~6 KB/foto)' },
                  { key: 'balanced', label: 'Bilanciata (Consigliato)', desc: '320px · Qualità 65 (~11 KB/foto)' },
                  { key: 'high', label: 'Alta Risoluzione', desc: '384px · Qualità 75 (~18 KB/foto)' }
                ].map((p) => {
                  const isActive = storageStats?.thumbnail_profile === p.key;
                  return (
                    <button
                      key={p.key}
                      type="button"
                      onClick={() => handleProfileChange(p.key)}
                      style={{
                        background: isActive ? 'rgba(56, 189, 248, 0.12)' : '#0f172a',
                        border: isActive ? '2px solid #38bdf8' : '1px solid #334155',
                        borderRadius: '12px',
                        padding: '12px 14px',
                        textAlign: 'left',
                        cursor: 'pointer',
                        transition: 'all 0.15s ease',
                        minHeight: '74px',
                        display: 'flex',
                        flexDirection: 'column',
                        justifyContent: 'space-between'
                      }}
                    >
                      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                        <span style={{ fontWeight: 600, color: isActive ? '#38bdf8' : '#f8fafc', fontSize: '13px' }}>
                          {p.label}
                        </span>
                        {isActive ? <CheckCircle2 size={16} color="#38bdf8" /> : <div style={{ width: 16, height: 16 }} />}
                      </div>
                      <div style={{ color: '#94a3b8', fontSize: '11px', marginTop: '4px' }}>
                        {p.desc}
                      </div>
                    </button>
                  );
                })}
              </div>
            </div>

            {/* Recompact Existing Thumbnails */}
            <div style={{
              padding: '14px 18px',
              background: '#0f172a',
              borderRadius: '12px',
              border: '1px solid #334155',
              display: 'flex',
              flexDirection: 'column',
              gap: '10px'
            }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: '12px' }}>
                <div style={{ flex: 1, minWidth: '280px' }}>
                  <div style={{ color: '#f8fafc', fontSize: '13px', fontWeight: 600 }}>
                    Allinea miniature esistenti al profilo attivo
                  </div>
                  <div style={{ color: '#94a3b8', fontSize: '12px', marginTop: '2px' }}>
                    Ricodifica tutte le miniature già generate sul server senza mai alterare i file originali.
                  </div>
                </div>
                <button
                  type="button"
                  onClick={handleCompact}
                  disabled={compacting}
                  style={{
                    background: '#0284c7',
                    color: 'white',
                    border: 'none',
                    borderRadius: '20px',
                    padding: '9px 20px',
                    fontSize: '13px',
                    fontWeight: 600,
                    cursor: compacting ? 'not-allowed' : 'pointer',
                    display: 'flex',
                    alignItems: 'center',
                    gap: '8px',
                    boxShadow: '0 2px 8px rgba(2, 132, 199, 0.3)'
                  }}
                >
                  <RefreshCw size={14} className={compacting ? 'animate-spin' : ''} />
                  {compacting ? 'Ricompatto in corso...' : 'Ricompatta Miniature'}
                </button>
              </div>

              {compactResult && (
                <div style={{
                  background: 'rgba(34, 197, 94, 0.1)',
                  border: '1px solid rgba(34, 197, 94, 0.3)',
                  borderRadius: '8px',
                  padding: '8px 14px',
                  color: '#22c55e',
                  fontSize: '12px',
                  display: 'flex',
                  alignItems: 'center',
                  gap: '8px'
                }}>
                  <CheckCircle2 size={16} />
                  {compactResult}
                </div>
              )}
            </div>
          </div>
        )}

        {/* ================= 4. BACKUP & MANUTENZIONE CATALOGO ================= */}
        {shouldShow('maintenance') && (
          <div style={{
            background: '#1e293b',
            border: '1px solid #334155',
            borderRadius: '16px',
            padding: '24px',
            boxShadow: '0 4px 20px -2px rgba(0,0,0,0.25)',
            display: 'flex',
            flexDirection: 'column',
            gap: '16px'
          }}>
            {/* Header */}
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: '10px' }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
                <div style={{
                  width: '36px',
                  height: '36px',
                  borderRadius: '10px',
                  background: 'rgba(56, 189, 248, 0.15)',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center'
                }}>
                  <Database size={20} color="#38bdf8" />
                </div>
                <div>
                  <h3 style={{ fontSize: '16px', fontWeight: 700, color: '#f8fafc', margin: 0 }}>
                    Backup & Manutenzione Catalogo
                  </h3>
                  <div style={{ color: '#94a3b8', fontSize: '11px', marginTop: '2px' }}>
                    Strumenti di consistenza, export rapido e recupero dello stato SQLite
                  </div>
                </div>
              </div>
              <span style={getHeaderPillStyle('blue')}>
                SQLite WAL-Safe
              </span>
            </div>

            {/* 3 Perfectly Symmetric Maintenance Tool Cards */}
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: '14px' }}>
              {/* Tool 1: DB Backup */}
              <div style={{
                background: '#0f172a',
                border: '1px solid #334155',
                borderRadius: '12px',
                padding: '16px',
                display: 'flex',
                flexDirection: 'column',
                justifyContent: 'space-between',
                gap: '14px'
              }}>
                <div>
                  <div style={{ fontWeight: 600, fontSize: '13px', color: '#f8fafc', display: 'flex', alignItems: 'center', gap: '6px' }}>
                    <Download size={16} color="#38bdf8" /> Backup Catalogo (.db)
                  </div>
                  <div style={{ color: '#94a3b8', fontSize: '11px', marginTop: '4px', lineHeight: '1.4' }}>
                    Copia consistente a caldo del database SQLite esportabile istantaneamente.
                  </div>
                </div>
                <button
                  type="button"
                  onClick={handleDownloadBackup}
                  disabled={downloadingBackup}
                  style={{
                    background: '#0284c7',
                    color: 'white',
                    border: 'none',
                    borderRadius: '20px',
                    padding: '8px 14px',
                    fontSize: '12px',
                    fontWeight: 600,
                    cursor: downloadingBackup ? 'not-allowed' : 'pointer',
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    gap: '6px',
                    width: '100%'
                  }}
                >
                  <Download size={14} />
                  {downloadingBackup ? 'Download in corso...' : 'Scarica Backup'}
                </button>
              </div>

              {/* Tool 2: GPS Backfill */}
              <div style={{
                background: '#0f172a',
                border: '1px solid #334155',
                borderRadius: '12px',
                padding: '16px',
                display: 'flex',
                flexDirection: 'column',
                justifyContent: 'space-between',
                gap: '14px'
              }}>
                <div>
                  <div style={{ fontWeight: 600, fontSize: '13px', color: '#f8fafc', display: 'flex', alignItems: 'center', gap: '6px' }}>
                    <MapPin size={16} color="#10b981" /> Risoluzione GPS Offline
                  </div>
                  <div style={{ color: '#94a3b8', fontSize: '11px', marginTop: '4px', lineHeight: '1.4' }}>
                    Ricalcola offline nomi di città e nazioni per tutte le foto con lat/lon.
                  </div>
                </div>
                <button
                  type="button"
                  onClick={handleBackfillGps}
                  disabled={runningBackfill}
                  style={{
                    background: '#059669',
                    color: '#ffffff',
                    border: 'none',
                    borderRadius: '20px',
                    padding: '8px 14px',
                    fontSize: '12px',
                    fontWeight: 600,
                    cursor: runningBackfill ? 'not-allowed' : 'pointer',
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    gap: '6px',
                    width: '100%'
                  }}
                >
                  <RefreshCw size={14} className={runningBackfill ? 'animate-spin' : ''} />
                  {runningBackfill ? 'Elaborazione...' : 'Aggiorna Località'}
                </button>
              </div>

              {/* Tool 3: Stale Scans Cleanup */}
              <div style={{
                background: '#0f172a',
                border: '1px solid #334155',
                borderRadius: '12px',
                padding: '16px',
                display: 'flex',
                flexDirection: 'column',
                justifyContent: 'space-between',
                gap: '14px'
              }}>
                <div>
                  <div style={{ fontWeight: 600, fontSize: '13px', color: '#f8fafc', display: 'flex', alignItems: 'center', gap: '6px' }}>
                    <Wrench size={16} color="#f59e0b" /> Scansioni Bloccate
                  </div>
                  <div style={{ color: '#94a3b8', fontSize: '11px', marginTop: '4px', lineHeight: '1.4' }}>
                    Sblocca fonti e job rimasti bloccati in 'running' a seguito di arresto improvviso.
                  </div>
                </div>
                <button
                  type="button"
                  onClick={handleCleanupStaleScans}
                  disabled={cleaningScans}
                  style={{
                    background: '#334155',
                    color: '#f8fafc',
                    border: '1px solid #475569',
                    borderRadius: '20px',
                    padding: '8px 14px',
                    fontSize: '12px',
                    fontWeight: 600,
                    cursor: cleaningScans ? 'not-allowed' : 'pointer',
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    gap: '6px',
                    width: '100%'
                  }}
                >
                  <RefreshCw size={14} className={cleaningScans ? 'animate-spin' : ''} />
                  {cleaningScans ? 'Verifica...' : 'Ripristina Job'}
                </button>
              </div>
            </div>
          </div>
        )}

        {/* ================= 5. SISTEMA, TELEMETRIA & HARDWARE ================= */}
        {shouldShow('system') && (
          <div style={{
            background: '#1e293b',
            border: '1px solid #334155',
            borderRadius: '16px',
            padding: '24px',
            boxShadow: '0 4px 20px -2px rgba(0,0,0,0.25)',
            display: 'flex',
            flexDirection: 'column',
            gap: '16px'
          }}>
            {/* Header */}
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
                <div style={{
                  width: '36px',
                  height: '36px',
                  borderRadius: '10px',
                  background: 'rgba(56, 189, 248, 0.15)',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center'
                }}>
                  <Cpu size={20} color="#38bdf8" />
                </div>
                <div>
                  <h3 style={{ fontSize: '16px', fontWeight: 700, color: '#f8fafc', margin: 0 }}>
                    Stato Backend & Diagnostica Hardware
                  </h3>
                  <div style={{ color: '#94a3b8', fontSize: '11px', marginTop: '2px' }}>
                    Telemetria server, SQLite Write-Ahead Logging e accelerazione WebAssembly
                  </div>
                </div>
              </div>
              <div style={{ display: 'flex', gap: '8px' }}>
                <span style={getHeaderPillStyle(backendHealth?.status === 'healthy' ? 'green' : 'rose')}>
                  {backendHealth?.status === 'healthy' ? 'FastAPI Online' : 'FastAPI Offline'}
                </span>
                {capabilities && (
                  <span style={getHeaderPillStyle(capabilities.hasWebAssembly ? 'green' : 'amber')}>
                    {capabilities.hasWebAssembly ? 'WASM SIMD' : 'WASM Base'}
                  </span>
                )}
              </div>
            </div>

            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(220px, 1fr))', gap: '12px', fontSize: '12px' }}>
              <div style={{ background: '#0f172a', padding: '12px 14px', borderRadius: '10px', border: '1px solid #334155' }}>
                <span style={{ color: '#94a3b8', display: 'block', fontSize: '11px' }}>Server FastAPI</span>
                <strong style={{ color: backendHealth?.status === 'healthy' ? '#22c55e' : '#f43f5e' }}>
                  {backendHealth?.status?.toUpperCase() || 'OFFLINE'}
                </strong>
              </div>
              <div style={{ background: '#0f172a', padding: '12px 14px', borderRadius: '10px', border: '1px solid #334155' }}>
                <span style={{ color: '#94a3b8', display: 'block', fontSize: '11px' }}>Database Engine</span>
                <strong style={{ color: '#f8fafc' }}>SQLite WAL-Mode</strong>
              </div>
              <div style={{ background: '#0f172a', padding: '12px 14px', borderRadius: '10px', border: '1px solid #334155' }}>
                <span style={{ color: '#94a3b8', display: 'block', fontSize: '11px' }}>Endpoint API</span>
                <code style={{ color: '#38bdf8', fontSize: '11px' }}>/api/v1</code>
              </div>
              <div style={{ background: '#0f172a', padding: '12px 14px', borderRadius: '10px', border: '1px solid #334155' }}>
                <span style={{ color: '#94a3b8', display: 'block', fontSize: '11px' }}>Archivio Miniature</span>
                <code style={{ color: '#38bdf8', fontSize: '11px' }}>./data/thumbnails</code>
              </div>

              {capabilities && (
                <>
                  <div style={{ background: '#0f172a', padding: '12px 14px', borderRadius: '10px', border: '1px solid #334155' }}>
                    <span style={{ color: '#94a3b8', display: 'block', fontSize: '11px' }}>Browser Rilevato</span>
                    <strong style={{ color: '#f8fafc' }}>{capabilities.browserName}</strong>
                  </div>
                  <div style={{ background: '#0f172a', padding: '12px 14px', borderRadius: '10px', border: '1px solid #334155' }}>
                    <span style={{ color: '#94a3b8', display: 'block', fontSize: '11px' }}>File System Access API</span>
                    <strong style={{ color: capabilities.hasFileSystemAccess ? '#22c55e' : '#f59e0b' }}>
                      {capabilities.hasFileSystemAccess ? 'Nativa Supportata' : 'Webkit Fallback'}
                    </strong>
                  </div>
                  <div style={{ background: '#0f172a', padding: '12px 14px', borderRadius: '10px', border: '1px solid #334155' }}>
                    <span style={{ color: '#94a3b8', display: 'block', fontSize: '11px' }}>WebAssembly SIMD (Hash)</span>
                    <strong style={{ color: capabilities.hasWebAssembly ? '#22c55e' : '#f43f5e' }}>
                      {capabilities.hasWebAssembly ? 'Attivo (> 500 MB/s)' : 'Non supportato'}
                    </strong>
                  </div>
                  <div style={{ background: '#0f172a', padding: '12px 14px', borderRadius: '10px', border: '1px solid #334155' }}>
                    <span style={{ color: '#94a3b8', display: 'block', fontSize: '11px' }}>Web Workers Concorrenti</span>
                    <strong style={{ color: '#22c55e' }}>Attivi (Multi-thread)</strong>
                  </div>
                </>
              )}
            </div>
          </div>
        )}

      </div>
    </div>
  );
};
