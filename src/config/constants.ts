import { siteConfig } from "@/config/site-config";

export const RESEND_FROM = process.env.RESEND_FROM ?? siteConfig.email.support;
