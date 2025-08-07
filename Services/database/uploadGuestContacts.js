import pool from '../../db/db.js';

export async function uploadGuestContacts(req, res) {
  try {
    const { contacts, invitedBy, token, guestName, guestNotes } = req.body;

    if (!contacts || !Array.isArray(contacts) || contacts.length === 0) {
      return res.status(400).json({ error: 'No contacts provided' });
    }

    if (!invitedBy) {
      return res.status(400).json({ error: 'InvitedBy email is required' });
    }

    if (!token) {
      return res.status(400).json({ error: 'Token is required' });
    }

    if (!guestName || !guestName.trim()) {
      return res.status(400).json({ error: 'Guest name is required' });
    }

    // TODO: Validate JWT token here when we implement the validation
    // For now, we'll just log the data and proceed
    
    console.log('Guest contacts upload:', {
      contactsCount: contacts.length,
      invitedBy: invitedBy,
      guestName: guestName.trim(),
      guestNotes: guestNotes?.trim() || '',
      token: token
    });

    // Start database transaction
    const client = await pool.connect();
    
    try {
      await client.query('BEGIN');

      // Insert upload record
      const uploadQuery = `
        INSERT INTO guest_contact_uploads 
        (invited_by_email, guest_name, guest_notes, token) 
        VALUES ($1, $2, $3, $4) 
        RETURNING upload_id
      `;
      
      const uploadResult = await client.query(uploadQuery, [
        invitedBy,
        guestName.trim(),
        guestNotes?.trim() || '',
        token
      ]);
      
      const uploadId = uploadResult.rows[0].upload_id;

      // Insert contacts
      const contactQuery = `
        INSERT INTO guest_contacts 
        (upload_id, display_name, phone_number, email, invited_by, contact_source, canonical_form) 
        VALUES ($1, $2, $3, $4, $5, $6, $7)
      `;

      for (const contact of contacts) {
        await client.query(contactQuery, [
          uploadId,
          contact.displayName || '',
          contact.phoneNumber || '',
          contact.email || '',
          invitedBy,
          contact.contactSource || 'guest_upload',
          contact.canonicalForm || contact.displayName || ''
        ]);
      }

      await client.query('COMMIT');

      console.log(`Successfully stored ${contacts.length} contacts for upload ${uploadId}`);

      res.json({ 
        success: true, 
        message: `Received ${contacts.length} contacts from ${guestName.trim()}`,
        contactsCount: contacts.length,
        uploadId: uploadId,
        guestName: guestName.trim(),
        guestNotes: guestNotes?.trim() || ''
      });

    } catch (dbError) {
      await client.query('ROLLBACK');
      console.error('Database error:', dbError);
      throw new Error('Failed to store contacts in database');
    } finally {
      client.release();
    }

  } catch (error) {
    console.error('Error uploading guest contacts:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
}; 