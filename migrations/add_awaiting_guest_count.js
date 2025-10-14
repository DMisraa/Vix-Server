import pool from '../db/db.js';

/**
 * Migration: Add awaiting_guest_count column to event_messages table
 * 
 * This column tracks whether we're waiting for a guest count reply from the user
 * after they confirmed attendance.
 */

async function addAwaitingGuestCountColumn() {
  const client = await pool.connect();
  
  try {
    console.log('🔄 Starting migration: Add awaiting_guest_count column...');
    
    // Check if column already exists
    const columnCheck = await client.query(`
      SELECT column_name 
      FROM information_schema.columns 
      WHERE table_name = 'event_messages' 
      AND column_name = 'awaiting_guest_count'
    `);
    
    if (columnCheck.rows.length > 0) {
      console.log('✅ Column awaiting_guest_count already exists');
      return;
    }
    
    // Add the column with default value false
    await client.query(`
      ALTER TABLE event_messages 
      ADD COLUMN awaiting_guest_count BOOLEAN DEFAULT false
    `);
    
    console.log('✅ Successfully added awaiting_guest_count column to event_messages table');
    
  } catch (error) {
    console.error('❌ Migration failed:', error);
    throw error;
  } finally {
    client.release();
    await pool.end();
  }
}

// Run migration
addAwaitingGuestCountColumn()
  .then(() => {
    console.log('✅ Migration completed successfully');
    process.exit(0);
  })
  .catch((error) => {
    console.error('❌ Migration failed:', error);
    process.exit(1);
  });

