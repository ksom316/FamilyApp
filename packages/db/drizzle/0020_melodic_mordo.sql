CREATE TABLE "family_location_share_members" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"family_id" uuid NOT NULL,
	"share_id" uuid NOT NULL,
	"member_id" uuid NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "family_location_shares" ADD COLUMN "purpose" text DEFAULT 'location' NOT NULL;--> statement-breakpoint
ALTER TABLE "family_location_shares" ADD COLUMN "audience_type" text DEFAULT 'family' NOT NULL;--> statement-breakpoint
ALTER TABLE "family_location_shares" ADD COLUMN "household_id" uuid;--> statement-breakpoint
ALTER TABLE "family_location_shares" ADD COLUMN "started_at" timestamp with time zone DEFAULT now() NOT NULL;--> statement-breakpoint
ALTER TABLE "family_location_shares" ADD CONSTRAINT "family_location_shares_id_family_unique" UNIQUE("id","family_id");--> statement-breakpoint
ALTER TABLE "family_location_share_members" ADD CONSTRAINT "family_location_share_members_share_family_fk" FOREIGN KEY ("share_id","family_id") REFERENCES "public"."family_location_shares"("id","family_id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "family_location_share_members" ADD CONSTRAINT "family_location_share_members_member_family_fk" FOREIGN KEY ("member_id","family_id") REFERENCES "public"."family_members"("id","family_id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "family_location_share_members_share_member_unique" ON "family_location_share_members" USING btree ("share_id","member_id");--> statement-breakpoint
CREATE INDEX "family_location_share_members_member_idx" ON "family_location_share_members" USING btree ("member_id");--> statement-breakpoint
ALTER TABLE "family_location_shares" ADD CONSTRAINT "family_location_shares_household_family_fk" FOREIGN KEY ("household_id","family_id") REFERENCES "public"."households"("id","family_id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "family_location_shares" ADD CONSTRAINT "family_location_shares_purpose_allowed" CHECK ("family_location_shares"."purpose" in ('location', 'come_find_me'));--> statement-breakpoint
ALTER TABLE "family_location_shares" ADD CONSTRAINT "family_location_shares_audience_type_allowed" CHECK ("family_location_shares"."audience_type" in ('family', 'household', 'members'));--> statement-breakpoint
ALTER TABLE "family_location_shares" ADD CONSTRAINT "family_location_shares_household_consistency" CHECK (("family_location_shares"."audience_type" = 'household') = ("family_location_shares"."household_id" is not null));
