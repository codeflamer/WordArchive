// Deploys with the Supabase settings from .env.local, so they stay out of the repo.
// "node scripts/deploy.mjs --ai-off" deploys with AI turned off to test an outage. A normal deploy turns it back on.
// Run it directly, as PowerShell can drop the option when it goes through npm.
import { execFileSync } from "node:child_process";
import { readFileSync } from "node:fs";

const env = Object.fromEntries(
  readFileSync(".env.local", "utf8")
    .split(/\r?\n/)
    .filter((line) => line.includes("="))
    .map((line) => [line.slice(0, line.indexOf("=")).trim(), line.slice(line.indexOf("=") + 1).trim()]),
);

const aiOff = process.argv.includes("--ai-off") ? " --var AI_DISABLED:true" : "";
const command = `npx wrangler deploy --var SUPABASE_URL:${env.VITE_SUPABASE_URL} --var SUPABASE_PUBLISHABLE_KEY:${env.VITE_SUPABASE_PUBLISHABLE_KEY}${aiOff}`;
execFileSync(command, { shell: true, stdio: "inherit" });
