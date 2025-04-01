ALTER TABLE "shipkit_user" ALTER COLUMN "email_verified" SET DEFAULT CURRENT_TIMESTAMP;--> statement-breakpoint
ALTER TABLE "shipkit_user" ADD COLUMN "subscription_expires_at" timestamp with time zone;--> statement-breakpoint
ALTER TABLE "shipkit_user" DROP COLUMN "paid_at";--> statement-breakpoint
ALTER TABLE "shipkit_user" DROP COLUMN "subscription_active_at";--> statement-breakpoint
ALTER TABLE "shipkit_user" DROP COLUMN "subscription_inactive_at";--> statement-breakpoint
ALTER TABLE "shipkit_user" DROP COLUMN "last_payment_at";