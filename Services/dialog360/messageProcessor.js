import pool from '../../db/db.js';
import {
  findContactByPhoneNumber,
  findAwaitingGuestCountMessage,
  findPendingInvitation,
  updateMessageResponse,
  setAwaitingGuestCount,
  findEventMessageByMessageId,
  updateMessageSeenAt,
  updateMessageFailure
} from '../database/eventMessagesRepository.js';
import { mapInvitationButtonResponse } from './responseMapper.js';
import { sendGuestCountQuestion, markMessageAsRead, sendDeclineConfirmation, sendMaybeConfirmation } from './whatsappMessenger.js';
import { handleGuestCountReply } from './guestCountHandler.js';
import { calculateFollowupDate, getFollowupDisplayText } from './followUpButtonsHelper.js';

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
 * Tracks when guests open/read invitations AND when delivery fails
 * 
 * @param {Object} status - WhatsApp status object
 * @param {Object} value - WhatsApp webhook value object
 */
export async function processDialog360Status(status, value) {
  try {
    const messageId = status.id; // WhatsApp message ID
    const recipientId = status.recipient_id; // Phone number
    const statusType = status.status; // 'sent', 'delivered', 'read', 'failed'
    const timestamp = status.timestamp; // Unix timestamp

    console.log('📱 Status update:', { messageId, recipientId, status: statusType });

    // Find the event_message record by message_id (needed for both read and failed)
    const eventMessage = await findEventMessageByMessageId(messageId);
    
    if (!eventMessage) {
      console.log(`ℹ️  No event_message found for message_id: ${messageId}`);
      return;
    }
    
    console.log(`✅ Found event_message ${eventMessage.id} for message_id ${messageId}`);
    
    // Convert WhatsApp timestamp to JavaScript Date
    const statusTime = new Date(parseInt(timestamp) * 1000);

    // Track "read" status - when guest opens the invitation
    if (statusType === 'read') {
      await updateMessageSeenAt(eventMessage.id, statusTime);
      console.log(`✅ Guest ${recipientId} opened invitation at ${statusTime.toISOString()}`);
      
    // Track "failed" status - when delivery fails
    } else if (statusType === 'failed') {
      // Extract failure reason from status errors
      const errors = status.errors || [];
      let failureReason = 'Unknown failure';
      
      if (errors.length > 0) {
        const errorDetails = errors[0].error_data?.details || errors[0].message || 'No details provided';
        failureReason = errorDetails;
        
        // Log specific error types for monitoring
        if (errorDetails.includes('experiment')) {
          console.error(`❌ Delivery failed - WhatsApp Beta/Experiment: ${recipientId}`);
        } else if (errorDetails.includes('blocked')) {
          console.error(`❌ Delivery failed - User blocked business: ${recipientId}`);
        } else if (errorDetails.includes('not registered')) {
          console.error(`❌ Delivery failed - Number not on WhatsApp: ${recipientId}`);
        } else {
          console.error(`❌ Delivery failed - ${errorDetails}: ${recipientId}`);
        }
      }
      
      // Save failure reason to database
      await updateMessageFailure(eventMessage.id, failureReason);
      console.log(`❌ Message failure logged for ${recipientId}: ${failureReason}`);
      
      // Log the complete meta error object for debugging (at the end to avoid log interleaving)
      console.error(`\n========== FULL META ERROR OBJECT START ==========`);
      console.error(`Recipient: ${recipientId}`);
      console.error(JSON.stringify(status, null, 2));
      console.error(`========== FULL META ERROR OBJECT END ==========\n`);
      
    } else {
      console.log(`ℹ️  Ignoring ${statusType} status (we track 'read' and 'failed')`);
    }
    
  } catch (error) {
    console.error('Error processing status update:', error);
    console.error('Error details:', error.stack);
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
    
    // ✅ Extract event_id from button payload FIRST (for duplicate contact handling)
    let eventId = null;
    
    if (payload) {
      // Payload format: "rsvp_yes_event-uuid" or "rsvp_no_event-uuid" or "rsvp_maybe_event-uuid"
      const payloadMatch = payload.match(/rsvp_(yes|no|maybe)_(.+)/);
      
      if (payloadMatch) {
        eventId = payloadMatch[2];
        console.log(`✅ Extracted event_id from payload: ${eventId}`);
      }
    }
    
    // Find the contact by phone number AND event_id (handles duplicate phone numbers)
    const contact = await findContactByPhoneNumber(phoneNumber, eventId);
    
    if (!contact) {
      console.warn(`⚠️  Contact not found for phone number: ${phoneNumber}${eventId ? ` and event: ${eventId}` : ''}`);
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
    
    // Find the event_message for this event + contact combination
    let eventMessageId = null;
    
    if (eventId) {
      const eventMessageResult = await client.query(
        `SELECT id FROM event_messages 
         WHERE event_id = $1 
         AND contact_id = $2 
         AND message_type = 'invitation' 
         AND response IN ('ממתין לתגובה', 'ללא מענה')
         ORDER BY id DESC 
         LIMIT 1`,
        [eventId, contactId]
      );
      
      if (eventMessageResult.rows.length > 0) {
        eventMessageId = eventMessageResult.rows[0].id;
        console.log(`✅ Found event_message_id ${eventMessageId} for event ${eventId} + contact ${contactId}`);
      } else {
        // No pending invitation found - get event and contact details for debugging
        const eventDetailsResult = await client.query(
          'SELECT owner_email, event_name FROM events WHERE id = $1',
          [eventId]
        );
        
        const contactDetailsResult = await client.query(
          'SELECT display_name FROM contacts WHERE id = $1',
          [contactId]
        );
        
        const ownerEmail = eventDetailsResult.rows.length > 0 ? eventDetailsResult.rows[0].owner_email : 'unknown';
        const eventName = eventDetailsResult.rows.length > 0 ? eventDetailsResult.rows[0].event_name : 'unknown';
        const contactName = contactDetailsResult.rows.length > 0 ? contactDetailsResult.rows[0].display_name : 'unknown';
        
        // Try to find ANY invitation for this event+contact
        const anyInvitationResult = await client.query(
          `SELECT id FROM event_messages 
           WHERE event_id = $1 
           AND contact_id = $2 
           AND message_type = 'invitation'
           ORDER BY id DESC 
           LIMIT 1`,
          [eventId, contactId]
        );
        
        const errorMsg = `[DEBUG] No pending invitation found. Event: ${eventName} (${eventId}) | Owner: ${ownerEmail} | Contact: ${contactName} (ID: ${contactId}) | Phone: ${phoneNumber} | Payload: ${payload} | Response may have already been recorded.`;
        console.error(`❌ ${errorMsg}`);
        
        if (anyInvitationResult.rows.length > 0) {
          // Found an invitation - update it with error
          await client.query(
            `UPDATE event_messages 
             SET error_message = $1 
             WHERE id = $2`,
            [errorMsg, anyInvitationResult.rows[0].id]
          );
          console.log(`📝 Error saved to existing invitation record (id: ${anyInvitationResult.rows[0].id})`);
        } else {
          // No invitation record exists at all - just log to console, don't create record
          console.error(`📝 No invitation record found - cannot save error to database`);
          console.error(`   Skipping database insert to avoid constraint violation`);
        }
        
        await client.query('COMMIT');
        return;
      }
    }
    
    // Check if this is a follow-up timeframe button (for "maybe" responses)
    if (payload && payload.startsWith('followup_')) {
      console.log(`📅 Follow-up button clicked: ${payload}`);
      
      // Find the most recent "לא בטוח" (maybe) invitation for this contact
      const maybeInvitationResult = await client.query(
        `SELECT id FROM event_messages 
         WHERE contact_id = $1 
         AND message_type = 'invitation' 
         AND response = 'לא בטוח'
         ORDER BY id DESC 
         LIMIT 1`,
        [contactId]
      );
      
      if (maybeInvitationResult.rows.length > 0) {
        const eventMessageId = maybeInvitationResult.rows[0].id;
        
        // Calculate follow-up date using helper function (handles all button types including 5 days)
        const followupDate = calculateFollowupDate(payload);
        const followupText = getFollowupDisplayText(payload);
        
        // Store follow-up date in database
        await client.query(
          `UPDATE event_messages 
           SET followup_date = $1 
           WHERE id = $2`,
          [followupDate, eventMessageId]
        );
        
        console.log(`✅ Follow-up date set for contact ${contactId}: ${followupDate}`);
        
        // Send confirmation
        await client.query('COMMIT');
        
        const confirmationText = `תודה! נחזור אליך ${followupText} ✅`;
        await fetch('https://waba-v2.360dialog.io/messages', {
          method: 'POST',
          headers: {
            'D360-API-KEY': process.env.D360_API_KEY,
            'Content-Type': 'application/json',
          },
          body: JSON.stringify({
            messaging_product: 'whatsapp',
            to: phoneNumber,
            type: 'text',
            text: { body: confirmationText }
          }),
        });
        
        console.log(`✅ Follow-up confirmation sent to ${phoneNumber}`);
      } else {
        console.warn(`⚠️  No "maybe" invitation found for contact ${contactId}`);
        await client.query('ROLLBACK');
      }
      
      return;
    }
    
    // If no eventMessageId from payload, try to find most recent pending invitation
    if (!eventMessageId) {
      console.warn(`⚠️  No eventId from payload - looking for most recent pending invitation for contact ${contactId}`);
      
      // Find most recent pending invitation for this contact (no event_id filter needed)
      const fallbackResult = await client.query(
        `SELECT em.id, em.event_id 
         FROM event_messages em
         WHERE em.contact_id = $1 
         AND em.message_type = 'invitation'
         AND em.response IN ('ממתין לתגובה', 'ללא מענה')
         ORDER BY em.id DESC 
         LIMIT 1`,
        [contactId]
      );
      
      if (fallbackResult.rows.length > 0) {
        eventMessageId = fallbackResult.rows[0].id;
        eventId = fallbackResult.rows[0].event_id; // Set eventId for later use
        console.log(`✅ Fallback: Found pending invitation ${eventMessageId} for event ${eventId}`);
      } else {
        // No pending invitation found - try ANY recent invitation
        const anyRecentResult = await client.query(
          `SELECT em.id, em.event_id, e.event_name, e.owner_email 
           FROM event_messages em
           LEFT JOIN events e ON em.event_id = e.id
           WHERE em.contact_id = $1 
           AND em.message_type = 'invitation'
           ORDER BY em.id DESC 
           LIMIT 1`,
          [contactId]
        );
        
        if (anyRecentResult.rows.length > 0) {
          const row = anyRecentResult.rows[0];
          const errorMsg = `[DEBUG] No pending invitation found (response already recorded). Event: ${row.event_name || 'unknown'} (${row.event_id || 'unknown'}) | Owner: ${row.owner_email || 'unknown'} | Contact ID: ${contactId} | Phone: ${phoneNumber} | Message type: ${messageType}`;
          console.error(`❌ ${errorMsg}`);
          
          await client.query(
            `UPDATE event_messages 
             SET error_message = $1 
             WHERE id = $2`,
            [errorMsg, row.id]
          );
          console.log(`📝 Error saved to invitation record (id: ${row.id})`);
        } else {
          console.error(`❌ No invitation found for contact ${contactId} at all - cannot process response`);
        }
        
        await client.query('COMMIT');
        return;
      }
    }
    
    // Map invitation response to Hebrew response types
    // For text messages, enable fallback to handle templates without buttons
    const allowTextFallback = (messageType === 'text');
    const mappedResponse = mapInvitationButtonResponse(replyText, messageType, allowTextFallback);
    
    // If no mapped response, skip processing
    if (!mappedResponse) {
      console.log(`ℹ️  Skipping unrecognized message for contact ${contactId}: "${replyText}"`);
      await client.query('ROLLBACK');
      return;
    }
    
    console.log(`📝 Invitation response mapped: "${replyText}" -> "${mappedResponse}"`);
    
    // Update the event_messages record with the response
    await updateMessageResponse(eventMessageId, mappedResponse, responseTime);
    
    // For "maybe" responses, fetch event date and celebrator names before committing (within transaction)
    let eventDate = null;
    let celebrator1Name = null;
    let celebrator2Name = null;
    
    if (mappedResponse === 'לא בטוח') {
      const eventInfoResult = await client.query(
        'SELECT event_date, celebrator1_name, celebrator2_name FROM events WHERE id = $1',
        [eventId]
      );
      
      if (eventInfoResult.rows.length > 0) {
        eventDate = eventInfoResult.rows[0].event_date;
        celebrator1Name = eventInfoResult.rows[0].celebrator1_name;
        celebrator2Name = eventInfoResult.rows[0].celebrator2_name;
        
        console.log(`📅 Fetched event info - Date: ${eventDate}, Celebrators: ${celebrator1Name || 'N/A'} & ${celebrator2Name || 'N/A'}`);
      } else {
        console.warn('⚠️  No event info found - using defaults');
      }
    }
    
    await client.query('COMMIT');
    console.log(`✅ Updated response for contact ${contactId} in event ${eventId}: ${mappedResponse}`);
    
    // Send appropriate follow-up message based on response type
    if (mappedResponse === 'מגיע') {
      // Attending - Set awaiting_guest_count flag and ask for guest count
      await setAwaitingGuestCount(eventMessageId);
      await sendGuestCountQuestion(phoneNumber);
      
    } else if (mappedResponse === 'לא מגיע') {
      // Not attending - Send decline confirmation
      await sendDeclineConfirmation(phoneNumber);
      
    } else if (mappedResponse === 'לא בטוח') {
      // Maybe - Send maybe confirmation with dynamic buttons based on event proximity
      await sendMaybeConfirmation(phoneNumber, eventDate, celebrator1Name, celebrator2Name);
    }
    
  } catch (error) {
    await client.query('ROLLBACK');
    console.error('Error updating event message response:', error);
  } finally {
    client.release();
  }
}

