CREATE TABLE "family_shopping_items" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"family_id" uuid NOT NULL,
	"list_id" uuid NOT NULL,
	"name" text NOT NULL,
	"quantity" double precision,
	"unit" text,
	"note" text,
	"purchased_at" timestamp with time zone,
	"added_by_member_id" uuid NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "family_shopping_items_name_length" CHECK (char_length("family_shopping_items"."name") between 1 and 140 and "family_shopping_items"."name" = btrim("family_shopping_items"."name")),
	CONSTRAINT "family_shopping_items_unit_length" CHECK ("family_shopping_items"."unit" is null or (char_length("family_shopping_items"."unit") between 1 and 30 and "family_shopping_items"."unit" = btrim("family_shopping_items"."unit"))),
	CONSTRAINT "family_shopping_items_note_length" CHECK ("family_shopping_items"."note" is null or (char_length("family_shopping_items"."note") between 1 and 300 and "family_shopping_items"."note" = btrim("family_shopping_items"."note"))),
	CONSTRAINT "family_shopping_items_quantity_positive" CHECK ("family_shopping_items"."quantity" is null or "family_shopping_items"."quantity" > 0)
);
--> statement-breakpoint
CREATE TABLE "family_shopping_lists" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"family_id" uuid NOT NULL,
	"household_id" uuid,
	"created_by_member_id" uuid NOT NULL,
	"name" text NOT NULL,
	"description" text,
	"shopping_date" timestamp with time zone,
	"completed_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "family_shopping_lists_id_family_unique" UNIQUE("id","family_id"),
	CONSTRAINT "family_shopping_lists_name_length" CHECK (char_length("family_shopping_lists"."name") between 1 and 100 and "family_shopping_lists"."name" = btrim("family_shopping_lists"."name")),
	CONSTRAINT "family_shopping_lists_description_length" CHECK ("family_shopping_lists"."description" is null or (char_length("family_shopping_lists"."description") between 1 and 1000 and "family_shopping_lists"."description" = btrim("family_shopping_lists"."description")))
);
--> statement-breakpoint
ALTER TABLE "family_shopping_items" ADD CONSTRAINT "family_shopping_items_list_family_fk" FOREIGN KEY ("list_id","family_id") REFERENCES "public"."family_shopping_lists"("id","family_id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "family_shopping_items" ADD CONSTRAINT "family_shopping_items_added_by_family_fk" FOREIGN KEY ("added_by_member_id","family_id") REFERENCES "public"."family_members"("id","family_id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "family_shopping_lists" ADD CONSTRAINT "family_shopping_lists_family_id_families_id_fk" FOREIGN KEY ("family_id") REFERENCES "public"."families"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "family_shopping_lists" ADD CONSTRAINT "family_shopping_lists_creator_family_fk" FOREIGN KEY ("created_by_member_id","family_id") REFERENCES "public"."family_members"("id","family_id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "family_shopping_lists" ADD CONSTRAINT "family_shopping_lists_household_family_fk" FOREIGN KEY ("household_id","family_id") REFERENCES "public"."households"("id","family_id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "family_shopping_items_list_idx" ON "family_shopping_items" USING btree ("list_id");--> statement-breakpoint
CREATE INDEX "family_shopping_items_list_purchased_idx" ON "family_shopping_items" USING btree ("list_id","purchased_at");--> statement-breakpoint
CREATE INDEX "family_shopping_items_added_by_idx" ON "family_shopping_items" USING btree ("added_by_member_id");--> statement-breakpoint
CREATE INDEX "family_shopping_lists_family_created_at_idx" ON "family_shopping_lists" USING btree ("family_id","created_at");--> statement-breakpoint
CREATE INDEX "family_shopping_lists_household_idx" ON "family_shopping_lists" USING btree ("household_id");--> statement-breakpoint
CREATE INDEX "family_shopping_lists_family_completed_idx" ON "family_shopping_lists" USING btree ("family_id","completed_at");--> statement-breakpoint
CREATE INDEX "family_shopping_lists_creator_idx" ON "family_shopping_lists" USING btree ("created_by_member_id");