import pool from "../../db/db.js";

export async function getEventById(req, res) {
  const { eventId } = req.params;

  if (!eventId) {
    return res.status(400).json({ error: "Event ID is required" });
  }

  try {
    // Fetch the event with all its data
    const result = await pool.query(
      'SELECT * FROM events WHERE id = $1',
      [eventId]
    );

    if (result.rows.length === 0) {
      return res.status(404).json({ error: "Event not found" });
    }

    const event = result.rows[0];

    // Also fetch the contacts associated with this event
    const contactsResult = await pool.query(
      `SELECT c.* FROM contacts c
       INNER JOIN event_contacts ec ON c.id = ec.contact_id
       WHERE ec.event_id = $1`,
      [eventId]
    );

    const contacts = contactsResult.rows;

    res.status(200).json({
      success: true,
      event: {
        id: event.id,
        name: event.event_name || event.name || 'Event', // Map event_name to name
        eventType: event.event_type,
        event_date: event.event_date,
        venue_name: event.venue_name || "", // This might be null if column doesn't exist
        venue_address: event.location || "", // Map location to venue_address
        groom_name: event.celebrator1_name, // Map celebrator1_name to groom_name
        bride_name: event.celebrator2_name, // Map celebrator2_name to bride_name
        bar_mitzvah_boy_name: event.celebrator1_name, // Map for bar mitzvah
        bat_mitzvah_girl_name: event.celebrator1_name, // Map for bat mitzvah
        brit_milah_boy_name: event.celebrator1_name, // Map for brit mitzvah
        event_name: event.event_name,
        imageUrl: event.image_url,
        owner_email: event.owner_email,
        contacts: contacts
      }
    });
  } catch (err) {
    console.error("Error fetching event:", err);
    res.status(500).json({ error: "Internal server error" });
  }
} 