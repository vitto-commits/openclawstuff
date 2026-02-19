#!/bin/bash

set -e

echo "🚀 Agent Dashboard - Supabase Setup"
echo "===================================="
echo ""

# Check for required environment variables
if [ -z "$SUPABASE_URL" ]; then
  echo "❌ Error: SUPABASE_URL not set"
  echo ""
  echo "Please set Supabase credentials first:"
  echo "  export SUPABASE_URL=https://your-project.supabase.co"
  echo "  export SUPABASE_SERVICE_KEY=your-service-key"
  echo ""
  exit 1
fi

if [ -z "$SUPABASE_SERVICE_KEY" ] && [ -z "$SUPABASE_ANON_KEY" ]; then
  echo "❌ Error: SUPABASE_SERVICE_KEY or SUPABASE_ANON_KEY not set"
  exit 1
fi

# Read Supabase credentials
if [ -f ~/.openclaw/secrets/tokens.env ]; then
  echo "📖 Reading credentials from ~/.openclaw/secrets/tokens.env"
  source ~/.openclaw/secrets/tokens.env
fi

echo "✓ Supabase URL: $SUPABASE_URL"
echo ""

# 1. Install frontend dependencies
echo "📦 Installing frontend dependencies..."
npm install --save @supabase/supabase-js
echo "✓ Frontend dependencies installed"
echo ""

# 2. Install API server dependencies
echo "📦 Installing API server dependencies..."
cd api-server
npm install
echo "✓ API server dependencies installed"
cd ..
echo ""

# 3. Install sync service dependencies
echo "📦 Installing sync service dependencies..."
cd sync-service
npm install
echo "✓ Sync service dependencies installed"
cd ..
echo ""

# 4. Setup Supabase database schema
echo "🗄️  Setting up Supabase database schema..."
cd scripts
export SUPABASE_URL SUPABASE_SERVICE_KEY SUPABASE_ANON_KEY
npm exec ts-node setup-supabase-db.ts
cd ..
echo ""

# 5. Build API server
echo "🔨 Building API server..."
cd api-server
npm run build
cd ..
echo "✓ API server built"
echo ""

# 6. Show next steps
echo "✅ Setup complete!"
echo ""
echo "Next steps:"
echo ""
echo "1. Create a .env.local file with Supabase credentials:"
echo "   cp .env.example .env.local"
echo "   Edit .env.local and fill in:"
echo "     NEXT_PUBLIC_SUPABASE_URL=$SUPABASE_URL"
echo "     NEXT_PUBLIC_SUPABASE_ANON_KEY=<your-anon-key>"
echo ""
echo "2. Start the sync service (in background):"
echo "   SUPABASE_URL=$SUPABASE_URL SUPABASE_ANON_KEY=$SUPABASE_ANON_KEY node sync-service/dist/sync.js &"
echo ""
echo "3. Start the API server (in another terminal):"
echo "   cd api-server && npm start"
echo ""
echo "4. Start the frontend (in another terminal):"
echo "   npm run dev"
echo ""
echo "5. Open http://localhost:3000 in your browser"
echo ""
