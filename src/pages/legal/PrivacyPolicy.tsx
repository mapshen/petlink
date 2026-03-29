import React from 'react';
import { useDocumentTitle } from '../../hooks/useDocumentTitle';
import { Alert, AlertDescription } from '../../components/ui/alert';
import { Info } from 'lucide-react';

export default function PrivacyPolicy() {
  useDocumentTitle('Privacy Policy - PetLink');

  return (
    <div className="max-w-3xl mx-auto px-4 sm:px-6 lg:px-8 py-12">
      <Alert className="mb-8 border-amber-200 bg-amber-50">
        <Info className="h-4 w-4 text-amber-600" />
        <AlertDescription className="text-amber-800">
          This privacy policy is provided for informational purposes. Please consult legal counsel for compliance verification.
        </AlertDescription>
      </Alert>

      <h1 className="text-3xl font-bold text-stone-900 mb-2">Privacy Policy</h1>
      <p className="text-sm text-stone-500 mb-10">Last updated: March 2026</p>

      <div className="space-y-10 text-stone-700 leading-relaxed">
        <section>
          <h2 className="text-xl font-semibold text-stone-900 mb-3">1. Introduction</h2>
          <p>
            PaloPlot, LLC ("we", "us", "our") operates PetLink, a product of{' '}
            <a href="https://www.pataplot.com" className="text-emerald-600 hover:underline" target="_blank" rel="noopener noreferrer">
              PataPlot
            </a>. This Privacy Policy describes how we collect, use, and protect your personal
            information when you use our services.
          </p>
        </section>

        <section>
          <h2 className="text-xl font-semibold text-stone-900 mb-3">2. Information We Collect</h2>
          <p className="mb-3">We collect the following types of information:</p>
          <ul className="list-disc pl-6 space-y-1.5">
            <li><span className="font-medium">Account information</span> — name, email address, and encrypted credentials</li>
            <li><span className="font-medium">Pet information</span> — species, breed, age, temperament, care instructions, and vaccination records</li>
            <li><span className="font-medium">Location data</span> — address and geographic coordinates for service matching</li>
            <li><span className="font-medium">Booking history</span> — service requests, dates, and status</li>
            <li><span className="font-medium">Payment information</span> — processed and stored securely by our payment processor; we do not store card numbers or bank account details</li>
            <li><span className="font-medium">Photos and media</span> — profile images and uploaded content</li>
            <li><span className="font-medium">Communications</span> — messages exchanged between users on the platform</li>
            <li><span className="font-medium">Device information</span> — browser type, operating system, and IP address collected automatically</li>
          </ul>
        </section>

        <section>
          <h2 className="text-xl font-semibold text-stone-900 mb-3">3. How We Use Your Information</h2>
          <ul className="list-disc pl-6 space-y-1.5">
            <li>Provide and maintain our pet services marketplace</li>
            <li>Process payments and facilitate transactions between users</li>
            <li>Send notifications about bookings, messages, and account activity</li>
            <li>Verify sitter identity and conduct background checks</li>
            <li>Improve the platform and develop new features</li>
            <li>Prevent fraud, enforce our terms, and protect user safety</li>
          </ul>
        </section>

        <section>
          <h2 className="text-xl font-semibold text-stone-900 mb-3">4. Information Sharing</h2>
          <p className="mb-3">
            We share information only with trusted third-party service providers as necessary to
            operate PetLink, including providers for:
          </p>
          <ul className="list-disc pl-6 space-y-1.5">
            <li>Payment processing</li>
            <li>Email delivery</li>
            <li>Background verification</li>
            <li>Cloud storage and hosting</li>
          </ul>
          <p className="mt-3 font-medium">We do not sell your personal data to third parties.</p>
        </section>

        <section>
          <h2 className="text-xl font-semibold text-stone-900 mb-3">5. Data Retention</h2>
          <p>
            We retain your account data for as long as your account is active. If you request account
            deletion, your data will be anonymized immediately and permanently removed within 30 days.
            Aggregated, anonymized data may be retained for analytics purposes.
          </p>
        </section>

        <section>
          <h2 className="text-xl font-semibold text-stone-900 mb-3">6. Your Rights</h2>
          <p className="mb-3">You have the right to:</p>
          <ul className="list-disc pl-6 space-y-1.5">
            <li><span className="font-medium">Access</span> — request information about the personal data we hold about you</li>
            <li><span className="font-medium">Correction</span> — update or correct inaccurate data through your account settings</li>
            <li><span className="font-medium">Deletion</span> — request deletion of your account and associated data</li>
            <li><span className="font-medium">Opt-out</span> — manage your notification preferences or unsubscribe from communications</li>
          </ul>
          <p className="mt-3">
            To exercise any of these rights, contact us at{' '}
            <a href="mailto:petlink@paloplot.com" className="text-emerald-600 hover:underline">
              petlink@paloplot.com
            </a>.
          </p>
        </section>

        <section>
          <h2 className="text-xl font-semibold text-stone-900 mb-3">7. Children's Privacy</h2>
          <p>
            PetLink is not intended for users under the age of 13. We do not knowingly collect
            personal information from children under 13. If we become aware that we have collected
            such information, we will take steps to delete it promptly.
          </p>
        </section>

        <section>
          <h2 className="text-xl font-semibold text-stone-900 mb-3">8. Security</h2>
          <p>
            We implement industry-standard security measures including encryption in transit,
            secure credential storage, and access controls to protect your data. However, no method
            of transmission or storage is 100% secure, and we cannot guarantee absolute security.
          </p>
        </section>

        <section>
          <h2 className="text-xl font-semibold text-stone-900 mb-3">9. Changes to This Policy</h2>
          <p>
            We may update this Privacy Policy from time to time. When we make material changes, we
            will notify you via the email address associated with your account. Your continued use of
            PetLink after changes are posted constitutes acceptance of the updated policy.
          </p>
        </section>

        <section>
          <h2 className="text-xl font-semibold text-stone-900 mb-3">10. Contact</h2>
          <p>
            If you have questions about this Privacy Policy, contact us at{' '}
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
