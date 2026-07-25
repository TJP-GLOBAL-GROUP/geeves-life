/**
 * Directly calls registerAllWebhooks() from the server code
 * to re-register all webhook channels with the fixed expiration parsing.
 * Run with: node scripts/trigger-webhook-reregister.mjs
 */
import { createRequire } from "module";
const require = createRequire(import.meta.url);

// Load env
const dotenv = require("dotenv");
dotenv.config({ path: "/home/ubuntu/geeves-shopping/.env" });

// Patch process.env for the server modules
process.env.NODE_ENV = "production";

const { registerAllWebhooks } = await import("/home/ubuntu/geeves-shopping/server/services/calendarWebhook.ts").catch(async () => {
  // Try compiled version
  return import("/home/ubuntu/geeves-shopping/dist/server/services/calendarWebhook.js");
});

console.log("Starting webhook re-registration...");
await registerAllWebhooks();
console.log("Done.");
