'use client';

import React, { useEffect, useRef, useState } from 'react';
import 'leaflet/dist/leaflet.css';
import L from 'leaflet';

export default function AssetMap() {
  const mapRef = useRef<L.Map | null>(null);
  const mapContainerRef = useRef<HTMLDivElement | null>(null);
  const layerGroupRef = useRef<L.LayerGroup | null>(null);
  const [logs, setLogs] = useState<any[]>([]);

  // 1. Initialize the Leaflet map once on mount
  useEffect(() => {
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

    return () => {
      map.remove();
      mapRef.current = null;
    };
  }, []);

  // 2. Fetch logs and render custom dashed trail + numbered waypoint badges
  useEffect(() => {
    fetch('/api/webhook/myriota')
      .then((res) => res.json())
      .then((data) => {
        if (!Array.isArray(data)) return;

        // Filter logs for target terminal ID and sort oldest to newest
        const targetTerminal = '89883380001010346667';
        const terminalLogs = data
          .filter((item: any) => item.terminal_id === targetTerminal)
          .sort((a: any, b: any) => new Date(a.recorded_at).getTime() - new Date(b.recorded_at).getTime());

        setLogs(terminalLogs);

        const map = mapRef.current;
        const layerGroup = layerGroupRef.current;
        if (!map || !layerGroup) return;

        // Clear previous layers
        layerGroup.clearLayers();

        if (terminalLogs.length === 0) return;

        // Extract coordinates for the polyline trail
        const latLngs: [number, number][] = terminalLogs.map((log: any) => [
          parseFloat(log.latitude),
          parseFloat(log.longitude),
        ]);

        // Draw dashed trail line (dot dot dot effect with 70% opacity)
        const dashedPolyline = L.polyline(latLngs, {
          color: '#2563eb', // Blue-600
          weight: 4,
          opacity: 0.7,     // 70% opacity
          dashArray: '1, 12', // Creates the dot-dot-dot pattern (1px stroke, 12px gap)
          lineCap: 'round',
        });
        layerGroup.addLayer(dashedPolyline);

        // Add custom numbered badge icons for each waypoint
        terminalLogs.forEach((log: any, index: number) => {
          const lat = parseFloat(log.latitude);
          const lng = parseFloat(log.longitude);
          const isLatest = index === terminalLogs.length - 1;
          const waypointNumber = index + 1;

          // Create custom HTML badge element (1) -> (2) -> (3)
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
            `<b>Waypoint #${waypointNumber} ${isLatest ? '(Latest)' : ''}</b><br />
             ID: ${log.terminal_id}<br />
             Address: ${log.address || 'N/A'}<br />
             Time: ${log.recorded_at}`
          );

          layerGroup.addLayer(marker);

          if (isLatest) {
            marker.openPopup();
          }
        });

        // Fit bounds to show all waypoints
        map.fitBounds(dashedPolyline.getBounds(), { padding: [50, 50] });
      })
      .catch((err) => console.error('Failed to load waypoint history:', err));
  }, []);

  const latestLog = logs.length > 0 ? logs[logs.length - 1] : null;

  return (
    <div className="space-y-4">
      <div 
        ref={mapContainerRef} 
        className="w-full rounded-xl overflow-hidden shadow-sm border border-border z-0" 
        style={{ height: '500px', minHeight: '500px' }} 
      />

      {!latestLog ? (
        <div className="text-sm font-medium bg-destructive/10 text-destructive p-3 rounded-lg border border-destructive/20">
          ⚠️ No Waypoints Found — Waiting for satellite packets from terminal: 89883380001010346667
        </div>
      ) : (
        <div className="text-sm text-muted-foreground bg-muted p-3 rounded-lg space-y-1">
          <div>
            Route Active — Total Waypoints: <span className="font-semibold text-foreground">{logs.length}</span> | 
            Latest Lat: <span className="font-semibold text-foreground">{latestLog.latitude}</span> | 
            Lng: <span className="font-semibold text-foreground">{latestLog.longitude}</span>
          </div>
          <div className="text-xs text-muted-foreground truncate">
            📍 Latest Address: <span className="font-medium text-foreground">{latestLog.address}</span>
          </div>
        </div>
      )}
    </div>
  );
}