# Dashboard Overview — High-Level Home Page

## Goal
Create a new "Overview" tab as the default landing page. It should be a high-level executive summary — at a glance, you see what's happening across all sections.

## Design
Clean, minimal, white. Card-based grid layout. No clutter. Think Linear/Vercel dashboard vibes.

## Layout (top to bottom)

### 1. Header area
- Greeting: "Good morning" / "Good afternoon" / "Good evening" based on time (Asia/Manila timezone, GMT+8)
- Today's date formatted nicely

### 2. Stats bar (horizontal row of 4 small stat cards)
- **Tasks**: "4 todo · 20 done" with a small progress ring or bar
- **Agents**: "1 online" with green dot
- **Subagents today**: count from journal/tasks API  
- **Skills**: "53 installed" (total from skills API)

### 3. Main grid (2 columns on desktop, 1 on mobile)

**Left column (wider, ~60%):**

#### Recent Tasks card
- Show the 5 most recent done tasks with label, duration, and relative time ("2h ago")
- Show any in-progress tasks at top with spinning indicator
- "View all →" link that switches to Tasks tab

#### Today's Journal snippet card  
- Show the narrative text (first ~200 chars) from today's journal
- Tags as small pills below
- "Read more →" link to Journal tab

**Right column (~40%):**

#### Agent Status card
- Each agent as a row: name, model, status dot, last active time
- Compact

#### Activity Feed card (mini version)
- Last 5 activity items, very compact
- Timestamp + action type
- "View all →" link

#### Quick Links card (optional, if space)
- Memory, Skills, Cron as icon buttons

## Data Sources (API endpoints)
All are relative URLs, use the existing `apiJson` helper from `@/lib/api`.

- `GET /api/tasks` → `{ todo: [], in_progress: [], done: [] }`
- `GET /api/agents` → `[{ name, model, status, last_active }]`
- `GET /api/journal?date=YYYY-MM-DD` → `{ narrative, tags, stats, accomplishments }`
- `GET /api/activity` → `[{ action, details, created_at }]`  
- `GET /api/skills` → `{ custom: [], builtin: [] }`
- `GET /api/costs` → `{ byModel: [], bySession: [] }`

## Technical
- Create `src/components/DashboardOverview.tsx`
- Use existing imports: `motion` from `framer-motion`, `apiJson` from `@/lib/api`
- Use existing animation variants from `@/lib/animations`: `fadeInUp`, `staggerContainer`, `popIn`
- Add 'overview' as a new tab (first position) in page.tsx with icon 🏠
- Make it the default tab (useState default = 'overview')
- Use Tailwind for styling, keep consistent with existing white/gray palette
- Responsive: works on mobile (single column) and desktop (2 columns)

## Style Guide (from existing components)
- Cards: `bg-white rounded-xl border border-gray-100 shadow-sm p-5`
- Headers: `text-xl font-semibold text-gray-900`
- Subtext: `text-sm text-gray-400` or `text-xs text-gray-500`
- Links: `text-sm text-blue-500 hover:text-blue-700 font-medium`
- Status dots: `w-2 h-2 rounded-full bg-green-400` (online), `bg-gray-300` (offline)
- Tags: `text-xs font-medium px-2.5 py-1 rounded-full border` with color variants

## After building
1. Run `npm run build` to verify
2. If success: `git add -A && git commit -m "feat: add overview dashboard as default landing page" && git push`
