CREATE TYPE "public"."memory_media_type" AS ENUM('image');--> statement-breakpoint
CREATE TABLE "family_memories" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"family_id" uuid NOT NULL,
	"created_by_member_id" uuid NOT NULL,
	"title" text,
	"memory_date" date NOT NULL,
	"media_type" "memory_media_type" DEFAULT 'image' NOT NULL,
	"object_key" text NOT NULL,
	"mime_type" text NOT NULL,
	"file_size_bytes" integer NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "family_memories_id_family_unique" UNIQUE("id","family_id"),
	CONSTRAINT "family_memories_object_key_unique" UNIQUE("object_key"),
	CONSTRAINT "family_memories_title_length" CHECK ("family_memories"."title" is null or char_length("family_memories"."title") between 1 and 120),
	CONSTRAINT "family_memories_file_size_positive" CHECK ("family_memories"."file_size_bytes" > 0)
);
--> statement-breakpoint
CREATE TABLE "family_memory_favorites" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"family_id" uuid NOT NULL,
	"memory_id" uuid NOT NULL,
	"member_id" uuid NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "family_memories" ADD CONSTRAINT "family_memories_family_id_families_id_fk" FOREIGN KEY ("family_id") REFERENCES "public"."families"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "family_memories" ADD CONSTRAINT "family_memories_creator_family_fk" FOREIGN KEY ("created_by_member_id","family_id") REFERENCES "public"."family_members"("id","family_id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "family_memory_favorites" ADD CONSTRAINT "family_memory_favorites_family_id_families_id_fk" FOREIGN KEY ("family_id") REFERENCES "public"."families"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "family_memory_favorites" ADD CONSTRAINT "family_memory_favorites_memory_family_fk" FOREIGN KEY ("memory_id","family_id") REFERENCES "public"."family_memories"("id","family_id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "family_memory_favorites" ADD CONSTRAINT "family_memory_favorites_member_family_fk" FOREIGN KEY ("member_id","family_id") REFERENCES "public"."family_members"("id","family_id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "family_memories_family_memory_date_idx" ON "family_memories" USING btree ("family_id","memory_date");--> statement-breakpoint
CREATE INDEX "family_memories_creator_idx" ON "family_memories" USING btree ("created_by_member_id");--> statement-breakpoint
CREATE UNIQUE INDEX "family_memory_favorites_memory_member_unique" ON "family_memory_favorites" USING btree ("memory_id","member_id");--> statement-breakpoint
CREATE INDEX "family_memory_favorites_member_idx" ON "family_memory_favorites" USING btree ("member_id");