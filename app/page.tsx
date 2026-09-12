import Header from '@/components/marketing/Header';
import Hero from '@/components/marketing/Hero';
import DashboardShowcase from '@/components/marketing/DashboardShowcase';
import Features from '@/components/marketing/Features';
import TrustedTechnologies from '@/components/marketing/TrustedTechnologies';
import FinalCTA from '@/components/marketing/FinalCTA';
import Footer from '@/components/marketing/Footer';

export default function HomePage() {
  return (
    <main>
      <Header />
      <Hero />
      <DashboardShowcase />
      <Features />
      <TrustedTechnologies />
      <FinalCTA />
      <Footer />
    </main>
  );
}
