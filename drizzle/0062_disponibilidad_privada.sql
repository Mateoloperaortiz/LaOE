CREATE TABLE "meeting_availability" (
	"poll_id" text NOT NULL,
	"person_id" text NOT NULL,
	"slots" integer[] NOT NULL,
	"revision" text NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "meeting_availability_poll_id_person_id_pk" PRIMARY KEY("poll_id","person_id"),
	CONSTRAINT "meeting_availability_revision" CHECK (length("meeting_availability"."revision") > 0),
	CONSTRAINT "meeting_availability_slots" CHECK (cardinality("meeting_availability"."slots") <= 672 and 0 <= all("meeting_availability"."slots") and 672 > all("meeting_availability"."slots") and array_position("meeting_availability"."slots", null) is null)
);
--> statement-breakpoint
CREATE TABLE "meeting_poll" (
	"id" text PRIMARY KEY NOT NULL,
	"term_id" text NOT NULL,
	"committee_id" text,
	"work_group_id" text,
	"title" text NOT NULL,
	"dates" text[] NOT NULL,
	"start_minute" integer NOT NULL,
	"end_minute" integer NOT NULL,
	"created_by_id" text,
	"closed_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "meeting_poll_scope" CHECK (("meeting_poll"."committee_id" is not null) <> ("meeting_poll"."work_group_id" is not null)),
	CONSTRAINT "meeting_poll_dates" CHECK (cardinality("meeting_poll"."dates") between 1 and 14 and array_position("meeting_poll"."dates", null) is null),
	CONSTRAINT "meeting_poll_window" CHECK ("meeting_poll"."start_minute" >= 0 and "meeting_poll"."end_minute" <= 1440 and "meeting_poll"."start_minute" < "meeting_poll"."end_minute" and "meeting_poll"."start_minute" % 30 = 0 and "meeting_poll"."end_minute" % 30 = 0)
);
--> statement-breakpoint
CREATE TABLE "weekly_availability" (
	"person_id" text NOT NULL,
	"term_id" text NOT NULL,
	"slots" integer[] NOT NULL,
	"revision" text NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "weekly_availability_person_id_term_id_pk" PRIMARY KEY("person_id","term_id"),
	CONSTRAINT "weekly_availability_revision" CHECK (length("weekly_availability"."revision") > 0),
	CONSTRAINT "weekly_availability_slots" CHECK (cardinality("weekly_availability"."slots") <= 336 and 0 <= all("weekly_availability"."slots") and 336 > all("weekly_availability"."slots") and array_position("weekly_availability"."slots", null) is null)
);
--> statement-breakpoint
ALTER TABLE "meeting_availability" ADD CONSTRAINT "meeting_availability_poll_id_meeting_poll_id_fk" FOREIGN KEY ("poll_id") REFERENCES "public"."meeting_poll"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "meeting_availability" ADD CONSTRAINT "meeting_availability_person_id_person_id_fk" FOREIGN KEY ("person_id") REFERENCES "public"."person"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "meeting_poll" ADD CONSTRAINT "meeting_poll_term_id_term_id_fk" FOREIGN KEY ("term_id") REFERENCES "public"."term"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "meeting_poll" ADD CONSTRAINT "meeting_poll_committee_id_committee_id_fk" FOREIGN KEY ("committee_id") REFERENCES "public"."committee"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "meeting_poll" ADD CONSTRAINT "meeting_poll_work_group_id_work_group_id_fk" FOREIGN KEY ("work_group_id") REFERENCES "public"."work_group"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "meeting_poll" ADD CONSTRAINT "meeting_poll_created_by_id_person_id_fk" FOREIGN KEY ("created_by_id") REFERENCES "public"."person"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "weekly_availability" ADD CONSTRAINT "weekly_availability_person_id_person_id_fk" FOREIGN KEY ("person_id") REFERENCES "public"."person"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "weekly_availability" ADD CONSTRAINT "weekly_availability_term_id_term_id_fk" FOREIGN KEY ("term_id") REFERENCES "public"."term"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "meeting_availability_person_idx" ON "meeting_availability" USING btree ("person_id");--> statement-breakpoint
CREATE INDEX "meeting_poll_committee_idx" ON "meeting_poll" USING btree ("term_id","committee_id","created_at");--> statement-breakpoint
CREATE INDEX "meeting_poll_work_group_idx" ON "meeting_poll" USING btree ("term_id","work_group_id","created_at");