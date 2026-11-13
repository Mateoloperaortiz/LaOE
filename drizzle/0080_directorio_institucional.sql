CREATE TABLE "institutional_directory_entry" (
	"contact_id" text PRIMARY KEY NOT NULL,
	"functions" text DEFAULT '' NOT NULL,
	"handles" text DEFAULT '' NOT NULL,
	"published" boolean DEFAULT false NOT NULL,
	"photo_asset_id" text,
	"photo_authorized_at" timestamp with time zone,
	"updated_by_id" text,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "institutional_directory_entry_photo_authorized" CHECK ("institutional_directory_entry"."photo_asset_id" is null or "institutional_directory_entry"."photo_authorized_at" is not null)
);
--> statement-breakpoint
ALTER TABLE "institutional_directory_entry" ADD CONSTRAINT "institutional_directory_entry_contact_id_organization_contact_id_fk" FOREIGN KEY ("contact_id") REFERENCES "public"."organization_contact"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "institutional_directory_entry" ADD CONSTRAINT "institutional_directory_entry_photo_asset_id_media_asset_id_fk" FOREIGN KEY ("photo_asset_id") REFERENCES "public"."media_asset"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "institutional_directory_entry" ADD CONSTRAINT "institutional_directory_entry_updated_by_id_person_id_fk" FOREIGN KEY ("updated_by_id") REFERENCES "public"."person"("id") ON DELETE set null ON UPDATE no action;