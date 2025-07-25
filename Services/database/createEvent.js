import pool from "../../db/db.js";

export async function createEvent(req, res) {
  const { event, contactIds } = req.body;

  if (!event || !event.id || !event.owner_email || !event.name) {
    return res.status(400).json({ error: "Missing required event fields" });
  }

  const client = await pool.connect();
  try {
    await client.query('BEGIN');

    // Insert new event
    await client.query(
      `INSERT INTO events (id, name, event_date, location, owner_email, event_type)
       VALUES ($1, $2, $3, $4, $5, $6)`,
      [event.id, event.name, event.date || null, event.location || null, event.owner_email, event.eventType || null]
    );

    // Link contacts (if any)
    for (const contactId of contactIds || []) {
      await client.query(
        `INSERT INTO event_contacts (event_id, contact_id)
         VALUES ($1, $2)`,
        [event.id, contactId]
      );
    }

    await client.query('COMMIT');
    res.status(201).json({ message: "Event created", event });
  } catch (err) {
    await client.query('ROLLBACK');
    console.error("Error creating event:", err);
    res.status(500).json({ error: "Internal server error" });
  } finally {
    client.release();
  }
}
