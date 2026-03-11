require('dotenv').config();
const express = require('express');
const cors = require('cors');
const axios = require('axios');
const { GoogleGenAI } = require('@google/genai');

const app = express();
app.use(cors());
app.use(express.json());

const {
  VERIFY_TOKEN,
  WHATSAPP_PHONE_NUMBER_ID,
  WHATSAPP_ACCESS_TOKEN,
  GEMINI_API_KEY,
  PORT
} = process.env;

// Initialize Google Gemini AI directly with the API key from .env
const ai = new GoogleGenAI({ apiKey: GEMINI_API_KEY });

// System prompt to control the persona / knowledge of the bot
const BOT_PERSONA = `
You are a helpful and polite customer support agent for our business.
Answer the customer's questions clearly and concisely.
If they ask a question outside of standard business context, try to answer politely.
If you do not know the answer to a highly specific question, tell them a human agent will contact them soon.
Keep all responses under 2-3 short sentences if possible since it is WhatsApp.
`;

// Base route to check if the server is running
app.get('/', (req, res) => {
  res.send('WhatsApp Bot AI Server is running correctly! 🚀');
});

// Webhook verification for Meta
app.get('/webhook', (req, res) => {
  const mode = req.query['hub.mode'];
  const token = req.query['hub.verify_token'];
  const challenge = req.query['hub.challenge'];

  if (mode && token) {
    if (mode === 'subscribe' && token === VERIFY_TOKEN) {
      console.log('WEBHOOK_VERIFIED');
      res.status(200).send(challenge);
    } else {
      res.sendStatus(403);
    }
  } else {
    res.sendStatus(400);
  }
});

// Listen for Meta Webhooks (WhatsApp Messages)
app.post('/webhook', async (req, res) => {
  // Acknowledge receipt immediately as per Meta API requirements
  res.sendStatus(200);

  const body = req.body;

  try {
    if (body.object === 'whatsapp_business_account') {
      for (const entry of body.entry) {
        for (const change of entry.changes || []) {
          if (change.value && change.value.messages) {
            for (const msg of change.value.messages) {
              if (msg.type === 'text') {
                const userPhone = msg.from; 
                const incomingText = msg.text.body;

                console.log(`Received WhatsApp message from ${userPhone}: ${incomingText}`);

                // Generate AI Response using Gemini 2.5 Flash
                let replyText = "Sorry, I am having trouble processing your request right now.";
                try {
                  const response = await ai.models.generateContent({
                    model: 'gemini-2.5-flash',
                    contents: [
                      { role: 'user', parts: [{ text: `${BOT_PERSONA}\n\nCustomer: ${incomingText}` }] }
                    ],
                  });
                  if (response.text) {
                     replyText = response.text;
                  }
                } catch (aiError) {
                  console.error('Error with AI generation:', aiError);
                }

                // Send the auto-reply back to the user via Meta Cloud API
                await sendWhatsAppMessage(userPhone, replyText);
              }
            }
          }
        }
      }
    } 
  } catch (error) {
    console.error('Error processing webhook:', error);
  }
});

// Helper function to send WhatsApp API messages
async function sendWhatsAppMessage(toPhone, text) {
  const url = `https://graph.facebook.com/v19.0/${WHATSAPP_PHONE_NUMBER_ID}/messages`;
  
  const payload = {
    messaging_product: 'whatsapp',
    to: toPhone,
    type: 'text',
    text: { body: text }
  };

  const headers = {
    'Authorization': `Bearer ${WHATSAPP_ACCESS_TOKEN}`,
    'Content-Type': 'application/json'
  };

  try {
    await axios.post(url, payload, { headers });
    console.log(`WhatsApp AI message sent successfully completely autonomously!`);
  } catch (error) {
    console.error('Error sending WhatsApp message:', error.response ? JSON.stringify(error.response.data) : error.message);
  }
}

const port = PORT || 4000;
app.listen(port, () => {
  console.log(`AI WhatsApp Bot engine running on port ${port}`);
});
