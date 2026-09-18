import Header from '../components/marketing/Header';
import Hero from '../components/marketing/Hero';
import TrustedTechnologies from '../components/marketing/TrustedTechnologies';
import Features from '../components/marketing/Features';
import HowItWorks from '../components/marketing/HowItWorks';
import FinalCTA from '../components/marketing/FinalCTA';
import Footer from '../components/marketing/Footer';

export default function HomePage() {
  return (
    <main className="bg-wo-black">
      <Header />
      <Hero />
      <TrustedTechnologies />
      <Features />
      <HowItWorks />
      <FinalCTA />
      <Footer />
    </main>
  );
}
