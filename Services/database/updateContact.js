import pool from "../../db/db.js";

export async function updateContact(req, res) {
  try {
    const { id } = req.params;
    const { displayName, phoneNumber } = req.body;

    if (!id || !displayName || !phoneNumber) {
      return res.status(400).json({ 
        message: "Missing required fields: id, displayName, phoneNumber" 
      });
    }

    const client = await pool.connect();

    try {
      // Update the contact in the main contacts table
      const result = await client.query(
        `UPDATE contacts 
         SET display_name = $1, phone_number = $2 
         WHERE id = $3 
         RETURNING *`,
        [displayName, phoneNumber, id]
      );

      if (result.rows.length === 0) {
        return res.status(404).json({ 
          message: "Contact not found" 
        });
      }

      const updatedContact = result.rows[0];

      res.status(200).json({
        message: "Contact updated successfully",
        contact: {
          id: updatedContact.id,
          displayName: updatedContact.display_name,
          phoneNumber: updatedContact.phone_number,
          contactSource: updatedContact.contact_source,
          contactOwner: updatedContact.contact_owner
        }
      });

    } finally {
      client.release();
    }

  } catch (error) {
    console.error('Error updating contact:', error);
    res.status(500).json({ 
      message: "Failed to update contact",
      error: error.message 
    });
  }
} 