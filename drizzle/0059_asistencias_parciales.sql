CREATE TYPE "public"."attendance_extent" AS ENUM('FULL', 'PARTIAL');--> statement-breakpoint
CREATE TYPE "public"."attendance_list" AS ENUM('FIRST', 'SECOND');--> statement-breakpoint
ALTER TABLE "check_in" ADD COLUMN "attendance_extent" "attendance_extent" DEFAULT 'FULL';--> statement-breakpoint
ALTER TABLE "check_in" ADD COLUMN "attendance_list" "attendance_list";--> statement-breakpoint
UPDATE "check_in" SET "attendance_extent" = NULL WHERE "status" = 'EXCUSED';--> statement-breakpoint
ALTER TABLE "check_in" ADD CONSTRAINT "check_in_attendance_list_consistent" CHECK (("check_in"."attendance_extent" is not distinct from 'PARTIAL') = ("check_in"."attendance_list" is not null));--> statement-breakpoint
ALTER TABLE "check_in" ADD CONSTRAINT "check_in_absence_is_excused" CHECK ("check_in"."attendance_extent" is not null or "check_in"."status" = 'EXCUSED');
