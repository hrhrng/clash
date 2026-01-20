import LandingNav from '../components/landing/LandingNav';
import LandingHero from '../components/landing/LandingHero';
import FeatureGrid from '../components/landing/FeatureGrid';
import LandingFooter from '../components/landing/LandingFooter';

export default function LandingPage() {
  return (
    <div className="bg-white">
      <LandingNav />
      <main>
        <LandingHero />
        <FeatureGrid />
      </main>
      <LandingFooter />
    </div>
  );
}
