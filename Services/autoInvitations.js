import pool from '../db/db.js';
import { sendTemplateMessage } from './dialog360SendTemplate.js';
import { getTemplateConfiguration } from './templates/templateConfigurations.js';
import { getReminderTemplateName, TEMPLATE_NAMES } from './templates/templateNames.js';
import { normalizePhoneForDialog360 } from './utils/phoneNormalization.js';

/**
 * Auto-Invite Service
 * 
 * Handles automatic sending of WhatsApp invitations for events with auto_invite_enabled = true.
 * Processes:
 * - Initial invitations to contacts who haven't been invited
 * - Reminders to contacts who haven't responded after messageInterval days
 * - Thank you messages to attendees the day after event
 * - Morning reminders to attendees on event day
 * 
 * Runs via cron job daily at 10:00 AM.
 */

/**
 * Get all events with auto-invite enabled
 */
async function getAutoInviteEvents() {
  const client = await pool.connect();
  
  try {
    const result = await client.query(`
      SELECT 
        id,
        event_name,
        event_type,
        event_date,
        event_time,
        venue_name,
        location,
        image_url,
        owner_email,
        celebrator1_name,
        celebrator2_name,
        auto_invite_enabled,
        auto_invite_started_at,
        auto_invite_reminder_count,
        auto_invite_message_interval,
        auto_invite_send_thank_you,
        auto_invite_send_morning_reminder
      FROM events
      WHERE auto_invite_enabled = TRUE
      ORDER BY auto_invite_started_at ASC
    `);

    return result.rows;
  } finally {
    client.release();
  }
}

/**
 * Get contacts who need initial invitations (haven't been invited yet)
 */
async function getContactsNeedingInitialInvitation(eventId) {
  const client = await pool.connect();
  
  try {
    const result = await client.query(`
      SELECT 
        c.id as contact_id,
        c.display_name as contact_name,
        c.canonical_form,
        c.phone_number,
        c.contact_owner
      FROM contacts c
      INNER JOIN event_contacts ec ON c.id = ec.contact_id
      WHERE ec.event_id = $1
        AND c.phone_number IS NOT NULL
        AND c.phone_number != ''
        AND NOT EXISTS (
          SELECT 1 
          FROM event_messages em
          WHERE em.event_id = $1 
            AND em.contact_id = c.id
            AND em.message_type = 'invitation'
        )
      ORDER BY c.id ASC
    `, [eventId]);

    return result.rows;
  } finally {
    client.release();
  }
}

/**
 * Get contacts who need reminders (no response after messageInterval days)
 */
async function getContactsNeedingReminders(eventId, messageInterval, reminderCount, startedAt) {
  const client = await pool.connect();
  
  try {
    const today = new Date().toISOString().split('T')[0];
    const contacts = [];

    // Get the highest message round sent for each contact
    // Then check if enough days have passed since their last message
    // EXCLUDE contacts with "maybe" response - they're handled by followupInvitations.js
    const result = await client.query(`
      SELECT 
        em.id as message_id,
        em.contact_id,
        em.message_round,
        em.created_at,
        c.display_name as contact_name,
        c.canonical_form,
        c.phone_number,
        c.contact_owner,
        MAX(em.message_round) OVER (PARTITION BY em.contact_id) as max_round
      FROM event_messages em
      INNER JOIN contacts c ON em.contact_id = c.id
      WHERE em.event_id = $1
        AND em.message_type = 'invitation'
        AND em.response IN ('ללא מענה', 'ממתין לתגובה')
        AND c.phone_number IS NOT NULL
        AND c.phone_number != ''
        AND NOT EXISTS (
          -- Exclude contacts who have a "maybe" response (handled by followupInvitations.js)
          -- This prevents auto-invite from sending reminders to contacts in the followup system
          SELECT 1 FROM event_messages em2
          WHERE em2.event_id = $1
            AND em2.contact_id = em.contact_id
            AND em2.response = 'לא בטוח'
        )
      ORDER BY em.contact_id, em.message_round DESC
    `, [eventId]);

    // Group by contact and find the latest message
    const contactMap = new Map();
    for (const row of result.rows) {
      if (!contactMap.has(row.contact_id)) {
        contactMap.set(row.contact_id, row);
      }
    }

    // Check each contact to see if they need a reminder
    for (const [contactId, contact] of contactMap) {
      const lastMessageDate = new Date(contact.created_at);
      const daysSinceLastMessage = Math.floor((new Date(today) - lastMessageDate) / (1000 * 60 * 60 * 24));
      
      // Check if enough days have passed and we haven't exceeded reminder count
      // max_round = 1 means initial invitation sent, so reminders start at round 2
      // We can send up to reminderCount reminders (rounds 2, 3, 4... up to reminderCount + 1)
      if (daysSinceLastMessage >= messageInterval && contact.max_round < reminderCount + 1) {
        contacts.push({
          ...contact,
          targetRound: contact.max_round + 1
        });
      }
    }

    return contacts;
  } finally {
    client.release();
  }
}

/**
 * Get contacts who need thank you messages (attended, next day after event)
 */
async function getContactsNeedingThankYou(eventId, eventDate) {
  const client = await pool.connect();
  
  try {
    if (!eventDate) return [];

    const eventDateObj = new Date(eventDate);
    const nextDay = new Date(eventDateObj);
    nextDay.setDate(nextDay.getDate() + 1);
    const nextDayStr = nextDay.toISOString().split('T')[0];
    const today = new Date().toISOString().split('T')[0];

    // Only send thank you on the day after the event
    if (nextDayStr !== today) return [];

    const result = await client.query(`
      SELECT 
        em.id as message_id,
        em.contact_id,
        c.display_name as contact_name,
        c.canonical_form,
        c.phone_number,
        c.contact_owner
      FROM event_messages em
      INNER JOIN contacts c ON em.contact_id = c.id
      WHERE em.event_id = $1
        AND em.message_type = 'invitation'
        AND em.response = 'מגיע'
        AND c.phone_number IS NOT NULL
        AND c.phone_number != ''
        AND NOT EXISTS (
          SELECT 1 
          FROM event_messages em2
          WHERE em2.event_id = $1
            AND em2.contact_id = em.contact_id
            AND em2.message_type = 'thank_you'
        )
    `, [eventId]);

    return result.rows;
  } finally {
    client.release();
  }
}

/**
 * Get contacts who need morning reminders (attending, on event day)
 */
async function getContactsNeedingMorningReminder(eventId, eventDate) {
  const client = await pool.connect();
  
  try {
    if (!eventDate) return [];

    const today = new Date().toISOString().split('T')[0];
    const eventDateStr = eventDate instanceof Date 
      ? eventDate.toISOString().split('T')[0] 
      : eventDate.split('T')[0];

    // Only send on event day
    if (eventDateStr !== today) return [];

    const result = await client.query(`
      SELECT 
        em.id as message_id,
        em.contact_id,
        c.display_name as contact_name,
        c.canonical_form,
        c.phone_number,
        c.contact_owner
      FROM event_messages em
      INNER JOIN contacts c ON em.contact_id = c.id
      WHERE em.event_id = $1
        AND em.message_type = 'invitation'
        AND em.response = 'מגיע'
        AND c.phone_number IS NOT NULL
        AND c.phone_number != ''
        AND NOT EXISTS (
          SELECT 1 
          FROM event_messages em2
          WHERE em2.event_id = $1
            AND em2.contact_id = em.contact_id
            AND em2.message_type = 'morning_reminder'
        )
    `, [eventId]);

    return result.rows;
  } finally {
    client.release();
  }
}

/**
 * Send invitation to a single contact
 */
async function sendInvitation(contactData, event, messageRound = 1, messageType = 'invitation') {
  try {
    const {
      contact_id,
      contact_name,
      canonical_form,
      phone_number,
      contact_owner
    } = contactData;

    const normalizedPhone = normalizePhoneForDialog360(phone_number);
    
    if (!normalizedPhone) {
      console.error(`❌ Invalid phone number for contact ${contact_id}: ${phone_number}`);
      return { success: false, error: 'Invalid phone number' };
    }

    // Prepare event and contact objects for template configuration
    const eventObj = {
      id: event.id,
      event_name: event.event_name,
      event_type: event.event_type,
      event_date: event.event_date,
      event_time: event.event_time,
      venue_name: event.venue_name,
      location: event.location,
      image_url: event.image_url,
      owner_email: event.owner_email,
      celebrator1_name: event.celebrator1_name,
      celebrator2_name: event.celebrator2_name
    };

    const contactObj = {
      id: contact_id,
      display_name: contact_name,
      canonical_form,
      phone_number: normalizedPhone,
      contact_owner
    };

    // Determine template based on message type and round
    let templateName = TEMPLATE_NAMES.INITIAL_INVITATION;
    if (messageType === 'reminder') {
      // Use the correct reminder template based on message round
      templateName = getReminderTemplateName(messageRound);
    } else if (messageType === 'thank_you') {
      templateName = TEMPLATE_NAMES.THANK_YOU;
    } else if (messageType === 'morning_reminder') {
      templateName = TEMPLATE_NAMES.MORNING_REMINDER;
    }

    const templateConfig = getTemplateConfiguration(templateName, eventObj, contactObj);

    console.log(`📱 Sending ${messageType} to ${contact_name} (${normalizedPhone}) for event: ${event.event_name}`);

    // Send WhatsApp template message
    const result = await sendTemplateMessage({
      phoneNumber: normalizedPhone,
      templateName,
      languageCode: 'he',
      templateData: templateConfig,
      imageUrl: event.image_url,
      buttons: messageType === 'thank_you' || messageType === 'morning_reminder' 
        ? [] // No buttons for thank you or morning reminder
        : [
            {
              id: 'rsvp_yes',
              payload: `rsvp_yes_${event.id}`
            },
            {
              id: 'rsvp_no',
              payload: `rsvp_no_${event.id}`
            },
            {
              id: 'rsvp_maybe',
              payload: `rsvp_maybe_${event.id}`
            }
          ]
    });

    // Log message in database
    const client = await pool.connect();
    try {
      await client.query(`
        INSERT INTO event_messages (
          event_id, contact_id, message_type, message_round,
          response, message_id
        ) VALUES ($1, $2, $3, $4, $5, $6)
      `, [
        event.id,
        contact_id,
        messageType,
        messageRound,
        'ממתין לתגובה',
        result.messageId
      ]);
    } finally {
      client.release();
    }

    console.log(`✅ ${messageType} sent successfully to ${contact_name}:`, result.messageId);
    return { success: true, messageId: result.messageId };

  } catch (error) {
    console.error(`❌ Failed to send ${messageType} to contact ${contactData.contact_id}:`, error.message);
    return { success: false, error: error.message };
  }
}

/**
 * Main function to process all auto-invite events
 * This is called by the cron job
 */
export async function processAutoInvitations() {
  console.log('🔄 Starting auto-invite processing...');
  
  try {
    // Get all events with auto-invite enabled
    const events = await getAutoInviteEvents();
    
    if (events.length === 0) {
      console.log('✅ No events with auto-invite enabled');
      return { success: true, processed: 0, sent: 0, failed: 0 };
    }

    let totalSent = 0;
    let totalFailed = 0;
    const results = [];

    // Process each event
    for (const event of events) {
      console.log(`\n📅 Processing event: ${event.event_name} (${event.id})`);
      
      try {
        // 1. Send initial invitations
        const initialContacts = await getContactsNeedingInitialInvitation(event.id);
        console.log(`   📤 Found ${initialContacts.length} contacts needing initial invitations`);
        
        for (const contact of initialContacts) {
          const result = await sendInvitation(contact, event, 1, 'invitation');
          if (result.success) {
            totalSent++;
          } else {
            totalFailed++;
          }
          await new Promise(resolve => setTimeout(resolve, 200)); // Rate limiting
        }

        // 2. Send reminders
        if (event.auto_invite_reminder_count > 0) {
          const reminderContacts = await getContactsNeedingReminders(
            event.id,
            event.auto_invite_message_interval,
            event.auto_invite_reminder_count,
            event.auto_invite_started_at
          );
          console.log(`   🔔 Found ${reminderContacts.length} contacts needing reminders`);
          
          for (const contact of reminderContacts) {
            const result = await sendInvitation(contact, event, contact.targetRound, 'reminder');
            if (result.success) {
              totalSent++;
            } else {
              totalFailed++;
            }
            await new Promise(resolve => setTimeout(resolve, 200)); // Rate limiting
          }
        }

        // 3. Send thank you messages (if enabled)
        if (event.auto_invite_send_thank_you) {
          const thankYouContacts = await getContactsNeedingThankYou(event.id, event.event_date);
          console.log(`   🙏 Found ${thankYouContacts.length} contacts needing thank you messages`);
          
          for (const contact of thankYouContacts) {
            const result = await sendInvitation(contact, event, 1, 'thank_you');
            if (result.success) {
              totalSent++;
            } else {
              totalFailed++;
            }
            await new Promise(resolve => setTimeout(resolve, 200)); // Rate limiting
          }
        }

        // 4. Send morning reminders (if enabled)
        if (event.auto_invite_send_morning_reminder) {
          const morningContacts = await getContactsNeedingMorningReminder(event.id, event.event_date);
          console.log(`   🌅 Found ${morningContacts.length} contacts needing morning reminders`);
          
          for (const contact of morningContacts) {
            const result = await sendInvitation(contact, event, 1, 'morning_reminder');
            if (result.success) {
              totalSent++;
            } else {
              totalFailed++;
            }
            await new Promise(resolve => setTimeout(resolve, 200)); // Rate limiting
          }
        }

      } catch (error) {
        console.error(`❌ Error processing event ${event.id}:`, error);
        totalFailed++;
      }
    }

    console.log(`\n📊 Auto-invite processing complete:`);
    console.log(`   📤 Sent: ${totalSent}`);
    console.log(`   ❌ Failed: ${totalFailed}`);
    console.log(`   📋 Events processed: ${events.length}`);

    return {
      success: true,
      processed: events.length,
      sent: totalSent,
      failed: totalFailed,
      results
    };

  } catch (error) {
    console.error('❌ Error in processAutoInvitations:', error);
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
export async function triggerAutoInvitations(req, res) {
  try {
    console.log('🔧 Manual trigger of auto-invite processing...');
    
    const result = await processAutoInvitations();
    
    res.status(200).json({
      success: true,
      message: 'Auto-invite processing completed',
      data: result
    });

  } catch (error) {
    console.error('❌ Error in manual trigger:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to process auto-invitations',
      error: error.message
    });
  }
}

