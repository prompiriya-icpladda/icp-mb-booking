import React, { createContext, useContext, useEffect, useState } from "react";
import * as SecureStore from "expo-secure-store";
import { loginEmployee } from "../services/api";

const TOKEN_KEY = "hr_scan_token";
const USER_KEY = "hr_scan_user";

interface User {
  name: string;
  role: string;
  employeeCode: string;
}

interface AuthContextValue {
  token: string | null;
  user: User | null;
  loading: boolean;
  login: (employeeCode: string, password: string) => Promise<string | null>;
  logout: () => Promise<void>;
}

const AuthContext = createContext<AuthContextValue>({
  token: null,
  user: null,
  loading: true,
  login: async () => null,
  logout: async () => {},
});

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const [token, setToken] = useState<string | null>(null);
  const [user, setUser] = useState<User | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    (async () => {
      const storedToken = await SecureStore.getItemAsync(TOKEN_KEY);
      const storedUser = await SecureStore.getItemAsync(USER_KEY);
      if (storedToken) setToken(storedToken);
      if (storedUser) {
        try { setUser(JSON.parse(storedUser)); } catch {}
      }
      setLoading(false);
    })();
  }, []);

  async function login(employeeCode: string, password: string): Promise<string | null> {
    const result = await loginEmployee(employeeCode, password);
    if (result.token && result.user) {
      await SecureStore.setItemAsync(TOKEN_KEY, result.token);
      await SecureStore.setItemAsync(USER_KEY, JSON.stringify(result.user));
      setToken(result.token);
      setUser(result.user);
      return null;
    }
    return result.error || "เข้าสู่ระบบไม่สำเร็จ";
  }

  async function logout() {
    await SecureStore.deleteItemAsync(TOKEN_KEY);
    await SecureStore.deleteItemAsync(USER_KEY);
    setToken(null);
    setUser(null);
  }

  return (
    <AuthContext.Provider value={{ token, user, loading, login, logout }}>
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth() {
  return useContext(AuthContext);
}
