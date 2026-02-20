# Supabase Setup for Multi-Agent Chat

## Step 1: Create the Messages Table

Run this SQL in the **Supabase SQL Editor** (under your project's SQL section):

```sql
CREATE TABLE IF NOT EXISTS messages (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  agent_name TEXT NOT NULL CHECK (agent_name IN ('otto', 'felix', 'nova')),
  content TEXT NOT NULL,
  direction TEXT NOT NULL CHECK (direction IN ('inbound', 'outbound')),
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- Create an index for faster queries
CREATE INDEX idx_messages_agent_name ON messages(agent_name);
CREATE INDEX idx_messages_created_at ON messages(created_at DESC);
```

## Step 2: Enable RLS (Optional but Recommended)

```sql
ALTER TABLE messages ENABLE ROW LEVEL SECURITY;

-- Allow anonymous read access
CREATE POLICY "Allow anonymous read" ON messages
  FOR SELECT TO anon USING (true);

-- Allow authenticated write access
CREATE POLICY "Allow authenticated write" ON messages
  FOR INSERT TO anon WITH CHECK (true);
```

## Step 3: Seed Initial Messages

The initial seed messages are created via the API route when first accessed. If you want to manually seed:

```bash
curl -X POST https://YOUR_SUPABASE_URL/rest/v1/messages \
  -H "apikey: YOUR_SUPABASE_ANON_KEY" \
  -H "Authorization: Bearer YOUR_SUPABASE_ANON_KEY" \
  -H "Content-Type: application/json" \
  -d '{
    "agent_name": "otto",
    "direction": "outbound",
    "content": "I'\''m Otto — your main AI. I orchestrate Felix and Nova. Chat with me here."
  }'
```

## Credentials

- SUPABASE_URL: Check `.env.local` or your Supabase dashboard
- SUPABASE_ANON_KEY: Check `.env.local` or your Supabase dashboard
- SUPABASE_SERVICE_ROLE_KEY: Available in Settings > API > Service Role Secret

## API Routes

- **GET** `/api/messages?agent=otto|felix|nova` - Fetch messages for an agent
- **POST** `/api/messages` - Create a new message

## Testing

```bash
# Fetch Otto's messages
curl -X GET "https://agent-dashboard.vercel.app/api/messages?agent=otto"

# Send a message to Otto
curl -X POST "https://agent-dashboard.vercel.app/api/messages" \
  -H "Content-Type: application/json" \
  -d '{
    "agent_name": "otto",
    "content": "Test message",
    "direction": "inbound"
  }'
```
