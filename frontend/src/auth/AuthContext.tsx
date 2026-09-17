import React, { createContext, useContext, useEffect, useState, useCallback } from 'react';
import { storage } from '../lib/storage';
import { api, User, Role, setOnLogout, courierRegister, courierLoginApi } from '../lib/api';

type AuthCtx = {
  user: User | null;
  loading: boolean;
  signIn: (email: string, password: string) => Promise<User>;
  signUp: (name: string, email: string, password: string, role: Role, phone?: string) => Promise<User>;
  signInCourier: (cpf: string, password: string) => Promise<User>;
  registerCourier: (payload: { name: string; cpf: string; plate: string; renavam: string }) => Promise<User>;
  signOut: () => Promise<void>;
  switchRole: (r: Role) => Promise<void>;
  refresh: () => Promise<void>;
};

const Ctx = createContext<AuthCtx | null>(null);

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const [user, setUser] = useState<User | null>(null);
  const [loading, setLoading] = useState(true);

  const clear = useCallback(async () => {
    await storage.remove('access_token');
    await storage.remove('refresh_token');
    setUser(null);
  }, []);

  useEffect(() => {
    setOnLogout(() => { clear(); });
    (async () => {
      try {
        const tok = await storage.get('access_token');
        if (tok) {
          const me = await api.me();
          setUser(me);
        }
      } catch {}
      setLoading(false);
    })();
  }, [clear]);

  const signIn = async (email: string, password: string) => {
    const res = await api.login(email, password);
    await storage.set('access_token', res.access_token);
    await storage.set('refresh_token', res.refresh_token);
    setUser(res.user);
    return res.user;
  };

  const signUp = async (name: string, email: string, password: string, role: Role, phone?: string) => {
    const res = await api.register({ name, email, password, role, phone });
    await storage.set('access_token', res.access_token);
    await storage.set('refresh_token', res.refresh_token);
    setUser(res.user);
    return res.user;
  };

  const signOut = async () => { await clear(); };

  const signInCourier = async (cpf: string, password: string) => {
    const res = await courierLoginApi(cpf, password);
    await storage.set('access_token', res.access_token);
    await storage.set('refresh_token', res.refresh_token);
    setUser(res.user);
    return res.user;
  };

  const registerCourier = async (payload: { name: string; cpf: string; plate: string; renavam: string }) => {
    const res = await courierRegister(payload);
    await storage.set('access_token', res.access_token);
    await storage.set('refresh_token', res.refresh_token);
    setUser(res.user);
    return res.user;
  };

  const switchRole = async (r: Role) => {
    const u = await api.switchRole(r);
    setUser(u);
  };

  const refresh = async () => {
    try {
      const me = await api.me();
      setUser(me);
    } catch {}
  };

  return (
    <Ctx.Provider value={{ user, loading, signIn, signUp, signInCourier, registerCourier, signOut, switchRole, refresh }}>
      {children}
    </Ctx.Provider>
  );
}

export function useAuth() {
  const v = useContext(Ctx);
  if (!v) throw new Error('useAuth must be within AuthProvider');
  return v;
}
