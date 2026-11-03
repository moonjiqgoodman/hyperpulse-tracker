import { NextResponse } from 'next/server';

// 1. In-memory variable to hold the latest data
let latestDeviceData = {
  terminal_id: 'WAITING_FOR_DATA',
  latitude: 0,
  longitude: 0,
  address: 'No data received yet',
  timestamp: new Date().toISOString()
};

// Helper: Translates coordinates to address
async function getAddressFromCoords(lat: number, lng: number) {
  if (lat === 0 && lng === 0) return "Unknown Location";
  try {
    const response = await fetch(
      `https://nominatim.openstreetmap.org/reverse?format=json&lat=${lat}&lon=${lng}`,
      { headers: { 'User-Agent': 'MyriotaAssetHawkTracker/1.0' } }
    );
    const data = await response.json();
    return data.display_name || "Address not found"; 
  } catch (error) {
    return "Address lookup failed";
  }
}

// ------------------------------------------------------------------
// POST: Myriota sends data here
// ------------------------------------------------------------------
export async function POST(request: Request) {
  try {
    const payload = await request.json();
    
    let myriotaData;
    try { myriotaData = JSON.parse(payload.Data); } 
    catch(e) { return NextResponse.json({ error: 'Data is not valid JSON' }, { status: 400 }); }
    
    const packet = myriotaData.Packets?.[0];
    if (!packet) return NextResponse.json({ error: 'No packet data' }, { status: 400 });

    let lat = 0.0;
    let lng = 0.0;
    
    // Extract and decode hex string
    let hexString = '';
    if (typeof packet.Value === 'string') {
      hexString = packet.Value;
    } else if (Array.isArray(packet.Value) && packet.Value[0]?.data) {
      hexString = packet.Value[0].data;
    }

    if (hexString && hexString.length >= 16) { 
      const buffer = Buffer.from(hexString, 'hex');
      lat = buffer.readFloatLE(0); 
      lng = buffer.readFloatLE(4); 
    }

    const currentAddress = await getAddressFromCoords(lat, lng);

    // 2. Update the in-memory variable with the new data
    latestDeviceData = {
      terminal_id: packet.TerminalId || packet.SerialNumber || 'UNKNOWN_ASSET',
      latitude: lat,
      longitude: lng,
      address: currentAddress,
      timestamp: new Date(packet.Timestamp).toISOString(),
    };

    console.log('✅ Updated Memory with:', latestDeviceData);
    return NextResponse.json({ status: 'success' }, { status: 200 });

  } catch (error) {
    console.error('❌ Webhook error:', error);
    return NextResponse.json({ status: 'error' }, { status: 500 });
  }
}

// ------------------------------------------------------------------
// GET: You visit the URL in your browser to see the JSON
// ------------------------------------------------------------------
export async function GET() {
  // 3. Spits out the latest data whenever you visit the link
  return NextResponse.json(latestDeviceData, { status: 200 });
}