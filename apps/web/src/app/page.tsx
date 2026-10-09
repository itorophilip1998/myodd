import { GenerateForm } from '@/components/GenerateForm';

export default function HomePage() {
  return (
    <main className="relative px-6 pt-16 pb-20 md:pt-24">
      <div
        aria-hidden
        className="pointer-events-none absolute inset-0 opacity-40"
        style={{
          backgroundImage:
            'url("data:image/svg+xml,%3Csvg width=\'60\' height=\'60\' viewBox=\'0 0 60 60\' xmlns=\'http://www.w3.org/2000/svg\'%3E%3Cg fill=\'none\' fill-rule=\'evenodd\'%3E%3Cg fill=\'%23b7e27c\' fill-opacity=\'0.06\'%3E%3Cpath d=\'M36 34v-4h-2v4h-4v2h4v4h2v-4h4v-2h-4zm0-30V0h-2v4h-4v2h4v4h2V6h4V4h-4zM6 34v-4H4v4H0v2h4v4h2v-4h4v-2H6zM6 4V0H4v4H0v2h4v4h2V6h4V4H6z\'/%3E%3C/g%3E%3C/g%3E%3C/svg%3E")',
        }}
      />
      <div className="relative max-w-3xl mx-auto text-center space-y-10">
        <div className="space-y-4 animate-rise">
          <p className="font-display text-6xl md:text-7xl text-lime tracking-tight">
            myOdd
          </p>
          <h1 className="font-display text-2xl md:text-3xl text-sand/90 font-medium">
            What do you want to bet?
          </h1>
          <p className="text-sand/60 max-w-md mx-auto">
            Turn one SportyBet code into ranked variations — or describe the
            slip you want. Probabilities, not promises.
          </p>
        </div>
        <GenerateForm />
      </div>
    </main>
  );
}
