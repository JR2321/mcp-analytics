import { v4 as uuidv4 } from 'uuid';
import { AnalyticsClient, AnalyticsEvent, AnalyticsConfig } from './types.js';
import { AnalyticsEventQueue, HttpEventSender } from './queue.js';
import { SessionManager } from './session.js';

export class McpAnalyticsClient implements AnalyticsClient {
  private queue: AnalyticsEventQueue;
  private sessionManager: SessionManager;
  private config: Required<AnalyticsConfig>;
  private currentUserId?: string;

  constructor(private projectId: string, config: AnalyticsConfig = {}) {
    // Set defaults
    this.config = {
      endpoint: config.endpoint || 'http://localhost:3800/api/v1/events',
      apiKey: config.apiKey || '',
      batchSize: config.batchSize || 50,
      flushInterval: config.flushInterval || 5000,
      maxQueueSize: config.maxQueueSize || 10000,
      timeout: config.timeout || 30000,
      maxRetries: config.maxRetries || 3,
      retryDelay: config.retryDelay || 1000,
      debug: config.debug || false,
      identify: config.identify,
      redact: config.redact || ((data) => data),
      opentelemetry: config.opentelemetry,
    };

    this.sessionManager = new SessionManager(this.config.debug);
    
    const sender = new HttpEventSender(this.config);
    this.queue = new AnalyticsEventQueue(this.config, (events) => sender.sendEvents(events));

    if (this.config.debug) {
      console.log(`Initialized MCP Analytics client for project: ${projectId}`);
    }

    // Initialize OpenTelemetry if configured
    if (this.config.opentelemetry?.enabled) {
      this.initializeOpenTelemetry();
    }
  }

  track(event: Partial<AnalyticsEvent>): void {
    const now = Date.now();
    const sessionId = this.sessionManager.getSessionId(event.client);
    
    const fullEvent: AnalyticsEvent = {
      eventId: uuidv4(),
      projectId: this.projectId,
      sessionId,
      timestamp: now,
      eventType: event.eventType || 'unknown',
      ...event,
    };

    // Add user ID if identified
    if (this.currentUserId) {
      fullEvent.userId = this.currentUserId;
    } else if (this.config.identify) {
      const userId = this.config.identify(fullEvent);
      if (userId) {
        fullEvent.userId = userId;
        this.currentUserId = userId;
      }
    }

    // Update session activity
    this.sessionManager.updateActivity(sessionId);

    // Queue the event
    this.queue.enqueue(fullEvent);

    if (this.config.debug) {
      console.log(`Tracked event: ${fullEvent.eventType} (${fullEvent.eventId})`);
    }

    // Export to OpenTelemetry if configured
    if (this.config.opentelemetry?.enabled) {
      this.exportToOpenTelemetry(fullEvent);
    }
  }

  identify(userId: string): void {
    this.currentUserId = userId;
    
    if (this.config.debug) {
      console.log(`Identified user: ${userId}`);
    }

    // Track identify event
    this.track({
      eventType: 'identify',
      userId,
      metadata: {
        identifiedAt: Date.now(),
      },
    });
  }

  async flush(): Promise<void> {
    await this.queue.flush();
  }

  async shutdown(): Promise<void> {
    if (this.config.debug) {
      console.log('Shutting down MCP Analytics client');
    }

    await this.queue.shutdown();
    this.sessionManager.shutdown();
  }

  /**
   * Get current session info
   */
  getCurrentSession(): string {
    return this.sessionManager.getSessionId();
  }

  /**
   * Get active session count
   */
  getActiveSessionCount(): number {
    return this.sessionManager.getActiveSessions().length;
  }

  /**
   * Get queue size
   */
  getQueueSize(): number {
    return this.queue.size();
  }

  private initializeOpenTelemetry(): void {
    // This would integrate with actual OpenTelemetry SDK
    // For now, just log that it's initialized
    if (this.config.debug) {
      console.log('OpenTelemetry integration initialized');
    }
  }

  private exportToOpenTelemetry(event: AnalyticsEvent): void {
    // Export event to OpenTelemetry
    // This would use actual OTEL exporters (OTLP, Datadog, Sentry)
    if (this.config.debug) {
      console.log(`Exporting to OpenTelemetry: ${event.eventType}`);
    }

    // Example: Create spans for tool calls
    if (event.eventType === 'tools/call') {
      // Would create OTEL span with attributes
      const span = {
        name: `mcp.tool.${event.request?.name || 'unknown'}`,
        startTime: event.timestamp,
        endTime: event.timestamp + (event.duration || 0),
        attributes: {
          'mcp.tool.name': event.request?.name,
          'mcp.project.id': event.projectId,
          'mcp.session.id': event.sessionId,
          'mcp.user.context': event.context,
          'mcp.error': !!event.error,
        },
      };

      if (this.config.debug) {
        console.log('OTEL Span:', span);
      }
    }
  }
}