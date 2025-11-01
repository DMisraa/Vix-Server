/**
 * WhatsApp Template Names Constants
 * 
 * Centralized template name definitions for consistency across the application.
 * Update template names here and use these constants throughout the codebase.
 */

export const TEMPLATE_NAMES = {
  // Initial invitation
  INITIAL_INVITATION: 'event_invitation',
  
  // Reminders (by round)
  REMINDER_1: 'reminder_1',        // First reminder (round 2)
  REMINDER_2: 'reminder_2',        // Second reminder (round 3)
  REMINDER_3: 'reminder_3',        // Third reminder (round 4+)
  
  // Special messages
  THANK_YOU: 'thank_you_note',
  MORNING_REMINDER: 'event_directions', // Morning reminder with navigation
  
  // Legacy/alternative names (for backward compatibility)
  FOLLOWUP: 'invitation_followup', // Used for "maybe" followups
};

/**
 * Get template name for a reminder based on message round
 * 
 * @param {number} messageRound - The message round (1 = initial, 2+ = reminders)
 * @returns {string} Template name
 */
export function getReminderTemplateName(messageRound) {
  switch (messageRound) {
    case 1:
      return TEMPLATE_NAMES.INITIAL_INVITATION;
    case 2:
      return TEMPLATE_NAMES.REMINDER_1;
    case 3:
      return TEMPLATE_NAMES.REMINDER_2;
    case 4:
    default:
      // For round 4+ or any higher rounds, use reminder_3
      return TEMPLATE_NAMES.REMINDER_3;
  }
}

