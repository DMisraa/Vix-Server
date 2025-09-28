import pool from "../../db/db.js";

export async function updateEvent(req, res) {
  const { eventId, eventData } = req.body;

  if (!eventId || !eventData) {
    console.log('Missing required fields:', { eventId, eventData });
    return res.status(400).json({ error: "Event ID and event data are required" });
  }

  const client = await pool.connect();
  try {
    await client.query('BEGIN');

    // Check if venue_name column exists
    const columnCheck = await client.query(`
      SELECT column_name 
      FROM information_schema.columns 
      WHERE table_name = 'events' AND column_name = 'venue_name'
    `);
    const hasVenueNameColumn = columnCheck.rows.length > 0;

    // Check if event_time column exists
    const timeColumnCheck = await client.query(`
      SELECT column_name 
      FROM information_schema.columns 
      WHERE table_name = 'events' AND column_name = 'event_time'
    `);
    const hasEventTimeColumn = timeColumnCheck.rows.length > 0;

    const eventDate = eventData.event_date && eventData.event_date.trim() !== '' ? eventData.event_date : null;

    let updateQuery;
    let queryParams;
    
    if (hasVenueNameColumn && hasEventTimeColumn) {
      updateQuery = `
        UPDATE events SET
          event_type = $1,
          venue_name = $2,
          location = $3,
          celebrator1_name = $4,
          celebrator2_name = $5,
          event_name = $6,
          event_date = $7,
          image_url = $8,
          event_time = $9
        WHERE id = $10 AND owner_email = $11
      `;
      queryParams = [
        eventData.eventType,
        eventData.venue_name,
        eventData.venue_address,
        eventData.groom_name || eventData.bride_name || eventData.bar_mitzvah_boy_name || eventData.bat_mitzvah_girl_name || eventData.brit_milah_boy_name,
        eventData.bride_name,
        eventData.event_name,
        eventDate,
        eventData.imageUrl,
        eventData.event_time,
        eventId,
        eventData.owner_email
      ];
    } else if (hasVenueNameColumn && !hasEventTimeColumn) {
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
        eventDate,
        eventData.imageUrl,
        eventId,
        eventData.owner_email
      ];
    } else if (!hasVenueNameColumn && hasEventTimeColumn) {
      updateQuery = `
        UPDATE events SET
          event_type = $1,
          location = $2,
          celebrator1_name = $3,
          celebrator2_name = $4,
          event_name = $5,
          event_date = $6,
          image_url = $7,
          event_time = $8
        WHERE id = $9 AND owner_email = $10
      `;
      queryParams = [
        eventData.eventType,
        eventData.venue_address,
        eventData.groom_name || eventData.bride_name || eventData.bar_mitzvah_boy_name || eventData.bat_mitzvah_girl_name || eventData.brit_milah_boy_name,
        eventData.bride_name,
        eventData.event_name,
        eventDate,
        eventData.imageUrl,
        eventData.event_time,
        eventId,
        eventData.owner_email
      ];
    } else {
      // Fallback without venue_name and event_time columns
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
        eventDate,
        eventData.imageUrl,
        eventId,
        eventData.owner_email
      ];
    }

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

    // Map celebrator names based on event type
    const eventType = updatedEvent.event_type;
    let celebratorMapping = {};
    
    if (eventType === 'wedding') {
      celebratorMapping = {
        groom_name: updatedEvent.celebrator1_name || "",
        bride_name: updatedEvent.celebrator2_name || ""
      };
    } else if (eventType === 'bar_mitzvah') {
      celebratorMapping = {
        bar_mitzvah_boy_name: updatedEvent.celebrator1_name || ""
      };
    } else if (eventType === 'bat_mitzvah') {
      celebratorMapping = {
        bat_mitzvah_girl_name: updatedEvent.celebrator1_name || ""
      };
    } else if (eventType === 'brit_milah') {
      celebratorMapping = {
        brit_milah_boy_name: updatedEvent.celebrator1_name || ""
      };
    }

    const displayName = updatedEvent.event_name || updatedEvent.name || 'אירוע ללא שם';

    res.status(200).json({
      success: true,
      event: {
        id: updatedEvent.id,
        name: displayName,
        eventType: updatedEvent.event_type,
        event_date: updatedEvent.event_date,
        venue_name: updatedEvent.venue_name || "",
        venue_address: updatedEvent.location || "",
        event_name: updatedEvent.event_name,
        event_time: updatedEvent.event_time || "",
        imageUrl: updatedEvent.image_url,
        owner_email: updatedEvent.owner_email,
        ...celebratorMapping
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