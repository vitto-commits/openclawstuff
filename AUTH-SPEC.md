# Authentication Layer

## Goal
Add a simple login page to protect the dashboard. Single user, credentials stored as env vars.

## Approach
Use Next.js middleware + cookie-based sessions. No external auth libraries needed — keep it simple.

## Environment Variables (already set on Vercel)
- `AUTH_USERNAME` — the username
- `AUTH_PASSWORD_HASH` — SHA-256 hex hash of the password
- `AUTH_SECRET` — random 32-byte hex string for signing session cookies

## Files to Create

### 1. `src/app/api/auth/login/route.ts`
POST endpoint that:
- Accepts `{ username, password }` JSON body
- Hashes the password with SHA-256 and compares to `AUTH_PASSWORD_HASH`
- Compares username to `AUTH_USERNAME`
- If match: creates a signed session cookie (`dashboard_session`) with HMAC-SHA256 using `AUTH_SECRET`, set HttpOnly, Secure, SameSite=Lax, expires in 7 days
- Cookie value: `{timestamp}.{hmac_signature}` — the HMAC signs the timestamp so it can't be forged
- Returns 200 `{ ok: true }`
- If no match: returns 401 `{ error: "Invalid credentials" }`
- If env vars not set (local dev): return 200 immediately (no auth needed locally)

### 2. `src/app/api/auth/logout/route.ts`
POST endpoint that clears the session cookie. Returns 200.

### 3. `src/app/api/auth/check/route.ts`
GET endpoint that returns `{ authenticated: true/false }`. Checks if session cookie exists and is valid (signature matches, not expired). If env vars not set, return `{ authenticated: true }`.

### 4. `src/middleware.ts` (in src/ root, NOT in app/)
Next.js middleware that:
- Runs on all routes EXCEPT `/api/auth/*`, `/_next/*`, `/favicon.ico`
- Checks for valid `dashboard_session` cookie
- If not authenticated: redirect to `/login`
- If authenticated: continue
- If env vars not set (local dev): always continue (no auth needed)

### 5. `src/app/login/page.tsx`
Login page with:
- Clean, minimal design matching the dashboard aesthetic
- Centered card with logo, username input, password input, login button
- Error message display on failed login
- Redirect to `/` on success
- The "A" logo from the sidebar at the top
- White card on light gray background
- Uses Framer Motion for subtle entrance animation
- Responsive — looks good on mobile too
- No sidebar or bottom nav shown on login page

## Files to Modify

### `src/app/page.tsx`
- No changes needed — middleware handles protection

### `src/app/layout.tsx`
- No changes needed

## Security Notes
- Password is NEVER stored in source code — only the hash in env vars
- Session cookie is HttpOnly (no JS access), Secure (HTTPS only on prod), SameSite=Lax
- HMAC signature prevents cookie forgery
- 7-day expiry
- Local dev: auth is bypassed when env vars are not set

## Cookie Verification Logic
```
cookie_value = `${timestamp}.${hmac}`
// To verify:
expected_hmac = HMAC-SHA256(AUTH_SECRET, timestamp)
valid = (hmac === expected_hmac) && (now - timestamp < 7 days)
```

## After building
1. `cd ~/agent-dashboard && npm run build`
2. If success: `git add -A && git commit -m "feat: add login authentication layer" && git push`
