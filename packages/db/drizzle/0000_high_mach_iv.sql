CREATE TYPE "public"."family_role" AS ENUM('owner', 'guardian', 'member');--> statement-breakpoint
CREATE TABLE "families" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"name" text NOT NULL,
	"created_by" uuid NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "family_invitations" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"family_id" uuid NOT NULL,
	"inviter_member_id" uuid NOT NULL,
	"role" "family_role" DEFAULT 'member' NOT NULL,
	"token_hash" varchar(64) NOT NULL,
	"expires_at" timestamp with time zone NOT NULL,
	"accepted_at" timestamp with time zone,
	"revoked_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "family_invitations_expiry_after_creation" CHECK ("family_invitations"."expires_at" > "family_invitations"."created_at"),
	CONSTRAINT "family_invitations_single_terminal_state" CHECK (not ("family_invitations"."accepted_at" is not null and "family_invitations"."revoked_at" is not null))
);
--> statement-breakpoint
CREATE TABLE "family_members" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"family_id" uuid NOT NULL,
	"user_id" uuid NOT NULL,
	"role" "family_role" DEFAULT 'member' NOT NULL,
	"joined_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "family_members_id_family_unique" UNIQUE("id","family_id")
);
--> statement-breakpoint
CREATE TABLE "household_members" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"family_id" uuid NOT NULL,
	"household_id" uuid NOT NULL,
	"family_member_id" uuid NOT NULL,
	"joined_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "households" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"family_id" uuid NOT NULL,
	"name" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "households_id_family_unique" UNIQUE("id","family_id")
);
--> statement-breakpoint
CREATE TABLE "users" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"display_name" text NOT NULL,
	"avatar_url" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "families" ADD CONSTRAINT "families_created_by_users_id_fk" FOREIGN KEY ("created_by") REFERENCES "public"."users"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "family_invitations" ADD CONSTRAINT "family_invitations_inviter_family_fk" FOREIGN KEY ("inviter_member_id","family_id") REFERENCES "public"."family_members"("id","family_id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "family_members" ADD CONSTRAINT "family_members_family_id_families_id_fk" FOREIGN KEY ("family_id") REFERENCES "public"."families"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "family_members" ADD CONSTRAINT "family_members_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "household_members" ADD CONSTRAINT "household_members_household_family_fk" FOREIGN KEY ("household_id","family_id") REFERENCES "public"."households"("id","family_id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "household_members" ADD CONSTRAINT "household_members_member_family_fk" FOREIGN KEY ("family_member_id","family_id") REFERENCES "public"."family_members"("id","family_id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "households" ADD CONSTRAINT "households_family_id_families_id_fk" FOREIGN KEY ("family_id") REFERENCES "public"."families"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "families_created_by_idx" ON "families" USING btree ("created_by");--> statement-breakpoint
CREATE UNIQUE INDEX "family_invitations_token_hash_unique" ON "family_invitations" USING btree ("token_hash");--> statement-breakpoint
CREATE INDEX "family_invitations_family_idx" ON "family_invitations" USING btree ("family_id");--> statement-breakpoint
CREATE UNIQUE INDEX "family_members_family_user_unique" ON "family_members" USING btree ("family_id","user_id");--> statement-breakpoint
CREATE INDEX "family_members_family_idx" ON "family_members" USING btree ("family_id");--> statement-breakpoint
CREATE INDEX "family_members_user_idx" ON "family_members" USING btree ("user_id");--> statement-breakpoint
CREATE UNIQUE INDEX "household_members_household_member_unique" ON "household_members" USING btree ("household_id","family_member_id");--> statement-breakpoint
CREATE INDEX "household_members_member_idx" ON "household_members" USING btree ("family_member_id");--> statement-breakpoint
CREATE INDEX "households_family_idx" ON "households" USING btree ("family_id");