CREATE TABLE "family_menu_meals" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"family_id" uuid NOT NULL,
	"menu_id" uuid NOT NULL,
	"meal_date" date NOT NULL,
	"meal_type" text NOT NULL,
	"meal_name" text NOT NULL,
	"note" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "family_menu_meals_type_allowed" CHECK ("family_menu_meals"."meal_type" in ('breakfast', 'lunch', 'dinner')),
	CONSTRAINT "family_menu_meals_name_length" CHECK (char_length("family_menu_meals"."meal_name") between 1 and 140 and "family_menu_meals"."meal_name" = btrim("family_menu_meals"."meal_name")),
	CONSTRAINT "family_menu_meals_note_length" CHECK ("family_menu_meals"."note" is null or (char_length("family_menu_meals"."note") between 1 and 300 and "family_menu_meals"."note" = btrim("family_menu_meals"."note")))
);
--> statement-breakpoint
CREATE TABLE "family_menus" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"family_id" uuid NOT NULL,
	"household_id" uuid,
	"created_by_member_id" uuid NOT NULL,
	"week_start_date" date NOT NULL,
	"title" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "family_menus_id_family_unique" UNIQUE("id","family_id"),
	CONSTRAINT "family_menus_family_household_week_unique" UNIQUE("family_id","household_id","week_start_date"),
	CONSTRAINT "family_menus_week_start_is_monday" CHECK (extract(dow from "family_menus"."week_start_date") = 1),
	CONSTRAINT "family_menus_title_length" CHECK ("family_menus"."title" is null or (char_length("family_menus"."title") between 1 and 100 and "family_menus"."title" = btrim("family_menus"."title")))
);
--> statement-breakpoint
ALTER TABLE "family_menu_meals" ADD CONSTRAINT "family_menu_meals_menu_family_fk" FOREIGN KEY ("menu_id","family_id") REFERENCES "public"."family_menus"("id","family_id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "family_menus" ADD CONSTRAINT "family_menus_family_id_families_id_fk" FOREIGN KEY ("family_id") REFERENCES "public"."families"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "family_menus" ADD CONSTRAINT "family_menus_creator_family_fk" FOREIGN KEY ("created_by_member_id","family_id") REFERENCES "public"."family_members"("id","family_id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "family_menus" ADD CONSTRAINT "family_menus_household_family_fk" FOREIGN KEY ("household_id","family_id") REFERENCES "public"."households"("id","family_id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "family_menu_meals_menu_date_type_unique" ON "family_menu_meals" USING btree ("menu_id","meal_date","meal_type");--> statement-breakpoint
CREATE INDEX "family_menu_meals_menu_idx" ON "family_menu_meals" USING btree ("menu_id");--> statement-breakpoint
CREATE INDEX "family_menus_family_week_idx" ON "family_menus" USING btree ("family_id","week_start_date");--> statement-breakpoint
CREATE INDEX "family_menus_household_idx" ON "family_menus" USING btree ("household_id");--> statement-breakpoint
CREATE INDEX "family_menus_creator_idx" ON "family_menus" USING btree ("created_by_member_id");