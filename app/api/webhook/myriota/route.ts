import { NextResponse } from 'next/server';
import mysql from 'mysql2/promise';

// Initialize MySQL connection pool using environment variables
const pool = mysql.createPool({
  host: process.env.DB_HOST || 'localhost',
  user: process.env.DB_USER || 'root',
  password: process.env.DB_PASSWORD || '',
  database: process.env.DB_NAME || 'hyperpulse_db',
  waitForConnections: true,
  connectionLimit: 10,
  queueLimit: 0,
});

// Helper: Translates coordinates to a human-readable address
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
// POST: Myriota sends data -> Decodes, geocodes, and saves to MySQL
// ------------------------------------------------------------------
export async function POST(request: Request) {
  try {
    const payload = await request.json();
    console.log('📥 Raw Webhook Payload Received:', JSON.stringify(payload, null, 2));
    
    let myriotaData;
    try { 
      // Handle cases where payload.Data is a stringified JSON or an object
      myriotaData = typeof payload.Data === 'string' ? JSON.parse(payload.Data) : (payload.Data || payload); 
    } catch (e) { 
      return NextResponse.json({ error: 'Data is not valid JSON' }, { status: 400 }); 
    }
    
    const packet = myriotaData.Packets?.[0] || myriotaData;
    if (!packet) {
      return NextResponse.json({ error: 'No packet data' }, { status: 400 });
    }

    let lat = 0.0;
    let lng = 0.0;

    // 1. Check if latitude and longitude are sent directly as JSON properties (Myriota User Messages JSON format)
    let messageContent = packet.Data || packet.message || packet.Value;
    
    if (typeof messageContent === 'string') {
      try {
        messageContent = JSON.parse(messageContent);
      } catch (err) {
        // Not a direct JSON string, might be hex or raw text
      }
    }

    // Unpack if wrapped in an array (e.g. [{latitude: ..., longitude: ...}])
    const dataObj = Array.isArray(messageContent) ? messageContent[0] : messageContent;

    if (dataObj && typeof dataObj === 'object' && ('latitude' in dataObj || 'lat' in dataObj)) {
      lat = parseFloat(dataObj.latitude || dataObj.lat || 0);
      lng = parseFloat(dataObj.longitude || dataObj.lng || dataObj.lon || 0);
    } 
    // 2. Fallback: Extract and decode hex string coordinates if JSON fields are missing
    else {
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
    }

    const currentAddress = await getAddressFromCoords(lat, lng);
    const terminalId = packet.TerminalId || packet.terminal_id || packet.SerialNumber || 'UNKNOWN_ASSET';
    
    const timestamp = packet.Timestamp || packet.time
      ? new Date((packet.Timestamp || packet.time) * (String(packet.Timestamp || packet.time).length === 10 ? 1000 : 1)).toISOString().slice(0, 19).replace('T', ' ')
      : new Date().toISOString().slice(0, 19).replace('T', ' ');

    // Insert telemetry record into database
    const query = `
      INSERT INTO telemetry_logs (terminal_id, latitude, longitude, address, recorded_at) 
      VALUES (?, ?, ?, ?, ?)
    `;
    await pool.execute(query, [terminalId, lat, lng, currentAddress, timestamp]);

    console.log(`✅ Saved telemetry for terminal ${terminalId} -> Lat: ${lat}, Lng: ${lng}`);
    return NextResponse.json({ status: 'success', latitude: lat, longitude: lng }, { status: 200 });

  } catch (error) {
    console.error('❌ Database save error:', error);
    return NextResponse.json({ status: 'error', message: 'Internal Server Error' }, { status: 500 });
  }
}

// ------------------------------------------------------------------
// GET: Returns historical movement logs when visiting the endpoint
// ------------------------------------------------------------------
export async function GET() {
  try {
    // Fetch the last 50 historical records ordered by newest first
    const [rows] = await pool.execute(
      'SELECT * FROM telemetry_logs ORDER BY recorded_at DESC LIMIT 50'
    );
    
    return NextResponse.json(rows, { status: 200 });
  } catch (error) {
    console.error('❌ Database fetch error:', error);
    return NextResponse.json({ error: 'Failed to fetch history' }, { status: 500 });
  }
}