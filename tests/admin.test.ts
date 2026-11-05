import { beforeEach, describe, expect, it, vi } from "vitest";

let currentUser: string | null = null;
const dbAdmins = new Map<string, boolean>();

vi.mock("@clerk/nextjs", () => ({ auth: () => ({ userId: currentUser }) }));
vi.mock("@/lib/mongoDB", () => ({ connectToDB: async () => {} }));
vi.mock("@/lib/models/admin", () => ({
  default: {
    exists: async (q: { userId: string; isAdmin?: boolean }) => (dbAdmins.get(q.userId) === true || (q.isAdmin === undefined && dbAdmins.has(q.userId)) ? { _id: q.userId } : null),
    find: () => ({ lean: async () => Array.from(dbAdmins, ([userId, isAdmin]) => ({ userId, isAdmin })) }),
    findOneAndDelete: async ({ userId }: { userId: string }) => (dbAdmins.delete(userId) ? { userId } : null),
  },
}));

const req = (url: string, body?: unknown, method = "GET") =>
  new Request(`http://x${url}`, { method, ...(body ? { body: JSON.stringify(body), headers: { "content-type": "application/json" } } : {}) }) as any;

describe("admin access", () => {
  beforeEach(() => {
    currentUser = null;
    dbAdmins.clear();
    process.env.ADMIN_USER_IDS = "user_owner";
  });

  it("decides admins on the server: env list or an isAdmin record", async () => {
    const { isAdminUser } = await import("@/lib/api/admin");
    dbAdmins.set("user_db", true).set("user_flag_off", false);
    expect(await isAdminUser("user_owner")).toBe(true);
    expect(await isAdminUser("user_db")).toBe(true);
    expect(await isAdminUser("user_flag_off")).toBe(false);
    expect(await isAdminUser("user_player")).toBe(false);
  });

  it("guards admin routes: 401 signed out, 403 for players, allowed for admins", async () => {
    const { adminGuard } = await import("@/lib/api/admin");
    expect((await adminGuard())?.status).toBe(401);
    currentUser = "user_player";
    expect((await adminGuard())?.status).toBe(403);
    currentUser = "user_owner";
    expect(await adminGuard()).toBeNull();
  });

  it("no longer lets a player make themselves an admin or list admins", async () => {
    const { GET, POST } = await import("@/app/api/admin/route");
    currentUser = "user_player";
    expect((await POST(req("/api/admin", { userId: "user_player", isAdmin: true }, "POST"))).status).toBe(403);
    expect((await GET(req("/api/admin"))).status).toBe(403);
    const me = await GET(req("/api/admin?me=1"));
    expect(await me.json()).toEqual({ isAdmin: false });
  });

  it("stops an admin from removing their own rights", async () => {
    const { DELETE } = await import("@/app/api/admin/route");
    currentUser = "user_owner";
    dbAdmins.set("user_owner", true);
    expect((await DELETE(req("/api/admin", { userId: "user_owner" }, "DELETE"))).status).toBe(400);
    expect(dbAdmins.has("user_owner")).toBe(true);
  });
});
