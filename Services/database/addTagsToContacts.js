import pool from "../../db/db.js";

/**
 * Ensure the tags column exists in the event_contacts table
 */
async function ensureEventContactsTagsColumn(client) {
  try {
    // Check if tags column exists
    const checkQuery = `
      SELECT column_name 
      FROM information_schema.columns 
      WHERE table_name = 'event_contacts' AND column_name = 'tags'
    `;
    
    const checkResult = await client.query(checkQuery);
    
    if (checkResult.rows.length === 0) {
      // Add tags column as TEXT array
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
 * Add tags column to contacts table if it doesn't exist
 */
export async function addTagsColumnToContacts() {
  const client = await pool.connect();
  
  try {
    // Check if tags column exists
    const checkQuery = `
      SELECT column_name 
      FROM information_schema.columns 
      WHERE table_name = 'contacts' AND column_name = 'tags'
    `;
    
    const checkResult = await client.query(checkQuery);
    
    if (checkResult.rows.length === 0) {
      // Add tags column as TEXT array
      await client.query(`
        ALTER TABLE contacts 
        ADD COLUMN tags TEXT[] DEFAULT '{}'
      `);
      
      console.log('Tags column added to contacts table');
    } else {
      console.log('Tags column already exists in contacts table');
    }
  } catch (error) {
    console.error('Error adding tags column:', error);
    throw error;
  } finally {
    client.release();
  }
}

/**
 * Update contact tags
 */
export async function updateContactTags(req, res) {
  try {
    const { contactIds, tags, preserveExistingTags = false, eventId = null } = req.body;
    
    if (!contactIds || !Array.isArray(contactIds) || contactIds.length === 0) {
      return res.status(400).json({ 
        message: "Contact IDs array is required" 
      });
    }
    
    if (!tags || !Array.isArray(tags)) {
      return res.status(400).json({ 
        message: "Tags array is required" 
      });
    }

    // Filter out invalid contact IDs (non-numeric or temporary IDs)
    const validContactIds = contactIds.filter(id => {
      const numId = parseInt(id);
      return !isNaN(numId) && numId > 0 && !String(id).startsWith('temp-');
    });

    if (validContactIds.length === 0) {
      return res.status(400).json({ 
        message: "No valid contact IDs provided" 
      });
    }

    const client = await pool.connect();
    
    try {
      await client.query('BEGIN');
      
      if (eventId) {
        // Event-specific tags: store in event_contacts table
        // First ensure tags column exists in event_contacts
        await ensureEventContactsTagsColumn(client);
        
        for (const contactId of validContactIds) {
          if (preserveExistingTags) {
            // Get existing event-specific tags and merge with new tags
            const existingTagsResult = await client.query(
              `SELECT tags FROM event_contacts WHERE event_id = $1 AND contact_id = $2`,
              [eventId, contactId]
            );
            
            const existingTags = existingTagsResult.rows[0]?.tags || [];
            const mergedTags = [...new Set([...existingTags, ...tags])]; // Remove duplicates
            
            await client.query(
              `UPDATE event_contacts 
               SET tags = $1 
               WHERE event_id = $2 AND contact_id = $3`,
              [mergedTags, eventId, contactId]
            );
          } else {
            // Replace existing event-specific tags with new tags
            await client.query(
              `UPDATE event_contacts 
               SET tags = $1 
               WHERE event_id = $2 AND contact_id = $3`,
              [tags, eventId, contactId]
            );
          }
        }
      } else {
        // Global tags: store in contacts table (existing behavior)
        for (const contactId of validContactIds) {
          if (preserveExistingTags) {
            // Get existing tags and merge with new tags
            const existingTagsResult = await client.query(
              `SELECT tags FROM contacts WHERE id = $1`,
              [contactId]
            );
            
            const existingTags = existingTagsResult.rows[0]?.tags || [];
            const mergedTags = [...new Set([...existingTags, ...tags])]; // Remove duplicates
            
            await client.query(
              `UPDATE contacts 
               SET tags = $1 
               WHERE id = $2`,
              [mergedTags, contactId]
            );
          } else {
            // Replace existing tags with new tags
            await client.query(
              `UPDATE contacts 
               SET tags = $1 
               WHERE id = $2`,
              [tags, contactId]
            );
          }
        }
      }
      
      await client.query('COMMIT');
      
      res.status(200).json({
        message: `Tags updated for ${validContactIds.length} contacts${eventId ? ` in event ${eventId}` : ''}`,
        updatedContacts: validContactIds,
        tags: tags,
        preserveExistingTags: preserveExistingTags,
        eventId: eventId
      });
      
    } catch (error) {
      await client.query('ROLLBACK');
      throw error;
    } finally {
      client.release();
    }
    
  } catch (error) {
    console.error('Error updating contact tags:', error);
    res.status(500).json({ 
      message: "Failed to update contact tags",
      error: error.message 
    });
  }
}

/**
 * Get all unique tags for a user
 */
export async function getUserTags(req, res) {
  try {
    const { userEmail, eventId = null } = req.body;
    
    if (!userEmail) {
      return res.status(400).json({ 
        message: "User email is required" 
      });
    }

    const client = await pool.connect();
    
    try {
      let result;
      
      if (eventId) {
        // Get event-specific tags from event_contacts table
        await ensureEventContactsTagsColumn(client);
        
        result = await client.query(
          `SELECT DISTINCT unnest(ec.tags) as tag 
           FROM event_contacts ec
           INNER JOIN events e ON ec.event_id = e.id
           WHERE e.owner_email = $1 AND e.id = $2 AND ec.tags IS NOT NULL AND array_length(ec.tags, 1) > 0
           ORDER BY tag`,
          [userEmail, eventId]
        );
      } else {
        // Get global tags from contacts table (existing behavior)
        result = await client.query(
          `SELECT DISTINCT unnest(tags) as tag 
           FROM contacts 
           WHERE contact_owner = $1 AND tags IS NOT NULL AND array_length(tags, 1) > 0
           ORDER BY tag`,
          [userEmail]
        );
      }
      
      const tags = result.rows.map(row => row.tag);
      
      res.status(200).json({
        tags: tags
      });
      
    } finally {
      client.release();
    }
    
  } catch (error) {
    console.error('Error getting user tags:', error);
    res.status(500).json({ 
      message: "Failed to get user tags",
      error: error.message 
    });
  }
}

/**
 * Get contacts by tag
 */
export async function getContactsByTag(req, res) {
  try {
    const { userEmail, tag } = req.body;
    
    if (!userEmail || !tag) {
      return res.status(400).json({ 
        message: "User email and tag are required" 
      });
    }

    const client = await pool.connect();
    
    try {
      const result = await client.query(
        `SELECT id, display_name, canonical_form, phone_number, contact_source, contact_owner, tags
         FROM contacts 
         WHERE contact_owner = $1 AND $2 = ANY(tags)
         ORDER BY display_name`,
        [userEmail, tag]
      );
      
      const formattedContacts = result.rows.map(row => ({
        id: row.id,
        displayName: row.display_name,
        canonicalForm: row.canonical_form,
        phoneNumber: row.phone_number,
        contactSource: row.contact_source,
        uploadedByEmail: row.contact_owner,
        tags: row.tags || []
      }));

      res.status(200).json({ 
        contacts: formattedContacts 
      });
      
    } finally {
      client.release();
    }
    
  } catch (error) {
    console.error('Error getting contacts by tag:', error);
    res.status(500).json({ 
      message: "Failed to get contacts by tag",
      error: error.message 
    });
  }
} 

/**
 * Update tag name for all contacts that have this tag
 */
export async function updateTagName(req, res) {
  try {
    const { oldTagName, newTagName, eventId = null } = req.body;
    
    if (!oldTagName || !newTagName) {
      return res.status(400).json({ 
        message: "Old tag name and new tag name are required" 
      });
    }

    if (oldTagName === newTagName) {
      return res.status(400).json({ 
        message: "Old and new tag names cannot be the same" 
      });
    }

    const client = await pool.connect();
    
    try {
      await client.query('BEGIN');
      
      let totalUpdatedContacts = 0;
      
      if (eventId) {
        // Event-specific tags: update in event_contacts table
        // First ensure tags column exists in event_contacts
        await ensureEventContactsTagsColumn(client);
        
        // Find all event_contacts that have the old tag name
        const eventContactsWithTag = await client.query(
          `SELECT event_id, contact_id, tags FROM event_contacts WHERE event_id = $1 AND $2 = ANY(tags)`,
          [eventId, oldTagName]
        );
        
        // Update each event_contact's tags array to replace the old tag with the new one
        for (const eventContact of eventContactsWithTag.rows) {
          const updatedTags = eventContact.tags.map(tag => tag === oldTagName ? newTagName : tag);
          
          await client.query(
            `UPDATE event_contacts 
             SET tags = $1 
             WHERE event_id = $2 AND contact_id = $3`,
            [updatedTags, eventId, eventContact.contact_id]
          );
        }
        
        totalUpdatedContacts = eventContactsWithTag.rows.length;
      } else {
        // Global tags: update in contacts table
      // Find all contacts that have the old tag name
      const contactsWithTag = await client.query(
        `SELECT id, tags FROM contacts WHERE $1 = ANY(tags)`,
        [oldTagName]
      );
      
      // Update each contact's tags array to replace the old tag with the new one
      for (const contact of contactsWithTag.rows) {
        const updatedTags = contact.tags.map(tag => tag === oldTagName ? newTagName : tag);
        
        await client.query(
          `UPDATE contacts 
           SET tags = $1 
           WHERE id = $2`,
          [updatedTags, contact.id]
        );
        }
        
        totalUpdatedContacts = contactsWithTag.rows.length;
      }
      
      await client.query('COMMIT');
      
      res.status(200).json({
        message: `Tag "${oldTagName}" renamed to "${newTagName}" for ${totalUpdatedContacts} contacts`,
        updatedContacts: totalUpdatedContacts,
        oldTagName,
        newTagName,
        eventId
      });
      
    } catch (error) {
      await client.query('ROLLBACK');
      throw error;
    } finally {
      client.release();
    }
    
  } catch (error) {
    console.error('Error updating tag name:', error);
    res.status(500).json({ 
      message: "Failed to update tag name",
      error: error.message 
    });
  }
} 

/**
 * Remove a tag from all contacts that have it
 */
export async function removeTag(req, res) {
  try {
    const { tagName } = req.body;
    
    if (!tagName) {
      return res.status(400).json({ 
        message: "Tag name is required" 
      });
    }

    const client = await pool.connect();
    
    try {
      await client.query('BEGIN');
      
      // Find all contacts that have the tag
      const contactsWithTag = await client.query(
        `SELECT id, tags FROM contacts WHERE $1 = ANY(tags)`,
        [tagName]
      );
      
      // Update each contact's tags array to remove the specified tag
      for (const contact of contactsWithTag.rows) {
        const updatedTags = contact.tags.filter(tag => tag !== tagName);
        
        await client.query(
          `UPDATE contacts 
           SET tags = $1 
           WHERE id = $2`,
          [updatedTags, contact.id]
        );
      }
      
      await client.query('COMMIT');
      
      res.status(200).json({
        message: `Tag "${tagName}" removed from ${contactsWithTag.rows.length} contacts`,
        updatedContacts: contactsWithTag.rows.length,
        removedTag: tagName
      });
      
    } catch (error) {
      await client.query('ROLLBACK');
      throw error;
    } finally {
      client.release();
    }
    
  } catch (error) {
    console.error('Error removing tag:', error);
    res.status(500).json({ 
      message: "Failed to remove tag",
      error: error.message 
    });
  }
} 