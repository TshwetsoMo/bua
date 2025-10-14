// bua/src/app/page.tsx
"use client";

import React from "react";
import App from "../components/App";
import SignInPage from "./(auth)/login/page";
import SignUpPage from "./(auth)/signup/page";
import { useAuth } from "@/hooks/useAuth";

import { signOut } from "firebase/auth";
import { auth } from "../lib/firebase/client";

export default function HomePage() {
  const { currentUser, setCurrentUser, activeAuthPage, setActiveAuthPage } = useAuth();

  if (!currentUser) {
    if (activeAuthPage === "signup") {
      return (
        <SignUpPage
          onSignIn={() => setActiveAuthPage("signin")}
          onSignUpSuccess={(user) => setCurrentUser(user)}
        />
      );
    }
    return (
      <SignInPage
        onSignUp={() => setActiveAuthPage("signup")}
        onSignInSuccess={(user) => setCurrentUser(user)}
      />
    );
  }


  const handleSignOut = async () => {
    await signOut(auth);
    setCurrentUser(null);
  };

  return <App currentUser={currentUser} onSignOut={handleSignOut} />;
}
