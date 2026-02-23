# MCP Analytics

**Analytics, session replay, and debugging for MCP servers.**

One-line SDK integration gives you full visibility into how agents and users interact with your MCP tools: what they call, why they call it, where they get stuck, and how to fix it.

```
┌─────────────┐     ┌──────────────┐     ┌──────────────────┐
│  MCP Client  │────▶│  MCP Server  │────▶│  Analytics API   │
│  (Claude,    │     │  + SDK       │     │  (Express+SQLite) │
│   Cline...)  │     │  track()     │     │                  │
└─────────────┘     └──────────────┘     └────────┬─────────┘
                                                   │
                                          ┌────────▼─────────┐
                                          │    Dashboard     │
                                          │  Session Replay  │
                                          │  Tool Analytics  │
                                          │  Intent Analysis │
                                          └──────────────────┘
```

## Quick Start

```bash
# Install dependencies
npm install

# Seed demo data (optional, for testing)
npm run seed

# Start the server + dashboard
npm run dev
```

Visit **http://localhost:3800** and enter the project ID and API key printed by the seed script.

## SDK Integration (for MCP server developers)

```typescript
import { track } from '@mcp-analytics/sdk';

const server = new Server({ name: 'my-mcp', version: '1.0.0' });

// One line to add analytics
track(server, 'proj_YOUR_PROJECT_ID', {
  endpoint: 'http://localhost:3800/api/v1',
  apiKey: 'ak_YOUR_API_KEY',
});
```

The SDK automatically:
- Intercepts all tool calls, resource reads, and prompt executions
- Injects a `context` parameter so LLMs explain their intent
- Strips context before passing args to your tool handler
- Batches events asynchronously (zero performance impact)
- Redacts sensitive fields by default

## API Endpoints

| Method | Path | Auth | Description |
|--------|------|------|-------------|
| POST | /api/v1/projects | None | Create project, returns API key |
| POST | /api/v1/events | API key | Batch event ingestion |
| GET | /api/v1/projects/:id/sessions | API key | List sessions |
| GET | /api/v1/projects/:id/sessions/:sid | API key | Session detail + events |
| GET | /api/v1/projects/:id/analytics | API key | Aggregated metrics |
| GET | /api/v1/projects/:id/tools | API key | Tool-level breakdown |
| GET | /api/v1/projects/:id/errors | API key | Error listing |

## Architecture

- **SDK** (`packages/sdk/`): TypeScript. Wraps MCP Server, intercepts handlers, batches events.
- **Server** (`packages/server/`): Express + sql.js (SQLite). REST API + static dashboard serving.
- **Dashboard** (`packages/dashboard/`): Vanilla HTML/JS/CSS. No build step.
- **Example** (`examples/echo-server/`): Demo MCP server with SDK integration.

## Self-Hostable

Unlike SaaS alternatives, MCP Analytics runs anywhere: your laptop, a VM, or behind your firewall. SQLite means zero external dependencies.

## Differentiators

- **Self-hosted first**: Full control over your data
- **Intent capture**: Understands *why* agents call tools, not just *what*
- **Zero config**: SQLite backend, no Postgres/Redis/etc required
- **One-line integration**: `track(server, projectId)` and done
- **Session replay**: Step through every interaction chronologically
- **OpenTelemetry compatible**: Forward to Datadog, Sentry, or any OTLP collector
