import { describe, expect, it } from "vitest";
import { useTestApp } from "./helpers.ts";

const { agent, owner, db } = useTestApp();

const registration = {
  ownerName: "Prabh",
  phone: "98765 43210",
  password: "secret123",
  confirmPassword: "secret123",
  cafeName: "Chai Corner",
  slug: "chai-corner",
};

describe("register", () => {
  it("creates the owner and café, signs them in, and never returns secrets", async () => {
    const client = agent();
    const res = await client.post("/api/auth/register").send(registration);

    expect(res.status).toBe(201);
    expect(res.body.user).toMatchObject({ name: "Prabh", phone: "+919876543210" });
    expect(res.body.user).not.toHaveProperty("passwordHash");
    expect(res.body.cafe).toMatchObject({ name: "Chai Corner", slug: "chai-corner", sections: [], notices: [] });

    const cookie = res.headers["set-cookie"]?.[0] ?? "";
    expect(cookie).toMatch(/^slate_session=/);
    expect(cookie).toMatch(/HttpOnly/i);
    expect(cookie).toMatch(/SameSite=Lax/i);

    const me = await client.get("/api/auth/me");
    expect(me.status).toBe(200);
    expect(me.body.cafe.slug).toBe("chai-corner");
  });

  it("stores a hash of the password and of the session token, not the raw values", async () => {
    const client = agent();
    const res = await client.post("/api/auth/register").send(registration);
    const token = /slate_session=([^;]+)/.exec(res.headers["set-cookie"]![0]!)![1]!;

    const user = await db.user.findUniqueOrThrow({ where: { phone: "+919876543210" } });
    expect(user.passwordHash).toMatch(/^scrypt\$/);
    expect(user.passwordHash).not.toContain("secret123");
    expect(await db.session.count({ where: { id: token } })).toBe(0);
    expect(await db.session.count({ where: { userId: user.id } })).toBe(1);
  });

  it("reports a taken mobile number and menu link on their fields", async () => {
    await agent().post("/api/auth/register").send(registration);
    const res = await agent().post("/api/auth/register").send(registration);

    expect(res.status).toBe(409);
    expect(res.body.error.code).toBe("CONFLICT");
    expect(res.body.error.fieldErrors).toEqual({
      phone: "An account with this mobile number already exists",
      slug: "This menu link is taken. Try another.",
    });
  });

  it("validates with the shared schema (field errors, 400)", async () => {
    const res = await agent()
      .post("/api/auth/register")
      .send({ ...registration, phone: "12345", confirmPassword: "different1" });

    expect(res.status).toBe(400);
    expect(res.body.error.fieldErrors).toMatchObject({
      phone: "Enter a valid 10-digit mobile number",
      confirmPassword: "Passwords don't match",
    });
  });
});

describe("login", () => {
  it("accepts the number however it's typed", async () => {
    await agent().post("/api/auth/register").send(registration);
    for (const phone of ["9876543210", "+91 98765-43210", "09876543210"]) {
      const res = await agent().post("/api/auth/login").send({ phone, password: "secret123" });
      expect(res.status, phone).toBe(200);
    }
  });

  it("gives the same message for an unknown number and a wrong password", async () => {
    await agent().post("/api/auth/register").send(registration);
    const unknown = await agent().post("/api/auth/login").send({ phone: "9123456789", password: "secret123" });
    const wrong = await agent().post("/api/auth/login").send({ phone: "9876543210", password: "wrongpass1" });

    expect(unknown.status).toBe(401);
    expect(wrong.status).toBe(401);
    expect(unknown.body.error.message).toBe(wrong.body.error.message);
  });

  it("locks the account for 15 minutes after 5 wrong passwords", async () => {
    await agent().post("/api/auth/register").send(registration);
    for (let i = 0; i < 5; i++) {
      await agent().post("/api/auth/login").send({ phone: "9876543210", password: "wrongpass1" });
    }
    const locked = await agent().post("/api/auth/login").send({ phone: "9876543210", password: "secret123" });
    expect(locked.status).toBe(429);
    expect(locked.body.error.code).toBe("RATE_LIMITED");
    expect(locked.body.error.message).toMatch(/Try again in 15 minutes/);

    // Once the lock has passed, the right password works and the counter resets.
    await db.user.update({ where: { phone: "+919876543210" }, data: { lockedUntil: new Date(Date.now() - 1000) } });
    const ok = await agent().post("/api/auth/login").send({ phone: "9876543210", password: "secret123" });
    expect(ok.status).toBe(200);
    const user = await db.user.findUniqueOrThrow({ where: { phone: "+919876543210" } });
    expect(user).toMatchObject({ failedLogins: 0, lockedUntil: null });
  });
});

describe("sessions", () => {
  it("rejects requests without a cookie", async () => {
    const res = await agent().get("/api/items");
    expect(res.status).toBe(401);
    expect(res.body.error.code).toBe("UNAUTHORIZED");
  });

  it("signing out deletes the session, so the old cookie stops working", async () => {
    const { client } = await owner();
    expect((await client.get("/api/auth/me")).status).toBe(200);
    expect((await client.post("/api/auth/logout")).status).toBe(204);
    expect((await client.get("/api/auth/me")).status).toBe(401);
    expect(await db.session.count()).toBe(0);
  });

  it("rejects an expired session and renews one past its half-life", async () => {
    const { client } = await owner();
    // Past half-life: renewed with a fresh expiry and a new Set-Cookie.
    await db.session.updateMany({ data: { expiresAt: new Date(Date.now() + 5 * 24 * 3600_000) } });
    const renewed = await client.get("/api/auth/me");
    expect(renewed.status).toBe(200);
    expect(renewed.headers["set-cookie"]?.[0]).toMatch(/^slate_session=/);
    const session = await db.session.findFirstOrThrow();
    expect(session.expiresAt.getTime()).toBeGreaterThan(Date.now() + 29 * 24 * 3600_000);

    await db.session.updateMany({ data: { expiresAt: new Date(Date.now() - 1000) } });
    expect((await client.get("/api/auth/me")).status).toBe(401);
  });
});
