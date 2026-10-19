import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => {
  const payload = {
    find: vi.fn(),
    findByID: vi.fn(),
    create: vi.fn(),
    update: vi.fn(),
    delete: vi.fn(),
    login: vi.fn(),
    forgotPassword: vi.fn(),
    resetPassword: vi.fn(),
    verifyEmail: vi.fn(),
  };
  return {
    payload,
    getPayloadClient: vi.fn(),
    envFlags: { NEXT_PUBLIC_FEATURE_PAYLOAD_ENABLED: false },
    ensureUserExists: vi.fn(),
    signIn: vi.fn(),
    signOut: vi.fn(),
    dbDeleteWhere: vi.fn(),
    dbFindFirst: vi.fn(),
    dbUpdateWhere: vi.fn(),
    dbSet: vi.fn(),
  };
});

vi.mock("@/env", () => ({ env: mocks.envFlags }));

vi.mock("@/lib/payload/payload", () => ({
  getPayloadClient: mocks.getPayloadClient,
  payload: null,
}));

vi.mock("@/server/auth", () => ({
  signIn: mocks.signIn,
  signOut: mocks.signOut,
}));

vi.mock("@/server/services/user-service", () => ({
  userService: { ensureUserExists: mocks.ensureUserExists },
}));

// `db.update()` re-applies dbSet's implementation on every call, so the chain
// survives the vi.resetAllMocks() in beforeEach. Relies on Vitest >=2 keeping
// the impl passed to vi.fn(impl) across mockReset.
vi.mock("@/server/db", () => ({
  db: {
    query: { users: { findFirst: mocks.dbFindFirst } },
    delete: vi.fn(() => ({ where: mocks.dbDeleteWhere })),
    update: vi.fn(() => ({
      set: mocks.dbSet.mockImplementation(() => ({ where: mocks.dbUpdateWhere })),
    })),
  },
}));

vi.mock("@/lib/logger", () => ({
  logger: { debug: vi.fn(), info: vi.fn(), warn: vi.fn(), error: vi.fn() },
}));

import { AuthService } from "@/server/services/auth-service";

const UUID_V4 = /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const CREDENTIALS_MSG = "Invalid email or password.";
const AUTH_ERROR_MSG = "An error occurred while authenticating";

const withPayload = () => mocks.getPayloadClient.mockResolvedValue(mocks.payload);
const withoutPayload = () => mocks.getPayloadClient.mockResolvedValue(null);

describe("AuthService", () => {
  beforeEach(() => {
    vi.resetAllMocks();
    mocks.envFlags.NEXT_PUBLIC_FEATURE_PAYLOAD_ENABLED = false;
    mocks.ensureUserExists.mockResolvedValue({});
    mocks.dbDeleteWhere.mockResolvedValue(undefined);
    mocks.dbUpdateWhere.mockResolvedValue(undefined);
    withoutPayload();
  });

  describe("generateConsistentId", () => {
    it("returns a UUID v4 string", () => {
      expect(AuthService.generateConsistentId()).toMatch(UUID_V4);
    });

    it("generates a unique ID on each call", () => {
      expect(AuthService.generateConsistentId()).not.toBe(AuthService.generateConsistentId());
    });
  });

  describe("ensureUserSynchronized", () => {
    const user = { id: "u1", email: "a@example.com", name: null, image: null };

    it("creates the Payload user with the same id when Payload has none, then ensures the Shipkit row", async () => {
      withPayload();
      mocks.payload.findByID.mockRejectedValue(new Error("Not Found"));
      mocks.payload.create.mockResolvedValue({ id: "u1", email: user.email });

      const result = await AuthService.ensureUserSynchronized(user);

      expect(result).toEqual({ id: "u1", email: "a@example.com" });
      expect(mocks.payload.create).toHaveBeenCalledTimes(1);
      const arg = mocks.payload.create.mock.calls[0]?.[0];
      expect(arg.collection).toBe("users");
      expect(arg.data.id).toBe("u1");
      expect(arg.data.email).toBe("a@example.com");
      // throwaway random password, 16 bytes hex
      expect(arg.data.password).toMatch(/^[0-9a-f]{32}$/);
      // name falls back to email when null
      expect(mocks.ensureUserExists).toHaveBeenCalledWith({
        id: "u1",
        email: "a@example.com",
        name: "a@example.com",
        image: null,
      });
    });

    it("does not create a Payload user when one already exists", async () => {
      withPayload();
      mocks.payload.findByID.mockResolvedValue({ id: "u1", email: user.email });

      await AuthService.ensureUserSynchronized({ ...user, name: "Alice" });

      expect(mocks.payload.create).not.toHaveBeenCalled();
      expect(mocks.ensureUserExists).toHaveBeenCalledWith(
        expect.objectContaining({ name: "Alice" })
      );
    });

    it("skips Payload and still ensures the Shipkit row when Payload is unavailable", async () => {
      await AuthService.ensureUserSynchronized(user);

      expect(mocks.payload.create).not.toHaveBeenCalled();
      expect(mocks.ensureUserExists).toHaveBeenCalledTimes(1);
    });

    it("throws and cleans up both stores when Payload create fails", async () => {
      withPayload();
      mocks.payload.findByID.mockRejectedValue(new Error("Not Found"));
      mocks.payload.create.mockRejectedValue(new Error("boom"));

      await expect(AuthService.ensureUserSynchronized(user)).rejects.toThrow(
        "Failed to create user in Payload CMS"
      );

      expect(mocks.ensureUserExists).not.toHaveBeenCalled();
      expect(mocks.payload.delete).toHaveBeenCalledWith({ collection: "users", id: "u1" });
      expect(mocks.dbDeleteWhere).toHaveBeenCalledTimes(1);
    });

    it("cleans up and rethrows when the Shipkit insert fails after Payload create", async () => {
      withPayload();
      mocks.payload.findByID.mockRejectedValue(new Error("Not Found"));
      mocks.payload.create.mockResolvedValue({ id: "u1" });
      mocks.ensureUserExists.mockRejectedValue(new Error("db down"));

      await expect(AuthService.ensureUserSynchronized(user)).rejects.toThrow("db down");

      expect(mocks.payload.delete).toHaveBeenCalledWith({ collection: "users", id: "u1" });
    });
  });

  describe("cleanupPartialUserCreation", () => {
    it("swallows errors from both stores", async () => {
      withPayload();
      mocks.payload.delete.mockRejectedValue(new Error("gone"));
      mocks.dbDeleteWhere.mockRejectedValue(new Error("Record to delete not found"));

      await expect(AuthService.cleanupPartialUserCreation("u1")).resolves.toBeUndefined();
    });
  });

  describe("updateUserSynchronized", () => {
    it("updates email in Payload and all provided fields in Shipkit", async () => {
      withPayload();
      mocks.payload.update.mockResolvedValue({});

      const result = await AuthService.updateUserSynchronized("u1", {
        email: "new@example.com",
        name: "New",
      });

      expect(result).toEqual({ id: "u1", email: "new@example.com" });
      expect(mocks.payload.update).toHaveBeenCalledWith({
        collection: "users",
        id: "u1",
        data: { email: "new@example.com" },
      });
      expect(mocks.dbSet).toHaveBeenCalledWith(
        expect.objectContaining({
          email: "new@example.com",
          name: "New",
          updatedAt: expect.any(Date),
        })
      );
    });

    it("does not touch Payload when only name changes", async () => {
      withPayload();
      await AuthService.updateUserSynchronized("u1", { name: "Only Name" });
      expect(mocks.payload.update).not.toHaveBeenCalled();
      expect(mocks.dbSet).toHaveBeenCalledTimes(1);
    });

    it("tolerates a Payload update failure but still updates Shipkit", async () => {
      withPayload();
      mocks.payload.update.mockRejectedValue(new Error("payload down"));

      await expect(
        AuthService.updateUserSynchronized("u1", { email: "x@example.com" })
      ).resolves.toEqual({
        id: "u1",
        email: "x@example.com",
      });
      expect(mocks.dbUpdateWhere).toHaveBeenCalledTimes(1);
    });

    it("throws when the Shipkit update fails", async () => {
      mocks.dbUpdateWhere.mockRejectedValue(new Error("db"));
      await expect(AuthService.updateUserSynchronized("u1", { name: "N" })).rejects.toThrow(
        "Failed to update user in Shipkit database"
      );
    });
  });

  describe("deleteUserSynchronized", () => {
    it("deletes from Payload and does not force-delete when Shipkit already cascaded", async () => {
      withPayload();
      mocks.dbFindFirst.mockResolvedValue(undefined);

      await AuthService.deleteUserSynchronized("u1");

      expect(mocks.payload.delete).toHaveBeenCalledWith({ collection: "users", id: "u1" });
      expect(mocks.dbDeleteWhere).not.toHaveBeenCalled();
    });

    it("force-deletes the Shipkit row when it survives the Payload delete", async () => {
      withPayload();
      mocks.dbFindFirst.mockResolvedValue({ id: "u1" });

      await AuthService.deleteUserSynchronized("u1");

      expect(mocks.dbDeleteWhere).toHaveBeenCalledTimes(1);
    });

    it("continues to the Shipkit check when the Payload delete throws", async () => {
      withPayload();
      mocks.payload.delete.mockRejectedValue(new Error("nope"));
      mocks.dbFindFirst.mockResolvedValue({ id: "u1" });

      await AuthService.deleteUserSynchronized("u1");

      expect(mocks.dbDeleteWhere).toHaveBeenCalledTimes(1);
    });
  });

  describe("validateCredentials", () => {
    const good = { email: "user@example.com", password: "password123" };

    it("throws CREDENTIALS when schema validation fails", async () => {
      await expect(
        AuthService.validateCredentials({ email: "not-an-email", password: "" })
      ).rejects.toThrow(CREDENTIALS_MSG);
    });

    it("throws CREDENTIALS for non-object credentials", async () => {
      await expect(AuthService.validateCredentials(null)).rejects.toThrow(CREDENTIALS_MSG);
    });

    it("throws CREDENTIALS for a missing password", async () => {
      await expect(AuthService.validateCredentials({ email: "user@example.com" })).rejects.toThrow(
        CREDENTIALS_MSG
      );
    });

    it("rejects passwords shorter than 4 characters before touching Payload", async () => {
      withPayload();
      await expect(
        AuthService.validateCredentials({ email: good.email, password: "abc" })
      ).rejects.toThrow(CREDENTIALS_MSG);
      expect(mocks.payload.find).not.toHaveBeenCalled();
    });

    it("throws AUTH_ERROR when Payload is not initialized", async () => {
      await expect(AuthService.validateCredentials(good)).rejects.toThrow(AUTH_ERROR_MSG);
    });

    it("throws CREDENTIALS (not a distinct error) when the email is unknown, so callers cannot enumerate users", async () => {
      withPayload();
      mocks.payload.find.mockResolvedValue({ docs: [] });

      await expect(AuthService.validateCredentials(good)).rejects.toThrow(CREDENTIALS_MSG);
      expect(mocks.payload.login).not.toHaveBeenCalled();
    });

    it("throws CREDENTIALS when Payload login rejects (wrong password)", async () => {
      withPayload();
      mocks.payload.find.mockResolvedValue({ docs: [{ id: "u1" }] });
      mocks.payload.login.mockRejectedValue(new Error("bad password"));

      await expect(AuthService.validateCredentials(good)).rejects.toThrow(CREDENTIALS_MSG);
      expect(mocks.ensureUserExists).not.toHaveBeenCalled();
    });

    it("throws CREDENTIALS when login returns no user", async () => {
      withPayload();
      mocks.payload.find.mockResolvedValue({ docs: [{ id: "u1" }] });
      mocks.payload.login.mockResolvedValue({});

      await expect(AuthService.validateCredentials(good)).rejects.toThrow(CREDENTIALS_MSG);
    });

    it("maps unexpected lookup errors to AUTH_ERROR", async () => {
      withPayload();
      mocks.payload.find.mockRejectedValue(new Error("connection reset"));

      await expect(AuthService.validateCredentials(good)).rejects.toThrow(AUTH_ERROR_MSG);
    });

    it("returns a stringified-id user with the payload token and syncs the Shipkit row on success", async () => {
      withPayload();
      mocks.payload.find.mockResolvedValue({ docs: [{ id: 7 }] });
      mocks.payload.login.mockResolvedValue({ user: { id: 7, email: good.email }, token: "jwt" });

      const user = await AuthService.validateCredentials(good);

      expect(user).toEqual({
        id: "7",
        name: good.email,
        email: good.email,
        emailVerified: null,
        image: null,
        payloadToken: "jwt",
      });
      expect(mocks.ensureUserExists).toHaveBeenCalledWith({
        id: "7",
        email: good.email,
        name: good.email,
        image: null,
      });
    });
  });

  describe("signInWithCredentials / signUpWithCredentials", () => {
    it("signUp throws when Payload is unavailable", async () => {
      await expect(
        AuthService.signUpWithCredentials({ email: "a@example.com", password: "password123" })
      ).rejects.toThrow("Authentication service unavailable");
    });

    it("signUp rejects an email that already exists in Payload and creates nothing", async () => {
      withPayload();
      mocks.payload.find.mockResolvedValue({ docs: [{ id: "x" }] });

      await expect(
        AuthService.signUpWithCredentials({ email: "a@example.com", password: "password123" })
      ).rejects.toThrow("User already exists with this email");
      expect(mocks.payload.create).not.toHaveBeenCalled();
    });

    it("signUp (no redirect) creates in both stores with the same generated id and signs in", async () => {
      withPayload();
      mocks.payload.find.mockResolvedValue({ docs: [] });
      mocks.payload.create.mockImplementation(async ({ data }) => ({
        id: data.id,
        email: data.email,
      }));
      mocks.signIn.mockResolvedValue({ ok: true, url: "/dash" });

      const result = await AuthService.signUpWithCredentials({
        email: "a@example.com",
        password: "password123",
        redirect: false,
      });

      const createdId = mocks.payload.create.mock.calls[0]?.[0].data.id;
      expect(createdId).toMatch(UUID_V4);
      expect(mocks.ensureUserExists).toHaveBeenCalledWith(
        expect.objectContaining({ id: createdId })
      );
      expect(mocks.signIn).toHaveBeenCalledWith(
        "credentials",
        expect.objectContaining({ email: "a@example.com", redirect: false })
      );
      expect(result).toEqual({ ok: true, user: { id: createdId, email: "a@example.com" } });
    });

    it("signUp (no redirect) returns ok:false when sign-in fails after creation", async () => {
      withPayload();
      mocks.payload.find.mockResolvedValue({ docs: [] });
      mocks.payload.create.mockResolvedValue({ id: "i", email: "a@example.com" });
      mocks.signIn.mockResolvedValue({ ok: false, error: "nope" });

      const result = await AuthService.signUpWithCredentials({
        email: "a@example.com",
        password: "password123",
        redirect: false,
      });
      expect(result).toEqual({ ok: false, error: "nope" });
    });

    it("signUp throws when Payload create returns nothing", async () => {
      withPayload();
      mocks.payload.find.mockResolvedValue({ docs: [] });
      mocks.payload.create.mockResolvedValue(null);

      await expect(
        AuthService.signUpWithCredentials({ email: "a@example.com", password: "password123" })
      ).rejects.toThrow("Failed to create Payload CMS user");
    });

    it("signIn (no redirect) rejects malformed credentials without calling NextAuth", async () => {
      await expect(
        AuthService.signInWithCredentials({ email: "bad", password: "x", redirect: false })
      ).rejects.toThrow(CREDENTIALS_MSG);
      expect(mocks.signIn).not.toHaveBeenCalled();
    });
  });

  describe("forgotPassword", () => {
    it("throws when Payload is not initialized", async () => {
      await expect(AuthService.forgotPassword("user@example.com")).rejects.toThrow(
        "Authentication service unavailable"
      );
    });

    it("returns ok without sending mail for an unknown email (anti-enumeration)", async () => {
      withPayload();
      mocks.payload.find.mockResolvedValue({ docs: [] });

      await expect(AuthService.forgotPassword("ghost@example.com")).resolves.toEqual({ ok: true });
      expect(mocks.payload.forgotPassword).not.toHaveBeenCalled();
    });

    it("asks Payload to send the reset mail for a known email", async () => {
      withPayload();
      mocks.payload.find.mockResolvedValue({ docs: [{ id: "u1" }] });
      mocks.payload.forgotPassword.mockResolvedValue("token");

      await expect(AuthService.forgotPassword("u@example.com")).resolves.toEqual({ ok: true });
      expect(mocks.payload.forgotPassword).toHaveBeenCalledWith({
        collection: "users",
        data: { email: "u@example.com" },
      });
    });
  });

  describe("resetPassword", () => {
    it("throws when Payload is not initialized", async () => {
      await expect(AuthService.resetPassword("t", "newpass")).rejects.toThrow(
        "Authentication service unavailable"
      );
    });

    it("passes token and password to Payload with overrideAccess", async () => {
      withPayload();
      mocks.payload.resetPassword.mockResolvedValue({});

      await expect(AuthService.resetPassword("tok", "newpass")).resolves.toEqual({ ok: true });
      expect(mocks.payload.resetPassword).toHaveBeenCalledWith({
        collection: "users",
        data: { token: "tok", password: "newpass" },
        overrideAccess: true,
      });
    });

    it("propagates an invalid-token error", async () => {
      withPayload();
      mocks.payload.resetPassword.mockRejectedValue(
        new Error("Token is either invalid or has expired.")
      );
      await expect(AuthService.resetPassword("bad", "newpass")).rejects.toThrow(
        "invalid or has expired"
      );
    });
  });

  describe("verifyEmail", () => {
    it("returns ok:false when the Payload feature flag is off", async () => {
      const result = await AuthService.verifyEmail("tok");
      expect(result).toEqual({ ok: false, message: "Email verification not available" });
      expect(mocks.getPayloadClient).not.toHaveBeenCalled();
    });

    it("returns ok:false when the flag is on but Payload is unavailable", async () => {
      mocks.envFlags.NEXT_PUBLIC_FEATURE_PAYLOAD_ENABLED = true;
      expect(await AuthService.verifyEmail("tok")).toEqual({
        ok: false,
        message: "Payload not available",
      });
    });

    it("returns ok:true when Payload accepts the token", async () => {
      mocks.envFlags.NEXT_PUBLIC_FEATURE_PAYLOAD_ENABLED = true;
      withPayload();
      mocks.payload.verifyEmail.mockResolvedValue(true);

      expect(await AuthService.verifyEmail("tok")).toEqual({
        ok: true,
        message: "Email verified successfully",
      });
      expect(mocks.payload.verifyEmail).toHaveBeenCalledWith({ collection: "users", token: "tok" });
    });

    it("returns ok:false instead of throwing when Payload rejects the token", async () => {
      mocks.envFlags.NEXT_PUBLIC_FEATURE_PAYLOAD_ENABLED = true;
      withPayload();
      mocks.payload.verifyEmail.mockRejectedValue(new Error("bad token"));

      expect(await AuthService.verifyEmail("tok")).toEqual({
        ok: false,
        message: "Failed to verify email",
      });
    });
  });

  describe("deleteUserAccount", () => {
    it("returns 'User not found' without calling Payload when the row is missing", async () => {
      withPayload();
      mocks.dbFindFirst.mockResolvedValue(undefined);

      expect(await AuthService.deleteUserAccount("u1")).toEqual({
        ok: false,
        message: "User not found",
      });
      expect(mocks.payload.delete).not.toHaveBeenCalled();
    });

    it("deletes from both stores, tolerating a Payload failure", async () => {
      withPayload();
      mocks.dbFindFirst.mockResolvedValue({ id: "u1" });
      mocks.payload.delete.mockRejectedValue(new Error("payload"));

      expect(await AuthService.deleteUserAccount("u1")).toEqual({
        ok: true,
        message: "Account deleted successfully",
      });
      expect(mocks.dbDeleteWhere).toHaveBeenCalledTimes(1);
    });

    it("returns a generic failure when the Shipkit delete throws", async () => {
      mocks.dbFindFirst.mockResolvedValue({ id: "u1" });
      mocks.dbDeleteWhere.mockRejectedValue(new Error("fk"));

      expect(await AuthService.deleteUserAccount("u1")).toEqual({
        ok: false,
        message: "Failed to delete user account",
      });
    });
  });

  describe("signInViaCMS", () => {
    it("returns 'Authentication not available' without Payload", async () => {
      expect(await AuthService.signInViaCMS("a@example.com", "pw")).toEqual({
        error: "Authentication not available",
      });
    });

    it("returns the same 'Invalid credentials' for unknown email and wrong password", async () => {
      withPayload();
      mocks.payload.find.mockResolvedValueOnce({ docs: [] });
      const unknown = await AuthService.signInViaCMS("a@example.com", "pw");

      mocks.payload.find.mockResolvedValueOnce({ docs: [{ id: "u1" }] });
      mocks.payload.login.mockRejectedValueOnce(new Error("bad"));
      const wrong = await AuthService.signInViaCMS("a@example.com", "pw");

      expect(unknown).toEqual({ error: "Invalid credentials" });
      expect(wrong).toEqual(unknown);
    });

    it("returns the user with token and syncs Shipkit on success", async () => {
      withPayload();
      mocks.payload.find.mockResolvedValue({ docs: [{ id: "u1" }] });
      mocks.payload.login.mockResolvedValue({
        user: { id: 3, email: "a@example.com" },
        token: "jwt",
      });

      const result = await AuthService.signInViaCMS("a@example.com", "pw");

      expect(result.user).toEqual({
        id: "3",
        name: "a@example.com",
        email: "a@example.com",
        token: "jwt",
      });
      expect(mocks.ensureUserExists).toHaveBeenCalledTimes(1);
    });

    it("rejects a login result that lacks a token", async () => {
      withPayload();
      mocks.payload.find.mockResolvedValue({ docs: [{ id: "u1" }] });
      mocks.payload.login.mockResolvedValue({ user: { id: 1, email: "a@example.com" } });

      expect(await AuthService.signInViaCMS("a@example.com", "pw")).toEqual({
        error: "Invalid credentials",
      });
    });
  });

  describe("createUserViaCMS", () => {
    const input = { email: "n@example.com", password: "password123", name: "N" };

    it("returns an error without Payload", async () => {
      expect(await AuthService.createUserViaCMS(input)).toEqual({ error: "Payload not available" });
    });

    it("refuses a duplicate email", async () => {
      withPayload();
      mocks.payload.find.mockResolvedValue({ docs: [{ id: "x" }] });

      expect(await AuthService.createUserViaCMS(input)).toEqual({
        error: "User with this email already exists",
      });
      expect(mocks.payload.create).not.toHaveBeenCalled();
    });

    it("creates the Payload user and the Shipkit row with a shared id", async () => {
      withPayload();
      mocks.payload.find.mockResolvedValue({ docs: [] });
      mocks.payload.create.mockImplementation(async ({ data }) => ({
        id: data.id,
        email: data.email,
      }));

      const result = await AuthService.createUserViaCMS(input);

      const id = mocks.payload.create.mock.calls[0]?.[0].data.id;
      expect(id).toMatch(UUID_V4);
      expect(result.user).toEqual({ id, email: input.email });
      expect(mocks.ensureUserExists).toHaveBeenCalledWith({
        id,
        email: input.email,
        name: "N",
        image: null,
      });
    });

    it("returns a generic error when the Shipkit insert fails", async () => {
      withPayload();
      mocks.payload.find.mockResolvedValue({ docs: [] });
      mocks.payload.create.mockResolvedValue({ id: "i", email: input.email });
      mocks.ensureUserExists.mockRejectedValue(new Error("db"));

      expect(await AuthService.createUserViaCMS(input)).toEqual({ error: "Failed to create user" });
    });
  });

  describe("forgotPasswordViaCMS", () => {
    // Characterized, not endorsed: the `message` differs between the unknown and
    // known branches, which is an enumeration leak. Pinned here so the leak is
    // visible rather than hidden behind a partial assertion. Fix: LAC-4776.
    it("returns ok:true for an unknown email without sending mail, but leaks existence via `message`", async () => {
      withPayload();
      mocks.payload.find.mockResolvedValue({ docs: [] });

      const result = await AuthService.forgotPasswordViaCMS("ghost@example.com");
      expect(result).toEqual({
        ok: true,
        message: "Password reset email sent if account exists",
      });
      expect(mocks.payload.forgotPassword).not.toHaveBeenCalled();
    });

    it("returns a generic failure when Payload throws", async () => {
      withPayload();
      mocks.payload.find.mockRejectedValue(new Error("boom"));
      expect(await AuthService.forgotPasswordViaCMS("a@example.com")).toEqual({
        ok: false,
        message: "An error occurred",
      });
    });
  });
});
