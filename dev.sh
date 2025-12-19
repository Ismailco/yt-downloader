#!/bin/bash

# Development server startup script for YT Downloader
set -e

echo "🚀 Starting YT Downloader Development Environment..."

# Colors for output
GREEN='\033[0;32m'
BLUE='\033[0;34m'
YELLOW='\033[1;33m'
NC='\033[0m' # No Color

# Check if .env.local exists
if [ ! -f .env.local ]; then
    echo -e "${YELLOW}⚠️  .env.local not found. Creating from .env.example...${NC}"
    if [ -f .env.example ]; then
        cp .env.example .env.local
        echo -e "${GREEN}✅ Created .env.local from .env.example${NC}"
    else
        echo -e "${YELLOW}⚠️  No .env.example found. You may need to create .env.local manually.${NC}"
    fi
fi

# Stop any existing containers
echo -e "${BLUE}🛑 Stopping existing containers...${NC}"
docker compose -f docker-compose.yml -f docker-compose.dev.yml down 2>/dev/null || true

# Start development environment
echo -e "${BLUE}🔨 Building and starting development containers...${NC}"
docker compose -f docker-compose.yml -f docker-compose.dev.yml up --build

echo -e "${GREEN}🎉 Development environment stopped.${NC}"
