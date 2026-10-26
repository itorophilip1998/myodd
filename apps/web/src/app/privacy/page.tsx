import { publicMetadata } from '@/lib/public-seo';
import type { Metadata } from 'next';
import { LegalPage } from '@/components/LegalPage';

export const metadata: Metadata = publicMetadata('/privacy', 'Privacy Policy · MyOdd', 'How MyOdd handles account data, optional analytics, and privacy preferences.');

export default function PrivacyPage() {
  return (
    <LegalPage title="Privacy Policy" eyebrow="LEGAL">
      <p>
        This Privacy Policy explains how myOdd (“we”, “us”) collects, uses, and shares information when you use
        our website and related services (the “Service”). By using myOdd, you acknowledge this Policy. For product
        rules and modes, see our <a href="/terms" target="_blank" rel="noopener noreferrer">Terms of Service</a>.
      </p>

      <h2>1. Who we are</h2>
      <p>
        Operator: myOdd. Privacy contact: <a href="mailto:support@myodd.app">support@myodd.app</a>.
      </p>

      <h2>2. Information we collect</h2>
      <h3>Account and authentication</h3>
      <p>
        Sign-in is powered by Clerk. Depending on how you register, Clerk may process identifiers such as username,
        email, authentication tokens, and session data. We store a linked account id so we can attach your saved
        collections and preferences to you.
      </p>
      <h3>Product data you create</h3>
      <ul>
        <li>Prompts, mode choices, match-day settings, and generation options you submit</li>
        <li>Generated booking codes, slip metadata, and collection titles/visibility</li>
        <li>Optional feedback and remembered defaults you choose to save</li>
        <li>Play-check results we compute when you verify tickets (match/play status notes)</li>
      </ul>
      <h3>Technical and device data</h3>
      <p>
        We may process standard logs (IP address, browser type, approximate region, timestamps) and local browser
        storage for UI settings (for example sound preferences) that synchronize with your account when signed in.
      </p>

      <h2>3. How we use information</h2>
      <ul>
        <li>Provide, secure, and improve the Service (generation, saving, sharing, verification)</li>
        <li>Authenticate you and prevent abuse</li>
        <li>Communicate about account or service issues when needed</li>
        <li>Comply with legal obligations and enforce our Terms</li>
      </ul>
      <p>We do not sell your personal information.</p>

      <h2>4. Sharing</h2>
      <p>We share data only as needed to run myOdd, including:</p>
      <ul>
        <li><strong>Clerk</strong> — authentication and account management</li>
        <li><strong>Hosting / infrastructure providers</strong> — servers, databases, and related ops</li>
        <li><strong>AI / model providers</strong> — when your prompt is processed to understand instructions (we send what is needed to fulfill the request)</li>
        <li><strong>Public sharing</strong> — if you make a collection public or share a link, viewers can see that collection’s public content</li>
        <li><strong>Legal</strong> — if required by law or to protect rights, safety, and the Service</li>
      </ul>

      <h2>5. Cookies and local storage</h2>
      <p>
        Essential cookies/storage support sign-in sessions and basic site function. We also use local storage for
        client UI settings. You can clear site data in your browser; doing so may sign you out or reset preferences.
      </p>

      <h3>Optional analytics</h3>
      <p>When enabled in production, Google Analytics 4 runs only after you opt in. Google may store analytics cookies and process browser, device, approximate location, and pseudonymous visitor information to measure visits and usage. We send action counts and generalized page categories, excluding prompts, booking codes, account identifiers, and private URLs. On public entry pages, we may send the external referring site's origin and limited campaign labels to understand traffic sources. Advertising storage and personalization remain disabled. You can reject optional analytics or disable usage analytics in the footer at any time; your choice is saved on this device. Withdrawing consent stops further analytics tracking but does not erase data already collected.</p>
      <h2>6. Retention</h2>
      <p>Collections, including public and named collections, are permanently deleted 24 hours after every match has a confirmed final result. Unsettled or unidentified matches block automatic deletion. Independent audit and training records may be retained separately.</p>
      <p>
        Account settings and independent audit records are retained as needed for the Service, backups, security, and legal requirements. You may delete collections you own from Codes.
        Account deletion requests can be sent to <a href="mailto:support@myodd.app">support@myodd.app</a>.
      </p>

      <h2>7. Security</h2>
      <p>
        We use reasonable technical and organizational measures to protect data. No method of transmission or
        storage is completely secure; use a strong password and protect your devices.
      </p>

      <h2>8. International processing</h2>
      <p>
        Data may be processed in countries where we or our providers operate. Where required, we rely on appropriate
        safeguards for cross-border transfers.
      </p>

      <h2>9. Your choices</h2>
      <ul>
        <li>Update account details via your profile / Clerk account controls</li>
        <li>Change collection visibility (public/private) or delete collections you own</li>
        <li>Contact us to request access, correction, or deletion where applicable law allows</li>
      </ul>

      <h2>10. Children</h2>
      <p>
        The Service is for adults (18+). We do not knowingly collect personal information from children.
      </p>

      <h2>11. Changes</h2>
      <p>
        We may update this Policy. The effective date at the top of the page will change when we do. Continued use
        after updates means you acknowledge the revised Policy.
      </p>

      <h2>12. Contact</h2>
      <p>
        Privacy questions: <a href="mailto:support@myodd.app">support@myodd.app</a>.
      </p>
    </LegalPage>
  );
}
