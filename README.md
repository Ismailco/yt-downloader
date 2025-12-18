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
- **API Key Protection** - Secure API endpoints with key authentication
- **Docker Ready** - Full Docker Compose setup with Nginx reverse proxy

## Tech Stack

- **Frontend**: Next.js 16, React 19, TailwindCSS 4
- **Backend**: Next.js App Router API Routes
- **Queue**: BullMQ + Redis
- **Download**: youtube-dl-exec, ytpl
- **Audio**: fluent-ffmpeg
- **Language**: TypeScript

## Prerequisites

- Node.js 20+
- pnpm 9+
- Redis 7+
- FFmpeg (for MP3 conversion)

## Quick Start

### 1. Clone and Install

```bash
git clone https://github.com/yourusername/yt-downloader.git
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
pnpm ts-node workers/downloadWorker.ts
```

Open [http://localhost:3000](http://localhost:3000) to use the app.

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

All API endpoints require the `x-api-key` header.

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
| `API_KEY` | API key for authentication | Required |
| `DOWNLOAD_TOKEN_SECRET` | Secret for signing download URLs | Required |
| `REDIS_URL` | Redis connection URL | `redis://localhost:6379` |
| `REDIS_HOST` | Redis host (if not using URL) | `127.0.0.1` |
| `REDIS_PORT` | Redis port (if not using URL) | `6379` |
| `REDIS_PASSWORD` | Redis password | - |
| `OUTPUT_BASE` | Base directory for downloads | `./` |
| `CONCURRENCY` | Worker concurrency | `2` |
| `STORAGE_TTL_HOURS` | Hours before cleanup | `24` |
| `NEXT_PUBLIC_API_KEY` | API key for frontend | Same as `API_KEY` |

## Docker Deployment

### Using Docker Compose

```bash
# Set environment variables
export API_KEY=your-secure-api-key
export DOWNLOAD_TOKEN_SECRET=your-secure-secret

# Build and start all services
docker compose up -d

# View logs
docker compose logs -f
```

### Services

- **web** - Next.js application (port 3000 internal)
- **worker** - Background download worker
- **redis** - Redis for job queue
- **nginx** - Reverse proxy (ports 80/443)

## Deploy Checklist

### Pre-deployment

- [ ] Generate secure `API_KEY` (min 32 characters)
- [ ] Generate secure `DOWNLOAD_TOKEN_SECRET` (min 32 characters)
- [ ] Configure Redis (consider Redis Cloud for production)
- [ ] Set up SSL certificates for HTTPS
- [ ] Configure storage volume with adequate space
- [ ] Set appropriate `CONCURRENCY` based on server resources

### Security

- [ ] Use strong, unique API key
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
- [ ] Set up cleanup cron job:
  ```bash
  # Run cleanup every 6 hours
  0 */6 * * * cd /app && pnpm ts-node scripts/cleanup.ts
  ```
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
pnpm build            # Build for production
pnpm start            # Start production server
pnpm lint             # Run ESLint
pnpm test             # Run tests

# Maintenance
pnpm ts-node scripts/cleanup.ts   # Clean expired downloads
```

## CLI Usage

A standalone CLI is also available:

```bash
# Download a video
./bin/ytdown https://youtube.com/watch?v=VIDEO_ID

# Download a playlist
./bin/ytdown https://youtube.com/playlist?list=PLAYLIST_ID
```

## Troubleshooting

### Downloads fail immediately
- Ensure FFmpeg is installed: `ffmpeg -version`
- Check youtube-dl-exec is working: `npx youtube-dl --version`
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
