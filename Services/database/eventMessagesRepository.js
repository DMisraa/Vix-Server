import pool from '../../db/db.js';

/**
 * Event Messages Database Repository
 * 
 * Handles all database operations for event_messages table
 * related to WhatsApp invitation responses and guest counts
 */

/**
 * Find contact by phone number
 * 
 * @param {string} phoneNumber - International phone number
 * @returns {Promise<Object|null>} Contact object or null
 */
export async function findContactByPhoneNumber(phoneNumber) {
  const client = await pool.connect();
  try {
    const result = await client.query(
      'SELECT id FROM contacts WHERE phone_number = $1',
      [phoneNumber]
    );
    return result.rows.length > 0 ? result.rows[0] : null;
  } finally {
    client.release();
  }
}

/**
 * Check if contact is awaiting guest count input
 * 
 * @param {number} contactId - Contact ID
 * @returns {Promise<Object|null>} Event message object or null
 */
export async function findAwaitingGuestCountMessage(contactId) {
  const client = await pool.connect();
  try {
    const result = await client.query(
      `SELECT event_id, id FROM event_messages 
       WHERE contact_id = $1 
       AND message_type = 'invitation' 
       AND response = 'מגיע'
       AND awaiting_guest_count = true
       ORDER BY id DESC 
       LIMIT 1`,
      [contactId]
    );
    return result.rows.length > 0 ? result.rows[0] : null;
  } finally {
    client.release();
  }
}

/**
 * Find pending invitation message for contact
 * 
 * @param {number} contactId - Contact ID
 * @returns {Promise<Object|null>} Event message object or null
 */
export async function findPendingInvitation(contactId) {
  const client = await pool.connect();
  try {
    const result = await client.query(
      `SELECT event_id, id FROM event_messages 
       WHERE contact_id = $1 
       AND message_type = 'invitation' 
       AND response = 'ממתין לתגובה'
       ORDER BY id DESC 
       LIMIT 1`,
      [contactId]
    );
    return result.rows.length > 0 ? result.rows[0] : null;
  } finally {
    client.release();
  }
}

/**
 * Update event message with response
 * 
 * @param {number} eventMessageId - Event message ID
 * @param {string} response - Hebrew response type
 * @param {Date} responseTime - Timestamp of response
 */
export async function updateMessageResponse(eventMessageId, response, responseTime) {
  const client = await pool.connect();
  try {
    await client.query(
      `UPDATE event_messages 
       SET response = $1, response_time = $2
       WHERE id = $3`,
      [response, responseTime, eventMessageId]
    );
  } finally {
    client.release();
  }
}

/**
 * Set awaiting guest count flag for a message
 * 
 * @param {number} eventMessageId - Event message ID
 */
export async function setAwaitingGuestCount(eventMessageId) {
  const client = await pool.connect();
  try {
    await client.query(
      `UPDATE event_messages 
       SET awaiting_guest_count = true, guests_coming = 1
       WHERE id = $1`,
      [eventMessageId]
    );
  } finally {
    client.release();
  }
}

/**
 * Update guest count for an event message
 * 
 * @param {number} eventMessageId - Event message ID
 * @param {number} guestCount - Number of guests
 */
export async function updateGuestCount(eventMessageId, guestCount) {
  const client = await pool.connect();
  try {
    await client.query(
      `UPDATE event_messages 
       SET guests_coming = $1, awaiting_guest_count = false
       WHERE id = $2`,
      [guestCount, eventMessageId]
    );
  } finally {
    client.release();
  }
}

/**
 * Get phone number for a contact
 * 
 * @param {number} contactId - Contact ID
 * @returns {Promise<string|null>} Phone number or null
 */
export async function getContactPhoneNumber(contactId) {
  const client = await pool.connect();
  try {
    const result = await client.query(
      'SELECT phone_number FROM contacts WHERE id = $1',
      [contactId]
    );
    return result.rows.length > 0 ? result.rows[0].phone_number : null;
  } finally {
    client.release();
  }
}

