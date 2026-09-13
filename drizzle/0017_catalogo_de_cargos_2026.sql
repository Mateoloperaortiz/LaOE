ALTER TABLE "committee_role" ADD COLUMN "retired" boolean DEFAULT false NOT NULL;--> statement-breakpoint
ALTER TABLE "committee_role" ADD COLUMN "replaced_by_code" text;--> statement-breakpoint
ALTER TABLE "committee_role" ADD CONSTRAINT "committee_role_replaced_by_code_committee_role_code_fk" FOREIGN KEY ("replaced_by_code") REFERENCES "public"."committee_role"("code") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
-- ADR-060 regla 4: la mesa directiva 2026 tiene seis cargos. Publicidad queda retirado para los comités
-- y lo reemplaza Mercadeo (antes Publicidad; Est. art. 40; Regl. art. 6 par. 1); Logística mantiene la
-- base de datos del comité (Est. art. 37.3) y suma ROSTER sin quitárselo a Gestión Humana.
UPDATE "committee_role" SET "retired" = true, "replaced_by_code" = 'MERCADEO', "sort_order" = 90 WHERE "code" = 'PUBLICIDAD';--> statement-breakpoint
UPDATE "committee_role" SET "sort_order" = 3 WHERE "code" = 'MERCADEO' AND "sort_order" = 7;--> statement-breakpoint
UPDATE "committee_role" SET "capabilities" = array_append("capabilities", 'ROSTER') WHERE "code" = 'LOGISTICA' AND NOT ('ROSTER' = ANY("capabilities"));
