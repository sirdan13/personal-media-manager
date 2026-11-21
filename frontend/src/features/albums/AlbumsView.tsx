import React, { useEffect, useState } from 'react';
import { ApiClient, SmartAlbumEvent } from '../../services/api';
import { useToast } from '../../context/ToastContext';
import {
  Folder,
  Tag as TagIcon,
  Plus,
  Trash2,
  Edit2,
  Image as ImageIcon,
  Check,
  X,
  Sparkles,
  Calendar,
  MapPin
} from 'lucide-react';

interface AlbumsViewProps {
  onSelectAlbum: (albumId: string) => void;
  onSelectTag: (tagId: string) => void;
}

export const AlbumsView: React.FC<AlbumsViewProps> = ({ onSelectAlbum, onSelectTag }) => {
  const { toast } = useToast();
  const [albums, setAlbums] = useState<any[]>([]);
  const [tags, setTags] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);

  // New Album Modal/Form state
  const [showNewAlbumModal, setShowNewAlbumModal] = useState(false);
  const [newAlbumName, setNewAlbumName] = useState('');
  const [newAlbumDesc, setNewAlbumDesc] = useState('');

  // Editing Album state
  const [editingAlbumId, setEditingAlbumId] = useState<string | null>(null);
  const [editAlbumName, setEditAlbumName] = useState('');
  const [editAlbumDesc, setEditAlbumDesc] = useState('');

  // New Tag form state
  const [newTagName, setNewTagName] = useState('');
  const [newTagColor, setNewTagColor] = useState('#38bdf8');

  // Smart Albums State
  const [smartEvents, setSmartEvents] = useState<SmartAlbumEvent[]>([]);
  const [loadingSmartEvents, setLoadingSmartEvents] = useState(false);
  const [smartEngine, setSmartEngine] = useState<string | null>(null);
  const [creatingEventId, setCreatingEventId] = useState<string | null>(null);
  const [eventEdits, setEventEdits] = useState<Record<string, { name: string; description: string; tags: string }>>({});

  const presetColors = ['#38bdf8', '#22c55e', '#f59e0b', '#ec4899', '#a855f7', '#64748b'];

  useEffect(() => {
    loadData();
  }, []);

  const handleDiscoverEvents = async () => {
    try {
      setLoadingSmartEvents(true);
      const res = await ApiClient.suggestSmartAlbums(true, 15);
      setSmartEvents(res.events);
      setSmartEngine(res.engine);
      const initialEdits: Record<string, { name: string; description: string; tags: string }> = {};
      for (const ev of res.events) {
        initialEdits[ev.event_id] = {
          name: ev.suggested_name,
          description: ev.suggested_description,
          tags: ev.suggested_tags.join(', ')
        };
      }
      setEventEdits(initialEdits);
      if (res.events.length > 0) {
        toast.success(`Trovati ${res.events.length} eventi fotografici con date e luoghi coerenti!`);
      } else {
        toast.info('Nessun nuovo evento raggruppabile trovato (minimo 15 foto con data).');
      }
    } catch (err) {
      toast.error(`Errore ricerca eventi: ${(err as Error).message}`);
    } finally {
      setLoadingSmartEvents(false);
    }
  };

  const handleCreateSmartAlbum = async (ev: SmartAlbumEvent) => {
    const edits = eventEdits[ev.event_id] || {
      name: ev.suggested_name,
      description: ev.suggested_description,
      tags: ev.suggested_tags.join(', ')
    };
    if (!edits.name.trim()) return;

    try {
      setCreatingEventId(ev.event_id);
      const tagsList = edits.tags
        .split(',')
        .map(t => t.trim())
        .filter(Boolean);

      const res = await ApiClient.createSmartAlbum({
        event_id: ev.event_id,
        name: edits.name.trim(),
        description: edits.description.trim() || undefined,
        tags: tagsList
      });

      toast.success(`Album "${edits.name.trim()}" creato con ${res.added_count} foto e ${res.tags_applied} tag!`);
      // Remove created event from list
      setSmartEvents(prev => prev.filter(e => e.event_id !== ev.event_id));
      await loadData();
    } catch (err) {
      toast.error(`Errore creazione album: ${(err as Error).message}`);
    } finally {
      setCreatingEventId(null);
    }
  };

  const loadData = async () => {
    try {
      setLoading(true);
      const [albumList, tagList] = await Promise.all([
        ApiClient.getAlbums(),
        ApiClient.getTags()
      ]);
      setAlbums(albumList);
      setTags(tagList);
    } catch (err) {
      console.error('Error loading albums and tags:', err);
    } finally {
      setLoading(false);
    }
  };

  const handleCreateAlbum = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!newAlbumName.trim()) return;
    try {
      await ApiClient.createAlbum(newAlbumName.trim(), newAlbumDesc.trim() || undefined);
      toast.success(`Album "${newAlbumName.trim()}" creato con successo!`);
      setNewAlbumName('');
      setNewAlbumDesc('');
      setShowNewAlbumModal(false);
      await loadData();
    } catch (err) {
      toast.error((err as Error).message);
    }
  };

  const handleStartEditAlbum = (album: any, e: React.MouseEvent) => {
    e.stopPropagation();
    setEditingAlbumId(album.id);
    setEditAlbumName(album.name);
    setEditAlbumDesc(album.description || '');
  };

  const handleSaveEditAlbum = async (e: React.MouseEvent) => {
    e.stopPropagation();
    if (!editingAlbumId || !editAlbumName.trim()) return;
    try {
      await ApiClient.updateAlbum(editingAlbumId, editAlbumName.trim(), editAlbumDesc.trim() || undefined);
      toast.success('Album aggiornato con successo!');
      setEditingAlbumId(null);
      await loadData();
    } catch (err) {
      toast.error((err as Error).message);
    }
  };

  const handleDeleteAlbum = async (albumId: string, albumName: string, e: React.MouseEvent) => {
    e.stopPropagation();
    const confirmed = window.confirm(`Eliminare l'album virtuale "${albumName}"?\n(I file originali sui tuoi dischi non verranno toccati).`);
    if (!confirmed) return;
    try {
      await ApiClient.deleteAlbum(albumId);
      toast.success(`Album "${albumName}" eliminato.`);
      await loadData();
    } catch (err) {
      toast.error((err as Error).message);
    }
  };

  const handleCreateTag = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!newTagName.trim()) return;
    try {
      await ApiClient.createTag(newTagName.trim(), newTagColor);
      toast.success(`Tag "${newTagName.trim()}" creato!`);
      setNewTagName('');
      await loadData();
    } catch (err) {
      toast.error((err as Error).message);
    }
  };

  const handleDeleteTag = async (tagId: string, tagName: string, e: React.MouseEvent) => {
    e.stopPropagation();
    const confirmed = window.confirm(`Eliminare il tag "${tagName}"?`);
    if (!confirmed) return;
    try {
      await ApiClient.deleteTag(tagId);
      toast.success(`Tag "${tagName}" rimosso.`);
      await loadData();
    } catch (err) {
      toast.error((err as Error).message);
    }
  };

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '32px' }}>
      {/* Virtual Albums Section */}
      <div>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '16px', flexWrap: 'wrap', gap: '12px' }}>
          <div>
            <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
              <Folder size={22} color="#38bdf8" />
              <h2 style={{ fontSize: '20px', fontWeight: 'bold' }}>Album Virtuali</h2>
            </div>
            <p style={{ color: '#94a3b8', fontSize: '13px', marginTop: '4px' }}>
              Organizza le tue foto in raccolte personalizzate senza duplicare o spostare i file fisici su disco.
            </p>
          </div>

          <div style={{ display: 'flex', gap: '8px' }}>
            <button
              onClick={handleDiscoverEvents}
              disabled={loadingSmartEvents}
              style={{
                background: 'rgba(168, 85, 247, 0.15)',
                color: '#c084fc',
                border: '1px solid rgba(168, 85, 247, 0.4)',
                borderRadius: '8px',
                padding: '9px 16px',
                fontSize: '13px',
                fontWeight: 600,
                cursor: loadingSmartEvents ? 'not-allowed' : 'pointer',
                display: 'flex',
                alignItems: 'center',
                gap: '6px'
              }}
            >
              <Sparkles size={16} className={loadingSmartEvents ? 'animate-spin' : ''} />
              {loadingSmartEvents ? 'Ricerca eventi in corso...' : 'Trova Eventi & Album Suggeriti'}
            </button>

            <button
              onClick={() => setShowNewAlbumModal(true)}
              style={{
                background: '#0284c7',
                color: 'white',
                border: 'none',
                borderRadius: '8px',
                padding: '9px 16px',
                fontSize: '13px',
                fontWeight: 600,
                cursor: 'pointer',
                display: 'flex',
                alignItems: 'center',
                gap: '6px'
              }}
            >
              <Plus size={16} /> Nuovo Album
            </button>
          </div>
        </div>

        {/* Smart Suggested Albums Section */}
        {smartEvents.length > 0 && (
          <div style={{
            background: '#0f172a',
            border: '1px solid #334155',
            borderRadius: '16px',
            padding: '20px',
            marginBottom: '24px',
            display: 'flex',
            flexDirection: 'column',
            gap: '16px'
          }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                <Sparkles size={18} color="#a855f7" />
                <h3 style={{ fontSize: '16px', fontWeight: 700, margin: 0 }}>
                  Eventi Fotografici Rilevati ({smartEvents.length})
                </h3>
                {smartEngine && (
                  <span style={{
                    fontSize: '10px',
                    padding: '2px 6px',
                    borderRadius: '4px',
                    background: smartEngine === 'heuristic' ? 'rgba(56, 189, 248, 0.2)' : 'rgba(168, 85, 247, 0.2)',
                    color: smartEngine === 'heuristic' ? '#38bdf8' : '#c084fc',
                    fontWeight: 700
                  }}>
                    {smartEngine.toUpperCase()}
                  </span>
                )}
              </div>
              <button
                onClick={() => setSmartEvents([])}
                style={{ background: 'transparent', border: 'none', color: '#94a3b8', fontSize: '12px', cursor: 'pointer' }}
              >
                Nascondi
              </button>
            </div>

            <div style={{
              display: 'grid',
              gridTemplateColumns: 'repeat(auto-fill, minmax(300px, 1fr))',
              gap: '16px'
            }}>
              {smartEvents.map((ev) => {
                const edits = eventEdits[ev.event_id] || {
                  name: ev.suggested_name,
                  description: ev.suggested_description,
                  tags: ev.suggested_tags.join(', ')
                };
                const isCreating = creatingEventId === ev.event_id;

                const startDate = new Date(ev.start).toLocaleDateString();
                const endDate = new Date(ev.end).toLocaleDateString();

                return (
                  <div
                    key={ev.event_id}
                    style={{
                      background: '#1e293b',
                      border: '1px solid #334155',
                      borderRadius: '12px',
                      padding: '14px',
                      display: 'flex',
                      flexDirection: 'column',
                      gap: '10px'
                    }}
                  >
                    <div style={{ display: 'flex', gap: '12px' }}>
                      <div style={{
                        width: '80px',
                        height: '80px',
                        borderRadius: '8px',
                        background: '#090d16',
                        overflow: 'hidden',
                        flexShrink: 0,
                        display: 'flex',
                        alignItems: 'center',
                        justifyContent: 'center'
                      }}>
                        <img
                          src={ApiClient.getThumbnailUrl(ev.cover_media_id)}
                          alt="Cover"
                          style={{ width: '100%', height: '100%', objectFit: 'cover' }}
                          onError={(e) => {
                            (e.target as any).style.display = 'none';
                          }}
                        />
                      </div>

                      <div style={{ minWidth: 0, flex: 1, display: 'flex', flexDirection: 'column', gap: '4px' }}>
                        <div style={{ display: 'flex', alignItems: 'center', gap: '6px', fontSize: '11px', color: '#38bdf8' }}>
                          <Calendar size={12} />
                          <span>{startDate === endDate ? startDate : `${startDate} - ${endDate}`}</span>
                          <span style={{ color: '#64748b' }}>•</span>
                          <span style={{ color: '#22c55e', fontWeight: 600 }}>{ev.media_count} foto</span>
                        </div>

                        {ev.top_places.length > 0 && (
                          <div style={{ display: 'flex', alignItems: 'center', gap: '4px', fontSize: '11px', color: '#94a3b8' }}>
                            <MapPin size={12} color="#f59e0b" />
                            <span style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                              {ev.top_places.map(p => p.place_name).join(', ')}
                            </span>
                          </div>
                        )}
                      </div>
                    </div>

                    {/* Inputs */}
                    <div style={{ display: 'flex', flexDirection: 'column', gap: '6px' }}>
                      <input
                        type="text"
                        value={edits.name}
                        onChange={(e) => setEventEdits({
                          ...eventEdits,
                          [ev.event_id]: { ...edits, name: e.target.value }
                        })}
                        placeholder="Nome album"
                        style={{
                          background: '#0f172a',
                          border: '1px solid #334155',
                          borderRadius: '6px',
                          color: '#f8fafc',
                          padding: '6px 10px',
                          fontSize: '12px',
                          fontWeight: 600
                        }}
                      />
                      <input
                        type="text"
                        value={edits.tags}
                        onChange={(e) => setEventEdits({
                          ...eventEdits,
                          [ev.event_id]: { ...edits, tags: e.target.value }
                        })}
                        placeholder="Tag (separati da virgola, es: vacanze, mare)"
                        style={{
                          background: '#0f172a',
                          border: '1px solid #334155',
                          borderRadius: '6px',
                          color: '#94a3b8',
                          padding: '4px 8px',
                          fontSize: '11px'
                        }}
                      />
                    </div>

                    <button
                      onClick={() => handleCreateSmartAlbum(ev)}
                      disabled={isCreating || !edits.name.trim()}
                      style={{
                        background: '#a855f7',
                        color: 'white',
                        border: 'none',
                        borderRadius: '6px',
                        padding: '6px 12px',
                        fontSize: '12px',
                        fontWeight: 600,
                        cursor: isCreating ? 'not-allowed' : 'pointer',
                        display: 'flex',
                        alignItems: 'center',
                        justifyContent: 'center',
                        gap: '6px',
                        marginTop: '4px'
                      }}
                    >
                      <Plus size={14} />
                      {isCreating ? 'Creazione in corso...' : 'Crea Album & Applica Tag'}
                    </button>
                  </div>
                );
              })}
            </div>
          </div>
        )}

        {/* Albums Grid */}
        {albums.length === 0 && !loading ? (
          <div style={{
            background: '#1e293b',
            border: '1px dashed #334155',
            borderRadius: '12px',
            padding: '40px 20px',
            textAlign: 'center',
            color: '#94a3b8'
          }}>
            <Folder size={40} color="#64748b" style={{ margin: '0 auto 12px' }} />
            <div style={{ fontWeight: 600, fontSize: '15px', color: '#f8fafc' }}>Nessun album creato</div>
            <div style={{ fontSize: '13px', marginTop: '4px' }}>Crea il tuo primo album virtuale o aggiungi foto direttamente dalla libreria.</div>
          </div>
        ) : (
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(240px, 1fr))', gap: '16px' }}>
            {albums.map((album) => (
              <div
                key={album.id}
                onClick={() => onSelectAlbum(album.id)}
                style={{
                  background: '#1e293b',
                  border: '1px solid #334155',
                  borderRadius: '12px',
                  overflow: 'hidden',
                  cursor: 'pointer',
                  display: 'flex',
                  flexDirection: 'column',
                  transition: 'transform 0.15s ease, border-color 0.15s ease'
                }}
              >
                {/* Album Cover */}
                <div style={{
                  height: '140px',
                  background: '#0f172a',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  position: 'relative'
                }}>
                  {album.cover_media_id ? (
                    <img
                      src={ApiClient.getThumbnailUrl(album.cover_media_id)}
                      alt={album.name}
                      style={{ width: '100%', height: '100%', objectFit: 'cover' }}
                    />
                  ) : (
                    <ImageIcon size={40} color="#334155" />
                  )}
                  <span style={{
                    position: 'absolute',
                    bottom: '8px',
                    right: '8px',
                    background: 'rgba(15, 23, 42, 0.85)',
                    color: '#f8fafc',
                    fontSize: '11px',
                    fontWeight: 700,
                    padding: '2px 8px',
                    borderRadius: '4px',
                    backdropFilter: 'blur(4px)'
                  }}>
                    {album.media_count} foto
                  </span>
                </div>

                {/* Album Details / Edit mode */}
                <div style={{ padding: '14px', flex: 1, display: 'flex', flexDirection: 'column', justifyContent: 'space-between' }}>
                  {editingAlbumId === album.id ? (
                    <div onClick={(e) => e.stopPropagation()} style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
                      <input
                        type="text"
                        value={editAlbumName}
                        onChange={(e) => setEditAlbumName(e.target.value)}
                        style={{
                          background: '#0f172a',
                          border: '1px solid #0284c7',
                          color: 'white',
                          borderRadius: '6px',
                          padding: '6px 8px',
                          fontSize: '13px'
                        }}
                      />
                      <input
                        type="text"
                        placeholder="Descrizione opzionale..."
                        value={editAlbumDesc}
                        onChange={(e) => setEditAlbumDesc(e.target.value)}
                        style={{
                          background: '#0f172a',
                          border: '1px solid #334155',
                          color: '#94a3b8',
                          borderRadius: '6px',
                          padding: '4px 8px',
                          fontSize: '12px'
                        }}
                      />
                      <div style={{ display: 'flex', gap: '6px', marginTop: '4px' }}>
                        <button
                          onClick={handleSaveEditAlbum}
                          style={{
                            flex: 1,
                            background: '#0284c7',
                            color: 'white',
                            border: 'none',
                            borderRadius: '4px',
                            padding: '4px 8px',
                            fontSize: '11px',
                            fontWeight: 600,
                            cursor: 'pointer',
                            display: 'flex',
                            alignItems: 'center',
                            justifyContent: 'center',
                            gap: '4px'
                          }}
                        >
                          <Check size={12} /> Salva
                        </button>
                        <button
                          onClick={(e) => { e.stopPropagation(); setEditingAlbumId(null); }}
                          style={{
                            background: '#334155',
                            color: '#94a3b8',
                            border: 'none',
                            borderRadius: '4px',
                            padding: '4px 8px',
                            fontSize: '11px',
                            cursor: 'pointer'
                          }}
                        >
                          <X size={12} />
                        </button>
                      </div>
                    </div>
                  ) : (
                    <>
                      <div>
                        <div style={{ fontWeight: 600, fontSize: '15px', color: '#f8fafc', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
                          {album.name}
                        </div>
                        {album.description && (
                          <div style={{ color: '#94a3b8', fontSize: '12px', marginTop: '2px', lineClamp: 2, display: '-webkit-box', WebkitBoxOrient: 'vertical', overflow: 'hidden' }}>
                            {album.description}
                          </div>
                        )}
                      </div>

                      <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '8px', marginTop: '12px', paddingTop: '8px', borderTop: '1px solid #334155' }}>
                        <button
                          onClick={(e) => handleStartEditAlbum(album, e)}
                          title="Rinomina Album"
                          style={{ background: 'transparent', border: 'none', color: '#94a3b8', cursor: 'pointer', padding: '4px' }}
                        >
                          <Edit2 size={14} />
                        </button>
                        <button
                          onClick={(e) => handleDeleteAlbum(album.id, album.name, e)}
                          title="Elimina Album"
                          style={{ background: 'transparent', border: 'none', color: '#f43f5e', cursor: 'pointer', padding: '4px' }}
                        >
                          <Trash2 size={14} />
                        </button>
                      </div>
                    </>
                  )}
                </div>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* Custom Tags Section */}
      <div>
        <div style={{ display: 'flex', alignItems: 'center', gap: '10px', marginBottom: '16px' }}>
          <TagIcon size={22} color="#ec4899" />
          <div>
            <h2 style={{ fontSize: '20px', fontWeight: 'bold' }}>Tag Personalizzati</h2>
            <p style={{ color: '#94a3b8', fontSize: '13px', marginTop: '2px' }}>
              Etichetta e categorizza rapidamente i tuoi scatti per parola chiave e colore.
            </p>
          </div>
        </div>

        {/* Create Tag Form */}
        <form
          onSubmit={handleCreateTag}
          style={{
            background: '#1e293b',
            border: '1px solid #334155',
            borderRadius: '12px',
            padding: '16px 20px',
            marginBottom: '20px',
            display: 'flex',
            alignItems: 'center',
            flexWrap: 'wrap',
            gap: '12px'
          }}
        >
          <input
            type="text"
            placeholder="Nome nuovo tag (es. Vacanze, Famiglia, Ritratti)..."
            value={newTagName}
            onChange={(e) => setNewTagName(e.target.value)}
            style={{
              flex: '1 1 240px',
              background: '#0f172a',
              border: '1px solid #334155',
              color: 'white',
              borderRadius: '8px',
              padding: '8px 12px',
              fontSize: '13px'
            }}
          />

          {/* Color preset selector */}
          <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
            {presetColors.map((c) => (
              <button
                key={c}
                type="button"
                onClick={() => setNewTagColor(c)}
                style={{
                  width: '24px',
                  height: '24px',
                  borderRadius: '50%',
                  background: c,
                  border: newTagColor === c ? '2px solid white' : '2px solid transparent',
                  cursor: 'pointer',
                  transform: newTagColor === c ? 'scale(1.15)' : 'scale(1)',
                  transition: 'transform 0.1s'
                }}
              />
            ))}
            <input
              type="color"
              value={newTagColor}
              onChange={(e) => setNewTagColor(e.target.value)}
              style={{
                width: '28px',
                height: '28px',
                padding: 0,
                border: 'none',
                background: 'transparent',
                cursor: 'pointer'
              }}
              title="Colore personalizzato"
            />
          </div>

          <button
            type="submit"
            disabled={!newTagName.trim()}
            style={{
              background: '#0284c7',
              color: 'white',
              border: 'none',
              borderRadius: '8px',
              padding: '8px 16px',
              fontSize: '13px',
              fontWeight: 600,
              cursor: newTagName.trim() ? 'pointer' : 'not-allowed',
              opacity: newTagName.trim() ? 1 : 0.6,
              display: 'flex',
              alignItems: 'center',
              gap: '6px'
            }}
          >
            <Plus size={15} /> Aggiungi Tag
          </button>
        </form>

        {/* Tags List */}
        {tags.length === 0 && !loading ? (
          <div style={{ color: '#64748b', fontSize: '13px', fontStyle: 'italic' }}>
            Nessun tag personalizzato creato.
          </div>
        ) : (
          <div style={{ display: 'flex', flexWrap: 'wrap', gap: '10px' }}>
            {tags.map((tag) => (
              <div
                key={tag.id}
                onClick={() => onSelectTag(tag.id)}
                style={{
                  background: '#1e293b',
                  border: `1px solid ${tag.color || '#38bdf8'}`,
                  borderRadius: '20px',
                  padding: '6px 14px',
                  display: 'flex',
                  alignItems: 'center',
                  gap: '8px',
                  cursor: 'pointer',
                  transition: 'background 0.15s ease'
                }}
              >
                <div style={{ width: '8px', height: '8px', borderRadius: '50%', background: tag.color || '#38bdf8' }} />
                <span style={{ fontSize: '13px', fontWeight: 600, color: '#f8fafc' }}>{tag.name}</span>
                <span style={{
                  background: '#0f172a',
                  color: '#94a3b8',
                  fontSize: '11px',
                  fontWeight: 600,
                  padding: '1px 6px',
                  borderRadius: '10px'
                }}>
                  {tag.media_count}
                </span>
                <button
                  onClick={(e) => handleDeleteTag(tag.id, tag.name, e)}
                  title="Elimina Tag"
                  style={{
                    background: 'transparent',
                    border: 'none',
                    color: '#64748b',
                    padding: '2px',
                    cursor: 'pointer',
                    display: 'flex',
                    alignItems: 'center'
                  }}
                >
                  <X size={12} />
                </button>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* Modal for Creating New Album */}
      {showNewAlbumModal && (
        <div style={{
          position: 'fixed',
          inset: 0,
          background: 'rgba(0, 0, 0, 0.7)',
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
            padding: '24px',
            width: '100%',
            maxWidth: '420px',
            display: 'flex',
            flexDirection: 'column',
            gap: '16px'
          }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
              <h3 style={{ fontSize: '17px', fontWeight: 600, color: '#f8fafc' }}>Nuovo Album Virtuale</h3>
              <button
                onClick={() => setShowNewAlbumModal(false)}
                style={{ background: 'transparent', border: 'none', color: '#94a3b8', cursor: 'pointer' }}
              >
                <X size={18} />
              </button>
            </div>

            <form onSubmit={handleCreateAlbum} style={{ display: 'flex', flexDirection: 'column', gap: '14px' }}>
              <div>
                <label style={{ display: 'block', fontSize: '12px', color: '#94a3b8', marginBottom: '6px' }}>
                  Nome Album *
                </label>
                <input
                  type="text"
                  required
                  placeholder="Es. Viaggio in Giappone 2026"
                  value={newAlbumName}
                  onChange={(e) => setNewAlbumName(e.target.value)}
                  style={{
                    width: '100%',
                    background: '#0f172a',
                    border: '1px solid #334155',
                    color: 'white',
                    borderRadius: '8px',
                    padding: '8px 12px',
                    fontSize: '13px'
                  }}
                />
              </div>

              <div>
                <label style={{ display: 'block', fontSize: '12px', color: '#94a3b8', marginBottom: '6px' }}>
                  Descrizione (opzionale)
                </label>
                <textarea
                  rows={3}
                  placeholder="Note o descrizione..."
                  value={newAlbumDesc}
                  onChange={(e) => setNewAlbumDesc(e.target.value)}
                  style={{
                    width: '100%',
                    background: '#0f172a',
                    border: '1px solid #334155',
                    color: 'white',
                    borderRadius: '8px',
                    padding: '8px 12px',
                    fontSize: '13px',
                    resize: 'none'
                  }}
                />
              </div>

              <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '8px', marginTop: '8px' }}>
                <button
                  type="button"
                  onClick={() => setShowNewAlbumModal(false)}
                  style={{
                    background: '#334155',
                    color: '#94a3b8',
                    border: 'none',
                    borderRadius: '8px',
                    padding: '8px 14px',
                    fontSize: '13px',
                    cursor: 'pointer'
                  }}
                >
                  Annulla
                </button>
                <button
                  type="submit"
                  disabled={!newAlbumName.trim()}
                  style={{
                    background: '#0284c7',
                    color: 'white',
                    border: 'none',
                    borderRadius: '8px',
                    padding: '8px 16px',
                    fontSize: '13px',
                    fontWeight: 600,
                    cursor: newAlbumName.trim() ? 'pointer' : 'not-allowed'
                  }}
                >
                  Crea Album
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
};
