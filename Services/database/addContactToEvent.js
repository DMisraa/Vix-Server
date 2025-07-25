import pool from "../../db/db.js";

export async function addContactToEvent(req, res) {
  const { eventId, contactId } = req.body;

  if (!eventId || !contactId) {
    return res.status(400).json({ error: "Event ID and Contact ID are required" });
  }

  const client = await pool.connect();
  try {
    await client.query('BEGIN');

    // Add the contact to the event
    await client.query(
      `INSERT INTO event_contacts (event_id, contact_id)
       VALUES ($1, $2)
       ON CONFLICT (event_id, contact_id) DO NOTHING`,
      [eventId, contactId]
    );

    await client.query('COMMIT');
    res.status(200).json({ message: "Contact added to event successfully" });
  } catch (err) {
    await client.query('ROLLBACK');
    console.error("Error adding contact to event:", err);
    res.status(500).json({ error: "Internal server error" });
  } finally {
    client.release();
  }
} 