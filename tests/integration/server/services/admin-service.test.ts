/**
 * Characterization tests for admin-service.isAdmin() against the live
 * Testcontainers DB. Sets up the SPEC for plan 011 (isAdmin refactor).
 *
 * isAdmin() has 3 layered checks (any one → true):
 *   1. adminConfig.isAdminByEmailConfig — static env-driven list/domain, but
 *      only for an account whose email is verified (LAC-3811: a config match
 *      alone used to grant admin to anyone who could present the address)
 *   2. DB `users.role === "admin"` lookup by lowercased email
 *   3. RBAC permission check ("system", "admin") for the resolved userId
 *
 * There was a fourth: Payload CMS user existence. It granted admin to every
 * credentials-registered account and is gone (LAC-5048, ported here by
 * LAC-5245). This suite mocked the Payload client to `null`, which is why it
 * never saw the hole; the regression coverage lives in
 * tests/unit/server/services/admin-service.test.ts, where the client answers.
 * The mock stays so the suite keeps exercising 1-3 against the real DB with no
 * Payload dependency. Check #1 is exercised by spying on the config.
 */

import { eq } from "drizzle-orm";
import { describe, expect, it, vi } from "vitest";
import { adminConfig } from "@/config/admin-config";
import { users } from "@/server/db/schema";
import { isAdmin } from "@/server/services/admin-service";
import { getTestDb } from "../../../helpers/test-db";

vi.mock("@/lib/payload/payload", () => ({
  getPayloadClient: vi.fn(async () => null),
}));

vi.mock("@/server/services/rbac", () => ({
  rbacService: {
    hasPermission: vi.fn(async () => false),
  },
}));

describe("isAdmin", () => {
  it("returns false when email is null", async () => {
    expect(await isAdmin({ email: null })).toBe(false);
  });

  it("returns false when email is undefined", async () => {
    expect(await isAdmin({})).toBe(false);
  });

  it("returns false when email is not a string", async () => {
    expect(await isAdmin({ email: 12345 as never })).toBe(false);
  });

  it("returns true when the static config matches an account with a verified email", async () => {
    const spy = vi.spyOn(adminConfig, "isAdminByEmailConfig").mockReturnValue(true);
    try {
      const db = getTestDb();
      await db.insert(users).values({
        id: "config-verified",
        email: "config-verified@shipkit.test",
        role: "user",
        emailVerified: new Date(),
      });

      expect(await isAdmin({ email: "config-verified@shipkit.test" })).toBe(true);
    } finally {
      spy.mockRestore();
    }
  });

  it("refuses a static config match that no verified account owns (LAC-3811)", async () => {
    const spy = vi.spyOn(adminConfig, "isAdminByEmailConfig").mockReturnValue(true);
    try {
      // No row at all: nobody ever proved they own this address.
      expect(await isAdmin({ email: "unowned@shipkit.test" })).toBe(false);

      // Row exists but the address is unverified, so it is still unproven.
      const db = getTestDb();
      await db.insert(users).values({
        id: "config-unverified",
        email: "config-unverified@shipkit.test",
        role: "user",
        emailVerified: null,
      });

      expect(await isAdmin({ email: "config-unverified@shipkit.test" })).toBe(false);
    } finally {
      spy.mockRestore();
    }
  });

  it("refuses a static config match for a row that never set emailVerified (LAC-4100)", async () => {
    const spy = vi.spyOn(adminConfig, "isAdminByEmailConfig").mockReturnValue(true);
    try {
      // The column used to default to CURRENT_TIMESTAMP, so omitting it
      // inserted an account whose email already counted as verified — and
      // that is the single input this admin check reads. Unverified has to be
      // what you get by not saying anything, or every future writer that
      // forgets to opt out mints an admin.
      const db = getTestDb();
      await db.insert(users).values({
        id: "config-omitted",
        email: "config-omitted@shipkit.test",
        role: "user",
      });

      const row = await db.query.users.findFirst({
        where: eq(users.email, "config-omitted@shipkit.test"),
        columns: { emailVerified: true },
      });
      expect(row?.emailVerified).toBeNull();

      expect(await isAdmin({ email: "config-omitted@shipkit.test" })).toBe(false);
    } finally {
      spy.mockRestore();
    }
  });

  it("returns true when the DB users row has role='admin' (lowercased email)", async () => {
    vi.spyOn(adminConfig, "isAdminByEmailConfig").mockReturnValue(false);

    const db = getTestDb();
    await db.insert(users).values({
      id: "admin-user-1",
      email: "admin@db.shipkit.test",
      role: "admin",
    });

    // Calls with mixed-case email; service must lowercase before lookup.
    expect(await isAdmin({ email: "Admin@DB.Shipkit.Test" })).toBe(true);
  });

  it("returns false when the user exists but role is not 'admin' and no other check passes", async () => {
    vi.spyOn(adminConfig, "isAdminByEmailConfig").mockReturnValue(false);

    const db = getTestDb();
    await db.insert(users).values({
      id: "regular-user",
      email: "regular@db.shipkit.test",
      role: "user",
    });

    expect(await isAdmin({ email: "regular@db.shipkit.test" })).toBe(false);
  });

  it("returns false when the email matches no row at all", async () => {
    vi.spyOn(adminConfig, "isAdminByEmailConfig").mockReturnValue(false);
    expect(await isAdmin({ email: "nobody@shipkit.test" })).toBe(false);
  });

  it("returns true when RBAC grants ('system','admin') even if DB role is non-admin", async () => {
    vi.spyOn(adminConfig, "isAdminByEmailConfig").mockReturnValue(false);
    const { rbacService } = await import("@/server/services/rbac");
    vi.mocked(rbacService.hasPermission).mockResolvedValueOnce(true);

    const db = getTestDb();
    await db.insert(users).values({
      id: "rbac-user",
      email: "rbac@shipkit.test",
      role: "user",
    });

    expect(await isAdmin({ email: "rbac@shipkit.test" })).toBe(true);
  });

  it("uses an explicitly-passed userId for the RBAC check when no DB user exists", async () => {
    vi.spyOn(adminConfig, "isAdminByEmailConfig").mockReturnValue(false);
    const { rbacService } = await import("@/server/services/rbac");
    vi.mocked(rbacService.hasPermission).mockResolvedValueOnce(true);

    expect(await isAdmin({ email: "no-row@shipkit.test", userId: "explicit-id" })).toBe(true);
    expect(rbacService.hasPermission).toHaveBeenCalledWith("explicit-id", "system", "admin");
  });
});
