import { Pool } from 'pg';

const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
  ssl: process.env.NODE_ENV === 'production' ? { rejectUnauthorized: false } : false
});

/**
 * Moves contacts between events in the database
 * @param {string} sourceEventId - The source event ID (can be null for General)
 * @param {string} targetEventId - The target event ID
 * @param {Array<string>} contactIds - Array of contact IDs to move
 * @returns {Object} - Result of the operation
 */
async function moveContactsBetweenEvents(sourceEventId, targetEventId, contactIds) {
  const client = await pool.connect();
  
  try {
    console.log(`Adding contacts to event ${targetEventId}:`, contactIds);
    
    // Add contacts to target event
    const insertQuery = `
      INSERT INTO event_contacts (event_id, contact_id)
      SELECT $1, unnest($2::integer[])
      ON CONFLICT (event_id, contact_id) DO NOTHING
    `;
    
    const insertResult = await client.query(insertQuery, [targetEventId, contactIds]);
    console.log(`Added contacts to target event ${targetEventId}`);
    
    return {
      success: true,
      message: `Successfully added ${contactIds.length} contacts to event ${targetEventId}`,
      addedCount: contactIds.length,
      sourceEventId,
      targetEventId
    };
    
  } catch (error) {
    console.error('Error adding contacts to event:', error);
    throw new Error(`Failed to add contacts: ${error.message}`);
  } finally {
    client.release();
  }
}

/**
 * Express endpoint handler for moving contacts between events
 * @param {Object} req - Express request object
 * @param {Object} res - Express response object
 */
export async function moveContactsEndpoint(req, res) {
  try {
    const { sourceEventId, targetEventId, contactIds } = req.body;
    
    if (!targetEventId || !contactIds || !Array.isArray(contactIds) || contactIds.length === 0) {
      return res.status(400).json({ 
        success: false, 
        error: 'Missing required fields: targetEventId and contactIds array' 
      });
    }
    
    const result = await moveContactsBetweenEvents(sourceEventId, targetEventId, contactIds);
    res.json(result);
    
  } catch (error) {
    console.error('Error in move-contacts endpoint:', error);
    res.status(500).json({ 
      success: false, 
      error: error.message || 'Failed to move contacts between events' 
    });
  }
}

export default moveContactsBetweenEvents; 