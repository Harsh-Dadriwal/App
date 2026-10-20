import type { Metadata } from "next";
import Link from "next/link";
import { BUSINESS } from "@/lib/business";

export const metadata: Metadata = {
  title: `Privacy policy · ${BUSINESS.name}`,
  description: `How ${BUSINESS.name} collects, uses and protects your information.`
};

function Contact() {
  return BUSINESS.supportEmail ? (
    <a href={`mailto:${BUSINESS.supportEmail}`}>{BUSINESS.supportEmail}</a>
  ) : (
    <>the contact email on our Google Play listing</>
  );
}

export default function PrivacyPolicyPage() {
  return (
    <main className="legal-page">
      <h1>Privacy policy</h1>
      <p className="legal-meta">
        {BUSINESS.name} · Last updated {BUSINESS.policyUpdated}
      </p>

      <p>
        This policy explains what information the {BUSINESS.appName} app and website (&quot;the app&quot;) collect, why, who it is shared with, and the
        choices you have. The app lets customers, electricians and architects browse our stock, place orders, ask for quotations, raise
        complaints and installation requests, and track incentives and savings plans. We follow India&apos;s Digital Personal Data Protection
        Act, 2023.
      </p>

      <h2>Information we collect</h2>
      <ul>
        <li><strong>Account details:</strong> your name, username, mobile number and (if you add one) email address, and your role (customer, electrician or architect).</li>
        <li><strong>Profile details you choose to add:</strong> city, address, company name and GST number.</li>
        <li><strong>Orders and quotations:</strong> the products and quantities you order or ask prices for, delivery addresses, contact numbers and notes.</li>
        <li><strong>Photos you upload:</strong> pictures of your requirement list, used only to prepare your quotation.</li>
        <li><strong>Service requests:</strong> complaint and installation details, address and preferred date.</li>
        <li><strong>Wallet, savings plan and incentive records:</strong> payments made, instalments, points and incentives earned. Card and UPI details are entered with our payment partner, Razorpay; we never see or store them.</li>
        <li><strong>Device information:</strong> a notification token so we can send you notifications, and basic technical logs (such as errors) that keep the service working.</li>
      </ul>
      <p>We do not collect your location, contacts, SMS messages, call logs or advertising identifiers, and we do not show advertisements.</p>

      <h2>How we use it</h2>
      <ul>
        <li>To create and secure your account, including sending one-time sign-in codes by SMS.</li>
        <li>To show you live stock, take and deliver your orders, and prepare quotations.</li>
        <li>To connect customers with electricians and architects for complaints, installations and product selections.</li>
        <li>To calculate incentives, points and savings-plan benefits.</li>
        <li>To send notifications about your orders, quotations, requests and account.</li>
        <li>To keep the records that tax and accounting law requires.</li>
      </ul>

      <h2>Who we share it with</h2>
      <p>We do not sell your information. We share only what is needed with:</p>
      <ul>
        <li><strong>The people you deal with in the app:</strong> for example, an electrician you choose for a job sees the address and contact number for that job, and an electrician or architect who prepared a product selection for you can see the orders placed from it (without prices).</li>
        <li><strong>Service providers who run the app for us:</strong> Supabase (database and sign-in), Vercel (servers), Cloudflare (photo storage), TextBee (sending sign-in codes by SMS), Google Firebase and Expo (delivering notifications) and Razorpay (payments). They may only use the information to provide their service to us.</li>
        <li><strong>Authorities,</strong> when the law requires it.</li>
      </ul>

      <h2>How long we keep it</h2>
      <p>
        We keep your account information while your account is open. When you delete your account, your name, contact details, address,
        uploaded photos and notification tokens are deleted. Records of orders, payments, quotations and invoices are kept without your
        personal details for as long as Indian tax law requires (currently up to 8 years), and then deleted.
      </p>

      <h2>Security</h2>
      <p>
        All information travels over encrypted connections (HTTPS). Access is limited by account and role, prices and other people&apos;s
        details are only shown to those allowed to see them, photos are stored privately and opened only through short-lived links, and
        sign-in codes are stored only in scrambled (hashed) form.
      </p>

      <h2>Your choices and rights</h2>
      <ul>
        <li>You can see and update your details in the app.</li>
        <li>You can turn notifications off in your phone&apos;s settings.</li>
        <li>
          You can delete your account at any time, in the app or online — see <Link href="/delete-account">how to delete your account</Link>.
        </li>
        <li>You can ask us for a copy of your information, to correct it, or raise a concern, by writing to <Contact />.</li>
      </ul>

      <h2>Children</h2>
      <p>The app is meant for adults (18 and over). We do not knowingly collect information from children.</p>

      <h2>Changes</h2>
      <p>If we change this policy we will update the date above and, for important changes, tell you in the app.</p>

      <h2>Contact</h2>
      <p>
        {BUSINESS.name}. Questions or requests about your information: <Contact />.
      </p>
    </main>
  );
}
