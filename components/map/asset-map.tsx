// components/map/asset-map.tsx
'use client';

import React, { useEffect, useRef, useState } from 'react';
import 'leaflet/dist/leaflet.css';

interface AssetMapProps {
  devices?: any[];
  selectedDevice?: string | null;
}

export default function AssetMap({ devices = [], selectedDevice }: AssetMapProps) {
  const mapRef = useRef<any | null>(null);
  const mapContainerRef = useRef<HTMLDivElement | null>(null);
  const layerGroupRef = useRef<any | null>(null);
  const [, setTick] = useState(0);
  const [isClient, setIsClient] = useState(false);

  // Ensure this code only runs on the client browser
  useEffect(() => {
    setIsClient(true);
  }, []);

  // Force re-render every minute to keep the "X ago" text live and fresh
  useEffect(() => {
    const timer = setInterval(() => setTick((t) => t + 1), 60000);
    return () => clearInterval(timer);
  }, []);

  // Helper to normalize timestamps consistently to UTC
  const getNormalizedDate = (dateString: string) => {
    if (!dateString) return new Date(0);
    try {
      const normalizedString = dateString.endsWith('Z') || dateString.includes('+') 
        ? dateString 
        : dateString.replace(' ', 'T') + 'Z';
      return new Date(normalizedString);
    } catch (e) {
      return new Date(0);
    }
  };

  // Helper to calculate "X ago" time difference relative to now
  const getTimeAgo = (dateString: string) => {
    if (!dateString) return 'Unknown';
    try {
      const past = getNormalizedDate(dateString).getTime();
      const now = new Date().getTime();
      const diffMs = now - past;
      
      const diffMins = Math.floor(diffMs / (1000 * 60));
      const diffHours = Math.floor(diffMs / (1000 * 60 * 60));
      const diffDays = Math.floor(diffMs / (1000 * 60 * 60 * 24));

      if (diffMins < 1) return 'Just now';
      if (diffMins < 60) return `${diffMins}m ago`;
      if (diffHours < 24) return `${diffHours}h ago`;
      return `${diffDays}d ago`;
    } catch (e) {
      return 'Recent';
    }
  };

  // Helper to convert UTC timestamp string to GMT+8 (Malaysia Time) formatted string
  const formatToMalaysiaTime = (dateString: string) => {
    if (!dateString) return 'N/A';
    try {
      const date = getNormalizedDate(dateString);
      if (isNaN(date.getTime())) return dateString;

      return new Intl.DateTimeFormat('en-GB', {
        timeZone: 'Asia/Kuala_Lumpur',
        year: 'numeric',
        month: '2-digit',
        day: '2-digit',
        hour: '2-digit',
        minute: '2-digit',
        second: '2-digit',
        hour12: false,
      }).format(date) + ' (GMT+8)';
    } catch (e) {
      return dateString;
    }
  };

  // 1. Initialize the Leaflet map once on mount (Client-side only)
  useEffect(() => {
    if (!isClient || !mapContainerRef.current || mapRef.current) return;

    import('leaflet').then((L) => {
      if (!mapContainerRef.current || mapRef.current) return;

      const map = L.map(mapContainerRef.current, {
        center: [4.6097, 101.0758],
        zoom: 5,
        scrollWheelZoom: false,
      });

      L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
        maxZoom: 19,
        attribution: '&copy; OpenStreetMap contributors',
      }).addTo(map);

      const layerGroup = L.layerGroup().addTo(map);
      layerGroupRef.current = layerGroup;
      mapRef.current = map;

      setTimeout(() => {
        map.invalidateSize();
      }, 150);
    });

    return () => {
      if (mapRef.current) {
        mapRef.current.remove();
        mapRef.current = null;
      }
    };
  }, [isClient]);

  // 2. Render trail and numbered waypoints whenever devices or selectedDevice changes
  useEffect(() => {
    if (!isClient) return;
    const map = mapRef.current;
    const layerGroup = layerGroupRef.current;
    if (!map || !layerGroup) return;

    import('leaflet').then((L) => {
      layerGroup.clearLayers();

      if (!Array.isArray(devices) || devices.length === 0) return;

      const targetTerminal = selectedDevice || devices[0]?.terminal_id;

      const terminalLogs = devices
        .filter((item: any) => item.terminal_id === targetTerminal)
        .sort((a: any, b: any) => getNormalizedDate(a.recorded_at).getTime() - getNormalizedDate(b.recorded_at).getTime());

      if (terminalLogs.length === 0) return;

      const latLngs: [number, number][] = terminalLogs.map((log: any) => [
        parseFloat(log.latitude),
        parseFloat(log.longitude),
      ]);

      const dashedPolyline = L.polyline(latLngs, {
        color: '#2563eb',
        weight: 4,
        opacity: 0.7,
        dashArray: '1, 12',
        lineCap: 'round',
      });
      layerGroup.addLayer(dashedPolyline);

      terminalLogs.forEach((log: any, index: number) => {
        const lat = parseFloat(log.latitude);
        const lng = parseFloat(log.longitude);
        const isLatest = index === terminalLogs.length - 1;
        const waypointNumber = index + 1;
        const convertedTime = formatToMalaysiaTime(log.recorded_at);
        const timeAgo = getTimeAgo(log.recorded_at);

        const customIcon = L.divIcon({
          className: 'custom-waypoint-badge',
          html: `
            <div style="
              background-color: ${isLatest ? '#16a34a' : '#2563eb'};
              color: white;
              width: 28px;
              height: 28px;
              border-radius: 50%;
              display: flex;
              align-items: center;
              justify-content: center;
              font-weight: bold;
              font-size: 12px;
              box-shadow: 0 3px 6px rgba(0,0,0,0.3);
              border: 2px solid white;
            ">
              ${waypointNumber}
            </div>
          `,
          iconSize: [28, 28],
          iconAnchor: [14, 14],
        });

        const marker = L.marker([lat, lng], { icon: customIcon }).bindPopup(
          `<div style="font-size: 12px; line-height: 1.4;">
             <b>Waypoint #${waypointNumber} ${isLatest ? '(Latest)' : ''}</b><br />
             Terminal: ${log.terminal_id}<br />
             Address: ${log.address || 'N/A'}<br />
             Time (GMT+8): ${convertedTime} (${timeAgo})
           </div>`
        );

        layerGroup.addLayer(marker);

        if (isLatest) {
          marker.openPopup();
        }
      });

      if (latLngs.length > 0) {
        map.fitBounds(dashedPolyline.getBounds(), { padding: [50, 50] });
      }
    });
  }, [devices, selectedDevice, isClient]);

  const targetTerminal = selectedDevice || (devices.length > 0 ? devices[0]?.terminal_id : null);
  const terminalLogs = devices.filter((item: any) => item.terminal_id === targetTerminal);
  const latestLog = terminalLogs.length > 0 ? terminalLogs[terminalLogs.length - 1] : null;

  return (
    <div className="space-y-4">
      <div 
        ref={mapContainerRef} 
        className="w-full rounded-xl overflow-hidden shadow-sm border border-border z-0" 
        style={{ height: '450px', minHeight: '400px' }} 
      />

      {!latestLog ? (
        <div className="text-xs bg-destructive/10 text-destructive p-3 rounded-lg border border-destructive/20">
          No waypoints found. Select a device from the sidebar or wait for incoming packets.
        </div>
      ) : (
        <div className="text-xs text-muted-foreground bg-muted p-3.5 rounded-lg space-y-2 border border-border">
          <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-1 border-b border-border/60 pb-2">
            <div>
              Active Terminal: <span className="font-bold text-foreground">{targetTerminal}</span>
            </div>
            <div>
              Total Waypoints: <span className="font-bold text-foreground">{terminalLogs.length}</span>
            </div>
          </div>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-2 pt-1 font-mono">
            <div>
              <span className="text-muted-foreground/80">Latest Coordinates:</span>{' '}
              <span className="font-bold text-foreground">{latestLog.latitude}, {latestLog.longitude}</span>
            </div>
            <div>
              <span className="text-muted-foreground/80">Last Updated (GMT+8):</span>{' '}
              <span className="font-bold text-foreground">
                {formatToMalaysiaTime(latestLog.recorded_at)} <span className="text-muted-foreground font-normal">({getTimeAgo(latestLog.recorded_at)})</span>
              </span>
            </div>
          </div>
          <div className="truncate pt-1 border-t border-border/60">
            <span className="text-muted-foreground/80">Last Address:</span>{' '}
            <span className="font-bold text-foreground">{latestLog.address || 'N/A'}</span>
          </div>
        </div>
      )}
    </div>
  );
}