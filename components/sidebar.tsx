// components/sidebar.tsx
'use client';

import React, { useState, useEffect } from 'react';
import Image from 'next/image';
import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { FontAwesomeIcon } from '@fortawesome/react-fontawesome';
import { faMicrochip, faUsers, faLink } from '@fortawesome/free-solid-svg-icons';

interface DeviceLog {
  terminal_id: string;
  device_name?: string;
  latitude: number;
  longitude: number;
  address: string;
  recorded_at: string;
  timestamp_my?: string;
}

interface SidebarProps {
  devices: DeviceLog[];
  selectedDevice: string | null;
  onSelectDevice: (terminalId: string | null) => void;
  isOpen: boolean;
  onCloseMobile: () => void;
}

export default function Sidebar({ devices, selectedDevice, onSelectDevice, isOpen, onCloseMobile }: SidebarProps) {
  const [filter, setFilter] = useState<'ALL' | 'ONLINE' | 'OFFLINE'>('ALL');
  const [deviceNames, setDeviceNames] = useState<Record<string, string>>({});
  const [, setTick] = useState(0);
  const pathname = usePathname();

  // Fetch registered device names from database registry
  useEffect(() => {
    async function fetchDeviceRegistry() {
      try {
        const res = await fetch('/api/devices');
        if (res.ok) {
          const data = await res.json();
          const map: Record<string, string> = {};
          (data.registered || []).forEach((d: any) => {
            map[d.terminal_id] = d.device_name;
          });
          setDeviceNames(map);
        }
      } catch (err) {
        console.error('Failed to load device registry', err);
      }
    }
    fetchDeviceRegistry();
    const interval = setInterval(fetchDeviceRegistry, 30000);
    return () => clearInterval(interval);
  }, []);

  // Force re-render every minute to keep time-ago fresh
  useEffect(() => {
    const timer = setInterval(() => setTick((t) => t + 1), 60000);
    return () => clearInterval(timer);
  }, []);

  const getNormalizedDate = (dateString: string) => {
    if (!dateString) return new Date(0);
    try {
      // If it lacks a timezone/offset, explicitly append Malaysia offset +08:00
      if (!dateString.includes('+') && !dateString.endsWith('Z')) {
        return new Date(dateString.replace(' ', 'T') + '+08:00');
      }

      const normalizedString = dateString.endsWith('Z') || dateString.includes('+') 
        ? dateString 
        : dateString.replace(' ', 'T') + 'Z';
      return new Date(normalizedString);
    } catch (e) {
      return new Date(0);
    }
  };

  // Consider online if last update was within 24 hours (86400000 ms), otherwise offline
  const isOnline = (recordedAt: string) => {
    const lastSeen = getNormalizedDate(recordedAt).getTime();
    const now = new Date().getTime();
    return (now - lastSeen) <= 24 * 60 * 60 * 1000;
  };

  const getTimeAgo = (recordedAt: string) => {
    if (!recordedAt) return 'Unknown';
    try {
      const past = getNormalizedDate(recordedAt).getTime();
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

  // Helper to format Malaysia time correctly utilizing timestamp_my or fallback parsing
  const formatToMalaysiaTime = (device: any) => {
    const targetTimeStr = device.timestamp_my || device.recorded_at;
    if (targetTimeStr) {
      try {
        const parts = targetTimeStr.split(/[- :]/);
        if (parts.length >= 5) {
          const year = parts[0];
          const monthIndex = parseInt(parts[1], 10) - 1;
          const day = parts[2];
          const hour = parts[3];
          const minute = parts[4];
          
          const months = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
          return `${day} ${months[monthIndex]} ${year}, ${hour}:${minute}`;
        }
      } catch (e) {
        // Fallthrough to standard formatter
      }
    }

    if (!device.recorded_at) return 'N/A';
    try {
      const date = getNormalizedDate(device.recorded_at);
      if (isNaN(date.getTime())) return device.recorded_at;

      return new Intl.DateTimeFormat('en-GB', {
        timeZone: 'Asia/Kuala_Lumpur',
        day: '2-digit',
        month: 'short',
        year: 'numeric',
        hour: '2-digit',
        minute: '2-digit',
        hour12: false,
      }).format(date);
    } catch (e) {
      return device.recorded_at;
    }
  };

  const uniqueDevicesMap = new Map();
  devices.forEach((d) => {
    if (!uniqueDevicesMap.has(d.terminal_id)) {
      uniqueDevicesMap.set(d.terminal_id, d);
    }
  });
  const deviceList = Array.from(uniqueDevicesMap.values());

  const filteredDevices = deviceList.filter((device) => {
    const online = isOnline(device.timestamp_my || device.recorded_at);
    if (filter === 'ONLINE') return online;
    if (filter === 'OFFLINE') return !online;
    return true;
  });

  return (
    <>
      {isOpen && (
        <div 
          onClick={onCloseMobile}
          className="fixed inset-0 bg-black/50 z-40 md:hidden backdrop-blur-xs transition-opacity"
        />
      )}

      <aside className={`
        fixed inset-y-0 left-0 z-50 w-72 bg-card text-card-foreground flex flex-col h-screen border-r border-border select-none transition-transform duration-300 ease-in-out
        md:relative md:translate-x-0
        ${isOpen ? 'translate-x-0' : '-translate-x-full'}
      `}>
        {/* Brand Header */}
        <div className="p-4 border-b border-border flex flex-col gap-3">
          <div className="flex flex-col items-center justify-center text-center gap-1.5 relative">
            <span className="absolute right-0 top-0 text-[9px] font-mono px-1.5 py-0.5 rounded bg-muted text-muted-foreground border border-border">
              v1.0
            </span>

            <div className="relative w-36 h-8 flex items-center justify-center mt-1">
              <Image 
                src="/ipinfra_logo.png" 
                alt="Logo" 
                fill 
                className="object-contain"
                priority
              />
            </div>
            <span className="text-[9px] tracking-widest text-foreground font-mono uppercase font-bold leading-tight">
              SATELLITE TRACKER
            </span>
          </div>

          <div className="relative">
            <select
              value={filter}
              onChange={(e) => setFilter(e.target.value as any)}
              className="w-full bg-background text-xs font-medium text-foreground px-3 py-1.5 rounded-md border border-input appearance-none focus:outline-none focus:ring-1 focus:ring-ring cursor-pointer transition-colors pr-8 shadow-xs"
            >
              <option value="ALL">All Devices ({deviceList.length})</option>
              <option value="ONLINE">Online Only</option>
              <option value="OFFLINE">Offline Only</option>
            </select>
            <div className="absolute right-3 top-1/2 -translate-y-1/2 pointer-events-none text-muted-foreground text-[9px]">
              ▼
            </div>
          </div>
        </div>

        {/* Device List Section */}
        <div className="flex-1 overflow-y-auto p-2.5 space-y-1.5 scrollbar-thin">
          {filteredDevices.length === 0 ? (
            <div className="text-center text-muted-foreground text-xs py-10">
              No devices found
            </div>
          ) : (
            filteredDevices.map((device) => {
              const online = isOnline(device.timestamp_my || device.recorded_at);
              const isSelected = selectedDevice === device.terminal_id;
              const timeAgoText = getTimeAgo(device.timestamp_my || device.recorded_at);
              const malaysiaTimeText = formatToMalaysiaTime(device);
              const friendlyName = deviceNames[device.terminal_id];

              return (
                <div
                  key={device.terminal_id}
                  onClick={() => {
                    onSelectDevice(device.terminal_id);
                    onCloseMobile();
                  }}
                  className={`group p-2.5 rounded-lg cursor-pointer transition-all border ${
                    isSelected
                      ? 'bg-accent text-accent-foreground border-border shadow-sm'
                      : 'bg-transparent border-transparent hover:bg-muted/50 text-muted-foreground hover:text-foreground'
                  }`}
                >
                  <div className="flex items-center justify-between mb-1">
                    <div className="flex flex-col truncate max-w-[140px]">
                      {friendlyName ? (
                        <>
                          <span className="text-xs font-bold text-foreground truncate">{friendlyName}</span>
                          <span className="font-mono text-[10px] opacity-70 truncate">{device.terminal_id}</span>
                        </>
                      ) : (
                        <span className="font-mono text-xs font-semibold tracking-wide truncate">
                          {device.terminal_id}
                        </span>
                      )}
                    </div>
                    <span className="flex items-center gap-1.5 text-[10px] font-medium shrink-0">
                      <span
                        className={`h-1.5 w-1.5 rounded-full ${
                          online ? 'bg-emerald-500' : 'bg-zinc-500'
                        }`}
                      />
                      <span className="text-[10px] text-muted-foreground font-mono">
                        {timeAgoText}
                      </span>
                    </span>
                  </div>
                  <p className="text-[11px] truncate opacity-80 mb-1">
                    {device.address || 'Unknown location'}
                  </p>
                  <div className="text-[9px] font-mono opacity-50 flex items-center justify-between">
                    <span>{malaysiaTimeText}</span>
                    <span className="text-[8px] uppercase tracking-wider opacity-75">GMT+8</span>
                  </div>
                </div>
              );
            })
          )}
        </div>

        {/* Bottom Navigation & Management Links */}
        <div className="p-3 border-t border-border bg-card/50 flex flex-col gap-1.5 shrink-0">
          <Link
            href="/devices"
            className={`flex items-center justify-between px-3 py-1.5 rounded-md text-xs font-medium transition-colors border ${
              pathname === '/devices'
                ? 'bg-primary text-primary-foreground border-primary'
                : 'bg-background text-foreground hover:bg-muted border-border'
            }`}
          >
            <div className="flex items-center gap-2">
              <FontAwesomeIcon icon={faMicrochip} className="h-3.5 w-3.5 opacity-80" />
              <span>Device Registry</span>
            </div>
            <FontAwesomeIcon icon={faLink} className="h-3 w-3 opacity-60" />
          </Link>

          <Link
            href="/users"
            className={`flex items-center justify-between px-3 py-1.5 rounded-md text-xs font-medium transition-colors border ${
              pathname === '/users'
                ? 'bg-primary text-primary-foreground border-primary'
                : 'bg-background text-foreground hover:bg-muted border-border'
            }`}
          >
            <div className="flex items-center gap-2">
              <FontAwesomeIcon icon={faUsers} className="h-3.5 w-3.5 opacity-80" />
              <span>User Management</span>
            </div>
          </Link>

          <p className="text-[9px] font-mono text-muted-foreground tracking-wide text-center pt-1">
            © IPINFRA NETWORKS SDN BHD
          </p>
        </div>
      </aside>
    </>
  );
}