CREATE TABLE "family_private_conversation_participants" (
	"conversation_id" uuid NOT NULL,
	"family_id" uuid NOT NULL,
	"member_id" uuid NOT NULL,
	"last_read_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "family_private_conversation_participants_identity_unique" UNIQUE("conversation_id","family_id","member_id")
);
--> statement-breakpoint
CREATE TABLE "family_private_conversations" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"family_id" uuid NOT NULL,
	"member_one_id" uuid NOT NULL,
	"member_two_id" uuid NOT NULL,
	"last_message_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "family_private_conversations_id_family_unique" UNIQUE("id","family_id"),
	CONSTRAINT "family_private_conversations_canonical_pair" CHECK ("family_private_conversations"."member_one_id" < "family_private_conversations"."member_two_id")
);
--> statement-breakpoint
CREATE TABLE "family_private_messages" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"family_id" uuid NOT NULL,
	"conversation_id" uuid NOT NULL,
	"sender_member_id" uuid NOT NULL,
	"text" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "family_private_messages_text_length" CHECK (char_length("family_private_messages"."text") between 1 and 2000 and "family_private_messages"."text" = btrim("family_private_messages"."text"))
);
--> statement-breakpoint
ALTER TABLE "family_private_conversation_participants" ADD CONSTRAINT "family_private_conversation_participants_conversation_family_fk" FOREIGN KEY ("conversation_id","family_id") REFERENCES "public"."family_private_conversations"("id","family_id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "family_private_conversation_participants" ADD CONSTRAINT "family_private_conversation_participants_member_family_fk" FOREIGN KEY ("member_id","family_id") REFERENCES "public"."family_members"("id","family_id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "family_private_conversations" ADD CONSTRAINT "family_private_conversations_member_one_family_fk" FOREIGN KEY ("member_one_id","family_id") REFERENCES "public"."family_members"("id","family_id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "family_private_conversations" ADD CONSTRAINT "family_private_conversations_member_two_family_fk" FOREIGN KEY ("member_two_id","family_id") REFERENCES "public"."family_members"("id","family_id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "family_private_messages" ADD CONSTRAINT "family_private_messages_sender_participant_fk" FOREIGN KEY ("conversation_id","family_id","sender_member_id") REFERENCES "public"."family_private_conversation_participants"("conversation_id","family_id","member_id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "family_private_conversation_participants_member_idx" ON "family_private_conversation_participants" USING btree ("family_id","member_id");--> statement-breakpoint
CREATE UNIQUE INDEX "family_private_conversations_pair_unique" ON "family_private_conversations" USING btree ("family_id","member_one_id","member_two_id");--> statement-breakpoint
CREATE INDEX "family_private_conversations_family_activity_idx" ON "family_private_conversations" USING btree ("family_id","last_message_at");--> statement-breakpoint
CREATE INDEX "family_private_messages_conversation_created_at_idx" ON "family_private_messages" USING btree ("conversation_id","created_at");--> statement-breakpoint
CREATE INDEX "family_private_messages_sender_idx" ON "family_private_messages" USING btree ("sender_member_id");