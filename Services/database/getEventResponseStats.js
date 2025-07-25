import pool from '../../db/db.js';

export async function getEventResponseStats(req, res) {
  const { eventId } = req.query;

  if (!eventId) {
    return res.status(400).json({ error: 'Missing eventId' });
  }

  const client = await pool.connect();

  try {
    // Total contacts who were sent invitations (regardless of response)
    const totalContactsResult = await client.query(
      `SELECT COUNT(DISTINCT contact_id) as total_contacts_invited
       FROM event_messages
       WHERE event_id = $1`,
      [eventId]
    );

    // Total messages sent per round
    const messagesResult = await client.query(
      `SELECT message_round, COUNT(*) as total_sent
       FROM event_messages
       WHERE event_id = $1
       GROUP BY message_round
       ORDER BY message_round`,
      [eventId]
    );

    // Approved responses with guest breakdown and timestamp
    const responsesResult = await client.query(
      `WITH daily_stats AS (
        SELECT 
          response_time::date as date,
          COALESCE(SUM(CAST(guests_coming AS INTEGER)), 0) as daily_guests,
          COUNT(*) as daily_responses
        FROM event_messages
        WHERE event_id = $1 AND response IS DISTINCT FROM 'ללא מענה'
        GROUP BY response_time::date
      )
      SELECT 
        date,
        daily_guests,
        daily_responses,
        SUM(daily_guests) OVER (ORDER BY date) as total_guests_cumulative,
        SUM(daily_responses) OVER (ORDER BY date) as total_responses_cumulative
      FROM daily_stats
      ORDER BY date`,
      [eventId]
    );

    // Breakdown: how many responded with 1, 2, 3+ guests
    const guestTypeBreakdown = await client.query(
      `SELECT 
         CASE 
           WHEN CAST(guests_coming AS INTEGER) = 1 THEN '1'
           WHEN CAST(guests_coming AS INTEGER) = 2 THEN '2'
           WHEN CAST(guests_coming AS INTEGER) = 3 THEN '3'
           WHEN CAST(guests_coming AS INTEGER) > 3 THEN '3+'
         END AS guest_type,
         COUNT(*) as count
       FROM event_messages
       WHERE event_id = $1 AND response IS DISTINCT FROM 'ללא מענה'
       GROUP BY guest_type
       ORDER BY guest_type`,
      [eventId]
    );

    // Response rate per round
    const replyRateResult = await client.query(
      `SELECT 
          message_round,
          COUNT(*) FILTER (WHERE response IS DISTINCT FROM 'ללא מענה') as responses,
          COUNT(*) as total
       FROM event_messages
       WHERE event_id = $1
       GROUP BY message_round
       ORDER BY message_round`,
      [eventId]
    );

    // Response type breakdown (מגיע, לא מגיע, אולי, ללא מענה)
    const responseBreakdownResult = await client.query(
      `SELECT 
        COALESCE(response, 'ללא מענה') as response_type,
        COUNT(*) as count,
        COALESCE(SUM(CAST(guests_coming AS INTEGER)), 0) as total_guests
       FROM event_messages
       WHERE event_id = $1
       GROUP BY response_type
       ORDER BY response_type`,
      [eventId]
    );

    res.status(200).json({
      totalContactsInvited: totalContactsResult.rows[0].total_contacts_invited,
      messageRounds: messagesResult.rows,      // [{ message_round, total_sent }]
      guestBreakdown: responsesResult.rows,    // [{ date, daily_guests, daily_responses, total_guests_cumulative, total_responses_cumulative }]
      guestTypes: guestTypeBreakdown.rows,     // [{ guest_type: '1' | '2' | '3+' , count }]
      responseRates: replyRateResult.rows,     // [{ message_round, responses, total }]
      responseBreakdown: responseBreakdownResult.rows  // [{ response_type, count, total_guests }]
    });
  } catch (err) {
    console.error('Error fetching event response stats:', err);
    res.status(500).json({ error: 'Failed to fetch response stats' });
  } finally {
    client.release();
  }
}
