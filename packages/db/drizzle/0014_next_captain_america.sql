CREATE TABLE "family_saved_menu_members" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"family_id" uuid NOT NULL,
	"saved_menu_id" uuid NOT NULL,
	"member_id" uuid NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
DROP INDEX "family_saved_menus_active_target_unique";--> statement-breakpoint
ALTER TABLE "family_saved_menus" ADD COLUMN "audience_type" text DEFAULT 'family' NOT NULL;--> statement-breakpoint
-- Backfill: every existing saved menu was implicitly either "whole family"
-- (household_id null) or "household" (household_id set). The ADD COLUMN above defaulted
-- ALL rows to 'family', so pre-existing household-targeted menus must be corrected before
-- the consistency check below is added, or that check would fail on them immediately.
UPDATE "family_saved_menus" SET "audience_type" = 'household' WHERE "household_id" IS NOT NULL;--> statement-breakpoint
ALTER TABLE "family_saved_menu_members" ADD CONSTRAINT "family_saved_menu_members_menu_family_fk" FOREIGN KEY ("saved_menu_id","family_id") REFERENCES "public"."family_saved_menus"("id","family_id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "family_saved_menu_members" ADD CONSTRAINT "family_saved_menu_members_member_family_fk" FOREIGN KEY ("member_id","family_id") REFERENCES "public"."family_members"("id","family_id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "family_saved_menu_members_menu_member_unique" ON "family_saved_menu_members" USING btree ("saved_menu_id","member_id");--> statement-breakpoint
CREATE INDEX "family_saved_menu_members_member_idx" ON "family_saved_menu_members" USING btree ("member_id");--> statement-breakpoint
ALTER TABLE "family_saved_menus" ADD CONSTRAINT "family_saved_menus_audience_type_allowed" CHECK ("family_saved_menus"."audience_type" in ('family', 'household', 'members'));--> statement-breakpoint
ALTER TABLE "family_saved_menus" ADD CONSTRAINT "family_saved_menus_household_consistency" CHECK (("family_saved_menus"."audience_type" = 'household') = ("family_saved_menus"."household_id" is not null));