import pool from '../../db/db.js';
import {
  findContactByPhoneNumber,
  findAwaitingGuestCountMessage,
  findPendingInvitation,
  updateMessageResponse,
  setAwaitingGuestCount
} from '../database/eventMessagesRepository.js';
import { mapInvitationButtonResponse } from './responseMapper.js';
import { sendGuestCountQuestion, markMessageAsRead } from './whatsappMessenger.js';
import { handleGuestCountReply } from './guestCountHandler.js';

/**
 * Message Processor
 * 
 * Processes different types of WhatsApp messages:
 * - Text messages
 * - Button replies
 * - Interactive messages
 * - Media messages (image, document, audio, video)
 */

/**
 * Process incoming WhatsApp message
 * 
 * @param {Object} message - WhatsApp message object
 * @param {Object} value - WhatsApp webhook value object
 */
export async function processDialog360Message(message, value) {
  try {
    const messageId = message.id;
    const from = message.from;
    const timestamp = message.timestamp;
    const messageType = message.type;

    console.log('Received message:', { messageId, from, type: messageType });

    // Mark message as read (shows colored ticks to sender)
    await markMessageAsRead(messageId, from);

    switch (messageType) {
      case 'text':
        const textContent = message.text?.body;
        console.log(`Text from ${from}: ${textContent}`);
        
        // Update database with text response
        await updateEventMessageResponse(from, textContent, timestamp, null, 'text');
        break;

      case 'image':
        const imageId = message.image?.id;
        console.log(`Image from ${from}, ID: ${imageId}`);
        // DB logic
        break;

      case 'document':
        const documentId = message.document?.id;
        console.log(`Document from ${from}, ID: ${documentId}`);
        // DB logic
        break;

      case 'audio':
        const audioId = message.audio?.id;
        console.log(`Audio from ${from}, ID: ${audioId}`);
        // DB logic
        break;

      case 'video':
        const videoId = message.video?.id;
        console.log(`Video from ${from}, ID: ${videoId}`);
        // DB logic
        break;

      case 'button':
        const buttonText = message.button?.text;
        const buttonPayload = message.button?.payload;
        console.log(
          `Quick reply from ${from}: ${buttonText} (payload: ${buttonPayload})`
        );
        
        // Update database with RSVP response
        await updateEventMessageResponse(from, buttonText, timestamp, buttonPayload);
        break;

      case 'interactive':
        const interactiveType = message.interactive?.type;
        if (interactiveType === 'button_reply') {
          const buttonReplyText =
            message.interactive.button_reply?.title || '';
          const buttonReplyId = message.interactive.button_reply?.id || '';
          console.log(
            `Interactive reply from ${from}: ${buttonReplyText} (payload: ${buttonReplyId})`
          );
          
          // Update database with RSVP response
          await updateEventMessageResponse(from, buttonReplyText, timestamp, buttonReplyId);
        }
        break;

      default:
        console.log(`Unsupported message type: ${messageType}`);
    }
  } catch (error) {
    console.error('Error processing message:', error);
  }
}

/**
 * Process status updates for sent messages
 * 
 * @param {Object} status - WhatsApp status object
 * @param {Object} value - WhatsApp webhook value object
 */
export async function processDialog360Status(status, value) {
  try {
    const statusId = status.id;
    const recipientId = status.recipient_id;
    const statusType = status.status;
    const timestamp = status.timestamp;

    console.log('Status update:', { statusId, recipientId, status: statusType });
    // ✅ Add DB update logic here if needed
  } catch (error) {
    console.error('Error processing status:', error);
  }
}

/**
 * Process errors from Dialog 360
 * 
 * @param {Object} error - Dialog 360 error object
 * @param {Object} value - WhatsApp webhook value object
 */
export async function processDialog360Error(error, value) {
  try {
    const errorCode = error.code;
    const errorTitle = error.title;
    const errorMessage = error.message;
    const errorDetails = error.error_data?.details;

    console.error('Dialog 360 Error received:', {
      code: errorCode,
      title: errorTitle,
      message: errorMessage,
      details: errorDetails,
      timestamp: new Date().toISOString()
    });

    // ✅ Add error handling logic here:
    // - Log to monitoring system (e.g., Sentry)
    // - Save to database for tracking
    // - Send alerts for critical errors
    // - Update message status in DB if related to specific message

    // Common error codes to handle:
    // - 130472: User's number is part of an experiment (no action needed)
    // - 131026: Message undeliverable
    // - 131047: Re-engagement message
    // - 131051: Unsupported message type
    // - etc.

  } catch (err) {
    console.error('Error processing Dialog 360 error notification:', err);
  }
}

/**
 * Update event_messages table with WhatsApp reply response
 * 
 * @param {string} phoneNumber - International phone number (e.g., "972544349661")
 * @param {string} replyText - The reply text or button text
 * @param {string} timestamp - WhatsApp timestamp
 * @param {string} payload - Button payload (if applicable)
 * @param {string} messageType - Type of message ('text', 'button', etc.)
 */
async function updateEventMessageResponse(phoneNumber, replyText, timestamp, payload, messageType = 'button') {
  const client = await pool.connect();
  
  try {
    await client.query('BEGIN');
    
    // Convert WhatsApp timestamp to PostgreSQL timestamp
    const responseTime = new Date(parseInt(timestamp) * 1000);
    
    // Find the contact by phone number
    const contact = await findContactByPhoneNumber(phoneNumber);
    
    if (!contact) {
      console.warn(`⚠️  Contact not found for phone number: ${phoneNumber}`);
      await client.query('ROLLBACK');
      return;
    }
    
    const contactId = contact.id;
    
    // Check if we're expecting a guest count (awaiting_guest_count flag)
    const awaitingMessage = await findAwaitingGuestCountMessage(contactId);
    
    if (awaitingMessage) {
      // This is a guest count reply
      await handleGuestCountReply(client, awaitingMessage.id, awaitingMessage.event_id, contactId, replyText);
      await client.query('COMMIT');
      return;
    }
    
    // ✅ IMPROVED LOGIC: Extract event_id from button payload
    let eventMessageId = null;
    let eventId = null;
    
    if (payload) {
      // Payload format: "rsvp_yes_event-uuid" or "rsvp_no_event-uuid" or "rsvp_maybe_event-uuid"
      const payloadMatch = payload.match(/rsvp_(yes|no|maybe)_(.+)/);
      
      if (payloadMatch) {
        eventId = payloadMatch[2];
        console.log(`✅ Extracted event_id from payload: ${eventId}`);
        
        // Find the event_message for this event + contact combination
        const eventMessageResult = await client.query(
          `SELECT id FROM event_messages 
           WHERE event_id = $1 
           AND contact_id = $2 
           AND message_type = 'invitation' 
           AND response = 'ממתין לתגובה'
           ORDER BY id DESC 
           LIMIT 1`,
          [eventId, contactId]
        );
        
        if (eventMessageResult.rows.length > 0) {
          eventMessageId = eventMessageResult.rows[0].id;
          console.log(`✅ Found event_message_id ${eventMessageId} for event ${eventId} + contact ${contactId}`);
        } else {
          console.warn(`⚠️  No pending invitation found for event ${eventId} + contact ${contactId} - falling back to search`);
          eventId = null; // Reset to trigger fallback logic
        }
      }
    }
    
    // Fallback: If no valid payload, search for pending invitation (old logic for backward compatibility)
    if (!eventMessageId) {
      console.log(`ℹ️  No payload or no match found - searching for any pending invitation`);
      const pendingMessage = await findPendingInvitation(contactId);
      
      if (!pendingMessage) {
        console.warn(`⚠️  No pending invitation found for contact ID: ${contactId}`);
        await client.query('ROLLBACK');
        return;
      }
      
      eventMessageId = pendingMessage.id;
      eventId = pendingMessage.event_id;
      console.log(`⚠️  Using fallback search - found event_message_id ${eventMessageId}`);
    }
    
    // Map invitation button to Hebrew response types (only processes quick reply buttons)
    const mappedResponse = mapInvitationButtonResponse(replyText, messageType);
    
    // If mappedResponse is null, it means it's not a quick reply button - skip processing
    if (!mappedResponse) {
      console.log(`ℹ️  Skipping non-button message for contact ${contactId}`);
      await client.query('ROLLBACK');
      return;
    }
    
    console.log(`📝 Invitation button mapped: "${replyText}" -> "${mappedResponse}"`);
    
    // Update the event_messages record with the response
    await updateMessageResponse(eventMessageId, mappedResponse, responseTime);
    
    // If it's an approval response, ask for guest count
    if (mappedResponse === 'מגיע') {
      // Set awaiting_guest_count flag
      await setAwaitingGuestCount(eventMessageId);
      
      await client.query('COMMIT');
      
      console.log(`✅ Updated response for contact ${contactId} in event ${eventId}: ${mappedResponse}`);
      
      // Send follow-up message asking for guest count
      await sendGuestCountQuestion(phoneNumber);
      
    } else {
      // For non-approval responses, just commit
      await client.query('COMMIT');
      console.log(`✅ Updated response for contact ${contactId} in event ${eventId}: ${mappedResponse}`);
    }
    
  } catch (error) {
    await client.query('ROLLBACK');
    console.error('Error updating event message response:', error);
  } finally {
    client.release();
  }
}

