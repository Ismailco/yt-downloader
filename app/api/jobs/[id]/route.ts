import { NextRequest, NextResponse } from "next/server";
import { downloadQueue } from "@/utils/queue";

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id } = await params;
  if (!id) {
    return NextResponse.json({ error: "Job ID is required" }, { status: 400 });
  }

  try {
    const job = await downloadQueue.getJob(id);
    if (!job) {
      return NextResponse.json({ error: "Job not found" }, { status: 404 });
    }

    const state = await job.getState();
    const progress = job.progress || 0;
    const result = job.returnvalue || {};

    return NextResponse.json({
      id: job.id,
      state,
      progress,
      data: job.data,
      result,
      error: job.failedReason || null,
    });
  } catch (error) {
    console.error("[api/jobs/:id] Failed to fetch job status", error);
    return NextResponse.json(
      { error: "Unable to fetch job status" },
      { status: 500 },
    );
  }
}
