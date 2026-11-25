// server/src/config/runMigrations.js
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import { getClient } from './database.js'; // Use getClient for a dedicated locked connection

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const MIGRATIONS_DIR = path.join(__dirname, 'migrations');

export const runMigrations = async () => {
    const client = await getClient(); // Acquire dedicated client
    try {
        // 1. Create tracking table if it doesn't exist
        await client.query(`
            CREATE TABLE IF NOT EXISTS schema_migrations (
                filename VARCHAR(255) PRIMARY KEY,
                applied_at TIMESTAMP DEFAULT NOW()
            )
        `);

        // 2. Acquire session-level advisory lock to prevent concurrent deployment race conditions
        await client.query("SELECT pg_advisory_lock(hashtext('zen_tech_migrations'))");
        console.log('[MIGRATIONS] Advisory lock acquired');

        const files = fs.readdirSync(MIGRATIONS_DIR).filter(f => f.endsWith('.sql')).sort();
        if (files.length === 0) {
            console.log('[MIGRATIONS] No .sql files to run');
            return;
        }

        for (const file of files) {
            // 3. Check if already applied
            const check = await client.query('SELECT filename FROM schema_migrations WHERE filename = $1', [file]);
            if (check.rows.length > 0) {
                console.log(`[MIGRATIONS] ⏭️  ${file} already applied, skipping`);
                continue;
            }

            const fullPath = path.join(MIGRATIONS_DIR, file);
            const sql = fs.readFileSync(fullPath, 'utf8').trim();
            if (!sql) continue;

            console.log(`[MIGRATIONS] Running: ${file}`);
            try {
                // 4. Execute in a transaction
                await client.query('BEGIN');
                await client.query(sql);
                await client.query('INSERT INTO schema_migrations (filename) VALUES ($1)', [file]);
                await client.query('COMMIT');
                console.log(`[MIGRATIONS] ✅ ${file} — done`);
            } catch (err) {
                await client.query('ROLLBACK');
                console.error(`[MIGRATIONS] ❌ ${file} — FAILED: ${err.message}`);
                throw err; // CRITICAL: Throw to halt server startup immediately
            }
        }
        console.log('[MIGRATIONS] Complete');
    } finally {
        // 5. Always release lock and client, even on failure
        await client.query("SELECT pg_advisory_unlock(hashtext('zen_tech_migrations'))").catch(() => {});
        client.release();
    }
};

export default runMigrations;