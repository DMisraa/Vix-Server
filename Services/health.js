import pool from '../db/db.js';

export async function healthCheck(req, res) {
  try {
    const client = await pool.connect();
    await client.query('SELECT 1');
    client.release();
    res.json({ status: 'healthy', timestamp: new Date().toISOString() });
  } catch (error) {
    console.error('Health check failed:', error);
    res.status(500).json({ status: 'unhealthy', error: error.message });
  }
} 