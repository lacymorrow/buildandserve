/**
 * Rate limit configuration for API routes.
 */
export const rateLimits = {
  deployments: {
    status: {
      maxRequests: 10,
      windowMs: 60_000, // 1 minute
    },
    create: {
      maxRequests: 5,
      windowMs: 60_000,
    },
  },
  api: {
    default: {
      maxRequests: 100,
      windowMs: 60_000,
    },
  },
} as const;
