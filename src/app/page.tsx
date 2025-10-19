// bua/src/app/page.tsx
"use client";

import React from "react";
import App from "../components/App";
import SignInPage from "./(auth)/login/page";
import SignUpPage from "./(auth)/signup/page";
import { useAuth } from "@/hooks/useAuth";
import { Spinner } from "@/components/Spinner";

export default function HomePage() {
  const { currentUser, setCurrentUser, activeAuthPage, setActiveAuthPage, initializing } = useAuth();

  // While auth state is being determined, show a centered spinner so we don't flash/auto-navigate.
  if (initializing) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-slate-50 dark:bg-slate-900">
        <div className="flex flex-col items-center gap-4">
          <Spinner />
          <p className="text-slate-600 dark:text-slate-300">Checking sign-in status…</p>
        </div>
      </div>
    );
  }

  // After initialization, if there's no authenticated domain user, show sign-in/up
  if (!currentUser) {
    if (activeAuthPage === "signup") {
      return <SignUpPage onSignIn={() => setActiveAuthPage("signin")} onSignUpSuccess={(user) => setCurrentUser(user)} />;
    }
    return <SignInPage onSignUp={() => setActiveAuthPage("signup")} onSignInSuccess={(user) => setCurrentUser(user)} />;
  }

  // Signed in — render the full app
  return <App currentUser={currentUser} onSignOut={() => setCurrentUser(null)} />;
}

