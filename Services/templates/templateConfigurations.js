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
 * Get celebrator obligation word (חייב/חייבים) based on number of celebrators
 */
function getCelebratorObligation(event) {
  // Check if there are multiple celebrators
  const hasMultipleCelebrators = event.celebrator1_name && event.celebrator2_name;
  
  if (hasMultipleCelebrators) {
    return 'חייבים'; // plural - "must" for multiple celebrators
  }
  
  return 'חייב'; // singular - "must" for single celebrator
}

/**
 * Template: event_invitation
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
  // Debug logging - check what data we receive from DB
  console.log('🔍 EVENT DATA FROM DB:', {
    event_type: event.event_type,
    celebrator1_name: event.celebrator1_name,
    celebrator2_name: event.celebrator2_name,
    event_date: event.event_date,
    venue_name: event.venue_name,
    location: event.location,
    event_time: event.event_time
  });

  const eventType = getEventTypeHebrew(event.event_type);              // Variable 1
  const celebratorsNames = getCelebratorsNames(event);                 // Variable 2
  const dayOfWeek = getDayOfWeek(event.event_date);                   // Variable 3
  const customParamsRaw = [
    formatEventDate(event.event_date) || '',                          // Variable 4
    event.venue_name || event.location || '',                         // Variable 5
    event.event_time || ''                                            // Variable 6
  ];
  const customParamsFiltered = customParamsRaw.filter(Boolean);

  console.log('🔍 CONFIGURED VALUES:', {
    eventType,
    celebratorsNames,
    dayOfWeek,
    customParamsRaw,
    customParamsFiltered,
    '⚠️ Parameters removed by filter': customParamsRaw.length - customParamsFiltered.length
  });

  return {
    eventName: eventType,        // Variable 1: Event type
    eventDate: celebratorsNames, // Variable 2: Celebrators names
    eventLocation: dayOfWeek,    // Variable 3: Day of week
    customParams: customParamsFiltered
  };
}

/**
 * Template: invitation_followup (Followup Invitation)
 * 
 * This template is used for followup invitations to contacts who responded "maybe"
 * and need a reminder about the event.
 * 
 * Body: שלום {{guest_name}} 👋
 * רצינו לזכור לך על ה{{variable_1}} של {{variable_2}}.
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
function configureInvitationFollowup(event, contact) {
  return {
    guestName: contact.display_name || contact.canonical_form || 'אורח',
    eventName: getEventTypeHebrew(event.event_type),              // Variable 1: Event type
    eventDate: getCelebratorsNames(event),                        // Variable 2: Celebrators names
    eventLocation: getDayOfWeek(event.event_date),                // Variable 3: Day of week
    customParams: [
      formatEventDate(event.event_date) || '',                   // Variable 4: Date
      event.venue_name || event.location || '',                  // Variable 5: Location
      event.event_time || ''                                     // Variable 6: Time
    ].filter(Boolean)
  };
}

/**
 * Template: reminder_1
 * 
 * Body: היי! 👋
 * עוד רגע זה קורה 🎊
 * ה{{variable_1}} של {{variable_2}} כבר בפתח - ביום {{variable_3}}, בתאריך {{variable_4}}, ב{{variable_5}}.
 * קבלת פנים מתחילה בשעה {{variable_6}}.
 * אם עדיין לא אישרתם הגעה – נשמח שתעדכנו 😊
 * הנוכחות שלכם חשובה לנו מאוד 💖
 * 
 * Variables:
 * 1. Event type (חתונה, בר מצווה, etc.)
 * 2. Celebrators names
 * 3. Day of week
 * 4. Date (DD.MM.YYYY)
 * 5. Location/Venue
 * 6. Time
 */
function configureReminder1(event, contact) {
  return {
    guestName: contact.display_name || contact.canonical_form || 'אורח',
    eventName: getEventTypeHebrew(event.event_type),              // Variable 1: Event type
    eventDate: getCelebratorsNames(event),                        // Variable 2: Celebrators names
    eventLocation: getDayOfWeek(event.event_date),                // Variable 3: Day of week
    customParams: [
      formatEventDate(event.event_date) || '',                   // Variable 4: Date
      event.venue_name || event.location || '',                  // Variable 5: Location
      event.event_time || ''                                     // Variable 6: Time
    ].filter(Boolean)
  };
}

/**
 * Template: reminder_2
 * 
 * Body: היי חברים! 😄
 * שמעתם כבר? ה{{variable_1}} של {{variable_2}} ממש מעבר לפינה 🎉
 * אם עוד לא הספקתם לאשר הגעה - זה הזמן!
 * יום {{variable_3}}, {{variable_4}}, ב-{{variable_5}}.
 * קבלת הפנים מתחילה בשעה {{variable_6}}.
 * אנחנו מתכוננים לערב מדהים ורוצים לדעת אם נרקוד יחד 😉
 * 
 * Variables:
 * 1. Event type (חתונה, בר מצווה, etc.)
 * 2. Celebrators names
 * 3. Day of week
 * 4. Date (DD.MM.YYYY)
 * 5. Location/Venue
 * 6. Time
 */
function configureReminder2(event, contact) {
  return {
    guestName: contact.display_name || contact.canonical_form || 'אורח',
    eventName: getEventTypeHebrew(event.event_type),              // Variable 1: Event type
    eventDate: getCelebratorsNames(event),                        // Variable 2: Celebrators names
    eventLocation: getDayOfWeek(event.event_date),                // Variable 3: Day of week
    customParams: [
      formatEventDate(event.event_date) || '',                   // Variable 4: Date
      event.venue_name || event.location || '',                  // Variable 5: Location
      event.event_time || ''                                     // Variable 6: Time
    ].filter(Boolean)
  };
}

/**
 * Template: reminder_3
 * 
 * Body: הלו! 📣
 * זה אנחנו שוב 😆
 * {{variable_1}} {{variable_2}} רוצים לדעת אם אתם באים ל{{variable_3}} ביום {{variable_4}}, בתאריך {{variable_5}}, ב-{{variable_6}}.
 * האירוע מתחיל בשעה {{variable_7}}.
 * תענו לנו כבר יא אלופים – שנדע אם לשמור לכם מקום! 😜
 * 
 * Variables:
 * 1. Celebrators names
 * 2. Obligation word (חייב/חייבים) - based on number of celebrators
 * 3. Event type (חתונה, בר מצווה, etc.)
 * 4. Day of week
 * 5. Date (DD.MM.YYYY)
 * 6. Location/Venue
 * 7. Time
 */
function configureReminder3(event, contact) {
  return {
    guestName: contact.display_name || contact.canonical_form || 'אורח',
    eventName: getCelebratorsNames(event),                        // Variable 1: Celebrators names
    eventDate: getCelebratorObligation(event),                    // Variable 2: Obligation word (חייב/חייבים)
    eventLocation: getEventTypeHebrew(event.event_type),          // Variable 3: Event type
    customParams: [
      getDayOfWeek(event.event_date) || '',                      // Variable 4: Day of week
      formatEventDate(event.event_date) || '',                   // Variable 5: Date
      event.venue_name || event.location || '',                  // Variable 6: Location
      event.event_time || ''                                     // Variable 7: Time
    ].filter(Boolean)
  };
}

/**
 * Template: second_reminder (Legacy - kept for backward compatibility)
 */
function configureSecondReminder(event, contact) {
  return configureInvitationFollowup(event, contact); // Reuse same config
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
    'event_invitation': configureFirstEventInvitation,
    'reminder_1': configureReminder1, // First reminder
    'reminder_2': configureReminder2, // Second reminder
    'reminder_3': configureReminder3, // Third reminder (and any additional rounds)
    'invitation_followup': configureInvitationFollowup,
    'thank_you_note': configureThankYouNote,
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
    'event_invitation',
    'invitation_followup',
    'reminder_1',
    'reminder_2', 
    'reminder_3',
    'event_directions'
  ];
  
  return templatesWithImages.includes(templateName);
}
