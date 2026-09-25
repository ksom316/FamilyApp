CREATE TABLE "family_check_ins" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"family_id" uuid NOT NULL,
	"member_id" uuid NOT NULL,
	"status" text NOT NULL,
	"message" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "family_check_ins_status_allowed" CHECK ("family_check_ins"."status" in ('safe', 'arrived')),
	CONSTRAINT "family_check_ins_message_length" CHECK ("family_check_ins"."message" is null or (char_length("family_check_ins"."message") between 1 and 200 and "family_check_ins"."message" = btrim("family_check_ins"."message")))
);
--> statement-breakpoint
ALTER TABLE "family_check_ins" ADD CONSTRAINT "family_check_ins_family_id_families_id_fk" FOREIGN KEY ("family_id") REFERENCES "public"."families"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "family_check_ins" ADD CONSTRAINT "family_check_ins_member_family_fk" FOREIGN KEY ("member_id","family_id") REFERENCES "public"."family_members"("id","family_id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "family_check_ins_family_created_idx" ON "family_check_ins" USING btree ("family_id","created_at");