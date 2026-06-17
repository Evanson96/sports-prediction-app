import crypto from 'crypto';
import fs from 'fs';
import path from 'path';
import { DatabaseSync } from 'node:sqlite';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const defaultDbPath = path.resolve(__dirname, '../../data/app.sqlite');
const dbPath = process.env.DATABASE_URL?.startsWith('sqlite:')
  ? process.env.DATABASE_URL.replace(/^sqlite:/, '')
  : process.env.SQLITE_PATH || defaultDbPath;

let db;

const ensureDb = () => {
  if (db) return db;

  fs.mkdirSync(path.dirname(dbPath), { recursive: true });
  db = new DatabaseSync(dbPath);
  db.exec('PRAGMA journal_mode = WAL;');
  db.exec('PRAGMA foreign_keys = ON;');
  db.exec(`
    CREATE TABLE IF NOT EXISTS users (
      id TEXT PRIMARY KEY,
      email TEXT NOT NULL UNIQUE,
      password_hash TEXT NOT NULL,
      password_salt TEXT NOT NULL,
      created_at TEXT NOT NULL
    );

    CREATE TABLE IF NOT EXISTS sessions (
      token_hash TEXT PRIMARY KEY,
      user_id TEXT NOT NULL,
      created_at TEXT NOT NULL,
      expires_at TEXT NOT NULL,
      FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
    );

    CREATE TABLE IF NOT EXISTS saved_predictions (
      id TEXT PRIMARY KEY,
      user_id TEXT NOT NULL,
      match_key TEXT NOT NULL,
      prediction_json TEXT NOT NULL,
      created_at TEXT NOT NULL,
      FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
    );

    CREATE INDEX IF NOT EXISTS idx_saved_predictions_user_created
      ON saved_predictions(user_id, created_at DESC);

    CREATE TABLE IF NOT EXISTS analytics_events (
      id TEXT PRIMARY KEY,
      event_name TEXT NOT NULL,
      session_id TEXT NOT NULL,
      payload_json TEXT NOT NULL,
      request_id TEXT,
      ip_hash TEXT,
      user_agent_family TEXT,
      created_at TEXT NOT NULL
    );

    CREATE INDEX IF NOT EXISTS idx_analytics_events_created
      ON analytics_events(created_at DESC);

    CREATE TABLE IF NOT EXISTS provider_status_snapshots (
      id TEXT PRIMARY KEY,
      source_id TEXT NOT NULL,
      status TEXT NOT NULL,
      mode TEXT,
      payload_json TEXT NOT NULL,
      created_at TEXT NOT NULL
    );
  `);
  return db;
};

const hash = (value) => crypto.createHash('sha256').update(value).digest('hex');
const nowIso = () => new Date().toISOString();
const toJson = (value) => JSON.stringify(value ?? {});
const fromJson = (value) => {
  try {
    return JSON.parse(value);
  } catch {
    return null;
  }
};

const normalizeEmail = (email) => String(email || '').trim().toLowerCase();

export const sqliteDatabase = {
  id: 'sqlite-database',
  name: 'SQLite Database Adapter',
  type: 'database',
  mode: 'sqlite',
  path: dbPath,

  async createUser({ email, password }) {
    const database = ensureDb();
    const userId = crypto.randomUUID();
    const salt = crypto.randomBytes(16).toString('hex');
    const passwordHash = crypto.pbkdf2Sync(password, salt, 120_000, 32, 'sha256').toString('hex');

    database
      .prepare('INSERT INTO users (id, email, password_hash, password_salt, created_at) VALUES (?, ?, ?, ?, ?)')
      .run(userId, normalizeEmail(email), passwordHash, salt, nowIso());

    return { id: userId, email: normalizeEmail(email) };
  },

  async verifyUser({ email, password }) {
    const database = ensureDb();
    const row = database
      .prepare('SELECT id, email, password_hash, password_salt FROM users WHERE email = ?')
      .get(normalizeEmail(email));

    if (!row) return null;

    const passwordHash = crypto.pbkdf2Sync(password, row.password_salt, 120_000, 32, 'sha256').toString('hex');
    if (!crypto.timingSafeEqual(Buffer.from(passwordHash, 'hex'), Buffer.from(row.password_hash, 'hex'))) {
      return null;
    }

    return { id: row.id, email: row.email };
  },

  async createSession(userId) {
    const database = ensureDb();
    const token = crypto.randomBytes(32).toString('base64url');
    const expiresAt = new Date(Date.now() + 1000 * 60 * 60 * 24 * 30).toISOString();

    database
      .prepare('INSERT INTO sessions (token_hash, user_id, created_at, expires_at) VALUES (?, ?, ?, ?)')
      .run(hash(token), userId, nowIso(), expiresAt);

    return { token, expiresAt };
  },

  async findUserByToken(token) {
    const database = ensureDb();
    const row = database
      .prepare(
        `SELECT users.id, users.email
         FROM sessions
         JOIN users ON users.id = sessions.user_id
         WHERE sessions.token_hash = ? AND sessions.expires_at > ?`,
      )
      .get(hash(token), nowIso());

    return row ? { id: row.id, email: row.email } : null;
  },

  async savePrediction({ userId, prediction }) {
    const database = ensureDb();
    const id = crypto.randomUUID();
    const matchKey = `${prediction.match || 'match'}::${prediction.matchDate || ''}`;

    database
      .prepare('INSERT INTO saved_predictions (id, user_id, match_key, prediction_json, created_at) VALUES (?, ?, ?, ?, ?)')
      .run(id, userId, matchKey, toJson(prediction), nowIso());

    return { id };
  },

  async listPredictions(userId) {
    const database = ensureDb();
    const rows = database
      .prepare('SELECT id, prediction_json, created_at FROM saved_predictions WHERE user_id = ? ORDER BY created_at DESC LIMIT 50')
      .all(userId);

    return rows.map((row) => ({
      id: row.id,
      savedAt: row.created_at,
      ...fromJson(row.prediction_json),
    }));
  },

  async deletePrediction({ userId, id }) {
    const database = ensureDb();
    const result = database
      .prepare('DELETE FROM saved_predictions WHERE user_id = ? AND id = ?')
      .run(userId, id);

    return { deleted: result.changes > 0 };
  },

  async trackAnalyticsEvent(event) {
    const database = ensureDb();
    database
      .prepare(
        `INSERT INTO analytics_events
          (id, event_name, session_id, payload_json, request_id, ip_hash, user_agent_family, created_at)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
      )
      .run(
        crypto.randomUUID(),
        event.eventName,
        event.sessionId,
        toJson(event.payload),
        event.requestId || null,
        event.ipHash || null,
        event.userAgentFamily || null,
        nowIso(),
      );

    return { stored: true };
  },

  async getAnalyticsSummary() {
    const database = ensureDb();
    const totals = database
      .prepare('SELECT event_name, COUNT(*) as count FROM analytics_events GROUP BY event_name ORDER BY count DESC')
      .all()
      .reduce((summary, row) => ({ ...summary, [row.event_name]: row.count }), {});
    const countRow = database.prepare('SELECT COUNT(*) as count, COUNT(DISTINCT session_id) as uniqueSessions FROM analytics_events').get();

    return {
      provider: this.name,
      mode: this.mode,
      eventCount: countRow.count,
      uniqueSessions: countRow.uniqueSessions,
      totals,
      generatedAt: nowIso(),
    };
  },

  async recordProviderStatus(snapshot) {
    const database = ensureDb();
    const insert = database.prepare(
      `INSERT INTO provider_status_snapshots (id, source_id, status, mode, payload_json, created_at)
       VALUES (?, ?, ?, ?, ?, ?)`,
    );

    for (const source of snapshot.sources || []) {
      insert.run(crypto.randomUUID(), source.id, source.status, source.mode || null, toJson(source), nowIso());
    }

    return { stored: true };
  },

  async status() {
    ensureDb();
    return {
      id: this.id,
      name: this.name,
      type: this.type,
      status: 'online',
      mode: this.mode,
      updateCadence: 'Writes on user, history, analytics, and provider-status events',
    };
  },
};
