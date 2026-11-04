'use client';

import React, { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import dynamic from 'next/dynamic';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import Sidebar from '@/components/sidebar';
import Topbar from '@/components/topbar';

const AssetMap = dynamic(() => import('@/components/map/asset-map'), {
  ssr: false,
  loading: () => (
    <div className="h-[500px] w-full flex items-center justify-center bg-muted rounded-xl text-muted-foreground text-xs">
      Loading map...
    </div>
  ),
});

interface TelemetryLog {
  id: number;
  terminal_id: string;
  latitude: number;
  longitude: number;
  address: string;
  recorded_at: string;
}

export default function MapClient() {
  const [isAuthenticated, setIsAuthenticated] = useState<boolean>(false);
  const [isCheckingAuth, setIsCheckingAuth] = useState<boolean>(true);
  const [devices, setDevices] = useState<TelemetryLog[]>([]);
  const [selectedDevice, setSelectedDevice] = useState<string | null>(null);
  const [isMobileSidebarOpen, setIsMobileSidebarOpen] = useState<boolean>(false);
  const router = useRouter();

  useEffect(() => {
    const auth = localStorage.getItem('isAuthenticated');
    if (!auth) {
      router.push('/login');
    } else {
      setIsAuthenticated(true);
    }
    setIsCheckingAuth(false);
  }, [router]);

  useEffect(() => {
    if (!isAuthenticated) return;

    async function fetchLogs() {
      try {
        const res = await fetch('/api/webhook/myriota');
        const data = await res.json();
        if (Array.isArray(data)) {
          setDevices(data);
        }
      } catch (err) {
        console.error('Failed to load telemetry logs', err);
      }
    }

    fetchLogs();
    const interval = setInterval(fetchLogs, 10000);
    return () => clearInterval(interval);
  }, [isAuthenticated]);

  if (isCheckingAuth || !isAuthenticated) {
    return (
      <div className="flex h-screen w-screen items-center justify-center bg-background text-foreground font-sans">
        <p className="text-xs font-mono text-muted-foreground animate-pulse">Verifying session...</p>
      </div>
    );
  }

  return (
    <div className="flex h-screen w-screen overflow-hidden bg-background text-foreground font-sans">
      <Sidebar 
        devices={devices} 
        selectedDevice={selectedDevice} 
        onSelectDevice={setSelectedDevice} 
        isOpen={isMobileSidebarOpen}
        onCloseMobile={() => setIsMobileSidebarOpen(false)}
      />

      <main className="flex-1 h-full overflow-y-auto flex flex-col">
        <Topbar 
          selectedDevice={selectedDevice} 
          onToggleSidebar={() => setIsMobileSidebarOpen(!isMobileSidebarOpen)} 
        />

        <div className="flex-1 p-6 md:p-8 pt-6 space-y-4">
          <div className="flex items-center justify-between space-y-2">
            <h2 className="text-2xl font-bold tracking-tight">Asset Tracking</h2>
          </div>
          
          <Card className="border-border shadow-none">
            <CardHeader>
              <CardTitle className="text-base font-semibold">Location View</CardTitle>
              <CardDescription className="text-xs">
                Real-time coordinate routing via satellite telemetry logs.
              </CardDescription>
            </CardHeader>
            <CardContent>
              <AssetMap devices={devices} selectedDevice={selectedDevice} />
            </CardContent>
          </Card>
        </div>
      </main>
    </div>
  );
}