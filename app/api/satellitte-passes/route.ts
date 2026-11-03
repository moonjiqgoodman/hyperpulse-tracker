import { NextResponse } from 'next/server';

export async function GET(request: Request) {
  const { searchParams } = new URL(request.url);
  const lat = searchParams.get('latitude') || '4.5975';
  const lng = searchParams.get('longitude') || '101.0901';
  
  // Allow passing custom time_from or default to current Unix timestamp
  const nowUnix = Math.floor(Date.now() / 1000);
  const timeFrom = searchParams.get('time_from') || nowUnix.toString();
  const limit = searchParams.get('limit') || '50';

  try {
    const response = await fetch(
      `https://api.myriota.com/v1/access-times?latitude=${lat}&longitude=${lng}&time_from=${timeFrom}&limit=${limit}`, 
      {
        headers: {
          'Authorization': process.env.MYRIOTA_API_TOKEN as string
        }
      }
    );

    if (!response.ok) {
      const errorText = await response.text();
      console.error('Myriota API error response:', errorText);
      throw new Error(`Myriota API error: ${response.statusText}`);
    }

    const data = await response.json();
    return NextResponse.json(data, { status: 200 });
  } catch (error) {
    console.error('Error fetching satellite passes:', error);
    return NextResponse.json({ error: 'Failed to fetch satellite passes' }, { status: 500 });
  }
}