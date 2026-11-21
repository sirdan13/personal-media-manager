import React, { useState } from 'react';
import {
  X,
  Smartphone,
  HardDrive,
  Sparkles,
  ShieldCheck,
  Copy,
  ChevronRight,
  ChevronLeft,
  CheckCircle2,
  Cpu,
  UserCheck,
  Lightbulb
} from 'lucide-react';

interface TutorialModalProps {
  isOpen: boolean;
  onClose: () => void;
}

export const TutorialModal: React.FC<TutorialModalProps> = ({ isOpen, onClose }) => {
  const [activeStep, setActiveStep] = useState(0);

  if (!isOpen) return null;

  const steps = [
    {
      id: 'welcome',
      title: 'Benvenuto in Personal Media Manager',
      subtitle: 'Come funziona il catalogo fotografico non distruttivo',
      icon: <Sparkles size={28} color="#38bdf8" />,
      content: (
        <div style={{ display: 'flex', flexDirection: 'column', gap: '16px', fontSize: '14px', lineHeight: 1.6 }}>
          <p>
            <strong>Personal Media Manager</strong> nasce per risolvere il problema degli archivi fotografici e video frammentati su molteplici computer, hard disk esterni, schede SD e smartphone.
          </p>

          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(220px, 1fr))', gap: '12px', marginTop: '8px' }}>
            <div style={{ background: '#0f172a', border: '1px solid #334155', borderRadius: '10px', padding: '14px' }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: '8px', color: '#22c55e', fontWeight: 600, marginBottom: '6px' }}>
                <ShieldCheck size={18} />
                <span>Rigorosamente Read-Only</span>
              </div>
              <p style={{ fontSize: '12px', color: '#94a3b8', margin: 0 }}>
                I tuoi file originali non vengono mai toccati, rinominati, spostati o cancellati.
              </p>
            </div>

            <div style={{ background: '#0f172a', border: '1px solid #334155', borderRadius: '10px', padding: '14px' }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: '8px', color: '#38bdf8', fontWeight: 600, marginBottom: '6px' }}>
                <Cpu size={18} />
                <span>Scansione nel Browser</span>
              </div>
              <p style={{ fontSize: '12px', color: '#94a3b8', margin: 0 }}>
                Calcolo crittografico SHA-256 ed estrazione metadati a blocchi direttamente dal browser con consumo RAM &lt; 5MB.
              </p>
            </div>

            <div style={{ background: '#0f172a', border: '1px solid #334155', borderRadius: '10px', padding: '14px' }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: '8px', color: '#f59e0b', fontWeight: 600, marginBottom: '6px' }}>
                <HardDrive size={18} />
                <span>Dischi Offline Consultabili</span>
              </div>
              <p style={{ fontSize: '12px', color: '#94a3b8', margin: 0 }}>
                Le miniature WebP e i metadati restano sempre visibili anche con l'hard disk scollegato nel cassetto.
              </p>
            </div>
          </div>
        </div>
      )
    },
    {
      id: 'iphone_workflow',
      title: 'Workflow Reale: Foto da iPhone a Disco Esterno',
      subtitle: 'La procedura passo-passo consigliata',
      icon: <Smartphone size={28} color="#a855f7" />,
      content: (
        <div style={{ display: 'flex', flexDirection: 'column', gap: '14px', fontSize: '13px', lineHeight: 1.6 }}>
          <p style={{ color: '#cbd5e1' }}>
            Hai scaricato ad esempio <strong>6 mesi di foto dal tuo iPhone</strong> e le hai salvate su un hard disk esterno? Ecco esattamente cosa fare nel tool:
          </p>

          <div style={{ display: 'flex', flexDirection: 'column', gap: '10px' }}>
            <div style={{ background: '#0f172a', border: '1px solid #334155', borderRadius: '10px', padding: '12px 14px' }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: '10px', fontWeight: 600, color: '#f8fafc' }}>
                <span style={{ background: '#0284c7', color: 'white', borderRadius: '50%', width: '22px', height: '22px', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: '11px' }}>1</span>
                <span>Registra la Fonte</span>
              </div>
              <p style={{ color: '#94a3b8', fontSize: '12px', margin: '6px 0 0 32px' }}>
                Vai nella sezione <strong>Fonti</strong> e clicca su <em>"+ Registra Nuova Fonte"</em>. Dai un nome al tuo disco (es: <code>"Hard Disk Lacie 4TB"</code>). Se l'hard disk è già registrato, salta questo passaggio.
              </p>
            </div>

            <div style={{ background: '#0f172a', border: '1px solid #334155', borderRadius: '10px', padding: '12px 14px' }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: '10px', fontWeight: 600, color: '#f8fafc' }}>
                <span style={{ background: '#0284c7', color: 'white', borderRadius: '50%', width: '22px', height: '22px', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: '11px' }}>2</span>
                <span>Avvia la Scansione della Cartella</span>
              </div>
              <p style={{ color: '#94a3b8', fontSize: '12px', margin: '6px 0 0 32px' }}>
                Vai su <strong>Scansioni</strong>, seleziona la fonte dal menu a tendina e premi <em>"Seleziona Cartella da Scansionare"</em>. Scegli la cartella dell'hard disk in cui hai copiato le foto dell'iPhone.
              </p>
            </div>

            <div style={{ background: '#0f172a', border: '1px solid #334155', borderRadius: '10px', padding: '12px 14px' }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: '10px', fontWeight: 600, color: '#f8fafc' }}>
                <span style={{ background: '#0284c7', color: 'white', borderRadius: '50%', width: '22px', height: '22px', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: '11px' }}>3</span>
                <span>Elaborazione Automatica dei Metadati</span>
              </div>
              <p style={{ color: '#94a3b8', fontSize: '12px', margin: '6px 0 0 32px' }}>
                Il browser calcolerà l'impronta crittografica <strong>SHA-256</strong> di ogni foto ed estrarrà automaticamente dai metadati EXIF la data reale di scatto (non la data in cui hai copiato il file!), il modello di iPhone, l'obiettivo e le coordinate GPS del luogo in cui hai scattato.
              </p>
            </div>
          </div>
        </div>
      )
    },
    {
      id: 'duplicates_offline',
      title: 'Duplicati & Hard Disk Scollegati',
      subtitle: 'Cosa succede quando stacchi il disco o trovi foto doppie',
      icon: <Copy size={28} color="#f59e0b" />,
      content: (
        <div style={{ display: 'flex', flexDirection: 'column', gap: '14px', fontSize: '13px', lineHeight: 1.6 }}>
          <div style={{ background: '#0f172a', border: '1px solid #334155', borderRadius: '10px', padding: '14px' }}>
            <h4 style={{ color: '#f59e0b', fontSize: '14px', display: 'flex', alignItems: 'center', gap: '8px', margin: '0 0 6px 0' }}>
              <Copy size={16} />
              Riconoscimento Automatico Duplicati
            </h4>
            <p style={{ color: '#94a3b8', fontSize: '12px', margin: 0 }}>
              Se alcune foto del tuo iPhone erano già state salvate in passato sul computer o su un altro hard disk (anche con un nome diverso!), Personal Media Manager le aggancia allo stesso record logico.
              Nella sezione <strong>Duplicati</strong> troverai il calcolo esatto dei gigabyte sprecati e l'elenco dei dischi in cui risiede ciascuna copia.
            </p>
          </div>

          <div style={{ background: '#0f172a', border: '1px solid #334155', borderRadius: '10px', padding: '14px' }}>
            <h4 style={{ color: '#38bdf8', fontSize: '14px', display: 'flex', alignItems: 'center', gap: '8px', margin: '0 0 6px 0' }}>
              <HardDrive size={16} />
              Quando Stacchi l'Hard Disk (Stato Offline)
            </h4>
            <p style={{ color: '#94a3b8', fontSize: '12px', margin: 0 }}>
              Quando estrai l'hard disk e lo riponi nel cassetto, l'archivio <strong>rimane intatto e consultabile al 100%</strong>. Le miniature WebP 384px sono memorizzate centralmente sul server locale. Nel dettaglio di ogni foto vedrai il badge <code>DISCO OFFLINE</code> e il percorso esatto per ritrovarla.
            </p>
          </div>

          <div style={{ background: '#0f172a', border: '1px solid #334155', borderRadius: '10px', padding: '14px' }}>
            <h4 style={{ color: '#22c55e', fontSize: '14px', display: 'flex', alignItems: 'center', gap: '8px', margin: '0 0 6px 0' }}>
              <CheckCircle2 size={16} />
              Scansioni Incrementali Istantanee
            </h4>
            <p style={{ color: '#94a3b8', fontSize: '12px', margin: 0 }}>
              Tra altri 6 mesi, quando scaricherai nuove foto sullo stesso hard disk, basterà lanciare nuovamente la scansione: il motore riconoscerà all'istante le foto già note e scansionerà solo i nuovi file aggiunti.
            </p>
          </div>
        </div>
      )
    },
    {
      id: 'accounts',
      title: 'Account Personale vs Account Demo',
      subtitle: 'Puoi usare il tuo account reale con crittografia sicura',
      icon: <UserCheck size={28} color="#22c55e" />,
      content: (
        <div style={{ display: 'flex', flexDirection: 'column', gap: '14px', fontSize: '13px', lineHeight: 1.6 }}>
          <p style={{ color: '#cbd5e1' }}>
            <strong>Sì, puoi usare un account reale!</strong> Personal Media Manager include un sistema di autenticazione multi-utente completo:
          </p>

          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '12px' }}>
            <div style={{ background: '#0f172a', border: '1px solid #334155', borderRadius: '10px', padding: '14px' }}>
              <div style={{ fontWeight: 600, color: '#38bdf8', marginBottom: '6px' }}>Account Personale Reale</div>
              <ul style={{ margin: 0, paddingLeft: '18px', fontSize: '12px', color: '#94a3b8' }}>
                <li>Registrati con la tua email reale e password forte.</li>
                <li>Le password sono protette con hashing crittografico <code>bcrypt</code> e token <code>JWT</code>.</li>
                <li>Isolamento rigoroso dei dati nel database SQLite: nessun altro utente può vedere le tue foto o fonti.</li>
              </ul>
            </div>

            <div style={{ background: '#0f172a', border: '1px solid #334155', borderRadius: '10px', padding: '14px' }}>
              <div style={{ fontWeight: 600, color: '#f59e0b', marginBottom: '6px' }}>Account Demo</div>
              <ul style={{ margin: 0, paddingLeft: '18px', fontSize: '12px', color: '#94a3b8' }}>
                <li>Utile per fare un test immediato con 1 clic senza compilare form.</li>
                <li>Credenziali preimpostate: <code>demo@example.com</code> / <code>demo123456</code>.</li>
                <li>Puoi disconnetterti in qualunque momento dalla Sidebar in basso a sinistra e creare il tuo account personale!</li>
              </ul>
            </div>
          </div>

          <div style={{ background: 'rgba(34, 197, 94, 0.1)', border: '1px solid rgba(34, 197, 94, 0.3)', borderRadius: '8px', padding: '10px 14px', color: '#22c55e', fontSize: '12px', display: 'flex', alignItems: 'center', gap: '8px' }}>
            <Lightbulb size={16} style={{ flexShrink: 0 }} />
            <span><strong>Suggerimento:</strong> Per creare il tuo account personale, clicca su <strong>Esci</strong> in basso a sinistra nella barra laterale, poi seleziona <em>"Non hai un account? Registrati ora"</em>.</span>
          </div>
        </div>
      )
    }
  ];

  const current = steps[activeStep];

  return (
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
        maxWidth: '720px',
        maxHeight: '90vh',
        display: 'flex',
        flexDirection: 'column',
        boxShadow: '0 25px 50px -12px rgba(0, 0, 0, 0.7)',
        overflow: 'hidden'
      }}>
        {/* Modal Header */}
        <div style={{
          padding: '20px 24px',
          borderBottom: '1px solid #334155',
          display: 'flex',
          justifyContent: 'space-between',
          alignItems: 'center',
          background: '#0f172a'
        }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
            <div style={{
              background: 'rgba(56, 189, 248, 0.1)',
              borderRadius: '10px',
              padding: '8px',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center'
            }}>
              {current.icon}
            </div>
            <div>
              <h3 style={{ fontSize: '17px', fontWeight: 'bold', color: '#f8fafc', margin: 0 }}>
                {current.title}
              </h3>
              <p style={{ color: '#94a3b8', fontSize: '12px', margin: '2px 0 0 0' }}>
                {current.subtitle}
              </p>
            </div>
          </div>

          <button
            onClick={onClose}
            style={{
              background: 'transparent',
              border: 'none',
              color: '#94a3b8',
              cursor: 'pointer',
              padding: '6px',
              borderRadius: '6px'
            }}
          >
            <X size={20} />
          </button>
        </div>

        {/* Step Indicator Tabs */}
        <div style={{
          display: 'flex',
          background: '#090d16',
          borderBottom: '1px solid #334155',
          padding: '0 12px'
        }}>
          {steps.map((s, idx) => (
            <button
              key={s.id}
              onClick={() => setActiveStep(idx)}
              style={{
                flex: 1,
                padding: '12px 8px',
                background: 'transparent',
                border: 'none',
                borderBottom: activeStep === idx ? '2px solid #38bdf8' : '2px solid transparent',
                color: activeStep === idx ? '#38bdf8' : '#64748b',
                fontSize: '12px',
                fontWeight: activeStep === idx ? 600 : 500,
                cursor: 'pointer',
                transition: 'all 0.2s',
                whiteSpace: 'nowrap',
                overflow: 'hidden',
                textOverflow: 'ellipsis'
              }}
            >
              Passo {idx + 1}
            </button>
          ))}
        </div>

        {/* Modal Body */}
        <div style={{
          padding: '24px',
          overflowY: 'auto',
          flex: 1,
          background: '#1e293b'
        }}>
          {current.content}
        </div>

        {/* Modal Footer */}
        <div style={{
          padding: '16px 24px',
          borderTop: '1px solid #334155',
          display: 'flex',
          justifyContent: 'space-between',
          alignItems: 'center',
          background: '#0f172a'
        }}>
          <button
            onClick={() => setActiveStep((prev) => Math.max(0, prev - 1))}
            disabled={activeStep === 0}
            style={{
              background: 'transparent',
              border: '1px solid #334155',
              color: activeStep === 0 ? '#475569' : '#cbd5e1',
              borderRadius: '8px',
              padding: '8px 14px',
              fontSize: '13px',
              cursor: activeStep === 0 ? 'not-allowed' : 'pointer',
              display: 'flex',
              alignItems: 'center',
              gap: '6px'
            }}
          >
            <ChevronLeft size={16} /> Precedente
          </button>

          <div style={{ fontSize: '12px', color: '#64748b' }}>
            {activeStep + 1} di {steps.length}
          </div>

          {activeStep < steps.length - 1 ? (
            <button
              onClick={() => setActiveStep((prev) => Math.min(steps.length - 1, prev + 1))}
              style={{
                background: '#0284c7',
                border: 'none',
                color: 'white',
                borderRadius: '8px',
                padding: '8px 16px',
                fontSize: '13px',
                fontWeight: 600,
                cursor: 'pointer',
                display: 'flex',
                alignItems: 'center',
                gap: '6px'
              }}
            >
              Prossimo <ChevronRight size={16} />
            </button>
          ) : (
            <button
              onClick={onClose}
              style={{
                background: 'linear-gradient(135deg, #10b981 0%, #059669 100%)',
                border: 'none',
                color: 'white',
                borderRadius: '8px',
                padding: '8px 18px',
                fontSize: '13px',
                fontWeight: 600,
                cursor: 'pointer',
                display: 'flex',
                alignItems: 'center',
                gap: '6px',
                boxShadow: '0 2px 6px rgba(16, 185, 129, 0.4)'
              }}
            >
              <CheckCircle2 size={16} /> Ho Capito, Inizia!
            </button>
          )}
        </div>
      </div>
    </div>
  );
};
