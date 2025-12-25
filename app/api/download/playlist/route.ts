import { NextRequest, NextResponse } from "next/server";
import { downloadQueue } from "@/utils/queue";
import { isAllowedYouTubeUrl } from "@/utils/youtubeUrl";
import { createRateLimiter } from "@/lib/middleware/rateLimit";

const RATE_LIMIT_WINDOW_MS = 60 * 1000;
const RATE_LIMIT_MAX = 5;
const checkRateLimit = createRateLimiter("download:playlist", {
  windowMs: RATE_LIMIT_WINDOW_MS,
  max: RATE_LIMIT_MAX,
});

export async function POST(request: NextRequest) {
  const forwardedFor = request.headers.get("x-forwarded-for") || undefined;
  const ip = forwardedFor ? forwardedFor.split(",")[0]?.trim() : undefined;
  const rate = checkRateLimit({ headers: { "x-forwarded-for": forwardedFor }, ip });
  if (!rate.allowed) {
    return NextResponse.json(
      { error: "Too many playlist download requests, please slow down." },
      { status: 429 },
    );
  }

  let body;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 });
  }

  const { url, options = {}, selectedVideoIds } = body || {};

  if (!url || typeof url !== "string") {
    return NextResponse.json(
      { error: "Missing required field: url" },
      { status: 400 },
    );
  }

  if (!isAllowedYouTubeUrl(url)) {
    return NextResponse.json(
      { error: "Only YouTube URLs are supported" },
      { status: 400 },
    );
  }

  try {
    const job = await downloadQueue.add(
      "playlist",
      {
        type: "playlist",
        url,
        options: {
          ...options,
          selectedVideoIds: Array.isArray(selectedVideoIds)
            ? selectedVideoIds
            : options.selectedVideoIds,
        },
        requestedAt: Date.now(),
      },
      {
        removeOnFail: false,
      },
    );

    return NextResponse.json({ jobId: job.id }, { status: 202 });
  } catch (error) {
    console.error("[api/download/playlist] Failed to enqueue job", error);
    return NextResponse.json(
      { error: "Unable to enqueue playlist job" },
      { status: 500 },
    );
  }
}
