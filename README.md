# Claude Dashboard

A web application for tracking and visualizing local Claude Code activity. Monitor sessions, browse implementation plans, tasks and todos, and view usage statistics.

![Dashboard](docs/screenshots/dashboard.png)

## Features

### Analytics & Insights
Dashboard statistics come from the deduplicated local transcript usage index and update as transcripts change.

- **8 Key Metrics** - Total sessions, API requests, tool calls, output tokens, averages per session, most active day, and peak hour
- **Daily Activity Chart** - 30-day trend of requests and tool calls with interactive line graph
- **Model Usage Chart** - 30-day output tokens by model display name, with a link to Usage
- **Hourly Activity Chart** - All-time request distribution by local hour to identify usage patterns

### Usage
The **Usage** page (`/usage`) reads local session transcripts and counts each API response once across all files. Choose a date range, day/week/month grouping, project, model family, individual model or agent scope; filters and the chart metric stay in the URL. KPI cards, stacked model timelines, distribution bars and a model table show requests and token usage, with raw model IDs in tooltips. The Projects × Models table compares projects by the selected metric; expand a project to load its sessions and follow the available project and session detail links.

Estimated cost is an **API list-price equivalent, not billed usage**. It uses the price table dated 2026-09-17, includes web search, and does not apply long-context surcharges. Unknown models and unsupported fast-mode prices show “No price”; the cost tooltip lists excluded models. Thinking tokens are already included in output tokens.

The index persists to `server/.cache/usage-index.json` for fast restarts and checks changed files in the background. This cache can be deleted safely: a rebuild shows progress and produces the same figures. Statistics mirror the transcripts currently on disk: additions and changes refresh automatically, and usage of deleted or cleaned-up transcripts disappears. Session and sub-agent detail pages count the responses in their own transcript file once. The Usage page counts each response once across all transcripts and includes sub-agent usage in session drilldowns, so figures for resumed or forked sessions and for sessions with sub-agents can differ. Usage also depends on the selected dates and filters, whereas detail totals cover the entire file.

### Plans Management
- **Browse & Search** - Filter through all implementation plans with instant search
- **Sort Options** - Order by newest or oldest creation date
- **Markdown Rendering** - Full markdown support with syntax highlighting
- **Metadata Display** - File size and creation date for each plan

### Tasks Tracking
- **Status Filtering** - Filter by All, Pending, In Progress, or Completed
- **Session Grouping** - Tasks organized by their originating session with project names
- **Dependency Visualization** - See which tasks block or are blocked by others
- **Status Badges** - Color-coded status indicators (green/yellow/gray)

### Todos Management
- **Progress Tracking** - Visual progress bars showing completion status per session
- **Session Cards** - Todo items grouped by session with completion counts (e.g., 4/5)
- **Status Indicators** - Checkmarks for completed items, circles for pending

### Sub-agents Browser
- **Project Grouping** - Sub-agent transcripts organized by project with collapsible sections
- **Agent Details** - Model badge, token usage (input/output), duration, message count, and tools used
- **Filters** - Filter by project, model, prompt text search, and sort by recency, tokens, or duration
- **Internal Agents** - Toggle to show/hide internal agents (prompt suggestions, compact summaries)
- **Summary Stats** - Total agent count, token usage, and project count at a glance

### Memory Browser
- **Project Grouping** - Auto memory files organized by project with collapsible sections
- **Search & Sort** - Filter across project names, file titles, and content excerpts
- **Markdown Rendering** - Full markdown detail view with syntax highlighting
- **Real-Time Updates** - Live refresh when memory files change on disk

### Global Features
- **Global Search** - Quick search across all content with `Cmd+K`
- **Dark/Light Mode** - Theme switching with system preference detection
- **Real-Time Updates** - Live synchronization via Server-Sent Events when data changes
- **Responsive Design** - Optimized layout for desktop viewing

## Tech Stack

**Frontend:**
- React 18 + TypeScript
- Vite (build tool)
- TanStack React Query (data fetching)
- Tailwind CSS + Radix UI (styling)
- Recharts (data visualization)

**Backend:**
- Express.js + TypeScript
- Chokidar (file watching)
- Server-Sent Events (real-time updates)

## Prerequisites

- Node.js 18+ (18.20.4 or later recommended)
- npm 9+

## Installation

```bash
# Clone the repository
git clone git@github.com:ducrot/claude-dashboard.git
cd claude-dashboard

# Install all dependencies (root, client, and server)
npm install
```

## Development

```bash
# Run both client and server concurrently
npm run dev

# Or run them separately:
npm run dev:client   # Frontend at http://localhost:5174
npm run dev:server   # Backend at http://localhost:3001
```

## Production Build

```bash
# Build both client and server
npm run build

# Start production server
npm start
```

## Project Structure

```
claude-dashboard/
├── client/                     # React frontend
│   ├── src/
│   │   ├── pages/             # Page components (Dashboard, Plans, Tasks, Todos, SubAgents, Memory)
│   │   ├── components/
│   │   │   ├── ui/            # Reusable UI components
│   │   │   ├── layout/        # Layout components (Sidebar, Header)
│   │   │   ├── dashboard/     # Dashboard-specific components
│   │   │   ├── plans/         # Plan display components
│   │   │   ├── tasks/         # Task components
│   │   │   ├── todos/         # Todo components
│   │   │   ├── subagents/     # Sub-agent components
│   │   │   └── memory/        # Memory components
│   │   ├── hooks/             # Custom React hooks (useTheme, useSSE)
│   │   ├── lib/               # API client and utilities
│   │   └── App.tsx            # Main app with routing
│   └── vite.config.ts         # Vite configuration
│
├── server/                     # Express backend
│   ├── src/
│   │   ├── routes/            # API route handlers
│   │   ├── services/          # Business logic and data operations
│   │   ├── config/            # Path configuration
│   │   └── index.ts           # Express app setup
│   └── tsconfig.json          # Server TypeScript config
│
└── package.json               # Root monorepo configuration
```

## Configuration

### Data Directory

`server/.cache/` holds the derived usage index; source data remains in `~/.claude/`.

The application reads from the Claude Code local directory:

```
~/.claude/
├── plans/              # Markdown plan files
├── tasks/              # Task JSON files
├── todos/              # Todo JSON files
└── projects/           # Session indexes, transcripts, sub-agents, and memory
    └── <project>/
        ├── <session>.jsonl      # Main session transcripts
        ├── <session>/subagents/ # Sub-agent JSONL transcripts
        └── memory/              # Auto memory markdown files
```

### Environment Variables

| Variable | Default | Description |
|----------|---------|-------------|
| `PORT`   | `3001`  | Express server port |

## API Endpoints

| Method | Endpoint | Description |
|--------|----------|-------------|
| GET | `/api/plans` | List all plans |
| GET | `/api/plans/:filename` | Get specific plan |
| GET | `/api/tasks` | List all tasks |
| GET | `/api/todos` | List all todos |
| GET | `/api/usage` | Deduplicated model and project usage, range/filter queries and index progress |
| GET | `/api/usage/sessions` | Session usage for a required project, including sub-agents; same filters, optional limit (default 20, max 100) |
| GET | `/api/stats` | Get statistics with chart data |
| GET | `/api/stats/summary` | Get summary statistics |
| GET | `/api/sessions` | List all sessions |
| GET | `/api/subagents` | List all sub-agents across projects |
| GET | `/api/memory` | List all projects with memory files |
| GET | `/api/memory/:projectDir/:filename` | Get specific memory file |
| GET | `/api/search?q=query` | Search across all content |
| GET | `/api/events` | SSE endpoint for real-time updates |
| GET | `/api/health` | Health check |

## Development Notes

### Path Aliases

- Frontend uses `@/` alias for `./src/` imports
- Example: `import { Button } from '@/components/ui/button'`

### Real-Time Architecture

1. Chokidar watches the `~/.claude` directory for file changes
2. Changes are broadcast via EventEmitter
3. Server-Sent Events stream updates to connected clients
4. React Query invalidates and refetches affected data

### Code Style

- TypeScript strict mode enabled
- ES modules throughout
- Radix UI primitives with Tailwind CSS styling

## Scripts Reference

| Script | Description |
|--------|-------------|
| `npm run dev` | Start both client and server in development mode |
| `npm run dev:client` | Start only the frontend dev server |
| `npm run dev:server` | Start only the backend dev server |
| `npm run build` | Build both client and server for production |
| `npm start` | Start the production server |

## Contributing

1. Fork the repository
2. Create a feature branch (`git checkout -b feature/amazing-feature`)
3. Commit your changes (`git commit -m 'Add amazing feature'`)
4. Push to the branch (`git push origin feature/amazing-feature`)
5. Open a Pull Request

## License

[MIT](LICENSE)
