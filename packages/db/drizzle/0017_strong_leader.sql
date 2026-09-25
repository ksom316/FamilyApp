CREATE TABLE "family_emergency_acknowledgements" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"family_id" uuid NOT NULL,
	"incident_id" uuid NOT NULL,
	"member_id" uuid NOT NULL,
	"response_status" text DEFAULT 'seen' NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "family_emergency_acks_response_allowed" CHECK ("family_emergency_acknowledgements"."response_status" in ('seen', 'responding'))
);
--> statement-breakpoint
CREATE TABLE "family_emergency_incidents" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"family_id" uuid NOT NULL,
	"created_by_member_id" uuid NOT NULL,
	"emergency_type" text NOT NULL,
	"message" text,
	"status" text DEFAULT 'active' NOT NULL,
	"resolved_at" timestamp with time zone,
	"resolved_by_member_id" uuid,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "family_emergency_incidents_id_family_unique" UNIQUE("id","family_id"),
	CONSTRAINT "family_emergency_incidents_type_allowed" CHECK ("family_emergency_incidents"."emergency_type" in ('need_help', 'medical', 'safety_concern', 'other')),
	CONSTRAINT "family_emergency_incidents_status_allowed" CHECK ("family_emergency_incidents"."status" in ('active', 'resolved')),
	CONSTRAINT "family_emergency_incidents_message_length" CHECK ("family_emergency_incidents"."message" is null or (char_length("family_emergency_incidents"."message") between 1 and 300 and "family_emergency_incidents"."message" = btrim("family_emergency_incidents"."message"))),
	CONSTRAINT "family_emergency_incidents_resolution_consistency" CHECK (("family_emergency_incidents"."status" = 'resolved') = ("family_emergency_incidents"."resolved_at" is not null) and ("family_emergency_incidents"."resolved_at" is not null) = ("family_emergency_incidents"."resolved_by_member_id" is not null))
);
--> statement-breakpoint
ALTER TABLE "family_emergency_acknowledgements" ADD CONSTRAINT "family_emergency_acks_incident_family_fk" FOREIGN KEY ("incident_id","family_id") REFERENCES "public"."family_emergency_incidents"("id","family_id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "family_emergency_acknowledgements" ADD CONSTRAINT "family_emergency_acks_member_family_fk" FOREIGN KEY ("member_id","family_id") REFERENCES "public"."family_members"("id","family_id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "family_emergency_incidents" ADD CONSTRAINT "family_emergency_incidents_family_id_families_id_fk" FOREIGN KEY ("family_id") REFERENCES "public"."families"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "family_emergency_incidents" ADD CONSTRAINT "family_emergency_incidents_creator_family_fk" FOREIGN KEY ("created_by_member_id","family_id") REFERENCES "public"."family_members"("id","family_id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "family_emergency_incidents" ADD CONSTRAINT "family_emergency_incidents_resolver_family_fk" FOREIGN KEY ("resolved_by_member_id","family_id") REFERENCES "public"."family_members"("id","family_id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "family_emergency_acks_incident_member_unique" ON "family_emergency_acknowledgements" USING btree ("incident_id","member_id");--> statement-breakpoint
CREATE INDEX "family_emergency_acks_incident_idx" ON "family_emergency_acknowledgements" USING btree ("incident_id");--> statement-breakpoint
CREATE INDEX "family_emergency_incidents_family_status_idx" ON "family_emergency_incidents" USING btree ("family_id","status","created_at");