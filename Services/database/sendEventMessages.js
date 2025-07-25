// ✅ SERVER-SIDE HANDLER (e.g., /api/event-invitation.js)

import pool from '../../db/db.js';

export async function sendEventMessages(req, res) {
  const { eventId, contacts, messageType, messageRound } = req.body;

  if (!eventId || !contacts || !messageType) {
    return res.status(400).json({ error: "Missing required fields" });
  }

  const client = await pool.connect();

  try {
    await client.query('BEGIN');

    let totalGuests = 0;

    for (const contact of contacts) {
      // Only count guests if response is 'מגיע'
      const guestsComing = contact.invitationResponse === 'מגיע' ? contact.guestsComing : 0;
      totalGuests += guestsComing;

      await client.query(
        `INSERT INTO event_messages (
          event_id, contact_id, message_type, message_round,
          response, guests_coming, response_time
        ) VALUES ($1, $2, $3, $4, $5, $6, $7)`,
        [
          eventId,
          contact.id,
          messageType,
          messageRound || 1,
          contact.invitationResponse,
          guestsComing,
          // Store response_time for all responses except 'ללא מענה'
          contact.invitationResponse === 'ללא מענה' ? null : contact.response_time
        ]
      );
    }

    await client.query('COMMIT');
    res.status(201).json({
      message: 'Messages logged successfully',
      totalContacts: contacts.length,
      totalGuests,
    });
  } catch (err) {
    await client.query('ROLLBACK');
    console.error("Message logging failed:", err);
    res.status(500).json({ error: 'Failed to log messages' });
  } finally {
    client.release();
  }
}
