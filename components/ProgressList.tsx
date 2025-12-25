"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { ProgressListProps } from "@/types";

const API_BASE = "/api/jobs";

interface FileMeta {
  name: string;
  url: string;
}

interface JobState {
  status?: string;
  percent?: number;
  message?: string;
  videoIndex?: number | null;
  downloadUrl?: string;
  files?: FileMeta[] | null;
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
  const retryTimeoutsRef = useRef<Record<string, ReturnType<typeof setTimeout>>>(
    {},
  );

  const trackedJobIds = useMemo(
    () => jobs.map((job) => String(job.id || "")),
    [jobs],
  );

  useEffect(() => {
    trackedJobIds.forEach((jobId) => {
      if (!jobId || controllersRef.current[jobId]) {
        return;
      }

      const connect = async () => {
        if (controllersRef.current[jobId]) {
          return;
        }

        const controller = new AbortController();
        controllersRef.current[jobId] = controller;

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
                  const retryTimeout = retryTimeoutsRef.current[jobId];
                  if (retryTimeout) {
                    clearTimeout(retryTimeout);
                    delete retryTimeoutsRef.current[jobId];
                  }
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
                  const retryTimeout = retryTimeoutsRef.current[jobId];
                  if (retryTimeout) {
                    clearTimeout(retryTimeout);
                    delete retryTimeoutsRef.current[jobId];
                  }
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

          const existingTimeout = retryTimeoutsRef.current[jobId];
          if (existingTimeout) {
            clearTimeout(existingTimeout);
          }
          retryTimeoutsRef.current[jobId] = setTimeout(() => {
            delete retryTimeoutsRef.current[jobId];
            void connect();
          }, 3000);
        }
      };

      void connect();
    });

    return () => {
      Object.values(controllersRef.current).forEach((ctrl) => {
        ctrl.abort();
      });
      Object.values(retryTimeoutsRef.current).forEach((timeoutId) => {
        clearTimeout(timeoutId);
      });
      controllersRef.current = {};
      retryTimeoutsRef.current = {};
    };
  }, [trackedJobIds]);

  if (!trackedJobIds.length) {
    return (
      <div className="rounded-2xl border border-border bg-card-muted p-6 text-center text-sm text-muted">
        No jobs yet. Start a download to watch progress.
      </div>
    );
  }

  return (
    <div className="space-y-4">
      {trackedJobIds.map((jobId) => {
        const state = jobStates[jobId] || {};
        const percent = Math.min(100, Math.max(0, state.percent ?? 0));
        const files = Array.isArray(state.files) ? state.files : [];
        const isCompleted = state.status === "completed";
        const hasMultipleFiles = files.length > 1;
        let zipHref = `/api/files/${jobId}/zip`;
        if (hasMultipleFiles && files[0]?.url) {
          try {
            const token = new URL(files[0].url, window.location.origin).searchParams.get(
              "token",
            );
            if (token) {
              zipHref = `/api/files/${jobId}/zip?token=${encodeURIComponent(token)}`;
            }
          } catch {
          }
        }

        return (
          <div
            key={jobId}
            className="rounded-2xl border border-border bg-card p-4 shadow-sm"
          >
            <div className="flex flex-wrap items-center justify-between gap-2">
              <div>
                <p className="text-sm font-semibold text-foreground">Job #{jobId}</p>
                <p className="text-xs text-muted">
                  {state.message || state.status || "Queued"}
                </p>
              </div>
              <span
                className={`text-xs font-semibold uppercase tracking-wide ${
                  state.status === "completed"
                    ? "text-success"
                    : state.status === "failed"
                      ? "text-danger"
                      : "text-muted"
                }`}
              >
                {state.status || "queued"}
              </span>
            </div>
            <div className="mt-3 h-2 rounded-full bg-card-muted">
              <div
                className="h-full rounded-full bg-primary transition-all"
                style={{ width: `${percent}%` }}
              />
            </div>
            <div className="mt-3 flex flex-wrap items-center justify-between text-xs text-muted">
              <span>{percent.toFixed(0)}%</span>
              {typeof state.videoIndex === "number" && (
                <span>Video #{state.videoIndex + 1}</span>
              )}
            </div>

            {/* Show individual file download links when complete */}
            {isCompleted && files.length > 0 && (
              <div className="mt-4 space-y-2">
                <div className="flex items-center justify-between">
                  <p className="text-xs font-medium text-foreground">
                    {files.length} file{files.length > 1 ? "s" : ""} ready
                  </p>
                  {hasMultipleFiles && (
                    <a
                      href={zipHref}
                      className="ui-button-secondary px-3 py-1.5 text-xs"
                    >
                      <svg
                        className="h-3.5 w-3.5"
                        fill="none"
                        viewBox="0 0 24 24"
                        stroke="currentColor"
                      >
                        <path
                          strokeLinecap="round"
                          strokeLinejoin="round"
                          strokeWidth={2}
                          d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-4l-4 4m0 0l-4-4m4 4V4"
                        />
                      </svg>
                      Download All (ZIP)
                    </a>
                  )}
                </div>
                <div className="max-h-40 space-y-1 overflow-y-auto rounded-xl border border-border bg-card-muted p-2">
                  {files.map((file, idx) => (
                    <a
                      key={idx}
                      href={file.url}
                      className="flex items-center gap-2 rounded-lg px-2 py-1.5 text-xs text-foreground transition hover:bg-card"
                    >
                      <svg
                        className="h-3.5 w-3.5 shrink-0 text-muted"
                        fill="none"
                        viewBox="0 0 24 24"
                        stroke="currentColor"
                      >
                        <path
                          strokeLinecap="round"
                          strokeLinejoin="round"
                          strokeWidth={2}
                          d="M7 21h10a2 2 0 002-2V9.414a1 1 0 00-.293-.707l-5.414-5.414A1 1 0 0012.586 3H7a2 2 0 00-2 2v14a2 2 0 002 2z"
                        />
                      </svg>
                      <span className="truncate">{file.name}</span>
                    </a>
                  ))}
                </div>
              </div>
            )}

            {/* Fallback for single download URL when files array not available */}
            {isCompleted && files.length === 0 && state.downloadUrl && (
              <div className="mt-3">
                <a
                  href={state.downloadUrl}
                  className="ui-link text-xs"
                >
                  Open download
                </a>
              </div>
            )}

            {state.error && (
              <p className="mt-2 text-sm text-danger">{state.error}</p>
            )}
          </div>
        );
      })}
    </div>
  );
}
