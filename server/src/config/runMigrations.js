// server/src/config/runMigrations.js
//
// Simple migration runner. Reads every .sql file from
// server/src/config/migrations/ in lexical order and executes it
// exactly once per server process. Failures are logged but do NOT
// crash the server (the migration is designed to be idempotent via
// "IF NOT EXISTS").
//
// Migrations must be named like:
//   2026-10-24-add-bottle-size.sql
//   2026-10-25-add-happy-hour.sql
//
// They will run in that order.

import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import { query } from './database.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const MIGRATIONS_DIR = path.join(__dirname, 'migrations');

let hasRun = false;

export const runMigrations = async () => {
    if (hasRun) {
        console.log('[MIGRATIONS] Already ran this process — skipping');
        return;
    }
    hasRun = true;

    if (!fs.existsSync(MIGRATIONS_DIR)) {
        console.log('[MIGRATIONS] No migrations directory found — skipping');
        return;
    }

    const files = fs
        .readdirSync(MIGRATIONS_DIR)
        .filter(f => f.endsWith('.sql'))
        .sort();

    if (files.length === 0) {
        console.log('[MIGRATIONS] No .sql files to run');
        return;
    }

    console.log(`[MIGRATIONS] Found ${files.length} migration file(s)`);

    for (const file of files) {
        const fullPath = path.join(MIGRATIONS_DIR, file);
        try {
            const sql = fs.readFileSync(fullPath, 'utf8').trim();
            if (!sql) {
                console.log(`[MIGRATIONS] Skipping empty file: ${file}`);
                continue;
            }
            console.log(`[MIGRATIONS] Running: ${file}`);
            await query(sql);
            console.log(`[MIGRATIONS] ✅ ${file} — done`);
        } catch (err) {
            console.error(`[MIGRATIONS] ❌ ${file} — FAILED: ${err.message}`);
            // Do NOT throw — server should still start. Migration is idempotent.
        }
    }

    console.log('[MIGRATIONS] Complete');
};

export default runMigrations;