import { AnalyticsEvent, AnalyticsConfig, EventQueue } from './types.js';

export class AnalyticsEventQueue implements EventQueue {
  private events: AnalyticsEvent[] = [];
  private flushTimer?: NodeJS.Timeout;
  private isShuttingDown = false;

  constructor(
    private config: Required<AnalyticsConfig>,
    private sendEvents: (events: AnalyticsEvent[]) => Promise<void>
  ) {
    // Start flush timer
    this.startFlushTimer();
  }

  enqueue(event: AnalyticsEvent): void {
    if (this.isShuttingDown) {
      if (this.config.debug) {
        console.warn('Analytics queue is shutting down, dropping event');
      }
      return;
    }

    // Apply redaction if configured
    if (this.config.redact) {
      event = this.redactEvent(event);
    }

    // Check queue size limit
    if (this.events.length >= this.config.maxQueueSize) {
      if (this.config.debug) {
        console.warn('Analytics queue full, dropping oldest event');
      }
      this.events.shift(); // Remove oldest event
    }

    this.events.push(event);

    // Flush if batch size reached
    if (this.events.length >= this.config.batchSize) {
      this.flush();
    }
  }

  async flush(): Promise<void> {
    if (this.events.length === 0) {
      return;
    }

    const eventsToSend = this.events.splice(0);
    
    if (this.config.debug) {
      console.log(`Flushing ${eventsToSend.length} analytics events`);
    }

    try {
      await this.sendEvents(eventsToSend);
    } catch (error) {
      if (this.config.debug) {
        console.error('Failed to send analytics events:', error);
      }
      
      // If not shutting down, attempt to re-queue events (up to queue limit)
      if (!this.isShuttingDown) {
        const requeue = eventsToSend.slice(0, Math.max(0, this.config.maxQueueSize - this.events.length));
        this.events.unshift(...requeue);
      }
    }
  }

  size(): number {
    return this.events.length;
  }

  clear(): void {
    this.events = [];
  }

  async shutdown(): Promise<void> {
    this.isShuttingDown = true;
    
    // Stop flush timer
    if (this.flushTimer) {
      clearInterval(this.flushTimer);
      this.flushTimer = undefined;
    }

    // Flush remaining events
    await this.flush();
  }

  private startFlushTimer(): void {
    this.flushTimer = setInterval(() => {
      if (this.events.length > 0) {
        this.flush();
      }
    }, this.config.flushInterval);
  }

  private redactEvent(event: AnalyticsEvent): AnalyticsEvent {
    return {
      ...event,
      request: this.config.redact(event.request),
      response: this.config.redact(event.response),
      metadata: this.config.redact(event.metadata),
    };
  }
}

export class HttpEventSender {
  constructor(private config: Required<AnalyticsConfig>) {}

  async sendEvents(events: AnalyticsEvent[]): Promise<void> {
    let lastError: Error | undefined;
    
    for (let attempt = 0; attempt <= this.config.maxRetries; attempt++) {
      try {
        await this.sendRequest(events);
        return; // Success
      } catch (error) {
        lastError = error as Error;
        
        if (attempt < this.config.maxRetries) {
          const delay = this.config.retryDelay * Math.pow(2, attempt); // Exponential backoff
          await this.sleep(delay);
        }
      }
    }

    throw lastError || new Error('Failed to send events after retries');
  }

  private async sendRequest(events: AnalyticsEvent[]): Promise<void> {
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), this.config.timeout);

    try {
      const response = await fetch(this.config.endpoint, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'X-API-Key': this.config.apiKey,
        },
        body: JSON.stringify({ events }),
        signal: controller.signal,
      });

      if (!response.ok) {
        throw new Error(`HTTP ${response.status}: ${response.statusText}`);
      }
    } finally {
      clearTimeout(timeoutId);
    }
  }

  private sleep(ms: number): Promise<void> {
    return new Promise(resolve => setTimeout(resolve, ms));
  }
}