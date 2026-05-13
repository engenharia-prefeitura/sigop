import React, { createContext, useContext, useEffect, useState } from 'react';
import { Session, User } from '@supabase/supabase-js';
import { supabase } from '../lib/supabase';

interface AuthContextType {
    session: Session | null;
    user: User | null;
    loading: boolean;
    isOfflineSession: boolean;
    enterOfflineMode: () => Promise<boolean>;
    signOut: () => Promise<void>;
}

const OFFLINE_USER_KEY = 'sigop_offline_user';

const AuthContext = createContext<AuthContextType>({
    session: null,
    user: null,
    loading: true,
    isOfflineSession: false,
    enterOfflineMode: async () => false,
    signOut: async () => { }
});

const buildOfflineUser = (cached: any): User => ({
    id: cached.id,
    email: cached.email,
    aud: 'authenticated',
    role: 'authenticated',
    app_metadata: cached.app_metadata || {},
    user_metadata: cached.user_metadata || {},
    created_at: cached.created_at || new Date().toISOString(),
    updated_at: cached.updated_at || new Date().toISOString(),
} as User);

const cacheOfflineUser = (session: Session | null) => {
    if (!session?.user) return;
    localStorage.setItem(OFFLINE_USER_KEY, JSON.stringify({
        id: session.user.id,
        email: session.user.email,
        app_metadata: session.user.app_metadata,
        user_metadata: session.user.user_metadata,
        created_at: session.user.created_at,
        updated_at: new Date().toISOString(),
    }));
};

const readOfflineUser = (): User | null => {
    try {
        const raw = localStorage.getItem(OFFLINE_USER_KEY);
        if (!raw) return null;
        return buildOfflineUser(JSON.parse(raw));
    } catch {
        return null;
    }
};

export const AuthProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
    const [session, setSession] = useState<Session | null>(null);
    const [user, setUser] = useState<User | null>(null);
    const [isOfflineSession, setIsOfflineSession] = useState(false);
    const [loading, setLoading] = useState(true);

    useEffect(() => {
        console.log("AuthContext: Initializing...");
        let isUnmounted = false;

        // FAILSAFE: Force loading to false after 2 seconds no matter what
        const failsafeTimeout = setTimeout(() => {
            console.warn("AuthContext: FAILSAFE TIMEOUT - Forcing loading to false");
            if (!isUnmounted) {
                setLoading(false);
            }
        }, 2000);

        // Check active session
        const initAuth = async () => {
            try {
                console.log("AuthContext: Calling getSession...");

                // AGGRESSIVE CLEANUP: Clear any corrupted storage BEFORE attempting getSession
                const storageKeys = Object.keys(localStorage);
                const supabaseKeys = storageKeys.filter(k => k.startsWith('sb-') || k.includes('supabase'));

                if (supabaseKeys.length > 0) {
                    console.log("AuthContext: Found", supabaseKeys.length, "storage keys, checking for corruption...");

                    // Check if there's a token but it's likely expired/corrupted
                    const hasOldToken = supabaseKeys.some(k => {
                        try {
                            const val = localStorage.getItem(k);
                            if (val && val.includes('expires_at')) {
                                const data = JSON.parse(val);
                                const expiresAt = data.expires_at;
                                if (expiresAt && expiresAt < Date.now() / 1000) {
                                    console.warn("AuthContext: Found expired token, clearing...");
                                    return true;
                                }
                            }
                        } catch (e) {
                            // Invalid JSON, corrupted
                            console.warn("AuthContext: Found corrupted storage, clearing...");
                            return true;
                        }
                        return false;
                    });

                    if (hasOldToken && navigator.onLine) {
                        console.log("AuthContext: Clearing corrupted/expired storage...");
                        supabaseKeys.forEach(k => localStorage.removeItem(k));
                        sessionStorage.clear();
                    }
                }

                const { data: { session }, error } = await supabase.auth.getSession();

                if (error) {
                    console.error("AuthContext: getSession error:", error);

                    // If it's a refresh token error, clear everything
                    if (error.message?.includes('refresh') || error.message?.includes('fetch')) {
                        console.warn("AuthContext: Token refresh error detected, clearing all storage...");
                        Object.keys(localStorage).forEach(key => {
                            if (key.startsWith('sb-') || key.includes('supabase')) {
                                localStorage.removeItem(key);
                            }
                        });
                        sessionStorage.clear();
                    }
                    throw error;
                }

                console.log("AuthContext: Session loaded", session?.user?.email || "No user");
                if (!isUnmounted) {
                    if (session) {
                        cacheOfflineUser(session);
                        setSession(session);
                        setUser(session.user);
                        setIsOfflineSession(false);
                    } else if (!navigator.onLine) {
                        const offlineUser = readOfflineUser();
                        setSession(null);
                        setUser(offlineUser);
                        setIsOfflineSession(!!offlineUser);
                    } else {
                        setSession(null);
                        setUser(null);
                        setIsOfflineSession(false);
                    }
                    setLoading(false);
                    clearTimeout(failsafeTimeout);
                }
            } catch (e: any) {
                console.error("AuthContext: Init Error:", e?.message || e);

                // FINAL CLEANUP: If anything fails, ensure we clear corrupted state
                if (!navigator.onLine || e?.message?.includes('Failed to fetch')) {
                    const offlineUser = readOfflineUser();
                    if (offlineUser && !isUnmounted) {
                        console.warn("AuthContext: Using cached offline user");
                        setSession(null);
                        setUser(offlineUser);
                        setIsOfflineSession(true);
                        setLoading(false);
                        clearTimeout(failsafeTimeout);
                        return;
                    }
                }

                if ((e?.message?.includes('Failed to fetch') || e?.message?.includes('refresh')) && navigator.onLine) {
                    console.warn("AuthContext: Fatal error, performing complete cleanup...");
                    try {
                        Object.keys(localStorage).forEach(key => {
                            if (key.startsWith('sb-') || key.includes('supabase')) {
                                localStorage.removeItem(key);
                            }
                        });
                        sessionStorage.clear();
                    } catch (cleanupError) {
                        console.error("Cleanup error:", cleanupError);
                    }
                }

                if (!isUnmounted) {
                    setSession(null);
                    setUser(null);
                    setIsOfflineSession(false);
                    setLoading(false);
                    clearTimeout(failsafeTimeout);
                }
            }
        };

        initAuth();

        // Listen for changes
        const { data: { subscription } } = supabase.auth.onAuthStateChange((_event, session) => {
            console.log("AuthContext: Auth state changed", _event);
            if (!isUnmounted) {
                if (session) cacheOfflineUser(session);
                setSession(session);
                setUser(session?.user ?? null);
                setIsOfflineSession(false);
                setLoading(false);
            }
        });

        return () => {
            isUnmounted = true;
            clearTimeout(failsafeTimeout);
            subscription.unsubscribe();
        };
    }, []);

    const enterOfflineMode = async () => {
        const offlineUser = readOfflineUser();
        if (!offlineUser) return false;

        setSession(null);
        setUser(offlineUser);
        setIsOfflineSession(true);
        return true;
    };

    const signOut = async () => {
        setIsOfflineSession(false);
        setSession(null);
        setUser(null);
        await supabase.auth.signOut();
    };

    return (
        <AuthContext.Provider value={{ session, user, loading, isOfflineSession, enterOfflineMode, signOut }}>
            {children}
        </AuthContext.Provider>
    );
};

export const useAuth = () => useContext(AuthContext);
