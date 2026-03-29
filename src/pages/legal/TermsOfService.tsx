import React from 'react';
import { useDocumentTitle } from '../../hooks/useDocumentTitle';
import { Alert, AlertDescription } from '../../components/ui/alert';
import { Info } from 'lucide-react';

export default function TermsOfService() {
  useDocumentTitle('Terms of Service - PetLink');

  return (
    <div className="max-w-3xl mx-auto px-4 sm:px-6 lg:px-8 py-12">
      <Alert className="mb-8 border-amber-200 bg-amber-50">
        <Info className="h-4 w-4 text-amber-600" />
        <AlertDescription className="text-amber-800">
          These terms of service are provided for informational purposes. Please consult legal counsel for compliance verification.
        </AlertDescription>
      </Alert>

      <h1 className="text-3xl font-bold text-stone-900 mb-2">Terms of Service</h1>
      <p className="text-sm text-stone-500 mb-10">Last updated: March 2026</p>

      <div className="space-y-10 text-stone-700 leading-relaxed">
        <section>
          <h2 className="text-xl font-semibold text-stone-900 mb-3">1. Acceptance of Terms</h2>
          <p>
            By accessing or using PetLink (operated by PaloPlot, LLC), you agree to be bound by
            these Terms of Service. If you do not agree to these terms, you may not use the platform.
          </p>
        </section>

        <section>
          <h2 className="text-xl font-semibold text-stone-900 mb-3">2. Description of Service</h2>
          <p>
            PetLink is a pet services marketplace that connects pet owners with pet sitters and
            caregivers. We provide the platform for discovery, communication, booking, and payment
            processing between users.
          </p>
        </section>

        <section>
          <h2 className="text-xl font-semibold text-stone-900 mb-3">3. Accounts</h2>
          <ul className="list-disc pl-6 space-y-1.5">
            <li>You must be at least 13 years old to create an account</li>
            <li>You must provide accurate and complete information during registration</li>
            <li>Each person may maintain only one account</li>
            <li>You are responsible for maintaining the security of your account credentials</li>
            <li>You must notify us immediately of any unauthorized access to your account</li>
          </ul>
        </section>

        <section>
          <h2 className="text-xl font-semibold text-stone-900 mb-3">4. User Conduct</h2>
          <p className="mb-3">When using PetLink, you agree not to:</p>
          <ul className="list-disc pl-6 space-y-1.5">
            <li>Engage in fraudulent activity or misrepresent your identity</li>
            <li>Harass, threaten, or intimidate other users</li>
            <li>Post false, misleading, or deceptive information</li>
            <li>Use the platform for any illegal purpose</li>
            <li>Attempt to circumvent platform fees or payment processing</li>
            <li>Scrape, crawl, or use automated means to access the platform without permission</li>
          </ul>
        </section>

        <section>
          <h2 className="text-xl font-semibold text-stone-900 mb-3">5. Bookings and Payments</h2>
          <p className="mb-3">
            Bookings are agreements between pet owners and sitters. PetLink facilitates these
            transactions but is not a party to the service agreement between users.
          </p>
          <ul className="list-disc pl-6 space-y-1.5">
            <li>All payments are processed securely through our payment processor</li>
            <li>Cancellation terms are determined by each sitter's cancellation policy</li>
            <li>PetLink may hold funds in escrow until service completion</li>
            <li>Refund eligibility depends on the applicable cancellation policy and circumstances</li>
          </ul>
        </section>

        <section>
          <h2 className="text-xl font-semibold text-stone-900 mb-3">6. Content</h2>
          <p>
            You retain ownership of content you post on PetLink, including photos, reviews, and
            profile information. By posting content, you grant PetLink a non-exclusive, worldwide,
            royalty-free license to use, display, and distribute that content in connection with
            operating the platform.
          </p>
        </section>

        <section>
          <h2 className="text-xl font-semibold text-stone-900 mb-3">7. Sitter Responsibilities</h2>
          <ul className="list-disc pl-6 space-y-1.5">
            <li>Provide accurate descriptions of services, availability, and pricing</li>
            <li>Participate in background check verification when required</li>
            <li>Provide proper care for pets entrusted to you during bookings</li>
            <li>Communicate promptly with pet owners regarding their pets</li>
            <li>Comply with all applicable local laws and regulations</li>
          </ul>
        </section>

        <section>
          <h2 className="text-xl font-semibold text-stone-900 mb-3">8. Limitation of Liability</h2>
          <p>
            PetLink is a marketplace platform, not a pet care provider. We do not employ sitters or
            guarantee the quality of services. PetLink is not liable for the conduct, actions, or
            omissions of any user, whether owner or sitter. Users engage with each other at their
            own risk. To the maximum extent permitted by law, PetLink's liability is limited to the
            fees paid to us for the specific transaction in question.
          </p>
        </section>

        <section>
          <h2 className="text-xl font-semibold text-stone-900 mb-3">9. Dispute Resolution</h2>
          <p>
            In the event of a dispute between users, we encourage you to attempt direct resolution
            first through the platform's messaging system. PetLink may, at its discretion, mediate
            disputes but is not obligated to do so. We reserve the right to make final decisions on
            refund requests and account standing.
          </p>
        </section>

        <section>
          <h2 className="text-xl font-semibold text-stone-900 mb-3">10. Termination</h2>
          <p>
            We may suspend or terminate your account at any time if we determine that you have
            violated these Terms of Service, engaged in fraudulent or harmful activity, or for any
            other reason at our sole discretion. You may also delete your account at any time through
            your profile settings or by contacting us.
          </p>
        </section>

        <section>
          <h2 className="text-xl font-semibold text-stone-900 mb-3">11. Changes to Terms</h2>
          <p>
            We may modify these Terms of Service at any time. Material changes will be communicated
            via email or prominent notice on the platform. Your continued use of PetLink after
            changes are posted constitutes acceptance of the updated terms.
          </p>
        </section>

        <section>
          <h2 className="text-xl font-semibold text-stone-900 mb-3">12. Governing Law</h2>
          <p>
            These Terms of Service are governed by and construed in accordance with the laws of the
            United States. Any disputes arising from these terms or your use of PetLink shall be
            resolved in accordance with applicable federal and state law.
          </p>
        </section>

        <section>
          <h2 className="text-xl font-semibold text-stone-900 mb-3">13. Contact</h2>
          <p>
            If you have questions about these Terms of Service, contact us at{' '}
            <a href="mailto:petlink@paloplot.com" className="text-emerald-600 hover:underline">
              petlink@paloplot.com
            </a>.
          </p>
          <p className="mt-2 text-sm text-stone-500">
            PetLink is a product of{' '}
            <a href="https://www.pataplot.com" className="text-emerald-600 hover:underline" target="_blank" rel="noopener noreferrer">
              PataPlot
            </a>{' '}
            (PaloPlot, LLC)
          </p>
        </section>
      </div>
    </div>
  );
}
