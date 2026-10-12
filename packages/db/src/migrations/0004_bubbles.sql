CREATE TABLE "bubble_invitations" (
	"bubble_id" uuid NOT NULL,
	"user_id" uuid NOT NULL,
	"invited_by" uuid,
	"created_at" timestamp DEFAULT now() NOT NULL,
	CONSTRAINT "bubble_invitations_bubble_id_user_id_pk" PRIMARY KEY("bubble_id","user_id")
);
--> statement-breakpoint
CREATE TABLE "bubble_members" (
	"bubble_id" uuid NOT NULL,
	"user_id" uuid NOT NULL,
	"as_trait" boolean DEFAULT true NOT NULL,
	"joined_at" timestamp DEFAULT now() NOT NULL,
	CONSTRAINT "bubble_members_bubble_id_user_id_pk" PRIMARY KEY("bubble_id","user_id")
);
--> statement-breakpoint
CREATE TABLE "bubbles" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"name" varchar(80) NOT NULL,
	"color" varchar(7) NOT NULL,
	"description" text DEFAULT '' NOT NULL,
	"invite_token" varchar(32) NOT NULL,
	"created_by" uuid,
	"created_at" timestamp DEFAULT now() NOT NULL,
	CONSTRAINT "bubbles_invite_token_unique" UNIQUE("invite_token")
);
--> statement-breakpoint
CREATE TABLE "direct_messages" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"from_id" uuid NOT NULL,
	"to_id" uuid NOT NULL,
	"body" text NOT NULL,
	"read_at" timestamp,
	"created_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "interests" (
	"user_id" uuid NOT NULL,
	"key" varchar(60) NOT NULL,
	"label" varchar(40) NOT NULL,
	CONSTRAINT "interests_user_id_key_pk" PRIMARY KEY("user_id","key")
);
--> statement-breakpoint
CREATE TABLE "matches_seen" (
	"user_id" uuid NOT NULL,
	"other_id" uuid NOT NULL,
	CONSTRAINT "matches_seen_user_id_other_id_pk" PRIMARY KEY("user_id","other_id")
);
--> statement-breakpoint
CREATE TABLE "nostr_challenges" (
	"challenge" varchar(64) PRIMARY KEY NOT NULL,
	"expires_at" timestamp NOT NULL,
	"used_at" timestamp
);
--> statement-breakpoint
CREATE TABLE "request_participants" (
	"request_id" uuid NOT NULL,
	"user_id" uuid NOT NULL,
	"side" varchar(4) NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL,
	CONSTRAINT "request_participants_request_id_user_id_pk" PRIMARY KEY("request_id","user_id")
);
--> statement-breakpoint
CREATE TABLE "requests" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"from_bubble_id" uuid NOT NULL,
	"to_bubble_id" uuid NOT NULL,
	"created_by" uuid,
	"question" varchar(200) NOT NULL,
	"details" text DEFAULT '' NOT NULL,
	"format" varchar(10) NOT NULL,
	"place" varchar(200) DEFAULT '' NOT NULL,
	"starts_at" timestamp NOT NULL,
	"seats" integer NOT NULL,
	"sent_at" timestamp,
	"accepted_at" timestamp,
	"phase" varchar(12) DEFAULT 'views' NOT NULL,
	"video_url" varchar(500) DEFAULT '' NOT NULL,
	"done_at" timestamp,
	"created_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "round_messages" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"request_id" uuid NOT NULL,
	"user_id" uuid NOT NULL,
	"phase" varchar(12) NOT NULL,
	"body" text NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "round_summaries" (
	"request_id" uuid NOT NULL,
	"side" varchar(4) NOT NULL,
	"body" text NOT NULL,
	"author_id" uuid,
	"confirmed_by" uuid,
	"confirmed_at" timestamp,
	"updated_at" timestamp DEFAULT now() NOT NULL,
	CONSTRAINT "round_summaries_request_id_side_pk" PRIMARY KEY("request_id","side")
);
--> statement-breakpoint
ALTER TABLE "users" ALTER COLUMN "email" DROP NOT NULL;--> statement-breakpoint
ALTER TABLE "magic_links" ADD COLUMN "user_id" uuid;--> statement-breakpoint
ALTER TABLE "users" ADD COLUMN "npub" varchar(63);--> statement-breakpoint
ALTER TABLE "users" ADD COLUMN "discoverable" boolean DEFAULT false NOT NULL;--> statement-breakpoint
ALTER TABLE "users" ADD COLUMN "onboarded_at" timestamp;--> statement-breakpoint
ALTER TABLE "bubble_invitations" ADD CONSTRAINT "bubble_invitations_bubble_id_bubbles_id_fk" FOREIGN KEY ("bubble_id") REFERENCES "public"."bubbles"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "bubble_invitations" ADD CONSTRAINT "bubble_invitations_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "bubble_invitations" ADD CONSTRAINT "bubble_invitations_invited_by_users_id_fk" FOREIGN KEY ("invited_by") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "bubble_members" ADD CONSTRAINT "bubble_members_bubble_id_bubbles_id_fk" FOREIGN KEY ("bubble_id") REFERENCES "public"."bubbles"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "bubble_members" ADD CONSTRAINT "bubble_members_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "bubbles" ADD CONSTRAINT "bubbles_created_by_users_id_fk" FOREIGN KEY ("created_by") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "direct_messages" ADD CONSTRAINT "direct_messages_from_id_users_id_fk" FOREIGN KEY ("from_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "direct_messages" ADD CONSTRAINT "direct_messages_to_id_users_id_fk" FOREIGN KEY ("to_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "interests" ADD CONSTRAINT "interests_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "matches_seen" ADD CONSTRAINT "matches_seen_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "matches_seen" ADD CONSTRAINT "matches_seen_other_id_users_id_fk" FOREIGN KEY ("other_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "request_participants" ADD CONSTRAINT "request_participants_request_id_requests_id_fk" FOREIGN KEY ("request_id") REFERENCES "public"."requests"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "request_participants" ADD CONSTRAINT "request_participants_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "requests" ADD CONSTRAINT "requests_from_bubble_id_bubbles_id_fk" FOREIGN KEY ("from_bubble_id") REFERENCES "public"."bubbles"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "requests" ADD CONSTRAINT "requests_to_bubble_id_bubbles_id_fk" FOREIGN KEY ("to_bubble_id") REFERENCES "public"."bubbles"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "requests" ADD CONSTRAINT "requests_created_by_users_id_fk" FOREIGN KEY ("created_by") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "round_messages" ADD CONSTRAINT "round_messages_request_id_requests_id_fk" FOREIGN KEY ("request_id") REFERENCES "public"."requests"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "round_messages" ADD CONSTRAINT "round_messages_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "round_summaries" ADD CONSTRAINT "round_summaries_request_id_requests_id_fk" FOREIGN KEY ("request_id") REFERENCES "public"."requests"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "round_summaries" ADD CONSTRAINT "round_summaries_author_id_users_id_fk" FOREIGN KEY ("author_id") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "round_summaries" ADD CONSTRAINT "round_summaries_confirmed_by_users_id_fk" FOREIGN KEY ("confirmed_by") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "bubbles_name_lower" ON "bubbles" USING btree (lower("name"));--> statement-breakpoint
ALTER TABLE "magic_links" ADD CONSTRAINT "magic_links_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "users" ADD CONSTRAINT "users_npub_unique" UNIQUE("npub");