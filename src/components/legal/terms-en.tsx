import type { LegalPublicInfo } from "@/lib/legal-config";
import { OperatorDetails, operatorName } from "./operator";
import { TERMS_UPDATED } from "./dates";

/** Terms of Service — English translation of `terms-ja.tsx` (keep both in step). */
export function TermsEn({ info }: { info: LegalPublicInfo }) {
  const name = operatorName(info, "en");
  return (
    <>
      <h1 className="mt-4 text-hero font-bold tracking-tight">Terms of Service</h1>
      <p className="mt-1 text-footnote text-muted-foreground">Last updated: {TERMS_UPDATED.en}</p>
      <section className="legal-doc mt-6">
        <h2>1. Scope</h2>
        <p>
          These terms set out the conditions for using CatchWords (“the Service”), provided by{" "}
          {name} (“the operator”). By using the Service you are deemed to have agreed to these
          terms. This is a translation; if it differs from the Japanese version, the Japanese
          version prevails.
        </p>

        <h2>2. Accounts</h2>
        <p>
          You are responsible for creating your account with accurate information and for keeping
          your credentials secure. The Service is not available to anyone under 13 years of age.
        </p>

        <h2>3. Your content</h2>
        <p>
          You retain copyright in the photos, text and other content you add. You grant the operator
          the right to use that content to the extent necessary to provide and improve the Service.
        </p>

        <h2>4. Prohibited conduct</h2>
        <ul>
          <li>Infringing others' rights (portrait rights, copyright and so on)</li>
          <li>Misusing location data, including stalking</li>
          <li>
            Interfering with the operation of the Service, including unauthorised access and
            automated mass use
          </li>
          <li>Fraudulent use of payments</li>
          <li>Anything illegal or contrary to public order and morals</li>
        </ul>

        <h2>5. AI-generated content</h2>
        <p>
          The Service uses AI to create meanings, readings, example sentences, explanations,
          quizzes, pronunciation audio, images and similar content. AI-generated content may contain
          errors, and the operator does not warrant its accuracy or completeness. Use it as a study
          aid, and check anything important against a dictionary or a qualified person. If you find
          an error, you can report it with “Report an error in this entry” on that word.
        </p>

        <h2>6. Paid plan (subscription)</h2>
        <ol>
          <li>
            The Service offers a paid subscription plan (“the paid plan”). The features included in
            the paid plan are shown on the purchase screen.
          </li>
          <li>
            The price, currency and billing period (monthly or yearly) are shown on the purchase
            screen and the checkout page before you subscribe. Payments are processed by Stripe.
          </li>
          <li>
            The paid plan renews automatically for the same period unless you cancel, and the
            payment method you registered is charged on each renewal date.
          </li>
          <li>
            You can cancel at any time from “CatchWords Pro” → “Manage subscription” in{" "}
            <a href="/settings">Settings</a>. After you cancel you will not be charged from the next
            renewal date, and you can use the paid plan until the end of the period you have already
            paid for. Deleting your account does not cancel the paid plan automatically.
          </li>
          <li>
            Except where required by law, fees already paid are not refunded (including pro-rata
            refunds when you cancel part-way through a period).
          </li>
          <li>
            If a payment cannot be confirmed at renewal, the paid plan's features may be suspended.
          </li>
          <li>
            The operator may change the price or contents of the paid plan. Before changing the
            price, the operator will give reasonable advance notice in the Service or by email to
            your registered address, and the new price applies from the first renewal after the
            notice. If you do not agree, you can cancel before the next renewal date.
          </li>
          {info.trialDays > 0 && (
            <li>
              A free trial of {info.trialDays} days is included when you subscribe. If you do not
              cancel before the trial ends, the paid plan starts automatically when it ends and you
              are charged.
            </li>
          )}
          <li>The paid plan cannot be purchased inside the iPhone or Android app.</li>
          <li>
            For the full conditions of sale, see the{" "}
            <a href="/legal/tokushoho">Legal notice (Specified Commercial Transactions Act)</a>.
          </li>
        </ol>

        <h2>7. Intellectual property</h2>
        <p>
          Intellectual property in the Service — including its logo, design and the format of
          AI-generated cards — belongs to the operator or the rightful owners.
        </p>

        <h2>8. Changes and suspension</h2>
        <p>
          The operator may change or stop providing the Service. If the Service is to be
          discontinued while the paid plan is offered, the operator will give reasonable advance
          notice.
        </p>

        <h2>9. Disclaimer and limitation of liability</h2>
        <ol>
          <li>
            The operator does not warrant that the Service (including AI-generated content) is free
            of factual or legal defects.
          </li>
          <li>
            The operator is not liable for damage you suffer from using the Service, except where
            caused by the operator's intent or gross negligence.
          </li>
          <li>
            Notwithstanding the previous paragraph, if the contract between the operator and you is
            a consumer contract under Japan's Consumer Contract Act, the previous paragraph does not
            apply. In that case, for damage caused to you by the operator's negligence (other than
            gross negligence) through breach of contract or tort, the operator is liable only for
            damage that would ordinarily arise, up to the amount you paid the operator for the
            Service in the month in which the damage occurred.
          </li>
        </ol>

        <h2>10. Changes to these terms</h2>
        <p>
          The operator may change these terms in accordance with the Civil Code of Japan. The
          operator will announce the changes and the date they take effect in the Service in
          advance.
        </p>

        <h2>11. Governing law and jurisdiction</h2>
        <p>
          These terms are governed by the laws of Japan.{" "}
          {info.jurisdictionCourt
            ? `Any dispute relating to the Service shall be subject to the exclusive jurisdiction of the ${info.jurisdictionCourt} as the court of first instance.`
            : "Any dispute relating to the Service shall be brought before the court that has jurisdiction under Japan's Code of Civil Procedure."}
        </p>

        <h2>12. Contact</h2>
        <OperatorDetails info={info} lang="en" />
      </section>
    </>
  );
}
