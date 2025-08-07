import pool from '../../db/db.js';

export async function getGuestUploadContacts(req, res) {
  try {
    const { uploadId } = req.params;

    // Validate uploadId
    if (!uploadId) {
      return res.status(400).json({ 
        success: false, 
        error: 'Upload ID is required' 
      });
    }

    const client = await pool.connect();
    try {
      // First verify the upload exists and get basic info
      const uploadQuery = `
        SELECT upload_id, guest_name, guest_notes, created_at, invited_by_email 
        FROM guest_contact_uploads 
        WHERE upload_id = $1
      `;
      const uploadResult = await client.query(uploadQuery, [uploadId]);
      
      if (uploadResult.rows.length === 0) {
        return res.status(404).json({ 
          success: false, 
          error: 'Upload not found' 
        });
      }

      // Fetch all contacts for this upload
      const contactsQuery = `
        SELECT id, display_name, phone_number, email, invited_by, created_at, contact_source, canonical_form
        FROM guest_contacts 
        WHERE upload_id = $1 
        ORDER BY created_at ASC
      `;
      const contactsResult = await client.query(contactsQuery, [uploadId]);

      res.json({ 
        success: true, 
        upload: uploadResult.rows[0],
        contacts: contactsResult.rows 
      });

    } finally {
      client.release();
    }

  } catch (error) {
    console.error('Database error:', error);
    res.status(500).json({ 
      success: false, 
      error: 'Failed to fetch guest upload contacts' 
    });
  }
} 