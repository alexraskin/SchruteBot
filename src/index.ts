import { Hono, Context } from 'hono'
import { Ai } from '@cloudflare/ai'

import indexHtml from './public/index.html'
import { dwight_context } from './constants'

type Bindings = {
  AI: Ai
}

const app = new Hono<{ Bindings: Bindings }>()

app.get('/', async (c: Context) => {
  return c.html(indexHtml)
});

app.post('/', async (c: Context) => {

  const body = await c.req.json();

  const ai = new Ai(c.env.AI)
  const messages = [
    { role: 'system', content: dwight_context.text },
    { role: 'user', content: body.message }
  ];
  const answer = await ai.run('@cf/meta/llama-2-7b-chat-int8', { messages });

  const result = answer.response;

  return c.json({ result });

});

export default app
