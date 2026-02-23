import initSqlJs, { Database as SqlJsDatabase } from 'sql.js';
import { v4 as uuidv4 } from 'uuid';
import fs from 'fs';
import path from 'path';

export interface Project {
  id: string;
  name: string;
  description?: string;
  createdAt: number;
  updatedAt: number;
}

export interface Session {
  id: string;
  projectId: string;
  sessionId: string;
  startTime: number;
  endTime?: number;
  userId?: string;
  clientName?: string;
  clientVersion?: string;
  eventCount: number;
  errorCount: number;
  createdAt: number;
  updatedAt: number;
}

export interface Event {
  id: string;
  projectId: string;
  sessionId: string;
  eventId: string;
  eventType: string;
  timestamp: number;
  duration?: number;
  request?: string;
  response?: string;
  error?: string;
  context?: string;
  userId?: string;
  metadata?: string;
  createdAt: number;
}

export interface AnalyticsMetrics {
  totalSessions: number;
  totalEvents: number;
  errorRate: number;
  avgLatency: number;
  topTools: Array<{ name: string; count: number; errorRate: number; avgLatency: number }>;
  topIntents: Array<{ intent: string; count: number }>;
}

let dbInstance: SqlJsDatabase | null = null;
let dbPath: string = '';

function saveDb() {
  if (dbInstance && dbPath) {
    const data = dbInstance.export();
    const buffer = Buffer.from(data);
    fs.writeFileSync(dbPath, buffer);
  }
}

// Auto-save every 30 seconds
let saveInterval: ReturnType<typeof setInterval> | null = null;

export async function initDatabase(customPath?: string): Promise<SqlJsDatabase> {
  const SQL = await initSqlJs();
  dbPath = customPath || process.env.DATABASE_PATH || path.join(process.cwd(), 'analytics.db');

  if (fs.existsSync(dbPath)) {
    const fileBuffer = fs.readFileSync(dbPath);
    dbInstance = new SQL.Database(fileBuffer);
  } else {
    dbInstance = new SQL.Database();
  }

  createTables(dbInstance);
  createIndexes(dbInstance);

  saveInterval = setInterval(saveDb, 30000);

  return dbInstance;
}

export function getDb(): SqlJsDatabase {
  if (!dbInstance) throw new Error('Database not initialized. Call initDatabase() first.');
  return dbInstance;
}

function createTables(db: SqlJsDatabase) {
  db.run(`CREATE TABLE IF NOT EXISTS projects (
    id TEXT PRIMARY KEY,
    name TEXT NOT NULL,
    description TEXT,
    created_at INTEGER NOT NULL,
    updated_at INTEGER NOT NULL
  )`);

  db.run(`CREATE TABLE IF NOT EXISTS api_keys (
    id TEXT PRIMARY KEY,
    project_id TEXT NOT NULL,
    key TEXT NOT NULL UNIQUE,
    name TEXT,
    created_at INTEGER NOT NULL,
    last_used INTEGER,
    active INTEGER NOT NULL DEFAULT 1,
    FOREIGN KEY (project_id) REFERENCES projects (id) ON DELETE CASCADE
  )`);

  db.run(`CREATE TABLE IF NOT EXISTS sessions (
    id TEXT PRIMARY KEY,
    project_id TEXT NOT NULL,
    session_id TEXT NOT NULL,
    start_time INTEGER NOT NULL,
    end_time INTEGER,
    user_id TEXT,
    client_name TEXT,
    client_version TEXT,
    event_count INTEGER NOT NULL DEFAULT 0,
    error_count INTEGER NOT NULL DEFAULT 0,
    created_at INTEGER NOT NULL,
    updated_at INTEGER NOT NULL,
    UNIQUE(project_id, session_id),
    FOREIGN KEY (project_id) REFERENCES projects (id) ON DELETE CASCADE
  )`);

  db.run(`CREATE TABLE IF NOT EXISTS events (
    id TEXT PRIMARY KEY,
    project_id TEXT NOT NULL,
    session_id TEXT NOT NULL,
    event_id TEXT NOT NULL,
    event_type TEXT NOT NULL,
    timestamp INTEGER NOT NULL,
    duration INTEGER,
    request TEXT,
    response TEXT,
    error TEXT,
    context TEXT,
    user_id TEXT,
    metadata TEXT,
    created_at INTEGER NOT NULL,
    FOREIGN KEY (project_id) REFERENCES projects (id) ON DELETE CASCADE
  )`);
}

function createIndexes(db: SqlJsDatabase) {
  db.run('CREATE INDEX IF NOT EXISTS idx_api_keys_key ON api_keys (key)');
  db.run('CREATE INDEX IF NOT EXISTS idx_sessions_project_id ON sessions (project_id)');
  db.run('CREATE INDEX IF NOT EXISTS idx_sessions_session_id ON sessions (session_id)');
  db.run('CREATE INDEX IF NOT EXISTS idx_events_project_id ON events (project_id)');
  db.run('CREATE INDEX IF NOT EXISTS idx_events_session_id ON events (session_id)');
  db.run('CREATE INDEX IF NOT EXISTS idx_events_event_type ON events (event_type)');
  db.run('CREATE INDEX IF NOT EXISTS idx_events_timestamp ON events (timestamp)');
}

// Helper to run a query and return rows as objects
function allRows(db: SqlJsDatabase, sql: string, params: any[] = []): any[] {
  const stmt = db.prepare(sql);
  stmt.bind(params);
  const rows: any[] = [];
  while (stmt.step()) {
    rows.push(stmt.getAsObject());
  }
  stmt.free();
  return rows;
}

function oneRow(db: SqlJsDatabase, sql: string, params: any[] = []): any | undefined {
  const rows = allRows(db, sql, params);
  return rows[0];
}

export function createProject(name: string, description?: string): { projectId: string; apiKey: string } {
  const db = getDb();
  const now = Date.now();
  const projectId = `proj_${uuidv4().replace(/-/g, '').substring(0, 16)}`;
  const apiKeyId = `key_${uuidv4().replace(/-/g, '').substring(0, 16)}`;
  const apiKey = `ak_${uuidv4().replace(/-/g, '')}`;

  db.run(
    `INSERT INTO projects (id, name, description, created_at, updated_at) VALUES (?, ?, ?, ?, ?)`,
    [projectId, name, description || null, now, now]
  );

  db.run(
    `INSERT INTO api_keys (id, project_id, key, name, created_at, active) VALUES (?, ?, ?, ?, ?, 1)`,
    [apiKeyId, projectId, apiKey, 'Default', now]
  );

  saveDb();
  return { projectId, apiKey };
}

export function getProject(projectId: string): Project | undefined {
  const db = getDb();
  const row = oneRow(db, `SELECT id, name, description, created_at, updated_at FROM projects WHERE id = ?`, [projectId]);
  if (!row) return undefined;
  return { id: row.id, name: row.name, description: row.description, createdAt: row.created_at, updatedAt: row.updated_at };
}

export function validateApiKey(apiKey: string): { projectId: string; keyId: string } | null {
  const db = getDb();
  const row = oneRow(db, `SELECT id, project_id FROM api_keys WHERE key = ? AND active = 1`, [apiKey]);
  if (!row) return null;
  db.run(`UPDATE api_keys SET last_used = ? WHERE id = ?`, [Date.now(), row.id]);
  return { projectId: row.project_id, keyId: row.id };
}

export function insertEvents(events: any[]): void {
  const db = getDb();
  const now = Date.now();

  for (const event of events) {
    const eventId = uuidv4();
    const hasError = event.error ? 1 : 0;
    const sessionDbId = `${event.projectId}_${event.sessionId}`;

    db.run(
      `INSERT INTO events (id, project_id, session_id, event_id, event_type, timestamp, duration, request, response, error, context, user_id, metadata, created_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      [
        eventId, event.projectId, event.sessionId, event.eventId || uuidv4(),
        event.eventType, event.timestamp, event.duration || null,
        event.request ? JSON.stringify(event.request) : null,
        event.response ? JSON.stringify(event.response) : null,
        event.error ? JSON.stringify(event.error) : null,
        event.context || null, event.userId || null,
        event.metadata ? JSON.stringify(event.metadata) : null, now
      ]
    );

    // Upsert session
    const existing = oneRow(db, `SELECT id, event_count, error_count FROM sessions WHERE project_id = ? AND session_id = ?`, [event.projectId, event.sessionId]);
    if (existing) {
      db.run(
        `UPDATE sessions SET event_count = ?, error_count = ?, updated_at = ? WHERE id = ?`,
        [existing.event_count + 1, existing.error_count + hasError, now, existing.id]
      );
    } else {
      db.run(
        `INSERT INTO sessions (id, project_id, session_id, start_time, user_id, client_name, client_version, event_count, error_count, created_at, updated_at)
         VALUES (?, ?, ?, ?, ?, ?, ?, 1, ?, ?, ?)`,
        [sessionDbId, event.projectId, event.sessionId, event.timestamp, event.userId || null, event.client?.name || null, event.client?.version || null, hasError, now, now]
      );
    }
  }

  saveDb();
}

export function getSessionsForProject(projectId: string, limit = 50, offset = 0): Session[] {
  const db = getDb();
  const rows = allRows(db,
    `SELECT id, project_id, session_id, start_time, end_time, user_id, client_name, client_version, event_count, error_count, created_at, updated_at
     FROM sessions WHERE project_id = ? ORDER BY created_at DESC LIMIT ? OFFSET ?`,
    [projectId, limit, offset]
  );
  return rows.map(r => ({
    id: r.id, projectId: r.project_id, sessionId: r.session_id, startTime: r.start_time,
    endTime: r.end_time, userId: r.user_id, clientName: r.client_name, clientVersion: r.client_version,
    eventCount: r.event_count, errorCount: r.error_count, createdAt: r.created_at, updatedAt: r.updated_at
  }));
}

export function getSessionDetails(projectId: string, sessionId: string) {
  const db = getDb();
  const sRow = oneRow(db,
    `SELECT id, project_id, session_id, start_time, end_time, user_id, client_name, client_version, event_count, error_count, created_at, updated_at
     FROM sessions WHERE project_id = ? AND session_id = ?`,
    [projectId, sessionId]
  );

  const eRows = allRows(db,
    `SELECT id, project_id, session_id, event_id, event_type, timestamp, duration, request, response, error, context, user_id, metadata, created_at
     FROM events WHERE project_id = ? AND session_id = ? ORDER BY timestamp ASC`,
    [projectId, sessionId]
  );

  const session = sRow ? {
    id: sRow.id, projectId: sRow.project_id, sessionId: sRow.session_id, startTime: sRow.start_time,
    endTime: sRow.end_time, userId: sRow.user_id, clientName: sRow.client_name, clientVersion: sRow.client_version,
    eventCount: sRow.event_count, errorCount: sRow.error_count, createdAt: sRow.created_at, updatedAt: sRow.updated_at
  } : undefined;

  const events = eRows.map(r => ({
    id: r.id, projectId: r.project_id, sessionId: r.session_id, eventId: r.event_id,
    eventType: r.event_type, timestamp: r.timestamp, duration: r.duration,
    request: r.request, response: r.response, error: r.error, context: r.context,
    userId: r.user_id, metadata: r.metadata, createdAt: r.created_at
  }));

  return { session, events };
}

function parseTimeRange(timeRange: string): number {
  const ranges: Record<string, number> = {
    '1h': 3600000, '24h': 86400000, '7d': 604800000, '30d': 2592000000
  };
  return ranges[timeRange] || ranges['24h'];
}

export function getAnalytics(projectId: string, timeRange = '24h'): AnalyticsMetrics {
  const db = getDb();
  const since = Date.now() - parseTimeRange(timeRange);

  const totals = oneRow(db,
    `SELECT COUNT(DISTINCT session_id) as totalSessions, COUNT(*) as totalEvents,
     COUNT(CASE WHEN error IS NOT NULL THEN 1 END) as errorCount,
     AVG(CASE WHEN duration IS NOT NULL THEN duration END) as avgLatency
     FROM events WHERE project_id = ? AND timestamp >= ?`,
    [projectId, since]
  ) || { totalSessions: 0, totalEvents: 0, errorCount: 0, avgLatency: 0 };

  const errorRate = totals.totalEvents > 0 ? (totals.errorCount / totals.totalEvents) * 100 : 0;

  const topTools = allRows(db,
    `SELECT event_type as name, COUNT(*) as count,
     COUNT(CASE WHEN error IS NOT NULL THEN 1 END) as errorCount,
     AVG(CASE WHEN duration IS NOT NULL THEN duration END) as avgLatency
     FROM events WHERE project_id = ? AND timestamp >= ?
     GROUP BY event_type ORDER BY count DESC LIMIT 10`,
    [projectId, since]
  ).map(t => ({
    name: t.name, count: t.count,
    errorRate: t.count > 0 ? (t.errorCount / t.count) * 100 : 0,
    avgLatency: t.avgLatency || 0
  }));

  const topIntents = allRows(db,
    `SELECT context as intent, COUNT(*) as count FROM events
     WHERE project_id = ? AND timestamp >= ? AND context IS NOT NULL AND context != ''
     GROUP BY context ORDER BY count DESC LIMIT 10`,
    [projectId, since]
  );

  return { totalSessions: totals.totalSessions, totalEvents: totals.totalEvents, errorRate, avgLatency: totals.avgLatency || 0, topTools, topIntents };
}

export function getToolsAnalytics(projectId: string, timeRange = '24h') {
  const db = getDb();
  const since = Date.now() - parseTimeRange(timeRange);

  return allRows(db,
    `SELECT event_type as name, COUNT(*) as count,
     COUNT(CASE WHEN error IS NULL THEN 1 END) as successCount,
     COUNT(CASE WHEN error IS NOT NULL THEN 1 END) as errorCount,
     AVG(CASE WHEN duration IS NOT NULL THEN duration END) as avgLatency
     FROM events WHERE project_id = ? AND timestamp >= ?
     GROUP BY event_type ORDER BY count DESC`,
    [projectId, since]
  ).map(t => ({
    name: t.name, count: t.count,
    errorRate: t.count > 0 ? (t.errorCount / t.count) * 100 : 0,
    successRate: t.count > 0 ? (t.successCount / t.count) * 100 : 0,
    avgLatency: t.avgLatency || 0
  }));
}

export function getErrors(projectId: string, limit = 100, offset = 0) {
  const db = getDb();
  return allRows(db,
    `SELECT id, event_type as eventType, timestamp, error, context, session_id as sessionId
     FROM events WHERE project_id = ? AND error IS NOT NULL
     ORDER BY timestamp DESC LIMIT ? OFFSET ?`,
    [projectId, limit, offset]
  ).map(r => ({ ...r, error: r.error ? JSON.parse(r.error) : null }));
}

export function closeDatabase() {
  if (saveInterval) clearInterval(saveInterval);
  saveDb();
  if (dbInstance) dbInstance.close();
  dbInstance = null;
}
