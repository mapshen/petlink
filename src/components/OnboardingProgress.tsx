import React from 'react';
import { Check } from 'lucide-react';

interface OnboardingProgressProps {
  currentStep: number;
  steps: string[];
}

export default function OnboardingProgress({ currentStep, steps }: OnboardingProgressProps) {
  return (
    <div className="flex items-center justify-between mb-8">
      {steps.map((label, i) => {
        const isCompleted = i < currentStep;
        const isCurrent = i === currentStep;

        return (
          <React.Fragment key={label}>
            <div className="flex flex-col items-center gap-1.5">
              <div
                className={`
                  w-8 h-8 rounded-full flex items-center justify-center text-xs font-bold transition-colors
                  ${isCompleted ? 'bg-emerald-600 text-white' : ''}
                  ${isCurrent ? 'bg-emerald-600 text-white ring-4 ring-emerald-100' : ''}
                  ${!isCompleted && !isCurrent ? 'bg-stone-100 text-stone-400' : ''}
                `}
              >
                {isCompleted ? <Check className="w-4 h-4" /> : i + 1}
              </div>
              <span className={`text-xs font-medium ${isCurrent ? 'text-emerald-700' : 'text-stone-400'}`}>
                {label}
              </span>
            </div>
            {i < steps.length - 1 && (
              <div className={`flex-1 h-0.5 mx-2 ${i < currentStep ? 'bg-emerald-400' : 'bg-stone-200'}`} />
            )}
          </React.Fragment>
        );
      })}
    </div>
  );
}
