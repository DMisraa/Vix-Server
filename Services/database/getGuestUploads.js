import pool from '../../db/db.js';

export async function getGuestUploads(req, res) {
  try {
    const { invitedByEmail } = req.query;

    if (!invitedByEmail) {
      return res.status(400).json({ error: 'InvitedBy email is required' });
    }

    const client = await pool.connect();
    
    try {
      // Get uploads with contact counts
      const result = await client.query(`
        SELECT 
          gu.upload_id,
          gu.guest_name,
          gu.guest_notes,
          gu.created_at,
          gu.token,
          COUNT(gc.id) as contact_count
        FROM guest_contact_uploads gu
        LEFT JOIN guest_contacts gc ON gu.upload_id = gc.upload_id
        WHERE gu.invited_by_email = $1
        GROUP BY gu.upload_id, gu.guest_name, gu.guest_notes, gu.created_at, gu.token
        ORDER BY gu.created_at DESC
      `, [invitedByEmail]);

      res.json({ 
        success: true, 
        uploads: result.rows 
      });

    } finally {
      client.release();
    }

  } catch (error) {
    console.error('Error fetching guest uploads:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
} 