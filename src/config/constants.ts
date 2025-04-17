import { siteConfig } from "./site-config";

/**
 * The relative path from the project root to the directory containing Next.js configuration plugins.
 */
export const NEXTJS_PLUGINS_DIR_RELATIVE = "src/config/nextjs";

export const RESEND_FROM = process.env.RESEND_FROM ?? siteConfig.email.support;
