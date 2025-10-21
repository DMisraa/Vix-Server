import pool from '../../db/db.js';

/**
 * Get Failure Statistics for an Event
 * 
 * Returns detailed information about failed message deliveries
 * including failure reasons and affected contacts
 */

export async function getFailureStats(req, res) {
  const { eventId } = req.query;

  if (!eventId) {
    return res.status(400).json({ error: 'Missing eventId' });
  }

  const client = await pool.connect();

  try {
    // Get failed deliveries with contact details
    const failedDeliveriesResult = await client.query(
      `SELECT 
        em.id as message_id,
        em.contact_id,
        em.failure_reason,
        c.display_name,
        c.phone_number,
        c.canonical_form
       FROM event_messages em
       JOIN contacts c ON em.contact_id = c.id
       WHERE em.event_id = $1 
       AND em.failure_reason IS NOT NULL
       ORDER BY em.id DESC`,
      [eventId]
    );

    // Get failure reason breakdown
    const failureBreakdownResult = await client.query(
      `SELECT 
        CASE 
          WHEN failure_reason LIKE '%experiment%' THEN 'WhatsApp Beta/Experiment'
          WHEN failure_reason LIKE '%blocked%' THEN 'User Blocked Business'
          WHEN failure_reason LIKE '%not registered%' THEN 'Not on WhatsApp'
          WHEN failure_reason LIKE '%invalid%' THEN 'Invalid Number'
          ELSE 'Other'
        END as failure_type,
        COUNT(*) as count
       FROM event_messages
       WHERE event_id = $1 
       AND failure_reason IS NOT NULL
       GROUP BY failure_type
       ORDER BY count DESC`,
      [eventId]
    );

    // Get overall stats
    const overallStatsResult = await client.query(
      `SELECT 
        COUNT(*) as total_sent,
        COUNT(CASE WHEN failed_at IS NOT NULL THEN 1 END) as total_failed,
        COUNT(CASE WHEN seen_at IS NOT NULL THEN 1 END) as total_seen,
        COUNT(CASE WHEN response_time IS NOT NULL THEN 1 END) as total_responded
       FROM event_messages
       WHERE event_id = $1 
       AND message_type = 'invitation'`,
      [eventId]
    );

    const stats = overallStatsResult.rows[0];
    const failureRate = stats.total_sent > 0 
      ? ((stats.total_failed / stats.total_sent) * 100).toFixed(2) 
      : 0;

    res.json({
      success: true,
      stats: {
        total_sent: parseInt(stats.total_sent),
        total_failed: parseInt(stats.total_failed),
        total_seen: parseInt(stats.total_seen),
        total_responded: parseInt(stats.total_responded),
        failure_rate: parseFloat(failureRate),
      },
      failed_deliveries: failedDeliveriesResult.rows,
      failure_breakdown: failureBreakdownResult.rows
    });

  } catch (err) {
    console.error('Error fetching failure stats:', err);
    res.status(500).json({ error: 'Failed to fetch failure statistics' });
  } finally {
    client.release();
  }
}

