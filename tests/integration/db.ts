import { sql } from "drizzle-orm";
import { getDb } from "@/db/client";

// Deja las tablas vacías entre pruebas (los catálogos de las migraciones se conservan).
export async function truncateAll(): Promise<void> {
  await getDb().execute(sql`
    truncate table
      audit_log, outbox, app_config, message,
      session, otp_challenge, permission,
      edition_committee, event_edition, event, media_asset, announcement, page,
      committee_membership, membership_event, membership, person, committee, term
    restart identity cascade
  `);
}
