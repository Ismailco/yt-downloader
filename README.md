# YT Downloader

A modern, self-hosted YouTube video and playlist downloader with a beautiful web UI, job queue system, and real-time progress tracking.

## Features

- **Video Downloads** - Download individual YouTube videos in MP4 or MP3 format
- **Playlist Downloads** - Download entire playlists with selective video picking
- **Audio Extraction** - Convert videos to MP3 using FFmpeg
- **Quality Selection** - Choose from best, 1080p, 720p, or audio-only
- **Real-time Progress** - Server-Sent Events (SSE) for live download progress
- **Job Queue** - BullMQ-powered background job processing with Redis
- **Secure Downloads** - HMAC-signed download tokens with expiration
- **Rate Limiting** - Built-in API rate limiting per IP
- **Docker Ready** - Full Docker Compose setup with Nginx reverse proxy
- **CLI Included** - Optional local CLI (`bin/ytdown`) for direct downloads

## Tech Stack

- **Frontend**: Next.js 16, React 19, TailwindCSS 4
- **Backend**: Next.js App Router API Routes
- **Queue**: BullMQ + Redis
- **Download**: `yt-dlp` (system binary), ytpl
- **Audio**: fluent-ffmpeg
- **Language**: TypeScript

## Prerequisites

- Node.js 20+
- pnpm 10+
- Redis 7+
- FFmpeg (for MP3 conversion)
- yt-dlp (for metadata + downloads when running outside Docker)

## Quick Start

### 1. Clone and Install

```bash
git clone git@github.com:Ismailco/yt-downloader.git
cd yt-downloader
pnpm install
```

### 2. Configure Environment

```bash
cp .env.example .env.local
# Edit .env.local with your settings
```

### 3. Start Redis

```bash
# Using Docker
docker run -d -p 6379:6379 redis:7-alpine

# Or install locally
# macOS: brew install redis && brew services start redis
# Ubuntu: sudo apt install redis-server && sudo systemctl start redis
```

### 4. Run Development Server

```bash
pnpm dev
```

### 5. Start the Worker (separate terminal)

```bash
pnpm worker:dev
```

Open [http://localhost:3000](http://localhost:3000) to use the app.

## Development (Docker)

Run the full stack (web + worker + redis) in Docker:

```bash
pnpm dev:docker
```

## Project Structure

```
├── app/                    # Next.js App Router
│   ├── api/               # API routes
│   │   ├── analyze/       # URL analysis endpoint
│   │   ├── download/      # Download job endpoints
│   │   ├── jobs/          # Job status & SSE events
│   │   └── files/         # Secure file serving
│   ├── layout.tsx         # Root layout
│   └── page.tsx           # Main UI page
├── components/            # React components
│   ├── PlaylistSelector.tsx
│   ├── ProgressList.tsx
│   └── UrlInput.tsx
├── lib/                   # Core libraries
│   ├── downloader/        # Download logic
│   └── middleware/        # Rate limiting, auth
├── workers/               # Background workers
│   └── downloadWorker.ts
├── utils/                 # Utilities
│   ├── queue.ts          # BullMQ setup
│   └── downloadToken.ts  # Token signing
├── scripts/              # Maintenance scripts
│   └── cleanup.ts        # Storage cleanup
├── deploy/               # Deployment configs
│   └── nginx.conf
├── docker-compose.yml
├── Dockerfile
└── Dockerfile.worker
```

## API Endpoints

All API endpoints are accessible without an API key.

| Method | Endpoint | Description |
|--------|----------|-------------|
| POST | `/api/analyze` | Analyze YouTube URL (video/playlist) |
| POST | `/api/download/video` | Queue a video download |
| POST | `/api/download/playlist` | Queue a playlist download |
| GET | `/api/jobs/[id]` | Get job status |
| GET | `/api/jobs/[id]/events` | SSE stream for job progress |
| GET | `/api/files/[jobId]/[file]` | Download completed file |

## Environment Variables

| Variable | Description | Default |
|----------|-------------|---------|
| `DOWNLOAD_TOKEN_SECRET` | Secret for signing download URLs | Required |
| `DOWNLOAD_TOKEN_TTL_SECONDS` | Download token TTL (seconds) | `3600` |
| `REDIS_URL` | Redis connection URL | `redis://localhost:6379` |
| `REDIS_HOST` | Redis host (if not using URL) | `127.0.0.1` |
| `REDIS_PORT` | Redis port (if not using URL) | `6379` |
| `REDIS_PASSWORD` | Redis password | - |
| `OUTPUT_BASE` | Base directory for downloads | `./` |
| `CONCURRENCY` | Worker concurrency | `2` |
| `STORAGE_TTL_HOURS` | Hours before cleanup | `24` |
| `WORKER_CONCURRENCY` | Alternative name for worker concurrency | `2` |
| `DOWNLOAD_EVENTS_CHANNEL` | Redis pub/sub channel for worker events | `download:events` |
| `JOB_ATTEMPTS` | BullMQ retry attempts | `3` |
| `JOB_BACKOFF_TYPE` | BullMQ backoff strategy | `exponential` |
| `JOB_BACKOFF_DELAY` | BullMQ backoff delay (ms) | `5000` |
| `JOB_REMOVE_ON_COMPLETE_AGE` | Remove completed jobs after (seconds) | `3600` |
| `YT_DLP_BIN` | Path to the `yt-dlp` binary | `/usr/local/bin/yt-dlp` |
| `YT_DLP_MOCK_JSON` | Test-only: bypass `yt-dlp` and return this JSON | - |

## Docker Deployment

### Using Docker Compose

```bash
# Set environment variables
export DOWNLOAD_TOKEN_SECRET=your-secure-secret

# Build and start all services
docker compose up -d

# View logs
docker compose logs -f
```

Important: the development Docker images install `yt-dlp`, but the production `Dockerfile` / `Dockerfile.worker` currently only install FFmpeg. For production containers, you must install `yt-dlp` (or provide it via a derived image) and ensure `YT_DLP_BIN` points to it.

### Services

- **web** - Next.js application (port 3000 internal)
- **worker** - Background download worker
- **redis** - Redis for job queue
- **nginx** - Reverse proxy (ports 80/443)

## Deploy Checklist

### Pre-deployment

- [ ] Generate secure `DOWNLOAD_TOKEN_SECRET` (min 32 characters)
- [ ] Configure Redis (consider Redis Cloud for production)
- [ ] Install/provide `yt-dlp` in your runtime environment and set `YT_DLP_BIN` if needed
- [ ] Set up SSL certificates for HTTPS
- [ ] Configure storage volume with adequate space
- [ ] Set appropriate `CONCURRENCY` based on server resources

### Security

- [ ] Use a strong, unique `DOWNLOAD_TOKEN_SECRET`
- [ ] Enable HTTPS via nginx
- [ ] Configure firewall (only expose ports 80/443)
- [ ] Set `NODE_ENV=production`
- [ ] Review rate limiting settings
- [ ] Set up log rotation

### Infrastructure

- [ ] Provision server (min 2GB RAM, 2 vCPUs recommended)
- [ ] Install Docker and Docker Compose
- [ ] Configure persistent volumes for storage
- [ ] Set up monitoring (optional: Prometheus, Grafana)
- [ ] Configure backup strategy for Redis

### Post-deployment

- [ ] Test video download functionality
- [ ] Test playlist download functionality
- [ ] Verify SSE progress updates work
- [ ] Test file download with token
- [ ] Optional: set up a cleanup job to remove old files (see `scripts/cleanup.ts`)
- [ ] Monitor disk space usage
- [ ] Set up alerting for failed jobs

### Production Nginx Config

Update `deploy/nginx.conf` with your domain and SSL certificates:

```nginx
server {
    listen 443 ssl http2;
    server_name yourdomain.com;

    ssl_certificate /etc/nginx/certs/fullchain.pem;
    ssl_certificate_key /etc/nginx/certs/privkey.pem;

    location / {
        proxy_pass http://web:3000;
        proxy_http_version 1.1;
        proxy_set_header Upgrade $http_upgrade;
        proxy_set_header Connection 'upgrade';
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto $scheme;
        proxy_cache_bypass $http_upgrade;
    }
}
```

## Scripts

```bash
# Development
pnpm dev              # Start Next.js dev server
pnpm worker:dev       # Start BullMQ worker
pnpm dev:docker       # Run web + worker + redis via Docker Compose
pnpm dev:docker:clean # Same as above, but removes volumes first
pnpm build            # Build for production
pnpm start            # Start production server
pnpm lint             # Run ESLint
pnpm test             # Run tests

# Maintenance
pnpm exec ts-node scripts/cleanup.ts   # Clean expired downloads
```

Note: `scripts/cleanup.ts` removes expired items from `./storage` and `./tmp` relative to the current working directory. Run it from the same directory used as `OUTPUT_BASE` (defaults to the project root).

## CLI Usage

A standalone CLI is also available:

```bash
# Download a video
./bin/ytdown -v https://youtube.com/watch?v=VIDEO_ID

# Download a playlist
./bin/ytdown -p https://youtube.com/playlist?list=PLAYLIST_ID
```

The CLI writes downloads to `~/Movies/Youtube_Downloader`.

## Troubleshooting

### Downloads fail immediately
- Ensure FFmpeg is installed: `ffmpeg -version`
- Ensure `yt-dlp` is available: `yt-dlp --version` (or confirm `YT_DLP_BIN` points to a valid binary)
- Verify Redis is running: `redis-cli ping`

### SSE not working
- Check if the worker is running
- Verify Redis pub/sub connection
- Check browser console for connection errors

### File downloads return 403
- Verify the download token is valid
- Check if the job completed successfully
- Token may have expired (re-request from job result)

## License

MIT

## Contributing

1. Fork the repository
2. Create your feature branch (`git checkout -b feature/amazing-feature`)
3. Commit your changes (`git commit -m 'Add amazing feature'`)
4. Push to the branch (`git push origin feature/amazing-feature`)
5. Open a Pull Request
