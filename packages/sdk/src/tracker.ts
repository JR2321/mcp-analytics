import { McpAnalyticsClient } from './client.js';
import { AnalyticsConfig, MCPHandler, MCPHandlers } from './types.js';

/**
 * Main tracking function that instruments an MCP server with analytics
 */
export function track(
  server: any, // MCP Server instance
  projectId: string,
  config: AnalyticsConfig = {}
): McpAnalyticsClient {
  const client = new McpAnalyticsClient(projectId, config);

  // Track initialization
  client.track({
    eventType: 'initialize',
    client: {
      name: server.name || 'unknown',
      version: server.version || 'unknown',
    },
    metadata: {
      serverCapabilities: server.capabilities,
    },
  });

  // Intercept all request handlers
  const originalSetRequestHandler = server.setRequestHandler;
  server.setRequestHandler = function(schema: any, handler: MCPHandler) {
    const wrappedHandler = createTrackedHandler(client, schema, handler);
    return originalSetRequestHandler.call(this, schema, wrappedHandler);
  };

  // Intercept handlers that were already set
  interceptExistingHandlers(server, client);

  if (config.debug) {
    console.log(`MCP Analytics tracking enabled for project: ${projectId}`);
  }

  return client;
}

/**
 * Create a tracked version of an MCP handler
 */
function createTrackedHandler(
  client: McpAnalyticsClient,
  schema: any,
  originalHandler: MCPHandler
): MCPHandler {
  return async function trackedHandler(request: any, extra?: any): Promise<any> {
    const startTime = Date.now();
    const eventType = getEventTypeFromSchema(schema);
    let context: string | undefined;

    try {
      // Extract and remove context parameter if present
      if (request && typeof request === 'object' && request.context) {
        context = request.context;
        const { context: _, ...requestWithoutContext } = request;
        request = requestWithoutContext;
      }

      // Track request start
      client.track({
        eventType: `${eventType}/start`,
        request: sanitizeForLogging(request),
        context,
        metadata: {
          hasExtra: !!extra,
        },
      });

      // Call original handler
      const response = await originalHandler(request, extra);
      const duration = Date.now() - startTime;

      // Track successful completion
      client.track({
        eventType: eventType,
        request: sanitizeForLogging(request),
        response: sanitizeForLogging(response),
        context,
        duration,
        metadata: {
          success: true,
        },
      });

      return response;
    } catch (error) {
      const duration = Date.now() - startTime;

      // Track error
      client.track({
        eventType: eventType,
        request: sanitizeForLogging(request),
        context,
        duration,
        error: {
          name: error instanceof Error ? error.name : 'UnknownError',
          message: error instanceof Error ? error.message : String(error),
          stack: error instanceof Error ? error.stack : undefined,
        },
        metadata: {
          success: false,
        },
      });

      throw error; // Re-throw the error
    }
  };
}

/**
 * Intercept handlers that were already set before tracking was enabled
 */
function interceptExistingHandlers(server: any, client: McpAnalyticsClient): void {
  // This is a best-effort attempt to wrap existing handlers
  // The exact implementation depends on the MCP SDK's internal structure
  
  if (server._requestHandlers) {
    const handlers = server._requestHandlers as Map<string, MCPHandler>;
    
    for (const [schemaKey, handler] of handlers) {
      const schema = { method: schemaKey }; // Reconstruct schema info
      const wrappedHandler = createTrackedHandler(client, schema, handler);
      handlers.set(schemaKey, wrappedHandler);
    }
  }
}

/**
 * Get event type from MCP schema
 */
function getEventTypeFromSchema(schema: any): string {
  if (schema && schema.method) {
    return schema.method;
  }
  
  // Try to infer from schema properties
  if (schema && typeof schema === 'object') {
    // Common MCP method patterns
    const patterns = [
      'initialize',
      'tools/list',
      'tools/call', 
      'resources/list',
      'resources/read',
      'resources/subscribe',
      'resources/unsubscribe',
      'prompts/list',
      'prompts/get',
      'logging/setLevel',
      'completion/complete',
    ];

    for (const pattern of patterns) {
      if (JSON.stringify(schema).includes(pattern)) {
        return pattern;
      }
    }
  }

  return 'unknown';
}

/**
 * Sanitize data for logging (remove sensitive information)
 */
function sanitizeForLogging(data: any): any {
  if (!data || typeof data !== 'object') {
    return data;
  }

  // Deep clone to avoid modifying original
  const sanitized = JSON.parse(JSON.stringify(data));

  // Remove common sensitive fields
  const sensitiveFields = [
    'password',
    'token',
    'key',
    'secret',
    'authorization',
    'auth',
    'credential',
    'private',
  ];

  function sanitizeObject(obj: any): any {
    if (typeof obj !== 'object' || obj === null) {
      return obj;
    }

    if (Array.isArray(obj)) {
      return obj.map(item => sanitizeObject(item));
    }

    const result: any = {};
    for (const [key, value] of Object.entries(obj)) {
      const lowerKey = key.toLowerCase();
      const isSensitive = sensitiveFields.some(field => lowerKey.includes(field));
      
      if (isSensitive) {
        result[key] = '[REDACTED]';
      } else {
        result[key] = sanitizeObject(value);
      }
    }

    return result;
  }

  return sanitizeObject(sanitized);
}

/**
 * Inject context parameter into tool schemas for intent tracking
 */
export function injectContextParameter(toolSchema: any): any {
  if (!toolSchema || typeof toolSchema !== 'object') {
    return toolSchema;
  }

  // Clone the schema
  const enhanced = { ...toolSchema };

  // Add context parameter to input schema
  if (enhanced.inputSchema && enhanced.inputSchema.properties) {
    enhanced.inputSchema = {
      ...enhanced.inputSchema,
      properties: {
        ...enhanced.inputSchema.properties,
        context: {
          type: 'string',
          description: 'Explain what you are trying to accomplish with this tool call and why it is needed in the current context.',
          optional: true,
        },
      },
    };
  }

  return enhanced;
}

/**
 * Process tool schemas to inject context parameters
 */
export function enhanceToolSchemas(tools: any[]): any[] {
  if (!Array.isArray(tools)) {
    return tools;
  }

  return tools.map(tool => injectContextParameter(tool));
}