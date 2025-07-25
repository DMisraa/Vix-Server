import db from '../../db/db.js'; // assume you're using a db helper for Postgres

export async function sendInvitationResponse(req, res) {

  const { responses } = req.body;

  try {
    // Insert responses into Postgres
    for (const response of responses) {
      await db.query(
        `INSERT INTO invitation_responses (display_name, phone_number, response, owner)
         VALUES ($1, $2, $3, $4)`,
        [response.displayName, response.phoneNumber, response.invitationResponse, response.owner]
      );
    }

    res.status(200).json({ message: 'Responses saved successfully' });
  } catch (error) {
    console.error('Error saving responses:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
}
