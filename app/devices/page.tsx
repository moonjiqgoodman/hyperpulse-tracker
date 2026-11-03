// app/devices/page.tsx
'use client';

import React, { useEffect, useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { FontAwesomeIcon } from '@fortawesome/react-fontawesome';
import { 
  faArrowLeft, 
  faMicrochip, 
  faLink, 
  faUnlink, 
  faCheckCircle, 
  faExclamationTriangle,
  faSun,
  faMoon,
  faRightFromBracket,
  faBars
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

export default function DeviceRegistryPage() {
  const [isAuthenticated, setIsAuthenticated] = useState(false);
  const [registeredDevices, setRegisteredDevices] = useState<RegisteredDevice[]>([]);
  const [telemetryLogs, setTelemetryLogs] = useState<TelemetryLog[]>([]);
  const [loading, setLoading] = useState<boolean>(true);
  const [inputNames, setInputNames] = useState<Record<string, string>>({});
  const [message, setMessage] = useState<{ type: 'success' | 'error'; text: string } | null>(null);
  const [isMobileSidebarOpen, setIsMobileSidebarOpen] = useState<boolean>(false);
  const [isDarkMode, setIsDarkMode] = useState(true);

  const router = useRouter();

  // 1. Check Authentication Session
  useEffect(() => {
    const auth = localStorage.getItem('isAuthenticated');
    if (!auth) {
      router.push('/login');
    } else {
      setIsAuthenticated(true);
    }
  }, [router]);

  // 2. Initialize Theme
  useEffect(() => {
    const root = document.documentElement;
    if (root.classList.contains('light')) {
      setIsDarkMode(false);
    } else {
      setIsDarkMode(true);
      root.classList.add('dark');
    }
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
        setRegisteredDevices(data.registered || []);
      }

      // Also fetch telemetry logs so the sidebar populates correctly
      const logRes = await fetch('/api/webhook/myriota');
      const logData = await logRes.json();
      if (Array.isArray(logData)) {
        setTelemetryLogs(logData);
      }
    } catch (err) {
      console.error('Failed to fetch device data', err);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    if (!isAuthenticated) return;
    fetchData();
  }, [isAuthenticated]);

  const handleRegister = async (terminalId: string) => {
    const deviceName = inputNames[terminalId];
    if (!deviceName || !deviceName.trim()) {
      setMessage({ type: 'error', text: 'Please enter a valid device name.' });
      return;
    }

    try {
      const res = await fetch('/api/devices', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ terminal_id: terminalId, device_name: deviceName }),
      });

      const data = await res.json();
      if (data.success) {
        setMessage({ type: 'success', text: `Device ${terminalId} successfully paired!` });
        setInputNames({ ...inputNames, [terminalId]: '' });
        fetchData();
      } else {
        setMessage({ type: 'error', text: data.message || 'Failed to pair device.' });
      }
    } catch (err) {
      setMessage({ type: 'error', text: 'An unexpected error occurred.' });
    }
  };

  const handleUnregister = async (terminalId: string) => {
    if (!confirm(`Are you sure you want to unpair device ${terminalId}?`)) return;

    try {
      const res = await fetch(`/api/devices?terminal_id=${encodeURIComponent(terminalId)}`, {
        method: 'DELETE',
      });

      const data = await res.json();
      if (data.success) {
        setMessage({ type: 'success', text: `Device ${terminalId} successfully unpaired.` });
        fetchData();
      } else {
        setMessage({ type: 'error', text: data.message || 'Failed to unpair device.' });
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

  const registeredIds = new Set(registeredDevices.map((d) => d.terminal_id));
  const uniqueTelemetryIdsMap = new Map();
  telemetryLogs.forEach((d) => {
    if (!uniqueTelemetryIdsMap.has(d.terminal_id)) {
      uniqueTelemetryIdsMap.set(d.terminal_id, d);
    }
  });
  const telemetryTerminals = Array.from(uniqueTelemetryIdsMap.keys());
  const unregisteredTerminals = telemetryTerminals.filter((id) => !registeredIds.has(id));

  return (
    <div className="flex h-screen w-screen overflow-hidden bg-background text-foreground font-sans">
      {/* Sidebar Component */}
      <Sidebar 
        devices={telemetryLogs} 
        selectedDevice={null} 
        onSelectDevice={() => router.push('/')} 
        isOpen={isMobileSidebarOpen}
        onCloseMobile={() => setIsMobileSidebarOpen(false)}
      />

      {/* Main Content Area */}
      <main className="flex-1 h-full overflow-y-auto flex flex-col">
        {/* Top Header Bar matching Dashboard layout */}
<header className="h-14 border-b border-border bg-card/30 backdrop-blur px-4 md:px-6 flex items-center justify-between shrink-0 z-10">
          <div className="flex items-center gap-3">
            {/* Mobile Hamburger Menu Button */}
            <button
              onClick={() => setIsMobileSidebarOpen(!isMobileSidebarOpen)}
              className="md:hidden h-8 w-8 flex items-center justify-center rounded-md border border-border bg-background text-foreground hover:bg-muted transition-colors cursor-pointer"
              title="Toggle Menu"
            >
              <FontAwesomeIcon icon={faBars} className="h-3.5 w-3.5" />
            </button>

            <div className="flex items-center gap-2 text-xs font-semibold">
              <FontAwesomeIcon icon={faMicrochip} className="text-primary" />
              <span className="hidden sm:inline">Device Registry & Management</span>
            </div>
          </div>

          {/* Right Actions: Theme Toggle & Sign Out */}
          <div className="flex items-center gap-2">
            <button
              onClick={toggleTheme}
              className="h-8 w-8 flex items-center justify-center rounded-md border border-border bg-background text-foreground hover:bg-muted transition-colors cursor-pointer shrink-0"
              title={isDarkMode ? "Switch to Light Mode" : "Switch to Dark Mode"}
            >
              <FontAwesomeIcon icon={isDarkMode ? faSun : faMoon} className="h-3.5 w-3.5" />
            </button>

            <button
              onClick={handleLogout}
              className="h-8 px-3 flex items-center gap-1.5 rounded-md border border-destructive/20 bg-destructive/10 text-destructive text-xs font-semibold hover:bg-destructive/20 transition-colors cursor-pointer shrink-0"
              title="Sign Out"
            >
              <FontAwesomeIcon icon={faRightFromBracket} className="h-3 w-3" />
              <span className="hidden sm:inline">Sign Out</span>
            </button>
          </div>
        </header>

        {/* Content Body */}
        <div className="flex-1 p-6 md:p-8 max-w-5xl w-full mx-auto space-y-6">
          {message && (
            <div className={`p-4 rounded-lg text-xs font-medium border flex items-center gap-2 ${
              message.type === 'success' 
                ? 'bg-emerald-500/10 text-emerald-600 dark:text-emerald-400 border-emerald-500/20' 
                : 'bg-destructive/10 text-destructive border-destructive/20'
            }`}>
              <FontAwesomeIcon icon={message.type === 'success' ? faCheckCircle : faExclamationTriangle} className="h-4 w-4 shrink-0" />
              <span>{message.text}</span>
            </div>
          )}

          {loading ? (
            <div className="text-center py-20 text-xs font-mono text-muted-foreground animate-pulse">
              Loading device registry...
            </div>
          ) : (
            <>
              {/* Section 1: Unregistered Terminals */}
              <div className="space-y-3">
                <div>
                  <h2 className="text-sm font-semibold tracking-tight flex items-center gap-2">
                    <span className="h-2 w-2 rounded-full bg-amber-500" />
                    Unregistered Terminals ({unregisteredTerminals.length})
                  </h2>
                  <p className="text-xs text-muted-foreground">
                    Active terminal IDs receiving satellite telemetry packets that have not yet been assigned a friendly name.
                  </p>
                </div>

                <div className="border border-border rounded-xl bg-card overflow-hidden">
                  {unregisteredTerminals.length === 0 ? (
                    <div className="p-6 text-center text-xs text-muted-foreground">
                      All active terminals are successfully registered and paired.
                    </div>
                  ) : (
                    <div className="divide-y divide-border">
                      {unregisteredTerminals.map((terminalId: string) => (
                        <div key={terminalId} className="p-4 flex flex-col sm:flex-row sm:items-center justify-between gap-4">
                          <div>
                            <span className="font-mono text-xs font-bold text-foreground">{terminalId}</span>
                            <span className="block text-[10px] text-muted-foreground mt-0.5">Status: Unpaired</span>
                          </div>
                          <div className="flex items-center gap-2">
                            <input
                              type="text"
                              placeholder="Enter Device Name (e.g., Tracker 1)"
                              value={inputNames[terminalId] || ''}
                              onChange={(e) => setInputNames({ ...inputNames, [terminalId]: e.target.value })}
                              className="bg-background text-xs text-foreground px-3 py-1.5 rounded-md border border-input focus:outline-none focus:ring-1 focus:ring-ring w-56 sm:w-64"
                            />
                            <button
                              onClick={() => handleRegister(terminalId)}
                              className="px-3.5 py-1.5 bg-primary text-primary-foreground hover:bg-primary/90 text-xs font-semibold rounded-md transition-colors flex items-center gap-1.5 cursor-pointer shrink-0"
                            >
                              <FontAwesomeIcon icon={faLink} className="h-3 w-3" />
                              <span>Pair</span>
                            </button>
                          </div>
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              </div>

              {/* Section 2: Registered Devices */}
              <div className="space-y-3">
                <div>
                  <h2 className="text-sm font-semibold tracking-tight flex items-center gap-2">
                    <span className="h-2 w-2 rounded-full bg-emerald-500" />
                    Registered Devices ({registeredDevices.length})
                  </h2>
                  <p className="text-xs text-muted-foreground">
                    Terminals successfully paired with custom friendly names for dashboard display.
                  </p>
                </div>

                <div className="border border-border rounded-xl bg-card overflow-hidden">
                  {registeredDevices.length === 0 ? (
                    <div className="p-6 text-center text-xs text-muted-foreground">
                      No registered devices found. Pair a terminal ID above to get started.
                    </div>
                  ) : (
                    <div className="divide-y divide-border">
                      {registeredDevices.map((device) => (
                        <div key={device.id} className="p-4 flex flex-col sm:flex-row sm:items-center justify-between gap-4">
                          <div>
                            <div className="flex items-center gap-2">
                              <span className="text-xs font-bold text-foreground">{device.device_name}</span>
                              <span className="text-[10px] font-mono px-1.5 py-0.5 rounded bg-muted text-muted-foreground border border-border">
                                Paired
                              </span>
                            </div>
                            <span className="font-mono text-[11px] text-muted-foreground mt-0.5 block">{device.terminal_id}</span>
                          </div>
                          <div className="flex items-center gap-3">
                            <span className="text-[10px] font-mono text-muted-foreground hidden md:inline">
                              Registered: {new Date(device.created_at).toLocaleString()}
                            </span>
                            <button
                              onClick={() => handleUnregister(device.terminal_id)}
                              className="px-3.5 py-1.5 bg-destructive/10 text-destructive hover:bg-destructive/20 border border-destructive/20 text-xs font-semibold rounded-md transition-colors flex items-center gap-1.5 cursor-pointer shrink-0"
                            >
                              <FontAwesomeIcon icon={faUnlink} className="h-3 w-3" />
                              <span>Unpair</span>
                            </button>
                          </div>
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              </div>
            </>
          )}
        </div>
      </main>
    </div>
  );
}