import pool from './db.js';

export async function sendContactsToDatabase(req, res) {
  try {
    const { contacts, googleId } = req.body;

    const client = await pool.connect();

    for (const contact of contacts) {
      await client.query(
        `INSERT INTO contacts (google_id, display_name, canonical_form, value)
         VALUES ($1, $2, $3, $4)`,
        [googleId, contact.displayName, contact.canonicalForm, contact.value]
      );
    }

    client.release();

    res.status(201).json({ message: "Contacts saved to PostgreSQL" });
  } catch (error) {
    console.error("Postgres error:", error);
    res.status(500).json({ message: "Internal Server Error" });
  }
}
