import express from "express";
import multer from "multer";
import cors from "cors";
import cookieParser from "cookie-parser";
import cron from "node-cron";

import sendEmail from "./Services/email.js";
import { extractExcelData } from "./Services/extractExcelContacts.js";
import { sendContactsToDatabase } from "./Services/database/sendContactsToDatabase.js";
import { googleAuth } from "./Services/googleAuth.js";
import { signup } from "./Services/signup.js";
import { login } from "./Services/login.js";
import { getContactsByOwner, getContactsByEventWithTags } from "./Services/database/getContactsByOwner.js";
import { sendInvitationResponse } from "./Services/database/sendInvitationResponse.js";
import { sendEventMessages } from "./Services/database/sendEventMessages.js";
import { createEvent } from "./Services/database/createEvent.js";
import { getUserEvents } from "./Services/database/getUserEvents.js";
import { deleteEvent } from "./Services/database/deleteEvent.js";
import { getEventResponseStats } from "./Services/database/getEventResponseStats.js";
import { getEventDetails } from "./Services/database/getEventDetails.js";
import { getEventById } from "./Services/database/getEventById.js";
import { addContactToEvent } from "./Services/database/addContactToEvent.js";
import { deleteContact } from "./Services/database/deleteContact.js";
import { deleteEventContact } from "./Services/database/deleteEventContact.js";
import { updateContact } from "./Services/database/updateContact.js";
import { updateEvent } from "./Services/database/updateEvent.js";
import { moveContactsEndpoint } from "./Services/database/moveContactsBetweenEvents.js";
import { uploadGuestContacts } from "./Services/database/uploadGuestContacts.js";
import { deleteGuestUpload } from "./Services/database/deleteGuestUpload.js";
import { getGuestUploads } from "./Services/database/getGuestUploads.js";
import { getGuestUploadContacts } from "./Services/database/getGuestUploadContacts.js";
import { getFollowupNotifications, dismissFollowupNotification } from "./Services/database/getFollowupNotifications.js";
import { handleContactForm } from "./Services/contactForm.js";
import { handleDialog360Webhook } from "./Services/dialog360/webhook.js";
import { handleSendTemplate } from "./Services/dialog360SendTemplate.js";
import { processFollowupInvitations, triggerFollowupInvitations } from "./Services/followupInvitations.js";

// Import extracted endpoint functions
import { verifyJwt } from "./Services/auth/verifyJwt.js";
import { validateInvitation } from "./Services/auth/validateInvitation.js";
import { createInvitation } from "./Services/auth/createInvitation.js";
import { logout } from "./Services/auth/logout.js";
import { refreshToken } from "./Services/auth/refreshToken.js";
import { verifyEmail } from "./Services/auth/verifyEmail.js";
import { googleContacts } from "./Services/contacts/googleContacts.js";
import { googleContactsFetch } from "./Services/contacts/googleContactsFetch.js";
import { excelContacts } from "./Services/contacts/excelContacts.js";
import { appleContacts } from "./Services/contacts/appleContacts.js";
import { healthCheck } from "./Services/health.js";
import { updateContactTags, getUserTags, getContactsByTag, addTagsColumnToContacts, updateTagName, removeTag } from "./Services/database/addTagsToContacts.js";

const port = 4000
const app = express();
const upload = multer({ storage: multer.memoryStorage() });

// Simple request logging
app.use((req, res, next) => {;
  console.log(`${new Date().toISOString()} - ${req.method} ${req.path}`)
  next();
});

// CORS configuration - skip for webhooks
app.use((req, res, next) => {
  // Skip CORS for Dialog 360 webhook endpoint
  if (req.path === '/api/dialog360/webhook') {
    return next();
  }
  
  cors({
    origin: function (origin, callback) {
      // Allow requests with no origin (like mobile apps or curl requests)
      if (!origin) return callback(null, true);
      
      const allowedOrigins = [
        process.env.BASE_URL, 
        process.env.PRODUCTION_URL,
        'https://romaine-coseys-contagiously.ngrok-free.dev' // ngrok development URL
      ];
      if (allowedOrigins.indexOf(origin) !== -1) {
        callback(null, true);
      } else {
        console.log('CORS blocked origin:', origin);
        callback(new Error('Not allowed by CORS'));
      }
    },
    methods: ["GET", "POST", 'PUT', 'PATCH', 'DELETE'],
    credentials: true,
    allowedHeaders: ['Content-Type', 'Authorization', 'Cookie'],
    exposedHeaders: ['Set-Cookie']
  })(req, res, next);
});
app.use(express.json({ limit: "10mb" }));  // Increase JSON payload size
app.use(express.urlencoded({ limit: "10mb", extended: true })); 
app.use(cookieParser()); // Add cookie-parser middleware

// Middleware to handle cross-origin cookie issues
app.use((req, res, next) => {
  // Add headers that help with cross-origin cookie handling
  res.setHeader('Access-Control-Allow-Credentials', 'true');
  
  // Set proper origin header for cross-origin requests
  const origin = req.get('Origin');
  if (origin) {
    const allowedOrigins = [
      process.env.BASE_URL, 
      process.env.PRODUCTION_URL,
      'https://romaine-coseys-contagiously.ngrok-free.dev' // ngrok development URL
    ];
    if (allowedOrigins.includes(origin)) {
      res.setHeader('Access-Control-Allow-Origin', origin);
    }
  }
  
  next();
});

// Health check endpoint
app.get('/health', healthCheck);

// JWT verification endpoint
app.get('/api/verify-jwt', verifyJwt);

// Refresh token endpoint
app.post('/api/refresh-token', refreshToken);

// Validate invitation endpoint
app.post('/api/validate-invitation', validateInvitation);

// Create invitation endpoint
app.post('/api/create-invitation', createInvitation);

// Google contacts endpoint
app.get('/api/google-contacts', googleContacts);

// Google contacts fetch endpoint
app.post('/api/google-contacts/fetch', googleContactsFetch);

// Excel contacts endpoint
app.post('/api/excel-contacts', upload.single('file'), excelContacts);

// Apple contacts endpoint
app.post('/api/apple-contacts', upload.single('file'), appleContacts);

// Logout endpoint
app.get('/api/logout', logout);

app.get('/api/user-events', getUserEvents)

app.get('/api/event-response-stats', getEventResponseStats)

app.get('/api/event-details/:eventId', getEventDetails);

app.get('/api/fetch-event/:eventId', getEventById);

app.post("/api/extract-excel", upload.single("file"), extractExcelData);

app.post("/api/auth/google", googleAuth)

app.post("/api/contacts", sendContactsToDatabase)

app.post("/contacts/by-owner", getContactsByOwner)
app.post("/contacts/by-event-with-tags", getContactsByEventWithTags)

app.post("/signup", signup)
app.post("/verify-email", verifyEmail)

app.post("/login", login)

app.post('/sendEmail', sendEmail)

app.post('/invitations/contacts', sendInvitationResponse) // delete soon dummy code

app.post('/api/event-invitation', sendEventMessages)

app.post('/api/create-event', createEvent)

app.put('/api/update-event', updateEvent);

app.post('/event-contacts', addContactToEvent);

app.post('/api/move-contacts', moveContactsEndpoint);

app.patch('/api/contacts/:id', updateContact);

app.delete('/api/delete-event', deleteEvent);
app.delete('/api/contacts/:id', deleteContact);
app.delete('/api/event-contacts', deleteEventContact);
app.delete('/api/guest-uploads/:uploadId', deleteGuestUpload);

// Guest contacts upload endpoint
app.post('/upload-guest-contacts', uploadGuestContacts);

// Guest uploads fetch endpoint
app.get('/api/guest-uploads', getGuestUploads);
app.get('/api/guest-uploads/:uploadId/contacts', getGuestUploadContacts);

// Followup notifications endpoints
app.get('/api/followup-notifications', getFollowupNotifications);
app.delete('/api/followup-notifications/:notificationId', dismissFollowupNotification);

// Debug endpoint for testing WhatsApp contact upload
app.post('/api/debug/whatsapp-test', async (req, res) => {
  try {
    const { message, senderNumber } = req.body;
    console.log('🧪 Debug WhatsApp Test:', { message, senderNumber });
    
    // Import the function directly
    const { handleWhatsAppContactUpload } = await import('./Services/dialog360/messageProcessor.js');
    const result = await handleWhatsAppContactUpload(message, senderNumber);
    
    res.json({ success: true, result });
  } catch (error) {
    console.error('Debug test error:', error);
    res.status(500).json({ success: false, error: error.message });
  }
});

// Tag management endpoints
app.post('/api/contacts/update-tags', updateContactTags);
app.post('/api/contacts/update-tag-name', updateTagName);
app.post('/api/contacts/remove-tag', removeTag);
app.post('/api/contacts/tags', getUserTags);
app.post('/api/contacts/by-tag', getContactsByTag);

// Contact form endpoint
app.options('/api/contact-form', (req, res) => {
  res.header('Access-Control-Allow-Origin', '*');
  res.header('Access-Control-Allow-Methods', 'POST, OPTIONS');
  res.header('Access-Control-Allow-Headers', 'Content-Type');
  res.sendStatus(200);
});

app.post('/api/contact-form', (req, res, next) => {
  console.log('Contact form endpoint registered and hit!');
  handleContactForm(req, res, next);
});

// Dialog 360 webhook endpoint
app.post('/api/dialog360/webhook', handleDialog360Webhook);

// Dialog 360 send template message endpoint
app.post('/api/dialog360/send-template', handleSendTemplate);

// Followup invitations endpoint (for manual testing)
app.post('/api/followup-invitations/trigger', triggerFollowupInvitations);

// Setup cron job for followup invitations
// Runs daily at 10:00 AM to send followup invitations
cron.schedule('0 10 * * *', async () => {
  console.log('🕙 Cron job triggered: Processing followup invitations...');
  try {
    const result = await processFollowupInvitations();
    console.log('✅ Cron job completed:', result);
  } catch (error) {
    console.error('❌ Cron job failed:', error);
  }
}, {
  scheduled: true,
  timezone: "Asia/Jerusalem" // Israeli timezone
});


app.listen(port, () => console.log(`Server running on port ${port}`));