'use client';

import { useEffect, useMemo, useRef, useState } from 'react';

const API_BASE = '/api/jobs';

interface Job {
  id?: string;
  jobId?: string;
  type?: string;
}

interface JobState {
  status?: string;
  percent?: number;
  message?: string;
  videoIndex?: number | null;
  downloadUrl?: string;
  files?: string[] | null;
  error?: string;
}

interface ProgressListProps {
  jobs?: Job[];
  apiKey?: string;
}

function mergeJobState(prev: Record<string, JobState>, jobId: string, patch: Partial<JobState>): Record<string, JobState> {
  return {
    ...prev,
    [jobId]: {
      ...(prev[jobId] || {}),
      ...patch
    }
  };
}

export default function ProgressList({ jobs = [], apiKey }: ProgressListProps) {
  const [jobStates, setJobStates] = useState<Record<string, JobState>>({});
  const sourcesRef = useRef<Record<string, EventSource>>({});

  const trackedJobIds = useMemo(
    () => jobs.map((job) => String(job.id || job.jobId || job)),
    [jobs]
  );

  useEffect(() => {
    trackedJobIds.forEach((jobId) => {
      if (!jobId || sourcesRef.current[jobId]) {
        return;
      }

      const url = `${API_BASE}/${jobId}/events${
        apiKey ? `?apiKey=${encodeURIComponent(apiKey)}` : ''
      }`;
      const source = new EventSource(url);
      sourcesRef.current[jobId] = source;

      source.onmessage = (event) => {
        try {
          const payload = JSON.parse(event.data);
          if (payload.type === 'progress') {
            setJobStates((prev) =>
              mergeJobState(prev, jobId, {
                status: 'active',
                percent: payload.percent ?? 0,
                message: payload.message,
                videoIndex: payload.videoIndex ?? null
              })
            );
          } else if (payload.type === 'complete') {
            setJobStates((prev) =>
              mergeJobState(prev, jobId, {
                status: 'completed',
                percent: 100,
                downloadUrl: payload.url || payload.folderPath,
                files: payload.files || null,
                message: 'Download ready'
              })
            );
            source.close();
            delete sourcesRef.current[jobId];
          } else if (payload.type === 'error') {
            setJobStates((prev) =>
              mergeJobState(prev, jobId, {
                status: 'failed',
                percent: 0,
                error: payload.message
              })
            );
            source.close();
            delete sourcesRef.current[jobId];
          }
        } catch (err) {
          console.error('Failed to parse job event', err);
        }
      };

      source.onerror = () => {
        setJobStates((prev) =>
          mergeJobState(prev, jobId, {
            status: 'reconnecting',
            message: 'Connection lost. Retrying...'
          })
        );
        source.close();
        delete sourcesRef.current[jobId];
        setTimeout(() => {
          setJobStates((prev) =>
            mergeJobState(prev, jobId, { status: 'reconnecting' })
          );
        }, 3000);
      };
    });

    return () => {
      Object.values(sourcesRef.current).forEach((src) => {
        src.close();
      });
      sourcesRef.current = {};
    };
  }, [trackedJobIds, apiKey]);

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
                <p className="text-sm font-semibold text-white">
                  Job #{jobId}
                </p>
                <p className="text-xs text-slate-400">
                  {state.message || state.status || 'Queued'}
                </p>
              </div>
              <span
                className={`text-xs font-semibold uppercase tracking-wide ${
                  state.status === 'completed'
                    ? 'text-emerald-400'
                    : state.status === 'failed'
                    ? 'text-red-400'
                    : 'text-cyan-300'
                }`}
              >
                {state.status || 'queued'}
              </span>
            </div>
            <div className="mt-3 h-2 rounded-full bg-slate-800">
              <div
                className="h-full rounded-full bg-gradient-to-r from-cyan-400 to-blue-500 transition-all"
                style={{ width: `${percent}%` }}
              />
            </div>
            <div className="mt-3 flex flex-wrap items-center justify-between text-xs text-slate-400">
              <span>{percent.toFixed(0)}%</span>
              {typeof state.videoIndex === 'number' && (
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
