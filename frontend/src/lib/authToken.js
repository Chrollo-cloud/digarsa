const TOKEN_KEY = "digarsa.auth.access-token.v1";

export function getAccessToken() {
  try {
    return window.sessionStorage.getItem(TOKEN_KEY);
  } catch {
    return null;
  }
}

export function setAccessToken(token) {
  try {
    window.sessionStorage.setItem(TOKEN_KEY, token);
  } catch {
    throw new Error("Browser session storage is unavailable. Enable it to sign in.");
  }
}

export function clearAccessToken() {
  try {
    window.sessionStorage.removeItem(TOKEN_KEY);
  } catch {
    // In-memory auth state is still cleared by AuthProvider.
  }
}
