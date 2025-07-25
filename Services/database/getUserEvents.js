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

    // Attach contactIds to each event
    const enrichedEvents = events.map((event) => ({
      ...event,
      contactIds: contactsMap[event.id] || [],
    }));

    res.status(200).json({ events: enrichedEvents });
  } catch (err) {
    console.error('Error fetching events:', err);
    res.status(500).json({ error: 'Internal server error' });
  } finally {
    client.release();
  }
}
