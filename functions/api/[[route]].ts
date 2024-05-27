import { Hono, Context, Next } from "hono";
import { Ai } from "@cloudflare/ai";
import { handle } from "hono/cloudflare-pages";
import { KVNamespace } from "@cloudflare/workers-types";

type Bindings = {
  RATE_LIMIT_KV: KVNamespace;
  AI: Ai;
};

type DwightContext = {
  text: string;
};

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
    blobs: [
      c.req.raw.cf?.colo,
      c.req.raw.cf?.country,
      c.req.raw.cf?.city,
      c.req.raw.cf?.region,
      c.req.raw.cf?.timezone,
    ],
    doubles: [
      c.req.raw.cf?.metroCode,
      c.req.raw.cf?.longitude,
      c.req.raw.cf?.latitude,
    ],
    indexes: [c.req.raw.cf?.postalCode],
  });

  const ai = new Ai(c.env.AI);
  const messages = [
    { role: "system", content: dwight_context },
    { role: "user", content: body.message },
  ];

  let response: Record<string, string> = {};

  try {
    response = await ai.run("@cf/meta/llama-2-7b-chat-int8", { messages });
  } catch (error) {
    console.error(error);
    return c.json({ error: "An error occurred" }, 500);
  }

  const message = response.result;
  return c.json(
    {
      message: message,
    },
    200,
  );
});

export const onRequest = handle(app);
