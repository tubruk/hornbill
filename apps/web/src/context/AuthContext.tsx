import {
  createContext,
  useContext,
  useState,
  useCallback,
  useEffect,
  type ReactNode,
} from "react";
import * as api from "../api/client";

interface AuthCtx {
  token: string | null;
  email: string | null;
  login: (email: string, password: string) => Promise<void>;
  register: (email: string, password: string, passwordRepeat: string) => Promise<void>;
  logout: () => void;
  error: string | null;
  clearError: () => void;
}

const AuthContext = createContext<AuthCtx | null>(null);

export function useAuth(): AuthCtx {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error("useAuth must be used inside AuthProvider");
  return ctx;
}

export function AuthProvider({ children }: { children: ReactNode }) {
  const [token, setToken] = useState<string | null>(() => localStorage.getItem("hb_auth_token"));
  const [email, setEmail] = useState<string | null>(() => localStorage.getItem("hb_auth_email"));
  const [error, setError] = useState<string | null>(null);

  const login = useCallback(async (emailVal: string, passwordVal: string) => {
    try {
      setError(null);
      const res = await api.loginUser(emailVal, passwordVal);
      if (res.auth_token) {
        localStorage.setItem("hb_auth_token", res.auth_token);
        if (res.refresh_token) {
          localStorage.setItem("hb_refresh_token", res.refresh_token);
        }
        localStorage.setItem("hb_auth_email", emailVal);
        setToken(res.auth_token);
        setEmail(emailVal);
      } else {
        throw new Error("Invalid response from server");
      }
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : "Failed to log in";
      setError(message);
      throw err;
    }
  }, []);

  const register = useCallback(async (emailVal: string, passwordVal: string, passwordRepeatVal: string) => {
    try {
      setError(null);
      await api.registerUser(emailVal, passwordVal, passwordRepeatVal);
      // Automatically log in after registration
      await login(emailVal, passwordVal);
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : "Failed to register";
      setError(message);
      throw err;
    }
  }, [login]);

  const logout = useCallback(() => {
    localStorage.removeItem("hb_auth_token");
    localStorage.removeItem("hb_refresh_token");
    localStorage.removeItem("hb_auth_email");
    setToken(null);
    setEmail(null);
    setError(null);
  }, []);

  const clearError = useCallback(() => setError(null), []);

  useEffect(() => {
    const handleExpired = () => {
      logout();
      setError("Session expired. Please log in again.");
    };
    window.addEventListener("hb_session_expired", handleExpired);
    return () => window.removeEventListener("hb_session_expired", handleExpired);
  }, [logout]);

  return (
    <AuthContext.Provider
      value={{
        token,
        email,
        login,
        register,
        logout,
        error,
        clearError,
      }}
    >
      {children}
    </AuthContext.Provider>
  );
}
