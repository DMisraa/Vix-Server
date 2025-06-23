import pool from "../db/db.js";

export async function getContactsByOwner(req, res) {
  try {
    const { ownerEmail } = req.body;

    if (!ownerEmail) {
      return res.status(400).json({ message: "Missing ownerEmail in request body" });
    }

    const client = await pool.connect();

    try {
      const result = await client.query(
        `SELECT id, display_name, canonical_form, phone_number, contact_source, contact_owner 
         FROM contacts 
         WHERE contact_owner = $1`,
        [ownerEmail]
      );

      const formattedContacts = result.rows.map(row => ({
        id: row.id,
        displayName: row.display_name,
        canonicalForm: row.canonical_form,
        phoneNumber: row.phone_number,
        contactSource: row.contact_source,
        uploadedByEmail: row.contact_owner,
      }));

      res.status(200).json({ contacts: formattedContacts });
    } catch (err) {
      console.error("Query failed:", err);
      res.status(500).json({ message: "Failed to retrieve contacts" });
    } finally {
      client.release();
    }
  } catch (error) {
    console.error("Postgres connection error:", error);
    res.status(500).json({ message: "Internal Server Error" });
  }
}
