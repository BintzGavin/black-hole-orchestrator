# Black Hole Architecture Command Center

## Overview
A self-hostable visualization and orchestration platform for monitoring multi-agent software development using the Black Hole Architecture (BHA) pattern. Users provide their own GitHub PAT and AI provider API key (BYOK) to connect repositories and analyze agent activity.

## Tech Stack
- **Frontend**: React + TypeScript, Vite, TailwindCSS, Shadcn UI, Framer Motion, Wouter routing
- **Backend**: Express.js, PostgreSQL (Drizzle ORM), Vercel AI SDK
- **AI Providers**: OpenAI, Anthropic, Google (via Vercel AI SDK for easy switching)
- **GitHub Integration**: @octokit/rest

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
    dashboard.tsx        - Main dashboard with repo cards
    settings.tsx         - GitHub PAT + AI provider configuration
    repository.tsx       - Repo detail with tabs (Overview, Agents, Activity, Analysis)
  lib/
    queryClient.ts       - TanStack Query setup with apiRequest helper

server/
  routes.ts             - All API endpoints
  storage.ts            - Database CRUD operations (IStorage interface + DatabaseStorage)
  index.ts              - Express server setup

shared/
  schema.ts             - Drizzle schemas: settings, repositories, agentRoles, analysisResults, activityEvents
```

## Key API Routes
- `GET/PUT /api/settings` - Settings CRUD (PAT and AI keys masked in response)
- `GET/POST/DELETE /api/repositories` - Repository management
- `POST /api/repositories/:id/scan` - Scan repo tree for agent roles
- `POST /api/repositories/:id/analyze` - AI-powered git history analysis
- `GET /api/repositories/:id/roles` - Agent roles for a repo
- `GET /api/repositories/:id/activity` - Activity events
- `GET /api/repositories/:id/analysis` - Analysis results

## Theme
Space/cosmic theme with purple primary (258 90% 66%), dark mode default. Inter font for body, JetBrains Mono for code.

## User Preferences
- Self-hostable, generic (not tied to any specific project)
- BYOK for AI providers via Vercel AI SDK
- GitHub PAT-based authentication to GitHub API
