// bua/src/components/OnboardingModal.tsx
"use client";

import React, { useEffect, useRef, useState } from "react";
import { Button } from "./Button";

interface OnboardingModalProps {
  onFinish: () => void;
}

export default function OnboardingModal({ onFinish }: OnboardingModalProps) {
  const [step, setStep] = useState(0);
  const containerRef = useRef<HTMLDivElement | null>(null);

  const slides = [
    {
      title: "Welcome to Bua 🎉",
      text: "Your personal AI advisor for school life. I can answer questions and help you report issues safely.",
    },
    {
      title: "AI Advisor 💬",
      text: "Chat with the advisor about rules, clubs, or wellbeing. Get quick guidance or start a report from the chat.",
    },
    {
      title: "Report Issues ⚖️",
      text: "Turn your concern into a structured report. We’ll auto-redact PII to protect your privacy.",
    },
    {
      title: "Track Progress 📊",
      text: "Follow your case in 'My Cases' and read school updates in the Journal.",
    },
  ];

  const next = () => {
    if (step < slides.length - 1) setStep(step + 1);
    else onFinish();
  };

  const back = () => {
    if (step > 0) setStep(step - 1);
  };

  // Basic focus trap & ESC to close
  useEffect(() => {
    const previousActive = document.activeElement as HTMLElement | null;
    containerRef.current?.focus();

    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") onFinish();
      if (e.key === "ArrowRight") next();
      if (e.key === "ArrowLeft") back();
    };
    window.addEventListener("keydown", onKey);
    return () => {
      window.removeEventListener("keydown", onKey);
      previousActive?.focus();
    };
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  return (
    <div
      className="fixed inset-0 z-[100] flex items-center justify-center bg-black/50 backdrop-blur-sm"
      aria-modal="true"
      role="dialog"
    >
      <div
        ref={containerRef}
        tabIndex={-1}
        className="w-full max-w-md rounded-2xl bg-white p-6 shadow-xl outline-none dark:bg-slate-800"
      >
        <div className="mb-2 flex items-center justify-between">
          <h2 className="text-xl font-bold text-slate-900 dark:text-white">
            {slides[step].title}
          </h2>
          <button
            onClick={onFinish}
            className="rounded-lg px-2 py-1 text-sm text-slate-500 hover:bg-slate-100 dark:text-slate-300 dark:hover:bg-slate-700"
            aria-label="Skip onboarding"
          >
            Skip
          </button>
        </div>

        <p className="mb-6 text-slate-600 dark:text-slate-300">{slides[step].text}</p>

        {/* Progress dots */}
        <div className="mb-6 flex items-center justify-center gap-2">
          {slides.map((_, i) => (
            <span
              key={i}
              className={`h-2 w-2 rounded-full ${i === step ? "bg-blue-600" : "bg-slate-300 dark:bg-slate-600"}`}
            />
          ))}
        </div>

        <div className="flex items-center justify-between">
          <Button
            variant="secondary"
            onClick={back}
            disabled={step === 0}
            aria-disabled={step === 0}
          >
            Back
          </Button>

          <div className="flex items-center gap-2">
            {step < slides.length - 1 ? (
              <Button onClick={next}>Next</Button>
            ) : (
              <Button onClick={onFinish}>Get Started</Button>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
