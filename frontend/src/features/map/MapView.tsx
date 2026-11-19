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
  place_name?: string;
}

function escapeHtml(str: string): string {
  if (!str) return '';
  return str
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

interface Cluster {
  lat: number;
  lng: number;
  items: MapMediaItem[];
}

function clusterMapPoints(items: MapMediaItem[], map: L.Map, cellSizePx = 56): Cluster[] {
  const grid: Record<string, Cluster> = {};

  for (const item of items) {
    const pt = map.latLngToLayerPoint([item.latitude, item.longitude]);
    const cx = Math.floor(pt.x / cellSizePx);
    const cy = Math.floor(pt.y / cellSizePx);
    const key = `${cx}:${cy}`;

    if (!grid[key]) {
      grid[key] = {
        lat: item.latitude,
        lng: item.longitude,
        items: [item]
      };
    } else {
      const c = grid[key];
      c.items.push(item);
      const n = c.items.length;
      c.lat = (c.lat * (n - 1) + item.latitude) / n;
      c.lng = (c.lng * (n - 1) + item.longitude) / n;
    }
  }

  return Object.values(grid);
}

interface MapViewProps {
  onNavigateToLocation?: (lat: number, lon: number, radiusKm?: number) => void;
}

export const MapView: React.FC<MapViewProps> = ({ onNavigateToLocation }) => {
  const mapContainerRef = useRef<HTMLDivElement | null>(null);
  const mapInstanceRef = useRef<L.Map | null>(null);
  const markersLayerRef = useRef<L.LayerGroup | null>(null);
  const [mapMedia, setMapMedia] = useState<MapMediaItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [selectedMediaId, setSelectedMediaId] = useState<string | null>(null);

  // Expose functions to window so popup onclick can call them
  useEffect(() => {
    (window as any).__openMediaDetail = (id: string) => {
      setSelectedMediaId(id);
    };
    (window as any).__viewPhotosAtLocation = (lat: number, lon: number) => {
      if (onNavigateToLocation) {
        onNavigateToLocation(lat, lon, 3); // 3 km radius default
      }
    };
    return () => {
      delete (window as any).__openMediaDetail;
      delete (window as any).__viewPhotosAtLocation;
    };
  }, [onNavigateToLocation]);

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

  // Initialize and update Leaflet map with zoom-aware spatial clustering
  useEffect(() => {
    if (!mapContainerRef.current) return;

    let map = mapInstanceRef.current;
    if (!map) {
      map = L.map(mapContainerRef.current, {
        center: [41.9028, 12.4964], // Default Italy / Rome
        zoom: 5,
        zoomControl: true,
      });

      L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
        attribution: '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors',
        maxZoom: 19,
      }).addTo(map);

      const markersGroup = L.layerGroup().addTo(map);
      markersLayerRef.current = markersGroup;
      mapInstanceRef.current = map;
    }

    const markersGroup = markersLayerRef.current;

    const renderClusters = () => {
      if (!map || !markersGroup) return;
      markersGroup.clearLayers();

      if (mapMedia.length === 0) return;

      const clusters = clusterMapPoints(mapMedia, map, 56);

      for (const cluster of clusters) {
        if (cluster.items.length > 1) {
          const firstThumb = cluster.items.find((i) => i.has_thumbnail);
          const thumbUrl = firstThumb ? ApiClient.getThumbnailUrl(firstThumb.id) : null;
          const count = cluster.items.length;

          const iconHtml = `
            <div style="
              width: 44px;
              height: 44px;
              border-radius: 50%;
              background: #0284c7;
              border: 3px solid white;
              box-shadow: 0 4px 10px rgba(0,0,0,0.35);
              display: flex;
              align-items: center;
              justify-content: center;
              color: white;
              font-weight: 700;
              font-size: 13px;
              font-family: system-ui, sans-serif;
              position: relative;
              overflow: hidden;
              cursor: pointer;
            ">
              ${thumbUrl ? `<img src="${thumbUrl}" style="position: absolute; inset: 0; width: 100%; height: 100%; object-fit: cover; opacity: 0.5;" />` : ''}
              <span style="position: relative; z-index: 2; text-shadow: 0 1px 3px rgba(0,0,0,0.85);">${count}</span>
            </div>
          `;
          const icon = L.divIcon({
            html: iconHtml,
            className: '',
            iconSize: [44, 44],
            iconAnchor: [22, 22]
          });
          const marker = L.marker([cluster.lat, cluster.lng], { icon });

          const placeStr = cluster.items[0].place_name ? `<div style="font-size: 11px; color: #0284c7; margin-bottom: 4px;">📍 ${escapeHtml(cluster.items[0].place_name)}</div>` : '';
          const clusterPopupHtml = `
            <div style="min-width: 170px; text-align: center; font-family: system-ui, sans-serif;">
              ${placeStr}
              <div style="font-size: 13px; font-weight: 700; color: #0f172a; margin-bottom: 6px;">
                ${cluster.items.length} Foto in quest'area
              </div>
              <button
                onclick="window.__viewPhotosAtLocation(${cluster.lat}, ${cluster.lng})"
                style="width: 100%; background: #0284c7; color: white; border: none; border-radius: 6px; padding: 6px 8px; font-size: 11px; font-weight: 600; cursor: pointer;"
              >
                Vedi tutte le foto qui
              </button>
            </div>
          `;
          marker.bindPopup(clusterPopupHtml, { maxWidth: 220 });
          marker.on('dblclick', () => {
            map?.setView([cluster.lat, cluster.lng], Math.min(map.getZoom() + 2, 18));
          });
          markersGroup.addLayer(marker);
        } else {
          const item = cluster.items[0];
          const thumbUrl = item.has_thumbnail ? ApiClient.getThumbnailUrl(item.id) : null;
          const iconHtml = `
            <div style="
              width: 36px;
              height: 36px;
              border-radius: 50%;
              background: #0f172a;
              border: 2px solid #38bdf8;
              box-shadow: 0 2px 8px rgba(0,0,0,0.3);
              overflow: hidden;
              cursor: pointer;
            ">
              ${thumbUrl ? `<img src="${thumbUrl}" style="width: 100%; height: 100%; object-fit: cover;" />` : `<div style="width: 100%; height: 100%; background: #0284c7; display: flex; align-items: center; justify-content: center; color: white; font-size: 11px;">📷</div>`}
            </div>
          `;
          const icon = L.divIcon({
            html: iconHtml,
            className: '',
            iconSize: [36, 36],
            iconAnchor: [18, 18]
          });
          const marker = L.marker([item.latitude, item.longitude], { icon });

          const safeFilename = escapeHtml(item.primary_filename || 'Media');
          const safeDate = item.captured_at ? new Date(item.captured_at).toLocaleDateString() : 'Data sconosciuta';
          const placeHtml = item.place_name ? `<div style="font-size: 11px; color: #0284c7; margin-bottom: 4px;">📍 ${escapeHtml(item.place_name)}</div>` : '';

          const popupContent = `
            <div style="min-width: 160px; max-width: 200px; font-family: system-ui, sans-serif; text-align: center;">
              ${placeHtml}
              ${
                thumbUrl
                  ? `<img src="${thumbUrl}" alt="Media" style="width: 100%; height: 110px; object-fit: cover; border-radius: 6px; margin-bottom: 6px;" />`
                  : `<div style="height: 80px; background: #334155; border-radius: 6px; display: flex; align-items: center; justify-content: center; color: #94a3b8; font-size: 11px; margin-bottom: 6px;">Nessuna miniatura</div>`
              }
              <div style="font-size: 12px; font-weight: 600; color: #0f172a; white-space: nowrap; overflow: hidden; text-overflow: ellipsis;">
                ${safeFilename}
              </div>
              <div style="font-size: 11px; color: #64748b; margin-top: 2px;">
                ${safeDate}
              </div>
              <div style="display: flex; gap: 6px; margin-top: 8px;">
                <button
                  onclick="window.__openMediaDetail('${item.id}')"
                  style="flex: 1; background: #334155; color: white; border: none; border-radius: 4px; padding: 5px 6px; font-size: 11px; font-weight: 600; cursor: pointer;"
                >
                  Dettaglio
                </button>
                <button
                  onclick="window.__viewPhotosAtLocation(${item.latitude}, ${item.longitude})"
                  style="flex: 1; background: #0284c7; color: white; border: none; border-radius: 4px; padding: 5px 6px; font-size: 11px; font-weight: 600; cursor: pointer;"
                >
                  Tutte qui
                </button>
              </div>
            </div>
          `;
          marker.bindPopup(popupContent, { maxWidth: 240 });
          markersGroup.addLayer(marker);
        }
      }
    };

    if (mapMedia.length > 0) {
      const bounds = L.latLngBounds([]);
      mapMedia.forEach((item) => bounds.extend([item.latitude, item.longitude]));
      map.fitBounds(bounds, { padding: [40, 40], maxZoom: 14 });
    }

    renderClusters();
    map.on('zoomend', renderClusters);
    map.on('moveend', renderClusters);

    return () => {
      if (map) {
        map.off('zoomend', renderClusters);
        map.off('moveend', renderClusters);
        map.remove();
        mapInstanceRef.current = null;
        markersLayerRef.current = null;
      }
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
