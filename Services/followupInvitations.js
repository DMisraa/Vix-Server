import pool from '../db/db.js';
import { sendTemplateMessage } from './dialog360SendTemplate.js';
import { getTemplateConfiguration } from './templates/templateConfigurations.js';
import { normalizePhoneForDialog360 } from './utils/phoneNormalization.js';

/**
 * Followup Invitation Service
 * 
 * Handles sending followup WhatsApp invitations to contacts who responded "maybe"
 * and have a followup_date set. Runs via cron job to ensure timely delivery.
 */


/**
 * Get all contacts who need followup invitations today
 * 
 * Returns contacts where:
 * - Response is "לא בטוח" (maybe)
 * - followup_date is today or earlier
 * - followup_notification_dismissed is false
 */
async function getContactsNeedingFollowup() {
  const client = await pool.connect();
  
  try {
    const today = new Date().toISOString().split('T')[0]; // YYYY-MM-DD format
    
    const result = await client.query(`
      SELECT 
        em.id as message_id,
        em.event_id,
        em.contact_id,
        em.followup_date,
        em.created_at,
        c.display_name as contact_name,
        c.canonical_form,
        c.phone_number,
        c.contact_owner,
        e.event_name,
        e.event_type,
        e.event_date,
        e.event_time,
        e.venue_name,
        e.location,
        e.image_url,
        e.owner_email,
        e.celebrator1_name,
        e.celebrator2_name
      FROM event_messages em
      JOIN contacts c ON em.contact_id = c.id
      JOIN events e ON em.event_id = e.id
      WHERE em.response = 'לא בטוח'
        AND em.followup_date IS NOT NULL
        AND em.followup_date <= $1
        AND em.followup_notification_dismissed = FALSE
        AND c.phone_number IS NOT NULL
        AND c.phone_number != ''
      ORDER BY em.followup_date ASC, em.created_at ASC
    `, [today]);

    return result.rows;

  } finally {
    client.release();
  }
}

/**
 * Send followup invitation to a single contact
 */
async function sendFollowupInvitation(contactData) {
  try {
    const {
      message_id,
      event_id,
      contact_id,
      contact_name,
      canonical_form,
      phone_number,
      contact_owner,
      event_name,
      event_type,
      event_date,
      event_time,
      venue_name,
      location,
      image_url,
      owner_email,
      celebrator1_name,
      celebrator2_name
    } = contactData;

    // Normalize phone number
    const normalizedPhone = normalizePhoneForDialog360(phone_number);
    
    if (!normalizedPhone) {
      console.error(`❌ Invalid phone number for contact ${contact_id}: ${phone_number}`);
      return { success: false, error: 'Invalid phone number' };
    }

    // Prepare event object for template configuration
    const event = {
      id: event_id,
      event_name,
      event_type,
      event_date,
      event_time,
      venue_name,
      location,
      image_url,
      owner_email,
      celebrator1_name,
      celebrator2_name
    };

    // Prepare contact object for template configuration
    const contact = {
      id: contact_id,
      display_name: contact_name,
      canonical_form,
      phone_number: normalizedPhone,
      contact_owner
    };

    // Get template configuration for followup invitation
    // Using 'invitation_followup' template for followup invitations
    const templateConfig = getTemplateConfiguration('invitation_followup', event, contact);

    console.log(`📱 Sending followup invitation to ${contact_name} (${normalizedPhone}) for event: ${event_name}`);

    // Send WhatsApp template message
    const result = await sendTemplateMessage({
      phoneNumber: normalizedPhone,
      templateName: 'invitation_followup', // Use followup template
      languageCode: 'he',
      templateData: templateConfig,
      imageUrl: image_url, // Include event image if available
      buttons: [
        {
          id: 'rsvp_yes',
          payload: `rsvp_yes_${event_id}`
        },
        {
          id: 'rsvp_no', 
          payload: `rsvp_no_${event_id}`
        },
        {
          id: 'rsvp_maybe',
          payload: `rsvp_maybe_${event_id}`
        }
      ]
    });

    console.log(`✅ Followup invitation sent successfully to ${contact_name}:`, result.messageId);
    return { success: true, messageId: result.messageId };

  } catch (error) {
    console.error(`❌ Failed to send followup invitation to contact ${contactData.contact_id}:`, error.message);
    return { success: false, error: error.message };
  }
}

/**
 * Mark followup invitation as sent in database
 * Sets followup_notification_dismissed = TRUE to prevent duplicate sends
 */
async function markFollowupInvitationSent(messageId, messageIdFromDialog360 = null) {
  const client = await pool.connect();
  
  try {
    await client.query(`
      UPDATE event_messages 
      SET 
        followup_notification_dismissed = TRUE,
        followup_invitation_sent_at = NOW(),
        followup_dialog360_message_id = $2
      WHERE id = $1
    `, [messageId, messageIdFromDialog360]);

    console.log(`📝 Marked followup invitation as sent and dismissed for message_id: ${messageId}`);
  } catch (error) {
    console.error(`❌ Failed to mark followup invitation as sent for message_id ${messageId}:`, error);
  } finally {
    client.release();
  }
}

/**
 * Main function to process all followup invitations
 * This is called by the cron job
 */
export async function processFollowupInvitations() {
  console.log('🔄 Starting followup invitations processing...');
  
  try {
    // Get all contacts needing followup invitations
    const contactsNeedingFollowup = await getContactsNeedingFollowup();
    
    if (contactsNeedingFollowup.length === 0) {
      console.log('✅ No contacts need followup invitations today');
      return { success: true, processed: 0, sent: 0, failed: 0 };
    }

    let sentCount = 0;
    let failedCount = 0;
    const results = [];

    // Process each contact
    for (const contactData of contactsNeedingFollowup) {
      try {
        // Send followup invitation
        const result = await sendFollowupInvitation(contactData);
        
        if (result.success) {
          // Mark as sent in database
          await markFollowupInvitationSent(contactData.message_id, result.messageId);
          sentCount++;
          results.push({
            contactId: contactData.contact_id,
            contactName: contactData.contact_name,
            phoneNumber: contactData.phone_number,
            eventName: contactData.event_name,
            status: 'sent',
            messageId: result.messageId
          });
        } else {
          failedCount++;
          results.push({
            contactId: contactData.contact_id,
            contactName: contactData.contact_name,
            phoneNumber: contactData.phone_number,
            eventName: contactData.event_name,
            status: 'failed',
            error: result.error
          });
        }

        // Add delay between messages to avoid rate limiting
        await new Promise(resolve => setTimeout(resolve, 200));

      } catch (error) {
        console.error(`❌ Error processing followup for contact ${contactData.contact_id}:`, error);
        failedCount++;
        results.push({
          contactId: contactData.contact_id,
          contactName: contactData.contact_name,
          phoneNumber: contactData.phone_number,
          eventName: contactData.event_name,
          status: 'error',
          error: error.message
        });
      }
    }

    console.log(`📊 Followup invitations processing complete:`);
    console.log(`   📤 Sent: ${sentCount}`);
    console.log(`   ❌ Failed: ${failedCount}`);
    console.log(`   📋 Total processed: ${contactsNeedingFollowup.length}`);

    return {
      success: true,
      processed: contactsNeedingFollowup.length,
      sent: sentCount,
      failed: failedCount,
      results
    };

  } catch (error) {
    console.error('❌ Error in processFollowupInvitations:', error);
    return {
      success: false,
      error: error.message,
      processed: 0,
      sent: 0,
      failed: 0
    };
  }
}

/**
 * Manual trigger function for testing
 * Can be called via API endpoint for testing purposes
 */
export async function triggerFollowupInvitations(req, res) {
  try {
    console.log('🔧 Manual trigger of followup invitations processing...');
    
    const result = await processFollowupInvitations();
    
    res.status(200).json({
      success: true,
      message: 'Followup invitations processing completed',
      data: result
    });

  } catch (error) {
    console.error('❌ Error in manual trigger:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to process followup invitations',
      error: error.message
    });
  }
}
