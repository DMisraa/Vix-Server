import express from "express";
import multer from "multer";
import cors from "cors";

import sendEmail from "./Services/email.js";
import { extractExcelData } from "./Services/extractExcelContacts.js";
import { sendContactsToDatabase } from "./Services/sendContactsToDatabase.js";
import { googleAuth } from "./Services/googleAuth.js";
import { signup } from "./Services/signup.js";
import { login } from "./Services/login.js";
import { getContactsByOwner } from "./Services/getContactsByOwner.js";

const port = 4000
const app = express();
const upload = multer({ dest: "uploads/" });

app.use(cors({
  origin: [ process.env.BASE_URL, process.env.PRODUCTION_URL ],
  methods: ["GET", "POST", 'PUT', 'PATCH'],
  credentials: true
}));
app.use(express.json({ limit: "10mb" }));  // Increase JSON payload size
app.use(express.urlencoded({ limit: "10mb", extended: true })); 

app.get("/", (req, res) => {
    res.send("Hello, Node.js!");
  });

app.post("/api/upload", upload.single("file"), extractExcelData);

app.post("/api/auth/google", googleAuth)

app.post("/api/contacts", sendContactsToDatabase)

app.post("/contacts/by-owner", getContactsByOwner)

app.post("/signup", signup)

app.post("/login", login)

app.post('/sendEmail', sendEmail)

app.listen(port, () => console.log(`Server running on port ${port}`));




