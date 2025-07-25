import pool from "../../db/db.js";

export async function getEventDetails(req, res) {
  const eventId = req.params.eventId;

  if (!eventId) {
    return res.status(400).json({ error: "Event ID is required" });
  }

  try {
    const result = await pool.query(
      `SELECT id, name, event_date, location, owner_email, event_type
       FROM events
       WHERE id = $1`,
      [eventId]
    );

    if (result.rows.length === 0) {
      return res.status(404).json({ error: "Event not found" });
    }

    res.json(result.rows[0]);
  } catch (err) {
    console.error("Error fetching event details:", err);
    res.status(500).json({ error: "Internal server error" });
  }
} 