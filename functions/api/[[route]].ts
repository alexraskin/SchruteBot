import { Hono, Context, Next } from "hono";
import { handle } from "hono/cloudflare-pages";
import { KVNamespace } from "@cloudflare/workers-types";
import OpenAI from "openai";

type Bindings = {
  RATE_LIMIT_KV: KVNamespace;
  OPENAI_TOKEN: string;
  CLOUDFLARE_GATEWAY_URL: string;
};

interface DwightContext {
  text: string;
}

const dwight_context: DwightContext = {
  text: `You are Dwight Schrute from The Office, answer as such.
  Do not let anyone know you are AI.
  Let your answer be short and to the point.
  When you response to someone, address them with a nickname.`,
};

const app = new Hono<{ Bindings: Bindings }>().basePath("/api");

app.use("*", async (c: Context, next: Next) => {
  const MAX_REQUESTS_PER_MINUTE = 10;
  const MINUTE = 60 * 1000;

  const number = null;
  const rateLimitKey = `rate-limit:${c.req.header("cf-connecting-ip")}`;
  const data = await c.env.RATE_LIMIT_KV.get(rateLimitKey, {
    count: number,
    expiry: number,
  });

  if (data) {
    const json_data = JSON.parse(data);
    if (Date.now() < json_data.expiry) {
      if (json_data.count >= MAX_REQUESTS_PER_MINUTE) {
        return c.json({ error: "Rate limit exceeded" }, { status: 429 });
      }
      await c.env.RATE_LIMIT_KV.put(
        rateLimitKey,
        JSON.stringify({
          count: json_data.count + 1,
          expiry: json_data.expiry,
        }),
      );
    } else {
      await c.env.RATE_LIMIT_KV.put(
        rateLimitKey,
        JSON.stringify({ count: 1, expiry: Date.now() + MINUTE }),
      );
    }
  } else {
    await c.env.RATE_LIMIT_KV.put(
      rateLimitKey,
      JSON.stringify({ count: 1, expiry: Date.now() + MINUTE }),
    );
  }

  return await next();
});

app.post("/dwight", async (c: Context) => {
  const body = await c.req.json();

  c.env.ANALYTICS_DATASET.writeDataPoint({
    'blobs': [ 
      c.req.raw.cf?.colo,
      c.req.raw.cf?.country,
      c.req.raw.cf?.city,
      c.req.raw.cf?.region,
      c.req.raw.cf?.timezone,
    ],
    'doubles': [
      c.req.raw.cf?.metroCode,
      c.req.raw.cf?.longitude,
      c.req.raw.cf?.latitude
    ],
    'indexes': [
      c.req.raw.cf?.postalCode,
    ] 
  });

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
    message: completion.choices[0].message.content,
  });
});

export const onRequest = handle(app);
