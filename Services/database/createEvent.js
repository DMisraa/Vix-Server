import pool from "../../db/db.js";

export async function createEvent(req, res) {
  const { event, contactIds } = req.body;

  if (!event || !event.id || !event.owner_email) {
    return res.status(400).json({ error: "Missing required event fields" });
  }

  const client = await pool.connect();
  try {
    await client.query('BEGIN');

    // Prepare the values for database insertion
    const insertValues = [
      event.id, 
      event.event_name || event.name || null, // fallback to name if event_name doesn't exist
      event.owner_email, 
      event.eventType || null, 
      event.imageUrl || null,
      event.groom_name || event.bride_name || event.bar_mitzvah_boy_name || event.bat_mitzvah_girl_name || event.brit_milah_boy_name || null, // celebrator1
      event.bride_name || null, // celebrator2 (for weddings)
      event.venue_address || null, // event address/location
      event.event_date || null, // event date
      event.venue_name || null // venue name
    ];
    
    // Insert new event with basic fields
    await client.query(
      `INSERT INTO events (id, event_name, owner_email, event_type, image_url, celebrator1_name, celebrator2_name, location, event_date, venue_name)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10)`,
      insertValues
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
    console.error("Error details:", err.message);
    console.error("Error stack:", err.stack);
    res.status(500).json({ error: "Internal server error", details: err.message });
  } finally {
    client.release();
  }
}
