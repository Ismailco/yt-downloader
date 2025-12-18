'use client';

import { useCallback, useMemo, useState } from 'react';
import UrlInput from '@/components/UrlInput';
import PlaylistSelector from '@/components/PlaylistSelector';
import ProgressList from '@/components/ProgressList';

const API_KEY = process.env.NEXT_PUBLIC_API_KEY || '';

const FORMAT_OPTIONS = [
  { value: 'mp4', label: 'MP4 (video)' },
  { value: 'mp3', label: 'MP3 (audio)' }
];

const QUALITY_OPTIONS = [
  { value: 'best', label: 'Best available' },
  { value: '1080p', label: '1080p' },
  { value: '720p', label: '720p' },
  { value: 'audio', label: 'Audio only' }
];

export default function HomePage() {
  const [mode, setMode] = useState('video');
  const [selectedFormat, setSelectedFormat] = useState('mp4');
  const [selectedQuality, setSelectedQuality] = useState('best');
  const [url, setUrl] = useState('');
  const [analyzeResult, setAnalyzeResult] = useState<any>(null);
  const [selectedVideos, setSelectedVideos] = useState([] as string[]);
  const [jobs, setJobs] = useState([] as Array<{ id: string; type: string }>);
  const [submissionError, setSubmissionError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  const playlistItems = useMemo((): Array<{id: string; title: string; thumbnail?: string; duration?: string; channelTitle?: string}> => {
    if (!analyzeResult || !Array.isArray(analyzeResult.items)) {
      return [];
    }
    return analyzeResult.items.map((item: any) => ({
      id: item.id || item.videoId,
      title: item.title,
      thumbnail: item.thumbnail?.url || item.bestThumbnail?.url,
      duration: item.duration,
      channelTitle: item.author?.name || item.channelTitle
    }));
  }, [analyzeResult]);

  const handleAnalyze = useCallback(
    ({ url: analyzedUrl, data }: { url: string; data: any }) => {
      setUrl(analyzedUrl);
      setAnalyzeResult(data);
      if (mode === 'playlist') {
        setSelectedVideos(data.items ? data.items.map((item: any) => item.id || item.videoId) : []);
      } else {
        setSelectedVideos([]);
      }
    },
    [mode]
  );

  const handleStartDownload = async () => {
    if (!url) {
      setSubmissionError('Enter a URL first.');
      return;
    }
    setSubmitting(true);
    setSubmissionError(null);

    try {
      const payload =
        mode === 'video'
          ? {
              url,
              format: selectedFormat,
              quality: selectedQuality
            }
          : {
              url,
              options: {
                format: selectedFormat,
                quality: selectedQuality,
                selectedVideoIds: selectedVideos
              }
            };

      const endpoint =
        mode === 'video' ? '/api/download/video' : '/api/download/playlist';

      const response = await fetch(endpoint, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'x-api-key': API_KEY
        },
        body: JSON.stringify(payload)
      });

      if (!response.ok) {
        const result = await response.json().catch(() => ({}));
        throw new Error(result.error || 'Failed to start download');
      }

      const result = await response.json();
      setJobs((prev) => [...prev, { id: result.jobId, type: mode }]);
    } catch (error: any) {
      setSubmissionError(error.message);
    } finally {
      setSubmitting(false);
    }
  };

  const selectedQualityLabel = QUALITY_OPTIONS.find((q) => q.value === selectedQuality)?.label;

  return (
    <main className="min-h-screen bg-gradient-to-b from-slate-950 via-slate-900 to-slate-950 text-white">
      <div className="mx-auto max-w-5xl px-6 py-10">
        <header className="mb-10 text-center">
          <p className="text-sm uppercase tracking-[0.4em] text-cyan-300">Ytdown</p>
          <h1 className="mt-3 text-4xl font-semibold text-white md:text-5xl">
            Download videos & playlists effortlessly.
          </h1>
          <p className="mt-4 text-lg text-slate-400">
            Queue YouTube downloads, monitor progress in real time, and fetch files when ready.
          </p>
        </header>

        <div className="grid gap-8 lg:grid-cols-3">
          <section className="rounded-2xl border border-slate-800 bg-slate-900/70 p-6 lg:col-span-2">
            <div className="flex flex-wrap gap-3">
              {['video', 'playlist'].map((value) => (
                <label
                  key={value}
                  className={`flex cursor-pointer items-center gap-3 rounded-xl border px-4 py-3 text-sm font-semibold transition ${
                    mode === value
                      ? 'border-cyan-400 bg-cyan-400/10 text-white'
                      : 'border-slate-800 bg-slate-900/50 text-slate-300 hover:border-slate-700'
                  }`}
                >
                  <input
                    type="radio"
                    name="mode"
                    value={value}
                    checked={mode === value}
                    onChange={() => {
                      setMode(value);
                      setAnalyzeResult(null);
                      setSelectedVideos([]);
                    }}
                    className="h-4 w-4 accent-cyan-400"
                  />
                  {value === 'video' ? 'Single video' : 'Playlist'}
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
                <label className="text-sm text-slate-300">Format</label>
                <div className="mt-2 rounded-lg border border-slate-800 bg-slate-900/70 px-4 py-2">
                  <select
                    value={selectedFormat}
                    onChange={(event) => setSelectedFormat(event.target.value)}
                    className="w-full bg-transparent text-white focus:outline-none"
                  >
                    {FORMAT_OPTIONS.map((option) => (
                      <option key={option.value} value={option.value} className="bg-slate-900 text-white">
                        {option.label}
                      </option>
                    ))}
                  </select>
                </div>
              </div>

              <div>
                <label className="text-sm text-slate-300">Quality</label>
                <div className="mt-2 rounded-lg border border-slate-800 bg-slate-900/70 px-4 py-2">
                  <select
                    value={selectedQuality}
                    onChange={(event) => setSelectedQuality(event.target.value)}
                    className="w-full bg-transparent text-white focus:outline-none"
                  >
                    {QUALITY_OPTIONS.map((option) => (
                      <option key={option.value} value={option.value} className="bg-slate-900 text-white">
                        {option.label}
                      </option>
                    ))}
                  </select>
                </div>
                <p className="mt-1 text-xs text-slate-400">{selectedQualityLabel}</p>
              </div>
            </div>

            {mode === 'playlist' && (
              <PlaylistSelector
                className="mt-8"
                items={playlistItems}
                selectedIds={selectedVideos}
                onChange={setSelectedVideos}
              />
            )}

            {analyzeResult && (
              <div className="mt-6 rounded-xl border border-slate-800 bg-slate-900/60 p-4">
                <p className="text-sm text-slate-400">Preview</p>
                <h3 className="text-xl font-semibold text-white">{analyzeResult.title}</h3>
                {analyzeResult.duration && (
                  <p className="text-sm text-slate-400">Duration: {analyzeResult.duration}</p>
                )}
                {analyzeResult.items && (
                  <p className="text-sm text-slate-400">
                    Playlist items detected: {analyzeResult.items.length}
                  </p>
                )}
              </div>
            )}

            {submissionError && (
              <p className="mt-4 text-sm text-red-400">{submissionError}</p>
            )}

            <div className="mt-6 flex flex-wrap gap-3">
              <button
                type="button"
                onClick={handleStartDownload}
                disabled={submitting}
                className="flex items-center gap-2 rounded-lg bg-gradient-to-r from-cyan-400 to-blue-500 px-6 py-3 text-base font-semibold text-slate-950 shadow disabled:opacity-60"
              >
                {submitting ? 'Starting...' : 'Start download'}
              </button>
            </div>
          </section>

          <aside className="rounded-2xl border border-slate-800 bg-slate-900/70 p-6">
            <div className="flex items-center justify-between">
              <h2 className="text-lg font-semibold text-white">Active Jobs</h2>
              <span className="text-xs text-slate-400">
                Live progress & completion links
              </span>
            </div>
            <div className="mt-4">
              <ProgressList jobs={jobs} apiKey={API_KEY} />
            </div>
          </aside>
        </div>
      </div>
    </main>
  );
}
