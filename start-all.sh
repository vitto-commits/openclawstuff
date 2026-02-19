#!/bin/bash
set -e

echo "🚀 Agent Dashboard - Starting all services..."
echo ""

# Colors
GREEN='\033[0;32m'
BLUE='\033[0;34m'
YELLOW='\033[1;33m'
NC='\033[0m' # No Color

# Get the directory where this script is located
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
API_SERVER_DIR="$SCRIPT_DIR/api-server"
FRONTEND_DIR="$SCRIPT_DIR"

# Create log directory
LOG_DIR="/tmp/agent-dashboard"
mkdir -p "$LOG_DIR"

echo -e "${BLUE}📂 Workspace: $SCRIPT_DIR${NC}"
echo ""

# ============ Start API Server ============
echo -e "${BLUE}▶️  Starting API Server...${NC}"
cd "$API_SERVER_DIR"

# Check if node_modules exists
if [ ! -d "node_modules" ]; then
  echo "   Installing dependencies..."
  npm install > "$LOG_DIR/api-install.log" 2>&1
fi

# Check if dist exists
if [ ! -d "dist" ]; then
  echo "   Building TypeScript..."
  npm run build > "$LOG_DIR/api-build.log" 2>&1
fi

# Start the API server in the background
npm start > "$LOG_DIR/api-server.log" 2>&1 &
API_PID=$!
echo -e "${GREEN}   ✓ API Server started (PID: $API_PID)${NC}"
echo "   Logs: tail -f $LOG_DIR/api-server.log"

# Wait for API server to start
echo "   Waiting for API server to be ready..."
sleep 3

# Check if API server is running
if ! kill -0 $API_PID 2>/dev/null; then
  echo -e "${YELLOW}   ⚠️  API Server failed to start. Check logs:${NC}"
  cat "$LOG_DIR/api-server.log"
  exit 1
fi

# Test API server
if curl -s http://localhost:3001/health > /dev/null 2>&1; then
  echo -e "${GREEN}   ✓ API Server is healthy${NC}"
else
  echo -e "${YELLOW}   ⚠️  API Server health check failed (it may still be starting)${NC}"
fi

echo ""

# ============ Show usage info ============
echo -e "${BLUE}✨ Services running:${NC}"
echo ""
echo -e "${GREEN}  API Server:${NC}"
echo "    Local:  http://localhost:3001"
echo "    Health: curl http://localhost:3001/health"
echo ""

# Check if cloudflared is available
if command -v cloudflared &> /dev/null; then
  echo -e "${BLUE}▶️  Starting Cloudflare Tunnel...${NC}"
  
  # Start cloudflared
  cloudflared tunnel --url http://localhost:3001 > "$LOG_DIR/cloudflared.log" 2>&1 &
  TUNNEL_PID=$!
  echo -e "${GREEN}   ✓ Tunnel starting (PID: $TUNNEL_PID)${NC}"
  
  # Wait for tunnel to start and extract URL
  sleep 5
  
  if [ -f "$LOG_DIR/cloudflared.log" ]; then
    TUNNEL_URL=$(grep -oP 'https://[a-z0-9\-]+\.trycloudflare\.com' "$LOG_DIR/cloudflared.log" 2>/dev/null | head -1)
    if [ -n "$TUNNEL_URL" ]; then
      echo -e "${GREEN}   ✓ Tunnel URL: $TUNNEL_URL${NC}"
      echo "   Logs: tail -f $LOG_DIR/cloudflared.log"
      echo ""
      echo -e "${YELLOW}📌 For external access, set:${NC}"
      echo "   NEXT_PUBLIC_API_URL='$TUNNEL_URL'"
    else
      echo -e "${YELLOW}   ⚠️  Could not extract tunnel URL. Check logs:${NC}"
      tail -n 10 "$LOG_DIR/cloudflared.log"
    fi
  fi
else
  echo -e "${YELLOW}💡 Tip: Install cloudflared to enable public tunneling:${NC}"
  echo "   curl -L https://pkg.cloudflare.com/cloudflare-release-key.gpg | sudo apt-key add -"
  echo "   echo 'deb https://pkg.cloudflare.com/linux/focal cloudflare main' | sudo tee /etc/apt/sources.list.d/cloudflare-main.list"
  echo "   sudo apt-get update && sudo apt-get install cloudflared"
fi

echo ""
echo -e "${BLUE}📊 Frontend:${NC}"
echo "   To run the frontend separately:"
echo "   cd $FRONTEND_DIR && npm run dev"
echo ""
echo -e "${BLUE}🛑 To stop all services:${NC}"
echo "   kill $API_PID   # API Server"
if [ -n "${TUNNEL_PID:-}" ]; then
  echo "   kill $TUNNEL_PID # Cloudflare Tunnel"
fi
echo ""

# Keep the script running
echo -e "${GREEN}✅ All services are running!${NC}"
echo "   Press Ctrl+C to stop"
echo ""

# Trap to cleanup on exit
cleanup() {
  echo ""
  echo -e "${YELLOW}🛑 Stopping services...${NC}"
  kill $API_PID 2>/dev/null || true
  if [ -n "${TUNNEL_PID:-}" ]; then
    kill $TUNNEL_PID 2>/dev/null || true
  fi
  echo -e "${GREEN}✓ Stopped${NC}"
}

trap cleanup EXIT INT TERM

# Wait indefinitely
wait
