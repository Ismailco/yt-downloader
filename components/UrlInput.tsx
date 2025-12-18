"use client";

import { useState, ChangeEvent } from "react";
import { UrlInputProps, AnalyzeResult } from "@/types";

const API_KEY = process.env.NEXT_PUBLIC_API_KEY || "";

export default function UrlInput({
  type,
  onAnalyzeComplete,
  onUrlChange,
  className = "",
}: UrlInputProps) {
  const [url, setUrl] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const handleInputChange = (event: ChangeEvent<HTMLInputElement>) => {
    const nextUrl = event.target.value;
    setUrl(nextUrl);
    setError(null);
    onUrlChange?.(nextUrl);
  };

  const handleAnalyze = async () => {
    if (!url || !/^https?:\/\//i.test(url)) {
      setError("Please enter a valid URL (https://...)");
      return;
    }

    setLoading(true);
    setError(null);

    try {
      const response = await fetch("/api/analyze", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "x-api-key": API_KEY,
        },
        body: JSON.stringify({ url, type }),
      });

      if (!response.ok) {
        const payload = await response.json().catch(() => ({}));
        throw new Error(payload.error || "Unable to analyze URL");
      }

      const data: AnalyzeResult = await response.json();
      onAnalyzeComplete?.({ url, data });
    } catch (err) {
      setError(err instanceof Error ? err.message : "An error occurred");
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className={`space-y-2 ${className}`}>
      <label className="block text-sm font-medium text-slate-300">
        YouTube URL
      </label>
      <div className="flex flex-col gap-2 md:flex-row">
        <input
          type="text"
          value={url}
          onChange={handleInputChange}
          placeholder="https://www.youtube.com/watch?v=..."
          className="flex-1 rounded-md border border-slate-700 bg-slate-900/70 px-4 py-2 text-white focus:border-cyan-400 focus:outline-none"
        />
        <button
          type="button"
          onClick={handleAnalyze}
          disabled={loading}
          className="rounded-md bg-cyan-500 px-4 py-2 font-semibold text-slate-900 shadow disabled:opacity-60"
        >
          {loading ? "Analyzing..." : "Analyze"}
        </button>
      </div>
      {error && <p className="text-sm text-red-400">{error}</p>}
    </div>
  );
}
