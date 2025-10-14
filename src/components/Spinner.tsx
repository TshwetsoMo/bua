import React from 'react';

interface SpinnerProps {
    className?: string;
}
export const Spinner: React.FC<SpinnerProps> = ({ className }) => (
    <div className={`animate-spin rounded-full h-5 w-5 border-b-2 border-current ${className}`} role="status" aria-live="polite">
      <span className="sr-only">Loading...</span>
    </div>
);
