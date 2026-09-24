CREATE TABLE "family_events" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"family_id" uuid NOT NULL,
	"created_by_member_id" uuid NOT NULL,
	"title" text NOT NULL,
	"description" text,
	"starts_at" timestamp with time zone NOT NULL,
	"ends_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "family_events_end_after_start" CHECK ("family_events"."ends_at" is null or "family_events"."ends_at" >= "family_events"."starts_at")
);
--> statement-breakpoint
CREATE TABLE "family_tasks" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"family_id" uuid NOT NULL,
	"created_by_member_id" uuid NOT NULL,
	"assigned_member_id" uuid,
	"title" text NOT NULL,
	"description" text,
	"due_at" timestamp with time zone NOT NULL,
	"completed_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "family_events" ADD CONSTRAINT "family_events_family_id_families_id_fk" FOREIGN KEY ("family_id") REFERENCES "public"."families"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "family_events" ADD CONSTRAINT "family_events_creator_family_fk" FOREIGN KEY ("created_by_member_id","family_id") REFERENCES "public"."family_members"("id","family_id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "family_tasks" ADD CONSTRAINT "family_tasks_family_id_families_id_fk" FOREIGN KEY ("family_id") REFERENCES "public"."families"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "family_tasks" ADD CONSTRAINT "family_tasks_creator_family_fk" FOREIGN KEY ("created_by_member_id","family_id") REFERENCES "public"."family_members"("id","family_id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "family_tasks" ADD CONSTRAINT "family_tasks_assignee_family_fk" FOREIGN KEY ("assigned_member_id","family_id") REFERENCES "public"."family_members"("id","family_id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "family_events_family_starts_at_idx" ON "family_events" USING btree ("family_id","starts_at");--> statement-breakpoint
CREATE INDEX "family_events_creator_idx" ON "family_events" USING btree ("created_by_member_id");--> statement-breakpoint
CREATE INDEX "family_tasks_family_due_at_idx" ON "family_tasks" USING btree ("family_id","due_at");--> statement-breakpoint
CREATE INDEX "family_tasks_family_completed_at_idx" ON "family_tasks" USING btree ("family_id","completed_at");--> statement-breakpoint
CREATE INDEX "family_tasks_creator_idx" ON "family_tasks" USING btree ("created_by_member_id");--> statement-breakpoint
CREATE INDEX "family_tasks_assignee_idx" ON "family_tasks" USING btree ("assigned_member_id");