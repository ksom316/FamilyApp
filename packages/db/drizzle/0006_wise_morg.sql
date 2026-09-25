CREATE TABLE "family_time_capsule_memories" (
	"family_id" uuid NOT NULL,
	"capsule_id" uuid NOT NULL,
	"memory_id" uuid NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "family_time_capsules" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"family_id" uuid NOT NULL,
	"created_by_member_id" uuid NOT NULL,
	"title" text NOT NULL,
	"message" text,
	"unlock_at" timestamp with time zone NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "family_time_capsules_id_family_unique" UNIQUE("id","family_id"),
	CONSTRAINT "family_time_capsules_title_length" CHECK (char_length("family_time_capsules"."title") between 1 and 120 and "family_time_capsules"."title" = btrim("family_time_capsules"."title")),
	CONSTRAINT "family_time_capsules_message_length" CHECK ("family_time_capsules"."message" is null or (char_length("family_time_capsules"."message") between 1 and 5000 and "family_time_capsules"."message" = btrim("family_time_capsules"."message"))),
	CONSTRAINT "family_time_capsules_unlock_after_creation" CHECK ("family_time_capsules"."unlock_at" > "family_time_capsules"."created_at")
);
--> statement-breakpoint
ALTER TABLE "family_time_capsule_memories" ADD CONSTRAINT "family_time_capsule_memories_capsule_family_fk" FOREIGN KEY ("capsule_id","family_id") REFERENCES "public"."family_time_capsules"("id","family_id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "family_time_capsule_memories" ADD CONSTRAINT "family_time_capsule_memories_memory_family_fk" FOREIGN KEY ("memory_id","family_id") REFERENCES "public"."family_memories"("id","family_id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "family_time_capsules" ADD CONSTRAINT "family_time_capsules_family_id_families_id_fk" FOREIGN KEY ("family_id") REFERENCES "public"."families"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "family_time_capsules" ADD CONSTRAINT "family_time_capsules_creator_family_fk" FOREIGN KEY ("created_by_member_id","family_id") REFERENCES "public"."family_members"("id","family_id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "family_time_capsule_memories_capsule_memory_unique" ON "family_time_capsule_memories" USING btree ("capsule_id","memory_id");--> statement-breakpoint
CREATE INDEX "family_time_capsule_memories_memory_idx" ON "family_time_capsule_memories" USING btree ("memory_id");--> statement-breakpoint
CREATE INDEX "family_time_capsules_family_unlock_at_idx" ON "family_time_capsules" USING btree ("family_id","unlock_at");--> statement-breakpoint
CREATE INDEX "family_time_capsules_creator_idx" ON "family_time_capsules" USING btree ("created_by_member_id");