'use client';

import React, { useEffect, useRef, useState, useMemo } from 'react';
import 'leaflet/dist/leaflet.css';
import { FontAwesomeIcon } from '@fortawesome/react-fontawesome';
import {
  faBatteryFull,
  faBatteryThreeQuarters,
  faBatteryHalf,
  faBatteryEmpty,
  faFileExcel,
  faTrashCan,
  faTriangleExclamation,
  faCrosshairs,
  faMountain,
  faTemperatureHigh,
  faTemperatureLow,
  faPlay,
  faPause,
  faRotateRight,
  faExpand,
  faCompress,
  faCamera,
  faRotateLeft,
  faRoute,
} from '@fortawesome/free-solid-svg-icons';

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

const MESSAGE_REASONS: Record<number, string> = {
  0: 'First message sent after boot (~60s after startup)',
  1: 'Stationary interval elapsed',
  2: 'Movement started (transitioned from stationary)',
  3: 'Movement stopped (was in motion, now stopped)',
  4: 'Movement interval elapsed (remains in motion)',
  5: 'Reserved for future use',
  6: 'Device tampered with',
  7: 'Alert interval elapsed (ongoing alert state)',
};

/**
 * Haversine distance in kilometers between two GPS coordinates
 */
function calculateDistanceKm(lat1: number, lon1: number, lat2: number, lon2: number): number {
  if ([lat1, lon1, lat2, lon2].some((v) => isNaN(v))) return 0;
  const R = 6371;
  const toRad = (deg: number) => (deg * Math.PI) / 180;
  const dLat = toRad(lat2 - lat1);
  const dLon = toRad(lon2 - lon1);
  const a =
    Math.sin(dLat / 2) * Math.sin(dLat / 2) +
    Math.cos(toRad(lat1)) * Math.cos(toRad(lat2)) * Math.sin(dLon / 2) * Math.sin(dLon / 2);
  const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
  return R * c;
}

function formatKm(km: number): string {
  if (km < 0.01) return '0.00 km';
  return `${km.toFixed(2)} km`;
}

export default function AssetMap({ devices = [], selectedDevice, registeredDevices = [], onDataReset }: AssetMapProps) {
  const mapRef = useRef<any | null>(null);
  const mapContainerRef = useRef<HTMLDivElement | null>(null);
  const mapWrapperRef = useRef<HTMLDivElement | null>(null);
  const layerGroupRef = useRef<any | null>(null);
  const markersRef = useRef<{ [key: number]: any }>({});
  const polylineRef = useRef<any | null>(null);
  const animatedPolylineRef = useRef<any | null>(null);
  const hasFittedBoundsRef = useRef(false);
  const prevSelectedDeviceRef = useRef(selectedDevice);

  const [, setTick] = useState(0);
  const [isClient, setIsClient] = useState(false);
  const [isFullscreen, setIsFullscreen] = useState(false);
  const [isExportingImage, setIsExportingImage] = useState(false);

  // Date & Time Range Filter States (YYYY-MM-DDTHH:mm in MYT)
  const [startDateTime, setStartDateTime] = useState<string>('');
  const [endDateTime, setEndDateTime] = useState<string>('');
  const [rangePreset, setRangePreset] = useState<string>('ALL');

  const [isResetModalOpen, setIsResetModalOpen] = useState(false);
  const [confirmInput, setConfirmInput] = useState('');
  const [isDeleting, setIsDeleting] = useState(false);
  const [copiedKey, setCopiedKey] = useState<string | null>(null);

  // Playback Animation States
  const [isPlaying, setIsPlaying] = useState(false);
  const [currentPlaybackIndex, setCurrentPlaybackIndex] = useState<number | null>(null);
  const playbackTimerRef = useRef<any>(null);
  const popupTimeoutRef = useRef<any>(null);

  useEffect(() => {
    setIsClient(true);
  }, []);

  useEffect(() => {
    const timer = setInterval(() => setTick((t) => t + 1), 60000);
    return () => clearInterval(timer);
  }, []);

  useEffect(() => {
    const handleFullscreenChange = () => {
      const fsElement = document.fullscreenElement;
      setIsFullscreen(fsElement === mapWrapperRef.current);
      setTimeout(() => {
        mapRef.current?.invalidateSize();
      }, 150);
    };

    document.addEventListener('fullscreenchange', handleFullscreenChange);
    return () => document.removeEventListener('fullscreenchange', handleFullscreenChange);
  }, []);

  if (prevSelectedDeviceRef.current !== selectedDevice) {
    prevSelectedDeviceRef.current = selectedDevice;
    hasFittedBoundsRef.current = false;
    setIsPlaying(false);
    setCurrentPlaybackIndex(null);
    if (playbackTimerRef.current) clearInterval(playbackTimerRef.current);
    if (popupTimeoutRef.current) clearTimeout(popupTimeoutRef.current);
  }

  const handleCopyText = (text: string, key: string) => {
    navigator.clipboard.writeText(text);
    setCopiedKey(key);
    setTimeout(() => {
      setCopiedKey(null);
    }, 2000);
  };

  const getDeviceName = (terminalId: string) => {
    const found = registeredDevices.find(d => String(d.terminal_id).trim() === String(terminalId).trim());
    return found ? found.device_name : terminalId;
  };

  /**
   * Correct Date Normalization for DB strings already stored in MYT (or Unix epoch numbers)
   */
  const getNormalizedDate = (dateInput: any) => {
    if (dateInput === null || dateInput === undefined || dateInput === '') return new Date(0);
    try {
      const num = Number(dateInput);
      if (!isNaN(num) && num > 0) {
        const ms = String(Math.floor(num)).length === 10 ? num * 1000 : num;
        return new Date(ms);
      }

      const dateStr = String(dateInput).trim();
      if (/^\d{4}-\d{2}-\d{2} \d{2}:\d{2}:\d{2}$/.test(dateStr)) {
        return new Date(dateStr.replace(' ', 'T') + '+08:00');
      }

      if (/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}$/.test(dateStr)) {
        return new Date(dateStr + ':00+08:00');
      }

      if (/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}$/.test(dateStr)) {
        return new Date(dateStr + '+08:00');
      }

      if (dateStr.endsWith('Z') || dateStr.includes('+')) {
        return new Date(dateStr);
      }

      return new Date(dateStr.replace(' ', 'T') + '+08:00');
    } catch (e) {
      return new Date(0);
    }
  };

  const toMytInputValue = (date: Date) => {
    const parts = new Intl.DateTimeFormat('sv-SE', {
      timeZone: 'Asia/Kuala_Lumpur',
      year: 'numeric',
      month: '2-digit',
      day: '2-digit',
      hour: '2-digit',
      minute: '2-digit',
      hour12: false,
    }).format(date);
    return parts.replace(' ', 'T');
  };

  const getGpsSortTime = (log: any) => {
    const rawGps = log?.recorded_at !== undefined && log?.recorded_at !== null && log?.recorded_at !== ''
      ? log.recorded_at
      : log?.time;
    const gpsMs = getNormalizedDate(rawGps).getTime();
    if (!isNaN(gpsMs) && gpsMs > 0) return gpsMs;
    return getNormalizedDate(log?.timestamp_my).getTime();
  };

  const getServerTimeAgo = (timestampMy: string) => {
    if (!timestampMy) return 'Unknown';
    try {
      const dbDate = String(timestampMy).trim().replace(' ', 'T');
      const past = new Date(dbDate.endsWith('Z') || dbDate.includes('+') ? dbDate : dbDate + '+08:00').getTime();
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
    const rawTime = log.recorded_at !== undefined && log.recorded_at !== null ? log.recorded_at : log.time;
    if (rawTime === null || rawTime === undefined) return 'N/A';
    try {
      const date = getNormalizedDate(rawTime);
      if (isNaN(date.getTime()) || date.getTime() === 0) return String(rawTime);

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
      if (isNaN(date.getTime()) || date.getTime() === 0) return targetTime;

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
        crossOrigin: true,
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

  const targetTerminal = selectedDevice || (devices.length > 0 ? devices[0]?.terminal_id : null);

  const allTerminalLogs = useMemo(() => {
    return devices
      .filter((item: any) => String(item.terminal_id).trim() === String(targetTerminal).trim())
      .sort((a: any, b: any) => getGpsSortTime(a) - getGpsSortTime(b));
  }, [devices, targetTerminal]);

  const terminalLogs = useMemo(() => {
    const startMs = startDateTime ? getNormalizedDate(startDateTime).getTime() : null;
    const endMs = endDateTime ? getNormalizedDate(endDateTime).getTime() + 59999 : null;

    return allTerminalLogs.filter((log: any) => {
      const logMs = getGpsSortTime(log);
      if (startMs && !isNaN(startMs) && logMs < startMs) return false;
      if (endMs && !isNaN(endMs) && logMs > endMs) return false;
      return true;
    });
  }, [allTerminalLogs, startDateTime, endDateTime]);

  const distanceMetrics = useMemo(() => {
    let cumulative = 0;
    return terminalLogs.map((log: any, idx: number) => {
      if (idx === 0) {
        return { legKm: 0, cumulativeKm: 0 };
      }
      const prev = terminalLogs[idx - 1];
      const legKm = calculateDistanceKm(
        parseFloat(prev.latitude),
        parseFloat(prev.longitude),
        parseFloat(log.latitude),
        parseFloat(log.longitude)
      );
      cumulative += legKm;
      return { legKm, cumulativeKm: cumulative };
    });
  }, [terminalLogs]);

  useEffect(() => {
    hasFittedBoundsRef.current = false;
    setIsPlaying(false);
    setCurrentPlaybackIndex(null);
  }, [startDateTime, endDateTime]);

  const handlePresetChange = (value: string) => {
    setRangePreset(value);
    if (value === 'ALL') {
      setStartDateTime('');
      setEndDateTime('');
      return;
    }
    if (value === 'CUSTOM') {
      return;
    }
    const hours = Number(value);
    if (!isNaN(hours) && hours > 0) {
      const latestMs = allTerminalLogs.length > 0
        ? getGpsSortTime(allTerminalLogs[allTerminalLogs.length - 1])
        : Date.now();
      const end = new Date(latestMs);
      const start = new Date(latestMs - hours * 60 * 60 * 1000);
      setStartDateTime(toMytInputValue(start));
      setEndDateTime(toMytInputValue(end));
    }
  };

  useEffect(() => {
    if (!isClient) return;
    const map = mapRef.current;
    const layerGroup = layerGroupRef.current;
    if (!map || !layerGroup) return;

    import('leaflet').then((L) => {
      layerGroup.clearLayers();
      markersRef.current = {};

      if (!Array.isArray(devices) || devices.length === 0 || terminalLogs.length === 0) return;

      const latLngs: [number, number][] = terminalLogs.map((log: any) => [
        parseFloat(log.latitude),
        parseFloat(log.longitude),
      ]);

      const dashedPolyline = L.polyline(latLngs, {
        color: '#94a3b8',
        weight: 3,
        opacity: 0.4,
        dashArray: '1, 12',
        lineCap: 'round',
      });
      layerGroup.addLayer(dashedPolyline);
      polylineRef.current = dashedPolyline;

      const activeProgressIndices = currentPlaybackIndex !== null ? Math.max(1, currentPlaybackIndex + 1) : terminalLogs.length;
      const currentSegmentLatLngs = latLngs.slice(0, activeProgressIndices);

      const animatedPolyline = L.polyline(currentSegmentLatLngs, {
        color: '#eab308',
        weight: 4,
        opacity: 0.9,
        dashArray: '1, 12',
        lineCap: 'round',
      });
      layerGroup.addLayer(animatedPolyline);
      animatedPolylineRef.current = animatedPolyline;

      terminalLogs.forEach((log: any, index: number) => {
        const lat = parseFloat(log.latitude);
        const lng = parseFloat(log.longitude);
        const isLatest = index === terminalLogs.length - 1;
        const waypointNumber = index + 1;
        const distInfo = distanceMetrics[index] || { legKm: 0, cumulativeKm: 0 };

        const markerColor = isLatest ? '#16a34a' : WAYPOINT_COLORS[index % WAYPOINT_COLORS.length];
        const deviceName = getDeviceName(log.terminal_id);

        const gpsTime = formatGpsTimeToMalaysia12Hour(log);
        const batteryInfo = getBatteryStats(log.battery_voltage);
        const elevationStr = log.elevation !== null && log.elevation !== undefined ? `${log.elevation} m` : 'N/A';
        const tempStr = log.temperature !== null && log.temperature !== undefined ? `${log.temperature} °C` : 'N/A';
        const reasonDesc = log.reason !== undefined && MESSAGE_REASONS[Number(log.reason)] ? `(${MESSAGE_REASONS[Number(log.reason)]})` : '';
        const latLngStr = `${lat.toFixed(6)}, ${lng.toFixed(6)}`;
        const copyTextVal = `${latLngStr}, ${gpsTime}`;
        const copyKeyId = `waypoint-${waypointNumber}`;
        const isCopied = copiedKey === copyKeyId;

        const legDistanceText =
          index === 0
            ? 'Start point (0.00 km)'
            : `${formatKm(distInfo.legKm)} (from #${waypointNumber - 1})`;

        const popupContent = document.createElement('div');
        popupContent.style.fontSize = '12px';
        popupContent.style.fontFamily = 'inherit';
        popupContent.style.minWidth = '270px';

        popupContent.innerHTML = `
          <div style="font-weight: bold; font-size: 13px; margin-bottom: 6px; border-bottom: 1px solid #e5e7eb; padding-bottom: 4px;">
            Waypoint #${waypointNumber} ${isLatest ? '(Latest)' : ''}
          </div>
          <table style="width: 100%; border-collapse: collapse;">
            <tbody>
              <tr>
                <td style="padding: 2px 0; color: #6b7280; width: 38%;">Device:</td>
                <td style="padding: 2px 0; font-weight: 600;">${deviceName}</td>
              </tr>
              <tr>
                <td style="padding: 2px 0; color: #6b7280;">Battery:</td>
                <td style="padding: 2px 0; font-weight: 600;">${batteryInfo.text}</td>
              </tr>
              <tr>
                <td style="padding: 2px 0; color: #6b7280;">Leg Distance:</td>
                <td style="padding: 2px 0; font-weight: 700; color: #d97706;">${legDistanceText}</td>
              </tr>
              <tr>
                <td style="padding: 2px 0; color: #6b7280;">Total Distance:</td>
                <td style="padding: 2px 0; font-weight: 600;">${formatKm(distInfo.cumulativeKm)}</td>
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
                <td style="padding: 2px 0; color: #6b7280;">Reason:</td>
                <td style="padding: 2px 0; font-weight: 600;">${log.reason !== undefined ? `${log.reason} ${reasonDesc}` : 'N/A'}</td>
              </tr>
              <tr>
                <td style="padding: 2px 0; color: #6b7280; vertical-align: top; font-weight: bold;">Address:</td>
                <td style="padding: 2px 0; font-weight: bold; line-height: 1.3;">${log.address || 'N/A'}</td>
              </tr>
              <tr>
                <td style="padding: 6px 0 2px 0; color: #6b7280; border-top: 1px solid #e5e7eb; font-weight: bold; vertical-align: middle;">GPS Time:</td>
                <td style="padding: 6px 0 2px 0; border-top: 1px solid #e5e7eb; font-weight: bold; color: #16a34a; font-family: monospace; font-size: 11px; vertical-align: middle;">
                  <span id="seen-text-${waypointNumber}">${copyTextVal}</span>
                  <button id="copy-btn-${waypointNumber}" style="margin-left: 6px; padding: 2px 6px; background: #f3f4f6; border: 1px solid #d1d5db; border-radius: 4px; cursor: pointer; font-size: 10px; font-family: inherit; color: #000000;">
                    ${isCopied ? 'Copied' : 'Copy'}
                  </button>
                </td>
              </tr>
            </tbody>
          </table>
        `;

        setTimeout(() => {
          const btn = popupContent.querySelector(`#copy-btn-${waypointNumber}`);
          if (btn) {
            btn.addEventListener('click', (e) => {
              e.stopPropagation();
              handleCopyText(copyTextVal, copyKeyId);
            });
          }
        }, 50);

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
          const mapInstance = mapRef.current;
          if (mapInstance) {
            const targetPoint = mapInstance.project([lat, lng], 20).subtract([0, 100]);
            const targetLatLng = mapInstance.unproject(targetPoint, 20);
            mapInstance.setView(targetLatLng, 20, { animate: true });
          }
        });

        layerGroup.addLayer(marker);
        markersRef.current[waypointNumber] = marker;
      });

      if (latLngs.length > 0 && !hasFittedBoundsRef.current) {
        map.fitBounds(dashedPolyline.getBounds(), { padding: [50, 50] });
        hasFittedBoundsRef.current = true;
      }
    });
  }, [devices, selectedDevice, registeredDevices, isClient, copiedKey, currentPlaybackIndex, terminalLogs, distanceMetrics]);

  useEffect(() => {
    if (!isPlaying || terminalLogs.length === 0) {
      if (playbackTimerRef.current) clearInterval(playbackTimerRef.current);
      if (popupTimeoutRef.current) clearTimeout(popupTimeoutRef.current);
      return;
    }

    if (currentPlaybackIndex === null || currentPlaybackIndex >= terminalLogs.length - 1) {
      setCurrentPlaybackIndex(0);
    }

    playbackTimerRef.current = setInterval(() => {
      setCurrentPlaybackIndex((prevIndex) => {
        if (prevIndex === null || prevIndex + 1 >= terminalLogs.length) {
          setIsPlaying(false);
          clearInterval(playbackTimerRef.current);
          return terminalLogs.length - 1;
        }
        return prevIndex + 1;
      });
    }, 7000);

    return () => {
      if (playbackTimerRef.current) clearInterval(playbackTimerRef.current);
    };
  }, [isPlaying, terminalLogs.length]);

  useEffect(() => {
    if (currentPlaybackIndex === null || terminalLogs.length === 0) return;
    const log = terminalLogs[currentPlaybackIndex];
    if (!log) return;

    const waypointNum = currentPlaybackIndex + 1;
    const lat = parseFloat(log.latitude);
    const lng = parseFloat(log.longitude);

    const map = mapRef.current;
    if (map) {
      const targetPoint = map.project([lat, lng], 20).subtract([0, 100]);
      const targetLatLng = map.unproject(targetPoint, 20);
      map.setView(targetLatLng, 20, { animate: true });

      const marker = markersRef.current[waypointNum];
      if (marker) {
        marker.openPopup();
      }
    }
  }, [currentPlaybackIndex, terminalLogs]);

  const togglePlayAnimation = () => {
    if (isPlaying) {
      setIsPlaying(false);
      if (popupTimeoutRef.current) clearTimeout(popupTimeoutRef.current);
    } else {
      if (currentPlaybackIndex === null || currentPlaybackIndex >= terminalLogs.length - 1) {
        setCurrentPlaybackIndex(0);
      }
      setIsPlaying(true);
    }
  };

  const resetPlayAnimation = () => {
    setIsPlaying(false);
    setCurrentPlaybackIndex(0);
    if (popupTimeoutRef.current) clearTimeout(popupTimeoutRef.current);
    if (terminalLogs.length > 0) {
      handleZoomToWaypoint(1, parseFloat(terminalLogs[0].latitude), parseFloat(terminalLogs[0].longitude));
    }
  };

  const handleToggleFullscreen = async () => {
    const wrapper = mapWrapperRef.current;
    if (!wrapper) return;

    try {
      if (!document.fullscreenElement && !isFullscreen) {
        if (wrapper.requestFullscreen) {
          await wrapper.requestFullscreen();
        } else {
          setIsFullscreen(true);
        }
      } else {
        if (document.fullscreenElement && document.exitFullscreen) {
          await document.exitFullscreen();
        }
        setIsFullscreen(false);
      }
    } catch {
      setIsFullscreen((prev) => !prev);
    }

    setTimeout(() => {
      mapRef.current?.invalidateSize();
    }, 150);
  };

  const handleExportMapImage = async () => {
    const map = mapRef.current;
    const container = mapContainerRef.current;
    if (!map || !container || isExportingImage) return;

    setIsExportingImage(true);
    try {
      const rect = container.getBoundingClientRect();
      const width = Math.max(1, Math.round(rect.width));
      const height = Math.max(1, Math.round(rect.height));

      const canvas = document.createElement('canvas');
      canvas.width = width;
      canvas.height = height;
      const ctx = canvas.getContext('2d');
      if (!ctx) return;

      ctx.fillStyle = '#e5e7eb';
      ctx.fillRect(0, 0, width, height);

      const containerRect = container.getBoundingClientRect();
      const tileImgs = Array.from(container.querySelectorAll('.leaflet-tile-pane img')) as HTMLImageElement[];

      for (const img of tileImgs) {
        if (!img.complete || img.naturalWidth === 0) continue;
        const imgRect = img.getBoundingClientRect();
        const x = imgRect.left - containerRect.left;
        const y = imgRect.top - containerRect.top;
        const w = imgRect.width;
        const h = imgRect.height;

        try {
          ctx.drawImage(img, x, y, w, h);
        } catch {
          // Skip tainted tile if CORS blocks canvas read
        }
      }

      if (terminalLogs.length > 0) {
        const points = terminalLogs.map((log: any) => {
          const pt = map.latLngToContainerPoint([parseFloat(log.latitude), parseFloat(log.longitude)]);
          return { x: pt.x, y: pt.y, log };
        });

        ctx.save();
        ctx.beginPath();
        points.forEach((p, idx) => {
          if (idx === 0) ctx.moveTo(p.x, p.y);
          else ctx.lineTo(p.x, p.y);
        });
        ctx.strokeStyle = '#eab308';
        ctx.lineWidth = 4;
        ctx.setLineDash([6, 8]);
        ctx.stroke();
        ctx.restore();

        points.forEach((p, idx) => {
          const isLatest = idx === points.length - 1;
          const badgeColor = isLatest ? '#16a34a' : WAYPOINT_COLORS[idx % WAYPOINT_COLORS.length];

          ctx.beginPath();
          ctx.arc(p.x, p.y, 13, 0, Math.PI * 2);
          ctx.fillStyle = badgeColor;
          ctx.fill();
          ctx.lineWidth = 2;
          ctx.strokeStyle = '#ffffff';
          ctx.stroke();

          ctx.fillStyle = '#ffffff';
          ctx.font = 'bold 11px sans-serif';
          ctx.textAlign = 'center';
          ctx.textBaseline = 'middle';
          ctx.fillText(String(idx + 1), p.x, p.y);
        });
      }

      const dataUrl = canvas.toDataURL('image/png');
      const link = document.createElement('a');
      link.download = `${activeDeviceName.replace(/[^a-zA-Z0-9]/g, '_')}_map_route.png`;
      link.href = dataUrl;
      document.body.appendChild(link);
      link.click();
      document.body.removeChild(link);
    } catch (err) {
      console.error('Export map image error:', err);
      alert('Unable to export map image in this browser/tile configuration.');
    } finally {
      setIsExportingImage(false);
    }
  };

  const latestLog = terminalLogs.length > 0 ? terminalLogs[terminalLogs.length - 1] : null;
  const latestDistanceInfo =
    distanceMetrics.length > 0 ? distanceMetrics[distanceMetrics.length - 1] : { legKm: 0, cumulativeKm: 0 };
  const latestBattery = getBatteryStats(latestLog?.battery_voltage);
  const activeDeviceName = targetTerminal ? getDeviceName(targetTerminal) : 'N/A';
  const expectedDeletePhrase = `DELETE DEVICE ${activeDeviceName}`;

  const latestElevation = latestLog?.elevation !== null && latestLog?.elevation !== undefined ? `${latestLog.elevation}m` : 'N/A';
  const latestTemp = latestLog?.temperature !== null && latestLog?.temperature !== undefined ? `${latestLog.temperature}°C` : 'N/A';
  const tempNum = latestLog?.temperature !== undefined ? Number(latestLog.temperature) : 0;
  const tempAnimClass = tempNum > 40 ? 'text-destructive font-bold animate-pulse' : tempNum > 30 ? 'text-amber-500 font-semibold' : 'text-amber-400';

  const handleZoomToWaypoint = (waypointNum: number, lat: number, lng: number) => {
    setIsPlaying(false);
    setCurrentPlaybackIndex(waypointNum - 1);
    if (popupTimeoutRef.current) clearTimeout(popupTimeoutRef.current);
    const map = mapRef.current;
    if (!map) return;

    const targetPoint = map.project([lat, lng], 20).subtract([0, 100]);
    const targetLatLng = map.unproject(targetPoint, 20);
    map.setView(targetLatLng, 20, { animate: true });

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
      'Leg Distance (km)',
      'Cumulative Distance (km)',
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
      const dist = distanceMetrics[idx] || { legKm: 0, cumulativeKm: 0 };
      const elevation = log.elevation !== null && log.elevation !== undefined ? log.elevation : 'N/A';
      const temperature = log.temperature !== null && log.temperature !== undefined ? log.temperature : 'N/A';
      const batt = log.battery_voltage !== null && log.battery_voltage !== undefined ? `${getBatteryStats(log.battery_voltage).percent}%` : 'N/A';
      const gpsTime = formatGpsTimeToMalaysia12Hour(log);
      const receivedTime = formatServerTimeToMalaysia12Hour(log);

      let gapHours = 'N/A';
      try {
        const rawTransmit = log.recorded_at !== undefined && log.recorded_at !== null ? log.recorded_at : log.time;
        const rawReceive = log.timestamp_my;
        if (rawTransmit && rawReceive) {
          const transmitMs = getNormalizedDate(rawTransmit).getTime();
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
        dist.legKm.toFixed(2),
        dist.cumulativeKm.toFixed(2),
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

  const isFiltered = Boolean(startDateTime || endDateTime);

  return (
    <div className="space-y-4">
      <style jsx>{`
        .no-scrollbar::-webkit-scrollbar {
          display: none;
        }
        .no-scrollbar {
          -ms-overflow-style: none;
          scrollbar-width: none;
        }
      `}</style>

      <div className="bg-card border border-border p-3 rounded-xl shadow-xs space-y-2.5">
        <div className="flex flex-wrap items-center justify-between gap-2 text-xs font-semibold text-muted-foreground px-1">
          <div className="flex items-center gap-2">
            <span>Waypoint:</span>
            {allTerminalLogs.length > 0 && (
              <div className="flex items-center gap-1.5 ml-1">
                <button
                  onClick={togglePlayAnimation}
                  disabled={terminalLogs.length === 0}
                  className={`flex items-center gap-1 px-2.5 py-1 rounded-md text-xs font-medium transition-colors cursor-pointer shadow-xs disabled:opacity-40 ${
                    isPlaying ? 'bg-amber-500 hover:bg-amber-600 text-black font-bold' : 'bg-primary hover:bg-primary/90 text-primary-foreground'
                  }`}
                  title={isPlaying ? 'Pause Animation' : 'Play Waypoint Animation'}
                >
                  <FontAwesomeIcon icon={isPlaying ? faPause : faPlay} className="h-3 w-3" />
                  <span>{isPlaying ? 'Pause' : 'Play'}</span>
                </button>
                <button
                  onClick={resetPlayAnimation}
                  disabled={terminalLogs.length === 0}
                  className="flex items-center gap-1 bg-muted hover:bg-muted/80 text-foreground px-2 py-1 rounded-md text-xs font-medium transition-colors cursor-pointer border border-border disabled:opacity-40"
                  title="Reset Playback"
                >
                  <FontAwesomeIcon icon={faRotateRight} className="h-3 w-3" />
                </button>
              </div>
            )}
          </div>

          <div className="flex items-center gap-2.5">
            <span className="font-mono">
              {terminalLogs.length}
              {isFiltered ? ` / ${allTerminalLogs.length}` : ''} Waypoints
            </span>
            {allTerminalLogs.length > 0 && (
              <>
                <button
                  onClick={handleExportExcel}
                  disabled={terminalLogs.length === 0}
                  className="flex items-center gap-1.5 bg-emerald-600 hover:bg-emerald-700 text-white px-2.5 py-1 rounded-md text-xs font-medium transition-colors shadow-xs cursor-pointer disabled:opacity-40"
                  title="Export filtered data to CSV/Excel"
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

        {/* Filter Bar */}
        {allTerminalLogs.length > 0 && (
          <div className="flex flex-wrap items-center justify-between gap-2 px-1 py-2 bg-muted/40 rounded-lg border border-border/60 text-xs">
            <div className="flex flex-wrap items-center gap-2">
              <span className="font-mono text-[11px] font-semibold text-foreground">
                Filter:
              </span>

              <select
                value={rangePreset}
                onChange={(e) => handlePresetChange(e.target.value)}
                className="bg-background text-foreground border border-input rounded-md px-2 py-1 text-[11px] font-mono focus:outline-none focus:ring-1 focus:ring-ring cursor-pointer"
              >
                <option value="ALL">All Time</option>
                <option value="1">Last 1 Hour</option>
                <option value="3">Last 3 Hours</option>
                <option value="6">Last 6 Hours</option>
                <option value="12">Last 12 Hours</option>
                <option value="24">Last 24 Hours</option>
                <option value="CUSTOM">Custom Range</option>
              </select>

              <label className="flex items-center gap-1 text-[11px] font-mono text-muted-foreground">
                <span>From</span>
                <input
                  type="datetime-local"
                  value={startDateTime}
                  onChange={(e) => {
                    setStartDateTime(e.target.value);
                    setRangePreset('CUSTOM');
                  }}
                  className="bg-background text-foreground border border-input rounded-md px-2 py-1 text-[11px] font-mono focus:outline-none focus:ring-1 focus:ring-ring"
                />
              </label>

              <label className="flex items-center gap-1 text-[11px] font-mono text-muted-foreground">
                <span>To</span>
                <input
                  type="datetime-local"
                  value={endDateTime}
                  onChange={(e) => {
                    setEndDateTime(e.target.value);
                    setRangePreset('CUSTOM');
                  }}
                  className="bg-background text-foreground border border-input rounded-md px-2 py-1 text-[11px] font-mono focus:outline-none focus:ring-1 focus:ring-ring"
                />
              </label>
            </div>

            {isFiltered && (
              <button
                type="button"
                onClick={() => handlePresetChange('ALL')}
                className="inline-flex items-center gap-1 px-2 py-1 rounded bg-amber-500/15 hover:bg-amber-500/25 text-amber-400 border border-amber-500/30 cursor-pointer transition-colors font-mono text-[10px] font-semibold"
              >
                <FontAwesomeIcon icon={faRotateLeft} className="h-2.5 w-2.5" />
                <span>Clear</span>
              </button>
            )}
          </div>
        )}

        <div className="no-scrollbar flex flex-row items-center overflow-x-auto py-2 px-1 gap-2 whitespace-nowrap">
          {terminalLogs.map((log: any, idx: number) => {
            const isLast = idx === terminalLogs.length - 1;
            const color = isLast ? '#16a34a' : WAYPOINT_COLORS[idx % WAYPOINT_COLORS.length];
            const waypointNum = idx + 1;
            const isHighlighted = currentPlaybackIndex === idx;
            const legKm = distanceMetrics[idx]?.legKm ?? 0;

            const transmitTimeAgo = getServerTimeAgo(log.timestamp_my);
            const fullTransmitMyt = formatServerTimeToMalaysia12Hour(log);
            const gpsTimeMyt = formatGpsTimeToMalaysia12Hour(log);

            const distanceTitle =
              idx === 0
                ? 'Start point'
                : `Point #${waypointNum - 1} to #${waypointNum}: ${formatKm(legKm)}`;

            return (
              <React.Fragment key={idx}>
                {idx > 0 && (
                  <div className="flex flex-col items-center shrink-0 px-0.5 select-none">
                    <span className="text-[9px] font-mono font-semibold text-amber-400">
                      {formatKm(legKm)}
                    </span>
                    <span className="text-muted-foreground/40 font-mono leading-none">
                      ----
                    </span>
                  </div>
                )}
                <button
                  onClick={() => handleZoomToWaypoint(waypointNum, parseFloat(log.latitude), parseFloat(log.longitude))}
                  className={`group flex items-center gap-2.5 border px-3 py-1.5 rounded-lg transition-all cursor-pointer shadow-2xs shrink-0 ${
                    isHighlighted
                      ? 'bg-primary/10 border-primary ring-2 ring-primary/30'
                      : 'bg-background hover:bg-muted/80 border-border'
                  }`}
                  title={`Focus on Waypoint #${waypointNum}\n${distanceTitle}\nGPS Time: ${gpsTimeMyt}\nTransmitted: ${fullTransmitMyt}`}
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
                    <div className="text-[10px] text-muted-foreground flex items-center gap-1.5">
                      <span>{transmitTimeAgo}</span>
                      {idx > 0 && (
                        <span className="text-amber-400 font-semibold">
                          • +{formatKm(legKm)}
                        </span>
                      )}
                    </div>
                  </div>
                </button>
              </React.Fragment>
            );
          })}
        </div>
      </div>

      <div
        ref={mapWrapperRef}
        className={`relative w-full rounded-xl overflow-hidden shadow-sm border border-border bg-background ${
          isFullscreen ? 'fixed inset-0 z-[9999] rounded-none border-0 h-screen w-screen' : 'z-0'
        }`}
      >
        <div
          ref={mapContainerRef}
          className="w-full z-0"
          style={{ height: isFullscreen ? '100vh' : '450px', minHeight: '400px' }}
        />

        <div className="absolute top-3 right-3 z-[20] flex items-center gap-2">
          <button
            onClick={handleExportMapImage}
            disabled={isExportingImage}
            className="flex items-center gap-1.5 bg-slate-900/90 hover:bg-slate-900 text-white px-3 py-2 rounded-lg shadow-lg border border-white/20 text-xs font-medium transition-all backdrop-blur cursor-pointer disabled:opacity-60"
            title="Export map view as PNG image"
          >
            <FontAwesomeIcon icon={faCamera} className="h-3.5 w-3.5 text-emerald-400" />
            <span>{isExportingImage ? 'Exporting...' : 'Export Image'}</span>
          </button>

          <button
            onClick={handleToggleFullscreen}
            className="flex items-center gap-1.5 bg-slate-900/90 hover:bg-slate-900 text-white px-3 py-2 rounded-lg shadow-lg border border-white/20 text-xs font-medium transition-all backdrop-blur cursor-pointer"
            title={isFullscreen ? 'Exit Fullscreen' : 'Fullscreen Map'}
          >
            <FontAwesomeIcon icon={isFullscreen ? faCompress : faExpand} className="h-3.5 w-3.5 text-amber-400" />
            <span>{isFullscreen ? 'Exit Fullscreen' : 'Fullscreen'}</span>
          </button>
        </div>

        <button
          onClick={handleResetMapView}
          className="absolute bottom-4 right-4 z-[20] flex items-center gap-2 bg-slate-900/90 hover:bg-slate-900 text-white px-3.5 py-2 rounded-lg shadow-lg border border-white/20 text-xs font-medium transition-all backdrop-blur cursor-pointer"
          title="Reset map view to fit all waypoints"
        >
          <FontAwesomeIcon icon={faCrosshairs} className="h-3.5 w-3.5 text-amber-400" />
          <span>Reset View</span>
        </button>
      </div>

      {!latestLog ? (
        <div className="text-xs bg-destructive/10 text-destructive p-3 rounded-lg border border-destructive/20 flex items-center justify-between gap-2">
          <span>
            {isFiltered
              ? 'No waypoints match the selected filter range.'
              : 'No waypoints found. Select a device from the sidebar or wait for incoming packets.'}
          </span>
          {isFiltered && (
            <button
              type="button"
              onClick={() => handlePresetChange('ALL')}
              className="px-2.5 py-1 rounded bg-background text-foreground border border-border text-[11px] font-mono cursor-pointer shrink-0"
            >
              Clear Filter
            </button>
          )}
        </div>
      ) : (
        <div className="text-xs text-muted-foreground bg-muted p-4 rounded-lg space-y-2.5 border border-border relative">
          <div className="absolute top-3 right-4 flex items-center gap-2 bg-background/90 backdrop-blur px-3 py-1.5 rounded-full border border-border shadow-sm font-mono z-20 -mt-1">
            <FontAwesomeIcon icon={latestBattery.icon} className={`h-4 w-4 ${latestBattery.color}`} />
            <span className="font-bold text-sm text-foreground">{latestBattery.percent}%</span>
          </div>

          <div className="flex flex-col sm:flex-row sm:items-start sm:justify-between gap-1.5 border-b border-border/60 pb-2.5 pr-28">
            <div>
              Device Name: <span className="font-bold text-foreground text-sm">{activeDeviceName}</span>
            </div>
            <div className="flex flex-col sm:items-end gap-1 font-mono">
              <div>
                Total Waypoints: <span className="font-bold text-foreground">{terminalLogs.length}</span>
              </div>
              <div className="inline-flex items-center gap-1.5 text-amber-400 font-bold">
                <FontAwesomeIcon icon={faRoute} className="h-3 w-3" />
                <span>Total Distance: {formatKm(latestDistanceInfo.cumulativeKm)}</span>
              </div>
            </div>
          </div>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-2 pt-1 font-mono">
            <div>
              <span className="text-muted-foreground/80">Latest Coordinates:</span>{' '}
              <span className="font-bold text-foreground">{latestLog.latitude}, {latestLog.longitude}</span>
              {terminalLogs.length > 1 && (
                <span className="ml-2 text-amber-400 font-semibold">
                  (+{formatKm(latestDistanceInfo.legKm)} from #{terminalLogs.length - 1})
                </span>
              )}
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
              <span className="text-muted-foreground/80">Last Updated:</span>{' '}
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