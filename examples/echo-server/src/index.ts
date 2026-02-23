#!/usr/bin/env node

/**
 * Example MCP Server with Analytics Integration
 * 
 * This server demonstrates how to integrate MCP Analytics with your server.
 * It provides several example tools and resources to showcase analytics features.
 */

import { Server } from '@modelcontextprotocol/sdk/server/index.js';
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js';
import {
  CallToolRequestSchema,
  ErrorCode,
  ListPromptsRequestSchema,
  ListResourcesRequestSchema,
  ListToolsRequestSchema,
  McpError,
  GetPromptRequestSchema,
  ReadResourceRequestSchema,
} from '@modelcontextprotocol/sdk/types.js';

// Import MCP Analytics
import { track } from '@anthropic/mcp-analytics';

/**
 * Create and configure the MCP server
 */
const server = new Server(
  {
    name: 'echo-server',
    version: '1.0.0',
  },
  {
    capabilities: {
      tools: {},
      resources: {},
      prompts: {},
    },
  }
);

// Enable analytics tracking
const analyticsClient = track(server, process.env.MCP_ANALYTICS_PROJECT_ID || 'demo-project', {
  apiKey: process.env.MCP_ANALYTICS_API_KEY || 'demo-key',
  endpoint: process.env.MCP_ANALYTICS_ENDPOINT || 'http://localhost:3800/api/v1/events',
  debug: process.env.NODE_ENV === 'development',
  
  // Custom user identification
  identify: (event) => {
    // Extract user ID from client info or session context
    return event.client?.userAgent?.includes('user:') 
      ? event.client.userAgent.split('user:')[1].split(' ')[0] 
      : undefined;
  },
  
  // Data redaction for sensitive information
  redact: (data) => {
    if (typeof data === 'object' && data !== null) {
      const redacted = { ...data };
      // Remove any sensitive keys
      ['password', 'secret', 'token', 'key'].forEach(key => {
        if (key in redacted) {
          redacted[key] = '[REDACTED]';
        }
      });
      return redacted;
    }
    return data;
  }
});

/**
 * Tool handlers
 */
server.setRequestHandler(ListToolsRequestSchema, async () => {
  return {
    tools: [
      {
        name: 'echo',
        description: 'Echo back the input text',
        inputSchema: {
          type: 'object',
          properties: {
            text: {
              type: 'string',
              description: 'Text to echo back',
            },
            delay: {
              type: 'number',
              description: 'Optional delay in milliseconds',
              minimum: 0,
              maximum: 5000,
            },
            uppercase: {
              type: 'boolean',
              description: 'Convert to uppercase',
              default: false,
            },
          },
          required: ['text'],
        },
      },
      {
        name: 'calculate',
        description: 'Perform basic mathematical operations',
        inputSchema: {
          type: 'object',
          properties: {
            operation: {
              type: 'string',
              enum: ['add', 'subtract', 'multiply', 'divide'],
              description: 'Mathematical operation to perform',
            },
            a: {
              type: 'number',
              description: 'First number',
            },
            b: {
              type: 'number',
              description: 'Second number',
            },
          },
          required: ['operation', 'a', 'b'],
        },
      },
      {
        name: 'random',
        description: 'Generate random data',
        inputSchema: {
          type: 'object',
          properties: {
            type: {
              type: 'string',
              enum: ['number', 'string', 'boolean'],
              description: 'Type of random data to generate',
            },
            min: {
              type: 'number',
              description: 'Minimum value for numbers',
              default: 0,
            },
            max: {
              type: 'number',
              description: 'Maximum value for numbers',
              default: 100,
            },
            length: {
              type: 'number',
              description: 'Length for strings',
              default: 8,
            },
          },
          required: ['type'],
        },
      },
      {
        name: 'error_demo',
        description: 'Demonstrate error handling and analytics',
        inputSchema: {
          type: 'object',
          properties: {
            error_type: {
              type: 'string',
              enum: ['validation', 'runtime', 'timeout'],
              description: 'Type of error to simulate',
            },
          },
          required: ['error_type'],
        },
      },
    ],
  };
});

server.setRequestHandler(CallToolRequestSchema, async (request) => {
  const { name, arguments: args } = request.params;

  try {
    switch (name) {
      case 'echo': {
        const { text, delay, uppercase } = args;
        
        // Simulate processing delay if requested
        if (delay && delay > 0) {
          await new Promise(resolve => setTimeout(resolve, delay));
        }
        
        let result = text;
        if (uppercase) {
          result = result.toUpperCase();
        }
        
        return {
          content: [
            {
              type: 'text',
              text: `Echo: ${result}`,
            },
          ],
        };
      }

      case 'calculate': {
        const { operation, a, b } = args;
        let result: number;
        
        switch (operation) {
          case 'add':
            result = a + b;
            break;
          case 'subtract':
            result = a - b;
            break;
          case 'multiply':
            result = a * b;
            break;
          case 'divide':
            if (b === 0) {
              throw new McpError(ErrorCode.InvalidParams, 'Division by zero');
            }
            result = a / b;
            break;
          default:
            throw new McpError(ErrorCode.InvalidParams, `Unknown operation: ${operation}`);
        }
        
        return {
          content: [
            {
              type: 'text',
              text: `${a} ${operation} ${b} = ${result}`,
            },
          ],
        };
      }

      case 'random': {
        const { type, min = 0, max = 100, length = 8 } = args;
        let result: any;
        
        switch (type) {
          case 'number':
            result = Math.floor(Math.random() * (max - min + 1)) + min;
            break;
          case 'string':
            const chars = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789';
            result = Array.from({ length }, () => chars.charAt(Math.floor(Math.random() * chars.length))).join('');
            break;
          case 'boolean':
            result = Math.random() < 0.5;
            break;
          default:
            throw new McpError(ErrorCode.InvalidParams, `Unknown type: ${type}`);
        }
        
        return {
          content: [
            {
              type: 'text',
              text: `Random ${type}: ${result}`,
            },
          ],
        };
      }

      case 'error_demo': {
        const { error_type } = args;
        
        switch (error_type) {
          case 'validation':
            throw new McpError(ErrorCode.InvalidParams, 'This is a simulated validation error');
          case 'runtime':
            throw new Error('This is a simulated runtime error');
          case 'timeout':
            // Simulate timeout by waiting too long
            await new Promise(resolve => setTimeout(resolve, 10000));
            return { content: [{ type: 'text', text: 'This should not be reached' }] };
          default:
            throw new McpError(ErrorCode.InvalidParams, `Unknown error type: ${error_type}`);
        }
      }

      default:
        throw new McpError(ErrorCode.MethodNotFound, `Unknown tool: ${name}`);
    }
  } catch (error) {
    // Analytics will automatically capture this error
    throw error;
  }
});

/**
 * Resource handlers
 */
server.setRequestHandler(ListResourcesRequestSchema, async () => {
  return {
    resources: [
      {
        uri: 'echo://status',
        mimeType: 'application/json',
        name: 'Server Status',
        description: 'Current server status and statistics',
      },
      {
        uri: 'echo://config',
        mimeType: 'application/json',
        name: 'Server Configuration',
        description: 'Server configuration details',
      },
    ],
  };
});

server.setRequestHandler(ReadResourceRequestSchema, async (request) => {
  const { uri } = request.params;

  switch (uri) {
    case 'echo://status':
      return {
        contents: [
          {
            uri,
            mimeType: 'application/json',
            text: JSON.stringify({
              status: 'running',
              uptime: process.uptime(),
              memory: process.memoryUsage(),
              version: '1.0.0',
              analytics: {
                enabled: true,
                projectId: process.env.MCP_ANALYTICS_PROJECT_ID || 'demo-project',
                queueSize: analyticsClient.getQueueSize(),
                activeSessions: analyticsClient.getActiveSessionCount(),
              }
            }, null, 2),
          },
        ],
      };

    case 'echo://config':
      return {
        contents: [
          {
            uri,
            mimeType: 'application/json',
            text: JSON.stringify({
              name: 'echo-server',
              version: '1.0.0',
              capabilities: ['tools', 'resources', 'prompts'],
              environment: process.env.NODE_ENV || 'production',
              analyticsEndpoint: process.env.MCP_ANALYTICS_ENDPOINT || 'http://localhost:3800/api/v1/events',
            }, null, 2),
          },
        ],
      };

    default:
      throw new McpError(ErrorCode.InvalidParams, `Unknown resource: ${uri}`);
  }
});

/**
 * Prompt handlers
 */
server.setRequestHandler(ListPromptsRequestSchema, async () => {
  return {
    prompts: [
      {
        name: 'demo_conversation',
        description: 'A demo conversation template for testing analytics',
        arguments: [
          {
            name: 'topic',
            description: 'Conversation topic',
            required: true,
          },
          {
            name: 'complexity',
            description: 'Complexity level (simple, moderate, complex)',
            required: false,
          },
        ],
      },
      {
        name: 'error_scenarios',
        description: 'Generate scenarios that test error handling',
        arguments: [
          {
            name: 'error_types',
            description: 'Comma-separated list of error types to include',
            required: false,
          },
        ],
      },
    ],
  };
});

server.setRequestHandler(GetPromptRequestSchema, async (request) => {
  const { name, arguments: args } = request.params;

  switch (name) {
    case 'demo_conversation': {
      const topic = args?.topic || 'general';
      const complexity = args?.complexity || 'simple';
      
      const prompts = {
        simple: [
          `Tell me about ${topic}`,
          `What are the basics of ${topic}?`,
          `Can you explain ${topic} simply?`,
        ],
        moderate: [
          `Provide a detailed explanation of ${topic} including key concepts`,
          `What are the advantages and disadvantages of ${topic}?`,
          `How does ${topic} compare to related concepts?`,
        ],
        complex: [
          `Analyze ${topic} from multiple perspectives including historical, technical, and practical viewpoints`,
          `What are the advanced applications and future implications of ${topic}?`,
          `Discuss the theoretical foundations and real-world implementations of ${topic}`,
        ],
      };

      const selectedPrompts = prompts[complexity] || prompts.simple;
      
      return {
        description: `Demo conversation about ${topic} (${complexity} level)`,
        messages: [
          {
            role: 'user',
            content: {
              type: 'text',
              text: selectedPrompts[Math.floor(Math.random() * selectedPrompts.length)],
            },
          },
        ],
      };
    }

    case 'error_scenarios': {
      const errorTypes = args?.error_types?.split(',').map(s => s.trim()) || ['validation', 'runtime'];
      
      const scenarios = errorTypes.map(type => 
        `Test error handling by calling the error_demo tool with error_type "${type}"`
      );

      return {
        description: 'Test scenarios for error handling and analytics',
        messages: [
          {
            role: 'user',
            content: {
              type: 'text',
              text: `Please run these error scenarios to test analytics:\n${scenarios.map((s, i) => `${i + 1}. ${s}`).join('\n')}`,
            },
          },
        ],
      };
    }

    default:
      throw new McpError(ErrorCode.InvalidParams, `Unknown prompt: ${name}`);
  }
});

/**
 * Start the server
 */
async function main() {
  const transport = new StdioServerTransport();
  await server.connect(transport);
  
  // Log startup with analytics info
  console.error('Echo MCP Server with Analytics started');
  console.error(`Analytics Project ID: ${process.env.MCP_ANALYTICS_PROJECT_ID || 'demo-project'}`);
  console.error(`Analytics Endpoint: ${process.env.MCP_ANALYTICS_ENDPOINT || 'http://localhost:3800/api/v1/events'}`);
}

// Handle graceful shutdown
process.on('SIGINT', async () => {
  console.error('Shutting down server...');
  await analyticsClient.flush();
  await analyticsClient.shutdown();
  process.exit(0);
});

process.on('SIGTERM', async () => {
  console.error('Shutting down server...');
  await analyticsClient.flush();
  await analyticsClient.shutdown();
  process.exit(0);
});

if (require.main === module) {
  main().catch((error) => {
    console.error('Server failed to start:', error);
    process.exit(1);
  });
}