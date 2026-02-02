# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Commands

```bash
# Development (runs both client and server)
npm run dev

# Run client only (port 5174)
npm run dev:client

# Run server only (port 3001)
npm run dev:server

# Build for production
npm run build

# Start production server
npm start
```

## Architecture

This is a monorepo with npm workspaces containing a React frontend (`client/`) and Express backend (`server/`).

### Data Flow

The application reads Claude Code data from `~/.claude/`:
- `plans/` - Markdown plan files
- `tasks/` - Task JSON files
- `todos/` - Todo JSON files
- `projects/` - Session index files
- `stats-cache.json` - Cached statistics

### Real-Time Updates

1. **FileWatcher** (`server/src/services/watcher.ts`) - Chokidar watches `~/.claude` for file changes and emits events via EventEmitter
2. **SSE Endpoint** (`server/src/routes/events.ts`) - Streams file change events to connected clients
3. **useSSE Hook** (`client/src/hooks/useSSE.ts`) - Receives events and invalidates React Query caches to trigger refetch

### API Structure

All endpoints prefixed with `/api`:
- Routes defined in `server/src/routes/`
- Business logic in `server/src/services/`
- Path configuration in `server/src/config/paths.ts`

### Frontend Structure

- Pages in `client/src/pages/` - Dashboard, Plans, Tasks, Todos
- UI components use Radix UI primitives with Tailwind styling
- `@/` import alias resolves to `client/src/`
- API client with TypeScript types in `client/src/lib/api.ts`

### Ports

- Client dev server: 5174 (proxies `/api` to backend)
- Backend server: 3001
