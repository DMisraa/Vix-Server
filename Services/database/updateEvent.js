import pool from "../../db/db.js";

export async function updateEvent(req, res) {
  const { eventId, eventData } = req.body;

  console.log('updateEvent called with:', { eventId, eventData });

  if (!eventId || !eventData) {
    console.log('Missing required fields:', { eventId, eventData });
    return res.status(400).json({ error: "Event ID and event data are required" });
  }

  const client = await pool.connect();
  try {
    await client.query('BEGIN');

    // First, let's check if the venue_name column exists
    const columnCheck = await client.query(`
      SELECT column_name 
      FROM information_schema.columns 
      WHERE table_name = 'events' AND column_name = 'venue_name'
    `);
    
    const hasVenueNameColumn = columnCheck.rows.length > 0;

    // Build the UPDATE query based on available columns
    let updateQuery;
    let queryParams;
    
    if (hasVenueNameColumn) {
      updateQuery = `
        UPDATE events SET
          event_type = $1,
          venue_name = $2,
          location = $3,
          celebrator1_name = $4,
          celebrator2_name = $5,
          event_name = $6,
          event_date = $7,
          image_url = $8
        WHERE id = $9 AND owner_email = $10
      `;
      queryParams = [
        eventData.eventType,
        eventData.venue_name,
        eventData.venue_address,
        eventData.groom_name || eventData.bride_name || eventData.bar_mitzvah_boy_name || eventData.bat_mitzvah_girl_name || eventData.brit_milah_boy_name,
        eventData.bride_name,
        eventData.event_name,
        eventData.event_date,
        eventData.imageUrl,
        eventId,
        eventData.owner_email
      ];
    } else {
      // Fallback without venue_name column
      updateQuery = `
        UPDATE events SET
          event_type = $1,
          location = $2,
          celebrator1_name = $3,
          celebrator2_name = $4,
          event_name = $5,
          event_date = $6,
          image_url = $7
        WHERE id = $8 AND owner_email = $9
      `;
      queryParams = [
        eventData.eventType,
        eventData.venue_address,
        eventData.groom_name || eventData.bride_name || eventData.bar_mitzvah_boy_name || eventData.bat_mitzvah_girl_name || eventData.brit_milah_boy_name,
        eventData.bride_name,
        eventData.event_name,
        eventData.event_date,
        eventData.imageUrl,
        eventId,
        eventData.owner_email
      ];
    }

    console.log('Update query:', updateQuery);
    console.log('Query params:', queryParams);

    const result = await client.query(updateQuery, queryParams);

    if (result.rowCount === 0) {
      await client.query('ROLLBACK');
      return res.status(404).json({ error: "Event not found or not authorized" });
    }

    // Fetch the updated event to return
    const updatedEventResult = await client.query(
      'SELECT * FROM events WHERE id = $1',
      [eventId]
    );

    const updatedEvent = updatedEventResult.rows[0];

    await client.query('COMMIT');

    res.status(200).json({
      success: true,
      message: "Event updated successfully",
      event: {
        id: updatedEvent.id,
        name: updatedEvent.event_name || updatedEvent.name || 'Event',
        eventType: updatedEvent.event_type,
        event_date: updatedEvent.event_date,
        venue_name: updatedEvent.venue_name || "",
        venue_address: updatedEvent.location || "",
        groom_name: updatedEvent.celebrator1_name,
        bride_name: updatedEvent.celebrator2_name,
        bar_mitzvah_boy_name: updatedEvent.celebrator1_name,
        bat_mitzvah_girl_name: updatedEvent.celebrator1_name,
        brit_milah_boy_name: updatedEvent.celebrator1_name,
        event_name: updatedEvent.event_name,
        imageUrl: updatedEvent.image_url,
        owner_email: updatedEvent.owner_email
      }
    });
  } catch (err) {
    await client.query('ROLLBACK');
    console.error("Error updating event:", err);
    console.error("Error details:", err.message);
    console.error("Error stack:", err.stack);
    res.status(500).json({ error: "Internal server error", details: err.message });
  } finally {
    client.release();
  }
} 