import fetch from "node-fetch";
import path from "path";
import { config } from "dotenv";
import crypto from "crypto";

// Force load .env.local from project root
config({ path: path.resolve(process.cwd(), ".env.local") });

//get Mailchimp data center from API key (e.g. "us21")
const getDataCenter = (apiKey) => apiKey.split("-")[1];

export default async function handler(req, res) {
  // Eventbrite sends POST requests
  if (req.method !== "POST") {
    return res.status(405).json({ error: "Method Not Allowed" });
  }

  try {
    //Verify the request came from Eventbrite
    const token = req.headers["x-eventbrite-verification-token"];
    if (token !== process.env.EVENTBRITE_VERIFICATION_TOKEN) {
      return res.status(401).json({ error: "Invalid verification token" });
    }
    // --- Parse request body safely (supports both parsed & raw streams) ---
    let body;
    try {
      if (req.body && typeof req.body === "object") {
        body = req.body;
      } else {
        let rawBody = "";
        for await (const chunk of req) rawBody += chunk;
        body = rawBody ? JSON.parse(rawBody) : {};
      }
    } catch (err) {
      console.error("Invalid JSON:", err);
      return res.status(400).json({ error: "Invalid JSON" });
    }

    console.log("Parsed body:", JSON.stringify(body, null, 2));

    const attendee = body?.attendee;

    const email = attendee?.email || attendee?.profile?.email || body?.email;

    const firstName =
      attendee?.first_name || attendee?.profile?.first_name || "";

    const lastName = attendee?.last_name || attendee?.profile?.last_name || "";

    if (!email) {
      return res.status(400).json({ error: "No email provided" });
    }

    //Mailchimp setup
    const MAILCHIMP_API_KEY = process.env.MAILCHIMP_API_KEY;
    const MAILCHIMP_AUDIENCE_ID = process.env.MAILCHIMP_AUDIENCE_ID;
    const DATACENTER = getDataCenter(MAILCHIMP_API_KEY);

    // Mailchimp subscriber endpoint (PUT ensures idempotent update)
    const subscriberHash = crypto
      .createHash("md5")
      .update(email.toLowerCase())
      .digest("hex");

    const url = `https://${DATACENTER}.api.mailchimp.com/3.0/lists/${MAILCHIMP_AUDIENCE_ID}/members/${subscriberHash}`;

    //Send or update subscriber
    const mcResponse = await fetch(url, {
      method: "PUT",
      headers: {
        Authorization: `apikey ${MAILCHIMP_API_KEY}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        email_address: email,
        status_if_new: "subscribed",
        merge_fields: {
          FNAME: firstName,
          LNAME: lastName,
        },
      }),
    });

    const data = await mcResponse.json();

    if (!mcResponse.ok) {
      console.error("Mailchimp error:", data);
      return res
        .status(500)
        .json({ error: data.detail || "Mailchimp API error" });
    }

    return res.status(200).json({ success: true, mailchimp_id: data.id });
  } catch (error) {
    console.error("Webhook error:", error);
    return res.status(500).json({ error: error.message });
  }
}
