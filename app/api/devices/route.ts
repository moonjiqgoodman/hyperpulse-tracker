import { NextResponse } from 'next/server';
import { pool } from '@/lib/db';

export async function GET() {
  try {
    const [devices]: any = await pool.query('SELECT * FROM devices ORDER BY created_at DESC');
    const [logs]: any = await pool.query('SELECT DISTINCT terminal_id FROM telemetry_logs');

    return NextResponse.json({
      registered: devices,
      telemetryTerminals: logs.map((l: any) => l.terminal_id),
    });
  } catch (error) {
    console.error('Failed to fetch device registry:', error);
    return NextResponse.json({ error: 'Internal Server Error' }, { status: 500 });
  }
}

export async function POST(request: Request) {
  try {
    const { terminal_id, device_name } = await request.json();

    if (!terminal_id || !device_name) {
      return NextResponse.json({ success: false, message: 'Terminal ID and Device Name are required' }, { status: 400 });
    }

    await pool.query(
      `INSERT INTO devices (terminal_id, device_name) VALUES (?, ?)
       ON DUPLICATE KEY UPDATE device_name = ?`,
      [terminal_id.trim(), device_name.trim(), device_name.trim()]
    );

    return NextResponse.json({ success: true, message: 'Device successfully registered' });
  } catch (error) {
    console.error('Failed to register device:', error);
    return NextResponse.json({ success: false, message: 'Internal Server Error' }, { status: 500 });
  }
}

export async function DELETE(request: Request) {
  try {
    const { searchParams } = new URL(request.url);
    const terminal_id = searchParams.get('terminal_id');

    if (!terminal_id) {
      return NextResponse.json({ success: false, message: 'Terminal ID is required' }, { status: 400 });
    }

    await pool.query('DELETE FROM devices WHERE terminal_id = ?', [terminal_id]);

    return NextResponse.json({ success: true, message: 'Device unregistered successfully' });
  } catch (error) {
    console.error('Failed to delete device registration:', error);
    return NextResponse.json({ success: false, message: 'Internal Server Error' }, { status: 500 });
  }
}