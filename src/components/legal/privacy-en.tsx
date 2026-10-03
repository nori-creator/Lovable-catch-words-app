import type { LegalPublicInfo } from "@/lib/legal-config";
import { OperatorDetails, operatorName } from "./operator";
import { PRIVACY_UPDATED } from "./dates";

/** Privacy policy — English translation of `privacy-ja.tsx` (keep both in step). */
export function PrivacyEn({ info }: { info: LegalPublicInfo }) {
  // 文の頭に来るので大文字で始める（設定が無いときの「the operator of CatchWords」）。
  const raw = operatorName(info, "en");
  const name = raw.charAt(0).toUpperCase() + raw.slice(1);
  return (
    <>
      <h1 className="mt-4 text-hero font-bold tracking-tight">Privacy Policy</h1>
      <p className="mt-1 text-footnote text-muted-foreground">Last updated: {PRIVACY_UPDATED.en}</p>
      <section className="legal-doc mt-6">
        <p>
          {name} (“the operator”) handles information about users of CatchWords (“the Service”) as
          described below, in accordance with Japan's Act on the Protection of Personal Information
          and other applicable laws. This is a translation; if it differs from the Japanese version,
          the Japanese version prevails.
        </p>

        <h2>1. Information we collect</h2>
        <ul>
          <li>
            Account information: email address, display name and profile photo (if you set one). If
            you sign in with Google or Apple, the email address and similar details we receive from
            that service
          </li>
          <li>
            Photos: photos you take or choose, the selfie after a capture (if you turn on “Selfie
            mode” in Settings) and photos you add to your diary
          </li>
          <li>
            Words and study records: the words you catch, cards with meanings, examples and
            explanations, your collection, diary text, your review answers and results, and your
            review schedule
          </li>
          <li>
            Usage: when you open the app, which screens you use, how many captures, scans and
            reviews you do and how long they take, and how often AI is used and fails
          </li>
          <li>
            Location: your device's location (latitude and longitude) when you take a photo, only if
            you allow location access on your device. If you turn on “Location reminders” in
            Settings, your current location when you open the app is compared with saved places
            (that current location is not stored)
          </li>
          <li>
            Language and settings: display language, native and study languages, your browser's
            language (to choose the first display language), and settings such as theme and sound
          </li>
          <li>
            Paid plan information: whether you are on Pro. Payments are processed by Stripe; the
            operator never receives your card number
          </li>
          <li>Error reports: what you send when you report an error in a word</li>
          <li>
            Technical information: to deliver the Service, your IP address, browser type and similar
            details are processed on the servers of the providers listed below
          </li>
        </ul>

        <h2>2. How we use it</h2>
        <ul>
          <li>To provide and operate the Service (sign-in, saving, syncing between devices)</li>
          <li>
            To analyse objects and text in your photos and to generate word cards, explanations,
            examples and quizzes with AI
          </li>
          <li>To generate pronunciation audio</li>
          <li>To find or generate images that match a word</li>
          <li>To show maps and place names, and to send location reminders</li>
          <li>To schedule reviews (including memory predictions)</li>
          <li>To provide paid plans and manage payments and cancellations</li>
          <li>
            To prevent abuse, investigate bugs and improve the Service. The operator views and
            analyses per-user usage figures (such as the number of captures and reviews, active days
            and screen usage). Your email address, exact location (coordinates), photos and diary
            text are not included
          </li>
          <li>
            To produce overall statistics (such as the number of users and how many keep using the
            app), handled in a form that does not identify individuals
          </li>
          <li>To show ads (only when advertising is enabled; see section 6)</li>
          <li>To respond to enquiries</li>
        </ul>

        <h2>3. Sharing with third parties</h2>
        <p>
          The operator does not provide your personal information to third parties without your
          consent, except where required by law. Providing information to the providers in section 4
          is done to entrust them with work needed to run the Service.
        </p>

        <h2>4. Service providers, by purpose</h2>
        <p>
          Which providers are used depends on the feature and on the operator's settings. This list
          also includes providers that are not in use now but would be used if the settings were
          switched.
        </p>
        <ul>
          <li>
            <strong>Hosting, database and sign-in</strong>: Lovable (publishing and running the app,
            relaying AI and map requests), Supabase (database, authentication, photo storage),
            Cloudflare (the infrastructure the app runs on), and Google or Apple (if you sign in
            with that account). All information in the Service is stored or processed here
          </li>
          <li>
            <strong>AI analysis and generation</strong>: photos, words, native and study languages,
            diary text and review results are sent to one of the following, chosen by the operator:
            Lovable AI Gateway (and, through it, Google Gemini, OpenAI and others), Google (Gemini),
            OpenAI, Anthropic, DeepSeek, Moonshot AI (Kimi), OpenRouter (including the AI providers
            behind it), or a provider of an OpenAI-compatible API. Words, example sentences,
            candidate words and review results are also sent to TypeSafe (Jev) for judgements and
            memory predictions
          </li>
          <li>
            <strong>Pronunciation audio</strong>: only the text to be read aloud (words and example
            sentences) is sent: Microsoft (Azure AI Speech), Google (Gemini speech, Cloud
            Text-to-Speech), ElevenLabs, MiniMax, Lovable AI Gateway or an OpenAI-compatible API.
            The audio is stored as shared audio that is not linked to you
          </li>
          <li>
            <strong>Images</strong>: only the word (search term) is sent: Unsplash, Wikimedia
            Commons, Higgsfield and Lovable AI Gateway (image generation). If you use the feature
            that turns a photo into 3D, that photo is sent to a 3D generation provider (such as
            Tripo3D)
          </li>
          <li>
            <strong>Maps</strong>: Google (Google Maps). When a map is shown, your device loads it
            from Google. To look up a place name from where a photo was taken, its coordinates are
            sent to Google through Lovable's relay
          </li>
          <li>
            <strong>Payments</strong>: Stripe (payments, invoices, and the subscription management
            page). Your email address, user ID and payment details are provided to Stripe
          </li>
          <li>
            <strong>Advertising</strong>: Google (AdSense), only when advertising is enabled (see
            section 6)
          </li>
        </ul>

        <h2>5. Transfers outside Japan</h2>
        <p>
          Many of these providers are located outside Japan (including the United States and China),
          and your information may be processed and stored on servers outside Japan. You can find
          information about other countries' personal information protection systems in the survey
          published by Japan's Personal Information Protection Commission. By agreeing to this
          policy and using the Service, you consent to your information being provided to providers
          in these countries.
        </p>

        <h2>6. Advertising</h2>
        <p>
          When advertising is enabled, the web version of the Service shows ads served by Google
          AdSense. Google may use cookies and device identifiers to show ads, including ads
          personalised to your interests. To learn how Google uses information, see{" "}
          <a
            href="https://policies.google.com/technologies/partner-sites"
            rel="noopener noreferrer"
            target="_blank"
          >
            How Google uses information from sites or apps that use our services
          </a>
          . You can turn off personalised ads in{" "}
          <a href="https://adssettings.google.com" rel="noopener noreferrer" target="_blank">
            Google's ad settings
          </a>
          . Users in the European Economic Area, the UK and Switzerland are asked for consent
          through Google's consent message. Pro users do not see ads.
        </p>

        <h2>7. Retention and deletion</h2>
        <p>
          We keep your information while you have an account. You can delete it yourself at any time
          from “Delete account” in Settings. Deletion cannot be undone. It erases: your profile and
          sign-in account, your photos (captured photos and profile photo), word cards, collection
          and review records, diary, scan and usage records, AI usage records and error reports.
        </p>
        <p>The following remain after deletion:</p>
        <ul>
          <li>
            Dictionary entries you added (headwords, meanings and so on). They are part of the
            dictionary shared with other learners, so they are kept, but unlinked from you
          </li>
          <li>
            Cached pronunciation audio, made from the text of words and shared; it is not linked to
            you
          </li>
          <li>Payment and invoice records held by Stripe (under the law and Stripe's terms)</li>
          <li>
            Copies in database backups and server logs, which are erased when each provider's
            retention period ends
          </li>
          <li>Information already sent to providers, which they handle under their own terms</li>
        </ul>
        <p>
          <strong>Deleting your account does not cancel a paid plan automatically.</strong> Before
          deleting, cancel it from “Manage subscription” in Settings.
        </p>

        <h2>8. Your rights</h2>
        <p>
          You may ask for disclosure of the information the operator holds about you, for its
          correction, addition or deletion, for its use to stop or for it to be erased, and for its
          provision to third parties to stop. You can edit your display name, photos and words in
          the app, and delete your account and its data from “Delete account” in Settings. For other
          requests, use the contact in section 12. We will respond in accordance with the law after
          confirming your identity.
        </p>

        <h2>9. Children</h2>
        <p>
          The Service is not directed at children under 13, and children under 13 may not use it
          (Terms of Service, section 2). If we learn that we have collected information from a child
          under 13, we will delete it.
        </p>

        <h2>10. Cookies and local storage</h2>
        <p>
          The Service uses your browser's local storage and IndexedDB to keep you signed in, to
          remember settings such as the display language, to hold data waiting to be saved while
          offline, and to cache images and audio. The Service itself does not use cookies for
          tracking or advertising. However, when advertising is enabled Google uses cookies (section
          6), and Google (when a map is shown) and Stripe (on the payment page) may use their own
          cookies and similar technologies.
        </p>

        <h2>11. Security</h2>
        <p>
          Connections are encrypted (HTTPS), and the database restricts access per user so that only
          you can read and write your own information. Keys for external services are held only on
          the server, and when the operator looks at usage, the scope is limited as described in
          section 2.
        </p>

        <h2>12. Operator and contact</h2>
        <OperatorDetails info={info} lang="en" />

        <h2>13. Changes to this policy</h2>
        <p>
          We will announce changes to this policy in the Service. For significant changes that add
          new purposes of use, we will ask for your consent again before you continue using the
          Service.
        </p>
      </section>
    </>
  );
}
