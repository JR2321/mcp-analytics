export interface AnalyticsConfig {
  /** API endpoint for sending events */
  endpoint?: string;
  /** API key for authentication */
  apiKey?: string;
  /** Batch size for event queue */
  batchSize?: number;
  /** Flush interval in milliseconds */
  flushInterval?: number;
  /** Maximum queue size */
  maxQueueSize?: number;
  /** Request timeout in milliseconds */
  timeout?: number;
  /** Maximum retry attempts */
  maxRetries?: number;
  /** Initial retry delay in milliseconds */
  retryDelay?: number;
  /** Enable debug logging */
  debug?: boolean;
  /** User identification callback */
  identify?: (event: AnalyticsEvent) => string | undefined;
  /** Data redaction callback */
  redact?: (data: any) => any;
  /** OpenTelemetry configuration */
  opentelemetry?: OpenTelemetryConfig;
}

export interface OpenTelemetryConfig {
  /** Enable OpenTelemetry export */
  enabled: boolean;
  /** OTLP endpoint */
  otlpEndpoint?: string;
  /** Datadog configuration */
  datadog?: {
    apiKey: string;
    site?: string;
  };
  /** Sentry configuration */
  sentry?: {
    dsn: string;
  };
}

export interface AnalyticsEvent {
  /** Unique event ID */
  eventId: string;
  /** Project ID */
  projectId: string;
  /** Session ID */
  sessionId: string;
  /** Event type (initialize, tools/list, tools/call, etc.) */
  eventType: string;
  /** Timestamp when event started */
  timestamp: number;
  /** Event duration in milliseconds */
  duration?: number;
  /** Request parameters */
  request?: any;
  /** Response data */
  response?: any;
  /** Error information */
  error?: {
    name: string;
    message: string;
    stack?: string;
  };
  /** Client information */
  client?: {
    name?: string;
    version?: string;
    userAgent?: string;
  };
  /** User context from LLM */
  context?: string;
  /** User ID (if identified) */
  userId?: string;
  /** Additional metadata */
  metadata?: Record<string, any>;
}

export interface SessionInfo {
  /** Session ID */
  sessionId: string;
  /** Session start time */
  startTime: number;
  /** Last activity time */
  lastActivity: number;
  /** Session timeout in milliseconds */
  timeout: number;
}

export interface EventQueue {
  /** Add event to queue */
  enqueue(event: AnalyticsEvent): void;
  /** Flush pending events */
  flush(): Promise<void>;
  /** Get queue size */
  size(): number;
  /** Clear queue */
  clear(): void;
}

export interface AnalyticsClient {
  /** Track an event */
  track(event: Partial<AnalyticsEvent>): void;
  /** Identify a user */
  identify(userId: string): void;
  /** Flush pending events */
  flush(): Promise<void>;
  /** Shutdown client */
  shutdown(): Promise<void>;
}

export interface MCPHandler {
  (request: any, extra?: any): Promise<any>;
}

export interface MCPHandlers {
  [key: string]: MCPHandler;
}