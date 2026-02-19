# Dashboard Bug Fix Spec

## Context
- App: Next.js 14 dashboard at ~/agent-dashboard/
- Deployed on Vercel (https://openclawstuff.vercel.app)
- Backend data: Supabase (REST API via anon key)
- Local sync service pushes data from local session files → Supabase
- The `files` table columns: id (uuid), name, path, size_bytes, uploaded_by, created_at
- All API routes are in src/app/api/*/route.ts
- Components in src/components/

## Supabase Config
- URL: env var NEXT_PUBLIC_SUPABASE_URL (set on Vercel)
- Key: env var NEXT_PUBLIC_SUPABASE_ANON_KEY (set on Vercel)  
- Agent ID in Supabase: cccd8a05-c99f-46f6-856e-d530de254bfc

## Bugs to Fix (5 total)

### Bug 1: Tasks stuck in "in_progress"
**Root cause:** The sync service creates tasks with status "in_progress" when it sees `sessions_spawn` tool calls, but the completion detection only matches `[System Message] ... subagent task "label"` pattern which may not match actual completion messages.

**Also:** The sync service systemd unit isn't running. But even when it was, tasks weren't being marked done.

**Fix approach for the API route (src/app/api/tasks/route.ts):**
- When Supabase returns tasks, check if any "in_progress" tasks are stale (spawned > 30 min ago with no completion). Mark them as "done" automatically since old subagents have definitely finished.
- The existing Supabase data has 4 "todo" tasks and 0 in_progress, so the real issue is the local file parser shows old sessions as in_progress. Since we're on Vercel, the local parser won't run — but the sync service needs fixing too.

**Fix the sync service (sync-service/sync.ts):**
- Improve completion detection: also match patterns like `completed successfully` or `finished` in system messages
- Add a staleness check: if a task has been in_progress for > 30 min, auto-mark as done

### Bug 2: Skills not showing
**Root cause:** Skills API reads local filesystem dirs (~/.openclaw/skills/ and ~/.npm-global/lib/node_modules/openclaw/skills/). On Vercel = no filesystem = empty response.

**Fix:** Since we can't create new Supabase tables (no service key), store skills data in the existing `files` table with a naming convention.

Update the sync service to:
1. Read skills from both directories  
2. Upsert into `files` table with path like `skills/{dirName}/SKILL.md`, name = skill name, and uploaded_by = 'skills-sync'
3. Store the skill content (name, description, source, content) as JSON in a new approach: Actually, the files table doesn't have a content column.

**BETTER APPROACH:** Hardcode the skills list in the API route for Vercel. The skills don't change frequently. When the API detects it's on Vercel (no local filesystem), return a static list that the sync service maintains in a JSON file committed to the repo.

**Simplest fix:** 
1. Create a file `src/data/skills-cache.json` with the current skills data
2. The sync service updates this file periodically  
3. The skills API route falls back to this cache when filesystem is unavailable
4. Commit and deploy

### Bug 3: Two Ottos on agent tab
**Root cause:** Supabase has exactly 1 agent (Otto). The local file parser (`parseSessionFiles()` in agents API) creates a "Main Agent" fallback. When Supabase is available, only Supabase data should be used — the local parser should not run as fallback.

**Fix in src/app/api/agents/route.ts:**
- When useSupabase is true and Supabase returns data successfully, return ONLY Supabase data — don't fall through to local parser
- The current code has a try/catch that falls back to local on ANY Supabase error, which means both sources can return data. This shouldn't cause duplicates though — check if the page.tsx or AgentPanel is somehow merging two sources.

Wait — looking again: the GET handler returns Supabase data if available, OR falls back to local. It shouldn't return both. The issue might be in the SYNC SERVICE creating duplicate agents. Check: the getOrCreateAgent() function searches by name="otto" (lowercase) but the existing agent is name="Otto" (capitalized). This causes it to create a new agent each time!

**Fix in sync-service/sync.ts:**
- Change `getOrCreateAgent("otto")` → `getOrCreateAgent("Otto")` 
- OR make the name search case-insensitive: `name=ilike.otto`

**Also check:** Are there actually 2 agents in Supabase? The curl earlier showed only 1. Verify and delete duplicates if needed.

### Bug 4: Nothing showing on journal tab
**Root cause:** Supabase has a journal entry for 2026-02-19 but with empty arrays for accomplishments/problems/struggles. The sync service's `generateDailyJournals()` only populates accomplishments from "done" tasks, but no tasks were marked done (Bug 1).

**Fix:**
1. Fix the sync service to generate richer journal entries by parsing session files directly (like the local journal API already does) instead of just checking done tasks
2. For the existing entry, the sync service should UPDATE it (not skip because "already generated today")
3. Change journal generation to re-generate/update the entry each sync cycle with fresh data from session files

### Bug 5: Nothing showing on memory tab
**Root cause:** Memory API reads local workspace files. Vercel has no filesystem.

**Fix:** Same approach as skills — create a cache file.
1. Create `src/data/memory-cache.json` with workspace file listings and contents
2. Sync service updates this file periodically
3. Memory API falls back to cache when filesystem unavailable
4. Commit and deploy

## Implementation Plan

### Phase 1: Quick fixes (API routes)
1. Fix agents API to not create duplicates
2. Fix tasks API staleness detection
3. Create skills-cache.json and memory-cache.json with current data
4. Update skills + memory API routes to use cache files as fallback

### Phase 2: Sync service fixes
1. Fix agent name casing  
2. Fix task completion detection + staleness
3. Add skills sync (write to skills-cache.json)
4. Add memory file sync (write to memory-cache.json) 
5. Fix journal generation to parse sessions properly
6. Add cache file generation to sync cycle

### Phase 3: Deploy
1. git add, commit, push
2. Verify on Vercel

## File Inventory
- src/app/api/tasks/route.ts - Tasks API
- src/app/api/skills/route.ts - Skills API  
- src/app/api/agents/route.ts - Agents API
- src/app/api/journal/route.ts - Journal API
- src/app/api/memory/route.ts - Memory API
- sync-service/sync.ts - Background sync service
- src/data/ (create) - Cache files for Vercel fallback

## IMPORTANT
- After making changes, run `npm run build` to verify no build errors
- Then: git add -A && git commit -m "fix: dashboard bugs" && git push
- The Vercel deployment auto-deploys on push to main
