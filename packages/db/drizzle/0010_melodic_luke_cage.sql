CREATE TABLE "family_poll_options" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"family_id" uuid NOT NULL,
	"poll_id" uuid NOT NULL,
	"text" text NOT NULL,
	"position" integer NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "family_poll_options_id_poll_unique" UNIQUE("id","poll_id"),
	CONSTRAINT "family_poll_options_text_length" CHECK (char_length("family_poll_options"."text") between 1 and 140 and "family_poll_options"."text" = btrim("family_poll_options"."text")),
	CONSTRAINT "family_poll_options_position_range" CHECK ("family_poll_options"."position" between 0 and 9)
);
--> statement-breakpoint
CREATE TABLE "family_poll_votes" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"family_id" uuid NOT NULL,
	"poll_id" uuid NOT NULL,
	"member_id" uuid NOT NULL,
	"option_id" uuid NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "family_polls" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"family_id" uuid NOT NULL,
	"household_id" uuid,
	"created_by_member_id" uuid NOT NULL,
	"question" text NOT NULL,
	"description" text,
	"closes_at" timestamp with time zone,
	"closed_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "family_polls_id_family_unique" UNIQUE("id","family_id"),
	CONSTRAINT "family_polls_question_length" CHECK (char_length("family_polls"."question") between 1 and 200 and "family_polls"."question" = btrim("family_polls"."question")),
	CONSTRAINT "family_polls_description_length" CHECK ("family_polls"."description" is null or (char_length("family_polls"."description") between 1 and 1000 and "family_polls"."description" = btrim("family_polls"."description"))),
	CONSTRAINT "family_polls_closes_after_creation" CHECK ("family_polls"."closes_at" is null or "family_polls"."closes_at" > "family_polls"."created_at")
);
--> statement-breakpoint
ALTER TABLE "family_poll_options" ADD CONSTRAINT "family_poll_options_poll_family_fk" FOREIGN KEY ("poll_id","family_id") REFERENCES "public"."family_polls"("id","family_id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "family_poll_votes" ADD CONSTRAINT "family_poll_votes_poll_family_fk" FOREIGN KEY ("poll_id","family_id") REFERENCES "public"."family_polls"("id","family_id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "family_poll_votes" ADD CONSTRAINT "family_poll_votes_member_family_fk" FOREIGN KEY ("member_id","family_id") REFERENCES "public"."family_members"("id","family_id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "family_poll_votes" ADD CONSTRAINT "family_poll_votes_option_poll_fk" FOREIGN KEY ("option_id","poll_id") REFERENCES "public"."family_poll_options"("id","poll_id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "family_polls" ADD CONSTRAINT "family_polls_family_id_families_id_fk" FOREIGN KEY ("family_id") REFERENCES "public"."families"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "family_polls" ADD CONSTRAINT "family_polls_creator_family_fk" FOREIGN KEY ("created_by_member_id","family_id") REFERENCES "public"."family_members"("id","family_id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "family_polls" ADD CONSTRAINT "family_polls_household_family_fk" FOREIGN KEY ("household_id","family_id") REFERENCES "public"."households"("id","family_id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "family_poll_options_poll_position_unique" ON "family_poll_options" USING btree ("poll_id","position");--> statement-breakpoint
CREATE INDEX "family_poll_options_poll_idx" ON "family_poll_options" USING btree ("poll_id");--> statement-breakpoint
CREATE UNIQUE INDEX "family_poll_votes_poll_member_unique" ON "family_poll_votes" USING btree ("poll_id","member_id");--> statement-breakpoint
CREATE INDEX "family_poll_votes_option_idx" ON "family_poll_votes" USING btree ("option_id");--> statement-breakpoint
CREATE INDEX "family_polls_family_created_at_idx" ON "family_polls" USING btree ("family_id","created_at");--> statement-breakpoint
CREATE INDEX "family_polls_household_idx" ON "family_polls" USING btree ("household_id");--> statement-breakpoint
CREATE INDEX "family_polls_creator_idx" ON "family_polls" USING btree ("created_by_member_id");--> statement-breakpoint
CREATE INDEX "family_polls_closes_at_idx" ON "family_polls" USING btree ("closes_at");