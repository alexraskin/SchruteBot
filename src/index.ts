import { Hono, Context, Next } from "hono";
import OpenAI from "openai";
import { KVNamespace } from "@cloudflare/workers-types";

import indexHtml from "./public/index.html";
import { dwight_context } from "./constants";

type Bindings = {
  RATE_LIMIT_KV: KVNamespace;
  OPENAI_TOKEN: string;
  CLOUDFLARE_GATEWAY_URL: string;
};

const app = new Hono<{ Bindings: Bindings }>();

app.use("*", async (c: Context, next: Next) => {

  const MAX_REQUESTS_PER_MINUTE = 10;
  const MINUTE = 60 * 1000;

  const number = null;
  const rateLimitKey = `rate-limit:${c.req.header('cf-connecting-ip')}`
  const data = await c.env.RATE_LIMIT_KV.get(rateLimitKey, { count: number, expiry: number })

  if (data) {
    const json_data = JSON.parse(data)
    if (Date.now() < json_data.expiry) {
      if (json_data.count >= MAX_REQUESTS_PER_MINUTE) {
        return c.json({ error: 'Rate limit exceeded' }, { status: 429 })
      }
      await c.env.RATE_LIMIT_KV.put(rateLimitKey, JSON.stringify({ count: json_data.count + 1, expiry: json_data.expiry }));
    } else {
        await c.env.RATE_LIMIT_KV.put(rateLimitKey, JSON.stringify({ count: 1, expiry: Date.now() + MINUTE }));
    }
  } else {
    await c.env.RATE_LIMIT_KV.put(rateLimitKey, JSON.stringify({ count: 1, expiry: Date.now() + MINUTE }));
  }

  return await next()
});


app.get("/", async (c: Context, next: Next) => {
  return c.html(indexHtml);
});

app.post("/", async (c: Context) => {
  const body = await c.req.json();

  const openai = new OpenAI({
    apiKey: c.env.OPENAI_TOKEN,
    baseURL: c.env.CLOUDFLARE_GATEWAY_URL,
  });
  const completion = await openai.chat.completions.create({
    messages: [
      { role: "system", content: dwight_context.text },
      { role: "user", content: body.message },
    ],
    model: "gpt-4-1106-preview",
  });

  return c.json({
    message: completion.choices[0].message.content
  });
});

export default app;
