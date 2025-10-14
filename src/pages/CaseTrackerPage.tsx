//bua/pages/CaseTrackerPage.tsx

import React from 'react';
import type { Case, CaseStatus, User } from '../../types';
import { CaseStatus as CaseStatusEnum } from '../../types';
import { Card } from '@/components/Card';

interface CaseTrackerPageProps {
  cases: Case[];
  currentUser: User;
}

const CaseTrackerPage: React.FC<CaseTrackerPageProps> = ({ cases, currentUser }) => {
    const studentCases = cases.filter(c => c.studentId === currentUser.id).sort((a,b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime());
    
    const getStatusColor = (status: CaseStatus) => {
        switch(status) {
            case CaseStatusEnum.Submitted: return 'bg-yellow-100 text-yellow-800 dark:bg-yellow-900/50 dark:text-yellow-300';
            case CaseStatusEnum.UnderReview: return 'bg-blue-100 text-blue-800 dark:bg-blue-900/50 dark:text-blue-300';
            case CaseStatusEnum.Resolved: return 'bg-green-100 text-green-800 dark:bg-green-900/50 dark:text-green-300';
            case CaseStatusEnum.Closed: return 'bg-slate-100 text-slate-800 dark:bg-slate-700 dark:text-slate-300';
            default: return 'bg-gray-100 text-gray-800 dark:bg-gray-700 dark:text-gray-300';
        }
    };
    
    return (
        <div className="max-w-4xl mx-auto">
            <h1 className="text-3xl font-bold text-slate-800 dark:text-white text-center mb-6">My Cases</h1>
            <div className="space-y-4">
                {studentCases.length > 0 ? studentCases.map(c => (
                    <Card key={c.id}>
                        <div className="flex justify-between items-start">
                           <div>
                                <h2 className="text-lg font-semibold text-slate-800 dark:text-white">{c.title}</h2>
                                <p className="text-sm text-slate-500 dark:text-slate-400">Category: {c.category} | Submitted: {new Date(c.createdAt).toLocaleDateString()}</p>
                           </div>
                           <span className={`px-2 py-1 text-xs font-medium rounded-full ${getStatusColor(c.status)}`}>{c.status}</span>
                        </div>
                        <div className="mt-4 border-t border-slate-200 dark:border-slate-700 pt-4">
                             <h3 className="font-semibold mb-2 text-slate-700 dark:text-slate-300">History</h3>
                             <ul className="space-y-2">
                                {c.history.map(h => (
                                    <li key={h.id} className="text-sm text-slate-600 dark:text-slate-400">
                                        <span className="font-semibold">{h.sender}:</span> {h.text} <span className="text-xs italic">({new Date(h.timestamp).toLocaleString()})</span>
                                    </li>
                                ))}
                             </ul>
                             {c.resolutionNote && (
                                <div className="mt-4 p-3 bg-green-50 dark:bg-green-900/50 rounded-md">
                                    <h4 className="font-semibold text-green-800 dark:text-green-300">Resolution Note</h4>
                                    <p className="text-sm text-green-700 dark:text-green-400">{c.resolutionNote}</p>
                                </div>
                             )}
                        </div>
                    </Card>
                )) : (
                    <Card className="text-center">
                        <p className="text-slate-500 dark:text-slate-400">You have not submitted any cases yet.</p>
                    </Card>
                )}
            </div>
        </div>
    );
};

export default CaseTrackerPage;