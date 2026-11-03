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

    let dataObj: any = null;
    let terminalId = payload.TerminalId || payload.terminal_id || 'UNKNOWN_ASSET';

    if (Array.isArray(payload)) {
      dataObj = payload[0];
    } else {
      let targetData = payload.Data || payload.message || payload;
      if (typeof targetData === 'string') {
        try { targetData = JSON.parse(targetData); } catch (e) {}
      }
      dataObj = Array.isArray(targetData) ? targetData[0] : targetData;
    }

    const lat = parseFloat(dataObj?.latitude || dataObj?.lat || 0);
    const lng = parseFloat(dataObj?.longitude || dataObj?.lng || dataObj?.lon || 0);

    const currentAddress = await getAddressFromCoords(lat, lng);
    
    const timestamp = dataObj?.time
      ? new Date(dataObj.time * (String(dataObj.time).length === 10 ? 1000 : 1)).toISOString().slice(0, 19).replace('T', ' ')
      : new Date().toISOString().slice(0, 19).replace('T', ' ');

    const query = `
      INSERT INTO telemetry_logs (terminal_id, latitude, longitude, address, recorded_at) 
      VALUES (?, ?, ?, ?, ?)
    `;
    await pool.execute(query, [terminalId, lat, lng, currentAddress, timestamp]);

    console.log(`DB to ${terminalId} -> Lat: ${lat}, Lng: ${lng}`);
    return NextResponse.json({ status: 'success', latitude: lat, longitude: lng }, { status: 200 });

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