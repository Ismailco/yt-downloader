import { NextRequest, NextResponse } from 'next/server';
import { downloadQueue } from '@/utils/queue';

function validateApiKey(request: NextRequest): boolean {
  const authKey = request.headers.get('x-api-key');
  return !!(process.env.API_KEY && authKey === process.env.API_KEY);
}

export async function POST(request: NextRequest) {
  if (!validateApiKey(request)) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  let body;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: 'Invalid JSON body' }, { status: 400 });
  }

  const { url, format, quality } = body || {};

  if (!url) {
    return NextResponse.json({ error: 'Missing required field: url' }, { status: 400 });
  }

  try {
    const job = await downloadQueue.add(
      'video',
      {
        type: 'video',
        url,
        format: format || 'mp4',
        quality: quality || 'best',
        requestedAt: Date.now()
      },
      {
        removeOnFail: false
      }
    );

    return NextResponse.json({ jobId: job.id }, { status: 202 });
  } catch (error) {
    console.error('[api/download/video] Failed to enqueue job', error);
    return NextResponse.json({ error: 'Unable to enqueue download job' }, { status: 500 });
  }
}
