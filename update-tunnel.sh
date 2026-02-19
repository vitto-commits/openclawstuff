#!/bin/bash
# Auto-detect tunnel URL and update Vercel env var + redeploy
# Run this after tunnel restarts

source ~/.openclaw/secrets/tokens.env

# Get current tunnel URL from systemd logs
TUNNEL_URL=$(journalctl --user -u agent-dashboard-tunnel --no-pager -n 30 2>&1 | grep -o 'https://[a-z0-9-]*\.trycloudflare\.com' | tail -1)

if [ -z "$TUNNEL_URL" ]; then
  echo "ERROR: No tunnel URL found"
  exit 1
fi

echo "Tunnel URL: $TUNNEL_URL"

# Get env var ID
ENV_ID=$(curl -s "https://api.vercel.com/v9/projects/openclawstuff/env" \
  -H "Authorization: Bearer $VERCEL_TOKEN" | \
  python3 -c "import sys,json;envs=json.load(sys.stdin).get('envs',[]);ids=[e['id'] for e in envs if e['key']=='NEXT_PUBLIC_API_URL'];print(ids[0] if ids else '')")

# Update env var
curl -s -X PATCH "https://api.vercel.com/v9/projects/openclawstuff/env/$ENV_ID" \
  -H "Authorization: Bearer $VERCEL_TOKEN" \
  -H "Content-Type: application/json" \
  -d "{\"value\":\"$TUNNEL_URL\"}" > /dev/null

# Trigger redeploy
curl -s -X POST "https://api.vercel.com/v13/deployments" \
  -H "Authorization: Bearer $VERCEL_TOKEN" \
  -H "Content-Type: application/json" \
  -d '{"name":"openclawstuff","gitSource":{"type":"github","repoId":"1161695249","ref":"main"}}' | \
  python3 -c "import sys,json;print('Redeploying: ' + json.load(sys.stdin).get('url','error'))"

echo "Done! Deploy will take ~60s"
