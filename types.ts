// bua/types.ts
export enum Role {
  Student,
  Admin,
}

export interface User {
  id: string;
  name: string;
  role: Role;
}

export enum CaseStatus {
  Submitted = 'Submitted',
  UnderReview = 'Under Review',
  Resolved = 'Resolved',
  Closed = 'Closed',
}

export interface CaseMessage {
  id: string;
  sender: 'Student' | 'Admin';
  text: string;
  timestamp: Date;
}

export interface Case {
  id: string;
  studentId: string;
  title: string;
  category: string;
  description: string;
  redactedDescription: string;
  evidence: File | null;
  status: CaseStatus;
  history: CaseMessage[];
  resolutionNote?: string;
  createdAt: Date;
}

export interface JournalEntry {
  id: string;
  title: string;
  content: string;
  publishedAt: Date;
  relatedCaseIds: string[];
}

export interface ChatMessage {
  id: string;
  sender: 'user' | 'ai';
  text: string;
}