CREATE TABLE "family_time_capsule_attachments" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"family_id" uuid NOT NULL,
	"capsule_id" uuid NOT NULL,
	"object_key" text NOT NULL,
	"mime_type" text NOT NULL,
	"file_size_bytes" integer NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "family_time_capsule_attachments_object_key_unique" UNIQUE("object_key"),
	CONSTRAINT "family_time_capsule_attachments_file_size_positive" CHECK ("family_time_capsule_attachments"."file_size_bytes" > 0)
);
--> statement-breakpoint
ALTER TABLE "family_time_capsule_attachments" ADD CONSTRAINT "family_time_capsule_attachments_capsule_family_fk" FOREIGN KEY ("capsule_id","family_id") REFERENCES "public"."family_time_capsules"("id","family_id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "family_time_capsule_attachments_capsule_idx" ON "family_time_capsule_attachments" USING btree ("capsule_id");