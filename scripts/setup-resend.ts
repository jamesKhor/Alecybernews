#!/usr/bin/env tsx
/**
 * One-time setup: create the EN and ZH audiences in Resend and print the IDs.
 * Run: npx tsx scripts/setup-resend.ts
 *
 * Copy the printed IDs into .env.local:
 *   RESEND_AUDIENCE_ID_EN=...
 *   RESEND_AUDIENCE_ID_ZH=...
 */
import "dotenv/config";
import { Resend } from "resend";

async function main() {
  const key = process.env.RESEND_API_KEY;
  if (!key) {
    console.error("❌ RESEND_API_KEY is not set in .env.local");
    process.exit(1);
  }

  const resend = new Resend(key);

  const existing = await resend.audiences.list();
  if (existing.error) {
    console.error("❌ Failed to list audiences:", existing.error);
    process.exit(1);
  }

  const existingByName = new Map(
    (existing.data?.data ?? []).map((a) => [a.name, a.id]),
  );

  async function ensure(name: string): Promise<string> {
    const existingId = existingByName.get(name);
    if (existingId) {
      console.log(`✓ Audience "${name}" already exists: ${existingId}`);
      return existingId;
    }
    const created = await resend.audiences.create({ name });
    if (created.error || !created.data) {
      console.error(`❌ Failed to create audience "${name}":`, created.error);
      process.exit(1);
    }
    console.log(`✓ Created audience "${name}": ${created.data.id}`);
    return created.data.id;
  }

  const enId = await ensure("zcybernews-en");
  const zhId = await ensure("zcybernews-zh");

  console.log(
    "\n📋 Add these to your .env.local and GitHub Actions secrets:\n",
  );
  console.log(`RESEND_AUDIENCE_ID_EN=${enId}`);
  console.log(`RESEND_AUDIENCE_ID_ZH=${zhId}`);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
