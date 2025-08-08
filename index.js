import express from "express";
import multer from "multer";
import cors from "cors";
import pool from "./db/db.js";
import jwt from "jsonwebtoken";
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

const port = 4000
const app = express();
const upload = multer({ dest: "uploads/" });

// Simple request logging
app.use((req, res, next) => {
  console.log(`${new Date().toISOString()} - ${req.method} ${req.path}`);
  next();
});

app.use(cors({
  origin: function (origin, callback) {
    // Allow requests with no origin (like mobile apps or curl requests)
    if (!origin) return callback(null, true);
    
    const allowedOrigins = [
      process.env.BASE_URL,
      process.env.PRODUCTION_URL,
      'https://vix-zeta.vercel.app',
      'http://localhost:3000' // for development
    ].filter(Boolean); // Remove undefined values
    
    console.log('CORS check - Origin:', origin, 'Allowed origins:', allowedOrigins);
    
    if (allowedOrigins.indexOf(origin) !== -1) {
      callback(null, true);
    } else {
      console.log('Blocked origin:', origin);
      callback(new Error('Not allowed by CORS'));
    }
  },
  methods: ["GET", "POST", 'PUT', 'PATCH', 'DELETE'],
  credentials: true
}));
app.use(express.json({ limit: "10mb" }));  // Increase JSON payload size
app.use(express.urlencoded({ limit: "10mb", extended: true })); 
app.use(cookieParser()); // Add cookie-parser middleware

// Health check endpoint
app.get('/health', async (req, res) => {
  try {
    const client = await pool.connect();
    await client.query('SELECT 1');
    client.release();
    res.json({ status: 'healthy', timestamp: new Date().toISOString() });
  } catch (error) {
    console.error('Health check failed:', error);
    res.status(500).json({ status: 'unhealthy', error: error.message });
  }
});

// JWT verification endpoint
app.get('/api/verify-jwt', (req, res) => {
  console.log('=== JWT VERIFICATION REQUEST ===');
  console.log('Cookies:', req.cookies);
  
  const jwtToken = req.cookies?.jwtToken;
  
  if (!jwtToken) {
    console.log('No JWT token found in cookies');
    return res.status(401).json({ message: "No token provided" });
  }
  
  try {
    console.log('Verifying JWT token...');
    const decoded = jwt.verify(jwtToken, process.env.JWT_SECRET);
    console.log('JWT verified successfully:', decoded);
    res.json({ user: decoded });
  } catch (error) {
    console.error('JWT verification failed:', error);
    res.status(401).json({ message: "Invalid token" });
  }
});

// Simple test endpoint (no database)
app.get('/test', (req, res) => {
  console.log('=== TEST ENDPOINT (GET) ===');
  res.json({ message: 'Test endpoint working', timestamp: new Date().toISOString() });
});

app.post('/test', (req, res) => {
  console.log('=== TEST ENDPOINT (POST) ===');
  console.log('Request body:', req.body);
  res.json({ message: 'Test endpoint working', timestamp: new Date().toISOString() });
});

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