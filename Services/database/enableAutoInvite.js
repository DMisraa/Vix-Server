import pool from "../../db/db.js";

/**
 * Enable Auto-Invite for an Event
 * 
 * Enables automatic invitation sending for an event with the specified configuration.
 * Stores the auto-invite configuration in the events table.
 * 
 * @param {Object} req - Express request object
 * @param {Object} req.body - Request body
 * @param {string} req.body.eventId - Event ID to enable auto-invite for
 * @param {string} req.body.userEmail - User email for authentication and validation
 * @param {number} req.body.reminderCount - Number of reminders to send (0-5)
 * @param {number} req.body.messageInterval - Days between messages (1-30)
 * @param {boolean} req.body.sendThankYou - Whether to send thank you message next day
 * @param {boolean} req.body.sendMorningReminder - Whether to send morning reminder on event day
 * @param {Object} res - Express response object
 */
export async function enableAutoInvite(req, res) {
  const { eventId, userEmail, reminderCount, messageInterval, sendThankYou, sendMorningReminder } = req.body;

  // Validate required fields
  if (!eventId) {
    return res.status(400).json({ 
      success: false,
      error: "Event ID is required" 
    });
  }

  if (!userEmail) {
    return res.status(400).json({ 
      success: false,
      error: "User email is required" 
    });
  }

  // Validate configuration values
  if (reminderCount !== undefined && (reminderCount < 0 || reminderCount > 5)) {
    return res.status(400).json({ 
      success: false,
      error: "Reminder count must be between 0 and 5" 
    });
  }

  if (messageInterval !== undefined && (messageInterval < 1 || messageInterval > 30)) {
    return res.status(400).json({ 
      success: false,
      error: "Message interval must be between 1 and 30 days" 
    });
  }

  const client = await pool.connect();

  try {
    await client.query('BEGIN');

    // Verify event exists and belongs to user (security check)
    const eventCheck = await client.query(
      'SELECT id, owner_email FROM events WHERE id = $1',
      [eventId]
    );

    if (eventCheck.rows.length === 0) {
      await client.query('ROLLBACK');
      return res.status(404).json({ 
        success: false,
        error: "Event not found" 
      });
    }

    const event = eventCheck.rows[0];

    // Verify event ownership
    if (event.owner_email !== userEmail) {
      await client.query('ROLLBACK');
      return res.status(403).json({ 
        success: false,
        error: "Unauthorized: Event does not belong to this user" 
      });
    }

    // Check if auto-invite columns exist (for graceful handling)
    const columnCheck = await client.query(`
      SELECT column_name 
      FROM information_schema.columns 
      WHERE table_name = 'events' 
      AND column_name IN (
        'auto_invite_enabled',
        'auto_invite_started_at',
        'auto_invite_reminder_count',
        'auto_invite_message_interval',
        'auto_invite_send_thank_you',
        'auto_invite_send_morning_reminder'
      )
    `);

    const existingColumns = columnCheck.rows.map(row => row.column_name);
    const missingColumns = [
      'auto_invite_enabled',
      'auto_invite_started_at',
      'auto_invite_reminder_count',
      'auto_invite_message_interval',
      'auto_invite_send_thank_you',
      'auto_invite_send_morning_reminder'
    ].filter(col => !existingColumns.includes(col));

    if (missingColumns.length > 0) {
      await client.query('ROLLBACK');
      return res.status(500).json({ 
        success: false,
        error: `Database columns not found. Please run migration to add: ${missingColumns.join(', ')}` 
      });
    }

    // Enable auto-invite with configuration
    const now = new Date();
    const updateQuery = `
      UPDATE events SET
        auto_invite_enabled = $1,
        auto_invite_started_at = $2,
        auto_invite_reminder_count = $3,
        auto_invite_message_interval = $4,
        auto_invite_send_thank_you = $5,
        auto_invite_send_morning_reminder = $6
      WHERE id = $7 AND owner_email = $8
    `;

    const updateResult = await client.query(updateQuery, [
      true, // auto_invite_enabled
      now, // auto_invite_started_at
      reminderCount ?? 2, // auto_invite_reminder_count (default 2)
      messageInterval ?? 7, // auto_invite_message_interval (default 7)
      sendThankYou ?? true, // auto_invite_send_thank_you (default true)
      sendMorningReminder ?? true, // auto_invite_send_morning_reminder (default true)
      eventId,
      userEmail
    ]);

    if (updateResult.rowCount === 0) {
      await client.query('ROLLBACK');
      return res.status(404).json({ 
        success: false,
        error: "Failed to update event. Event not found or unauthorized." 
      });
    }

    // Fetch updated event to return
    const updatedEventResult = await client.query(
      'SELECT * FROM events WHERE id = $1',
      [eventId]
    );

    const updatedEvent = updatedEventResult.rows[0];

    await client.query('COMMIT');

    res.status(200).json({
      success: true,
      message: "Auto-invite enabled successfully",
      event: {
        id: updatedEvent.id,
        event_name: updatedEvent.event_name,
        auto_invite_enabled: updatedEvent.auto_invite_enabled,
        auto_invite_started_at: updatedEvent.auto_invite_started_at,
        auto_invite_reminder_count: updatedEvent.auto_invite_reminder_count,
        auto_invite_message_interval: updatedEvent.auto_invite_message_interval,
        auto_invite_send_thank_you: updatedEvent.auto_invite_send_thank_you,
        auto_invite_send_morning_reminder: updatedEvent.auto_invite_send_morning_reminder
      }
    });

  } catch (err) {
    await client.query('ROLLBACK');
    console.error("Error enabling auto-invite:", err);
    console.error("Error details:", err.message);
    console.error("Error stack:", err.stack);
    res.status(500).json({ 
      success: false,
      error: "Internal server error", 
      details: err.message 
    });
  } finally {
    client.release();
  }
}

