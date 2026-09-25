CREATE TABLE "family_calendar_event_members" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"family_id" uuid NOT NULL,
	"event_id" uuid NOT NULL,
	"member_id" uuid NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "family_calendar_events" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"family_id" uuid NOT NULL,
	"created_by_member_id" uuid NOT NULL,
	"audience_type" text DEFAULT 'family' NOT NULL,
	"household_id" uuid,
	"title" text NOT NULL,
	"description" text,
	"starts_at" timestamp with time zone NOT NULL,
	"ends_at" timestamp with time zone,
	"location" text,
	"all_day" boolean DEFAULT false NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "family_calendar_events_id_family_unique" UNIQUE("id","family_id"),
	CONSTRAINT "family_calendar_events_title_length" CHECK (char_length("family_calendar_events"."title") between 1 and 140 and "family_calendar_events"."title" = btrim("family_calendar_events"."title")),
	CONSTRAINT "family_calendar_events_description_length" CHECK ("family_calendar_events"."description" is null or (char_length("family_calendar_events"."description") between 1 and 2000 and "family_calendar_events"."description" = btrim("family_calendar_events"."description"))),
	CONSTRAINT "family_calendar_events_location_length" CHECK ("family_calendar_events"."location" is null or (char_length("family_calendar_events"."location") between 1 and 300 and "family_calendar_events"."location" = btrim("family_calendar_events"."location"))),
	CONSTRAINT "family_calendar_events_audience_type_allowed" CHECK ("family_calendar_events"."audience_type" in ('family', 'household', 'members')),
	CONSTRAINT "family_calendar_events_household_consistency" CHECK (("family_calendar_events"."audience_type" = 'household') = ("family_calendar_events"."household_id" is not null)),
	CONSTRAINT "family_calendar_events_end_after_start" CHECK ("family_calendar_events"."ends_at" is null or "family_calendar_events"."ends_at" > "family_calendar_events"."starts_at")
);
--> statement-breakpoint
ALTER TABLE "family_calendar_event_members" ADD CONSTRAINT "family_calendar_event_members_event_family_fk" FOREIGN KEY ("event_id","family_id") REFERENCES "public"."family_calendar_events"("id","family_id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "family_calendar_event_members" ADD CONSTRAINT "family_calendar_event_members_member_family_fk" FOREIGN KEY ("member_id","family_id") REFERENCES "public"."family_members"("id","family_id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "family_calendar_events" ADD CONSTRAINT "family_calendar_events_family_id_families_id_fk" FOREIGN KEY ("family_id") REFERENCES "public"."families"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "family_calendar_events" ADD CONSTRAINT "family_calendar_events_creator_family_fk" FOREIGN KEY ("created_by_member_id","family_id") REFERENCES "public"."family_members"("id","family_id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "family_calendar_events" ADD CONSTRAINT "family_calendar_events_household_family_fk" FOREIGN KEY ("household_id","family_id") REFERENCES "public"."households"("id","family_id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "family_calendar_event_members_event_member_unique" ON "family_calendar_event_members" USING btree ("event_id","member_id");--> statement-breakpoint
CREATE INDEX "family_calendar_event_members_member_idx" ON "family_calendar_event_members" USING btree ("member_id");--> statement-breakpoint
CREATE INDEX "family_calendar_events_family_starts_at_idx" ON "family_calendar_events" USING btree ("family_id","starts_at");--> statement-breakpoint
CREATE INDEX "family_calendar_events_family_ends_at_idx" ON "family_calendar_events" USING btree ("family_id","ends_at");--> statement-breakpoint
CREATE INDEX "family_calendar_events_household_idx" ON "family_calendar_events" USING btree ("household_id");--> statement-breakpoint
CREATE INDEX "family_calendar_events_creator_idx" ON "family_calendar_events" USING btree ("created_by_member_id");