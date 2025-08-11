import express from "express";
import multer from "multer";
import cors from "cors";
import cookieParser from "cookie-parser";

import sendEmail from "./Services/email.js";
import { extractExcelData } from "./Services/extractExcelContacts.js";
import { sendContactsToDatabase } from "./Services/database/sendContactsToDatabase.js";
import { googleAuth } from "./Services/googleAuth.js";
import { signup } from "./Services/signup.js";
import { login } from "./Services/login.js";
import { getContactsByOwner } from "./Services/database/getContactsByOwner.js";
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

// Import extracted endpoint functions
import { verifyJwt } from "./Services/auth/verifyJwt.js";
import { validateInvitation } from "./Services/auth/validateInvitation.js";
import { createInvitation } from "./Services/auth/createInvitation.js";
import { logout } from "./Services/auth/logout.js";
import { googleContacts } from "./Services/contacts/googleContacts.js";
import { googleContactsFetch } from "./Services/contacts/googleContactsFetch.js";
import { excelContacts } from "./Services/contacts/excelContacts.js";
import { appleContacts } from "./Services/contacts/appleContacts.js";
import { healthCheck } from "./Services/health.js";

const port = 4000
const app = express();
const upload = multer({ storage: multer.memoryStorage() });

// Simple request logging
app.use((req, res, next) => {
  console.log(`${new Date().toISOString()} - ${req.method} ${req.path}`);
  next();
});

app.use(cors({
  origin: function (origin, callback) {
    // Allow requests with no origin (like mobile apps or curl requests)
    if (!origin) return callback(null, true);
    
    // Allow localhost for development
    if (origin.includes('localhost') || origin.includes('127.0.0.1')) {
      return callback(null, true);
    }
    
    // Allow all Vercel domains
    if (origin.includes('vercel.app')) {
      return callback(null, true);
    }
    
    // Allow specific production URLs
    const allowedOrigins = [process.env.BASE_URL, process.env.PRODUCTION_URL];
    if (allowedOrigins.includes(origin)) {
      return callback(null, true);
    }
    
    console.log('CORS blocked origin:', origin);
    callback(new Error('Not allowed by CORS'));
  },
  methods: ["GET", "POST", 'PUT', 'PATCH', 'DELETE', 'OPTIONS'],
  credentials: true,
  allowedHeaders: ['Content-Type', 'Authorization', 'Cookie'],
  exposedHeaders: ['Set-Cookie']
}));
app.use(express.json({ limit: "10mb" }));  // Increase JSON payload size
app.use(express.urlencoded({ limit: "10mb", extended: true })); 
app.use(cookieParser()); // Add cookie-parser middleware

// Middleware to handle mobile browser cookie issues
app.use((req, res, next) => {
  const userAgent = req.get('User-Agent') || '';
  const isMobile = /Android|webOS|iPhone|iPad|iPod|BlackBerry|IEMobile|Opera Mini/i.test(userAgent);
  
  if (isMobile) {
    // Add headers that help with mobile browser cookie handling
    res.setHeader('Access-Control-Allow-Credentials', 'true');
    res.setHeader('Access-Control-Allow-Origin', req.get('Origin') || process.env.PRODUCTION_URL);
  }
  
  next();
});

// Health check endpoint
app.get('/health', healthCheck);

// JWT verification endpoint
app.get('/api/verify-jwt', verifyJwt);

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

app.post("/signup", signup)

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

app.listen(port, () => console.log(`Server running on port ${port}`));