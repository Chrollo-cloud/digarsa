import { useEffect, useState } from "react";
import { AuthContext } from "./authContext";
import { ACCOUNT_KEY, demoStore } from "./demoStore";

function session() {
  try {
    return { user: demoStore.current(), storageError: "" };
  } catch (error) {
    return { user: null, storageError: error.message };
  }
}
export default function AuthProvider({ children }) {
  const [state, setState] = useState(session);
  useEffect(() => {
    const refresh = () => setState(session());
    const unsubscribe = demoStore.subscribe(refresh);
    const sync = (event) => {
      if (!event.key || event.key === ACCOUNT_KEY) refresh();
    };
    window.addEventListener("storage", sync);
    return () => {
      unsubscribe();
      window.removeEventListener("storage", sync);
    };
  }, []);
  return (
    <AuthContext.Provider value={{ ...state, store: demoStore }}>
      {children}
    </AuthContext.Provider>
  );
}
