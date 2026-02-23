/**
 * @anthropic/mcp-analytics
 * 
 * Analytics SDK for Model Context Protocol servers.
 * Provides one-line integration for comprehensive MCP server monitoring.
 */

export { track, injectContextParameter, enhanceToolSchemas } from './tracker.js';
export { McpAnalyticsClient } from './client.js';
export { SessionManager } from './session.js';
export { AnalyticsEventQueue, HttpEventSender } from './queue.js';

export type {
  AnalyticsConfig,
  OpenTelemetryConfig,
  AnalyticsEvent,
  SessionInfo,
  EventQueue,
  AnalyticsClient,
  MCPHandler,
  MCPHandlers,
} from './types.js';

// Default export for convenience
export { track as default } from './tracker.js';