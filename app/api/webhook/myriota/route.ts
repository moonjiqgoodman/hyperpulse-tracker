import { NextResponse } from 'next/server';
import mysql from 'mysql2/promise';

const pool = mysql.createPool({
  host: process.env.DB_HOST || 'localhost',
  user: process.env.DB_USER || 'root',
  password: process.env.DB_PASSWORD || '',
  database: process.env.DB_NAME || 'hyperpulse_db',
  waitForConnections: true,
  connectionLimit: 10,
  queueLimit: 0,
});

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

export async function POST(request: Request) {
  try {
    const payload = await request.json();
    console.log('REC Payload:', JSON.stringify(payload, null, 2));

    let parsedData = payload;

    // If Myriota sent 'Data' as a stringified JSON, parse it first
    if (parsedData.Data && typeof parsedData.Data === 'string') {
      try {
        parsedData = JSON.parse(parsedData.Data);
      } catch (e) {
        // Keep as is if it fails
      }
    }

    // Extract packet structure from Packets array if present
    const packet = parsedData.Packets?.[0] || parsedData;

    // Resolve TerminalId from any level of the payload
    let terminalId = 
      packet.TerminalId || 
      packet.terminal_id || 
      parsedData.TerminalId || 
      parsedData.terminal_id || 
      payload.TerminalId || 
      'UNKNOWN_ASSET';

    // Extract the inner message value/data
    let innerVal = packet.Value || packet.Data || packet.message || packet;
    if (typeof innerVal === 'string') {
      try { innerVal = JSON.parse(innerVal); } catch (e) {}
    }

    const dataObj = Array.isArray(innerVal) ? innerVal[0] : (Array.isArray(packet.Data) ? packet.Data[0] : innerVal);

    const lat = parseFloat(dataObj?.latitude || dataObj?.lat || 0);
    const lng = parseFloat(dataObj?.longitude || dataObj?.lng || dataObj?.lon || 0);

    const currentAddress = await getAddressFromCoords(lat, lng);
    
    const rawTime = packet.Timestamp || dataObj?.time;
    const timestamp = rawTime
      ? new Date(rawTime * (String(rawTime).length === 10 ? 1000 : 1)).toISOString().slice(0, 19).replace('T', ' ')
      : new Date().toISOString().slice(0, 19).replace('T', ' ');

    const query = `
      INSERT INTO telemetry_logs (terminal_id, latitude, longitude, address, recorded_at) 
      VALUES (?, ?, ?, ?, ?)
    `;
    await pool.execute(query, [terminalId, lat, lng, currentAddress, timestamp]);

    console.log(`DB to ${terminalId} -> Lat: ${lat}, Lng: ${lng}`);
    return NextResponse.json({ status: 'success', terminalId, latitude: lat, longitude: lng }, { status: 200 });

  } catch (error) {
    console.error('Database save error:', error);
    return NextResponse.json({ status: 'error', message: 'Internal Server Error' }, { status: 500 });
  }
}

export async function GET() {
  try {
    const [rows] = await pool.execute(
      'SELECT * FROM telemetry_logs ORDER BY recorded_at DESC LIMIT 50'
    );
    return NextResponse.json(rows, { status: 200 });
  } catch (error) {
    console.error('Database fetch error:', error);
    return NextResponse.json({ error: 'Failed to fetch history' }, { status: 500 });
  }
}