import pool from "../../db/db.js";
import { deleteImageFromCloudinary } from "../cloudinary.js";

export async function deleteEvent(req, res) {
  const { eventId, ownerEmail } = req.body;

  if (!eventId || !ownerEmail) {
    return res.status(400).json({ error: "Missing eventId or ownerEmail" });
  }

  console.log(`Deleting event ${eventId} for user ${ownerEmail}`);

  const client = await pool.connect();

  try {
    await client.query("BEGIN");

    // Verify the event exists and belongs to the owner, and get the image URL
    const eventCheck = await client.query(
      `SELECT image_url FROM events WHERE id = $1 AND owner_email = $2`,
      [eventId, ownerEmail]
    );

    if (eventCheck.rowCount === 0) {
      await client.query("ROLLBACK");
      console.log(`Event ${eventId} not found or not authorized for user ${ownerEmail}`);
      return res.status(404).json({ error: "Event not found or not authorized" });
    }

    const eventImageUrl = eventCheck.rows[0].image_url;
    console.log(`Event ${eventId} found. Image URL: ${eventImageUrl || 'None'}`);

    // Delete linked contacts from event_contacts
    const contactsDeleted = await client.query(
      `DELETE FROM event_contacts WHERE event_id = $1`,
      [eventId]
    );
    console.log(`Deleted ${contactsDeleted.rowCount} contacts from event ${eventId}`);

    // Delete the event itself
    const eventDeleted = await client.query(
      `DELETE FROM events WHERE id = $1 AND owner_email = $2`,
      [eventId, ownerEmail]
    );
    console.log(`Deleted event ${eventId} from database`);

    // Delete the image from Cloudinary if it exists
    if (eventImageUrl) {
      console.log('Attempting to delete image from Cloudinary:', eventImageUrl);
      const cloudinaryResult = await deleteImageFromCloudinary(eventImageUrl);
      
      if (!cloudinaryResult.success) {
        console.warn('Failed to delete image from Cloudinary:', cloudinaryResult.message);
        // Don't fail the entire operation if Cloudinary deletion fails
        // The event is already deleted from the database
      } else {
        console.log('Successfully deleted image from Cloudinary');
      }
    } else {
      console.log('No image to delete from Cloudinary');
    }

    await client.query("COMMIT");
    console.log(`Event ${eventId} deletion completed successfully`);
    
    res.status(200).json({ 
      message: "Event deleted successfully",
      cloudinaryDeleted: eventImageUrl ? true : false
    });
  } catch (err) {
    await client.query("ROLLBACK");
    console.error("Error deleting event:", err);
    res.status(500).json({ error: "Internal server error" });
  } finally {
    client.release();
  }
}
