ALTER TABLE "shipkit_user" ALTER COLUMN "email_verified" DROP DEFAULT;--> statement-breakpoint
ALTER TABLE "shipkit_user" ADD COLUMN "paid_at" timestamp with time zone;--> statement-breakpoint
ALTER TABLE "shipkit_user" ADD COLUMN "subscription_active_at" timestamp with time zone;--> statement-breakpoint
ALTER TABLE "shipkit_user" ADD COLUMN "subscription_inactive_at" timestamp with time zone;--> statement-breakpoint
ALTER TABLE "shipkit_user" ADD COLUMN "last_payment_at" timestamp with time zone;