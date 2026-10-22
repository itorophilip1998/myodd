import type { Metadata } from 'next';
import { MAX_TICKET_ODDS, MODE_ODDS } from '@myodd/shared';
import { LegalPage } from '@/components/LegalPage';

export const metadata: Metadata = {
  title: 'Terms of Service · myOdd',
  description: 'Terms of Service for myOdd — SportyBet slip generation and prediction tools.',
};

export default function TermsPage() {
  return (
    <LegalPage title="Terms of Service" eyebrow="LEGAL">
      <p>
        These Terms of Service (“Terms”) govern your use of myOdd (the “Service”), including our website,
        booking-code tools, prediction features, and related accounts. By accessing or using myOdd, you agree
        to these Terms. If you do not agree, do not use the Service.
      </p>

      <h2>1. Who we are</h2>
      <p>
        myOdd is a software product that helps users explore SportyBet-style slip ideas, generate shareable
        booking codes, and review prediction-oriented information. Contact: <a href="mailto:support@myodd.app">support@myodd.app</a>.
      </p>

      <h2>2. Eligibility and responsible use</h2>
      <ul>
        <li>You must be at least 18 years old (or the legal age for gambling in your jurisdiction, if higher).</li>
        <li>You are responsible for complying with local laws on betting and online gambling.</li>
        <li>Gamble responsibly. Predictions and generated codes are not guarantees of outcomes or profit.</li>
        <li>Always confirm any bet, odds, and availability on SportyBet (or the bookmaker you use) before staking money.</li>
      </ul>

      <h2>3. Not a bookmaker</h2>
      <p>
        myOdd is not a betting operator, sportsbook, or payment processor. We do not accept stakes, settle bets,
        or hold customer funds. SportyBet and other bookmakers are independent third parties with their own terms.
      </p>

      <h2>4. Accounts</h2>
      <p>
        Some features (for example saving collections) require an account. You must provide accurate information,
        keep your credentials secure, and notify us of unauthorized use. We may suspend or terminate accounts that
        abuse the Service or violate these Terms.
      </p>

      <h2 id="modes">5. Modes and risk bands</h2>
      <p>
        When you create tickets, you may choose a mode. Modes guide target ticket odds and per-game odds bands.
        They do not guarantee hits, returns, or that SportyBet will accept a booking code. Higher-risk modes can
        produce longer or more volatile tickets.
      </p>

      <p>Ticket odds are the combined decimal odds of all selections, multiplied together. Per-selection limits apply to each individual pick. For example, three selections at 1.50 each produce total odds of approximately 3.38. A mode describes construction rules, not a measured chance of winning.</p>
      <h3 id="mode-investor">Investor Mode</h3>
      <p>Recommended starting point with the lowest target range: combined ticket odds <strong>{MODE_ODDS.INVESTOR.minimum}–{MODE_ODDS.INVESTOR.maximum}</strong>, and individual selections between <strong>1.10 and 1.50</strong>. This favors shorter-priced selections and lower combined odds than the other modes. The name does not mean an investment, a safe bet, or a promised return. Even a short-priced selection can lose.</p>
      <h3 id="mode-gambler">Gambler Mode</h3>
      <p>Medium relative risk, targeting combined odds <strong>{MODE_ODDS.GAMBLER.minimum}–{MODE_ODDS.GAMBLER.maximum}</strong>. Each selection is between <strong>1.10 and 1.80</strong>. The higher total can require more selections or higher-priced selections than Investor Mode. Results can vary substantially; every required accumulator selection must succeed for the ticket to win under the bookmaker’s settlement rules.</p>
      <h3 id="mode-japa">Japa Mode</h3>
      <p>High relative risk, targeting combined odds <strong>{MODE_ODDS.JAPA.minimum}–{MODE_ODDS.JAPA.maximum}</strong>, with individual selections between <strong>1.10 and 2.00</strong>. Combining selections increases the ways an accumulator can fail. Expect frequent losses; a high potential return does not establish a high probability of success.</p>
      <h3 id="mode-lagos-life">Lagoslife Mode</h3>
      <p>The highest target range, beginning at <strong>{MODE_ODDS.LAGOS_LIFE.minimum}</strong> combined odds and subject to the product ceiling of <strong>{MAX_TICKET_ODDS.toLocaleString('en-US')}</strong>. Individual selections remain between <strong>1.10 and 2.00</strong>. This is highly speculative and can require many selections. Frequent losses are possible. Do not treat generated codes as an income plan or use money needed for essential expenses.</p>
      <h3>How mode settings are applied</h3>
      <ul>
        <li>Select a mode on Create, then use Min and Max in Options to narrow its ticket-odds range. Those controls stay within the mode’s allowed band.</li>
        <li>Explicit mode and market choices take precedence over conflicting prompt instructions. Selected markets restrict the available choices; without manual markets, your prompt guides market selection.</li>
        <li>Available fixtures, markets, selection limits, pinned picks, and diversification rules may prevent the requested number of tickets or target odds from being achieved. The service may return fewer tickets with an explanation.</li>
        <li>Provider availability and prices are checked during code creation, but they may change afterward. Confirm the actual selections and current odds with the bookmaker before using a code.</li>
        <li>“Lower”, “medium”, and “high” describe relative product settings. They are not calibrated win probabilities or guarantees. myOdd creates booking codes and does not place bets.</li>
      </ul>

      <h2>6. Generated codes and content</h2>
      <ul>
        <li>Codes, rankings, and predictions are informational aids based on available odds, models, and your inputs.</li>
        <li>Markets expire, odds move, and bookmakers may reject or alter tickets. myOdd is not liable for those changes.</li>
        <li>Editing or regenerating from a code creates a new collection/request; we do not alter upstream bookmaker bookings.</li>
        <li>Do not use the Service for fraud, scraping abuse, or any unlawful purpose.</li>
      </ul>

      <h2>7. Intellectual property</h2>
      <p>
        The myOdd name, branding, UI, and software are owned by myOdd or its licensors. You retain rights to content
        you submit; you grant us a license to process it to provide the Service.
      </p>

      <h2>8. Disclaimers</h2>
      <p>
        THE SERVICE IS PROVIDED “AS IS” AND “AS AVAILABLE.” TO THE FULLEST EXTENT PERMITTED BY LAW, WE DISCLAIM
        WARRANTIES OF MERCHANTABILITY, FITNESS FOR A PARTICULAR PURPOSE, AND NON-INFRINGEMENT. We do not warrant
        uninterrupted or error-free operation, accurate predictions, or successful betting outcomes.
      </p>

      <h2>9. Limitation of liability</h2>
      <p>
        To the fullest extent permitted by law, myOdd and its operators are not liable for any indirect, incidental,
        special, consequential, or punitive damages, or for lost profits, lost stakes, or data loss arising from your
        use of the Service. Our aggregate liability for claims relating to the Service is limited to the greater of
        (a) fees you paid us for the Service in the three months before the claim, or (b) USD 50.
      </p>

      <h2>10. Privacy</h2>
      <p>
        How we handle personal data is described in our <a href="/privacy" target="_blank" rel="noopener noreferrer">Privacy Policy</a>, which forms part of
        these Terms.
      </p>

      <h2>11. Changes</h2>
      <p>
        We may update these Terms. Continued use after changes become effective constitutes acceptance. Material
        updates will be reflected by the effective date on this page.
      </p>

      <h2>12. Contact</h2>
      <p>
        Questions about these Terms: <a href="mailto:support@myodd.app">support@myodd.app</a>.
      </p>
    </LegalPage>
  );
}
