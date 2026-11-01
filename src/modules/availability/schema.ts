import { sql } from "drizzle-orm";
import { check, index, integer, pgTable, primaryKey, text } from "drizzle-orm/pg-core";
import { createdAt, id, timestampTz, updatedAt } from "@/db/columns";
import { committee, person } from "@/modules/people/schema";
import { workGroup } from "@/modules/permanence/schema";
import { term } from "@/modules/terms/schema";

export const weeklyAvailability = pgTable(
  "weekly_availability",
  {
    personId: text()
      .notNull()
      .references(() => person.id, { onDelete: "cascade" }),
    termId: text()
      .notNull()
      .references(() => term.id, { onDelete: "cascade" }),
    slots: integer().array().notNull(),
    revision: text().notNull(),
    updatedAt: updatedAt(),
  },
  (t) => [
    primaryKey({ columns: [t.personId, t.termId] }),
    check("weekly_availability_revision", sql`length(${t.revision}) > 0`),
    check(
      "weekly_availability_slots",
      sql`cardinality(${t.slots}) <= 336 and 0 <= all(${t.slots}) and 336 > all(${t.slots}) and array_position(${t.slots}, null) is null`,
    ),
  ],
);

export const meetingPoll = pgTable(
  "meeting_poll",
  {
    id: id(),
    termId: text()
      .notNull()
      .references(() => term.id, { onDelete: "cascade" }),
    committeeId: text().references(() => committee.id, { onDelete: "cascade" }),
    workGroupId: text().references(() => workGroup.id, { onDelete: "cascade" }),
    title: text().notNull(),
    dates: text().array().notNull(),
    startMinute: integer().notNull(),
    endMinute: integer().notNull(),
    createdById: text().references(() => person.id, { onDelete: "set null" }),
    closedAt: timestampTz(),
    createdAt: createdAt(),
  },
  (t) => [
    index("meeting_poll_committee_idx").on(t.termId, t.committeeId, t.createdAt),
    index("meeting_poll_work_group_idx").on(t.termId, t.workGroupId, t.createdAt),
    check(
      "meeting_poll_scope",
      sql`(${t.committeeId} is not null) <> (${t.workGroupId} is not null)`,
    ),
    check(
      "meeting_poll_dates",
      sql`cardinality(${t.dates}) between 1 and 14 and array_position(${t.dates}, null) is null`,
    ),
    check(
      "meeting_poll_window",
      sql`${t.startMinute} >= 0 and ${t.endMinute} <= 1440 and ${t.startMinute} < ${t.endMinute} and ${t.startMinute} % 30 = 0 and ${t.endMinute} % 30 = 0`,
    ),
  ],
);

export const meetingAvailability = pgTable(
  "meeting_availability",
  {
    pollId: text()
      .notNull()
      .references(() => meetingPoll.id, { onDelete: "cascade" }),
    personId: text()
      .notNull()
      .references(() => person.id, { onDelete: "cascade" }),
    slots: integer().array().notNull(),
    revision: text().notNull(),
    updatedAt: updatedAt(),
  },
  (t) => [
    primaryKey({ columns: [t.pollId, t.personId] }),
    index("meeting_availability_person_idx").on(t.personId),
    check("meeting_availability_revision", sql`length(${t.revision}) > 0`),
    check(
      "meeting_availability_slots",
      sql`cardinality(${t.slots}) <= 672 and 0 <= all(${t.slots}) and 672 > all(${t.slots}) and array_position(${t.slots}, null) is null`,
    ),
  ],
);
