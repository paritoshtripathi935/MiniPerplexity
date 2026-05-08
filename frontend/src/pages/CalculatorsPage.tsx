import React from 'react';
import { Calculators } from '../components/Calculators';
import { PageHeader } from '../components/AppLayout';

interface Props {
  darkMode: boolean;
}

/**
 * Calculators in a roomier multi-column layout. The Calculators component
 * itself is a vertical stack — this page lets the browser flow it into a
 * 2-column grid via CSS columns, which is the right layout for a set of
 * independent calculators of varying height.
 */
export function CalculatorsPage({ darkMode }: Props) {
  const card = darkMode
    ? 'bg-gray-900 border-gray-800'
    : 'bg-white border-gray-200 shadow-sm';

  return (
    <>
      <PageHeader
        title="Calculators"
        subtitle="The four numbers performance marketers reach for daily. All client-side — no telemetry, no roundtrips."
      />

      <div className={`rounded-xl border ${card}`}>
        <div className="lg:columns-2 lg:gap-4 p-2 [&>div>div]:break-inside-avoid">
          <Calculators darkMode={darkMode} />
        </div>
      </div>
    </>
  );
}
