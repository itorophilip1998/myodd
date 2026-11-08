import Link from 'next/link';

export const FAQS = [
  ['What does MyOdd do?', 'MyOdd helps you generate SportyBet football booking codes from a source code or instructions, explore available markets, and organize your selections.'],
  ['Which betting markets are supported?', 'Choose from markets available in the provider feed, including match results, double chance, and goals. Availability varies by fixture; the market picker shows available choices.'],
  ['Can I save and share my codes?', 'Sign in to save collections to your account. Saved collections are private unless you choose to publish them. Public collections can be shared by link.'],
  ['How do result checks work?', 'Open Codes or a saved collection and choose Check results to request available match and ticket updates. Unconfirmed results remain marked as unknown or pending.'],
  ['How long are collections kept?', 'Collections are eligible for deletion 24 hours after every relevant match has a confirmed final result. Save important information separately.'],
  ['Are results or winnings guaranteed?', 'No. Predictions and bookmaker odds are uncertain. MyOdd does not accept wagers or guarantee returns. Use these tools only if you are 18 or older and gambling is lawful where you live.'],
] as const;

export function FaqAnswers() {
  return <>{FAQS.map(([question, answer]) => <section key={question}><h3>{question}</h3><p>{answer}</p></section>)}</>;
}

export function SeoContent() {
  return <article className="seo-content" aria-label="About MyOdd football tools">
    <section><h2>Football booking code generator</h2><p>MyOdd creates SportyBet football booking codes from your instructions or an existing booking code. Review selections, odds, and available markets before deciding what to do with a ticket.</p></section>
    <section><h2>How MyOdd works</h2><ol><li>Paste a source booking code or describe your football selections.</li><li>Choose a mode, match dates, and available markets, then generate codes.</li><li>Review the generated tickets. Sign in to save a collection, and publish it only when you want to share it.</li></ol><p><Link href="/generate">Open the football code generator</Link> or <Link href="/predictions">explore available football selections</Link>.</p></section>
    <section><h2>Supported betting markets</h2><p>Explore match results, double chance, and goals markets when offered by the provider. The market picker reflects actual availability; some specialist markets may not be offered for every match.</p></section>
    <section><h2>Generate, manage, and check your codes</h2><p><Link href="/history">Open Codes to browse public collections</Link>, access your saved collections after signing in, and check available football results. Match data can be delayed or unconfirmed. Public collection links are temporary.</p></section>
    <section><h2>Frequently asked questions</h2><FaqAnswers /><p><Link href="/faq">Read the MyOdd FAQ</Link> · <Link href="/about">Learn about MyOdd</Link></p></section>
    <section><h2>Responsible gambling</h2><p>18+ only. Betting involves the risk of losing money. Set limits, never chase losses, and never bet money you cannot afford to lose. MyOdd provides tools and information, not guaranteed winning predictions.</p><p><Link href="/terms">Read the terms of service</Link> and <Link href="/privacy">review privacy and analytics choices</Link>.</p></section>
  </article>;
}
