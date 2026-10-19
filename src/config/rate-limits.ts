/**
 * Rate limit configuration for API routes and server actions.
 *
 * Every entry is a `RateLimitConfig` (see `server/services/rate-limit-service`):
 * `requests` per `duration`, where duration is in SECONDS. Pass these straight
 * to `rateLimitService.checkLimit` — callers should not reshape them.
 */
import type { RateLimitConfig } from "@/server/services/rate-limit-service";

export const rateLimits = {
  api: {
    default: {
      requests: 100,
      duration: 60,
    },
    auth: {
      requests: 10,
      duration: 60 * 5,
    },
  },
  web: {
    default: {
      requests: 50,
      duration: 60,
    },
    forms: {
      requests: 20,
      duration: 60 * 2,
    },
  },
  deployments: {
    status: {
      requests: 10,
      duration: 60,
    },
    create: {
      requests: 5,
      duration: 60,
    },
  },
  magicLink: {
    // A real user rarely needs more than a few sign-in links in a window.
    perEmail: {
      requests: 3,
      duration: 60 * 15,
    },
    // Headroom for shared/NAT networks while stopping bulk abuse from one host.
    perIp: {
      requests: 10,
      duration: 60 * 15,
    },
  },
  importPayments: {
    requests: 5,
    duration: 60 * 30,
  },
  createPayment: {
    requests: 10,
    duration: 60 * 5,
  },
  getPayments: {
    requests: 20,
    duration: 60 * 5,
  },
  getAllPayments: {
    requests: 10,
    duration: 60 * 10,
  },
} as const satisfies Record<string, RateLimitConfig | Record<string, RateLimitConfig>>;
