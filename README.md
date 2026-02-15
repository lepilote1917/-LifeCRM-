# LifeCRM — Personal OS (MVP)

UI: dark premium (Apple Dashboard × Linear × Notion Dark).  
Stack: **Node.js + Express + PostgreSQL (Neon) + Vercel**.

## 1) Project architecture

```
LifeCRM/
  server.js              # Express API + Whoop OAuth + static
  database.js            # PostgreSQL schema init + data access
  public/
    index.html           # Single-page UI (sidebar + modules)
  prisma/
    schema.prisma        # DB schema deliverable (Prisma)
  vercel.json            # Vercel serverless routing
  package.json
```

## 2) MVP scope (implemented)

- Dashboard global: KPIs + alertes + charts (spend + weight)
- Finances: add expense + list + weekly budget + financial goals
- Corps: workouts (simple) + cardio + PRs + Whoop chart (if synced)
- Nutrition: meals/macros + weekly chart
- Poids: add + chart
- Habits: daily checklist (bonus module)
- Settings: weekly budget + TDEE + macro targets + unit system
- Whoop: OAuth connect + token refresh + sync + cached metrics (best-effort)

## 3) Environment variables

### Required for DB
- `POSTGRES_URL` (Neon connection string)

### Required for Whoop (optional until you connect)
- `WHOOP_CLIENT_ID`
- `WHOOP_CLIENT_SECRET`
- `WHOOP_REDIRECT_URI` (must match Whoop app settings)

Example `.env`:
```bash
POSTGRES_URL="postgresql://..."
WHOOP_CLIENT_ID="..."
WHOOP_CLIENT_SECRET="..."
WHOOP_REDIRECT_URI="https://<your-vercel-domain>/api/whoop/callback"
```

## 4) Run locally

```bash
cd ~/Desktop/LifeCRM
npm install
export POSTGRES_URL='postgresql://...'
npm start
# open http://localhost:3000
```

## 5) Deploy (Vercel + Neon)

Same playbook as the DIV CRM:

1. Push repo to GitHub
2. Vercel: Add New → Project → import repo → Deploy
3. Neon: create Postgres → copy connection string
4. Vercel Project → Settings → Environment Variables:
   - add `POSTGRES_URL`
   - add Whoop envs if you want Whoop
5. Redeploy

## 6) API routes (MVP)

- `GET /api/dashboard`
- `GET/POST /api/settings`
- `GET/POST/DELETE /api/expenses`
- `GET/POST /api/financial-goals` + `POST /api/financial-goals/:id/achieve`
- `GET/POST /api/workouts` + `GET /api/workouts/:id`
- `GET/POST /api/cardio`
- `GET/POST /api/prs`
- `GET/POST/DELETE /api/nutrition`
- `GET/POST /api/weight`
- `GET/POST /api/habits` + `GET/POST /api/habits/logs`
- Whoop:
  - `GET /api/whoop/status`
  - `GET /api/whoop/connect` → returns URL to open
  - `GET /api/whoop/callback` → OAuth callback
  - `POST /api/whoop/sync` → best-effort sync
  - `GET /api/whoop/data`

## 7) MVP vs V2

### MVP (now)
- Single-user personal OS with core tracking + Whoop integration

### V2 (short)
- Auth + multi-user
- Better analytics: correlations, trends, goal projections
- Recurring expenses, categories/rules
- Workout volume graphs per exercise
- Nutrition deficit/surplus auto computed + recommendations
- Notifications (email / push) + reminders
- Document vault

