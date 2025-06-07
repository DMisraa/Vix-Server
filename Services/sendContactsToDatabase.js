import pool from "../db/db.js";

export async function sendContactsToDatabase(req, res) {
  try {
    const { contacts } = req.body;

    const client = await pool.connect();

    try {
      // Start transaction
      await client.query('BEGIN');

      // Insert user if not exists
      // await client.query(
      //   `INSERT INTO users (google_id)
      //    VALUES ($1)
      //    ON CONFLICT (google_id) DO NOTHING`,
      //   [googleId]
      // );

      // Insert contacts
      for (const contact of contacts) {
        await client.query(
          `INSERT INTO contacts (google_id, display_name, canonical_form, phone_number, contact_source, contact_owner)
           VALUES ($1, $2, $3, $4, $5, $6)`,
          [contact.uploadedByGoogleId, contact.displayName, contact.canonicalForm, contact.phoneNumber, contact.contactSource, contact.uploadedByEmail]
        );
      }

      await client.query('COMMIT');
      res.status(201).json({ message: "Contacts saved successfully", insertedCount: contacts.length });
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
