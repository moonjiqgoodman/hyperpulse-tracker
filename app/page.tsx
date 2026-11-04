// app/page.tsx
'use client';

import React, { useEffect, useState, useRef } from 'react';
import { useRouter } from 'next/navigation';
import { FontAwesomeIcon } from '@fortawesome/react-fontawesome';
import { faSun, faMoon, faBars, faRightFromBracket, faChevronDown, faUserCircle } from '@fortawesome/free-solid-svg-icons';
import Sidebar from '@/components/sidebar';
import AssetMap from '@/components/map/asset-map';

interface TelemetryLog {
  id: number;
  terminal_id: string;
  latitude: number;
  longitude: number;
  address: string;
  recorded_at: string;
  timestamp_my?: string;
  battery_voltage?: number;
}

interface RegisteredDevice {
  id: number;
  terminal_id: string;
  device_name: string;
}

export default function DashboardPage() {
  const [isAuthenticated, setIsAuthenticated] = useState(false);
  const [userEmail, setUserEmail] = useState<string>('');
  const [devices, setDevices] = useState<TelemetryLog[]>([]);
  const [registeredDevices, setRegisteredDevices] = useState<RegisteredDevice[]>([]);
  const [deviceNames, setDeviceNames] = useState<Record<string, string>>({});
  const [selectedDevice, setSelectedDevice] = useState<string | null>(null);
  const [isMobileSidebarOpen, setIsMobileSidebarOpen] = useState<boolean>(false);
  const [, setLoading] = useState<boolean>(true);
  const [isDarkMode, setIsDarkMode] = useState(true);
  const [isProfileDropdownOpen, setIsProfileDropdownOpen] = useState<boolean>(false);
  
  const dropdownRef = useRef<HTMLDivElement>(null);
  const router = useRouter();

  // Initialize theme
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

  // Close dropdown when clicking outside
  useEffect(() => {
    function handleClickOutside(event: MouseEvent) {
      if (dropdownRef.current && !dropdownRef.current.contains(event.target as Node)) {
        setIsProfileDropdownOpen(false);
      }
    }
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

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

  // Fetch telemetry logs and registered devices array
  useEffect(() => {
    if (!isAuthenticated) return;

    async function fetchData() {
      try {
        const [logRes, deviceRes] = await Promise.all([
          fetch('/api/webhook/myriota'),
          fetch('/api/devices')
        ]);

        const logData = await logRes.json();
        if (Array.isArray(logData)) {
          setDevices(logData);
        }

        const deviceData = await deviceRes.json();
        if (deviceData.registered) {
          setRegisteredDevices(deviceData.registered);
          const map: Record<string, string> = {};
          deviceData.registered.forEach((d: RegisteredDevice) => {
            map[d.terminal_id] = d.device_name;
          });
          setDeviceNames(map);
        }
      } catch (err) {
        console.error('Failed to load dashboard data', err);
      } finally {
        setLoading(false);
      }
    }

    fetchData();
    const interval = setInterval(fetchData, 10000);
    return () => clearInterval(interval);
  }, [isAuthenticated]);

  const handleLogout = () => {
    localStorage.removeItem('isAuthenticated');
    localStorage.removeItem('userEmail');
    router.push('/login');
  };

  if (!isAuthenticated) {
    return (
      <div className="flex h-screen w-screen items-center justify-center bg-background text-foreground font-sans">
        <p className="text-xs font-mono text-muted-foreground animate-pulse">Checking session...</p>
      </div>
    );
  }

  // Determine display name for selected device (fallback to terminal_id if no name)
  const selectedDeviceName = selectedDevice 
    ? (deviceNames[selectedDevice] || selectedDevice) 
    : null;

  return (
    <div className="flex h-screen w-screen overflow-hidden bg-background text-foreground font-sans">
      <Sidebar 
        devices={devices} 
        selectedDevice={selectedDevice} 
        onSelectDevice={setSelectedDevice} 
        isOpen={isMobileSidebarOpen}
        onCloseMobile={() => setIsMobileSidebarOpen(false)}
      />

      <main className="flex-1 h-full relative flex flex-col overflow-y-auto">
        <header className="h-14 border-b border-border bg-card/30 backdrop-blur px-4 md:px-6 flex items-center justify-between z-10 shrink-0">
          <div className="flex items-center gap-3">
            {/* Mobile Hamburger Menu Button */}
            <button
              onClick={() => setIsMobileSidebarOpen(!isMobileSidebarOpen)}
              className="md:hidden h-8 w-8 flex items-center justify-center rounded-md border border-border bg-background text-foreground hover:bg-muted transition-colors cursor-pointer"
              title="Toggle Menu"
            >
              <FontAwesomeIcon icon={faBars} className="h-3.5 w-3.5" />
            </button>

            <div className="text-xs font-medium text-muted-foreground truncate max-w-[200px] sm:max-w-none">
              {selectedDeviceName ? (
                <span>Viewing: <strong className="text-foreground font-mono">{selectedDeviceName}</strong></span>
              ) : (
                <span>Select a device from the sidebar</span>
              )}
            </div>
          </div>

          {/* Right Actions: Theme Toggle & Account Profile Dropdown */}
          <div className="flex items-center gap-2.5">
            {/* Theme Toggle Button */}
            <button
              onClick={toggleTheme}
              className="h-8 w-8 flex items-center justify-center rounded-md border border-border bg-background text-foreground hover:bg-muted transition-colors cursor-pointer shrink-0"
              title={isDarkMode ? "Switch to Light Mode" : "Switch to Dark Mode"}
            >
              <FontAwesomeIcon icon={isDarkMode ? faSun : faMoon} className="h-3.5 w-3.5" />
            </button>

            {/* Account Profile Dropdown */}
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

        <div className="flex-1 bg-background p-6 overflow-y-auto">
          <AssetMap devices={devices} selectedDevice={selectedDevice} registeredDevices={registeredDevices} />
        </div>
      </main>
    </div>
  );
}