ALTER TABLE "users" ADD COLUMN "identity_type" text DEFAULT 'initials' NOT NULL;--> statement-breakpoint
ALTER TABLE "users" ADD COLUMN "avatar_config" jsonb;--> statement-breakpoint
ALTER TABLE "users" ADD COLUMN "photo_object_key" text;--> statement-breakpoint
ALTER TABLE "users" ADD COLUMN "photo_mime_type" text;--> statement-breakpoint
ALTER TABLE "users" ADD CONSTRAINT "users_identity_type_allowed" CHECK ("users"."identity_type" in ('photo', 'avatar', 'initials'));--> statement-breakpoint
ALTER TABLE "users" ADD CONSTRAINT "users_photo_requires_key" CHECK ("users"."identity_type" <> 'photo' or "users"."photo_object_key" is not null);--> statement-breakpoint
ALTER TABLE "users" ADD CONSTRAINT "users_avatar_requires_config" CHECK ("users"."identity_type" <> 'avatar' or "users"."avatar_config" is not null);