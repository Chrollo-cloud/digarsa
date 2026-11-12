import {
  ACCOUNT_KEY,
  ADMIN_PERMISSION,
} from "../features/account/demoStore.js";

// Internal development tooling only. Never import this from application UI.
export function createDemoAdminProvisioner({
  development,
  hostname,
  storage,
  accounts,
}) {
  function checkEnvironment() {
    if (
      development !== true ||
      !["localhost", "127.0.0.1", "[::1]"].includes(hostname)
    )
      throw new Error(
        "Admin provisioning is only available during local development.",
      );
  }
  function currentAccount() {
    checkEnvironment();
    const user = accounts.current();
    if (!user)
      throw new Error(
        "Log in with the demo account before provisioning it.",
      );
    return { id: user.id, name: user.name, email: user.email };
  }
  function changePermission(expectedUserId, grant) {
    const user = currentAccount();
    if (!expectedUserId || expectedUserId !== user.id)
      throw new Error("The ID must match the active demo account.");
    let db;
    try {
      db = JSON.parse(storage.getItem(ACCOUNT_KEY));
    } catch {
      throw new Error(
        "Demo account data could not be read; no data was changed.",
      );
    }
    if (
      db?.version !== 1 ||
      !Array.isArray(db.accounts) ||
      !Array.isArray(db.profiles) ||
      !db.session?.token ||
      db.session.userId !== user.id
    )
      throw new Error(
        "Demo account data or session is invalid; no data was changed.",
      );
    const matches = db.accounts.filter((row) => row?.id === user.id);
    if (matches.length !== 1 || !Array.isArray(matches[0].permissions))
      throw new Error("Demo account association is invalid; no data was changed.");
    const account = matches[0];
    if (account.permissions.includes(ADMIN_PERMISSION) !== grant) {
      account.permissions = grant
        ? [...account.permissions, ADMIN_PERMISSION]
        : account.permissions.filter((permission) => permission !== ADMIN_PERMISSION);
      try {
        storage.setItem(ACCOUNT_KEY, JSON.stringify(db));
      } catch {
        throw new Error(
          "Demo admin permission was not saved. Check browser storage.",
        );
      }
    }
    return {
      id: account.id,
      permission: ADMIN_PERMISSION,
      reloadRequired: true,
    };
  }
  return {
    currentAccount,
    provision: (expectedUserId) => changePermission(expectedUserId, true),
    revoke: (expectedUserId) => changePermission(expectedUserId, false),
  };
}
