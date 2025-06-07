import { MongoClient } from "mongodb";
import dotenv from "dotenv";

dotenv.config();
let client;

export async function connectToDatabase() {
  try {
     client = await MongoClient.connect(process.env.MONGO_URI);

  const db = client.db("userData");
  const userCollection = db.collection("loginData");
  return { userCollection, client };
  } catch (error) {
    console.error("Error fetching user data by ID:", error);
    throw error
  }
}

export async function connectToContactsDatabase() {
  try {
    client = await MongoClient.connect(process.env.MONGO_URI);

 const db = client.db("userData");
 const userCollection = db.collection("Contacts");
 return { userCollection, client };
 } catch (error) {
   console.error("Error fetching user data by ID:", error);
   throw error
 }
}

export async function connectToExcelDatabase() {
  try {
    client = await MongoClient.connect(process.env.MONGO_URI);

 const db = client.db("userData");
 const userCollection = db.collection("Excel_Contacts");
 return { userCollection, client };
 } catch (error) {
   console.error("Error fetching user data by ID:", error);
   throw error
 }
}

export async function updateDatabase(contacts) {
    const contactsArray = contacts
    const formattedContacts = contactsArray.map(contact => ({ contact }));
    try {
    const { gameCenterCollection, client } = await connectToDatabase();
  
    await gameCenterCollection.updateOne({ _id: 'ecent_contacts' }, { $set:  { contacts: contactsArray } }, { upsert: true });
    await client.close();
  } catch (error) {
    console.error(error);
  }
}


