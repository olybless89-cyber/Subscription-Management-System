const STEPS = [
  {
    title: 'Create the customer',
    description:
      'Capture their details, website type, and domain in one form — auto-assigned to whichever admin created them.',
  },
  {
    title: 'Map their infrastructure',
    description:
      'Link the subscription to real infrastructure — the exact hosting mode and suspension strategy for that customer.',
  },
  {
    title: 'Billing runs itself',
    description:
      'Payments, reminders, grace periods, and verified suspension/restoration all happen automatically from there.',
  },
];

export default function HowItWorks() {
  return (
    <section id="how-it-works" className="border-t border-white/5 bg-wo-black py-20">
      <div className="mx-auto max-w-[1000px] px-6 lg:px-10">
        <h2 className="text-center text-[28px] font-bold text-white sm:text-[32px]">
          From new customer to automated billing, in three steps
        </h2>
        <div className="mt-14 grid grid-cols-1 gap-10 sm:grid-cols-3">
          {STEPS.map((step, i) => (
            <div key={step.title}>
              <div className="mb-4 flex h-9 w-9 items-center justify-center rounded-full bg-wo-green text-[14px] font-bold text-wo-black">
                {i + 1}
              </div>
              <h3 className="text-[15px] font-semibold text-white">{step.title}</h3>
              <p className="mt-1.5 text-[13px] leading-relaxed text-wo-muted">{step.description}</p>
            </div>
          ))}
        </div>
      </div>
    </section>
  );
}
