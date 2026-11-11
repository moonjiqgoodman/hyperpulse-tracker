'use client';

import React, { useEffect, useRef, useState } from 'react';
import 'leaflet/dist/leaflet.css';
import { FontAwesomeIcon } from '@fortawesome/react-fontawesome';
import { faBatteryFull, faBatteryThreeQuarters, faBatteryHalf, faBatteryEmpty, faFileExcel, faTrashCan, faTriangleExclamation, faCrosshairs, faMountain, faTemperatureHigh, faTemperatureLow } from '@fortawesome/free-solid-svg-icons';

interface AssetMapProps {
  devices?: any[];
  selectedDevice?: string | null;
  registeredDevices?: any[];
  onDataReset?: () => void;
}

const WAYPOINT_COLORS = [
  '#3b82f6',
  '#6366f1',
  '#8b5cf6', 
  '#ec4899', 
  '#f97316', 
];

export default function AssetMap({ devices = [], selectedDevice, registeredDevices = [], onDataReset }: AssetMapProps) {
  const mapRef = useRef<any | null>(null);
  const mapContainerRef = useRef<HTMLDivElement | null>(null);
  const layerGroupRef = useRef<any | null>(null);
  const markersRef = useRef<{ [key: number]: any }>({});
  const polylineRef = useRef<any | null>(null);
  const hasFittedBoundsRef = useRef(false);
  const prevSelectedDeviceRef = useRef(selectedDevice);

  const [, setTick] = useState(0);
  const [isClient, setIsClient] = useState(false);

  const [isResetModalOpen, setIsResetModalOpen] = useState(false);
  const [confirmInput, setConfirmInput] = useState('');
  const [isDeleting, setIsDeleting] = useState(false);

  useEffect(() => {
    setIsClient(true);
  }, []);

  useEffect(() => {
    const timer = setInterval(() => setTick((t) => t + 1), 60000);
    return () => clearInterval(timer);
  }, []);

  if (prevSelectedDeviceRef.current !== selectedDevice) {
    prevSelectedDeviceRef.current = selectedDevice;
    hasFittedBoundsRef.current = false;
  }

  const getDeviceName = (terminalId: string) => {
    const found = registeredDevices.find(d => String(d.terminal_id).trim() === String(terminalId).trim());
    return found ? found.device_name : terminalId;
  };

  const getNormalizedDate = (dateInput: any) => {
    if (!dateInput) return new Date(0);
    try {
      if (!isNaN(dateInput) && Number(dateInput) > 0) {
        const num = Number(dateInput);
        const ms = String(num).length === 10 ? num * 1000 : num;
        return new Date(ms);
      }

      const dateStr = String(dateInput);
      if (!dateStr.includes('+') && !dateStr.endsWith('Z')) {
        return new Date(dateStr.replace(' ', 'T') + '+08:00');
      }
      
      const normalizedString = dateStr.endsWith('Z') || dateStr.includes('+') 
        ? dateStr 
        : dateStr.replace(' ', 'T') + 'Z';
      return new Date(normalizedString);
    } catch (e) {
      return new Date(0);
    }
  };

  const getServerTimeAgo = (timestampMy: string) => {
    if (!timestampMy) return 'Unknown';
    try {
      const past = getNormalizedDate(timestampMy).getTime();
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

  const formatGpsTimeToMalaysia12Hour = (log: any) => {
    const rawTime = log.recorded_at;
    if (!rawTime) return 'N/A';
    try {
      const num = Number(rawTime);
      const ms = !isNaN(num) && num > 0 
        ? (String(num).length === 10 ? num * 1000 : num) 
        : getNormalizedDate(rawTime).getTime();

      if (isNaN(ms) || ms === 0) return String(rawTime);
      const date = new Date(ms);

      return new Intl.DateTimeFormat('en-GB', {
        timeZone: 'Asia/Kuala_Lumpur',
        year: 'numeric',
        month: '2-digit',
        day: '2-digit',
        hour: '2-digit',
        minute: '2-digit',
        second: '2-digit',
        hour12: true,
      }).format(date) + ' (GMT+8)';
    } catch (e) {
      return String(rawTime);
    }
  };

  const formatServerTimeToMalaysia12Hour = (log: any) => {
    const targetTime = log.timestamp_my;
    if (!targetTime) return 'N/A';
    try {
      const date = getNormalizedDate(targetTime);
      if (isNaN(date.getTime())) return targetTime;

      return new Intl.DateTimeFormat('en-GB', {
        timeZone: 'Asia/Kuala_Lumpur',
        year: 'numeric',
        month: '2-digit',
        day: '2-digit',
        hour: '2-digit',
        minute: '2-digit',
        second: '2-digit',
        hour12: true,
      }).format(date) + ' (GMT+8)';
    } catch (e) {
      return targetTime;
    }
  };

  const getBatteryStats = (voltageVal: any) => {
    const voltage = voltageVal !== null && voltageVal !== undefined ? parseFloat(voltageVal) : NaN;
    if (isNaN(voltage) || voltage <= 0) {
      return { percent: 0, text: 'N/A', color: 'text-muted-foreground', icon: faBatteryEmpty };
    }

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
        maxZoom: 22,
        scrollWheelZoom: true,
      });

      L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
        maxZoom: 22,
        maxNativeZoom: 19,
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

      const terminalLogs = devices
        .filter((item: any) => String(item.terminal_id).trim() === String(targetTerminal).trim())
        .sort((a: any, b: any) => getNormalizedDate(a.timestamp_my || a.recorded_at).getTime() - getNormalizedDate(b.timestamp_my || b.recorded_at).getTime());

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
      polylineRef.current = dashedPolyline;

      terminalLogs.forEach((log: any, index: number) => {
        const lat = parseFloat(log.latitude);
        const lng = parseFloat(log.longitude);
        const isLatest = index === terminalLogs.length - 1;
        const waypointNumber = index + 1;
        
        const markerColor = isLatest ? '#16a34a' : WAYPOINT_COLORS[index % WAYPOINT_COLORS.length];
        const deviceName = getDeviceName(log.terminal_id);

        const gpsTime = formatGpsTimeToMalaysia12Hour(log);
        const batteryInfo = getBatteryStats(log.battery_voltage);
        const elevationStr = log.elevation !== null && log.elevation !== undefined ? `${log.elevation} m` : 'N/A';
        const tempStr = log.temperature !== null && log.temperature !== undefined ? `${log.temperature} °C` : 'N/A';
        const latLngStr = `${lat.toFixed(6)}, ${lng.toFixed(6)}`;

        // Replaced "GPS Time:" label with "Last Seen:" displaying coordinates and AM/PM time
        const popupContent = `
          <div style="font-size: 12px; font-family: inherit; min-width: 250px;">
            <div style="font-weight: bold; font-size: 13px; margin-bottom: 6px; border-bottom: 1px solid #e5e7eb; padding-bottom: 4px;">
              Waypoint #${waypointNumber} ${isLatest ? '(Latest)' : ''}
            </div>
            <table style="width: 100%; border-collapse: collapse;">
              <tbody>
                <tr>
                  <td style="padding: 2px 0; color: #6b7280; width: 35%;">Device:</td>
                  <td style="padding: 2px 0; font-weight: 600;">${deviceName}</td>
                </tr>
                <tr>
                  <td style="padding: 2px 0; color: #6b7280;">Battery:</td>
                  <td style="padding: 2px 0; font-weight: 600;">${batteryInfo.text}</td>
                </tr>
                <tr>
                  <td style="padding: 2px 0; color: #6b7280;">Coordinates:</td>
                  <td style="padding: 2px 0; font-family: monospace; font-weight: 600;">${latLngStr}</td>
                </tr>
                <tr>
                  <td style="padding: 2px 0; color: #6b7280;">Elevation:</td>
                  <td style="padding: 2px 0; font-weight: 600;">${elevationStr}</td>
                </tr>
                <tr>
                  <td style="padding: 2px 0; color: #6b7280;">Temp:</td>
                  <td style="padding: 2px 0; font-weight: 600;">${tempStr}</td>
                </tr>
                <tr>
                  <td style="padding: 2px 0; color: #6b7280; vertical-align: top; font-weight: bold;">Address:</td>
                  <td style="padding: 2px 0; font-weight: bold; line-height: 1.3;">${log.address || 'N/A'}</td>
                </tr>
                <tr>
                  <td style="padding: 4px 0 2px 0; color: #6b7280; border-top: 1px solid #e5e7eb; font-weight: bold;">Last Seen:</td>
                  <td style="padding: 4px 0 2px 0; border-top: 1px solid #e5e7eb; font-weight: bold; color: #2563eb; font-family: monospace; font-size: 11px;">${latLngStr}, ${gpsTime}</td>
                </tr>
              </tbody>
            </table>
          </div>
        `;

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

        const marker = L.marker([lat, lng], { icon: customIcon }).bindPopup(popupContent);

        marker.on('click', () => {
          map.setView([lat, lng], Math.max(map.getZoom(), 19), { animate: true });
        });

        layerGroup.addLayer(marker);
        markersRef.current[waypointNumber] = marker;
      });

      if (latLngs.length > 0 && !hasFittedBoundsRef.current) {
        map.fitBounds(dashedPolyline.getBounds(), { padding: [50, 50] });
        hasFittedBoundsRef.current = true;
      }
    });
  }, [devices, selectedDevice, registeredDevices, isClient]);

  const targetTerminal = selectedDevice || (devices.length > 0 ? devices[0]?.terminal_id : null);
  
  const terminalLogs = devices
    .filter((item: any) => String(item.terminal_id).trim() === String(targetTerminal).trim())
    .sort((a: any, b: any) => getNormalizedDate(a.timestamp_my || a.recorded_at).getTime() - getNormalizedDate(b.timestamp_my || b.recorded_at).getTime());
  
  const latestLog = terminalLogs.length > 0 ? terminalLogs[terminalLogs.length - 1] : null;
  const latestBattery = getBatteryStats(latestLog?.battery_voltage);
  const activeDeviceName = targetTerminal ? getDeviceName(targetTerminal) : 'N/A';
  const expectedDeletePhrase = `DELETE DEVICE ${activeDeviceName}`;

  const latestElevation = latestLog?.elevation !== null && latestLog?.elevation !== undefined ? `${latestLog.elevation}m` : 'N/A';
  const latestTemp = latestLog?.temperature !== null && latestLog?.temperature !== undefined ? `${latestLog.temperature}°C` : 'N/A';
  const tempNum = latestLog?.temperature !== undefined ? Number(latestLog.temperature) : 0;
  const tempAnimClass = tempNum > 40 ? 'text-destructive font-bold animate-pulse' : tempNum > 30 ? 'text-amber-500 font-semibold' : 'text-blue-400';

  const handleZoomToWaypoint = (waypointNum: number, lat: number, lng: number) => {
    const map = mapRef.current;
    if (!map) return;

    map.setView([lat, lng], 20, { animate: true });

    const marker = markersRef.current[waypointNum];
    if (marker) {
      marker.openPopup();
    }
  };

  const handleResetMapView = () => {
    const map = mapRef.current;
    const polyline = polylineRef.current;
    if (map && polyline) {
      map.fitBounds(polyline.getBounds(), { padding: [50, 50], animate: true });
    }
  };

  const handleExportExcel = () => {
    if (!terminalLogs || terminalLogs.length === 0) return;

    const headers = [
      'Waypoint #', 
      'Device Name', 
      'Terminal ID', 
      'Latitude', 
      'Longitude', 
      'Elevation (m)', 
      'Temperature (°C)', 
      'Battery (%)', 
      'GPS Time (Transmit)', 
      'Received Time (Server)', 
      'Gap (Hours)', 
      'Address'
    ];
    
    const rows = terminalLogs.map((log: any, idx: number) => {
      const devName = getDeviceName(log.terminal_id);
      const lat = log.latitude;
      const lng = log.longitude;
      const elevation = log.elevation !== null && log.elevation !== undefined ? log.elevation : 'N/A';
      const temperature = log.temperature !== null && log.temperature !== undefined ? log.temperature : 'N/A';
      const batt = log.battery_voltage !== null && log.battery_voltage !== undefined ? `${getBatteryStats(log.battery_voltage).percent}%` : 'N/A';
      const gpsTime = formatGpsTimeToMalaysia12Hour(log);
      const receivedTime = formatServerTimeToMalaysia12Hour(log);

      let gapHours = 'N/A';
      try {
        const rawTransmit = log.recorded_at;
        const rawReceive = log.timestamp_my;
        if (rawTransmit && rawReceive) {
          const num = Number(rawTransmit);
          const transmitMs = !isNaN(num) && num > 0 ? (String(num).length === 10 ? num * 1000 : num) : getNormalizedDate(rawTransmit).getTime();
          const receiveMs = getNormalizedDate(rawReceive).getTime();

          if (!isNaN(transmitMs) && !isNaN(receiveMs) && transmitMs > 0 && receiveMs > 0) {
            const diffMs = receiveMs - transmitMs;
            gapHours = (diffMs / (1000 * 60 * 60)).toFixed(2);
          }
        }
      } catch (e) {
        gapHours = 'N/A';
      }

      const addr = `"${(log.address || '').replace(/"/g, '""')}"`;

      return [
        idx + 1, 
        `"${devName}"`, 
        `"${log.terminal_id}"`, 
        lat, 
        lng, 
        elevation, 
        temperature, 
        batt, 
        `"${gpsTime}"`, 
        `"${receivedTime}"`, 
        gapHours, 
        addr
      ].join(',');
    });

    const csvContent = [headers.join(','), ...rows].join('\n');
    const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    
    const link = document.createElement('a');
    link.setAttribute('href', url);
    link.setAttribute('download', `${activeDeviceName.replace(/[^a-zA-Z0-9]/g, '_')}_telemetry_history.csv`);
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
  };

  const handleConfirmReset = async () => {
    if (confirmInput !== expectedDeletePhrase || !targetTerminal) return;

    setIsDeleting(true);
    try {
      const res = await fetch(`/api/webhook/myriota?terminal_id=${encodeURIComponent(targetTerminal)}`, {
        method: 'DELETE',
      });
      if (res.ok) {
        setIsResetModalOpen(false);
        setConfirmInput('');
        if (onDataReset) onDataReset();
        window.location.reload();
      } else {
        alert('Failed to delete device data.');
      }
    } catch (err) {
      console.error('Reset error:', err);
      alert('An error occurred while deleting data.');
    } finally {
      setIsDeleting(false);
    }
  };

  return (
    <div className="space-y-4">
      <div className="bg-card border border-border p-3 rounded-xl shadow-xs space-y-2">
        <div className="flex items-center justify-between text-xs font-semibold text-muted-foreground px-1">
          <span>Waypoint:</span>
          <div className="flex items-center gap-2.5">
            <span className="font-mono">{terminalLogs.length} Waypoints</span>
            {terminalLogs.length > 0 && (
              <>
                <button
                  onClick={handleExportExcel}
                  className="flex items-center gap-1.5 bg-emerald-600 hover:bg-emerald-700 text-white px-2.5 py-1 rounded-md text-xs font-medium transition-colors shadow-xs cursor-pointer"
                  title="Export all data to Excel"
                >
                  <FontAwesomeIcon icon={faFileExcel} className="h-3.5 w-3.5" />
                  <span>Export</span>
                </button>
                <button
                  onClick={() => { setConfirmInput(''); setIsResetModalOpen(true); }}
                  className="flex items-center gap-1.5 bg-destructive hover:bg-destructive/90 text-white px-2.5 py-1 rounded-md text-xs font-medium transition-colors shadow-xs cursor-pointer"
                  title="Reset / Delete all telemetry data"
                >
                  <FontAwesomeIcon icon={faTrashCan} className="h-3.5 w-3.5" />
                  <span>Reset Data</span>
                </button>
              </>
            )}
          </div>
        </div>
        
        <div className="flex flex-row items-center overflow-x-auto py-2 px-1 gap-2 whitespace-nowrap scrollbar-thin">
          {terminalLogs.map((log: any, idx: number) => {
            const isLast = idx === terminalLogs.length - 1;
            const color = isLast ? '#16a34a' : WAYPOINT_COLORS[idx % WAYPOINT_COLORS.length];
            const waypointNum = idx + 1;

            return (
              <React.Fragment key={idx}>
                {idx > 0 && (
                  <div className="text-muted-foreground/40 font-mono select-none shrink-0">
                    ----
                  </div>
                )}
                <button
                  onClick={() => handleZoomToWaypoint(waypointNum, parseFloat(log.latitude), parseFloat(log.longitude))}
                  className="group flex items-center gap-2.5 bg-background hover:bg-muted/80 border border-border px-3 py-1.5 rounded-lg transition-all cursor-pointer shadow-2xs shrink-0"
                  title={`Focus on Waypoint #${waypointNum}`}
                >
                  <span 
                    className="h-6 w-6 rounded-full text-white flex items-center justify-center font-bold text-xs shadow-xs shrink-0"
                    style={{ backgroundColor: color }}
                  >
                    {waypointNum}
                  </span>
                  <div className="text-left font-mono">
                    <div className="text-xs font-bold text-foreground group-hover:text-primary transition-colors">
                      {isLast ? 'Latest' : `Step ${waypointNum}`}
                    </div>
                    <div className="text-[10px] text-muted-foreground">
                      {getServerTimeAgo(log.timestamp_my)}
                    </div>
                  </div>
                </button>
              </React.Fragment>
            );
          })}
        </div>
      </div>

      <div className="relative w-full rounded-xl overflow-hidden shadow-sm border border-border">
        <div 
          ref={mapContainerRef} 
          className="w-full z-0" 
          style={{ height: '450px', minHeight: '400px' }} 
        />
        
        <button
          onClick={handleResetMapView}
          className="absolute bottom-4 right-4 z-[400] flex items-center gap-2 bg-slate-900/90 hover:bg-slate-900 text-white px-3.5 py-2 rounded-lg shadow-lg border border-white/20 text-xs font-medium transition-all backdrop-blur cursor-pointer"
          title="Reset map view to fit all waypoints"
        >
          <FontAwesomeIcon icon={faCrosshairs} className="h-3.5 w-3.5 text-blue-400" />
          <span>Reset View</span>
        </button>
      </div>

      {!latestLog ? (
        <div className="text-xs bg-destructive/10 text-destructive p-3 rounded-lg border border-destructive/20">
          No waypoints found. Select a device from the sidebar or wait for incoming packets.
        </div>
      ) : (
        <div className="text-xs text-muted-foreground bg-muted p-4 rounded-lg space-y-2.5 border border-border relative">
          <div className="absolute top-3 right-4 flex items-center gap-2 bg-background/90 backdrop-blur px-3 py-1.5 rounded-full border border-border shadow-sm font-mono z-20 -mt-1">
            <FontAwesomeIcon icon={latestBattery.icon} className={`h-4 w-4 ${latestBattery.color}`} />
            <span className="font-bold text-sm text-foreground">{latestBattery.percent}%</span>
          </div>

          <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-1 border-b border-border/60 pb-2.5 pr-28">
            <div>
              Device Name: <span className="font-bold text-foreground text-sm">{activeDeviceName}</span>
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
            <div className="flex items-center gap-3">
              <span className="text-muted-foreground/80">Elevation & Temp:</span>{' '}
              <div className="inline-flex items-center gap-2">
                <span className="inline-flex items-center gap-1 font-bold text-amber-600">
                  <FontAwesomeIcon icon={faMountain} className="h-3 w-3" />
                  {latestElevation}
                </span>
                <span className="text-muted-foreground">/</span>
                <span className={`inline-flex items-center gap-1 font-bold ${tempAnimClass}`}>
                  <FontAwesomeIcon icon={tempNum > 35 ? faTemperatureHigh : faTemperatureLow} className="h-3 w-3" />
                  {latestTemp}
                </span>
              </div>
            </div>
          </div>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-2 pt-1 font-mono border-t border-border/60 pt-2 items-start">
            <div>
              <span className="text-muted-foreground/80">Last Seen:</span>{' '}
              <span className="font-bold text-foreground">
                {formatServerTimeToMalaysia12Hour(latestLog)} <span className="text-muted-foreground font-normal">({getServerTimeAgo(latestLog.timestamp_my)})</span>
              </span>
            </div>
            <div>
              <span className="text-muted-foreground/80">Last Address:</span>{' '}
              <span className="font-bold text-foreground leading-relaxed block sm:inline">{latestLog.address || 'N/A'}</span>
            </div>
          </div>
        </div>
      )}

      {isResetModalOpen && (
        <div className="fixed inset-0 bg-black/60 z-50 flex items-center justify-center p-4 backdrop-blur-xs animate-in fade-in-50">
          <div className="bg-card border border-border rounded-xl max-w-md w-full p-6 shadow-2xl space-y-4 text-card-foreground">
            <div className="flex items-center gap-3 text-destructive">
              <div className="p-3 bg-destructive/10 rounded-full">
                <FontAwesomeIcon icon={faTriangleExclamation} className="h-6 w-6" />
              </div>
              <div>
                <h3 className="text-base font-bold">Reset Device Telemetry Data</h3>
                <p className="text-xs text-muted-foreground">This action cannot be undone.</p>
              </div>
            </div>

            <p className="text-xs text-muted-foreground leading-relaxed">
              You are about to permanently delete all telemetry history and waypoints for <strong className="text-foreground">{activeDeviceName}</strong>.
            </p>

            <div className="space-y-2 pt-2">
              <label className="text-xs font-medium text-foreground block">
                To confirm, type <span className="font-mono font-bold text-destructive select-all">{expectedDeletePhrase}</span> below:
              </label>
              <input
                type="text"
                value={confirmInput}
                onChange={(e) => setConfirmInput(e.target.value)}
                placeholder={expectedDeletePhrase}
                className="w-full bg-background border border-input rounded-md px-3 py-2 text-xs font-mono text-foreground focus:outline-none focus:ring-2 focus:ring-destructive"
              />
            </div>

            <div className="flex items-center justify-end gap-2.5 pt-4 border-t border-border">
              <button
                onClick={() => setIsResetModalOpen(false)}
                className="px-4 py-2 rounded-md border border-border bg-background text-foreground hover:bg-muted text-xs font-medium transition-colors cursor-pointer"
              >
                Cancel
              </button>
              <button
                onClick={handleConfirmReset}
                disabled={confirmInput !== expectedDeletePhrase || isDeleting}
                className="px-4 py-2 rounded-md bg-destructive text-white hover:bg-destructive/90 text-xs font-medium transition-colors cursor-pointer disabled:opacity-50 disabled:cursor-not-allowed"
              >
                {isDeleting ? 'Deleting...' : 'Permanently Delete'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}