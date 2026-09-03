CREATE TYPE "public"."audience" AS ENUM('PUBLIC', 'MEMBERS');--> statement-breakpoint
CREATE TYPE "public"."media_status" AS ENUM('PENDING', 'READY', 'FAILED');--> statement-breakpoint
CREATE TYPE "public"."media_visibility" AS ENUM('PUBLIC', 'PRIVATE');--> statement-breakpoint
CREATE TABLE "announcement" (
	"id" text PRIMARY KEY NOT NULL,
	"title" text NOT NULL,
	"body" text DEFAULT '' NOT NULL,
	"audience" "audience" DEFAULT 'PUBLIC' NOT NULL,
	"published_at" timestamp with time zone,
	"pinned" boolean DEFAULT false NOT NULL,
	"push_sent_at" timestamp with time zone,
	"created_by_id" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "media_asset" (
	"id" text PRIMARY KEY NOT NULL,
	"visibility" "media_visibility" DEFAULT 'PUBLIC' NOT NULL,
	"object_key" text NOT NULL,
	"original_filename" text NOT NULL,
	"content_type" text NOT NULL,
	"byte_size" integer NOT NULL,
	"width" integer,
	"height" integer,
	"variants" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"uploaded_by_id" text,
	"status" "media_status" DEFAULT 'PENDING' NOT NULL,
	"error" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "page" (
	"id" text PRIMARY KEY NOT NULL,
	"slug" text NOT NULL,
	"title" text NOT NULL,
	"body" text DEFAULT '' NOT NULL,
	"status" "publication_status" DEFAULT 'DRAFT' NOT NULL,
	"audience" "audience" DEFAULT 'PUBLIC' NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "page_slug_format" CHECK ("page"."slug" ~ '^[a-z0-9-]+$')
);
--> statement-breakpoint
CREATE TABLE "edition_committee" (
	"id" text PRIMARY KEY NOT NULL,
	"edition_id" text NOT NULL,
	"committee_id" text NOT NULL
);
--> statement-breakpoint
CREATE TABLE "event" (
	"id" text PRIMARY KEY NOT NULL,
	"slug" text NOT NULL,
	"name" text NOT NULL,
	"summary" text DEFAULT '' NOT NULL,
	"description" text DEFAULT '' NOT NULL,
	"audience" "audience" DEFAULT 'PUBLIC' NOT NULL,
	"publication_status" "publication_status" DEFAULT 'DRAFT' NOT NULL,
	"cover_asset_id" text,
	"sort_order" integer DEFAULT 0 NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "event_slug_format" CHECK ("event"."slug" ~ '^[a-z0-9-]+$')
);
--> statement-breakpoint
CREATE TABLE "event_edition" (
	"id" text PRIMARY KEY NOT NULL,
	"event_id" text NOT NULL,
	"slug" text NOT NULL,
	"name" text NOT NULL,
	"description" text DEFAULT '' NOT NULL,
	"starts_at" timestamp with time zone NOT NULL,
	"ends_at" timestamp with time zone,
	"location" text DEFAULT '' NOT NULL,
	"registration_url" text,
	"publication_status" "publication_status" DEFAULT 'DRAFT' NOT NULL,
	"cover_asset_id" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "event_edition_slug_format" CHECK ("event_edition"."slug" ~ '^[a-z0-9-]+$'),
	CONSTRAINT "event_edition_dates_ordered" CHECK ("event_edition"."ends_at" is null or "event_edition"."ends_at" > "event_edition"."starts_at")
);
--> statement-breakpoint
ALTER TABLE "announcement" ADD CONSTRAINT "announcement_created_by_id_person_id_fk" FOREIGN KEY ("created_by_id") REFERENCES "public"."person"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "media_asset" ADD CONSTRAINT "media_asset_uploaded_by_id_person_id_fk" FOREIGN KEY ("uploaded_by_id") REFERENCES "public"."person"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "edition_committee" ADD CONSTRAINT "edition_committee_edition_id_event_edition_id_fk" FOREIGN KEY ("edition_id") REFERENCES "public"."event_edition"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "edition_committee" ADD CONSTRAINT "edition_committee_committee_id_committee_id_fk" FOREIGN KEY ("committee_id") REFERENCES "public"."committee"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "event" ADD CONSTRAINT "event_cover_asset_id_media_asset_id_fk" FOREIGN KEY ("cover_asset_id") REFERENCES "public"."media_asset"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "event_edition" ADD CONSTRAINT "event_edition_event_id_event_id_fk" FOREIGN KEY ("event_id") REFERENCES "public"."event"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "event_edition" ADD CONSTRAINT "event_edition_cover_asset_id_media_asset_id_fk" FOREIGN KEY ("cover_asset_id") REFERENCES "public"."media_asset"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "announcement_public_idx" ON "announcement" USING btree ("audience","published_at");--> statement-breakpoint
CREATE UNIQUE INDEX "media_asset_object_key_unique" ON "media_asset" USING btree ("object_key");--> statement-breakpoint
CREATE INDEX "media_asset_status_idx" ON "media_asset" USING btree ("status","created_at");--> statement-breakpoint
CREATE UNIQUE INDEX "page_slug_unique" ON "page" USING btree ("slug");--> statement-breakpoint
CREATE UNIQUE INDEX "edition_committee_unique" ON "edition_committee" USING btree ("edition_id","committee_id");--> statement-breakpoint
CREATE UNIQUE INDEX "event_slug_unique" ON "event" USING btree ("slug");--> statement-breakpoint
CREATE INDEX "event_public_idx" ON "event" USING btree ("publication_status","audience","sort_order");--> statement-breakpoint
CREATE UNIQUE INDEX "event_edition_event_slug_unique" ON "event_edition" USING btree ("event_id","slug");--> statement-breakpoint
CREATE INDEX "event_edition_starts_idx" ON "event_edition" USING btree ("publication_status","starts_at");--> statement-breakpoint
-- Catálogo de la fase 1 (ADR-033): las páginas fijas nacen en borrador y los cuatro macroeventos publicados sin ediciones.
-- Son datos del sistema, no seed: viven en la migración para que db:release los garantice (como 0001).
-- El cuerpo de La OE transcribe "Nuestra historia" e "Identidad" del manual de marca (T-010 a T-012); COM y JUNTA lo completan y publican desde el admin.
INSERT INTO "page" ("id", "slug", "title", "body", "status", "audience") VALUES
  (gen_random_uuid()::text, 'la-oe', 'La OE', $cuerpo$## Nuestra historia

Nuestra historia comienza en 1987, cuando decidimos crear un espacio donde los estudiantes pudieran desarrollar sus habilidades y hacer la diferencia en la universidad. Desde entonces, nos hemos convertido en el grupo estudiantil más grande de la Universidad EAFIT. Asumimos distintos roles de liderazgo en áreas como mercadeo, gestión humana, finanzas, logística y publicidad; en donde llevamos a cabo eventos que impactan a toda la comunidad universitaria. Entre ellos tenemos a Días EAFIT, Inventiva, EnFemenino y Subsidios-OE.

## Misión

Impulsar el liderazgo y la formación integral de la comunidad estudiantil a través de la organización y ejecución de eventos. Fomentando la colaboración, el sentido de pertenencia y el compromiso, creando un entorno donde los estudiantes puedan desarrollar sus talentos, hacer realidad sus ideas y generando un impacto positivo en la universidad y la sociedad.

## Visión

Aspiramos ser reconocidos como el grupo estudiantil más destacado por su capacidad para formar líderes íntegros y transformar la experiencia universitaria. Logrando construir una comunidad estudiantil unida dejando una huella duradera en cada uno de nuestros integrantes y en la comunidad universitaria a través de eventos que impacten y trasciendan.
$cuerpo$, 'DRAFT', 'PUBLIC'),
  (gen_random_uuid()::text, 'unirse', '¿Querés ser parte de la OE?', '', 'DRAFT', 'PUBLIC'),
  (gen_random_uuid()::text, 'privacidad', 'Tratamiento de datos personales', '', 'DRAFT', 'PUBLIC')
ON CONFLICT ("slug") DO NOTHING;--> statement-breakpoint
INSERT INTO "event" ("id", "slug", "name", "publication_status", "audience", "sort_order") VALUES
  (gen_random_uuid()::text, 'dias-eafit', 'Días EAFIT', 'PUBLISHED', 'PUBLIC', 1),
  (gen_random_uuid()::text, 'inventiva', 'Inventiva', 'PUBLISHED', 'PUBLIC', 2),
  (gen_random_uuid()::text, 'enfemenino', 'EnFemenino', 'PUBLISHED', 'PUBLIC', 3),
  (gen_random_uuid()::text, 'subsidios-oe', 'Subsidios-OE', 'PUBLISHED', 'PUBLIC', 4)
ON CONFLICT ("slug") DO NOTHING;