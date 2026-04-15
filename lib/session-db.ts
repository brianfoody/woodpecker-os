import Database from "better-sqlite3";
import path from "path";

export interface SessionRow {
  session_id: string;
  canvas_key: string;
  first_prompt: string;
  created_at: string;
  last_used_at: string;
  message_count: number;
}

const DB_PATH =
  process.env.WOODPECKER_DB_PATH ||
  path.resolve(process.cwd(), ".woodpecker-sessions.db");

let _db: Database.Database | null = null;

function getDb(): Database.Database {
  if (_db) return _db;

  _db = new Database(DB_PATH);
  _db.pragma("journal_mode = WAL");

  _db.exec(`
    CREATE TABLE IF NOT EXISTS sessions (
      session_id    TEXT PRIMARY KEY,
      canvas_key    TEXT NOT NULL,
      first_prompt  TEXT NOT NULL DEFAULT '',
      created_at    TEXT NOT NULL DEFAULT (datetime('now')),
      last_used_at  TEXT NOT NULL DEFAULT (datetime('now')),
      message_count INTEGER NOT NULL DEFAULT 1
    );
    CREATE INDEX IF NOT EXISTS idx_sessions_canvas_key ON sessions(canvas_key);
    CREATE INDEX IF NOT EXISTS idx_sessions_last_used ON sessions(last_used_at DESC);
  `);

  return _db;
}

export function upsertSession(
  sessionId: string,
  canvasKey: string,
  prompt: string
) {
  const db = getDb();
  db.prepare(
    `INSERT INTO sessions (session_id, canvas_key, first_prompt)
     VALUES (?, ?, ?)
     ON CONFLICT(session_id) DO UPDATE SET
       last_used_at = datetime('now'),
       message_count = message_count + 1`
  ).run(sessionId, canvasKey, prompt);
}

export function getSessionByCanvasKey(
  canvasKey: string
): SessionRow | undefined {
  const db = getDb();
  return db
    .prepare(
      `SELECT * FROM sessions WHERE canvas_key = ? ORDER BY last_used_at DESC LIMIT 1`
    )
    .get(canvasKey) as SessionRow | undefined;
}

export function deleteSession(canvasKey: string) {
  const db = getDb();
  db.prepare(`DELETE FROM sessions WHERE canvas_key = ?`).run(canvasKey);
}

export function getRecentSessions(limit = 50): SessionRow[] {
  const db = getDb();
  return db
    .prepare(`SELECT * FROM sessions ORDER BY last_used_at DESC LIMIT ?`)
    .all(limit) as SessionRow[];
}

export function getSessionStats(): { total: number; today: number } {
  const db = getDb();
  const total = (
    db.prepare(`SELECT COUNT(*) as count FROM sessions`).get() as {
      count: number;
    }
  ).count;
  const today = (
    db
      .prepare(
        `SELECT COUNT(*) as count FROM sessions WHERE date(created_at) = date('now')`
      )
      .get() as { count: number }
  ).count;
  return { total, today };
}
