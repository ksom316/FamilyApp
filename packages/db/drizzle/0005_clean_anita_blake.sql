CREATE TYPE "public"."find_me_response" AS ENUM('coming', 'dismissed');--> statement-breakpoint
CREATE TABLE "family_find_me_requests" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"family_id" uuid NOT NULL,
	"requester_member_id" uuid NOT NULL,
	"recipient_member_id" uuid NOT NULL,
	"expires_at" timestamp with time zone NOT NULL,
	"response" "find_me_response",
	"responded_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "family_find_me_requester_unique" UNIQUE("requester_member_id"),
	CONSTRAINT "family_find_me_not_self" CHECK ("family_find_me_requests"."requester_member_id" <> "family_find_me_requests"."recipient_member_id"),
	CONSTRAINT "family_find_me_response_consistency" CHECK (("family_find_me_requests"."response" is null) = ("family_find_me_requests"."responded_at" is null))
);
--> statement-breakpoint
CREATE TABLE "family_location_shares" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"family_id" uuid NOT NULL,
	"member_id" uuid NOT NULL,
	"latitude" double precision,
	"longitude" double precision,
	"accuracy_meters" double precision,
	"expires_at" timestamp with time zone NOT NULL,
	"stopped_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "family_location_shares_member_unique" UNIQUE("member_id"),
	CONSTRAINT "family_location_shares_latitude_range" CHECK ("family_location_shares"."latitude" is null or "family_location_shares"."latitude" between -90 and 90),
	CONSTRAINT "family_location_shares_longitude_range" CHECK ("family_location_shares"."longitude" is null or "family_location_shares"."longitude" between -180 and 180),
	CONSTRAINT "family_location_shares_coords_consistency" CHECK (("family_location_shares"."latitude" is null) = ("family_location_shares"."longitude" is null)),
	CONSTRAINT "family_location_shares_accuracy_range" CHECK ("family_location_shares"."accuracy_meters" is null or "family_location_shares"."accuracy_meters" between 0 and 50000)
);
--> statement-breakpoint
ALTER TABLE "family_find_me_requests" ADD CONSTRAINT "family_find_me_requests_family_id_families_id_fk" FOREIGN KEY ("family_id") REFERENCES "public"."families"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "family_find_me_requests" ADD CONSTRAINT "family_find_me_requester_family_fk" FOREIGN KEY ("requester_member_id","family_id") REFERENCES "public"."family_members"("id","family_id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "family_find_me_requests" ADD CONSTRAINT "family_find_me_recipient_family_fk" FOREIGN KEY ("recipient_member_id","family_id") REFERENCES "public"."family_members"("id","family_id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "family_location_shares" ADD CONSTRAINT "family_location_shares_family_id_families_id_fk" FOREIGN KEY ("family_id") REFERENCES "public"."families"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "family_location_shares" ADD CONSTRAINT "family_location_shares_member_family_fk" FOREIGN KEY ("member_id","family_id") REFERENCES "public"."family_members"("id","family_id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "family_find_me_recipient_idx" ON "family_find_me_requests" USING btree ("recipient_member_id");--> statement-breakpoint
CREATE INDEX "family_find_me_expires_at_idx" ON "family_find_me_requests" USING btree ("expires_at");--> statement-breakpoint
CREATE INDEX "family_location_shares_family_active_idx" ON "family_location_shares" USING btree ("family_id","stopped_at","expires_at");--> statement-breakpoint
CREATE INDEX "family_location_shares_expires_at_idx" ON "family_location_shares" USING btree ("expires_at");