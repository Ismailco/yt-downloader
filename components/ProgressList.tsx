"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { ProgressListProps } from "@/types";

const API_BASE = "/api/jobs";

interface JobState {
  status?: string;
  percent?: number;
  message?: string;
  videoIndex?: number | null;
  downloadUrl?: string;
  files?: string[] | null;
  error?: string;
}

function mergeJobState(
  prev: Record<string, JobState>,
  jobId: string,
  patch: Partial<JobState>,
): Record<string, JobState> {
  return {
    ...prev,
    [jobId]: {
      ...(prev[jobId] || {}),
      ...patch,
    },
  };
}

export default function ProgressList({ jobs = [] }: ProgressListProps) {
  const [jobStates, setJobStates] = useState<Record<string, JobState>>({});
  const controllersRef = useRef<Record<string, AbortController>>({});

  const trackedJobIds = useMemo(
    () => jobs.map((job) => String(job.id || "")),
    [jobs],
  );

  useEffect(() => {
    trackedJobIds.forEach((jobId) => {
      if (!jobId || controllersRef.current[jobId]) {
        return;
      }

      const controller = new AbortController();
      controllersRef.current[jobId] = controller;

      const connect = async () => {
        try {
          const response = await fetch(`${API_BASE}/${jobId}/events`, {
            signal: controller.signal,
          });

          if (!response.ok || !response.body) {
            throw new Error(`SSE connection failed (${response.status})`);
          }

          const reader = response.body.getReader();
          const decoder = new TextDecoder();
          let buffer = "";

          while (true) {
            const { value, done } = await reader.read();
            if (done) break;

            buffer += decoder.decode(value, { stream: true });
            let idx;
            while ((idx = buffer.indexOf("\n\n")) >= 0) {
              const rawEvent = buffer.slice(0, idx);
              buffer = buffer.slice(idx + 2);

              const dataLine = rawEvent
                .split("\n")
                .find((line) => line.startsWith("data: "));
              if (!dataLine) continue;

              try {
                const payload = JSON.parse(dataLine.slice(6));
                if (payload.type === "progress") {
                  setJobStates((prev) =>
                    mergeJobState(prev, jobId, {
                      status: "active",
                      percent: payload.percent ?? 0,
                      message: payload.message,
                      videoIndex: payload.videoIndex ?? null,
                    }),
                  );
                } else if (payload.type === "complete") {
                  setJobStates((prev) =>
                    mergeJobState(prev, jobId, {
                      status: "completed",
                      percent: 100,
                      downloadUrl: payload.url || payload.folderPath,
                      files: payload.files || null,
                      message: "Download ready",
                    }),
                  );
                  controller.abort();
                  delete controllersRef.current[jobId];
                } else if (payload.type === "error") {
                  setJobStates((prev) =>
                    mergeJobState(prev, jobId, {
                      status: "failed",
                      percent: 0,
                      error: payload.message,
                    }),
                  );
                  controller.abort();
                  delete controllersRef.current[jobId];
                }
              } catch (err) {
                console.error("Failed to parse job event", err);
              }
            }
          }
        } catch {
          if (controller.signal.aborted) {
            return;
          }
          setJobStates((prev) =>
            mergeJobState(prev, jobId, {
              status: "reconnecting",
              message: "Connection lost. Retrying...",
            }),
          );
          delete controllersRef.current[jobId];
          setTimeout(() => {
            setJobStates((prev) =>
              mergeJobState(prev, jobId, { status: "reconnecting" }),
            );
          }, 3000);
        }
      };

      void connect();
    });

    return () => {
      Object.values(controllersRef.current).forEach((ctrl) => {
        ctrl.abort();
      });
      controllersRef.current = {};
    };
  }, [trackedJobIds]);

  if (!trackedJobIds.length) {
    return (
      <div className="rounded-xl border border-slate-800 bg-slate-900/50 p-6 text-center text-sm text-slate-400">
        No jobs yet. Start a download to watch progress.
      </div>
    );
  }

  return (
    <div className="space-y-4">
      {trackedJobIds.map((jobId) => {
        const state = jobStates[jobId] || {};
        const percent = Math.min(100, Math.max(0, state.percent ?? 0));
        return (
          <div
            key={jobId}
            className="rounded-xl border border-slate-800 bg-slate-900/60 p-4 shadow"
          >
            <div className="flex flex-wrap items-center justify-between gap-2">
              <div>
                <p className="text-sm font-semibold text-white">Job #{jobId}</p>
                <p className="text-xs text-slate-400">
                  {state.message || state.status || "Queued"}
                </p>
              </div>
              <span
                className={`text-xs font-semibold uppercase tracking-wide ${
                  state.status === "completed"
                    ? "text-emerald-400"
                    : state.status === "failed"
                      ? "text-red-400"
                      : "text-cyan-300"
                }`}
              >
                {state.status || "queued"}
              </span>
            </div>
            <div className="mt-3 h-2 rounded-full bg-slate-800">
              <div
                className="h-full rounded-full bg-linear-to-r from-cyan-400 to-blue-500 transition-all"
                style={{ width: `${percent}%` }}
              />
            </div>
            <div className="mt-3 flex flex-wrap items-center justify-between text-xs text-slate-400">
              <span>{percent.toFixed(0)}%</span>
              {typeof state.videoIndex === "number" && (
                <span>Video #{state.videoIndex + 1}</span>
              )}
              {state.downloadUrl && (
                <a
                  href={state.downloadUrl}
                  className="font-medium text-cyan-400"
                >
                  Open download
                </a>
              )}
            </div>
            {state.error && (
              <p className="mt-2 text-sm text-red-400">{state.error}</p>
            )}
          </div>
        );
      })}
    </div>
  );
}
