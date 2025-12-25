import { NextRequest } from "next/server";
import { downloadQueue, downloadQueueEvents } from "@/utils/queue";

interface ProgressData {
  percent?: number;
  message?: string | null;
  videoIndex?: number | null;
}

function normalizeProgress(progressValue: unknown): ProgressData {
  if (progressValue && typeof progressValue === "object") {
    const value = progressValue as {
      percent?: number;
      message?: string | null;
      videoIndex?: unknown;
    };
    return {
      percent: value.percent ?? 0,
      message: value.message || null,
      videoIndex:
        typeof value.videoIndex === "number" ? value.videoIndex : null,
    };
  }
  return {
    percent: typeof progressValue === "number" ? progressValue : 0,
    message: null,
    videoIndex: null,
  };
}

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id } = await params;
  if (!id) {
    return new Response(JSON.stringify({ error: "Job ID is required" }), {
      status: 400,
      headers: { "Content-Type": "application/json" },
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
          controller.enqueue(
            encoder.encode(`data: ${JSON.stringify(payload)}\n\n`),
          );
        } catch (e) {
          console.error("[SSE] Failed to send event", e);
        }
      };

      const cleanup = () => {
        if (cleanedUp) return;
        cleanedUp = true;
        clearInterval(heartbeatInterval);
        downloadQueueEvents.off("progress", progressHandler);
        downloadQueueEvents.off("completed", completedHandler);
        downloadQueueEvents.off("failed", failedHandler);
        try {
          controller.close();
        } catch {
          // Already closed
        }
      };

      heartbeatInterval = setInterval(() => {
        sendEvent({ type: "heartbeat", ts: Date.now() });
      }, 25000);

      const progressHandler = ({
        jobId,
        data,
      }: {
        jobId: string;
        data: unknown;
      }) => {
        if (`${jobId}` !== `${id}`) return;
        const normalized = normalizeProgress(data);
        sendEvent({ type: "progress", ...normalized });
      };

      const completedHandler = ({
        jobId,
        returnvalue,
      }: {
        jobId: string;
        returnvalue: unknown;
      }) => {
        if (`${jobId}` !== `${id}`) return;
        const raw =
          returnvalue && typeof returnvalue === "object"
            ? (returnvalue as Record<string, unknown>)
            : null;
        const downloadUrl =
          typeof raw?.downloadUrl === "string" ? raw.downloadUrl : null;
        const files = Array.isArray(raw?.files) ? raw.files : null;
        const folderPath =
          typeof raw?.folderPath === "string" ? raw.folderPath : null;
        sendEvent({
          type: "complete",
          url: downloadUrl,
          files,
          folderPath,
        });
        cleanup();
      };

      const failedHandler = ({
        jobId,
        failedReason,
      }: {
        jobId: string;
        failedReason: string;
      }) => {
        if (`${jobId}` !== `${id}`) return;
        sendEvent({
          type: "error",
          message: failedReason || "Job failed",
        });
        cleanup();
      };

      downloadQueueEvents.on("progress", progressHandler);
      downloadQueueEvents.on("completed", completedHandler);
      downloadQueueEvents.on("failed", failedHandler);

      try {
        const job = await downloadQueue.getJob(id);
        if (!job) {
          sendEvent({ type: "error", message: "Job not found" });
          cleanup();
          return;
        }

        const state = await job.getState();
        if (state === "completed") {
          const raw =
            job.returnvalue && typeof job.returnvalue === "object"
              ? (job.returnvalue as Record<string, unknown>)
              : null;
          const downloadUrl =
            typeof raw?.downloadUrl === "string" ? raw.downloadUrl : null;
          const files = Array.isArray(raw?.files) ? raw.files : null;
          const folderPath =
            typeof raw?.folderPath === "string" ? raw.folderPath : null;
          sendEvent({
            type: "complete",
            url: downloadUrl,
            files,
            folderPath,
          });
          cleanup();
          return;
        }

        if (state === "failed") {
          sendEvent({
            type: "error",
            message: job.failedReason || "Job failed",
          });
          cleanup();
          return;
        }

        const initialProgress = normalizeProgress(job.progress);
        sendEvent({
          type: "progress",
          ...initialProgress,
          message: initialProgress.message || "Waiting for worker...",
        });
      } catch (error) {
        console.error("[api/jobs/[id]/events] Failed to initialize SSE", error);
        sendEvent({ type: "error", message: "Unable to load job progress" });
        cleanup();
      }
    },
    cancel() {
      cleanedUp = true;
      clearInterval(heartbeatInterval);
    },
  });

  return new Response(stream, {
    headers: {
      "Content-Type": "text/event-stream",
      "Cache-Control": "no-cache, no-transform",
      Connection: "keep-alive",
    },
  });
}
