# MCP Analytics

**Understand how agents use your MCP tools.** One-line SDK integration gives you full visibility into tool calls, errors, sessions, and intent.

Self-hosted. SQLite. No external dependencies.

```
npm install @mcp-analytics/sdk
```

```typescript
import { track } from '@mcp-analytics/sdk';

const analytics = track(server, 'proj_abc123', {
  endpoint: 'http://localhost:3800/api/v1',
  apiKey: 'ak_your_key',
});
```

That's it. Every tool call, resource read, and prompt execution is now tracked.

---

## Why This Exists

MCP servers are black boxes. You ship a tool, an agent calls it, and you have no idea:

- Which tools get used vs. ignored
- Why agents call specific tools (intent)
- Where agents get stuck or retry
- How sessions flow from start to finish
- What errors agents hit and how often

MCP Analytics answers all of these with a single `track()` call.

---

## How It Works

```
┌─────────────┐     ┌──────────────┐     ┌──────────────────┐
│  MCP Client  │────>│  MCP Server  │────>│  Analytics API   │
│  (Claude,    │     │  + SDK       │     │  (Express+SQLite) │
│   Cursor...) │     │  track()     │     │                  │
└─────────────┘     └──────────────┘     └────────┬─────────┘
                                                   │
                                          ┌────────v─────────┐
                                          │    Dashboard      │
                                          │  Session Replay   │
                                          │  Tool Analytics   │
                                          │  Intent Analysis  │
                                          └──────────────────┘
```

The SDK wraps your MCP server's request handlers transparently. It intercepts tool calls, resource reads, and prompt executions, captures timing, errors, and LLM intent context, then batches events asynchronously to the analytics server. Zero performance impact on your MCP server.

---

## Quick Start

### 1. Start the analytics server

```bash
git clone https://github.com/JR2321/mcp-analytics.git
cd mcp-analytics
npm install
npm run seed   # Load demo data (optional)
npm run dev    # Start server + dashboard
```

Open **http://localhost:3800**. Enter the project ID and API key printed by the seed script.

### 2. Add tracking to your MCP server

```bash
npm install @mcp-analytics/sdk
```

```typescript
import { Server } from '@modelcontextprotocol/sdk/server/index.js';
import { track } from '@mcp-analytics/sdk';

const server = new Server({
  name: 'my-server',
  version: '1.0.0',
}, {
  capabilities: { tools: {} },
});

// Add analytics (one line)
const analytics = track(server, process.env.MCP_ANALYTICS_PROJECT_ID, {
  endpoint: process.env.MCP_ANALYTICS_ENDPOINT || 'http://localhost:3800/api/v1',
  apiKey: process.env.MCP_ANALYTICS_API_KEY,
});

// Your existing handlers work unchanged
server.setRequestHandler(CallToolRequestSchema, async (request) => {
  // ... your logic here
});
```

### 3. View the dashboard

The dashboard shows:
- **Session replay:** Step through every interaction chronologically
- **Tool analytics:** Call counts, error rates, latency percentiles
- **Intent analysis:** Why agents called each tool (extracted from LLM context)
- **Error tracking:** Stack traces, frequency, affected sessions

---

## SDK Reference

### `track(server, projectId, config?)`

Instruments an MCP server with analytics tracking.

| Parameter | Type | Description |
|-----------|------|-------------|
| `server` | `Server` | MCP Server instance from `@modelcontextprotocol/sdk` |
| `projectId` | `string` | Your project identifier |
| `config` | `AnalyticsConfig` | Optional configuration (see below) |

**Returns:** `McpAnalyticsClient` instance for manual event tracking, flushing, and shutdown.

### Configuration

```typescript
track(server, projectId, {
  // Server connection
  endpoint: 'http://localhost:3800/api/v1',
  apiKey: 'ak_your_key',

  // Batching
  batchSize: 50,           // Events per batch (default: 50)
  flushInterval: 5000,     // Flush interval in ms (default: 5000)
  maxQueueSize: 1000,      // Max queued events (default: 1000)

  // Reliability
  timeout: 5000,           // Request timeout in ms
  maxRetries: 3,           // Retry attempts on failure
  retryDelay: 1000,        // Initial retry delay in ms

  // Privacy
  redact: (data) => {      // Custom redaction function
    // Return sanitized data
  },

  // User tracking
  identify: (event) => {   // Extract user ID from events
    return event.client?.userAgent;
  },

  // Observability
  debug: false,            // Enable console logging

  // OpenTelemetry export
  opentelemetry: {
    enabled: true,
    otlpEndpoint: 'http://localhost:4318',
    // Or export to Datadog/Sentry directly
    datadog: { apiKey: 'dd_key' },
    sentry: { dsn: 'https://...' },
  },
});
```

### What the SDK Captures Automatically

| Event | Data Captured |
|-------|--------------|
| `initialize` | Server name, version, capabilities |
| `tools/call` | Tool name, arguments, response, duration, errors |
| `tools/list` | Available tools |
| `resources/read` | Resource URI, content type, duration |
| `resources/list` | Available resources |
| `prompts/get` | Prompt name, arguments, generated messages |
| `prompts/list` | Available prompts |

### Intent Capture

The SDK injects an optional `context` parameter into tool schemas. When an LLM explains why it's calling a tool, that reasoning is captured alongside the call. This powers the "Intent Analysis" view in the dashboard.

The `context` parameter is automatically stripped before reaching your tool handler. Your code doesn't need to change.

### Sensitive Data Handling

By default, the SDK redacts fields containing: `password`, `token`, `key`, `secret`, `authorization`, `auth`, `credential`, `private`.

Override with a custom `redact` function for project-specific needs.

---

## API Reference

All endpoints require an API key via `X-API-Key` header (except project creation).

| Method | Path | Description |
|--------|------|-------------|
| `POST` | `/api/v1/projects` | Create a project (returns API key) |
| `POST` | `/api/v1/events` | Batch event ingestion |
| `GET` | `/api/v1/projects/:id/sessions` | List sessions (paginated) |
| `GET` | `/api/v1/projects/:id/sessions/:sid` | Session detail with all events |
| `GET` | `/api/v1/projects/:id/analytics` | Aggregated metrics |
| `GET` | `/api/v1/projects/:id/tools` | Per-tool breakdown |
| `GET` | `/api/v1/projects/:id/errors` | Error listing with stack traces |

### Create a Project

```bash
curl -X POST http://localhost:3800/api/v1/projects \
  -H "Content-Type: application/json" \
  -d '{"name": "my-mcp-server"}'
```

Response:
```json
{
  "projectId": "proj_abc123",
  "apiKey": "ak_xyz789",
  "name": "my-mcp-server"
}
```

### Query Analytics

```bash
curl http://localhost:3800/api/v1/projects/proj_abc123/analytics \
  -H "X-API-Key: ak_xyz789"
```

---

## Architecture

```
mcp-analytics/
├── packages/
│   ├── sdk/              # TypeScript SDK for MCP servers
│   │   ├── tracker.ts    # Core instrumentation (wraps server handlers)
│   │   ├── client.ts     # HTTP client for analytics API
│   │   ├── queue.ts      # Async event batching and retry
│   │   ├── session.ts    # Session management
│   │   └── types.ts      # TypeScript interfaces
│   ├── server/           # Analytics API server
│   │   ├── server.ts     # Express REST API
│   │   ├── database.ts   # SQLite schema and queries
│   │   ├── seed.ts       # Demo data generator
│   │   └── index.ts      # Entry point
│   └── dashboard/        # Web dashboard
│       └── static/       # Vanilla HTML/CSS/JS (no build step)
├── examples/
│   └── echo-server/      # Reference MCP server with full integration
└── package.json          # Monorepo root (npm workspaces)
```

**Key design decisions:**

- **SQLite via sql.js:** Zero external dependencies. No Postgres, no Redis, no Docker required. The database is a single file.
- **Vanilla dashboard:** No React, no build step, no node_modules. Open `index.html` and it works.
- **Async batching:** Events are queued in memory and flushed in batches. A slow analytics server never blocks your MCP tool responses.
- **Handler wrapping:** The SDK monkey-patches `setRequestHandler` to intercept calls transparently. Your existing code doesn't change.

---

## Self-Hosting

MCP Analytics is designed to run anywhere: your laptop, a Raspberry Pi, a VM, or behind your corporate firewall. There is no cloud dependency.

```bash
# Production
NODE_ENV=production npm start

# With custom port
PORT=4000 npm start

# With persistent database path
DB_PATH=/data/analytics.db npm start
```

The SQLite database file is the only state. Back it up, move it, or delete it to start fresh.

---

## OpenTelemetry Integration

Forward events to your existing observability stack:

```typescript
track(server, projectId, {
  opentelemetry: {
    enabled: true,
    otlpEndpoint: 'http://localhost:4318',  // Any OTLP collector
  },
});
```

Compatible with Datadog, Sentry, Grafana, Honeycomb, and any OTLP-compatible backend.

---

## Example: Echo Server

The `examples/echo-server/` directory contains a fully instrumented MCP server with:

- 4 tools (echo, calculate, random, error_demo)
- 2 resources (server status, configuration)
- 2 prompts (demo conversation, error scenarios)
- Custom user identification
- Custom data redaction
- Graceful shutdown with event flushing

Run it:

```bash
cd examples/echo-server
npm install
MCP_ANALYTICS_PROJECT_ID=demo MCP_ANALYTICS_API_KEY=demo-key npx tsx src/index.ts
```

---

## Roadmap

- [ ] npm publish (`@mcp-analytics/sdk` and `@mcp-analytics/server`)
- [ ] Retention policies and data cleanup
- [ ] Webhook alerts (error spikes, latency thresholds)
- [ ] Multi-project dashboard view
- [ ] CSV/JSON export
- [ ] Docker image for one-command deployment

---

## Contributing

PRs welcome. The codebase is intentionally small. Start with the [architecture docs](docs/ARCHITECTURE.md).

## License

MIT
