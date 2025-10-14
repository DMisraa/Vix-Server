/**
 * WhatsApp Template Configurations
 * 
 * Each template has its own variable mapping configuration
 * This centralizes all template logic in one place
 */

/**
 * Format event date for display (DD.MM.YYYY)
 */
function formatEventDate(dateString) {
  if (!dateString) return '';
  const date = new Date(dateString);
  return date.toLocaleDateString('he-IL', { 
    day: '2-digit', 
    month: '2-digit', 
    year: 'numeric' 
  });
}

/**
 * Get day of week in Hebrew
 */
function getDayOfWeek(dateString) {
  if (!dateString) return '';
  const date = new Date(dateString);
  const days = ['ראשון', 'שני', 'שלישי', 'רביעי', 'חמישי', 'שישי', 'שבת'];
  return days[date.getDay()];
}

/**
 * Map event type to Hebrew
 */
function getEventTypeHebrew(eventType) {
  const types = {
    'wedding': 'חתונה',
    'bar_mitzvah': 'בר מצווה',
    'bat_mitzvah': 'בת מצווה',
    'brit_milah': 'ברית מילה',
    'engagement': 'אירוסין',
    'birthday': 'יום הולדת'
  };
  return types[eventType] || eventType || 'אירוע';
}

/**
 * Get celebrators names
 */
function getCelebratorsNames(event) {
  if (event.celebrator1_name && event.celebrator2_name) {
    return `${event.celebrator1_name} ו${event.celebrator2_name}`;
  }
  return event.celebrator1_name || event.celebrator2_name || event.event_name;
}

/**
 * Template: first_event_invitation
 * 
 * Body: חברים אהובים 💖
 * הגיע הזמן לחגוג!
 * אנחנו מתרגשים להזמין אתכם ל{{variable_1}} של {{variable_2}}.
 * האירוע יתקיים ביום {{variable_3}}, בתאריך {{variable_4}}, ב-{{variable_5}}.
 * קבלת פנים החל מהשעה {{variable_6}}.
 * 
 * Variables:
 * 1. Event type (חתונה, בר מצווה, etc.)
 * 2. Celebrators names
 * 3. Day of week
 * 4. Date (DD.MM.YYYY)
 * 5. Location/Venue
 * 6. Time
 */
function configureFirstEventInvitation(event, contact) {
  return {
    // No guestName needed for this template
    eventName: getEventTypeHebrew(event.event_type),              // Variable 1
    eventDate: getCelebratorsNames(event),                        // Variable 2
    eventLocation: getDayOfWeek(event.event_date),               // Variable 3
    customParams: [
      formatEventDate(event.event_date) || '',                   // Variable 4
      event.venue_name || event.location || '',                  // Variable 5
      event.event_time || ''                                     // Variable 6
    ].filter(Boolean)
  };
}

/**
 * Template: second_reminder
 * Add configuration when you create this template
 */
function configureSecondReminder(event, contact) {
  // TODO: Configure when template is ready
  return {
    eventName: event.event_name,
    eventDate: formatEventDate(event.event_date),
    eventLocation: event.location || event.venue_name || '',
    customParams: []
  };
}

/**
 * Template: thank_you_note
 * Add configuration when you create this template
 */
function configureThankYouNote(event, contact) {
  // TODO: Configure when template is ready
  return {
    guestName: contact.display_name || contact.canonical_form || 'אורח',
    eventName: event.event_name,
    customParams: []
  };
}

/**
 * Main configuration selector
 * Returns the appropriate template configuration based on template name
 * 
 * @param {string} templateName - Name of the WhatsApp template
 * @param {Object} event - Event data from database
 * @param {Object} contact - Contact data from database
 * @returns {Object} Template data configuration
 */
export function getTemplateConfiguration(templateName, event, contact) {
  const configurations = {
    'first_event_invitation': configureFirstEventInvitation,
    'second_reminder': configureSecondReminder,
    'thank_you_note': configureThankYouNote,
    'first_reminderr': configureSecondReminder, // Reuse same config
    'first_second_reminder': configureSecondReminder, // Reuse same config
    'event_directions': configureSecondReminder, // TODO: Create specific config
    'thank_you_note_2': configureThankYouNote, // Reuse same config
  };

  const configFunction = configurations[templateName];
  
  if (!configFunction) {
    console.warn(`⚠️  No configuration found for template: ${templateName}. Using default.`);
    // Default configuration
    return {
      eventName: event.event_name,
      eventDate: formatEventDate(event.event_date),
      eventLocation: event.location || event.venue_name || '',
      customParams: []
    };
  }

  return configFunction(event, contact);
}

/**
 * Check if a template requires an image header
 */
export function templateRequiresImage(templateName) {
  const templatesWithImages = [
    'first_event_invitation',
    'event_directions'
  ];
  
  return templatesWithImages.includes(templateName);
}

/**
 * Get all available template names
 */
export function getAvailableTemplates() {
  return [
    { name: 'first_event_invitation', description: 'הזמנה ראשונה לאירוע', hasImage: true },
    { name: 'second_reminder', description: 'תזכורת שנייה', hasImage: false },
    { name: 'first_reminderr', description: 'תזכורת ראשונה', hasImage: false },
    { name: 'thank_you_note', description: 'הודעת תודה', hasImage: false },
    { name: 'thank_you_note_2', description: 'הודעת תודה 2', hasImage: false },
    { name: 'event_directions', description: 'הוראות הגעה', hasImage: true },
  ];
}

