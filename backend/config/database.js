/* ── Database Configuration ─────────────────────────────── */

const { Pool } = require('pg');
require('dotenv').config({ path: 'D:\\insta_follower\\backend\\.env' });

const pool = new Pool({
  host: process.env.DB_HOST || 'localhost',
  port: process.env.DB_PORT || 5432,
  database: process.env.DB_NAME || 'postgres',
  user: process.env.DB_USER || 'postgres',
  password: process.env.DB_PASSWORD,
  // ✅ Supabase ke liye SSL zaroori hai
  ssl: {
    rejectUnauthorized: false
  }
});

// ✅ Connection test
pool.connect((err, client, release) => {
  if (err) {
    console.error('❌ Database connection failed:', err.message);
  } else {
    console.log('✅ Supabase database connected!');
    release();
  }
});

pool.on('error', (err) => {
  console.error('❌ Unexpected database error:', err.message);
});

module.exports = pool;