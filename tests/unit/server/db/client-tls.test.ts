/**
 * Client-certificate TLS for projects-db (LAC-6060).
 *
 * Each of these is a trap that was hit for real while measuring the live box,
 * not a hypothetical. The two driver quirks in particular are the reason this
 * is a shared helper instead of four lines copied into five repos:
 *
 *   - postgres-js reads options with `k in o`, so `ssl: undefined` is *set* and
 *     beats `sslmode=verify-full` in the URL. TLS goes off and the error
 *     ("no encryption") points at the server.
 *   - `pg` merges the parsed connection string *over* the explicit config, so
 *     `sslmode` in the URL silently discards `ssl: { cert, key }`. The cert is
 *     never sent and the error ("requires a valid client certificate") also
 *     points at the server.
 */

import { describe, expect, it } from "vitest";
import {
  databaseClientCertificate,
  databaseClientTlsOptions,
  withoutSslMode,
} from "@/server/db/client-tls";

const CERT_PEM = "-----BEGIN CERTIFICATE-----\nMIIB\n-----END CERTIFICATE-----";
const KEY_PEM = "-----BEGIN EC PRIVATE KEY-----\nMHcC\n-----END EC PRIVATE KEY-----";
const b64 = (value: string) => Buffer.from(value, "utf8").toString("base64");

const envWith = (overrides: Record<string, string | undefined>) =>
  overrides as unknown as NodeJS.ProcessEnv;

describe("databaseClientCertificate", () => {
  it("decodes both PEMs when both variables are set", () => {
    expect(
      databaseClientCertificate(
        envWith({
          DATABASE_CLIENT_CERT_B64: b64(CERT_PEM),
          DATABASE_CLIENT_KEY_B64: b64(KEY_PEM),
        })
      )
    ).toEqual({ cert: CERT_PEM, key: KEY_PEM });
  });

  it("is undefined when neither variable is set, which is the normal case", () => {
    expect(databaseClientCertificate(envWith({}))).toBeUndefined();
  });

  it("is undefined when only one half is deployed", () => {
    expect(
      databaseClientCertificate(envWith({ DATABASE_CLIENT_CERT_B64: b64(CERT_PEM) }))
    ).toBeUndefined();
    expect(
      databaseClientCertificate(envWith({ DATABASE_CLIENT_KEY_B64: b64(KEY_PEM) }))
    ).toBeUndefined();
  });

  it("rejects a raw PEM pasted where base64 was expected", () => {
    // Buffer.from(pem, "base64") does not throw on this; it returns bytes that
    // are not a PEM. Without the shape check the driver would be handed junk
    // and would report a TLS error naming neither variable.
    expect(
      databaseClientCertificate(
        envWith({ DATABASE_CLIENT_CERT_B64: CERT_PEM, DATABASE_CLIENT_KEY_B64: KEY_PEM })
      )
    ).toBeUndefined();
  });

  it("tolerates the trailing newline a dashboard paste leaves behind", () => {
    expect(
      databaseClientCertificate(
        envWith({
          DATABASE_CLIENT_CERT_B64: `${b64(CERT_PEM)}\n`,
          DATABASE_CLIENT_KEY_B64: ` ${b64(KEY_PEM)} `,
        })
      )
    ).toEqual({ cert: CERT_PEM, key: KEY_PEM });
  });
});

describe("databaseClientTlsOptions", () => {
  it("returns an empty object, never `{ ssl: undefined }`, when unconfigured", () => {
    const options = databaseClientTlsOptions(envWith({}));
    expect(options).toEqual({});
    // The assertion that matters: spreading this must not introduce an `ssl`
    // key at all, because postgres-js treats a present-but-undefined `ssl` as
    // "no TLS" and overrides sslmode=verify-full from the URL.
    expect("ssl" in { ...options }).toBe(false);
  });

  it("carries the certificate and no `ca` when configured", () => {
    const options = databaseClientTlsOptions(
      envWith({
        DATABASE_CLIENT_CERT_B64: b64(CERT_PEM),
        DATABASE_CLIENT_KEY_B64: b64(KEY_PEM),
      })
    );
    expect(options).toEqual({ ssl: { cert: CERT_PEM, key: KEY_PEM } });
    // A `ca` here would replace Node's trust store rather than extend it, and
    // the Let's Encrypt server certificate would stop verifying.
    expect("ca" in (options as { ssl: Record<string, unknown> }).ssl).toBe(false);
  });
});

describe("withoutSslMode", () => {
  it("drops sslmode and keeps every other parameter", () => {
    expect(
      withoutSslMode("postgresql://u:p@h:26432/d?sslmode=verify-full&application_name=x")
    ).toBe("postgresql://u:p@h:26432/d?application_name=x");
  });

  it("drops the whole query string when sslmode was the only parameter", () => {
    expect(withoutSslMode("postgresql://u:p@h:26432/d?sslmode=verify-full")).toBe(
      "postgresql://u:p@h:26432/d"
    );
  });

  it("leaves a URL with no query string alone", () => {
    expect(withoutSslMode("postgresql://u:p@h:26432/d")).toBe("postgresql://u:p@h:26432/d");
  });
});
