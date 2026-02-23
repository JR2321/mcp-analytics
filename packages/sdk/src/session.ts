import { v4 as uuidv4 } from 'uuid';
import { SessionInfo } from './types.js';

export class SessionManager {
  private sessions = new Map<string, SessionInfo>();
  private defaultTimeout = 30 * 60 * 1000; // 30 minutes
  private cleanupInterval?: NodeJS.Timeout;

  constructor(private debug = false) {
    // Clean up expired sessions every 5 minutes
    this.cleanupInterval = setInterval(() => {
      this.cleanupExpiredSessions();
    }, 5 * 60 * 1000);
  }

  /**
   * Get or create a session ID for the current context
   */
  getSessionId(clientInfo?: { name?: string; version?: string; userAgent?: string }): string {
    // Try to find existing active session based on client info
    const now = Date.now();
    
    for (const [sessionId, session] of this.sessions) {
      if (now - session.lastActivity < session.timeout) {
        // Update last activity
        session.lastActivity = now;
        return sessionId;
      }
    }

    // Create new session
    const sessionId = uuidv4();
    this.sessions.set(sessionId, {
      sessionId,
      startTime: now,
      lastActivity: now,
      timeout: this.defaultTimeout,
    });

    if (this.debug) {
      console.log(`Created new analytics session: ${sessionId}`);
    }

    return sessionId;
  }

  /**
   * Update session activity
   */
  updateActivity(sessionId: string): void {
    const session = this.sessions.get(sessionId);
    if (session) {
      session.lastActivity = Date.now();
    }
  }

  /**
   * Get session info
   */
  getSession(sessionId: string): SessionInfo | undefined {
    return this.sessions.get(sessionId);
  }

  /**
   * End a session
   */
  endSession(sessionId: string): void {
    if (this.sessions.delete(sessionId) && this.debug) {
      console.log(`Ended analytics session: ${sessionId}`);
    }
  }

  /**
   * Get all active sessions
   */
  getActiveSessions(): SessionInfo[] {
    const now = Date.now();
    const active: SessionInfo[] = [];

    for (const session of this.sessions.values()) {
      if (now - session.lastActivity < session.timeout) {
        active.push(session);
      }
    }

    return active;
  }

  /**
   * Set session timeout
   */
  setSessionTimeout(sessionId: string, timeout: number): void {
    const session = this.sessions.get(sessionId);
    if (session) {
      session.timeout = timeout;
    }
  }

  /**
   * Clean up expired sessions
   */
  cleanupExpiredSessions(): void {
    const now = Date.now();
    const expired: string[] = [];

    for (const [sessionId, session] of this.sessions) {
      if (now - session.lastActivity >= session.timeout) {
        expired.push(sessionId);
      }
    }

    for (const sessionId of expired) {
      this.sessions.delete(sessionId);
      if (this.debug) {
        console.log(`Cleaned up expired session: ${sessionId}`);
      }
    }
  }

  /**
   * Shutdown session manager
   */
  shutdown(): void {
    if (this.cleanupInterval) {
      clearInterval(this.cleanupInterval);
      this.cleanupInterval = undefined;
    }
    this.sessions.clear();
  }
}