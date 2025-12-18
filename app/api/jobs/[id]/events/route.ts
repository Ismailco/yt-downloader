import { NextRequest } from 'next/server';
import { downloadQueue, downloadQueueEvents } from '@/utils/queue';

interface ProgressData {
  percent?: number;
  message?: string | null;
  videoIndex?: number | null;
}

function validateApiKey(request: NextRequest): boolean {
  const headerKey = request.headers.get('x-api-key');
  const url = new URL(request.url);
  const queryKey = url.searchParams.get('apiKey') || url.searchParams.get('apikey') || url.searchParams.get('token');
  const provided = headerKey || queryKey;
  return !!(process.env.API_KEY && provided === process.env.API_KEY);
}

function normalizeProgress(progressValue: any): ProgressData {
  if (progressValue && typeof progressValue === 'object') {
    return {
      percent: progressValue.percent ?? 0,
      message: progressValue.message || null,
      videoIndex: typeof progressValue.videoIndex === 'number' ? progressValue.videoIndex : null
    };
  }
  return {
    percent: typeof progressValue === 'number' ? progressValue : 0,
    message: null,
    videoIndex: null
  };
}

export async function GET(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  if (!validateApiKey(request)) {
    return new Response(JSON.stringify({ error: 'Unauthorized' }), {
      status: 401,
      headers: { 'Content-Type': 'application/json' }
    });
  }

  const { id } = await params;
  if (!id) {
    return new Response(JSON.stringify({ error: 'Job ID is required' }), {
      status: 400,
      headers: { 'Content-Type': 'application/json' }
    });
  }

  const encoder = new TextEncoder();
  let heartbeatInterval: ReturnType<typeof setInterval>;
  let cleanedUp = false;

  const stream = new ReadableStream({
    async start(controller) {
      const sendEvent = (payload: Record<string, unknown>) => {
        if (cleanedUp) return;
        try {
          controller.enqueue(encoder.encode(`data: ${JSON.stringify(payload)}\n\n`));
        } catch (e) {
          console.error('[SSE] Failed to send event', e);
        }
      };

      const cleanup = () => {
        if (cleanedUp) return;
        cleanedUp = true;
        clearInterval(heartbeatInterval);
        downloadQueueEvents.off('progress', progressHandler);
        downloadQueueEvents.off('completed', completedHandler);
        downloadQueueEvents.off('failed', failedHandler);
        try {
          controller.close();
        } catch (e) {
          // Already closed
        }
      };

      heartbeatInterval = setInterval(() => {
        sendEvent({ type: 'heartbeat', ts: Date.now() });
      }, 25000);

      const progressHandler = ({ jobId, data }: { jobId: string; data: any }) => {
        if (`${jobId}` !== `${id}`) return;
        const normalized = normalizeProgress(data);
        sendEvent({ type: 'progress', ...normalized });
      };

      const completedHandler = ({ jobId, returnvalue }: { jobId: string; returnvalue: any }) => {
        if (`${jobId}` !== `${id}`) return;
        sendEvent({
          type: 'complete',
          url: returnvalue?.downloadUrl || null,
          files: returnvalue?.files || null,
          folderPath: returnvalue?.folderPath || null
        });
        cleanup();
      };

      const failedHandler = ({ jobId, failedReason }: { jobId: string; failedReason: string }) => {
        if (`${jobId}` !== `${id}`) return;
        sendEvent({
          type: 'error',
          message: failedReason || 'Job failed'
        });
        cleanup();
      };

      downloadQueueEvents.on('progress', progressHandler);
      downloadQueueEvents.on('completed', completedHandler);
      downloadQueueEvents.on('failed', failedHandler);

      try {
        const job = await downloadQueue.getJob(id);
        if (!job) {
          sendEvent({ type: 'error', message: 'Job not found' });
          cleanup();
          return;
        }

        const initialProgress = normalizeProgress(job.progress);
        sendEvent({
          type: 'progress',
          ...initialProgress,
          message: initialProgress.message || 'Waiting for worker...'
        });
      } catch (error) {
        console.error('[api/jobs/[id]/events] Failed to initialize SSE', error);
        sendEvent({ type: 'error', message: 'Unable to load job progress' });
        cleanup();
      }
    },
    cancel() {
      cleanedUp = true;
      clearInterval(heartbeatInterval);
    }
  });

  return new Response(stream, {
    headers: {
      'Content-Type': 'text/event-stream',
      'Cache-Control': 'no-cache, no-transform',
      'Connection': 'keep-alive',
      'Access-Control-Allow-Origin': '*'
    }
  });
}
