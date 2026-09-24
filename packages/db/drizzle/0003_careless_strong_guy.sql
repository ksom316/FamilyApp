CREATE TABLE "family_messages" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"family_id" uuid NOT NULL,
	"sender_member_id" uuid NOT NULL,
	"text" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "family_messages_text_length" CHECK (char_length("family_messages"."text") between 1 and 2000 and "family_messages"."text" = btrim("family_messages"."text"))
);
--> statement-breakpoint
ALTER TABLE "family_messages" ADD CONSTRAINT "family_messages_family_id_families_id_fk" FOREIGN KEY ("family_id") REFERENCES "public"."families"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "family_messages" ADD CONSTRAINT "family_messages_sender_family_fk" FOREIGN KEY ("sender_member_id","family_id") REFERENCES "public"."family_members"("id","family_id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "family_messages_family_created_at_idx" ON "family_messages" USING btree ("family_id","created_at");--> statement-breakpoint
CREATE INDEX "family_messages_sender_idx" ON "family_messages" USING btree ("sender_member_id");