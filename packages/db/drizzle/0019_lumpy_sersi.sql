CREATE TABLE "family_chore_assignments" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"family_id" uuid NOT NULL,
	"chore_id" uuid NOT NULL,
	"member_id" uuid NOT NULL,
	"completed_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "family_chores" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"family_id" uuid NOT NULL,
	"created_by_member_id" uuid NOT NULL,
	"audience_type" text DEFAULT 'family' NOT NULL,
	"household_id" uuid,
	"title" text NOT NULL,
	"description" text,
	"due_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "family_chores_id_family_unique" UNIQUE("id","family_id"),
	CONSTRAINT "family_chores_title_length" CHECK (char_length("family_chores"."title") between 1 and 140 and "family_chores"."title" = btrim("family_chores"."title")),
	CONSTRAINT "family_chores_description_length" CHECK ("family_chores"."description" is null or (char_length("family_chores"."description") between 1 and 2000 and "family_chores"."description" = btrim("family_chores"."description"))),
	CONSTRAINT "family_chores_audience_type_allowed" CHECK ("family_chores"."audience_type" in ('family', 'household', 'members')),
	CONSTRAINT "family_chores_household_consistency" CHECK (("family_chores"."audience_type" = 'household') = ("family_chores"."household_id" is not null))
);
--> statement-breakpoint
ALTER TABLE "family_chore_assignments" ADD CONSTRAINT "family_chore_assignments_chore_family_fk" FOREIGN KEY ("chore_id","family_id") REFERENCES "public"."family_chores"("id","family_id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "family_chore_assignments" ADD CONSTRAINT "family_chore_assignments_member_family_fk" FOREIGN KEY ("member_id","family_id") REFERENCES "public"."family_members"("id","family_id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "family_chores" ADD CONSTRAINT "family_chores_family_id_families_id_fk" FOREIGN KEY ("family_id") REFERENCES "public"."families"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "family_chores" ADD CONSTRAINT "family_chores_creator_family_fk" FOREIGN KEY ("created_by_member_id","family_id") REFERENCES "public"."family_members"("id","family_id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "family_chores" ADD CONSTRAINT "family_chores_household_family_fk" FOREIGN KEY ("household_id","family_id") REFERENCES "public"."households"("id","family_id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "family_chore_assignments_chore_member_unique" ON "family_chore_assignments" USING btree ("chore_id","member_id");--> statement-breakpoint
CREATE INDEX "family_chore_assignments_member_completed_idx" ON "family_chore_assignments" USING btree ("member_id","completed_at");--> statement-breakpoint
CREATE INDEX "family_chore_assignments_chore_idx" ON "family_chore_assignments" USING btree ("chore_id");--> statement-breakpoint
CREATE INDEX "family_chores_family_due_at_idx" ON "family_chores" USING btree ("family_id","due_at");--> statement-breakpoint
CREATE INDEX "family_chores_creator_idx" ON "family_chores" USING btree ("created_by_member_id");--> statement-breakpoint
CREATE INDEX "family_chores_household_idx" ON "family_chores" USING btree ("household_id");