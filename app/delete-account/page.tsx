import type { Metadata } from "next";
import Link from "next/link";
import { BUSINESS } from "@/lib/business";

export const metadata: Metadata = {
  title: `Delete your account · ${BUSINESS.name}`,
  description: `How to delete your ${BUSINESS.appName} account and what happens to your data.`
};

export default function DeleteAccountInfoPage() {
  return (
    <main className="legal-page">
      <h1>Delete your {BUSINESS.appName} account</h1>
      <p className="legal-meta">{BUSINESS.name}</p>

      <h2>In the app</h2>
      <ol>
        <li>Open the {BUSINESS.appName} app and sign in.</li>
        <li>On the Home screen, scroll down and tap <strong>Delete my account</strong>.</li>
        <li>Confirm. Your account is deleted straight away and you are signed out.</li>
      </ol>

      <h2>On the website</h2>
      <ol>
        <li>
          Go to <Link href="/auth">{BUSINESS.website.replace(/^https?:\/\//, "")}</Link> and sign in with your mobile number or email.
        </li>
        <li>In the menu, open <strong>Account &amp; privacy</strong>.</li>
        <li>Tap <strong>Delete my account</strong>, type DELETE and confirm.</li>
      </ol>

      <h2>Can&apos;t sign in?</h2>
      <p>
        Write to {BUSINESS.supportEmail ? <a href={`mailto:${BUSINESS.supportEmail}`}>{BUSINESS.supportEmail}</a> : "the contact email on our Google Play listing"}{" "}
        from your registered email, or mention your registered mobile number, and ask us to delete your account. We will confirm it is you
        and delete it within 7 days.
      </p>

      <h2>What is deleted</h2>
      <ul>
        <li>Your sign-in, so your mobile number and email are no longer linked to us.</li>
        <li>Your name, username, contact details, address, company and GST details.</li>
        <li>Photos of requirement lists you uploaded, and your notification tokens.</li>
      </ul>

      <h2>What is kept, and for how long</h2>
      <p>
        Records of orders, payments, quotations and invoices are kept without your name or contact details for as long as Indian tax law
        requires (currently up to 8 years), then deleted. See our <Link href="/privacy">privacy policy</Link> for details.
      </p>
    </main>
  );
}
