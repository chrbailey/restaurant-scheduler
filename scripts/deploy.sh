#!/bin/bash
# =============================================================================
# Restaurant Scheduler - Deployment Script
# =============================================================================
# Usage: ./scripts/deploy.sh [options]
#
# Options:
#   --build-only    Build images without starting containers
#   --no-cache      Build without using cache
#   --pull          Pull latest base images before building
#   --down          Stop and remove containers
#   --logs          Follow logs after starting
# =============================================================================

set -e

# Colors for output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m' # No Color

# Script directory and project root
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
PROJECT_ROOT="$(dirname "$SCRIPT_DIR")"

# Default options
BUILD_ONLY=false
NO_CACHE=""
PULL=""
DOWN=false
FOLLOW_LOGS=false

# Parse arguments
while [[ $# -gt 0 ]]; do
    case $1 in
        --build-only)
            BUILD_ONLY=true
            shift
            ;;
        --no-cache)
            NO_CACHE="--no-cache"
            shift
            ;;
        --pull)
            PULL="--pull"
            shift
            ;;
        --down)
            DOWN=true
            shift
            ;;
        --logs)
            FOLLOW_LOGS=true
            shift
            ;;
        *)
            echo -e "${RED}Unknown option: $1${NC}"
            exit 1
            ;;
    esac
done

# Change to project root
cd "$PROJECT_ROOT"

echo -e "${BLUE}================================================${NC}"
echo -e "${BLUE}  Restaurant Scheduler - Deployment${NC}"
echo -e "${BLUE}================================================${NC}"
echo ""

# Check for required environment file
if [[ ! -f ".env" ]]; then
    echo -e "${YELLOW}Warning: .env file not found!${NC}"
    echo -e "Creating .env from .env.example..."

    if [[ -f "backend/.env.example" ]]; then
        cp backend/.env.example .env
        echo -e "${YELLOW}Please update .env with production values before deploying.${NC}"
        echo -e "${RED}Exiting to allow you to configure environment variables.${NC}"
        exit 1
    else
        echo -e "${RED}Error: No .env.example found. Please create a .env file.${NC}"
        exit 1
    fi
fi

# Source environment file
set -a
source .env
set +a

# Validate required environment variables
REQUIRED_VARS=("POSTGRES_PASSWORD" "JWT_SECRET")
MISSING_VARS=()

for var in "${REQUIRED_VARS[@]}"; do
    if [[ -z "${!var}" ]]; then
        MISSING_VARS+=("$var")
    fi
done

if [[ ${#MISSING_VARS[@]} -gt 0 ]]; then
    echo -e "${RED}Error: Missing required environment variables:${NC}"
    for var in "${MISSING_VARS[@]}"; do
        echo -e "  - $var"
    done
    exit 1
fi

# Handle --down option
if [[ "$DOWN" == true ]]; then
    echo -e "${YELLOW}Stopping and removing containers...${NC}"
    docker compose -f docker-compose.prod.yml down
    echo -e "${GREEN}Containers stopped.${NC}"
    exit 0
fi

# Build Docker images
echo -e "${GREEN}Building Docker images...${NC}"
echo ""

docker compose -f docker-compose.prod.yml build $NO_CACHE $PULL

echo ""
echo -e "${GREEN}Build complete!${NC}"

# Exit if build-only
if [[ "$BUILD_ONLY" == true ]]; then
    echo -e "${BLUE}Build-only mode - not starting containers.${NC}"
    exit 0
fi

# Start services
echo ""
echo -e "${GREEN}Starting services...${NC}"

docker compose -f docker-compose.prod.yml up -d

echo ""
echo -e "${GREEN}Services started!${NC}"
echo ""

# Wait for health checks
echo -e "${BLUE}Waiting for services to become healthy...${NC}"
sleep 5

# Check service status
docker compose -f docker-compose.prod.yml ps

echo ""
echo -e "${GREEN}================================================${NC}"
echo -e "${GREEN}  Deployment Complete!${NC}"
echo -e "${GREEN}================================================${NC}"
echo ""
echo -e "Web UI:     ${BLUE}http://localhost:${WEB_PORT:-80}${NC}"
echo -e "API:        ${BLUE}http://localhost:${WEB_PORT:-80}/api${NC}"
echo ""
echo -e "Useful commands:"
echo -e "  View logs:      ${YELLOW}docker compose -f docker-compose.prod.yml logs -f${NC}"
echo -e "  Stop services:  ${YELLOW}./scripts/deploy.sh --down${NC}"
echo -e "  Restart:        ${YELLOW}docker compose -f docker-compose.prod.yml restart${NC}"
echo ""

# Follow logs if requested
if [[ "$FOLLOW_LOGS" == true ]]; then
    echo -e "${BLUE}Following logs (Ctrl+C to exit)...${NC}"
    docker compose -f docker-compose.prod.yml logs -f
fi
