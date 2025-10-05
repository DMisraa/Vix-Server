import pool from "../../db/db.js";

export async function sendContactsToDatabase(req, res) {
  try {
    const { contacts } = req.body;
    const client = await pool.connect();

        // Validate contacts array
        if (!contacts || !Array.isArray(contacts) || contacts.length === 0) {
          return res.status(400).json({ error: "Invalid contacts data" });
        }
    
        // Validate each contact
        for (const contact of contacts) {
          if (!contact.displayName || !contact.phoneNumber) {
            return res.status(400).json({ error: "Missing required fields: displayName and phoneNumber" });
          }
          
          // Validate name length - allow empty names but ensure they're strings
          if (typeof contact.displayName !== 'string' || contact.displayName.length > 100) {
            return res.status(400).json({ error: "Invalid displayName format or length" });
          }
          
          // Validate phone number - allow special cases like "No phone number", "No local number", etc.
          if (contact.phoneNumber !== "No phone number" && 
              contact.phoneNumber !== "No local number" && 
              contact.phoneNumber !== "No canonical number") {
            const phoneDigits = contact.phoneNumber.replace(/\D/g, '');
            if (phoneDigits.length < 7 || phoneDigits.length > 15) {
              return res.status(400).json({ error: "Invalid phone number format" });
            }
          }
        }

    try {
      // Start transaction
      await client.query('BEGIN');

      // Insert contacts and get their IDs
      const insertedIds = [];
      for (const contact of contacts) {
        const result = await client.query(
          `INSERT INTO contacts (google_id, display_name, canonical_form, phone_number, contact_source, contact_owner, tags)
           VALUES ($1, $2, $3, $4, $5, $6, $7)
           RETURNING id`,
          [
            contact.uploadedByGoogleId, 
            contact.displayName, 
            contact.canonicalForm, 
            contact.phoneNumber, 
            contact.contactSource, 
            contact.uploadedByEmail, 
            contact.tags || []
          ]
        );
        insertedIds.push(result.rows[0].id);
      }

      await client.query('COMMIT');

      // Return all inserted IDs and maintain backward compatibility
      res.status(201).json({ 
        message: "Contacts saved successfully", 
        insertedCount: contacts.length, 
        insertedIds,
        newContactId: insertedIds[0] // Keep for backward compatibility
      });
    } catch (err) {
      await client.query('ROLLBACK');
      console.error("Transaction failed:", err);
      res.status(500).json({ message: "Failed to save contacts" });
    } finally {
      client.release();
    }
  } catch (error) {
    console.error("Postgres connection error:", error);
    res.status(500).json({ message: "Internal Server Error" });
  }
}
