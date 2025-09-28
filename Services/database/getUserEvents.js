import pool from '../../db/db.js';

export async function getUserEvents(req, res) {
  const { email } = req.query;

  if (!email) {
    return res.status(400).json({ error: 'Missing email' });
  }

  const client = await pool.connect();

  try {
    const eventsRes = await client.query(
      `SELECT * FROM events WHERE owner_email = $1`,
      [email]
    );

    const events = eventsRes.rows;

    const eventIds = events.map((e) => e.id);

    let contactsMap = {};
    if (eventIds.length > 0) {
      const contactsRes = await client.query(
        `SELECT event_id, contact_id FROM event_contacts WHERE event_id = ANY($1)`,
        [eventIds]
      );

      for (const row of contactsRes.rows) {
        if (!contactsMap[row.event_id]) {
          contactsMap[row.event_id] = [];
        }
        contactsMap[row.event_id].push(row.contact_id);
      }
    }

    // Attach contactIds to each event and map fields to expected format
    const enrichedEvents = events.map((event) => {
      // Determine the display name based on event type
      let displayName;
      if (event.event_type === 'other' && event.event_name) {
        displayName = event.event_name;
      } else {
        displayName = event.event_name || event.name || 'Event';
      }
      
      // Map celebrator names based on event type
      const eventType = event.event_type;
      let celebratorMapping = {};
      
      if (eventType === 'wedding') {
        celebratorMapping = {
          groom_name: event.celebrator1_name,
          bride_name: event.celebrator2_name
        };
      } else if (eventType === 'bar_mitzvah') {
        celebratorMapping = {
          bar_mitzvah_boy_name: event.celebrator1_name
        };
      } else if (eventType === 'bat_mitzvah') {
        celebratorMapping = {
          bat_mitzvah_girl_name: event.celebrator1_name
        };
      } else if (eventType === 'brit_milah') {
        celebratorMapping = {
          brit_milah_boy_name: event.celebrator1_name
        };
      }
      
      return {
        id: event.id,
        name: displayName,
        eventType: event.event_type,
        event_date: event.event_date,
        venue_name: event.venue_name || "", // This might be null if column doesn't exist
        venue_address: event.location || "", // Map location to venue_address
        event_name: event.event_name,
        event_time: event.event_time || "",
        imageUrl: event.image_url,
        owner_email: event.owner_email,
        contactIds: contactsMap[event.id] || [],
        ...celebratorMapping
      };
    });

    res.status(200).json({ events: enrichedEvents });
  } catch (err) {
    console.error('Error fetching events:', err);
    res.status(500).json({ error: 'Internal server error' });
  } finally {
    client.release();
  }
}
