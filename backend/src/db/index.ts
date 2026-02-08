import { drizzle } from 'drizzle-orm/better-sqlite3';
import Database from 'better-sqlite3';
import * as schema from './schema';
import { config } from '../config';
import { existsSync, mkdirSync } from 'fs';
import { dirname, resolve } from 'path';
import { fileURLToPath } from 'url';

// Get the directory of this file
const __dirname = dirname(fileURLToPath(import.meta.url));

// Resolve database path relative to backend folder
let dbPath = config.database.url.replace('file:', '');
if (dbPath.startsWith('./')) {
  dbPath = resolve(__dirname, '../../', dbPath);
}

// Ensure directory exists
const dbDir = dirname(dbPath);
if (!existsSync(dbDir)) {
  mkdirSync(dbDir, { recursive: true });
}

// For SQLite file-based storage (good for hackathon/MVP)
const sqlite = new Database(dbPath);

export const db = drizzle(sqlite, { schema });

// Export schema for use elsewhere
export * from './schema';
