import React from 'react';

interface CardProps {
  children: React.ReactNode;
  className?: string;
}
export const Card: React.FC<CardProps> = ({ children, className }) => (
  <div className={`bg-white dark:bg-slate-800 shadow-md rounded-lg p-6 ${className}`}>
    {children}
  </div>
);
