// components/map/asset-map.tsx
'use client';

import React, { useEffect, useRef, useState } from 'react';
import 'leaflet/dist/leaflet.css';
import { FontAwesomeIcon } from '@fortawesome/react-fontawesome';
import { faBatteryFull, faBatteryThreeQuarters, faBatteryHalf, faBatteryEmpty } from '@fortawesome/free-solid-svg-icons';

interface AssetMapProps {
  devices?: any[];
  selectedDevice?: string | null;
  registeredDevices?: any[];
}

const WAYPOINT_COLORS = [
  '#3b82f6', // 1: Blue
  '#6366f1', // 2: Indigo
  '#8b5cf6', // 3: Purple
  '#ec4899', // 4: Pink
  '#f97316', // 5: Orange
];

export default function AssetMap({ devices = [], selectedDevice, registeredDevices = [] }: AssetMapProps) {
  const mapRef = useRef<any | null>(null);
  const mapContainerRef = useRef<HTMLDivElement | null>(null);
  const layerGroupRef = useRef<any | null>(null);
  const markersRef = useRef<{ [key: number]: any }>({});
  const [, setTick] = useState(0);
  const [isClient, setIsClient] = useState(false);

  useEffect(() => {
    setIsClient(true);
  }, []);

  useEffect(() => {
    const timer = setInterval(() => setTick((t) => t + 1), 60000);
    return () => clearInterval(timer);
  }, []);

  const getDeviceName = (terminalId: string) => {
    const found = registeredDevices.find(d => String(d.terminal_id).trim() === String(terminalId).trim());
    return found ? found.device_name : terminalId;
  };

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

  const formatToMalaysiaTime = (log: any) => {
    if (log.timestamp_my) {
      return `${log.timestamp_my} (GMT+8)`;
    }
    if (!log.recorded_at) return 'N/A';
    try {
      const date = getNormalizedDate(log.recorded_at);
      if (isNaN(date.getTime())) return log.recorded_at;

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
      return log.recorded_at;
    }
  };

  const getBatteryStats = (voltageVal: any) => {
    const voltage = voltageVal !== null && voltageVal !== undefined ? parseFloat(voltageVal) : NaN;
    if (isNaN(voltage) || voltage <= 0) {
      return { percent: 0, text: 'N/A', color: 'text-muted-foreground', icon: faBatteryEmpty };
    }

    // 2x AA Energizer Ultimate Lithium: Min ~2.0V, Max ~3.4V
    const minV = 2.0; 
    const maxV = 3.4; 
    const rawPct = ((voltage - minV) / (maxV - minV)) * 100;
    const percent = Math.max(0, Math.min(100, Math.round(rawPct)));

    let icon = faBatteryFull;
    let color = 'text-emerald-500';

    if (percent <= 20) {
      icon = faBatteryEmpty;
      color = 'text-destructive';
    } else if (percent <= 50) {
      icon = faBatteryHalf;
      color = 'text-amber-500';
    } else if (percent <= 80) {
      icon = faBatteryThreeQuarters;
      color = 'text-emerald-500';
    }

    return { percent, text: `${percent}% (${voltage.toFixed(2)}V)`, color, icon };
  };

  useEffect(() => {
    if (!isClient || !mapContainerRef.current || mapRef.current) return;

    import('leaflet').then((L) => {
      if (!mapContainerRef.current || mapRef.current) return;

      const map = L.map(mapContainerRef.current, {
        center: [3.1390, 101.6869],
        zoom: 6,
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

  useEffect(() => {
    if (!isClient) return;
    const map = mapRef.current;
    const layerGroup = layerGroupRef.current;
    if (!map || !layerGroup) return;

    import('leaflet').then((L) => {
      layerGroup.clearLayers();
      markersRef.current = {};

      if (!Array.isArray(devices) || devices.length === 0) return;

      const targetTerminal = selectedDevice || devices[0]?.terminal_id;

      // Filter and sort oldest to newest for chronological plotting
      const terminalLogs = devices
        .filter((item: any) => String(item.terminal_id).trim() === String(targetTerminal).trim())
        .sort((a: any, b: any) => getNormalizedDate(a.recorded_at || a.timestamp_my).getTime() - getNormalizedDate(b.recorded_at || b.timestamp_my).getTime());

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
        
        const markerColor = isLatest ? '#16a34a' : WAYPOINT_COLORS[index % WAYPOINT_COLORS.length];
        const deviceName = getDeviceName(log.terminal_id);

        const convertedTime = formatToMalaysiaTime(log);
        const timeAgo = getTimeAgo(log.recorded_at || log.timestamp_my);
        const batteryInfo = getBatteryStats(log.battery_voltage);

        const customIcon = L.divIcon({
          className: 'custom-waypoint-badge',
          html: `
            <div style="
              background-color: ${markerColor};
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
             Device Name: <b>${deviceName}</b><br />
             Battery: <b>${batteryInfo.text}</b><br />
             Address: ${log.address || 'N/A'}<br />
             Time: ${convertedTime} (${timeAgo})
           </div>`
        );

        layerGroup.addLayer(marker);
        markersRef.current[waypointNumber] = marker;

        if (isLatest) {
          marker.openPopup();
        }
      });

      if (latLngs.length > 0) {
        map.fitBounds(dashedPolyline.getBounds(), { padding: [50, 50] });
      }
    });
  }, [devices, selectedDevice, registeredDevices, isClient]);

  const targetTerminal = selectedDevice || (devices.length > 0 ? devices[0]?.terminal_id : null);
  
  const terminalLogs = devices
    .filter((item: any) => String(item.terminal_id).trim() === String(targetTerminal).trim())
    .sort((a: any, b: any) => getNormalizedDate(a.recorded_at || a.timestamp_my).getTime() - getNormalizedDate(b.recorded_at || b.timestamp_my).getTime());
  
  // Latest log is strictly the last item in the chronological array
  const latestLog = terminalLogs.length > 0 ? terminalLogs[terminalLogs.length - 1] : null;
  const latestBattery = getBatteryStats(latestLog?.battery_voltage);
  const activeDeviceName = targetTerminal ? getDeviceName(targetTerminal) : 'N/A';

  const handleZoomToWaypoint = (waypointNum: number, lat: number, lng: number) => {
    const map = mapRef.current;
    if (!map) return;

    map.setView([lat, lng], 17, { animate: true });

    const marker = markersRef.current[waypointNum];
    if (marker) {
      marker.openPopup();
    }
  };

  return (
    <div className="space-y-4">
      {/* Flowchart Waypoint Template Bar: (1) ---- (2) ---- (3) */}
      <div className="bg-card border border-border p-3 rounded-xl shadow-xs space-y-2">
        <div className="flex items-center justify-between text-xs font-semibold text-muted-foreground px-1">
          <span>Waypoint Flowchart Sequence (Click to Focus):</span>
          <span className="font-mono">{terminalLogs.length} Waypoints</span>
        </div>
        
        <div className="flex items-center overflow-x-auto py-2 px-1 gap-1 no-scrollbar">
          {terminalLogs.map((log: any, idx: number) => {
            const isLast = idx === terminalLogs.length - 1;
            const color = isLast ? '#16a34a' : WAYPOINT_COLORS[idx % WAYPOINT_COLORS.length];
            const waypointNum = idx + 1;

            return (
              <React.Fragment key={idx}>
                {idx > 0 && (
                  <div className="flex items-center text-muted-foreground/40 font-mono px-1 select-none">
                    ----
                  </div>
                )}
                <button
                  onClick={() => handleZoomToWaypoint(waypointNum, parseFloat(log.latitude), parseFloat(log.longitude))}
                  className="group flex items-center gap-2 bg-background hover:bg-muted/80 border border-border px-3 py-1.5 rounded-lg transition-all cursor-pointer shadow-2xs shrink-0"
                  title={`Focus on Waypoint #${waypointNum}`}
                >
                  <span 
                    className="h-5 w-5 rounded-full text-white flex items-center justify-center font-bold text-[10px] shadow-xs"
                    style={{ backgroundColor: color }}
                  >
                    {waypointNum}
                  </span>
                  <div className="text-left font-mono">
                    <div className="text-[11px] font-bold text-foreground group-hover:text-primary transition-colors">
                      ({waypointNum}) {isLast ? 'Latest' : `Step ${waypointNum}`}
                    </div>
                    <div className="text-[9px] text-muted-foreground">
                      {getTimeAgo(log.recorded_at || log.timestamp_my)}
                    </div>
                  </div>
                </button>
              </React.Fragment>
            );
          })}
        </div>
      </div>

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
        <div className="text-xs text-muted-foreground bg-muted p-3.5 rounded-lg space-y-2 border border-border relative">
          {/* iPhone-style Battery Indicator at Top Right Corner */}
          <div className="absolute top-3.5 right-4 flex items-center gap-1.5 bg-background/80 backdrop-blur px-2.5 py-1 rounded-full border border-border shadow-xs font-mono">
            <FontAwesomeIcon icon={latestBattery.icon} className={`h-3.5 w-3.5 ${latestBattery.color}`} />
            <span className="font-bold text-foreground">{latestBattery.percent}%</span>
            <span className="text-[10px] text-muted-foreground">({latestLog.battery_voltage ? `${Number(latestLog.battery_voltage).toFixed(2)}V` : 'N/A'})</span>
          </div>

          <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-1 border-b border-border/60 pb-2 pr-40">
            <div>
              Device Name: <span className="font-bold text-foreground">{activeDeviceName}</span>
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
              <span className="text-muted-foreground/80">Last Updated (MYT):</span>{' '}
              <span className="font-bold text-foreground">
                {formatToMalaysiaTime(latestLog)} <span className="text-muted-foreground font-normal">({getTimeAgo(latestLog.recorded_at || latestLog.timestamp_my)})</span>
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