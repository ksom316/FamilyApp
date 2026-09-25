CREATE TABLE "family_saved_menu_meals" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"family_id" uuid NOT NULL,
	"saved_menu_id" uuid NOT NULL,
	"day_of_week" integer NOT NULL,
	"meal_type" text NOT NULL,
	"meal_name" text NOT NULL,
	"note" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "family_saved_menu_meals_day_range" CHECK ("family_saved_menu_meals"."day_of_week" between 0 and 6),
	CONSTRAINT "family_saved_menu_meals_type_allowed" CHECK ("family_saved_menu_meals"."meal_type" in ('breakfast', 'lunch', 'dinner')),
	CONSTRAINT "family_saved_menu_meals_name_length" CHECK (char_length("family_saved_menu_meals"."meal_name") between 1 and 140 and "family_saved_menu_meals"."meal_name" = btrim("family_saved_menu_meals"."meal_name")),
	CONSTRAINT "family_saved_menu_meals_note_length" CHECK ("family_saved_menu_meals"."note" is null or (char_length("family_saved_menu_meals"."note") between 1 and 300 and "family_saved_menu_meals"."note" = btrim("family_saved_menu_meals"."note")))
);
--> statement-breakpoint
CREATE TABLE "family_saved_menus" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"family_id" uuid NOT NULL,
	"household_id" uuid,
	"created_by_member_id" uuid NOT NULL,
	"name" text NOT NULL,
	"description" text,
	"is_active" boolean DEFAULT false NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "family_saved_menus_id_family_unique" UNIQUE("id","family_id"),
	CONSTRAINT "family_saved_menus_name_length" CHECK (char_length("family_saved_menus"."name") between 1 and 100 and "family_saved_menus"."name" = btrim("family_saved_menus"."name")),
	CONSTRAINT "family_saved_menus_description_length" CHECK ("family_saved_menus"."description" is null or (char_length("family_saved_menus"."description") between 1 and 500 and "family_saved_menus"."description" = btrim("family_saved_menus"."description")))
);
--> statement-breakpoint
ALTER TABLE "family_saved_menu_meals" ADD CONSTRAINT "family_saved_menu_meals_menu_family_fk" FOREIGN KEY ("saved_menu_id","family_id") REFERENCES "public"."family_saved_menus"("id","family_id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "family_saved_menus" ADD CONSTRAINT "family_saved_menus_family_id_families_id_fk" FOREIGN KEY ("family_id") REFERENCES "public"."families"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "family_saved_menus" ADD CONSTRAINT "family_saved_menus_creator_family_fk" FOREIGN KEY ("created_by_member_id","family_id") REFERENCES "public"."family_members"("id","family_id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "family_saved_menus" ADD CONSTRAINT "family_saved_menus_household_family_fk" FOREIGN KEY ("household_id","family_id") REFERENCES "public"."households"("id","family_id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "family_saved_menu_meals_menu_day_type_unique" ON "family_saved_menu_meals" USING btree ("saved_menu_id","day_of_week","meal_type");--> statement-breakpoint
CREATE INDEX "family_saved_menu_meals_menu_idx" ON "family_saved_menu_meals" USING btree ("saved_menu_id");--> statement-breakpoint
CREATE UNIQUE INDEX "family_saved_menus_active_target_unique" ON "family_saved_menus" USING btree ("family_id","household_id") WHERE "family_saved_menus"."is_active" = true;--> statement-breakpoint
CREATE INDEX "family_saved_menus_family_idx" ON "family_saved_menus" USING btree ("family_id");--> statement-breakpoint
CREATE INDEX "family_saved_menus_household_idx" ON "family_saved_menus" USING btree ("household_id");--> statement-breakpoint
CREATE INDEX "family_saved_menus_creator_idx" ON "family_saved_menus" USING btree ("created_by_member_id");