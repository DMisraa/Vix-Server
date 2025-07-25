import pool from "../../db/db.js";

export async function deleteContact(req, res) {
  const contactId = req.params.id;

  if (!contactId) {
    return res.status(400).json({ error: "Contact ID is required" });
  }

  const client = await pool.connect();

  try {
    await client.query('BEGIN');

    // First delete from event_contacts (cascade)
    await client.query(
      `DELETE FROM event_contacts WHERE contact_id = $1`,
      [contactId]
    );

    // Then delete from contacts
    await client.query(
      `DELETE FROM contacts WHERE id = $1`,
      [contactId]
    );

    await client.query('COMMIT');
    res.status(200).json({ message: "Contact deleted successfully" });
  } catch (err) {
    await client.query('ROLLBACK');
    console.error("Error deleting contact:", err);
    res.status(500).json({ error: "Internal server error" });
  } finally {
    client.release();
  }
} 