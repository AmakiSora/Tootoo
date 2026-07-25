import { serve } from "@hono/node-server";
import { buildApp } from "./app.js";

const port = Number(process.env.PORT ?? 3000);
const app = buildApp();

console.log(`Tootoo listening on http://localhost:${port}`);
serve({ fetch: app.fetch, port });
