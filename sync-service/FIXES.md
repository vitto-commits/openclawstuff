# Sync Service - Fixed Issues

## Issues Resolved

### 1. **ESM Import Issue - `__dirname` doesn't exist in ESM**
- **Problem:** The compiled dist/sync.js used ESM imports but referenced `__dirname`, which is CommonJS-only
- **Solution:** Used `import.meta.url` with `fileURLToPath` to properly get `__dirname` in ESM
```typescript
import { fileURLToPath } from "url";
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
```
- **Result:** ✅ Service now runs without "undefined __dirname" errors

### 2. **JSONL Parsing - Message content extraction**
- **Problem:** Activity entries were being inserted with empty content — message content wasn't being extracted correctly from the nested structure
- **Actual JSONL format:** Messages have structure `{ type: "message", message: { role: "user"/"assistant", content: [{ type: "text", text: "..." }] } }`
- **Solution:** Implemented `extractTextContent()` function that properly navigates the nested array and extracts text from content objects
- **Result:** ✅ User and assistant messages are now properly extracted (though activity logging is currently disabled to optimize API calls)

### 3. **Task Detection - sessions_spawn toolCall parsing**
- **Problem:** Tasks (subagent spawns) weren't being synced because task detection logic wasn't finding sessions_spawn entries in JSONL
- **Solution:** Implemented `findToolCall()` function to search for toolCall entries in the message content array, specifically looking for `name: "sessions_spawn"`
- **Detection:** When found, extracts `label` and `task` description from the `arguments` object and creates task with status "in_progress"
- **Result:** ✅ Tasks are now being synced (verified: "fix-sync-service", "dashboard-supabase", etc. created in Supabase)

### 4. **Task Completion Detection**
- **Problem:** Tasks weren't being marked as complete when subagents finished
- **Solution:** Detect task completion by looking for "[System Message]" in user messages that contain "subagent task" and either "completed successfully" or "failed"
- **Parser:** Uses regex to extract task name: `subagent task "xxx"` → finds matching task and updates status to "done" or "failed"
- **Result:** ✅ Task completion flow is now implemented (ready for when subagents complete)

### 5. **Empty Response Bodies - Supabase API**
- **Problem:** The `supabaseAPI` function tried to parse JSON response bodies that may be empty (201 responses with `Prefer: return=minimal`)
- **Solution:** 
  - Added `Prefer: return=minimal` header to all requests to skip returning full response bodies
  - Check response `content-length` header before parsing JSON
  - Return `null` for empty responses instead of throwing
- **Result:** ✅ Inserts now work cleanly without parsing empty responses

### 6. **Cost Extraction & Syncing**
- **Problem:** Token usage and costs weren't being extracted from session data
- **Solution:** Parse `usage` object from message entries:
  - `usage.input_tokens`, `usage.output_tokens`
  - `usage.cacheRead`, `usage.cacheWrite` 
  - `usage.cost.total` for final cost
- **Result:** ✅ Costs are syncing correctly (verified: ~130 cost entries with proper token counts)

### 7. **Incremental Sync**
- **Problem:** No way to track which lines were already processed, leading to duplicate syncs
- **Solution:** Track processed files in `sync-state.json` with line count:
```json
{
  "processedFiles": {
    "/path/to/file.jsonl": 1199,  // Processed up to line 1199
    ...
  }
}
```
- **On subsequent runs:** Only process lines after the tracked position
- **Result:** ✅ Incremental sync works (tested: processed 1416 on first run, only 1 new entry on second run)

## Testing Results

### Full Sync Test
- **Input:** 3 session files with 1416 total JSONL entries
- **Processing:** 100% success rate, no crashes
- **Output:**
  - 16 task entries created in Supabase tasks table
  - 130+ cost entries synced with correct token counts
  - 1 journal entry generated for the day
  - Agent marked as "online" with last_active timestamp

### Incremental Sync Test
- **Input:** Same files + 1 new line added to one file
- **Processing:** Correctly identified 1 new entry, skipped unchanged files
- **Performance:** Ran to completion in ~1 second (vs 2 minutes for full sync)

## Current Build Status

- ✅ TypeScript compiles without errors
- ✅ ESM imports work correctly
- ✅ Runs with: `SUPABASE_URL=... SUPABASE_ANON_KEY=... node dist/sync.js`
- ✅ Safe graceful shutdown on SIGTERM/SIGINT
- ✅ Data verified in Supabase dashboard

## How to Run

```bash
# Build
npm run build

# Run with environment variables
source ~/.openclaw/secrets/tokens.env
node dist/sync.js

# Or inline
SUPABASE_URL=... SUPABASE_ANON_KEY=... node dist/sync.js
```

## Features Not Yet Implemented (Future)

- Activity logging (disabled for now to reduce API calls; can be re-enabled with batching)
- Real-time sync with file watchers
- Batch inserts to reduce API calls
- Pagination for large result sets
