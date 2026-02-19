#!/bin/bash
# =============================================
# OpenClaw Agent Sync — One-Line Installer
# Connects any OpenClaw agent to the dashboard
# =============================================

set -e

echo "🛡️  OpenClaw Agent Sync Installer"
echo "=================================="
echo ""

# Prompt for agent info
read -p "Agent name (e.g. Claude, Aria): " AGENT_NAME
read -p "Machine name (e.g. work-laptop): " MACHINE_NAME
read -p "Model (e.g. anthropic/claude-opus-4-6): " AGENT_MODEL

if [ -z "$AGENT_NAME" ] || [ -z "$MACHINE_NAME" ]; then
  echo "❌ Agent name and machine name are required."
  exit 1
fi

AGENT_MODEL=${AGENT_MODEL:-"unknown"}

# Supabase config (hardcoded for this dashboard)
SUPABASE_URL="https://zpeozskhndujiwtitiru.supabase.co"
SUPABASE_ANON_KEY="eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InpwZW96c2tobmR1aml3dGl0aXJ1Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzE1MDQxMTUsImV4cCI6MjA4NzA4MDExNX0.D2YSeGB_AZftTRRqydja5gaGrqAplS0R5yWHnZ2kVz0"

# Detect OpenClaw sessions directory
SESSIONS_DIR="$HOME/.openclaw/agents/main/sessions"
if [ ! -d "$SESSIONS_DIR" ]; then
  echo "⚠️  OpenClaw sessions not found at $SESSIONS_DIR"
  read -p "Enter your sessions directory path: " SESSIONS_DIR
  if [ ! -d "$SESSIONS_DIR" ]; then
    echo "❌ Directory not found: $SESSIONS_DIR"
    exit 1
  fi
fi

echo ""
echo "📋 Config:"
echo "   Agent:    $AGENT_NAME"
echo "   Machine:  $MACHINE_NAME"
echo "   Model:    $AGENT_MODEL"
echo "   Sessions: $SESSIONS_DIR"
echo ""
read -p "Continue? (y/n): " CONFIRM
if [ "$CONFIRM" != "y" ]; then
  echo "Cancelled."
  exit 0
fi

# 1. Install sync service
INSTALL_DIR="$HOME/.openclaw-sync"
echo ""
echo "📦 Installing sync service to $INSTALL_DIR..."
mkdir -p "$INSTALL_DIR"

if command -v git &> /dev/null; then
  git clone --depth 1 https://github.com/vitto-commits/openclawstuff.git /tmp/openclaw-sync-tmp 2>/dev/null || true
  cp -r /tmp/openclaw-sync-tmp/sync-service/* "$INSTALL_DIR/"
  rm -rf /tmp/openclaw-sync-tmp
else
  echo "❌ git is required. Install it and try again."
  exit 1
fi

cd "$INSTALL_DIR"

# Install Node dependencies
if command -v npm &> /dev/null; then
  npm install --production 2>/dev/null
else
  echo "❌ npm/Node.js is required. Install Node.js 18+ and try again."
  exit 1
fi

mkdir -p "$INSTALL_DIR/data"

# 2. Register agent in Supabase
echo ""
echo "🤖 Registering agent '$AGENT_NAME' in dashboard..."
REGISTER_RESPONSE=$(curl -s -w "%{http_code}" -o /tmp/agent-register.json -X POST "$SUPABASE_URL/rest/v1/agents" \
  -H "apikey: $SUPABASE_ANON_KEY" \
  -H "Authorization: Bearer $SUPABASE_ANON_KEY" \
  -H "Content-Type: application/json" \
  -H "Prefer: return=representation" \
  -d "{\"name\":\"$AGENT_NAME\",\"machine\":\"$MACHINE_NAME\",\"model\":\"$AGENT_MODEL\",\"status\":\"online\",\"metadata\":{\"installed\":\"$(date -Iseconds)\"}}")

if [ "$REGISTER_RESPONSE" = "201" ]; then
  AGENT_ID=$(cat /tmp/agent-register.json | python3 -c "import sys,json;print(json.load(sys.stdin)[0]['id'])" 2>/dev/null || echo "")
  echo "   ✅ Registered! Agent ID: $AGENT_ID"
else
  echo "   ⚠️  Registration returned $REGISTER_RESPONSE (agent may already exist)"
  # Try to find existing agent
  AGENT_ID=$(curl -s "$SUPABASE_URL/rest/v1/agents?name=eq.$AGENT_NAME&select=id" \
    -H "apikey: $SUPABASE_ANON_KEY" \
    -H "Authorization: Bearer $SUPABASE_ANON_KEY" | python3 -c "import sys,json;d=json.load(sys.stdin);print(d[0]['id'] if d else '')" 2>/dev/null || echo "")
  if [ -n "$AGENT_ID" ]; then
    echo "   Found existing agent: $AGENT_ID"
  fi
fi
rm -f /tmp/agent-register.json

# 3. Create env file
cat > "$INSTALL_DIR/.env" << EOF
SUPABASE_URL=$SUPABASE_URL
SUPABASE_ANON_KEY=$SUPABASE_ANON_KEY
SESSIONS_DIR=$SESSIONS_DIR
AGENT_NAME=$AGENT_NAME
EOF
chmod 600 "$INSTALL_DIR/.env"

# 4. Create run script
cat > "$INSTALL_DIR/run.sh" << 'RUNEOF'
#!/bin/bash
set -a
source "$(dirname "$0")/.env"
set +a
cd "$(dirname "$0")"
exec node dist/sync.js
RUNEOF
chmod +x "$INSTALL_DIR/run.sh"

# 5. Set up systemd service (if available)
if command -v systemctl &> /dev/null; then
  echo ""
  echo "🔧 Setting up auto-start service..."
  
  mkdir -p "$HOME/.config/systemd/user"
  cat > "$HOME/.config/systemd/user/openclaw-sync.service" << EOF
[Unit]
Description=OpenClaw Agent Sync ($AGENT_NAME)
After=network.target

[Service]
Type=simple
WorkingDirectory=$INSTALL_DIR
ExecStart=/usr/bin/node dist/sync.js
Restart=always
RestartSec=30
Environment=SUPABASE_URL=$SUPABASE_URL
Environment=SUPABASE_ANON_KEY=$SUPABASE_ANON_KEY
Environment=SESSIONS_DIR=$SESSIONS_DIR

[Install]
WantedBy=default.target
EOF

  systemctl --user daemon-reload
  systemctl --user enable openclaw-sync
  systemctl --user start openclaw-sync
  
  # Enable lingering so service survives logout
  loginctl enable-linger $(whoami) 2>/dev/null || true
  
  echo "   ✅ Service installed and running"
  echo ""
  echo "   Manage with:"
  echo "   systemctl --user status openclaw-sync"
  echo "   systemctl --user restart openclaw-sync"
  echo "   journalctl --user -u openclaw-sync -f"
else
  echo ""
  echo "⚠️  systemd not available. Run manually with:"
  echo "   $INSTALL_DIR/run.sh"
fi

echo ""
echo "✅ Done! $AGENT_NAME is now syncing to the dashboard."
echo ""
echo "📊 View at: https://openclawstuff.vercel.app"
echo "🔄 Syncs every 60 seconds"
echo ""
