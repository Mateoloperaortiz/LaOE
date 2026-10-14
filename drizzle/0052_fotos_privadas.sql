CREATE TABLE "gallery_album" (
	"id" text PRIMARY KEY NOT NULL,
	"collection_id" text NOT NULL,
	"slug" text NOT NULL,
	"title" text NOT NULL,
	"caption" text DEFAULT '' NOT NULL,
	"sort_order" integer DEFAULT 0 NOT NULL,
	"cover_photo_id" text,
	"status" "publication_status" DEFAULT 'DRAFT' NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "gallery_album_slug_format" CHECK ("gallery_album"."slug" ~ '^[a-z0-9-]+$')
);
--> statement-breakpoint
CREATE TABLE "gallery_album_photo" (
	"id" text PRIMARY KEY NOT NULL,
	"album_id" text NOT NULL,
	"photo_id" text NOT NULL,
	"sort_order" integer DEFAULT 0 NOT NULL
);
--> statement-breakpoint
CREATE TABLE "gallery_collection" (
	"id" text PRIMARY KEY NOT NULL,
	"slug" text NOT NULL,
	"title" text NOT NULL,
	"description" text DEFAULT '' NOT NULL,
	"hero_photo_id" text,
	"status" "publication_status" DEFAULT 'DRAFT' NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "gallery_collection_slug_format" CHECK ("gallery_collection"."slug" ~ '^[a-z0-9-]+$')
);
--> statement-breakpoint
CREATE TABLE "gallery_featured_photo" (
	"id" text PRIMARY KEY NOT NULL,
	"collection_id" text NOT NULL,
	"photo_id" text NOT NULL,
	"sort_order" integer DEFAULT 0 NOT NULL
);
--> statement-breakpoint
CREATE TABLE "gallery_photo" (
	"id" text PRIMARY KEY NOT NULL,
	"source_hash" text NOT NULL,
	"width" integer NOT NULL,
	"height" integer NOT NULL,
	"alt" text NOT NULL,
	"variants" jsonb NOT NULL,
	"status" "media_status" DEFAULT 'PENDING' NOT NULL,
	"uploaded_by_id" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "gallery_photo_source_hash_format" CHECK ("gallery_photo"."source_hash" ~ '^[a-f0-9]{64}$'),
	CONSTRAINT "gallery_photo_dimensions_positive" CHECK ("gallery_photo"."width" > 0 AND "gallery_photo"."height" > 0)
);
--> statement-breakpoint
ALTER TABLE "gallery_album" ADD CONSTRAINT "gallery_album_collection_id_gallery_collection_id_fk" FOREIGN KEY ("collection_id") REFERENCES "public"."gallery_collection"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "gallery_album" ADD CONSTRAINT "gallery_album_cover_photo_id_gallery_photo_id_fk" FOREIGN KEY ("cover_photo_id") REFERENCES "public"."gallery_photo"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "gallery_album_photo" ADD CONSTRAINT "gallery_album_photo_album_id_gallery_album_id_fk" FOREIGN KEY ("album_id") REFERENCES "public"."gallery_album"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "gallery_album_photo" ADD CONSTRAINT "gallery_album_photo_photo_id_gallery_photo_id_fk" FOREIGN KEY ("photo_id") REFERENCES "public"."gallery_photo"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "gallery_collection" ADD CONSTRAINT "gallery_collection_hero_photo_id_gallery_photo_id_fk" FOREIGN KEY ("hero_photo_id") REFERENCES "public"."gallery_photo"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "gallery_featured_photo" ADD CONSTRAINT "gallery_featured_photo_collection_id_gallery_collection_id_fk" FOREIGN KEY ("collection_id") REFERENCES "public"."gallery_collection"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "gallery_featured_photo" ADD CONSTRAINT "gallery_featured_photo_photo_id_gallery_photo_id_fk" FOREIGN KEY ("photo_id") REFERENCES "public"."gallery_photo"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "gallery_photo" ADD CONSTRAINT "gallery_photo_uploaded_by_id_person_id_fk" FOREIGN KEY ("uploaded_by_id") REFERENCES "public"."person"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "gallery_album_collection_slug_unique" ON "gallery_album" USING btree ("collection_id","slug");--> statement-breakpoint
CREATE INDEX "gallery_album_collection_order_idx" ON "gallery_album" USING btree ("collection_id","sort_order","id");--> statement-breakpoint
CREATE UNIQUE INDEX "gallery_album_photo_unique" ON "gallery_album_photo" USING btree ("album_id","photo_id");--> statement-breakpoint
CREATE INDEX "gallery_album_photo_order_idx" ON "gallery_album_photo" USING btree ("album_id","sort_order","id");--> statement-breakpoint
CREATE INDEX "gallery_album_photo_photo_idx" ON "gallery_album_photo" USING btree ("photo_id");--> statement-breakpoint
CREATE UNIQUE INDEX "gallery_collection_slug_unique" ON "gallery_collection" USING btree ("slug");--> statement-breakpoint
CREATE UNIQUE INDEX "gallery_featured_photo_unique" ON "gallery_featured_photo" USING btree ("collection_id","photo_id");--> statement-breakpoint
CREATE INDEX "gallery_featured_photo_order_idx" ON "gallery_featured_photo" USING btree ("collection_id","sort_order","id");--> statement-breakpoint
CREATE UNIQUE INDEX "gallery_photo_source_hash_unique" ON "gallery_photo" USING btree ("source_hash");