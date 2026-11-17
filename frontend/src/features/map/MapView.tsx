import React, { useEffect, useRef, useState } from 'react';
import L from 'leaflet';
import 'leaflet/dist/leaflet.css';
import { ApiClient } from '../../services/api';
import { MapPin, Image as ImageIcon, Loader2 } from 'lucide-react';
import { MediaDetailModal } from '../library/MediaDetailModal';

// Fix default marker icon issues in Vite/bundlers
delete (L.Icon.Default.prototype as any)._getIconUrl;
L.Icon.Default.mergeOptions({
  iconRetinaUrl: 'https://cdnjs.cloudflare.com/ajax/libs/leaflet/1.9.4/images/marker-icon-2x.png',
  iconUrl: 'https://cdnjs.cloudflare.com/ajax/libs/leaflet/1.9.4/images/marker-icon.png',
  shadowUrl: 'https://cdnjs.cloudflare.com/ajax/libs/leaflet/1.9.4/images/marker-shadow.png',
});

interface MapMediaItem {
  id: string;
  latitude: number;
  longitude: number;
  primary_filename?: string;
  captured_at?: string;
  has_thumbnail: boolean;
  media_type: string;
}

export const MapView: React.FC = () => {
  const mapContainerRef = useRef<HTMLDivElement | null>(null);
  const mapInstanceRef = useRef<L.Map | null>(null);
  const [mapMedia, setMapMedia] = useState<MapMediaItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [selectedMediaId, setSelectedMediaId] = useState<string | null>(null);

  // Expose function to window so popup onclick can call it
  useEffect(() => {
    (window as any).__openMediaDetail = (id: string) => {
      setSelectedMediaId(id);
    };
    return () => {
      delete (window as any).__openMediaDetail;
    };
  }, []);

  useEffect(() => {
    const fetchGeotaggedMedia = async () => {
      try {
        setLoading(true);
        setError(null);
        const items = await ApiClient.getMapMedia();
        setMapMedia(items);
      } catch (err) {
        setError((err as Error).message || 'Errore nel caricamento dei media geolocalizzati');
      } finally {
        setLoading(false);
      }
    };
    fetchGeotaggedMedia();
  }, []);

  // Initialize and update Leaflet map
  useEffect(() => {
    if (!mapContainerRef.current) return;

    if (!mapInstanceRef.current) {
      const map = L.map(mapContainerRef.current, {
        center: [41.9028, 12.4964], // Default Italy / Rome
        zoom: 5,
        zoomControl: true,
      });

      // CartoDB Voyager tile layer (clean, dark/modern friendly)
      L.tileLayer('https://{s}.basemaps.cartocdn.com/rastertiles/voyager/{z}/{x}/{y}{r}.png', {
        attribution: '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors &copy; <a href="https://carto.com/attributions">CARTO</a>',
        maxZoom: 19,
      }).addTo(map);

      mapInstanceRef.current = map;
    }

    const map = mapInstanceRef.current;
    // Clear previous markers
    map.eachLayer((layer) => {
      if (layer instanceof L.Marker) {
        map.removeLayer(layer);
      }
    });

    if (mapMedia.length > 0) {
      const bounds = L.latLngBounds([]);

      mapMedia.forEach((item) => {
        const latLng: [number, number] = [item.latitude, item.longitude];
        bounds.extend(latLng);

        const thumbUrl = item.has_thumbnail ? ApiClient.getThumbnailUrl(item.id) : null;
        const formattedDate = item.captured_at
          ? new Date(item.captured_at).toLocaleDateString()
          : 'Data sconosciuta';

        const popupContent = `
          <div style="min-width: 160px; max-width: 200px; font-family: system-ui, sans-serif; text-align: center;">
            ${
              thumbUrl
                ? `<img src="${thumbUrl}" alt="Media" style="width: 100%; height: 110px; object-fit: cover; border-radius: 6px; margin-bottom: 6px;" />`
                : `<div style="height: 80px; background: #334155; border-radius: 6px; display: flex; align-items: center; justify-content: center; color: #94a3b8; font-size: 11px; margin-bottom: 6px;">Nessuna miniatura</div>`
            }
            <div style="font-size: 12px; font-weight: 600; color: #0f172a; white-space: nowrap; overflow: hidden; text-overflow: ellipsis;">
              ${item.primary_filename || 'Media'}
            </div>
            <div style="font-size: 11px; color: #64748b; margin-top: 2px;">
              ${formattedDate}
            </div>
            <button
              onclick="window.__openMediaDetail('${item.id}')"
              style="margin-top: 8px; width: 100%; background: #0284c7; color: white; border: none; border-radius: 4px; padding: 5px 8px; font-size: 11px; font-weight: 600; cursor: pointer;"
            >
              Apri Dettaglio
            </button>
          </div>
        `;

        const marker = L.marker(latLng).addTo(map);
        marker.bindPopup(popupContent, { maxWidth: 220 });
      });

      map.fitBounds(bounds, { padding: [40, 40], maxZoom: 14 });
    }

    return () => {
      // Map cleanup if needed on unmount
    };
  }, [mapMedia]);

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '16px', height: 'calc(100vh - 120px)' }}>
      {/* Header Info */}
      <div style={{
        background: '#1e293b',
        border: '1px solid #334155',
        borderRadius: '12px',
        padding: '16px 20px',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'space-between',
        flexWrap: 'wrap',
        gap: '12px'
      }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
          <div style={{
            background: 'rgba(56, 189, 248, 0.1)',
            padding: '8px',
            borderRadius: '8px',
            color: '#38bdf8'
          }}>
            <MapPin size={24} />
          </div>
          <div>
            <h2 style={{ fontSize: '18px', fontWeight: 600, color: '#f8fafc', margin: 0 }}>
              Mappa GPS & Geolocalizzazione
            </h2>
            <p style={{ fontSize: '13px', color: '#94a3b8', margin: '2px 0 0' }}>
              Visualizza la posizione geografica dei tuoi scatti dai metadati EXIF originali
            </p>
          </div>
        </div>

        <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
          <span style={{
            background: 'rgba(34, 197, 94, 0.15)',
            color: '#22c55e',
            border: '1px solid rgba(34, 197, 94, 0.3)',
            borderRadius: '20px',
            padding: '4px 12px',
            fontSize: '12px',
            fontWeight: 600,
            display: 'flex',
            alignItems: 'center',
            gap: '6px'
          }}>
            <ImageIcon size={14} />
            {mapMedia.length} Media Geolocalizzati
          </span>
        </div>
      </div>

      {/* Map Container */}
      <div style={{
        flex: 1,
        background: '#1e293b',
        border: '1px solid #334155',
        borderRadius: '12px',
        overflow: 'hidden',
        position: 'relative',
        minHeight: '400px'
      }}>
        {loading && (
          <div style={{
            position: 'absolute',
            inset: 0,
            background: 'rgba(15, 23, 42, 0.75)',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            zIndex: 1000,
            color: '#38bdf8',
            fontSize: '14px',
            gap: '8px'
          }}>
            <Loader2 className="animate-spin" size={20} />
            Caricamento coordinate sulla mappa...
          </div>
        )}

        {error && (
          <div style={{
            position: 'absolute',
            top: '20px',
            left: '20px',
            right: '20px',
            background: 'rgba(244, 63, 94, 0.9)',
            color: 'white',
            padding: '12px',
            borderRadius: '8px',
            zIndex: 1000,
            fontSize: '13px'
          }}>
            {error}
          </div>
        )}

        <div ref={mapContainerRef} style={{ width: '100%', height: '100%' }} />
      </div>

      {/* Media Detail Modal */}
      <MediaDetailModal
        mediaId={selectedMediaId}
        onClose={() => setSelectedMediaId(null)}
      />
    </div>
  );
};
