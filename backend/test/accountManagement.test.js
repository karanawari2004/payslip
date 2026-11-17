const assert = require("node:assert/strict");
const { after, before, test } = require("node:test");
const bcrypt = require("bcryptjs");

process.env.JWT_SECRET = "test-jwt-secret-that-is-at-least-32-characters";
process.env.NODE_ENV = "test";
process.env.ADMIN_USERNAME = "initial";
process.env.ADMIN_PASSWORD = "initial-password";

const Account = require("../model/Account");
const Club = require("../model/Club");
const Report = require("../model/report");
const ensureInitialAccount = require("../utils/initialAccount");
const { clearAuthCookie, setAuthCookie } = require("../utils/authCookie");
const app = require("../app");
const originalMethods = {
  init: Account.init,
  create: Account.create,
  findOne: Account.findOne,
  findById: Account.findById,
  findClubs: Club.find,
  findReports: Report.find,
};
const accounts = [];
let nextAccountId = 1;
let server;
let baseUrl;

function makeAccount(data) {
  const id = String(data._id || nextAccountId++);
  const account = {
    _id: { toString: () => id },
    username: data.username,
    passwordHash: data.passwordHash,
    role: data.role || "admin",
    isInitialAccount: data.isInitialAccount || false,
    async save() {
      if (
        accounts.some(
          (existing) =>
            existing !== account && existing.username === account.username
        )
      ) {
        const error = new Error("Duplicate username");
        error.code = 11000;
        throw error;
      }
      return account;
    },
  };
  accounts.push(account);
  return account;
}

function getCookie(response) {
  const setCookie = response.headers.get("set-cookie");
  return setCookie ? setCookie.split(";")[0] : "";
}

async function request(
  path,
  {
    method = "GET",
    cookie = "",
    body,
    origin = "http://localhost:5173",
  } = {}
) {
  const response = await fetch(`${baseUrl}${path}`, {
    method,
    headers: {
      Origin: origin,
      ...(body ? { "Content-Type": "application/json" } : {}),
      ...(cookie ? { Cookie: cookie } : {}),
    },
    ...(body ? { body: JSON.stringify(body) } : {}),
  });
  return { response, data: await response.json() };
}

before(async () => {
  Account.init = async () => Account;
  Account.create = async (data) => {
    if (accounts.some((account) => account.username === data.username)) {
      const error = new Error("Duplicate username");
      error.code = 11000;
      throw error;
    }
    return makeAccount(data);
  };
  Account.findOne = async (filter) =>
    accounts.find((account) =>
      Object.entries(filter).every(([key, value]) => account[key] === value)
    ) || null;
  Account.findById = async (id) =>
    accounts.find((account) => account._id.toString() === String(id)) || null;
  Club.find = () => ({ sort: async () => [] });
  Report.find = () => ({ sort: async () => [] });
  await ensureInitialAccount();

  server = await new Promise((resolve) => {
    const listener = app.listen(0, () => resolve(listener));
  });
  baseUrl = `http://127.0.0.1:${server.address().port}`;
});

after(async () => {
  Account.init = originalMethods.init;
  Account.create = originalMethods.create;
  Account.findOne = originalMethods.findOne;
  Account.findById = originalMethods.findById;
  Club.find = originalMethods.findClubs;
  Report.find = originalMethods.findReports;
  await new Promise((resolve, reject) =>
    server.close((error) => (error ? reject(error) : resolve()))
  );
});

test("login, account creation, credential updates, and logout", async () => {
  const missingCookie = await request("/api/accounts", {
    method: "POST",
    body: { username: "blocked", password: "blocked-password" },
  });
  assert.equal(missingCookie.response.status, 401);

  const initialLogin = await request("/api/login", {
    method: "POST",
    body: { username: "INITIAL", password: "initial-password" },
  });
  assert.equal(initialLogin.response.status, 200);
  assert.equal(initialLogin.data.user.username, "initial");
  const initialCookie = getCookie(initialLogin.response);
  assert.match(initialLogin.response.headers.get("set-cookie"), /HttpOnly/i);

  const refreshedSession = await request("/api/session", {
    cookie: initialCookie,
  });
  assert.equal(refreshedSession.response.status, 200);
  assert.equal(refreshedSession.data.user.username, "initial");

  const addedAccount = await request("/api/accounts", {
    method: "POST",
    cookie: initialCookie,
    body: { username: "staff", password: "staff-password" },
  });
  assert.equal(addedAccount.response.status, 201);
  assert.equal(addedAccount.data.user.username, "staff");
  assert.equal(
    await bcrypt.compare("staff-password", accounts[1].passwordHash),
    true
  );
  assert.equal(JSON.stringify(addedAccount.data).includes("password"), false);

  const duplicateAccount = await request("/api/accounts", {
    method: "POST",
    cookie: initialCookie,
    body: { username: "STAFF", password: "another-password" },
  });
  assert.equal(duplicateAccount.response.status, 409);

  const credentialUpdate = await request("/api/accounts/credentials", {
    method: "PUT",
    cookie: initialCookie,
    body: {
      currentUsername: "initial",
      currentPassword: "initial-password",
      newUsername: "renamed",
      newPassword: "updated-password",
    },
  });
  assert.equal(credentialUpdate.response.status, 200);
  assert.equal(credentialUpdate.data.user.username, "renamed");
  const updatedCookie = getCookie(credentialUpdate.response);
  await ensureInitialAccount();
  assert.equal(accounts[0].username, "renamed");
  assert.equal(
    await bcrypt.compare("updated-password", accounts[0].passwordHash),
    true
  );

  const previousCredentials = await request("/api/login", {
    method: "POST",
    body: { username: "initial", password: "initial-password" },
  });
  assert.equal(previousCredentials.response.status, 401);

  const updatedCredentials = await request("/api/login", {
    method: "POST",
    body: { username: "renamed", password: "updated-password" },
  });
  assert.equal(updatedCredentials.response.status, 200);

  const addedAccountLogin = await request("/api/login", {
    method: "POST",
    body: { username: "staff", password: "staff-password" },
  });
  assert.equal(addedAccountLogin.response.status, 200);

  const logout = await request("/api/logout", {
    method: "POST",
    cookie: updatedCookie,
  });
  assert.equal(logout.response.status, 200);
  assert.match(logout.response.headers.get("set-cookie"), /Expires=/i);

  const afterLogout = await request("/api/session");
  assert.equal(afterLogout.response.status, 401);
});

test("production frontend CORS and authenticated admin and club routes", async () => {
  const origins = [
    "https://paynthra247.vercel.app",
    "https://pay-nthra24.vercel.app",
  ];
  const blockedOrigin = "https://untrusted.example";

  const blockedLogin = await request("/api/login", {
    method: "POST",
    origin: blockedOrigin,
    body: { username: "initial", password: "initial-password" },
  });
  assert.equal(blockedLogin.response.status, 403);

  const login = await request("/api/login", {
    method: "POST",
    origin: origins[0],
    body: { username: "renamed", password: "updated-password" },
  });
  assert.equal(login.response.status, 200);
  assert.equal(login.response.headers.get("access-control-allow-credentials"), "true");
  const cookie = getCookie(login.response);

  for (const origin of origins) {
    const anonymousClubAccess = await request("/api/clubs", { origin });
    assert.equal(anonymousClubAccess.response.status, 401);
    assert.equal(
      anonymousClubAccess.response.headers.get("access-control-allow-origin"),
      origin
    );

    const anonymousAdminAccess = await request("/api/admin", { origin });
    assert.equal(anonymousAdminAccess.response.status, 401);

    const session = await request("/api/session", { cookie, origin });
    assert.equal(session.response.status, 200);
    assert.equal(session.data.user.username, "renamed");

    const clubs = await request("/api/clubs", { cookie, origin });
    assert.equal(clubs.response.status, 200);
    assert.deepEqual(clubs.data.data, []);

    const admin = await request("/api/admin", { cookie, origin });
    assert.equal(admin.response.status, 200);
    assert.deepEqual(admin.data.reports, []);

    const logout = await request("/api/logout", {
      method: "POST",
      cookie,
      origin,
    });
    assert.equal(logout.response.status, 200);
  }
});

test("existing MongoDB account prevents environment-based bootstrap", async () => {
  accounts.length = 0;
  const existingAccount = makeAccount({
    username: "existing-admin",
    passwordHash: await bcrypt.hash("existing-password", 4),
  });
  const initialUsername = process.env.ADMIN_USERNAME;
  const initialPassword = process.env.ADMIN_PASSWORD;

  delete process.env.ADMIN_USERNAME;
  delete process.env.ADMIN_PASSWORD;

  try {
    const account = await ensureInitialAccount();

    assert.equal(account, existingAccount);
    assert.equal(accounts.length, 1);
    assert.equal(account.username, "existing-admin");
  } finally {
    process.env.ADMIN_USERNAME = initialUsername;
    process.env.ADMIN_PASSWORD = initialPassword;
  }
});

test("Render production auth cookies are secure and clear with matching options", () => {
  const originalNodeEnv = process.env.NODE_ENV;
  const originalRender = process.env.RENDER;
  process.env.NODE_ENV = "test";
  process.env.RENDER = "true";

  const cookieCalls = [];
  const response = {
    cookie: (...args) => cookieCalls.push({ method: "set", args }),
    clearCookie: (...args) => cookieCalls.push({ method: "clear", args }),
  };

  try {
    setAuthCookie(response, {
      _id: { toString: () => "test-account-id" },
      username: "admin",
      role: "admin",
    });
    clearAuthCookie(response);

    const [setCall, clearCall] = cookieCalls;
    assert.equal(setCall.args[0], "access_token");
    assert.equal(setCall.args[1].split(".").length, 3);
    assert.equal(setCall.args[2].httpOnly, true);
    assert.equal(setCall.args[2].secure, true);
    assert.equal(setCall.args[2].sameSite, "none");
    assert.equal(setCall.args[2].path, "/");
    assert.equal(clearCall.args[0], "access_token");
    assert.deepEqual(clearCall.args[1], {
      httpOnly: true,
      secure: true,
      sameSite: "none",
      path: "/",
    });
  } finally {
    if (originalNodeEnv === undefined) delete process.env.NODE_ENV;
    else process.env.NODE_ENV = originalNodeEnv;
    if (originalRender === undefined) delete process.env.RENDER;
    else process.env.RENDER = originalRender;
  }
});
