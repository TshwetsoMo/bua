// bua/src/components/App.tsx
"use client";

import React, { useEffect, useMemo, useState } from "react";
import type { Role, User } from "../../types";
import { Role as RoleEnum } from "../../types";
import { IconUserCircle } from "./Icons";
import { Button } from "./Button";

import { useCases } from "../hooks/useCase";
import { useJournal } from "../hooks/useJournal";

import AIAdvisorPage from "../pages/AIAdvisorPage";
import ReportIssuePage from "../pages/ReportIssuePage";
import CaseTrackerPage from "../pages/CaseTrackerPage";
import AdminConsolePage from "../pages/AdminConsolePage";
import JournalPage from "../pages/JournalPage";

interface AppProps {
  currentUser: User;
  onSignOut: () => void;
}

/** ---------- Onboarding Overlay ---------- **/
function OnboardingOverlay({
  role,
  onClose,
}: {
  role: Role;
  onClose: () => void;
}) {
  const [step, setStep] = useState(0);

  const steps = useMemo(
    () =>
      role === RoleEnum.Admin
        ? [
            {
              title: "Welcome to Bua (Admin)",
              body:
                "This quick tour will show you where everything lives so you can manage reports and publish updates.",
            },
            {
              title: "Admin Console",
              body:
                "Track and resolve student reports, update statuses, and leave resolution notes—all in one place.",
            },
            {
              title: "Journal",
              body:
                "Share school-wide updates and trends. You can draft quick summaries based on recent cases.",
            },
          ]
        : [
            {
              title: "Welcome to Bua",
              body:
                "This quick tour will show you how to get help, report issues, and track progress—confidentially.",
            },
            {
              title: "AI Advisor",
              body:
                "Ask about school life, policies, clubs, or wellbeing. When needed, you can start a report right from the chat.",
            },
            {
              title: "Report & Track",
              body:
                "Use “Report an Issue” to file a case (PII is auto-redacted). Check “My Cases” to see updates from admins.",
            },
          ],
    [role]
  );

  const isLast = step === steps.length - 1;

  return (
    <div className="fixed inset-0 z-[60] flex items-center justify-center bg-slate-900/60 backdrop-blur">
      <div className="w-full max-w-xl mx-4 rounded-2xl bg-white dark:bg-slate-900 shadow-2xl border border-slate-200 dark:border-slate-800">
        <div className="p-6 sm:p-8">
          <div className="mb-2 text-xs uppercase tracking-wider text-slate-500 dark:text-slate-400">
            Quick tour • Step {step + 1} of {steps.length}
          </div>
          <h3 className="text-2xl font-bold text-slate-900 dark:text-white mb-3">
            {steps[step].title}
          </h3>
          <p className="text-slate-700 dark:text-slate-300">{steps[step].body}</p>

          <div className="mt-6 flex items-center justify-between">
            <button
              className="text-sm text-slate-500 hover:text-slate-700 dark:text-slate-400 dark:hover:text-slate-200"
              onClick={onClose}
            >
              Skip
            </button>

            <div className="flex items-center gap-2">
              {step > 0 && (
                <Button variant="secondary" onClick={() => setStep((s) => s - 1)}>
                  Back
                </Button>
              )}
              {!isLast ? (
                <Button onClick={() => setStep((s) => s + 1)}>Next</Button>
              ) : (
                <Button onClick={onClose}>Finish</Button>
              )}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
/** ---------- /Onboarding Overlay ---------- **/

export default function App({ currentUser, onSignOut }: AppProps) {
  // derive data directly from the prop (no local user copy)
  const { cases, addCase, updateCase } = useCases(currentUser);
  const { journalEntries, addJournalEntry } = useJournal();

  // active page follows role automatically whenever currentUser changes
  const [activePage, setActivePage] = useState<string>(
    currentUser.role === RoleEnum.Admin ? "admin" : "advisor"
  );
  const [pageContext, setPageContext] = useState<any>(null);

  // Onboarding state (per-user via localStorage)
  const [showOnboarding, setShowOnboarding] = useState(false);

  // Key used to track if the current UID has seen onboarding
  const onboardKey = useMemo(
    () => `bua_onboarded_${currentUser.id}`,
    [currentUser.id]
  );

  useEffect(() => {
    // whenever identity or role changes, snap to the correct landing page
    setActivePage(currentUser.role === RoleEnum.Admin ? "admin" : "advisor");
    setPageContext(null);
  }, [currentUser.id, currentUser.role]);

  // Open onboarding if this UID hasn't completed it yet
  useEffect(() => {
    try {
      const already = localStorage.getItem(onboardKey);
      if (!already) {
        // small delay so the UI is mounted before overlay
        const t = setTimeout(() => setShowOnboarding(true), 150);
        return () => clearTimeout(t);
      }
    } catch {
      // ignore storage read errors
    }
  }, [onboardKey]);

  const completeOnboarding = () => {
    try {
      localStorage.setItem(onboardKey, "1");
    } catch {
      // ignore
    }
    setShowOnboarding(false);
  };

  const handleNavigate = (page: string, context: any = null) => {
    window.scrollTo(0, 0);
    setActivePage(page);
    setPageContext(context);
  };

  const navLinks = {
    [RoleEnum.Student]: [
      { name: "AI Advisor", page: "advisor" },
      { name: "Report an Issue", page: "report" },
      { name: "My Cases", page: "tracker" },
      { name: "News Feed", page: "journal" },
    ],
    [RoleEnum.Admin]: [
      { name: "Admin Console", page: "admin" },
      { name: "News Feed", page: "journal" },
    ],
  };

  const renderPage = () => {
    switch (activePage) {
      case "advisor":
        return <AIAdvisorPage onNavigate={handleNavigate} />;
      case "report":
        return (
          <ReportIssuePage
            onNavigate={handleNavigate}
            context={pageContext}
            currentUser={currentUser}
            addCase={async (newCase) => {
              await addCase(newCase);
            }}
          />
        );
      case "tracker":
        return <CaseTrackerPage cases={cases} currentUser={currentUser} />;
      case "admin":
        return <AdminConsolePage cases={cases} updateCase={updateCase} />;
      case "journal":
        return (
          <JournalPage
            entries={journalEntries}
            cases={cases}
            currentUser={currentUser}
            addJournalEntry={addJournalEntry}
          />
        );
      default:
        return <AIAdvisorPage onNavigate={handleNavigate} />;
    }
  };

  return (
    <div className="min-h-screen text-slate-800 dark:text-slate-200">
      {/* Full-width fixed header */}
      <header className="fixed inset-x-0 top-0 z-50 w-full bg-white/90 dark:bg-slate-900/80 backdrop-blur supports-[backdrop-filter]:bg-white/60 border-b border-slate-200/70 dark:border-slate-800/70">
        <nav className="container mx-auto px-4 sm:px-6 lg:px-8">
          <div className="flex items-center justify-between h-16">
            {/* Brand + Nav */}
            <div className="flex items-center min-w-0">
              <h1 className="text-2xl font-bold text-blue-600 dark:text-blue-400 shrink-0">
                Bua
              </h1>

              {/* Desktop nav */}
              <div className="hidden md:block">
                <div className="ml-10 flex items-baseline space-x-2">
                  {navLinks[currentUser.role].map((link) => (
                    <button
                      key={link.name}
                      onClick={() => handleNavigate(link.page)}
                      className={`px-3 py-2 rounded-md text-sm font-medium whitespace-nowrap ${
                        activePage === link.page
                          ? "bg-blue-100 text-blue-700 dark:bg-blue-900 dark:text-blue-200"
                          : "text-slate-600 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-slate-700"
                      }`}
                    >
                      {link.name}
                    </button>
                  ))}
                </div>
              </div>
            </div>

            {/* User / Sign out */}
            <div className="flex items-center gap-4">
              <div className="flex items-center gap-2">
                <IconUserCircle />
                <span className="truncate max-w-[12rem]">{currentUser.name}</span>
                <span className="text-xs px-2 py-0.5 rounded-full bg-slate-200 dark:bg-slate-700 text-slate-600 dark:text-slate-300">
                  {RoleEnum[currentUser.role]}
                </span>
              </div>

              <Button variant="secondary" onClick={onSignOut}>
                Sign Out
              </Button>
            </div>
          </div>

          {/* Mobile nav (horizontal scroll) */}
          <div className="md:hidden -mb-2 pb-2 overflow-x-auto no-scrollbar">
            <div className="mt-2 flex items-center gap-2">
              {navLinks[currentUser.role].map((link) => (
                <button
                  key={link.name}
                  onClick={() => handleNavigate(link.page)}
                  className={`px-3 py-2 rounded-md text-sm font-medium whitespace-nowrap ${
                    activePage === link.page
                      ? "bg-blue-100 text-blue-700 dark:bg-blue-900 dark:text-blue-200"
                      : "text-slate-600 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-slate-700"
                  }`}
                >
                  {link.name}
                </button>
              ))}
            </div>
          </div>
        </nav>
      </header>

      {/* Add top padding equal to header height so content doesn't hide behind it */}
      <main className="pt-16 sm:pt-16">
        <div className="container mx-auto px-4 sm:px-6 lg:px-8 py-10">
          {renderPage()}
        </div>
      </main>

      {showOnboarding && (
        <OnboardingOverlay role={currentUser.role} onClose={completeOnboarding} />
      )}
    </div>
  );
}

