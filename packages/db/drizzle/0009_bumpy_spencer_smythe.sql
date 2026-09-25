ALTER TABLE "households" ADD COLUMN "description" text;--> statement-breakpoint
ALTER TABLE "households" ADD COLUMN "created_by_member_id" uuid NOT NULL;--> statement-breakpoint
ALTER TABLE "households" ADD CONSTRAINT "households_creator_family_fk" FOREIGN KEY ("created_by_member_id","family_id") REFERENCES "public"."family_members"("id","family_id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "households_family_name_unique" ON "households" USING btree ("family_id","name");--> statement-breakpoint
CREATE INDEX "households_creator_idx" ON "households" USING btree ("created_by_member_id");--> statement-breakpoint
ALTER TABLE "households" ADD CONSTRAINT "households_name_length" CHECK (char_length("households"."name") between 1 and 80 and "households"."name" = btrim("households"."name"));--> statement-breakpoint
ALTER TABLE "households" ADD CONSTRAINT "households_description_length" CHECK ("households"."description" is null or (char_length("households"."description") between 1 and 500 and "households"."description" = btrim("households"."description")));