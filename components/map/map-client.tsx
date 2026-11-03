// components/map/map-client.tsx
'use client';

import React from 'react';
import dynamic from 'next/dynamic';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';

const AssetMap = dynamic(() => import('@/components/map/asset-map'), {
  ssr: false,
  loading: () => (
    <div className="h-[500px] w-full flex items-center justify-center bg-muted rounded-xl text-muted-foreground">
      Loading map...
    </div>
  ),
});

export default function MapClient() {
  return (
    <div className="flex-1 space-y-4 p-8 pt-6">
      <div className="flex items-center justify-between space-y-2">
        <h2 className="text-3xl font-bold tracking-tight">Asset Live Tracking</h2>
      </div>
      
      <Card>
        <CardHeader>
          <CardTitle>Hyperpulse AssetHawk Location View</CardTitle>
          <CardDescription>
            Real-time coordinate tracking routed via Myriota Device Manager.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <AssetMap />
        </CardContent>
      </Card>
    </div>
  );
}