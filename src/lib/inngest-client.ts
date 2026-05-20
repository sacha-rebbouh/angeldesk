import { Inngest } from "inngest";

const inngestEnvironment =
  process.env.INNGEST_ENV ??
  (process.env.VERCEL_ENV === "preview" ? process.env.VERCEL_GIT_COMMIT_REF : undefined);

// Lightweight client for routes that only dispatch events. Keep the function
// registry in `inngest.ts`; importing it from request routes pulls extraction
// code and the Poppler bundle into unrelated serverless functions.
export const inngest = new Inngest({
  id: "angeldesk",
  name: "Angel Desk",
  env: inngestEnvironment,
});
