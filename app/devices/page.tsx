// app/devices/page.tsx
'use client';

import React, { useEffect, useState, useRef } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { FontAwesomeIcon } from '@fortawesome/react-fontawesome';
import { 
  faArrowLeft, 
  faMicrochip, 
  faPlus, 
  faTrash, 
  faCheckCircle, 
  faExclamationTriangle,
  faSun,
  faMoon,
  faRightFromBracket,
  faBars,
  faChevronDown,
  faUserCircle,
  faLink
} from '@fortawesome/free-solid-svg-icons';
import Sidebar from '@/components/sidebar';

interface RegisteredDevice {
  id: number;
  terminal_id: string;
  device_name: string;
  created_at: string;
}

interface TelemetryLog {
  id: number;
  terminal_id: string;
  latitude: number;
  longitude: number;
  address: string;
  recorded_at: string;
}

export default function DevicesPage() {
  const [isAuthenticated, setIsAuthenticated] = useState(false);
  const [userEmail, setUserEmail] = useState<string>('');
  const [devices, setDevices] = useState<RegisteredDevice[]>([]);
  const [telemetryLogs, setTelemetryLogs] = useState<TelemetryLog[]>([]);
  const [loading, setLoading] = useState<boolean>(true);
  
  // Pairing Form State (Selection Only)
  const [selectedTerminalId, setSelectedTerminalId] = useState('');
  const [deviceName, setDeviceName] = useState('');
  
  // Feedback State
  const [message, setMessage] = useState<{ type: 'success' | 'error'; text: string } | null>(null);
  
  const [isMobileSidebarOpen, setIsMobileSidebarOpen] = useState<boolean>(false);
  const [isDarkMode, setIsDarkMode] = useState(true);
  const [isProfileDropdownOpen, setIsProfileDropdownOpen] = useState<boolean>(false);
  
  const dropdownRef = useRef<HTMLDivElement>(null);
  const router = useRouter();

  useEffect(() => {
    const auth = localStorage.getItem('isAuthenticated');
    const email = localStorage.getItem('userEmail');
    if (!auth) {
      router.push('/login');
    } else {
      setIsAuthenticated(true);
      if (email) setUserEmail(email);
    }
  }, [router]);

  useEffect(() => {
    const root = document.documentElement;
    if (root.classList.contains('light')) {
      setIsDarkMode(false);
    } else {
      setIsDarkMode(true);
      root.classList.add('dark');
    }
  }, []);

  // Close profile dropdown when clicking outside
  useEffect(() => {
    function handleClickOutside(event: MouseEvent) {
      if (dropdownRef.current && !dropdownRef.current.contains(event.target as Node)) {
        setIsProfileDropdownOpen(false);
      }
    }
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  const toggleTheme = () => {
    const root = document.documentElement;
    if (isDarkMode) {
      root.classList.remove('dark');
      root.classList.add('light');
      setIsDarkMode(false);
    } else {
      root.classList.remove('light');
      root.classList.add('dark');
      setIsDarkMode(true);
    }
  };

  const handleLogout = () => {
    localStorage.removeItem('isAuthenticated');
    localStorage.removeItem('userEmail');
    router.push('/login');
  };

  const fetchData = async () => {
    try {
      const res = await fetch('/api/devices');
      if (res.ok) {
        const data = await res.json();
        setDevices(data.registered || []);
      }

      const logRes = await fetch('/api/webhook/myriota');
      const logData = await logRes.json();
      if (Array.isArray(logData)) {
        setTelemetryLogs(logData);
      }
    } catch (err) {
      console.error('Failed to fetch devices', err);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    if (!isAuthenticated) return;
    fetchData();
  }, [isAuthenticated]);

  // Extract unique active terminal IDs from telemetry logs that are not yet registered
  const registeredTerminalIds = new Set(devices.map(d => String(d.terminal_id).trim()));
  const uniqueSeenTerminals = Array.from(new Set(telemetryLogs.map(l => String(l.terminal_id).trim())));
  const unpairedTerminals = uniqueSeenTerminals.filter(id => !registeredTerminalIds.has(id));

  const handleRegisterDevice = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!selectedTerminalId || !deviceName) {
      setMessage({ type: 'error', text: 'Please select a Terminal ID and enter a Device Name.' });
      return;
    }

    try {
      const res = await fetch('/api/devices', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ terminal_id: selectedTerminalId, device_name: deviceName }),
      });

      const data = await res.json();
      if (data.success) {
        setMessage({ type: 'success', text: `Device "${deviceName}" paired successfully!` });
        setSelectedTerminalId('');
        setDeviceName('');
        fetchData();
      } else {
        setMessage({ type: 'error', text: data.message || 'Failed to register device.' });
      }
    } catch (err) {
      setMessage({ type: 'error', text: 'An unexpected error occurred.' });
    }
  };

  const handleDeleteDevice = async (termId: string) => {
    if (!confirm(`Are you sure you want to unregister terminal ${termId}?`)) return;

    try {
      const res = await fetch(`/api/devices?terminal_id=${encodeURIComponent(termId)}`, {
        method: 'DELETE',
      });

      const data = await res.json();
      if (data.success) {
        setMessage({ type: 'success', text: `Device unregistered successfully.` });
        fetchData();
      } else {
        setMessage({ type: 'error', text: data.message || 'Failed to delete device.' });
      }
    } catch (err) {
      setMessage({ type: 'error', text: 'An unexpected error occurred.' });
    }
  };

  if (!isAuthenticated) {
    return (
      <div className="flex h-screen w-screen items-center justify-center bg-background text-foreground font-sans">
        <p className="text-xs font-mono text-muted-foreground animate-pulse">Checking session...</p>
      </div>
    );
  }

  return (
    <div className="flex h-screen w-screen overflow-hidden bg-background text-foreground font-sans">
      <Sidebar 
        devices={telemetryLogs} 
        selectedDevice={null} 
        onSelectDevice={() => router.push('/')} 
        isOpen={isMobileSidebarOpen}
        onCloseMobile={() => setIsMobileSidebarOpen(false)}
      />

      <main className="flex-1 h-full overflow-y-auto flex flex-col">
        {/* Top Header Bar */}
        <header className="h-14 border-b border-border bg-card/30 backdrop-blur px-4 md:px-6 flex items-center justify-between shrink-0 z-10">
          <div className="flex items-center gap-3">
            <button
              onClick={() => setIsMobileSidebarOpen(!isMobileSidebarOpen)}
              className="md:hidden h-8 w-8 flex items-center justify-center rounded-md border border-border bg-background text-foreground hover:bg-muted transition-colors cursor-pointer"
              title="Toggle Menu"
            >
              <FontAwesomeIcon icon={faBars} className="h-3.5 w-3.5" />
            </button>

            <div className="flex items-center gap-2 text-xs font-semibold">
              <FontAwesomeIcon icon={faMicrochip} className="text-primary" />
              <span className="hidden sm:inline">Device Registry & Pairing</span>
            </div>
          </div>

          <div className="flex items-center gap-2.5">
            <button
              onClick={toggleTheme}
              className="h-8 w-8 flex items-center justify-center rounded-md border border-border bg-background text-foreground hover:bg-muted transition-colors cursor-pointer shrink-0"
              title={isDarkMode ? "Switch to Light Mode" : "Switch to Dark Mode"}
            >
              <FontAwesomeIcon icon={isDarkMode ? faSun : faMoon} className="h-3.5 w-3.5" />
            </button>

            {/* Profile Dropdown */}
            <div className="relative" ref={dropdownRef}>
              <button
                onClick={() => setIsProfileDropdownOpen(!isProfileDropdownOpen)}
                className="h-8 px-2.5 flex items-center gap-2 rounded-md border border-border bg-background text-foreground hover:bg-muted transition-colors cursor-pointer text-xs font-medium"
              >
                <FontAwesomeIcon icon={faUserCircle} className="h-3.5 w-3.5 text-primary" />
                <span className="hidden sm:inline font-mono truncate max-w-[150px]">{userEmail || 'Account'}</span>
                <FontAwesomeIcon icon={faChevronDown} className="h-2.5 w-2.5 opacity-60" />
              </button>

              {isProfileDropdownOpen && (
                <div className="absolute right-0 mt-1.5 w-56 rounded-lg border border-border bg-card shadow-lg py-1.5 z-50 text-xs animate-in fade-in-50 zoom-in-95">
                  <div className="px-3 py-2 border-b border-border mb-1">
                    <p className="text-[10px] text-muted-foreground">Signed in as</p>
                    <p className="font-mono font-bold truncate text-foreground">{userEmail}</p>
                  </div>
                  
                  <button
                    onClick={handleLogout}
                    className="w-full px-3 py-2 text-left flex items-center gap-2 text-destructive hover:bg-destructive/10 transition-colors cursor-pointer font-medium"
                  >
                    <FontAwesomeIcon icon={faRightFromBracket} className="h-3 w-3" />
                    <span>Sign Out</span>
                  </button>
                </div>
              )}
            </div>
          </div>
        </header>

        {/* Content Body */}
        <div className="flex-1 p-4 md:p-6 max-w-4xl w-full mx-auto space-y-6">
          {message && (
            <div className={`p-3 rounded-md text-xs font-medium border flex items-center justify-between ${
              message.type === 'success' 
                ? 'bg-emerald-500/10 text-emerald-600 dark:text-emerald-400 border-emerald-500/20' 
                : 'bg-destructive/10 text-destructive border-destructive/20'
            }`}>
              <div className="flex items-center gap-2">
                <FontAwesomeIcon icon={message.type === 'success' ? faCheckCircle : faExclamationTriangle} className="h-3.5 w-3.5 shrink-0" />
                <span>{message.text}</span>
              </div>
              <button onClick={() => setMessage(null)} className="text-[10px] opacity-70 hover:opacity-100 font-mono">Dismiss</button>
            </div>
          )}

          {/* Pair / Register Device Form */}
          <div className="space-y-2">
            <h2 className="text-xs font-bold uppercase tracking-wider text-muted-foreground flex items-center gap-2">
              <span className="h-1.5 w-1.5 rounded-full bg-primary" />
              Pair & Register Device
            </h2>

            <form onSubmit={handleRegisterDevice} className="border border-border rounded-xl bg-card p-5 space-y-4 shadow-xs">
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <div>
                  <label className="block text-[11px] font-medium text-muted-foreground mb-1.5">Select Available Terminal ID</label>
                  <div className="relative">
                    <select
                      value={selectedTerminalId}
                      onChange={(e) => setSelectedTerminalId(e.target.value)}
                      className="w-full bg-background text-xs text-foreground px-3 py-2.5 rounded-lg border border-input focus:outline-none focus:ring-2 focus:ring-primary font-mono cursor-pointer appearance-none shadow-2xs pr-8"
                    >
                      <option value="" className="bg-card text-muted-foreground">-- Select an available terminal ID --</option>
                      {unpairedTerminals.map((id) => (
                        <option key={id} value={id} className="bg-card text-foreground py-1">
                          {id}
                        </option>
                      ))}
                    </select>
                    <div className="absolute right-3 top-1/2 -translate-y-1/2 pointer-events-none text-muted-foreground text-[10px]">
                      ▼
                    </div>
                  </div>
                  {unpairedTerminals.length === 0 && (
                    <p className="text-[10px] text-muted-foreground mt-1.5 font-mono">No new unassigned terminal IDs detected yet.</p>
                  )}
                </div>

                <div>
                  <label className="block text-[11px] font-medium text-muted-foreground mb-1.5">Device Name</label>
                  <input
                    type="text"
                    required
                    placeholder="e.g. Device ##"
                    value={deviceName}
                    onChange={(e) => setDeviceName(e.target.value)}
                    className="w-full bg-background text-xs text-foreground px-3 py-2.5 rounded-lg border border-input focus:outline-none focus:ring-2 focus:ring-primary shadow-2xs"
                  />
                </div>
              </div>

              <div className="flex justify-end pt-2">
                <button
                  type="submit"
                  disabled={unpairedTerminals.length === 0}
                  className="px-5 py-2 bg-primary text-primary-foreground hover:bg-primary/90 text-xs font-semibold rounded-lg transition-all shadow-sm flex items-center gap-2 cursor-pointer disabled:opacity-50 disabled:cursor-not-allowed"
                >
                  <FontAwesomeIcon icon={faLink} className="h-3 w-3" />
                  <span>Pair Device</span>
                </button>
              </div>
            </form>
          </div>

          {/* Device Registry List */}
          <div className="space-y-2 pt-2">
            <h2 className="text-xs font-bold uppercase tracking-wider text-muted-foreground flex items-center gap-2">
              <span className="h-1.5 w-1.5 rounded-full bg-emerald-500" />
              Paired Devices ({devices.length})
            </h2>

            <div className="border border-border rounded-xl bg-card overflow-hidden shadow-xs">
              {loading ? (
                <div className="p-6 text-center text-xs font-mono text-muted-foreground animate-pulse">
                  Loading devices...
                </div>
              ) : devices.length === 0 ? (
                <div className="p-6 text-center text-xs text-muted-foreground">
                  No devices paired yet.
                </div>
              ) : (
                <div className="divide-y divide-border">
                  {devices.map((dev) => (
                    <div key={dev.id} className="p-4 flex items-center justify-between gap-3 hover:bg-muted/30 transition-colors">
                      <div>
                        <div className="text-xs font-bold text-foreground">{dev.device_name}</div>
                        <div className="text-[11px] font-mono text-muted-foreground mt-0.5">ID: {dev.terminal_id}</div>
                      </div>

                      <button
                        onClick={() => handleDeleteDevice(dev.terminal_id)}
                        className="px-3 py-1.5 text-xs font-semibold rounded-md bg-destructive/10 text-destructive hover:bg-destructive/20 border border-destructive/20 transition-colors flex items-center gap-1.5 shrink-0 cursor-pointer"
                      >
                        <FontAwesomeIcon icon={faTrash} className="h-3 w-3" />
                        <span>Unpair</span>
                      </button>
                    </div>
                  ))}
                </div>
              )}
            </div>
          </div>
        </div>
      </main>
    </div>
  );
}