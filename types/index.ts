export interface PlaylistItem {
  id: string;
  title: string;
  thumbnail?: string;
  duration?: string;
  channelTitle?: string;
}

export interface AnalyzeResult {
  title: string;
  duration?: string;
  thumbnail?: string;
  items?: PlaylistItem[];
  type?: "video" | "playlist";
}

export interface DownloadOptions {
  format?: "mp4" | "mp3";
  quality?: "best" | "1080p" | "720p" | "audio";
  selectedVideoIds?: string[];
}

export interface VideoResult {
  filePath: string;
  format: string;
}

export interface PlaylistResult {
  folderPath: string;
  files: string[];
}

export interface JobProgress {
  percent: number;
  message: string;
  videoIndex?: number;
  totalVideos?: number;
  videoId?: string;
}

export interface Job {
  id: string;
  type: "video" | "playlist";
  status?: "waiting" | "active" | "completed" | "failed";
  progress?: JobProgress;
}

export interface DownloadJob extends Job {
  url: string;
  format: string;
  quality: string;
  options?: DownloadOptions;
}

export interface FileMeta {
  name: string;
  path: string;
  url: string;
}

export interface DownloadResult {
  downloadUrl: string | null;
  files: FileMeta[];
  folderPath?: string;
}

export interface ApiResponse<T = unknown> {
  success: boolean;
  data?: T;
  error?: string;
}

export interface ProgressCallback {
  (percent: number, message: string): void;
}

export interface PlaylistProgressCallback {
  (info: {
    videoIndex: number;
    percent: number;
    totalVideos: number;
    videoId: string;
    message: string;
  }): void;
}

export interface UrlInputProps {
  type?: string;
  onAnalyzeComplete?: (result: { url: string; data: AnalyzeResult }) => void;
  onUrlChange?: (url: string) => void;
  className?: string;
}

export interface PlaylistSelectorProps {
  items: PlaylistItem[];
  selectedIds: string[];
  onChange: (ids: string[]) => void;
  className?: string;
}

export interface ProgressListProps {
  jobs: Job[];
  apiKey?: string;
}

export const FORMAT_OPTIONS = [
  { value: "mp4" as const, label: "MP4 (video)" },
  { value: "mp3" as const, label: "MP3 (audio)" },
] as const;

export const QUALITY_OPTIONS = [
  { value: "best" as const, label: "Best available" },
  { value: "1080p" as const, label: "1080p" },
  { value: "720p" as const, label: "720p" },
  { value: "audio" as const, label: "Audio only" },
] as const;

export type FormatType = (typeof FORMAT_OPTIONS)[number]["value"];
export type QualityType = (typeof QUALITY_OPTIONS)[number]["value"];
