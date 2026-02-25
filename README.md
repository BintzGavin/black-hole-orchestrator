# Black Hole Architecture Command Center

## Overview
A self-hostable visualization and orchestration platform for monitoring multi-agent software development using the Black Hole Architecture (BHA) pattern. Users clone the repo, configure environment variables, and run locally. No external database required — all data is stored in the browser's IndexedDB.

## Tech Stack
- **Frontend**: React + TypeScript, Vite, TailwindCSS, Shadcn UI, Framer Motion, Wouter routing
- **Backend**: Express.js (thin proxy for GitHub/AI API calls only)
- **Storage**: IndexedDB (browser-local, via `idb` library)
- **AI Providers**: OpenAI, Anthropic, Google (via Vercel AI SDK for easy switching)
- **GitHub Integration**: @octokit/rest

## Architecture
- **No database required** — all persistent data (repos, agent roles, analysis results, activity) lives in IndexedDB
- **Backend is a thin proxy** — only forwards requests to GitHub API and AI providers using env-var secrets
- **Settings via .env** — API keys configured in environment variables, displayed read-only in the UI
- **Self-hostable** — clone, set env vars, `npm install`, `npm run dev`

## Environment Variables
```
GITHUB_PAT=ghp_your_token_here       # GitHub Personal Access Token
AI_PROVIDER=openai                    # openai | anthropic | google
AI_API_KEY=sk-your_key_here           # AI provider API key
AI_MODEL=gpt-4o                       # Model name
```

## Project Structure
```
client/src/
  components/
    app-sidebar.tsx      - Navigation sidebar
    theme-provider.tsx   - Dark/light mode
    gravity-ring.tsx     - Circular progress indicator (gravity score)
    gravity-visualization.tsx - SVG orbital visualization of agent roles
    ui/                  - Shadcn UI components
  pages/
    dashboard.tsx        - Main dashboard with repo cards (IndexedDB)
    settings.tsx         - Read-only env status display with test buttons
    repository.tsx       - Repo detail with tabs (Overview, Agents, Activity, Analysis)
  lib/
    db.ts               - IndexedDB storage layer (repositories, agentRoles, analysisResults, activityEvents)
    queryClient.ts       - TanStack Query setup with apiRequest helper

server/
  routes.ts             - Proxy API endpoints (GitHub + AI only)
  index.ts              - Express server setup

shared/
  schema.ts             - Pure TypeScript interfaces (Repository, AgentRole, AnalysisResult, ActivityEvent, Settings)
```

## Key API Routes (Backend Proxy Only)
- `GET /api/settings` - Returns masked env var status
- `GET /api/settings/test-github` - Test GitHub PAT connection
- `GET /api/settings/test-ai` - Test AI provider connection
- `POST /api/github/repo` - Fetch repo metadata from GitHub
- `POST /api/github/scan` - Scan repo tree for agent roles
- `POST /api/github/analyze` - Run AI analysis on repo activity

## Data Flow
1. User adds repo → frontend calls `POST /api/github/repo` → backend fetches metadata → frontend stores in IndexedDB
2. User scans agents → frontend calls `POST /api/github/scan` → backend scans repo tree → frontend stores roles in IndexedDB
3. User runs analysis → frontend calls `POST /api/github/analyze` → backend fetches commits/PRs + runs AI analysis → frontend stores results in IndexedDB

## Theme
Space/cosmic theme with purple primary (258 90% 66%), dark mode default. Inter font for body, JetBrains Mono for code.

## User Preferences
- Self-hostable, generic (not tied to any specific project)
- No external database — all browser-local via IndexedDB
- BYOK for AI providers via .env
- GitHub PAT via .env
