import { Link } from 'react-router-dom';
import { Search, CreditCard, MapPin, CheckCircle2 } from 'lucide-react';
import { useDocumentTitle } from '../hooks/useDocumentTitle';

interface StepProps {
  readonly step: number;
  readonly title: string;
  readonly description: string;
  readonly features: string[];
  readonly icon: React.ReactNode;
  readonly reversed?: boolean;
}

function Step({ step, title, description, features, icon, reversed }: StepProps) {
  const content = (
    <div className="flex-1">
      <div className="flex items-center gap-3 mb-3">
        <div className="w-9 h-9 rounded-full bg-emerald-600 text-white flex items-center justify-center font-extrabold text-base">
          {step}
        </div>
        <h2 className="text-xl font-extrabold">{title}</h2>
      </div>
      <p className="text-stone-500 text-[15px] leading-relaxed mb-4">{description}</p>
      <div className="flex flex-wrap gap-x-4 gap-y-2">
        {features.map((f) => (
          <div key={f} className="flex items-center gap-1.5 text-sm text-stone-600">
            <CheckCircle2 className="w-4 h-4 text-emerald-500 flex-shrink-0" />
            {f}
          </div>
        ))}
      </div>
    </div>
  );

  const illustration = (
    <div className="flex-1 bg-stone-50 rounded-2xl h-52 flex items-center justify-center">
      <div className="text-stone-300">{icon}</div>
    </div>
  );

  return (
    <div className={`flex gap-10 items-center py-12 ${reversed ? 'flex-row-reverse' : ''}`}>
      {content}
      {illustration}
    </div>
  );
}

export default function HowItWorks() {
  useDocumentTitle('How It Works');

  return (
    <div>
      {/* Hero */}
      <div className="bg-gradient-to-br from-emerald-50 to-emerald-100 py-16 text-center">
        <h1 className="text-3xl font-extrabold text-emerald-900 mb-3">How PetLink Works</h1>
        <p className="text-emerald-700 text-lg max-w-md mx-auto">
          Find trusted pet sitters in your neighborhood in three simple steps.
        </p>
      </div>

      {/* Steps */}
      <div className="max-w-4xl mx-auto px-4 sm:px-6 lg:px-8 divide-y divide-stone-100">
        <Step
          step={1}
          title="Search & Browse"
          description="Enter your location and find verified sitters nearby. Filter by service type, price range, and pet size. Read real reviews from other pet owners to find the perfect match."
          features={["Dog Walking", "House Sitting", "Drop-in Visits", "Grooming"]}
          icon={<Search className="w-12 h-12" />}
        />
        <Step
          step={2}
          title="Book & Pay Securely"
          description="Pick your dates and times, select which pets need care, and book instantly. Payment is held securely until the service is completed — you're never charged until the sitter delivers."
          features={["Secure payments", "Free cancellation", "Multi-pet support"]}
          icon={<CreditCard className="w-12 h-12" />}
          reversed
        />
        <Step
          step={3}
          title="Relax & Track"
          description="Get real-time updates during walks with GPS tracking and photo updates. Care tasks like feeding and medications are tracked with a checklist so nothing is missed."
          features={["GPS tracking", "Care task reminders", "Photo updates"]}
          icon={<MapPin className="w-12 h-12" />}
        />
      </div>

      {/* CTA */}
      <div className="bg-emerald-900 py-16 text-center mt-12">
        <h2 className="text-2xl font-extrabold text-white mb-2">Ready to find your perfect sitter?</h2>
        <p className="text-emerald-300 mb-6">Join thousands of pet owners who trust PetLink.</p>
        <div className="flex gap-3 justify-center">
          <Link
            to="/search"
            className="bg-white text-emerald-900 px-7 py-3 rounded-xl font-semibold hover:bg-emerald-50 transition-colors"
          >
            Find a Sitter
          </Link>
          <Link
            to="/login"
            className="border-2 border-white/30 text-white px-7 py-3 rounded-xl font-semibold hover:border-white/60 transition-colors"
          >
            Create Account
          </Link>
        </div>
      </div>
    </div>
  );
}
