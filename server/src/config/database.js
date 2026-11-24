import pkg from 'pg';
const { Pool } = pkg;
import dotenv from 'dotenv';

dotenv.config();

const isProduction = process.env.NODE_ENV === 'production';

const pool = new Pool({
  host: process.env.DB_HOST || 'localhost',
  port: process.env.DB_PORT || 5432,
  user: process.env.DB_USER || 'postgres',
  password: process.env.DB_PASSWORD,
  database: process.env.DB_NAME || 'restaurant_pos_db',
  ...(isProduction && { ssl: { rejectUnauthorized: false } }),
  connectionTimeoutMillis: 30000,
  
  max: 20,                // ✅ ADD: Increase pool size for concurrent POS usage
  statement_timeout: 15000 // ✅ ADD: Kill queries running longer than 15 seconds
});

export const query = (text, params) => pool.query(text, params);
export const getClient = () => pool.connect();

export const testConnection = async () => {
  try {
    const client = await pool.connect();
    await client.query('SELECT NOW()');
    console.log('✅ Database connected successfully');
    client.release();
    return true;
  } catch (err) {
    console.error('❌ Database error:', err.message);
    return false;
  }
};

export { pool };