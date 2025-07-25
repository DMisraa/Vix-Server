import pool from "../../db/db.js";

export async function deleteEvent(req, res) {
  const { eventId, ownerEmail } = req.body;

  if (!eventId || !ownerEmail) {
    return res.status(400).json({ error: "Missing eventId or ownerEmail" });
  }

  const client = await pool.connect();

  try {
    await client.query("BEGIN");

    // Verify the event exists and belongs to the owner
    const eventCheck = await client.query(
      `SELECT 1 FROM events WHERE id = $1 AND owner_email = $2`,
      [eventId, ownerEmail]
    );

    if (eventCheck.rowCount === 0) {
      await client.query("ROLLBACK");
      return res.status(404).json({ error: "Event not found or not authorized" });
    }

    // Delete linked contacts from event_contacts
    await client.query(
      `DELETE FROM event_contacts WHERE event_id = $1`,
      [eventId]
    );

    // Delete the event itself
    await client.query(
      `DELETE FROM events WHERE id = $1 AND owner_email = $2`,
      [eventId, ownerEmail]
    );

    await client.query("COMMIT");
    res.status(200).json({ message: "Event deleted successfully" });
  } catch (err) {
    await client.query("ROLLBACK");
    console.error("Error deleting event:", err);
    res.status(500).json({ error: "Internal server error" });
  } finally {
    client.release();
  }
}
