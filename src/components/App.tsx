// bua/src/components/App.tsx
"use client";

import React, { useEffect, useState } from "react";
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

export default function App({ currentUser, onSignOut }: AppProps) {
  // derive data directly from the prop (no local user copy)
  const { cases, addCase, updateCase } = useCases(currentUser);
  const { journalEntries, addJournalEntry } = useJournal();

  // active page follows role automatically whenever currentUser changes
  const [activePage, setActivePage] = useState<string>(
    currentUser.role === RoleEnum.Admin ? "admin" : "advisor"
  );
  const [pageContext, setPageContext] = useState<any>(null);

  useEffect(() => {
    // whenever identity or role changes, snap to the correct landing page
    setActivePage(currentUser.role === RoleEnum.Admin ? "admin" : "advisor");
    setPageContext(null);
  }, [currentUser.id, currentUser.role]);

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
      { name: "Journal", page: "journal" },
    ],
    [RoleEnum.Admin]: [
      { name: "Admin Console", page: "admin" },
      { name: "Journal", page: "journal" },
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
      <header className="bg-white dark:bg-slate-800 shadow-sm sticky top-0 z-10">
        <nav className="container mx-auto px-4 sm:px-6 lg:px-8">
          <div className="flex items-center justify-between h-16">
            <div className="flex items-center">
              <h1 className="text-2xl font-bold text-blue-600 dark:text-blue-400">Bua</h1>
              <div className="hidden md:block">
                <div className="ml-10 flex items-baseline space-x-4">
                  {navLinks[currentUser.role].map((link) => (
                    <button
                      key={link.name}
                      onClick={() => handleNavigate(link.page)}
                      className={`px-3 py-2 rounded-md text-sm font-medium ${
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

            <div className="flex items-center gap-4">
              <div className="flex items-center gap-2">
                <IconUserCircle />
                <span>{currentUser.name}</span>
                <span className="text-xs px-2 py-0.5 rounded-full bg-slate-200 dark:bg-slate-700 text-slate-600 dark:text-slate-300">
                  {RoleEnum[currentUser.role]}
                </span>
              </div>

              {/* Role switcher removed per requirements */}
              <Button variant="secondary" onClick={onSignOut}>
                Sign Out
              </Button>
            </div>
          </div>
        </nav>
      </header>

      <main className="py-10 container mx-auto px-4 sm:px-6 lg:px-8">{renderPage()}</main>
    </div>
  );
}
