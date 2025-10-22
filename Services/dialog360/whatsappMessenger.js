/**
 * WhatsApp Messenger
 * 
 * Handles all outgoing WhatsApp messages via Dialog 360 API
 * - Guest count questions
 * - Confirmation messages
 * - Error messages
 * - Message read receipts
 */

import { getFollowUpButtons, getEventTooCloseMessage } from './followUpButtonsHelper.js';

/**
 * Mark message as read (shows colored ticks to sender)
 * 
 * @param {string} messageId - WhatsApp message ID
 * @param {string} phoneNumber - Phone number
 */
export async function markMessageAsRead(messageId, phoneNumber) {
  try {
    const apiKey = process.env.D360_API_KEY;
    
    if (!apiKey) {
      return;
    }

    const response = await fetch('https://waba-v2.360dialog.io/messages', {
      method: 'POST',
      headers: {
        'D360-API-KEY': apiKey,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        messaging_product: 'whatsapp',
        status: 'read',
        message_id: messageId,
      }),
    });

    if (!response.ok) {
      const errorText = await response.text();
      console.error(`❌ Mark as read failed (${response.status}): ${errorText}`);
    }
  } catch (error) {
    console.error('❌ Mark as read error:', error.message);
  }
}

/**
 * Send a follow-up message asking for guest count
 * 
 * @param {string} phoneNumber - Phone number to send to
 */
export async function sendGuestCountQuestion(phoneNumber) {
  try {
    const apiKey = process.env.D360_API_KEY;
    
    if (!apiKey) {
      return;
    }
    
    const messageText = 'מעולה! 🎉\n\nכמה אורחים יגיעו?\nאנא השב עם מספר בלבד (לדוגמה: 2)';
    
    const response = await fetch('https://waba-v2.360dialog.io/messages', {
      method: 'POST',
      headers: {
        'D360-API-KEY': apiKey,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        messaging_product: 'whatsapp',
        to: phoneNumber,
        type: 'text',
        text: {
          body: messageText
        }
      }),
    });

    if (!response.ok) {
      const errorText = await response.text();
      console.error(`❌ Guest count question failed (${response.status}): ${errorText}`);
    } else {
      const successData = await response.json();
      console.log(`✅ Guest count question sent: ${successData.messages?.[0]?.id || 'no-id'}`);
    }
    
  } catch (error) {
    console.error('❌ Guest count question error:', error.message);
  }
}

/**
 * Send invalid guest count message
 * 
 * @param {string} phoneNumber - Phone number to send to
 */
export async function sendInvalidGuestCountMessage(phoneNumber) {
  try {
    const apiKey = process.env.D360_API_KEY;
    
    if (!apiKey) {
      return;
    }
    
    const messageText = 'אנא השב עם מספר תקין (לדוגמה: 2, 3, 4...)';
    
    const response = await fetch('https://waba-v2.360dialog.io/messages', {
      method: 'POST',
      headers: {
        'D360-API-KEY': apiKey,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        messaging_product: 'whatsapp',
        to: phoneNumber,
        type: 'text',
        text: {
          body: messageText
        }
      }),
    });

    if (!response.ok) {
      const errorText = await response.text();
      console.error(`❌ Invalid guest count message failed (${response.status}): ${errorText}`);
    }
    
  } catch (error) {
    console.error('❌ Invalid guest count message error:', error.message);
  }
}

/**
 * Send guest count confirmation message
 * 
 * @param {string} phoneNumber - Phone number to send to
 * @param {number} guestCount - Number of guests
 */
export async function sendGuestCountConfirmation(phoneNumber, guestCount) {
  try {
    const apiKey = process.env.D360_API_KEY;
    
    if (!apiKey) {
      return;
    }
    
    const messageText = `תודה! רשמנו ${guestCount} אורחים. נתראה באירוע! 🎊`;
    
    const response = await fetch('https://waba-v2.360dialog.io/messages', {
      method: 'POST',
      headers: {
        'D360-API-KEY': apiKey,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        messaging_product: 'whatsapp',
        to: phoneNumber,
        type: 'text',
        text: {
          body: messageText
        }
      }),
    });

    if (!response.ok) {
      const errorText = await response.text();
      console.error(`❌ Guest count confirmation failed (${response.status}): ${errorText}`);
    } else {
      const successData = await response.json();
      console.log(`✅ Guest count confirmation sent: ${successData.messages?.[0]?.id || 'no-id'}`);
    }
    
  } catch (error) {
    console.error('❌ Guest count confirmation error:', error.message);
  }
}

/**
 * Send decline confirmation message
 * 
 * @param {string} phoneNumber - Phone number to send to
 */
export async function sendDeclineConfirmation(phoneNumber) {
  try {
    const apiKey = process.env.D360_API_KEY;
    
    if (!apiKey) {
      return;
    }
    
    const messageText = 'תודה על עדכון! נשמח לראותך באירועים הבאים 💙';
    
    const response = await fetch('https://waba-v2.360dialog.io/messages', {
      method: 'POST',
      headers: {
        'D360-API-KEY': apiKey,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        messaging_product: 'whatsapp',
        to: phoneNumber,
        type: 'text',
        text: {
          body: messageText
        }
      }),
    });

    if (!response.ok) {
      const errorText = await response.text();
      console.error(`❌ Decline confirmation failed (${response.status}): ${errorText}`);
    } else {
      const successData = await response.json();
      console.log(`✅ Decline confirmation sent: ${successData.messages?.[0]?.id || 'no-id'}`);
    }
    
  } catch (error) {
    console.error('❌ Decline confirmation error:', error.message);
  }
}

/**
 * Send maybe confirmation message with dynamic follow-up buttons
 * 
 * Buttons shown depend on event proximity:
 * - >17 days: 3 days, 1 week, 2 weeks
 * - 10-17 days: 3 days, 1 week
 * - 7-9 days: 3 days, 5 days
 * - 5-6 days: 3 days only
 * - 4 days: 2 days only
 * - 3 days: 2 days, tomorrow
 * - 2 days: tomorrow only
 * - <2 days: text message only (no buttons)
 * 
 * @param {string} phoneNumber - Phone number to send to
 * @param {string|Date} eventDate - Event date to calculate proximity
 * @param {string|null} celebrator1Name - First celebrator name
 * @param {string|null} celebrator2Name - Second celebrator name (optional)
 */
export async function sendMaybeConfirmation(phoneNumber, eventDate = null, celebrator1Name = null, celebrator2Name = null) {
  try {
    const apiKey = process.env.D360_API_KEY;
    
    if (!apiKey) {
      return;
    }
    
    // Get dynamic buttons based on event proximity
    const buttons = getFollowUpButtons(eventDate);
    
    // Check if event is too close (< 2 days) - send text message only
    if (buttons === 'too_close') {
      const messageText = getEventTooCloseMessage(celebrator1Name, celebrator2Name);
      
      const payload = {
        messaging_product: 'whatsapp',
        to: phoneNumber,
        type: 'text',
        text: { body: messageText }
      };
      
      const response = await fetch('https://waba-v2.360dialog.io/messages', {
        method: 'POST',
        headers: {
          'D360-API-KEY': apiKey,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(payload),
      });

      if (!response.ok) {
        const errorText = await response.text();
        console.error(`❌ Too-close message failed (${response.status}): ${errorText}`);
      } else {
        const successData = await response.json();
        console.log(`✅ Too-close message sent: ${successData.messages?.[0]?.id || 'no-id'}`);
      }
      
      return;
    }
    
    // Send interactive message with buttons
    const payload = {
      messaging_product: 'whatsapp',
      recipient_type: 'individual',
      to: phoneNumber,
      type: 'interactive',
      interactive: {
        type: 'button',
        body: {
          text: 'בסדר גמור! 😊\n\nמתי נוכל לבדוק איתך שוב?'
        },
        action: {
          buttons: buttons
        }
      }
    };
    
    const response = await fetch('https://waba-v2.360dialog.io/messages', {
      method: 'POST',
      headers: {
        'D360-API-KEY': apiKey,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(payload),
    });

    if (!response.ok) {
      const errorText = await response.text();
      console.error(`❌ Maybe confirmation failed (${response.status}): ${errorText}`);
    } else {
      const successData = await response.json();
      console.log(`✅ Maybe confirmation sent: ${successData.messages?.[0]?.id || 'no-id'}`);
    }
    
  } catch (error) {
    console.error('❌ Maybe confirmation error:', error.message);
  }
}

