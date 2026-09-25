CREATE TABLE "family_chat_read_states" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"family_id" uuid NOT NULL,
	"member_id" uuid NOT NULL,
	"last_read_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "family_chat_read_states" ADD CONSTRAINT "family_chat_read_states_member_family_fk" FOREIGN KEY ("member_id","family_id") REFERENCES "public"."family_members"("id","family_id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "family_chat_read_states_family_member_unique" ON "family_chat_read_states" USING btree ("family_id","member_id");