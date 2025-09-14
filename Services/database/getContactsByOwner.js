import pool from "../../db/db.js";

/**
 * Ensure the tags column exists in the event_contacts table
 */
async function ensureEventContactsTagsColumn(client) {
  try {
    const checkQuery = `
      SELECT column_name 
      FROM information_schema.columns 
      WHERE table_name = 'event_contacts' AND column_name = 'tags'
    `;
    
    const checkResult = await client.query(checkQuery);
    
    if (checkResult.rows.length === 0) {
      await client.query(`
        ALTER TABLE event_contacts 
        ADD COLUMN tags TEXT[] DEFAULT '{}'
      `);
      console.log('Tags column added to event_contacts table');
    }
  } catch (error) {
    console.error('Error ensuring tags column exists in event_contacts:', error);
    throw error;
  }
}

/**
 * Get contacts with merged tags for a specific event
 */
export async function getContactsByEventWithTags(req, res) {
  try {
    const { ownerEmail, eventId } = req.body;

    if (!ownerEmail || !eventId) {
      return res.status(400).json({ message: "Missing ownerEmail or eventId in request body" });
    }

    const client = await pool.connect();

    try {
      await ensureEventContactsTagsColumn(client);
      
      // Get contacts with merged tags and latest invitation response
      const result = await client.query(
        `SELECT 
          c.id, 
          c.display_name, 
          c.canonical_form, 
          c.phone_number, 
          c.contact_source, 
          c.contact_owner,
          COALESCE(ec.tags, c.tags, '{}') as tags,
          em.response as invitation_response,
          em.guests_coming
         FROM contacts c
         INNER JOIN event_contacts ec ON c.id = ec.contact_id
         LEFT JOIN LATERAL (
           SELECT response, guests_coming
           FROM event_messages
           WHERE event_id = $2 AND contact_id = c.id
           ORDER BY response_time DESC NULLS LAST
           LIMIT 1
         ) em ON true
         WHERE c.contact_owner = $1 AND ec.event_id = $2`,
        [ownerEmail, eventId]
      );

      const formattedContacts = result.rows.map(row => ({
        id: row.id,
        displayName: row.display_name,
        canonicalForm: row.canonical_form,
        phoneNumber: row.phone_number,
        contactSource: row.contact_source,
        uploadedByEmail: row.contact_owner,
        tags: row.tags || [],
        invitationResponse: row.invitation_response,
        guestsComing: row.guests_coming || 0,
      }));

      res.status(200).json({ contacts: formattedContacts });
    } catch (err) {
      console.error("Query failed:", err);
      res.status(500).json({ message: "Failed to retrieve contacts" });
    } finally {
      client.release();
    }
  } catch (error) {
    console.error("Postgres connection error:", error);
    res.status(500).json({ message: "Internal Server Error" });
  }
}

export async function getContactsByOwner(req, res) {
  try {
    const { ownerEmail, eventId = null } = req.body;

    if (!ownerEmail) {
      return res.status(400).json({ message: "Missing ownerEmail in request body" });
    }

    const client = await pool.connect();

    try {
      let result;
      
      if (eventId) {
        // Get contacts with merged tags (global + event-specific)
        await ensureEventContactsTagsColumn(client);
        
        result = await client.query(
          `SELECT id, display_name, canonical_form, phone_number, contact_source, contact_owner, tags
           FROM contacts 
           WHERE contact_owner = $1`,
          [ownerEmail]
        );
      } else {
        // Get contacts with global tags only (existing behavior)
        result = await client.query(
          `SELECT id, display_name, canonical_form, phone_number, contact_source, contact_owner, tags
           FROM contacts 
           WHERE contact_owner = $1`,
          [ownerEmail]
        );
      }

      const formattedContacts = result.rows.map(row => ({
        id: row.id,
        displayName: row.display_name,
        canonicalForm: row.canonical_form,
        phoneNumber: row.phone_number,
        contactSource: row.contact_source,
        uploadedByEmail: row.contact_owner,
        tags: row.tags || [],
      }));

      res.status(200).json({ contacts: formattedContacts });
    } catch (err) {
      console.error("Query failed:", err);
      res.status(500).json({ message: "Failed to retrieve contacts" });
    } finally {
      client.release();
    }
  } catch (error) {
    console.error("Postgres connection error:", error);
    res.status(500).json({ message: "Internal Server Error" });
  }
}
