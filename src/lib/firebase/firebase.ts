//bua/src/lib/firebase/firebase.ts
import type { Role, User, Case, JournalEntry } from '../../../types';
import { Role as RoleEnum, CaseStatus as CaseStatusEnum } from '../../../types';



const mockUsers: { [key in Role]: User } = {
  [RoleEnum.Student]: { id: 'student123', name: 'Alex', role: RoleEnum.Student },
  [RoleEnum.Admin]: { id: 'admin456', name: 'Dr. Evans', role: RoleEnum.Admin },
};

let mockCases: Case[] = [
  {
    id: 'case001', studentId: 'student123', title: 'Bullying Incident in Cafeteria', category: 'Bullying',
    description: 'During lunch, a group of older students repeatedly harassed Sarah.',
    redactedDescription: 'During lunch, a group of older students repeatedly harassed [REDACTED_STUDENT].',
    evidence: null, status: CaseStatusEnum.Resolved,
    history: [
        { id: 'msg1', sender: 'Student', text: 'Submitted report.', timestamp: new Date(Date.now() - 5 * 24 * 60 * 60 * 1000) }, 
        { id: 'msg2', sender: 'Admin', text: 'Thank you for your report. We are looking into this.', timestamp: new Date(Date.now() - 4 * 24 * 60 * 60 * 1000) }
    ],
    resolutionNote: 'Met with all students involved. Implemented new cafeteria monitoring procedures.',
    createdAt: new Date(Date.now() - 5 * 24 * 60 * 60 * 1000)
  },
  {
    id: 'case002', studentId: 'student123', title: 'Broken locker', category: 'Facilities',
    description: 'My locker (17B) in the west wing won\'t close properly.',
    redactedDescription: 'My locker (17B) in the west wing won\'t close properly.',
    evidence: null, status: CaseStatusEnum.UnderReview,
    history: [{ id: 'msg3', sender: 'Student', text: 'Submitted report.', timestamp: new Date(Date.now() - 2 * 24 * 60 * 60 * 1000) }],
    createdAt: new Date(Date.now() - 2 * 24 * 60 * 60 * 1000)
  }
];

let mockJournalEntries: JournalEntry[] = [
  {
    id: 'journal001', title: 'Improving Cafeteria Safety', 
    content: 'Based on recent feedback, we have updated our supervision protocols in the cafeteria during lunch periods to ensure a safer and more welcoming environment for all students. Staff will be more visible, and we encourage students to report any concerns immediately.', 
    publishedAt: new Date(Date.now() - 1 * 24 * 60 * 60 * 1000), relatedCaseIds: ['case001']
  }
];

// --- Mock Service ---
const FAKE_DELAY = 500;

const delay = (ms: number) => new Promise(res => setTimeout(res, ms));

export const firebaseService = {
  
  signIn: async (email: string, password: string): Promise<User | null> => {
    await delay(FAKE_DELAY);
    
    if (email.includes('admin')) {
        return mockUsers[RoleEnum.Admin];
    }
    // Check for a non-empty password for some validation
    if (password) {
        return mockUsers[RoleEnum.Student];
    }
    return null;
  },

  signUp: async (details: { name: string; email: string; password: string; role: Role }): Promise<User> => {
      await delay(FAKE_DELAY);
      const newUser: User = {
          id: `user${Date.now()}`,
          name: details.name,
          role: details.role,
      };
      
      
      return newUser;
  },

  getCurrentUser: async (): Promise<User> => {
    await delay(FAKE_DELAY / 2);
    
    return { ...mockUsers[RoleEnum.Student] };
  },

  switchUser: async(role: Role): Promise<User> => {
    await delay(FAKE_DELAY / 2);
    return { ...mockUsers[role] };
  },

  getCases: async (userId: string, userRole: Role): Promise<Case[]> => {
    await delay(FAKE_DELAY);
    if (userRole === RoleEnum.Admin) {
      return [...mockCases];
    }
    return mockCases.filter(c => c.studentId === userId);
  },

  addCase: async (newCase: Case): Promise<Case> => {
    await delay(FAKE_DELAY);
    mockCases = [newCase, ...mockCases];
    return newCase;
  },

  updateCase: async (updatedCase: Case): Promise<Case> => {
    await delay(FAKE_DELAY);
    mockCases = mockCases.map(c => c.id === updatedCase.id ? updatedCase : c);
    return updatedCase;
  },

  getJournalEntries: async (): Promise<JournalEntry[]> => {
    await delay(FAKE_DELAY);
    return [...mockJournalEntries];
  },

  addJournalEntry: async (newEntry: JournalEntry): Promise<JournalEntry> => {
    await delay(FAKE_DELAY);
    mockJournalEntries = [newEntry, ...mockJournalEntries];
    return newEntry;
  }
};