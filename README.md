# 🗣️ Bua — AI-Powered Student Voice & Reporting Platform

**Developer:** Tshwetso K. Mokgatlhe  
**Institution:** The Open Window Institute, Faculty of Creative Technologies  
**Modules:** DV300 (Interaction Development) & UX300 (User Experience Design)  
**Supervisor:** Armand Pretorius  
**Date:** 2025  
**License:** MIT

## 🌍 Overview

**Bua** (meaning _“Speak”_ in Setswana) is an **AI-powered web application** designed to empower South African learners to safely report issues in their schools, such as **unfair rules, discrimination, bullying, misconduct**, or **neglected facilities**, through a secure and anonymised digital platform managed by a school's Student Representitive Council.

The system combines **AI language models**, **Firebase backend services**, and **React-based user experience design** to ensure that every report is private, lawful, and actionable.  
Reports are automatically **summarised**, **redacted for PII**, and **categorised** before being routed to the relevant authority (School Governing Body, SACE, or SAHRC).

## 🚀 Core Features

### 🧠 AI Advisor

- Built-in conversational assistant powered by **Google Gemini API (2.5 Flash)**.
- Offers guidance on school policies, wellbeing, and rights.
- Users can seamlessly **“Start a Report”** from any conversation context.

### 📋 Smart Report Submission

- Automatically **redacts personally identifiable information (PII)** using AI.
- Classifies issues by topic: _Bullying, Academics, Facilities, Policy, Other_.
- Generates structured report drafts for review and submission.

### 📰 News Feed (formerly “Journal”)

- Generates **anonymised summaries** of resolved cases into a public “News Update” feed.
- Highlights systemic patterns and school-wide trends.
- Avoids repetitive posts and always references the latest cases first.

### 🧑‍💼 Admin Dashboard

- Administrators can manage reports and generate public News Feed entries.
- AI-assisted journal generation summarises key cases while maintaining confidentiality.

### 🔒 Privacy & Safety

- All user reports are anonymised at the point of submission.
- PII is detected and replaced with placeholders such as `[REDACTED_PERSON]` or `[REDACTED_LOCATION]`.
- Access is role-controlled via Firebase Authentication (Admin vs Student).

## 🧩 Tech Stack

| Layer                | Technology / Library                                         |
| -------------------- | ------------------------------------------------------------ |
| **Frontend**         | React (Next.js 14), TypeScript, Tailwind CSS                 |
| **Backend**          | Firebase Auth, Firestore, Firebase Admin SDK                 |
| **AI Layer**         | Google Gemini API (2.5 Flash) + custom summarisation service |
| **Hosting**          | Vercel / Firebase Hosting                                    |
| **State Management** | React Hooks & Context                                        |
| **Language Tools**   | ESLint + Prettier                                            |

## 📁 Project Structure

```
bua/
├── app/
│ └── api/
│ └── ai/
│ └── gemini/
│ ├── chat/route.ts # AI chat route (advisor)
│ └── summarise/route.ts # AI summarisation route
│
├── components/
│ ├── Button.tsx
│ ├── Card.tsx
│ ├── Input.tsx
│ ├── Icons.tsx
│ └── Spinner.tsx
│
├── hooks/
│ ├── useAuth.ts
│ ├── useCases.ts
│ └── useJournal.ts
│
├── lib/
│ ├── firebase/
│ │ └── client.ts
│ └── gemini.ts # Gemini AI service integration
│
├── pages/
│ ├── AIAdvisorPage.tsx # AI chat assistant
│ ├── ReportIssuePage.tsx # Form for filing reports
│ ├── CaseTrackerPage.tsx # View submitted case statuses
│ ├── AdminConsolePage.tsx # Admin dashboard for managing reports
│ ├── NewsFeedPage.tsx # Anonymised updates (previously JournalPage)
│ └── App.tsx # Main app router and layout
│
├── types.ts # Global TypeScript types
├── README.md # Documentation file
└── package.json

yaml

```

## ⚙️ Installation & Setup

### 1️⃣ Prerequisites

- Node.js **v18 or later**
- Firebase project (with Firestore + Authentication enabled)
- Google Gemini API key (optional mock service is built-in for offline use)

### 2️⃣ Clone Repository
```
git clone https://github.com/<your-username>/bua.git
cd bua
npm install
```
### 3️⃣ Configure Environment Variables

Create .env.local at the root:

```
NEXT_PUBLIC_FIREBASE_API_KEY=your_api_key
NEXT_PUBLIC_FIREBASE_AUTH_DOMAIN=your_project.firebaseapp.com
NEXT_PUBLIC_FIREBASE_PROJECT_ID=your_project_id
NEXT_PUBLIC_FIREBASE_STORAGE_BUCKET=your_project.appspot.com
NEXT_PUBLIC_FIREBASE_MESSAGING_SENDER_ID=your_sender_id
NEXT_PUBLIC_FIREBASE_APP_ID=your_app_id

FIREBASE_SERVICE_ACCOUNT_JSON={"type":"service_account", ...}
GEMINI_API_KEY=your_gemini_api_key
GEMINI_MODEL=gemini-2.5-flash
```

### 4️⃣ Run Development Server
```
npm run dev
```
Visit: http://localhost:3000

### 5️⃣ Build & Deploy

For production:
```
npm run build
npm run start
```
Deploy via:

Vercel: vercel --prod

Firebase Hosting: firebase deploy

## 🧠 AI Integration

Bua’s AI layer uses Google’s Gemini API to perform three main tasks:

Function Purpose
redactPII() Detects and replaces personally identifiable information
summariseForReport() Converts free-form text into a structured incident report
summariseCasesForJournal() Analyses multiple anonymised cases into trend summaries for the News Feed

## Key Documentation References

Google Gemini API (Generative Language Model)
https://ai.google.dev/gemini-api/docs

Firebase Admin SDK (Authentication + Firestore)
https://firebase.google.com/docs/admin/setup

Next.js App Router & Server Actions
https://nextjs.org/docs/app

Tailwind CSS Styling
https://tailwindcss.com/docs

TypeScript + React Docs
https://react.dev/learn
https://www.typescriptlang.org/docs

## 🔒 Security & Data Handling

All reports are stored without identifiable data.

Anonymisation runs client-side before data submission.

Firestore security rules restrict write/read access based on Firebase Auth.

Admin-only operations (like generating the News Feed) require verified credentials.

## 🧭 Development Notes

Mock AI responses (MockGoogleGenAI) ensure local development works without live API calls.

The NewsFeedPage replaces the old “Journal” system with the same data model for backward compatibility.

Chat history and News updates are fully scrollable and mobile-optimised.

The app’s color palette is accessible and WCAG AA compliant.

## 🪄 Future Improvements

🌐 Add multilingual AI support (English, Setswana, isiZulu, Afrikaans).

🧩 Role-specific dashboards for SGB, SACE, and SAHRC users.

📱 Convert to a Progressive Web App (PWA) for offline school environments.

🔍 Expand AI to analyse long-term patterns in student wellbeing reports.

📊 Introduce visual data analytics for authorities.

### 👨🏽‍💻 Author & Maintainer

Tshwetso K. Mokgatlhe
Interaction Development & UX Design Student
🎓 The Open Window Institute — Faculty of Creative Technologies
📍 South Africa

🐙 GitHub: https://github.com/tshwetsomo/bua

📧 Email: [221411@virtualwindow.co.za]

## 📚 References & Acknowledgements

Google AI. (2024). Gemini 2.5 API Documentation.
Retrieved from https://ai.google.dev/gemini-api

Firebase. (2025). Firebase Admin SDK & Firestore Documentation.
Retrieved from https://firebase.google.com/docs

Next.js. (2025). App Router & API Routes Documentation.
Retrieved from https://nextjs.org/docs

Tailwind Labs. (2025). Tailwind CSS Framework Documentation.
Retrieved from https://tailwindcss.com/docs

OpenAI ChatGPT & Google Gemini (2025). Collaborative assistance for conceptualisation, architecture, and code generation.

## 🪪 License

This project is licensed under the MIT License.
You are free to use, modify, and distribute this software with proper attribution.

```bash

```
