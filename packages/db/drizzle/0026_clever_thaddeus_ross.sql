CREATE TABLE "web_push_subscriptions" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_id" uuid NOT NULL,
	"endpoint" text NOT NULL,
	"p256dh" text NOT NULL,
	"auth" text NOT NULL,
	"last_seen_at" timestamp with time zone DEFAULT now() NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "web_push_subscriptions_endpoint_length" CHECK (char_length("web_push_subscriptions"."endpoint") between 32 and 2048),
	CONSTRAINT "web_push_subscriptions_p256dh_length" CHECK (char_length("web_push_subscriptions"."p256dh") between 40 and 256),
	CONSTRAINT "web_push_subscriptions_auth_length" CHECK (char_length("web_push_subscriptions"."auth") between 8 and 128)
);
--> statement-breakpoint
ALTER TABLE "web_push_subscriptions" ADD CONSTRAINT "web_push_subscriptions_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "web_push_subscriptions_endpoint_unique" ON "web_push_subscriptions" USING btree ("endpoint");--> statement-breakpoint
CREATE INDEX "web_push_subscriptions_user_idx" ON "web_push_subscriptions" USING btree ("user_id");