import * as SQLite from 'expo-sqlite';
import { DiagnosticSession } from '../types';

let db: SQLite.SQLiteDatabase | null = null;

export class Database {
  private static instance: Database;

  static getInstance(): Database {
    if (!Database.instance) {
      Database.instance = new Database();
    }
    return Database.instance;
  }

  async getDb(): Promise<SQLite.SQLiteDatabase> {
    if (!db) {
      db = await SQLite.openDatabaseAsync('diagnostics.db');
      await this.initTables();
    }
    return db;
  }

  private async initTables(): Promise<void> {
    const database = await this.getDb();
    await database.execAsync(`
      CREATE TABLE IF NOT EXISTS sessions (
        id TEXT PRIMARY KEY,
        deviceId TEXT,
        deviceModel TEXT,
        deviceManufacturer TEXT,
        osVersion TEXT,
        healthScore INTEGER,
        timestamp TEXT,
        duration INTEGER,
        results TEXT
      );
    `);
  }

  async saveSession(session: DiagnosticSession): Promise<void> {
    const database = await this.getDb();
    await database.runAsync(
      `INSERT OR REPLACE INTO sessions (id, deviceId, deviceModel, deviceManufacturer, osVersion, healthScore, timestamp, duration, results)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      [
        session.id,
        session.deviceId,
        session.deviceModel,
        session.deviceManufacturer,
        session.osVersion,
        session.healthScore,
        session.timestamp,
        session.duration,
        JSON.stringify(session.results),
      ]
    );
  }

  async getSessions(): Promise<DiagnosticSession[]> {
    const database = await this.getDb();
    const rows = await database.getAllAsync<any>(
      'SELECT * FROM sessions ORDER BY timestamp DESC'
    );

    return rows.map(row => ({
      ...row,
      results: JSON.parse(row.results),
    }));
  }

  async getSession(id: string): Promise<DiagnosticSession | null> {
    const database = await this.getDb();
    const row = await database.getFirstAsync<any>(
      'SELECT * FROM sessions WHERE id = ?',
      [id]
    );

    if (!row) return null;
    return { ...row, results: JSON.parse(row.results) };
  }

  async deleteSession(id: string): Promise<void> {
    const database = await this.getDb();
    await database.runAsync('DELETE FROM sessions WHERE id = ?', [id]);
  }

  async deleteAllSessions(): Promise<void> {
    const database = await this.getDb();
    await database.runAsync('DELETE FROM sessions');
  }

  async getSessionCount(): Promise<number> {
    const database = await this.getDb();
    const result = await database.getFirstAsync<any>('SELECT COUNT(*) as count FROM sessions');
    return result?.count ?? 0;
  }
}
