'use client';

import React, { useEffect, useRef, useState } from 'react';
import 'leaflet/dist/leaflet.css';
import L from 'leaflet';

export default function AssetMap() {
  const mapRef = useRef<L.Map | null>(null);
  const mapContainerRef = useRef<HTMLDivElement | null>(null);
  const markerRef = useRef<L.Marker | null>(null);
  const [deviceData, setDeviceData] = useState<any>(null);

  // 1. Initialize the Leaflet map once on mount
  useEffect(() => {
    if (!mapContainerRef.current || mapRef.current) return;

    // Fix marker icons
    // @ts-ignore
    delete L.Icon.Default.prototype._getIconUrl;
    L.Icon.Default.mergeOptions({
      iconRetinaUrl: 'https://unpkg.com/leaflet@1.9.4/dist/images/marker-icon-2x.png',
      iconUrl: 'https://unpkg.com/leaflet@1.9.4/dist/images/marker-icon.png',
      shadowUrl: 'https://unpkg.com/leaflet@1.9.4/dist/images/marker-shadow.png',
    });

    const map = L.map(mapContainerRef.current, {
      center: [4.6097, 101.0758],
      zoom: 13,
      scrollWheelZoom: false,
    });

    L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
      maxZoom: 19,
      attribution: '&copy; OpenStreetMap contributors',
    }).addTo(map);

    mapRef.current = map;

    // Force tile recalculation after mount
    setTimeout(() => {
      map.invalidateSize();
    }, 150);

    return () => {
      map.remove();
      mapRef.current = null;
    };
  }, []);

  useEffect(() => {
    fetch('/api/webhook/myriota')
      .then((res) => res.json())
      .then((data) => {
        setDeviceData(data);
        const map = mapRef.current;
        if (!map) return;

        const hasLoc = data?.has_location && data.latitude && data.longitude;
        const pos: [number, number] = hasLoc ? [data.latitude, data.longitude] : [4.6097, 101.0758];

        if (markerRef.current) {
          markerRef.current.remove();
        }

        map.setView(pos, hasLoc ? 14 : 13);

        if (hasLoc) {
          markerRef.current = L.marker(pos)
            .addTo(map)
            .bindPopup(`<b>AssetHawk Tracker</b><br />ID: ${data.terminal_id}<br />Lat, Lng: ${data.latitude}, ${data.longitude}`)
            .openPopup();
        } else {
          markerRef.current = L.marker(pos)
            .addTo(map)
            .bindPopup(`<b>No Coordinate Received</b><br />Waiting for satellite packet...`)
            .openPopup();
        }
      })
      .catch((err) => console.error('Failed to load data:', err));
  }, []);

  return (
    <div className="space-y-4">
      <div 
        ref={mapContainerRef} 
        className="w-full rounded-xl overflow-hidden shadow-sm border border-border z-0" 
        style={{ height: '500px', minHeight: '500px' }} 
      />

      {deviceData && !deviceData.has_location ? (
        <div className="text-sm font-medium bg-destructive/10 text-destructive p-3 rounded-lg border border-destructive/20">
          ⚠️ No Coordinate Received — Waiting for first satellite packet from Terminal: <span className="font-bold">{deviceData.terminal_id}</span>
        </div>
      ) : deviceData && (
        <div className="text-sm text-muted-foreground bg-muted p-3 rounded-lg">
          Latest Packet — Terminal: <span className="font-semibold text-foreground">{deviceData.terminal_id}</span> | 
          Lat: <span className="font-semibold text-foreground">{deviceData.latitude}</span> | 
          Lng: <span className="font-semibold text-foreground">{deviceData.longitude}</span>
        </div>
      )}
    </div>
  );
}