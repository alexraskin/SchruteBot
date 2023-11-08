import { Hono, Context } from "hono";
import OpenAI from "openai";

import indexHtml from "./public/index.html";
import { dwight_context } from "./constants";

type Bindings = {
  OPENAI_TOKEN: string;
  CLOUDFLARE_GATEWAY_URL: string;
};

const app = new Hono<{ Bindings: Bindings }>();

app.get("/", async (c: Context) => {
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
