import pool from '../../db/db.js';

/**
 * Get followup notifications for a user
 * 
 * Returns all non-dismissed followup notifications where:
 * - Contact responded "maybe" (לא בטוח)
 * - Contact selected a follow-up date
 * - Notification hasn't been dismissed
 * 
 * Query endpoint: GET /api/followup-notifications?ownerEmail=user@example.com
 */
export async function getFollowupNotifications(req, res) {
  try {
    const { ownerEmail } = req.query;

    if (!ownerEmail) {
      return res.status(400).json({ error: 'ownerEmail is required' });
    }

    const client = await pool.connect();
    
    try {
      // Get followup notifications with contact and event details
      const result = await client.query(`
        SELECT 
          em.id,
          em.event_id,
          em.contact_id,
          em.followup_date,
          em.created_at,
          c.display_name as contact_name,
          e.event_name,
          e.owner_email
        FROM event_messages em
        JOIN contacts c ON em.contact_id = c.id
        JOIN events e ON em.event_id = e.id
        WHERE e.owner_email = $1
          AND em.response = 'לא בטוח'
          AND em.followup_date IS NOT NULL
          AND em.followup_notification_dismissed = FALSE
        ORDER BY em.followup_date ASC
      `, [ownerEmail]);

      res.json({ 
        success: true, 
        notifications: result.rows 
      });

    } finally {
      client.release();
    }

  } catch (error) {
    console.error('Error fetching followup notifications:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
}

/**
 * Dismiss a followup notification
 * 
 * Marks the notification as dismissed so it won't show again
 * 
 * Query endpoint: DELETE /api/followup-notifications/:notificationId
 */
export async function dismissFollowupNotification(req, res) {
  try {
    const { notificationId } = req.params;

    if (!notificationId) {
      return res.status(400).json({ error: 'notificationId is required' });
    }

    const client = await pool.connect();
    
    try {
      // Mark notification as dismissed
      const result = await client.query(`
        UPDATE event_messages 
        SET followup_notification_dismissed = TRUE 
        WHERE id = $1
        RETURNING id
      `, [notificationId]);

      if (result.rows.length === 0) {
        return res.status(404).json({ error: 'Notification not found' });
      }

      res.json({ 
        success: true,
        message: 'Notification dismissed successfully'
      });

    } finally {
      client.release();
    }

  } catch (error) {
    console.error('Error dismissing followup notification:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
}


