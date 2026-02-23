import { initDatabase, closeDatabase, createProject, insertEvents } from './database.js';
import { v4 as uuidv4 } from 'uuid';

async function generateSeedData(): Promise<void> {
  console.log('Seeding MCP Analytics with demo data...');
  
  await initDatabase();
  
  const { projectId, apiKey } = createProject('Demo MCP Server', 'Demonstration project for MCP Analytics');
  
  console.log(`Created demo project: ${projectId}`);
  console.log(`API Key: ${apiKey}`);
  
  const events = generateDemoEvents(projectId);
  console.log(`Generated ${events.length} demo events`);
  
  const batchSize = 100;
  for (let i = 0; i < events.length; i += batchSize) {
    insertEvents(events.slice(i, i + batchSize));
  }
  
  console.log('Seed data generated successfully!');
  console.log(`\nStart the server and visit: http://localhost:3800`);
  console.log(`Project ID: ${projectId}`);
  console.log(`API Key: ${apiKey}`);
  
  closeDatabase();
}

function generateDemoEvents(projectId: string): any[] {
  const events: any[] = [];
  const now = Date.now();
  const msPerDay = 86400000;
  
  const tools = [
    { name: 'files/read', avgDuration: 150, errorRate: 0.02 },
    { name: 'files/write', avgDuration: 200, errorRate: 0.05 },
    { name: 'files/list', avgDuration: 100, errorRate: 0.01 },
    { name: 'database/query', avgDuration: 300, errorRate: 0.08 },
    { name: 'http/request', avgDuration: 500, errorRate: 0.15 },
    { name: 'email/send', avgDuration: 800, errorRate: 0.03 },
    { name: 'calendar/event', avgDuration: 400, errorRate: 0.02 },
    { name: 'git/commit', avgDuration: 250, errorRate: 0.01 },
  ];
  
  const contexts = [
    'Preparing monthly financial report',
    'Debugging production issue with user authentication',
    'Setting up development environment for new project',
    'Analyzing customer feedback from recent survey',
    'Creating presentation for board meeting',
    'Investigating performance bottleneck in API',
    'Updating documentation for new features',
    'Processing customer support tickets',
    'Planning sprint for next development cycle',
    'Reviewing code changes for security compliance',
  ];
  
  const errors = ['Permission denied', 'File not found', 'Network timeout', 'Invalid parameters', 'Rate limit exceeded', 'Authentication failed'];

  for (let day = 0; day < 7; day++) {
    const dayStart = now - (day * msPerDay);
    for (let s = 0; s < 15; s++) {
      const sessionId = uuidv4();
      const userId = `user_${Math.floor(Math.random() * 10) + 1}`;
      const sessionStart = dayStart + Math.random() * msPerDay;
      
      events.push({
        eventId: uuidv4(), projectId, sessionId, eventType: 'initialize',
        timestamp: sessionStart, client: { name: 'demo-mcp-server', version: '1.0.0' }, userId,
      });
      
      events.push({
        eventId: uuidv4(), projectId, sessionId, eventType: 'tools/list',
        timestamp: sessionStart + 100, duration: 50, userId,
      });
      
      let ts = sessionStart + 1000;
      for (let e = 0; e < 12; e++) {
        const tool = tools[Math.floor(Math.random() * tools.length)];
        const hasError = Math.random() < tool.errorRate;
        const duration = Math.max(50, Math.floor(tool.avgDuration + (Math.random() - 0.5) * tool.avgDuration * 0.5));
        
        const ev: any = {
          eventId: uuidv4(), projectId, sessionId, eventType: 'tools/call',
          timestamp: ts, duration, request: { name: tool.name },
          context: contexts[Math.floor(Math.random() * contexts.length)], userId,
        };
        
        if (hasError) {
          ev.error = { name: 'ToolExecutionError', message: `${tool.name}: ${errors[Math.floor(Math.random() * errors.length)]}` };
        } else {
          ev.response = { success: true };
        }
        
        events.push(ev);
        ts += duration + Math.random() * 5000 + 1000;
      }
    }
  }
  
  return events;
}

generateSeedData().catch(err => { console.error(err); process.exit(1); });
