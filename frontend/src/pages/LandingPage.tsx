import { useEffect } from 'react';
import { LandingNav } from '../components/landing/LandingNav';
import { LandingHero } from '../components/landing/LandingHero';
import { LandingLogos } from '../components/landing/LandingLogos';
import { LandingFeatures } from '../components/landing/LandingFeatures';
import { LandingHowItWorks } from '../components/landing/LandingHowItWorks';
import { LandingDeepDive } from '../components/landing/LandingDeepDive';
import { LandingPricing } from '../components/landing/LandingPricing';
import { LandingFAQ } from '../components/landing/LandingFAQ';
import { LandingFinalCTA } from '../components/landing/LandingFinalCTA';
import { LandingFooter } from '../components/landing/LandingFooter';

export function LandingPage() {
  // Marketing surface is dark-only — overrides whatever theme the visitor
  // last picked inside the app, restored on unmount.
  useEffect(() => {
    const root = document.documentElement;
    const hadDark = root.classList.contains('dark');
    root.classList.add('dark');
    return () => {
      if (!hadDark) root.classList.remove('dark');
    };
  }, []);

  return (
    <div className="min-h-screen bg-surface text-fg">
      <LandingNav />
      <main>
        <LandingHero />
        <LandingLogos />
        <LandingFeatures />
        <LandingHowItWorks />
        <LandingDeepDive />
        <LandingPricing />
        <LandingFAQ />
        <LandingFinalCTA />
      </main>
      <LandingFooter />
    </div>
  );
}
