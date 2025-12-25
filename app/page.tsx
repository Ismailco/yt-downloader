"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import Image from "next/image";
import UrlInput from "@/components/UrlInput";
import PlaylistSelector from "@/components/PlaylistSelector";
import ProgressList from "@/components/ProgressList";
import {
  AnalyzeResult,
  PlaylistItem,
  Job,
  FORMAT_OPTIONS,
  QUALITY_OPTIONS,
  FormatType,
  QualityType,
} from "@/types";

const JOBS_STORAGE_KEY = "yt-downloader:jobs";

export default function HomePage() {
  const [mode, setMode] = useState<"video" | "playlist">("video");
  const [selectedFormat, setSelectedFormat] = useState<FormatType>("mp4");
  const [selectedQuality, setSelectedQuality] = useState<QualityType>("best");
  const [url, setUrl] = useState("");
  const [analyzeResult, setAnalyzeResult] = useState<AnalyzeResult | null>(
    null,
  );
  const [selectedVideos, setSelectedVideos] = useState<string[]>([]);
  const [jobs, setJobs] = useState<Job[]>([]);
  const [submissionError, setSubmissionError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  useEffect(() => {
    try {
      const raw = window.localStorage.getItem(JOBS_STORAGE_KEY);
      if (!raw) {
        return;
      }
      const parsed = JSON.parse(raw) as unknown;
      if (!Array.isArray(parsed)) {
        return;
      }

      const restored = parsed
        .filter((item): item is { id: unknown; type: unknown } => !!item && typeof item === "object")
        .map((item) => item as { id: unknown; type: unknown })
        .filter(
          (item): item is { id: string; type: "video" | "playlist" } =>
            typeof item.id === "string" &&
            (item.type === "video" || item.type === "playlist"),
        )
        .map((item) => ({ id: item.id, type: item.type }));

      if (restored.length) {
        setJobs(restored);
      }
    } catch {
    }
  }, []);

  useEffect(() => {
    try {
      window.localStorage.setItem(JOBS_STORAGE_KEY, JSON.stringify(jobs));
    } catch {
    }
  }, [jobs]);

  const playlistItems = useMemo((): PlaylistItem[] => {
    if (!analyzeResult || !Array.isArray(analyzeResult.items)) {
      return [];
    }
    return analyzeResult.items.map((item) => ({
      id: item.id,
      title: item.title,
      thumbnail: item.thumbnail,
      duration: item.duration,
      channelTitle: item.channelTitle,
    }));
  }, [analyzeResult]);

  const handleAnalyze = useCallback(
    ({ url: analyzedUrl, data }: { url: string; data: AnalyzeResult }) => {
      setUrl(analyzedUrl);
      setAnalyzeResult(data);
      if (mode === "playlist") {
        setSelectedVideos(data.items ? data.items.map((item) => item.id) : []);
      } else {
        setSelectedVideos([]);
      }
    },
    [mode],
  );

  const handleStartDownload = async () => {
    if (!url) {
      setSubmissionError("Enter a URL first.");
      return;
    }
    setSubmitting(true);
    setSubmissionError(null);

    try {
      const payload =
        mode === "video"
          ? {
              url,
              format: selectedFormat,
              quality: selectedQuality,
            }
          : {
              url,
              selectedVideoIds: selectedVideos,
              options: {
                format: selectedFormat,
                quality: selectedQuality,
                selectedVideoIds: selectedVideos,
              },
            };

      const endpoint =
        mode === "video" ? "/api/download/video" : "/api/download/playlist";

      const response = await fetch(endpoint, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify(payload),
      });

      if (!response.ok) {
        const result = await response.json().catch(() => ({}));
        throw new Error(result.error || "Failed to start download");
      }

      const result = await response.json();
      setJobs((prev) => {
        const nextId = String(result.jobId);
        if (prev.some((job) => String(job.id) === nextId)) {
          return prev;
        }
        return [...prev, { id: nextId, type: mode }];
      });
    } catch (error) {
      setSubmissionError(
        error instanceof Error ? error.message : "An error occurred",
      );
    } finally {
      setSubmitting(false);
    }
  };

  const selectedQualityLabel = QUALITY_OPTIONS.find(
    (q) => q.value === selectedQuality,
  )?.label;

  return (
    <main className="min-h-screen bg-background text-foreground">
      <div className="mx-auto max-w-5xl px-6 py-12">
        <header className="mb-10">
          <div className="flex items-center justify-between gap-4">
            <div>
              <p className="text-sm font-semibold text-foreground">YT Downloader</p>
              <p className="mt-1 text-sm text-muted">
                Download single videos or playlists.
              </p>
            </div>
          </div>
        </header>

        <div className="grid gap-8 lg:grid-cols-3">
          <section className="ui-card p-6 lg:col-span-2">
            <div className="flex flex-wrap gap-2">
              {["video", "playlist"].map((value) => (
                <label
                  key={value}
                  className={`flex cursor-pointer items-center gap-3 rounded-lg border px-4 py-2.5 text-sm font-semibold transition ${
                    mode === value
                      ? "border-primary bg-primary/10 text-foreground"
                      : "border-border bg-card text-muted hover:bg-card-muted"
                  }`}
                >
                  <input
                    type="radio"
                    name="mode"
                    value={value}
                    checked={mode === value}
                    onChange={() => {
                      setMode(value as "video" | "playlist");
                      setAnalyzeResult(null);
                      setSelectedVideos([]);
                    }}
                    className="h-4 w-4 accent-primary"
                  />
                  {value === "video" ? "Single video" : "Playlist"}
                </label>
              ))}
            </div>

            <UrlInput
              className="mt-6"
              type={mode}
              onAnalyzeComplete={handleAnalyze}
              onUrlChange={setUrl}
            />

            <div className="mt-6 grid gap-6 md:grid-cols-2">
              <div>
                <label className="ui-label">Format</label>
                <select
                  value={selectedFormat}
                  onChange={(event) =>
                    setSelectedFormat(event.target.value as FormatType)
                  }
                  className="ui-select mt-2"
                >
                  {FORMAT_OPTIONS.map((option) => (
                    <option key={option.value} value={option.value}>
                      {option.label}
                    </option>
                  ))}
                </select>
              </div>

              <div>
                <label className="ui-label">Quality</label>
                <select
                  value={selectedQuality}
                  onChange={(event) =>
                    setSelectedQuality(event.target.value as QualityType)
                  }
                  className="ui-select mt-2"
                >
                  {QUALITY_OPTIONS.map((option) => (
                    <option key={option.value} value={option.value}>
                      {option.label}
                    </option>
                  ))}
                </select>
                <p className="ui-hint mt-1">{selectedQualityLabel}</p>
              </div>
            </div>

            {mode === "playlist" && (
              <PlaylistSelector
                className="mt-8"
                items={playlistItems}
                selectedIds={selectedVideos}
                onChange={setSelectedVideos}
              />
            )}

            {analyzeResult && (
              <div className="mt-6 rounded-xl border border-border bg-card-muted p-4">
                <p className="text-sm text-muted">Preview</p>
                <div className="mt-2 flex items-start gap-4">
                  {(analyzeResult.thumbnail || analyzeResult.items?.[0]?.thumbnail) && (
                    <Image
                      src={
                        analyzeResult.thumbnail ||
                        analyzeResult.items?.[0]?.thumbnail ||
                        ""
                      }
                      alt={analyzeResult.title}
                      width={160}
                      height={90}
                      className="h-[72px] w-[128px] shrink-0 rounded-lg object-cover"
                    />
                  )}
                  <div className="min-w-0">
                    <h3 className="text-lg font-semibold text-foreground">
                      {analyzeResult.title}
                    </h3>
                {analyzeResult.duration && (
                  <p className="mt-1 text-sm text-muted">
                    Duration: {analyzeResult.duration}
                  </p>
                )}
                {analyzeResult.items && (
                  <p className="mt-1 text-sm text-muted">
                    Playlist items detected: {analyzeResult.items.length}
                  </p>
                )}
                  </div>
                </div>
              </div>
            )}

            {submissionError && (
              <p className="mt-4 text-sm text-danger">{submissionError}</p>
            )}

            <div className="mt-6 flex flex-wrap gap-3">
              <button
                type="button"
                onClick={handleStartDownload}
                disabled={submitting}
                className="ui-button"
              >
                {submitting ? "Starting..." : "Start download"}
              </button>
            </div>
          </section>

          <aside className="ui-card p-6">
            <div className="flex items-center justify-between">
              <h2 className="text-lg font-semibold text-foreground">Jobs</h2>
              <span className="text-xs text-muted">
                Live progress & completion links
              </span>
            </div>
            <div className="mt-4">
              <ProgressList jobs={jobs} />
            </div>
          </aside>
        </div>
      </div>
    </main>
  );
}
