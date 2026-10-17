/**
 * Module declarations for static image imports (`.jpg`, `.png`, `.svg`, ...).
 *
 * Next.js normally supplies these through the generated `next-env.d.ts`, but
 * that file is gitignored and only exists after a `next build` / `next dev`.
 * Without this reference, `bun run typecheck` fails on a fresh clone with
 * "Cannot find module './foo.jpg'" until someone runs a build first, which
 * makes typecheck unusable as a standalone CI gate.
 *
 * Referencing the same types Next does is idempotent: when `next-env.d.ts`
 * is present, TypeScript resolves both directives to one file.
 */

/// <reference types="next/image-types/global" />
