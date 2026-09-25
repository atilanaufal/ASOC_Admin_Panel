"use client";

import { useEffect, useRef } from "react";
import { useRouter } from "next/navigation";

const IDLE_TIMEOUT_MS = 15 * 60 * 1000; // 15 minutes
const ACTIVITY_EVENTS = ["mousemove", "mousedown", "keydown", "scroll", "touchstart"];

export function AutoLogout() {
  const router = useRouter();
  const timerRef = useRef<NodeJS.Timeout | null>(null);

  const performLogout = async (reason: "session_expired" | "browser_closed") => {
    try {
      sessionStorage.removeItem("asoc_browser_session");
      await fetch("/api/auth/logout", { method: "POST" });
    } catch {}
    router.replace("/login?error=" + reason);
  };

  const resetTimer = () => {
    if (timerRef.current) {
      clearTimeout(timerRef.current);
    }
    timerRef.current = setTimeout(() => {
      performLogout("session_expired");
    }, IDLE_TIMEOUT_MS);
  };

  useEffect(() => {
    if (typeof window !== "undefined") {
      let activeSession = sessionStorage.getItem("asoc_browser_session");
      if (!activeSession) {
        sessionStorage.setItem("asoc_browser_session", Date.now().toString());
      }
    }

    const handleActivity = () => {
      resetTimer();
    };

    ACTIVITY_EVENTS.forEach((event) => {
      window.addEventListener(event, handleActivity, { passive: true });
    });

    resetTimer();

    return () => {
      if (timerRef.current) {
        clearTimeout(timerRef.current);
      }
      ACTIVITY_EVENTS.forEach((event) => {
        window.removeEventListener(event, handleActivity);
      });
    };
  }, [router]);

  return null;
}
