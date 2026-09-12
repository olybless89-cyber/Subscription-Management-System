import DashboardSidebar from './DashboardSidebar';
import DashboardTopbar from './DashboardTopbar';
import DashboardMetrics from './DashboardMetrics';
import InfrastructureMap from './InfrastructureMap';
import RecentDeployments from './RecentDeployments';
import ServicesHealth from './ServicesHealth';
import TrafficOverview from './TrafficOverview';
import BillingCard from './BillingCard';

export default function DashboardShowcase() {
  return (
    <section id="dashboard-preview" className="bg-wo-black px-4 pb-24 pt-4 lg:px-10">
      <div className="mx-auto max-w-[1400px] overflow-hidden rounded-2xl border border-white/5 shadow-2xl">
        <div className="flex">
          <DashboardSidebar />

          <div className="flex-1 bg-[#070f0c]">
            <DashboardTopbar />

            <div className="space-y-6 p-6">
              <div className="flex flex-wrap items-center justify-between gap-3">
                <div>
                  <p className="text-[10px] font-semibold tracking-[0.2em] text-wo-green">
                    WELCOME BACK
                  </p>
                  <h2 className="text-[22px] font-bold text-white">Good evening, Jeffrey.</h2>
                  <p className="text-[12.5px] text-wo-muted">
                    <span className="text-wo-green">All systems operational.</span> Your cloud is
                    running smoothly.
                  </p>
                </div>
                <div className="flex items-center gap-3">
                  <span className="text-[12px] text-white/40">Mon, Dec 9, 2024</span>
                  <span className="flex items-center gap-1.5 rounded-full bg-wo-green/10 px-3 py-1.5 text-[11px] font-semibold text-wo-green">
                    <span className="h-1.5 w-1.5 rounded-full bg-wo-green" /> ALL SYSTEMS
                    OPERATIONAL
                  </span>
                </div>
              </div>

              <DashboardMetrics />

              <div className="grid grid-cols-1 gap-4 lg:grid-cols-3">
                <div className="lg:col-span-2">
                  <InfrastructureMap />
                </div>
                <RecentDeployments />
              </div>

              <div className="grid grid-cols-1 gap-4 lg:grid-cols-3">
                <ServicesHealth />
                <TrafficOverview />
                <BillingCard />
              </div>
            </div>
          </div>
        </div>
      </div>
    </section>
  );
}
