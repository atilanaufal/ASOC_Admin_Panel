"use client";

import { useEffect, useRef } from "react";
import { useRouter } from "next/navigation";

const IDLE_TIMEOUT_MS = 15 * 60 * 1000; // 15 minutes inactivity timeout
const ACTIVITY_THROTTLE_MS = 60 * 1000; // Throttle heartbeat/storage write to 1 minute
const ACTIVITY_EVENTS = ["mousemove", "mousedown", "keydown", "scroll", "touchstart"];

export function AutoLogout() {
  const router = useRouter();
  const timerRef = useRef<NodeJS.Timeout | null>(null);
  const lastRecordedActivity = useRef<number>(Date.now());
  const isLoggingOut = useRef<boolean>(false);

  const performLogout = async (reason: "session_expired" | "browser_closed") => {
    if (isLoggingOut.current) return;
    isLoggingOut.current = true;

    try {
      if (typeof window !== "undefined") {
        sessionStorage.removeItem("asoc_browser_session");
        localStorage.removeItem("asoc_admin_last_active");
      }
      await fetch("/api/auth/logout", { method: "POST" });
    } catch {}
    router.replace("/login?error=" + reason);
  };

  const checkInactivity = (): boolean => {
    if (typeof window === "undefined") return false;
    const lastActiveStr = localStorage.getItem("asoc_admin_last_active");
    if (!lastActiveStr) return false;

    const lastActive = parseInt(lastActiveStr, 10);
    if (!isNaN(lastActive) && Date.now() - lastActive >= IDLE_TIMEOUT_MS) {
      performLogout("session_expired");
      return true;
    }
    return false;
  };

  const resetTimer = () => {
    if (timerRef.current) {
      clearTimeout(timerRef.current);
    }

    const lastActiveStr = typeof window !== "undefined" ? localStorage.getItem("asoc_admin_last_active") : null;
    const lastActive = lastActiveStr ? parseInt(lastActiveStr, 10) : Date.now();
    const elapsed = Date.now() - (isNaN(lastActive) ? Date.now() : lastActive);
    const remaining = Math.max(0, IDLE_TIMEOUT_MS - elapsed);

    timerRef.current = setTimeout(() => {
      performLogout("session_expired");
    }, remaining);
  };

  useEffect(() => {
    if (typeof window === "undefined") return;

    // Initialize session marks
    const now = Date.now();
    const existingLastActive = localStorage.getItem("asoc_admin_last_active");
    if (!existingLastActive || now - parseInt(existingLastActive, 10) >= IDLE_TIMEOUT_MS) {
      localStorage.setItem("asoc_admin_last_active", now.toString());
    }
    sessionStorage.setItem("asoc_browser_session", now.toString());

    // Check immediately on mount
    if (checkInactivity()) return;

    const handleActivity = () => {
      if (checkInactivity()) return;

      const currentNow = Date.now();
      if (currentNow - lastRecordedActivity.current > ACTIVITY_THROTTLE_MS) {
        lastRecordedActivity.current = currentNow;
        localStorage.setItem("asoc_admin_last_active", currentNow.toString());
        // Ping refresh to keep server-side HMAC session aligned with user activity
        fetch("/api/auth/refresh", { method: "POST" }).catch(() => {});
      }
      resetTimer();
    };

    const handleVisibilityOrFocus = () => {
      if (document.visibilityState === "visible") {
        if (!checkInactivity()) {
          resetTimer();
        }
      }
    };

    ACTIVITY_EVENTS.forEach((event) => {
      window.addEventListener(event, handleActivity, { passive: true });
    });
    window.addEventListener("focus", handleVisibilityOrFocus);
    document.addEventListener("visibilitychange", handleVisibilityOrFocus);

    // Periodic check every 15 seconds to catch idle state even in background/unfocused windows
    const intervalCheck = setInterval(() => {
      checkInactivity();
    }, 15000);

    resetTimer();

    return () => {
      if (timerRef.current) clearTimeout(timerRef.current);
      clearInterval(intervalCheck);
      ACTIVITY_EVENTS.forEach((event) => {
        window.removeEventListener(event, handleActivity);
      });
      window.removeEventListener("focus", handleVisibilityOrFocus);
      document.removeEventListener("visibilitychange", handleVisibilityOrFocus);
    };
  }, [router]);

  return null;
}
