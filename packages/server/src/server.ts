import express, { Request, Response, NextFunction } from 'express';
import cors from 'cors';
import helmet from 'helmet';
import rateLimit from 'express-rate-limit';
import path from 'path';
import {
  initDatabase, closeDatabase, createProject, getProject, validateApiKey,
  insertEvents, getSessionsForProject, getSessionDetails, getAnalytics,
  getToolsAnalytics, getErrors
} from './database.js';

export interface AuthenticatedRequest extends Request {
  projectId?: string;
  keyId?: string;
}

export async function createServer() {
  await initDatabase();

  const app = express();

  // Security headers
  app.use(helmet({
    contentSecurityPolicy: {
      directives: {
        defaultSrc: ["'self'"],
        styleSrc: ["'self'", "'unsafe-inline'"],
        scriptSrc: ["'self'", "'unsafe-inline'"],
        imgSrc: ["'self'", "data:", "https:"],
        connectSrc: ["'self'"],
      },
    },
  }));

  app.use(cors({ origin: true, credentials: true }));

  app.use('/api', rateLimit({
    windowMs: 15 * 60 * 1000,
    max: 1000,
    standardHeaders: true,
    legacyHeaders: false,
  }));

  app.use(express.json({ limit: '10mb' }));

  // Request logging
  app.use((req: Request, res: Response, next: NextFunction) => {
    const start = Date.now();
    res.on('finish', () => console.log(`${req.method} ${req.path} ${res.statusCode} ${Date.now() - start}ms`));
    next();
  });

  // Health
  app.get('/health', (_req: Request, res: Response) => {
    res.json({ status: 'ok', timestamp: Date.now() });
  });

  // Auth middleware
  const authenticate = (req: AuthenticatedRequest, res: Response, next: NextFunction) => {
    const apiKey = req.headers['x-api-key'] as string;
    if (!apiKey) return res.status(401).json({ error: 'API key required' });
    const auth = validateApiKey(apiKey);
    if (!auth) return res.status(401).json({ error: 'Invalid API key' });
    req.projectId = auth.projectId;
    req.keyId = auth.keyId;
    next();
  };

  const router = express.Router();

  // Create project (no auth needed)
  router.post('/projects', (req: Request, res: Response) => {
    const { name, description } = req.body;
    if (!name) return res.status(400).json({ error: 'Project name required' });
    const result = createProject(name, description);
    res.status(201).json(result);
  });

  // Ingest events
  router.post('/events', authenticate, (req: AuthenticatedRequest, res: Response) => {
    const { events } = req.body;
    if (!Array.isArray(events) || events.length === 0) return res.status(400).json({ error: 'Events array required' });
    // Tag events with authenticated project
    const tagged = events.map(e => ({ ...e, projectId: req.projectId }));
    insertEvents(tagged);
    res.status(201).json({ message: 'Ingested', count: events.length });
  });

  // Sessions
  router.get('/projects/:projectId/sessions', authenticate, (req: AuthenticatedRequest, res: Response) => {
    if (req.params.projectId !== req.projectId) return res.status(403).json({ error: 'Access denied' });
    const limit = parseInt(req.query.limit as string) || 50;
    const offset = parseInt(req.query.offset as string) || 0;
    res.json({ sessions: getSessionsForProject(req.params.projectId, limit, offset), limit, offset });
  });

  router.get('/projects/:projectId/sessions/:sessionId', authenticate, (req: AuthenticatedRequest, res: Response) => {
    if (req.params.projectId !== req.projectId) return res.status(403).json({ error: 'Access denied' });
    const result = getSessionDetails(req.params.projectId, req.params.sessionId);
    if (!result.session) return res.status(404).json({ error: 'Session not found' });
    const events = result.events.map(e => ({
      ...e,
      request: e.request ? JSON.parse(e.request) : null,
      response: e.response ? JSON.parse(e.response) : null,
      error: e.error ? JSON.parse(e.error) : null,
      metadata: e.metadata ? JSON.parse(e.metadata) : null,
    }));
    res.json({ session: result.session, events });
  });

  // Analytics
  router.get('/projects/:projectId/analytics', authenticate, (req: AuthenticatedRequest, res: Response) => {
    if (req.params.projectId !== req.projectId) return res.status(403).json({ error: 'Access denied' });
    res.json(getAnalytics(req.params.projectId, req.query.timeRange as string || '24h'));
  });

  router.get('/projects/:projectId/tools', authenticate, (req: AuthenticatedRequest, res: Response) => {
    if (req.params.projectId !== req.projectId) return res.status(403).json({ error: 'Access denied' });
    res.json({ tools: getToolsAnalytics(req.params.projectId, req.query.timeRange as string || '24h') });
  });

  router.get('/projects/:projectId/errors', authenticate, (req: AuthenticatedRequest, res: Response) => {
    if (req.params.projectId !== req.projectId) return res.status(403).json({ error: 'Access denied' });
    const limit = parseInt(req.query.limit as string) || 100;
    const offset = parseInt(req.query.offset as string) || 0;
    res.json({ errors: getErrors(req.params.projectId, limit, offset), limit, offset });
  });

  app.use('/api/v1', router);

  // Dashboard static files
  const dashboardPath = path.join(__dirname, '../../dashboard/static');
  app.use(express.static(dashboardPath));
  app.get('/', (_req: Request, res: Response) => res.sendFile(path.join(dashboardPath, 'index.html')));

  // Error handling
  app.use((err: Error, _req: Request, res: Response, _next: NextFunction) => {
    console.error('Server error:', err);
    res.status(500).json({ error: 'Internal server error' });
  });

  return app;
}

export async function startServer(port = 3800) {
  const app = await createServer();
  app.listen(port, () => {
    console.log(`MCP Analytics server running on port ${port}`);
    console.log(`Dashboard: http://localhost:${port}`);
    console.log(`API: http://localhost:${port}/api/v1`);
  });

  process.on('SIGINT', () => { closeDatabase(); process.exit(0); });
  process.on('SIGTERM', () => { closeDatabase(); process.exit(0); });
}
