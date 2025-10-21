# Follow-Up Feature for "Maybe" Responses

## Overview

This feature implements a smart follow-up system for guests who respond with "אולי" (maybe) to event invitations. The system dynamically adjusts the follow-up options based on how close the event is.

## Business Logic

When a guest responds with "maybe", the system sends a follow-up message asking when they can be contacted again. The available options depend on the event proximity:

### Dynamic Button Display Rules

| Days Until Event | Buttons Shown |
|-----------------|---------------|
| > 17 days | **בעוד 3 ימים**, **בעוד שבוע**, **בעוד שבועיים** |
| 10-17 days | **בעוד 3 ימים**, **בעוד שבוע** |
| 7-9 days | **בעוד 3 ימים**, **בעוד 5 ימים** |
| 5-6 days | **בעוד 3 ימים** only |
| 4 days | **בעוד יומיים** only |
| 3 days | **בעוד יומיים**, **מחר** |
| 2 days | **מחר** (tomorrow) only |
| < 2 days | **No buttons** - Text message only |

### Special Cases Explained

#### 7-9 Days (5 Days Button)
When the event is 7-9 days away, showing "1 week" (7 days) would exceed the event date. Instead:
- **בעוד 3 ימים** (3 days) - Conservative follow-up
- **בעוד 5 ימים** (5 days) - Balanced option that still gives time before event

#### 4 Days (2 Days Button)
When event is 4 days away, we show only:
- **בעוד יומיים** (2 days) - Gives a final check-in opportunity

#### 3 Days (2 Days + Tomorrow Buttons)
When event is 3 days away, we show both options:
- **בעוד יומיים** (2 days) - Conservative check-in
- **מחר** (tomorrow) - More immediate follow-up option

#### 2 Days (Tomorrow Button)
When event is exactly 2 days away:
- **מחר** (tomorrow) - Last chance to follow up before event day

#### < 2 Days (No Buttons)
When event is less than 2 days away (tomorrow, today, or past):
- **Text message only** - Personalized message with celebrator names
- Message: "האירוע ממש בפתח! 🎊\n\nמשמחים לראות שאתם שוקלים להגיע!\n\nאם אתם יכולים להגיע - נא ליצור קשר ישירות עם [celebrator names] כדי לעדכן.\n\nמצפים לראותכם! 💙"

## Implementation Details

### Files Created/Modified

#### 1. `followUpButtonsHelper.js` (NEW)
Utility functions for calculating event proximity and determining which buttons to show.

**Key Functions:**
- `getFollowUpButtons(eventDate)` - Returns dynamic button array based on event date
- `calculateFollowupDate(buttonPayload)` - Calculates actual follow-up date
- `getFollowupDisplayText(buttonPayload)` - Gets Hebrew display text

#### 2. `whatsappMessenger.js` (MODIFIED)
Updated `sendMaybeConfirmation()` to accept event date and send dynamic buttons.

**Changes:**
- Added `eventDate` parameter
- Imports `getFollowUpButtons` helper
- Dynamically generates buttons based on event proximity
- Logs which buttons are being shown

#### 3. `messageProcessor.js` (MODIFIED)
Updated to fetch event date and handle all button payloads.

**Changes:**
- Added import for `calculateFollowupDate` and `getFollowupDisplayText`
- Fetches event date from database before sending maybe confirmation
- Updated followup button handler to use helper functions
- Now handles `followup_5days` payload (special case)

#### 4. `addFollowupDateColumn.js` (NEW - Migration)
Database migration to add `followup_date` column if it doesn't exist.

**Usage:**
```bash
node Vix_Server/Services/database/migrations/addFollowupDateColumn.js
```

## Database Schema

### `event_messages` Table
Added column:
```sql
followup_date DATE  -- Date when we should follow up with contact
```

This stores the calculated date when the system should re-contact the guest.

## User Flow

1. **Guest receives invitation** via WhatsApp
2. **Guest clicks "אולי" (Maybe)** button
3. **System calculates days until event**
4. **System sends follow-up message** with appropriate buttons:
   - Message: "בסדר גמור! 😊\n\nמתי נוכל לבדוק איתך שוב?"
5. **Guest selects timeframe** (3 days / 5 days / 1 week / 2 weeks)
6. **System stores followup_date** in database
7. **System sends confirmation**: "תודה! נחזור אליך [timeframe] ✅"

## Example Scenarios

### Scenario 1: Event in 20 days
```
Guest clicks "אולי"
→ System shows: [בעוד 3 ימים] [בעוד שבוע] [בעוד שבועיים]
Guest clicks "בעוד שבוע"
→ followup_date = today + 7 days
→ Response: "תודה! נחזור אליך בעוד שבוע ✅"
```

### Scenario 2: Event in 8 days (5-Day Button)
```
Guest clicks "אולי"
→ System shows: [בעוד 3 ימים] [בעוד 5 ימים]
Guest clicks "בעוד 5 ימים"
→ followup_date = today + 5 days
→ Response: "תודה! נחזור אליך בעוד 5 ימים ✅"
```

### Scenario 3: Event in 5 days (3-Day Button Only)
```
Guest clicks "אולי"
→ System shows: [בעוד 3 ימים]
Guest clicks "בעוד 3 ימים"
→ followup_date = today + 3 days
→ Response: "תודה! נחזור אליך בעוד 3 ימים ✅"
```

### Scenario 4: Event in 3 days (2-Day + Tomorrow Buttons)
```
Guest clicks "אולי"
→ System shows: [בעוד יומיים] [מחר]
Guest can choose either:
  Option A - clicks "בעוד יומיים"
  → followup_date = today + 2 days
  → Response: "תודה! נחזור אליך בעוד יומיים ✅"
  
  Option B - clicks "מחר"
  → followup_date = tomorrow
  → Response: "תודה! נחזור אליך מחר ✅"
```

### Scenario 5: Event in 2 days (Tomorrow Button)
```
Guest clicks "אולי"
→ System shows: [מחר]
Guest clicks "מחר"
→ followup_date = tomorrow
→ Response: "תודה! נחזור אליך מחר ✅"
```

### Scenario 6: Event Tomorrow or Today (No Buttons)
```
Guest clicks "אולי"
→ System sends text message:
"האירוע ממש בפתח! 🎊

משמחים לראות שאתם שוקלים להגיע!

אם אתם יכולים להגיע - נא ליצור קשר ישירות עם [דוד ומיכל] כדי לעדכן.

מצפים לראותכם! 💙"

→ No follow-up date stored (event is too close)
```

## Testing

To test the implementation:

1. **Create test events** with different dates:
   - Event 1: 20 days away
   - Event 2: 12 days away
   - Event 3: 8 days away
   - Event 4: 5 days away

2. **Send invitations** via Dialog360

3. **Respond with "אולי"** to each invitation

4. **Verify correct buttons** are shown for each event

5. **Click different buttons** and verify:
   - Correct `followup_date` stored in database
   - Correct confirmation message sent

## Monitoring & Logs

The system logs extensive information for debugging:

```javascript
// Event proximity calculation
📅 Days until event: 12

// Button selection
✅ Event is 10-14 days away - showing 3 days and 1 week buttons

// Follow-up confirmation
📅 Follow-up button clicked: followup_3days
✅ Follow-up date set for contact 123: 2025-10-22
✅ Follow-up confirmation sent to 972544349661
```

## Future Enhancements

Possible improvements:
1. **Automated follow-ups**: System automatically sends reminder on `followup_date`
2. **Follow-up escalation**: If guest doesn't respond, send additional reminders
3. **Analytics**: Track which follow-up timeframes are most popular
4. **Custom timeframes**: Allow users to set custom follow-up intervals

## Security Considerations

- Event date validation prevents SQL injection
- Phone number normalization handles various formats
- Database transactions ensure data consistency
- Error handling prevents system crashes

## Performance

- Minimal database queries (1 extra query for event date)
- No impact on existing invitation flow
- Button generation is O(1) complexity
- Scales to any number of concurrent responses

---

**Author**: AI Assistant  
**Date**: October 2025  
**Version**: 1.0

