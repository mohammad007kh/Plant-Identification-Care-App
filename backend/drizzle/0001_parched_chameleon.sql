CREATE TYPE "public"."credit_related_type" AS ENUM('scan', 'chat_message', 'comparison', 'subscription', 'monthly_reset');--> statement-breakpoint
CREATE TYPE "public"."credit_txn_type" AS ENUM('grant', 'debit', 'refund', 'expiry');--> statement-breakpoint
CREATE TYPE "public"."payment_status" AS ENUM('initiated', 'verified', 'failed');--> statement-breakpoint
CREATE TYPE "public"."subscription_tier_key" AS ENUM('free', 'pro', 'max');--> statement-breakpoint
CREATE TYPE "public"."usage_action" AS ENUM('identify', 'comparison', 'chat');--> statement-breakpoint
CREATE TYPE "public"."usage_status" AS ENUM('pending', 'completed', 'failed');--> statement-breakpoint
CREATE TYPE "public"."chat_role" AS ENUM('user', 'assistant');--> statement-breakpoint
CREATE TYPE "public"."deletion_outcome" AS ENUM('completed', 'failed');--> statement-breakpoint
CREATE TYPE "public"."health_verdict" AS ENUM('improved', 'worse', 'unchanged');--> statement-breakpoint
CREATE TYPE "public"."notification_channel" AS ENUM('email', 'push');--> statement-breakpoint
CREATE TYPE "public"."notification_status" AS ENUM('scheduled', 'sent', 'skipped', 'failed');--> statement-breakpoint
CREATE TYPE "public"."notification_type" AS ENUM('watering', 'custom');--> statement-breakpoint
CREATE TYPE "public"."report_status" AS ENUM('open', 'reviewed');--> statement-breakpoint
CREATE TABLE "credit_transaction" (
	"id" text PRIMARY KEY NOT NULL,
	"user_id" text NOT NULL,
	"amount" integer NOT NULL,
	"type" "credit_txn_type" NOT NULL,
	"related_type" "credit_related_type",
	"related_id" text,
	"idempotency_key" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "credit_transaction_idempotency_key_unique" UNIQUE("idempotency_key")
);
--> statement-breakpoint
CREATE TABLE "payment_event" (
	"id" text PRIMARY KEY NOT NULL,
	"public_id" uuid DEFAULT gen_random_uuid() NOT NULL,
	"user_id" text NOT NULL,
	"provider" text NOT NULL,
	"provider_ref" text,
	"plan_id" text,
	"price_snapshot_minor" integer NOT NULL,
	"credit_allowance_snapshot" integer NOT NULL,
	"status" "payment_status" DEFAULT 'initiated' NOT NULL,
	"raw_payload" jsonb,
	"idempotency_key" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "payment_event_public_id_unique" UNIQUE("public_id"),
	CONSTRAINT "payment_event_idempotency_key_unique" UNIQUE("idempotency_key")
);
--> statement-breakpoint
CREATE TABLE "subscription_tier" (
	"id" text PRIMARY KEY NOT NULL,
	"public_id" uuid DEFAULT gen_random_uuid() NOT NULL,
	"key" "subscription_tier_key" NOT NULL,
	"monthly_credit_allowance" integer NOT NULL,
	"price_minor" integer DEFAULT 0 NOT NULL,
	"currency" text DEFAULT 'IRR' NOT NULL,
	"active" boolean DEFAULT true NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "subscription_tier_public_id_unique" UNIQUE("public_id"),
	CONSTRAINT "subscription_tier_key_unique" UNIQUE("key")
);
--> statement-breakpoint
CREATE TABLE "usage_record" (
	"id" text PRIMARY KEY NOT NULL,
	"user_id" text NOT NULL,
	"action" "usage_action" NOT NULL,
	"status" "usage_status" DEFAULT 'pending' NOT NULL,
	"debit_txn_id" text,
	"refund_txn_id" text,
	"idempotency_key" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"resolved_at" timestamp with time zone,
	CONSTRAINT "usage_record_refund_txn_id_unique" UNIQUE("refund_txn_id"),
	CONSTRAINT "usage_record_idempotency_key_unique" UNIQUE("idempotency_key")
);
--> statement-breakpoint
CREATE TABLE "analytics_event" (
	"id" text PRIMARY KEY NOT NULL,
	"user_id" text,
	"name" text NOT NULL,
	"props" jsonb,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "app_config" (
	"key" text PRIMARY KEY NOT NULL,
	"value" jsonb NOT NULL,
	"updated_by" text,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "chat_conversation" (
	"id" text PRIMARY KEY NOT NULL,
	"public_id" uuid DEFAULT gen_random_uuid() NOT NULL,
	"user_id" text NOT NULL,
	"plant_id" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "chat_conversation_public_id_unique" UNIQUE("public_id")
);
--> statement-breakpoint
CREATE TABLE "chat_message" (
	"id" text PRIMARY KEY NOT NULL,
	"conversation_id" text NOT NULL,
	"role" "chat_role" NOT NULL,
	"content" text NOT NULL,
	"context_photo_ids" text[],
	"usage_record_id" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "chat_message_context_photo_ids_max_2" CHECK ("chat_message"."context_photo_ids" IS NULL OR array_length("chat_message"."context_photo_ids", 1) <= 2)
);
--> statement-breakpoint
CREATE TABLE "comparison_result" (
	"id" text PRIMARY KEY NOT NULL,
	"scan_id" text NOT NULL,
	"plant_id" text NOT NULL,
	"verdict" "health_verdict" NOT NULL,
	"referenced_photo_ids" text[],
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "deletion_audit" (
	"id" text PRIMARY KEY NOT NULL,
	"user_public_id_hash" text NOT NULL,
	"requested_at" timestamp with time zone NOT NULL,
	"purged_at" timestamp with time zone,
	"outcome" "deletion_outcome"
);
--> statement-breakpoint
CREATE TABLE "misidentification_report" (
	"id" text PRIMARY KEY NOT NULL,
	"public_id" uuid DEFAULT gen_random_uuid() NOT NULL,
	"user_id" text NOT NULL,
	"scan_id" text NOT NULL,
	"photo_id" text,
	"ai_result" jsonb,
	"note" text,
	"status" "report_status" DEFAULT 'open' NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "misidentification_report_public_id_unique" UNIQUE("public_id")
);
--> statement-breakpoint
CREATE TABLE "notification" (
	"id" text PRIMARY KEY NOT NULL,
	"public_id" uuid DEFAULT gen_random_uuid() NOT NULL,
	"user_id" text NOT NULL,
	"plant_id" text,
	"type" "notification_type" NOT NULL,
	"channel" "notification_channel" NOT NULL,
	"scheduled_for" timestamp with time zone NOT NULL,
	"status" "notification_status" DEFAULT 'scheduled' NOT NULL,
	"template_key" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"sent_at" timestamp with time zone,
	CONSTRAINT "notification_public_id_unique" UNIQUE("public_id")
);
--> statement-breakpoint
ALTER TABLE "credit_transaction" ADD CONSTRAINT "credit_transaction_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "payment_event" ADD CONSTRAINT "payment_event_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "payment_event" ADD CONSTRAINT "payment_event_plan_id_subscription_tier_id_fk" FOREIGN KEY ("plan_id") REFERENCES "public"."subscription_tier"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "usage_record" ADD CONSTRAINT "usage_record_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "usage_record" ADD CONSTRAINT "usage_record_debit_txn_id_credit_transaction_id_fk" FOREIGN KEY ("debit_txn_id") REFERENCES "public"."credit_transaction"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "usage_record" ADD CONSTRAINT "usage_record_refund_txn_id_credit_transaction_id_fk" FOREIGN KEY ("refund_txn_id") REFERENCES "public"."credit_transaction"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "analytics_event" ADD CONSTRAINT "analytics_event_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "app_config" ADD CONSTRAINT "app_config_updated_by_users_id_fk" FOREIGN KEY ("updated_by") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "chat_conversation" ADD CONSTRAINT "chat_conversation_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "chat_conversation" ADD CONSTRAINT "chat_conversation_plant_id_plant_id_fk" FOREIGN KEY ("plant_id") REFERENCES "public"."plant"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "chat_message" ADD CONSTRAINT "chat_message_conversation_id_chat_conversation_id_fk" FOREIGN KEY ("conversation_id") REFERENCES "public"."chat_conversation"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "comparison_result" ADD CONSTRAINT "comparison_result_scan_id_scan_id_fk" FOREIGN KEY ("scan_id") REFERENCES "public"."scan"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "comparison_result" ADD CONSTRAINT "comparison_result_plant_id_plant_id_fk" FOREIGN KEY ("plant_id") REFERENCES "public"."plant"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "misidentification_report" ADD CONSTRAINT "misidentification_report_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "misidentification_report" ADD CONSTRAINT "misidentification_report_scan_id_scan_id_fk" FOREIGN KEY ("scan_id") REFERENCES "public"."scan"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "misidentification_report" ADD CONSTRAINT "misidentification_report_photo_id_photo_id_fk" FOREIGN KEY ("photo_id") REFERENCES "public"."photo"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "notification" ADD CONSTRAINT "notification_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "notification" ADD CONSTRAINT "notification_plant_id_plant_id_fk" FOREIGN KEY ("plant_id") REFERENCES "public"."plant"("id") ON DELETE no action ON UPDATE no action;