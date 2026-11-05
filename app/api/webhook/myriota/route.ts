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

const VALID_CERT_URL = process.env.MYRIOTA_CERT_URL || "https://security.myriota.com/data-13f7751f3c5df569a6c9c42a9ce73a8a.crt";

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

    // 1. Strict Certificate URL Validation
    if (payload.CertificateUrl !== VALID_CERT_URL) {
      console.warn(`[Security Warning] Rejected payload with invalid or missing CertificateUrl: ${payload.CertificateUrl}`);
      return NextResponse.json({ status: 'error', message: 'Invalid or unauthorized CertificateUrl' }, { status: 403 });
    }

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
    const elevation = dataObj?.elevation !== undefined ? parseFloat(dataObj.elevation) : null;
    const temperature = dataObj?.temperature !== undefined ? parseFloat(dataObj.temperature) : null;
    const batteryVoltage = dataObj?.battery_voltage !== undefined ? parseFloat(dataObj.battery_voltage) : null;

    const currentAddress = await getAddressFromCoords(lat, lng);
    
    const rawTime = packet.Timestamp || dataObj?.time;
    const epochMs = rawTime ? rawTime * (String(rawTime).length === 10 ? 1000 : 1) : Date.now();

    // Standard UTC Timestamp string
    const timestampUtc = new Date(epochMs).toISOString().slice(0, 19).replace('T', ' ');

    // Malaysia Time (UTC+8) Calculation (+8 hours in milliseconds)
    const mytDate = new Date(epochMs + (8 * 60 * 60 * 1000));
    const timestampMy = mytDate.toISOString().slice(0, 19).replace('T', ' ');

    const query = `
      INSERT INTO telemetry_logs (terminal_id, latitude, longitude, elevation, temperature, address, battery_voltage, recorded_at, timestamp_my) 
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
    `;
    await pool.execute(query, [terminalId, lat, lng, elevation, temperature, currentAddress, batteryVoltage, timestampUtc, timestampMy]);

    console.log(`DB to ${terminalId} -> Lat: ${lat}, Lng: ${lng}, Elev: ${elevation}m, Temp: ${temperature}°C, Battery: ${batteryVoltage}V, MYT: ${timestampMy}`);
    return NextResponse.json({ status: 'success', terminalId, latitude: lat, longitude: lng, elevation, temperature, batteryVoltage, timestampMy }, { status: 200 });

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

export async function DELETE(request: Request) {
  try {
    const { searchParams } = new URL(request.url);
    const terminalId = searchParams.get('terminal_id');

    if (!terminalId) {
      return NextResponse.json({ error: 'Missing terminal_id' }, { status: 400 });
    }

    await pool.execute('DELETE FROM telemetry_logs WHERE terminal_id = ?', [terminalId]);
    return NextResponse.json({ status: 'success', message: `Deleted logs for ${terminalId}` }, { status: 200 });
  } catch (error) {
    console.error('Database delete error:', error);
    return NextResponse.json({ error: 'Failed to delete telemetry logs' }, { status: 500 });
  }
}