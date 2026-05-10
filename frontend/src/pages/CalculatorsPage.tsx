import React from 'react';
import { Calculators, PresetBar, PresetProvider } from '../components/calculators';
import { PageHeader } from '../components/AppLayout';

interface Props {
  darkMode: boolean;
}

/**
 * Calculators in a roomy 2-column flow. The Calculators component renders
 * each calc as its own Card; column-css splits them into two responsive
 * columns of varying height without the awkwardness of a CSS grid here.
 */
export function CalculatorsPage({}: Props) {
  return (
    <PresetProvider>
      <PageHeader
        title="Calculators"
        subtitle="The four numbers performance marketers reach for daily. All client-side — no telemetry, no roundtrips."
      />
      <div className="mb-4">
        <PresetBar />
      </div>
      <div className="lg:columns-2 lg:gap-4 space-y-4 lg:space-y-0 [&>div]:break-inside-avoid [&>div]:mb-4">
        <Calculators darkMode={false} />
      </div>
    </PresetProvider>
  );
}
