import crypto from "crypto";
import getRawBody from "raw-body";
import OpenAI from "openai";

export const config = { api: { bodyParser: false } };

const LINE_CHANNEL_SECRET = process.env.LINE_CHANNEL_SECRET;
const LINE_CHANNEL_ACCESS_TOKEN = process.env.LINE_CHANNEL_ACCESS_TOKEN;
const OPENAI_API_KEY = process.env.OPENAI_API_KEY;

const openai = new OpenAI({ apiKey: OPENAI_API_KEY });

function verifyLineSignature(raw, signature, secret) {
  const hmac = crypto.createHmac("sha256", secret);
  hmac.update(raw);
  const expected = hmac.digest("base64");
  return signature === expected;
}

export default async function handler(req, res) {
  if (req.method !== "POST") return res.status(200).send("ok");

  const raw = await getRawBody(req);
  const signature = req.headers["x-line-signature"];
  if (!verifyLineSignature(raw, signature, LINE_CHANNEL_SECRET)) {
    return res.status(403).send("invalid signature");
  }

  const body = JSON.parse(raw.toString("utf8"));
  res.status(200).end();

  for (const event of body.events ?? []) {
    if (event.type === "message" && event.message?.type === "text") {
      const userText = event.message.text;

      let replyText;
      if (userText === "AI相談") {
        const r = await openai.chat.completions.create({
          model: "gpt-4o-mini",
          messages: [
            { role: "system", content: "You are a helpful Japanese assistant." },
            { role: "user", content: userText }
          ]
        });
        replyText = r.choices[0]?.message?.content ?? "すみません、応答できませんでした。";
      } else {
        replyText = "『AI相談』と送っていただければGPTがお答えします！";
      }

      await fetch("https://api.line.me/v2/bot/message/reply", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "Authorization": `Bearer ${LINE_CHANNEL_ACCESS_TOKEN}`
        },
        body: JSON.stringify({
          replyToken: event.replyToken,
          messages: [{ type: "text", text: replyText.slice(0, 4900) }]
        })
      });
    }
  }
}
