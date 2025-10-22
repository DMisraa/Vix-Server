import pool from '../../db/db.js';
import {
  getContactPhoneNumber,
  updateGuestCount
} from '../database/eventMessagesRepository.js';
import {
  sendInvalidGuestCountMessage,
  sendGuestCountConfirmation
} from './whatsappMessenger.js';

/**
 * Guest Count Handler
 * 
 * Handles the guest count conversation flow:
 * 1. Validates numeric input
 * 2. Updates database with guest count
 * 3. Sends confirmation or error messages
 */

/**
 * Handle guest count reply from user
 * 
 * @param {Object} client - Database client (transaction)
 * @param {number} eventMessageId - Event message ID
 * @param {number} eventId - Event ID
 * @param {number} contactId - Contact ID
 * @param {string} replyText - The reply text (should be a number)
 */
export async function handleGuestCountReply(client, eventMessageId, eventId, contactId, replyText) {
  try {
    // Extract number from reply
    const guestCount = parseInt(replyText.trim());
    
    if (isNaN(guestCount) || guestCount < 1 || guestCount > 99) {
      // Send error message asking to reply with a valid number
      const phoneNumber = await getContactPhoneNumber(contactId);
      
      if (phoneNumber) {
        await sendInvalidGuestCountMessage(phoneNumber);
      }
      
      return;
    }
    
    // Update guests_coming with the actual count and clear awaiting flag
    await updateGuestCount(eventMessageId, guestCount);
    
    // Send confirmation message
    const phoneNumber = await getContactPhoneNumber(contactId);
    
    if (phoneNumber) {
      await sendGuestCountConfirmation(phoneNumber, guestCount);
    }
    
  } catch (error) {
    throw error;
  }
}

