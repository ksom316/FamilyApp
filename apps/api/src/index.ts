import { Hono } from 'hono';

const app = new Hono();

app.get('/health', (c) => c.json({ status: 'ok', service: 'familyapp-api' }));

export default app;
