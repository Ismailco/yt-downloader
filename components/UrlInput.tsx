"use client";

import { useCallback, useEffect, useRef, useState, ChangeEvent } from "react";
import { UrlInputProps, AnalyzeResult } from "@/types";

export default function UrlInput({
  type,
  onAnalyzeComplete,
  onUrlChange,
  className = "",
}: UrlInputProps) {
  const [url, setUrl] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const debounceRef = useRef<number | null>(null);
  const abortRef = useRef<AbortController | null>(null);
  const lastAnalyzedKeyRef = useRef<string | null>(null);

  const handleInputChange = (event: ChangeEvent<HTMLInputElement>) => {
    const nextUrl = event.target.value;
    setUrl(nextUrl);
    setError(null);
    onUrlChange?.(nextUrl);
  };

  const analyzeUrl = useCallback(
    async (candidateUrl: string) => {
      const normalizedUrl = candidateUrl.trim();
      if (!normalizedUrl) {
        return;
      }

      abortRef.current?.abort();
      const controller = new AbortController();
      abortRef.current = controller;

      setLoading(true);
      setError(null);

      try {
        const response = await fetch("/api/analyze", {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
          },
          body: JSON.stringify({ url: normalizedUrl, type }),
          signal: controller.signal,
        });

        if (!response.ok) {
          const payload = await response.json().catch(() => ({}));
          throw new Error(payload.error || "Unable to analyze URL");
        }

        const data: AnalyzeResult = await response.json();
        lastAnalyzedKeyRef.current = `${type}:${normalizedUrl}`;
        onAnalyzeComplete?.({ url: normalizedUrl, data });
      } catch (err) {
        if (controller.signal.aborted) {
          return;
        }
        setError(err instanceof Error ? err.message : "An error occurred");
      } finally {
        if (!controller.signal.aborted) {
          setLoading(false);
        }
      }
    },
    [onAnalyzeComplete, type],
  );

  useEffect(() => {
    const trimmedUrl = url.trim();

    if (!trimmedUrl) {
      setLoading(false);
      setError(null);
      return;
    }

    if (!/^https?:\/\//i.test(trimmedUrl)) {
      return;
    }

    const analyzeKey = `${type}:${trimmedUrl}`;
    if (analyzeKey === lastAnalyzedKeyRef.current) {
      return;
    }

    if (debounceRef.current) {
      window.clearTimeout(debounceRef.current);
    }

    debounceRef.current = window.setTimeout(() => {
      void analyzeUrl(trimmedUrl);
    }, 450);

    return () => {
      if (debounceRef.current) {
        window.clearTimeout(debounceRef.current);
      }
    };
  }, [analyzeUrl, type, url]);

  return (
    <div className={`space-y-2 ${className}`}>
      <label className="ui-label" htmlFor="yt-url">
        YouTube URL
      </label>
      <div>
        <input
          id="yt-url"
          type="text"
          value={url}
          onChange={handleInputChange}
          placeholder="https://www.youtube.com/watch?v=..."
          className="ui-input"
        />
      </div>
      {loading && !error && <p className="ui-hint">Analyzing…</p>}
      {error && <p className="text-sm text-danger">{error}</p>}
    </div>
  );
}
