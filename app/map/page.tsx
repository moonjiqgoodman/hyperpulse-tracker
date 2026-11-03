import type { Metadata } from 'next';
import MapClient from '@/components/map/map-client';

export const metadata: Metadata = {
  title: 'Live Tracking Map',
  description: 'View real-time location and historical route trails.',
};

export default function MapPage() {
  return <MapClient />;
}