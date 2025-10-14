# WhatsApp Invitation Debugging Guide

## Common Errors & Solutions

### 1. **Missing D360_API_KEY**
**Error:** `D360_API_KEY not configured`
**Solution:** Add your Dialog360 API key to `.env`:
```
D360_API_KEY=your_api_key_here
```

### 2. **Event Not Found**
**Error:** `Event not found`
**Cause:** Invalid eventId or event doesn't exist
**Solution:** Verify the event ID exists in database

### 3. **Unauthorized - Event Ownership**
**Error:** `Unauthorized: Event does not belong to this user`
**Cause:** The event's `owner_email` doesn't match the `userEmail` sent
**Solution:** Ensure logged-in user owns the event

### 4. **No Contacts Found**
**Error:** `No contacts found or contacts do not belong to this user`
**Cause:** 
- Contacts don't exist
- Contacts' `user_email` doesn't match the request `userEmail`
**Solution:** Verify contacts exist and belong to the user

### 5. **Some Contacts Don't Belong to User**
**Error:** `Some contacts do not belong to this user`
**Cause:** One or more contactIds don't belong to the user
**Solution:** Ensure all selected contacts belong to the logged-in user

### 6. **Dialog360 API Error**
**Error:** Varies (from Dialog360)
**Causes:**
- Invalid phone number format
- Template not approved in Dialog360
- Rate limiting
- Invalid template parameters
**Solution:** Check Dialog360 dashboard and logs

## Data Flow

```
Frontend (sendWhatsAppInvitations.js)
    ↓ (sends: eventId, contactIds, userEmail, templateName)
Backend Validation (dialog360SendTemplate.js)
    ↓ Validates: event exists, event ownership, contacts ownership
    ↓ Fetches: event data, contacts data
    ↓ (sends to Dialog360: phoneNumber, template, imageUrl, etc.)
Dialog360 API
    ↓ Sends WhatsApp messages
    ↓ Returns: success/failure per message
Backend Response
    ↓ Returns: { success, results: { sent, failed, total } }
Frontend
```

## Debug Steps

1. **Check browser console** for detailed error logs
2. **Check server console** for backend errors
3. **Verify data:**
   - Event ID is valid
   - User email matches event owner
   - Contacts belong to user
   - Phone numbers are in correct format (e.g., "972501234567")
   - Note: image_url is OPTIONAL (some templates don't need images)
4. **Check Dialog360 dashboard** for template status
5. **Verify environment variables** (.env file)

## Phone Number Format

Dialog360 expects phone numbers:
- **WITH** country code
- **WITHOUT** '+' symbol
- Example: `972544349661` (Israel)
- NOT: `+972544349661` or `0544349661`

### Auto-Normalization

The backend now automatically normalizes phone numbers:
- Removes `+` prefix
- Converts Israeli local format (`0544349661`) to international (`972544349661`)
- Removes spaces, dashes, parentheses
- Uses `canonical_form` if available, otherwise normalizes `phone_number`

**Examples:**
- `0544349661` → `972544349661` ✅
- `+972544349661` → `972544349661` ✅
- `972544349661` → `972544349661` ✅
- `054-434-9661` → `972544349661` ✅

