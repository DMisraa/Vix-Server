import pool from "../../db/db.js";

export async function deleteEventContact(req, res) {
  const { eventId, contactId } = req.body;

  if (!eventId || !contactId) {
    return res.status(400).json({ error: "Event ID and Contact ID are required" });
  }

  const client = await pool.connect();

  try {
    await client.query('BEGIN');

    // Delete from event_contacts only
    await client.query(
      `DELETE FROM event_contacts 
       WHERE event_id = $1 AND contact_id = $2`,
      [eventId, contactId]
    );

    await client.query('COMMIT');
    res.status(200).json({ message: "Contact removed from event successfully" });
  } catch (err) {
    await client.query('ROLLBACK');
    console.error("Error removing contact from event:", err);
    res.status(500).json({ error: "Internal server error" });
  } finally {
    client.release();
  }
} 