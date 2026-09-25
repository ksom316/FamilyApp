CREATE TABLE "family_notifications" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"family_id" uuid NOT NULL,
	"recipient_member_id" uuid NOT NULL,
	"actor_member_id" uuid,
	"type" text NOT NULL,
	"title" text NOT NULL,
	"message" text,
	"entity_type" text,
	"entity_id" uuid,
	"route" text,
	"read_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "family_notifications_title_length" CHECK (char_length("family_notifications"."title") between 1 and 140),
	CONSTRAINT "family_notifications_message_length" CHECK ("family_notifications"."message" is null or char_length("family_notifications"."message") between 1 and 300),
	CONSTRAINT "family_notifications_route_length" CHECK ("family_notifications"."route" is null or char_length("family_notifications"."route") between 1 and 200)
);
--> statement-breakpoint
ALTER TABLE "family_notifications" ADD CONSTRAINT "family_notifications_family_id_families_id_fk" FOREIGN KEY ("family_id") REFERENCES "public"."families"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "family_notifications" ADD CONSTRAINT "family_notifications_recipient_family_fk" FOREIGN KEY ("recipient_member_id","family_id") REFERENCES "public"."family_members"("id","family_id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "family_notifications" ADD CONSTRAINT "family_notifications_actor_family_fk" FOREIGN KEY ("actor_member_id","family_id") REFERENCES "public"."family_members"("id","family_id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "family_notifications_recipient_created_idx" ON "family_notifications" USING btree ("recipient_member_id","created_at");--> statement-breakpoint
CREATE INDEX "family_notifications_recipient_unread_idx" ON "family_notifications" USING btree ("recipient_member_id","read_at");