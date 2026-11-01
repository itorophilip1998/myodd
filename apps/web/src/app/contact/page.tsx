import { publicMetadata, SUPPORT_EMAIL } from '@/lib/public-seo';
import Link from 'next/link';

export const metadata = publicMetadata('/contact', 'Contact MyOdd — Customer Support', `Contact MyOdd customer support at ${SUPPORT_EMAIL} for help with booking codes, collections, and your account.`);

export default function ContactPage() {
  return (
    <main className="workspace seo-content">
      <h1>Contact us</h1>
      <p>Need help with a booking code, a saved collection, or your account? Email MyOdd support and we will get back to you.</p>
      <p>
        Email:{' '}
        <a href={`mailto:${SUPPORT_EMAIL}`}>{SUPPORT_EMAIL}</a>
      </p>
      <p>Include the collection or ticket identifier when you can, and never send passwords or payment details.</p>
      <p>
        <Link href="/">Back to Create</Link> · <Link href="/faq">FAQ</Link> · <Link href="/privacy">Privacy</Link>
      </p>
    </main>
  );
}
