/**
 * Follow-up Buttons Helper
 * 
 * Calculates days until event and determines which follow-up buttons to show
 * when a guest responds with "maybe" to an invitation
 * 
 * BUSINESS LOGIC:
 * - If event is far away (>14 days): Show all 3 buttons (3 days, 1 week, 2 weeks)
 * - If event is 10-14 days away: Show 3 days and 1 week buttons
 * - If event is 7-9 days away: Show 3 days and 5 days buttons (special case)
 * - If event is 4-6 days away: Show only 3 days button
 * - If event is <4 days away: Show only 3 days button
 */

/**
 * Calculate days between two dates
 * 
 * @param {Date|string} date1 - First date
 * @param {Date|string} date2 - Second date
 * @returns {number} Number of days between dates
 */
function calculateDaysBetween(date1, date2) {
  const d1 = typeof date1 === 'string' ? new Date(date1) : date1;
  const d2 = typeof date2 === 'string' ? new Date(date2) : date2;
  
  // Calculate difference in milliseconds
  const diffTime = d2.getTime() - d1.getTime();
  
  // Convert to days (rounding to handle timezone issues)
  const diffDays = Math.ceil(diffTime / (1000 * 60 * 60 * 24));
  
  return diffDays;
}

/**
 * Determine which follow-up buttons to show based on event proximity
 * 
 * @param {string|Date} eventDate - Event date
 * @returns {Array} Array of button configurations
 */
export function getFollowUpButtons(eventDate) {
  if (!eventDate) {
    console.warn('No event date provided, using default buttons');
    return getDefaultButtons();
  }
  
  const today = new Date();
  today.setHours(0, 0, 0, 0); // Reset time to midnight for accurate day calculation
  
  const daysUntilEvent = calculateDaysBetween(today, eventDate);
  
  console.log(`📅 Days until event: ${daysUntilEvent}`);
  
  // More than 17 days away - show all 3 buttons
  if (daysUntilEvent > 17) {
    console.log('✅ Event is >14 days away - showing all 3 buttons');
    return [
      {
        type: 'reply',
        reply: {
          id: 'followup_3days',
          title: 'בעוד 3 ימים'
        }
      },
      {
        type: 'reply',
        reply: {
          id: 'followup_week',
          title: 'בעוד שבוע'
        }
      },
      {
        type: 'reply',
        reply: {
          id: 'followup_2weeks',
          title: 'בעוד שבועיים'
        }
      }
    ];
  }
  
  // 10-17 days away - show 3 days and 1 week
  if (daysUntilEvent >= 10 && daysUntilEvent <= 17) {
    console.log('✅ Event is 10-14 days away - showing 3 days and 1 week buttons');
    return [
      {
        type: 'reply',
        reply: {
          id: 'followup_3days',
          title: 'בעוד 3 ימים'
        }
      },
      {
        type: 'reply',
        reply: {
          id: 'followup_week',
          title: 'בעוד שבוע'
        }
      }
    ];
  }
  
  // 7-9 days away - special case: show 3 days and 5 days
  if (daysUntilEvent >= 7 && daysUntilEvent <= 9) {
    console.log('✅ Event is 7-9 days away - showing 3 days and 5 days buttons');
    return [
      {
        type: 'reply',
        reply: {
          id: 'followup_3days',
          title: 'בעוד 3 ימים'
        }
      },
      {
        type: 'reply',
        reply: {
          id: 'followup_5days',
          title: 'בעוד 5 ימים'
        }
      }
    ];
  }
  
  // 5-6 days away - show only 3 days button
  if (daysUntilEvent >= 5 && daysUntilEvent <= 6) {
    console.log('✅ Event is 5-6 days away - showing only 3 days button');
    return [
      {
        type: 'reply',
        reply: {
          id: 'followup_3days',
          title: 'בעוד 3 ימים'
        }
      }
    ];
  }
  
  // 4 days away - show 2 days button only
  if (daysUntilEvent === 4) {
    console.log('✅ Event is 4 days away - showing 2 days button');
    return [
      {
        type: 'reply',
        reply: {
          id: 'followup_2days',
          title: 'בעוד יומיים'
        }
      }
    ];
  }
  
  // 3 days away - show 2 days and tomorrow buttons
  if (daysUntilEvent === 3) {
    console.log('✅ Event is 3 days away - showing 2 days and tomorrow buttons');
    return [
      {
        type: 'reply',
        reply: {
          id: 'followup_2days',
          title: 'בעוד יומיים'
        }
      },
      {
        type: 'reply',
        reply: {
          id: 'followup_tomorrow',
          title: 'מחר'
        }
      }
    ];
  }
  
  // 2 days away - show tomorrow button
  if (daysUntilEvent === 2) {
    console.log('✅ Event is 2 days away - showing tomorrow button');
    return [
      {
        type: 'reply',
        reply: {
          id: 'followup_tomorrow',
          title: 'מחר'
        }
      }
    ];
  }
  
  // Less than 2 days (1 day, today, or passed) - return special indicator for message-only response
  console.warn('⚠️  Event is very close (< 2 days) - returning special indicator for message-only response');
  return 'too_close'; // Special return value to indicate message-only response
}

/**
 * Get default buttons (when event date is not available)
 * 
 * @returns {Array} Default button configurations
 */
function getDefaultButtons() {
  return [
    {
      type: 'reply',
      reply: {
        id: 'followup_3days',
        title: 'בעוד 3 ימים'
      }
    },
    {
      type: 'reply',
      reply: {
        id: 'followup_week',
        title: 'בעוד שבוע'
      }
    },
    {
      type: 'reply',
      reply: {
        id: 'followup_2weeks',
        title: 'בעוד שבועיים'
      }
    }
  ];
}

/**
 * Calculate the actual followup date based on button clicked
 * 
 * @param {string} buttonPayload - The button payload (e.g., 'followup_3days')
 * @returns {string} ISO date string for followup date
 */
export function calculateFollowupDate(buttonPayload) {
  const today = new Date();
  
  if (buttonPayload === 'followup_tomorrow') {
    today.setDate(today.getDate() + 1);
  } else if (buttonPayload === 'followup_2days') {
    today.setDate(today.getDate() + 2);
  } else if (buttonPayload === 'followup_3days') {
    today.setDate(today.getDate() + 3);
  } else if (buttonPayload === 'followup_5days') {
    today.setDate(today.getDate() + 5);
  } else if (buttonPayload === 'followup_week') {
    today.setDate(today.getDate() + 7);
  } else if (buttonPayload === 'followup_2weeks') {
    today.setDate(today.getDate() + 14);
  }
  
  return today.toISOString().split('T')[0];
}

/**
 * Get display text for followup button
 * 
 * @param {string} buttonPayload - The button payload
 * @returns {string} Hebrew display text
 */
export function getFollowupDisplayText(buttonPayload) {
  const textMap = {
    'followup_tomorrow': 'מחר',
    'followup_2days': 'בעוד יומיים',
    'followup_3days': 'בעוד 3 ימים',
    'followup_5days': 'בעוד 5 ימים',
    'followup_week': 'בעוד שבוע',
    'followup_2weeks': 'בעוד שבועיים'
  };
  
  return textMap[buttonPayload] || 'בעוד מספר ימים';
}

/**
 * Generate "event too close" message with celebrator names
 * 
 * @param {string|null} celebrator1Name - First celebrator name (e.g., groom, bar mitzvah boy)
 * @param {string|null} celebrator2Name - Second celebrator name (e.g., bride - optional)
 * @returns {string} Hebrew message for events that are very close (<2 days)
 */
export function getEventTooCloseMessage(celebrator1Name = null, celebrator2Name = null) {
  let celebratorText = '';
  
  if (celebrator1Name && celebrator2Name) {
    // Both celebrators (e.g., wedding)
    celebratorText = `${celebrator1Name} ו${celebrator2Name}`;
  } else if (celebrator1Name) {
    // Single celebrator
    celebratorText = celebrator1Name;
  } else {
    // No celebrator names available
    celebratorText = 'מארגני האירוע';
  }
  
  return `האירוע ממש בפתח! 🎊\n\nמשמחים לראות שאתם שוקלים להגיע!\n\nאם אתם יכולים להגיע - נא ליצור קשר ישירות עם ${celebratorText} כדי לעדכן.\n\nמצפים לראותכם! 💙`;
}


