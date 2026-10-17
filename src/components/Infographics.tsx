import { Animate } from "./Animate.tsx";

/*
 * Explanatory figures for the home page. All motion is CSS (see globals.css).
 * Every element's resting style is its final state, so with reduced motion
 * the reader sees the finished picture.
 */

/** A clause being amended, then stamped as recorded. Plays once. */
export function ClauseSpecimen() {
  return (
    <Animate className="specimen">
      <figure>
        <div className="specimen-sheet">
          <p className="specimen-ref">§ 7.1 &ensp;License to provider materials</p>
          <p className="specimen-text">
            You grant us a <del className="s-del">limited, revocable</del>{" "}
            <ins className="s-ins s-ins-1">perpetual, irrevocable</ins> license to use your name, photo
            <ins className="s-ins s-ins-2">, videos</ins> and voice recordings.
          </p>
          <p className="specimen-stamp" aria-hidden="true">
            Change recorded
            <span>17 October 2026</span>
          </p>
        </div>
        <figcaption>
          An illustrative clause. Removed words are <del>struck through in red</del>; added words are{" "}
          <ins>underlined in blue</ins>.
        </figcaption>
      </figure>
    </Animate>
  );
}

/** The one-line email next to the changes it announces. Plays once. */
export function EmailVersusChanges() {
  return (
    <Animate className="compare">
      <figure>
        <div className="compare-grid">
          <div>
            <p className="label">The email you receive</p>
            <div className="mail">
              <p className="mail-meta">
                <span>From</span> Platform Support
              </p>
              <p className="mail-meta">
                <span>Subject</span> We&rsquo;ve updated our Provider Agreement
              </p>
              <p className="mail-body">
                We&rsquo;ve made some updates to our Provider Agreement. By continuing to use the platform, you agree
                to the updated terms.
              </p>
              <span className="mail-button">Accept and continue</span>
            </div>
          </div>
          <p className="compare-arrow" aria-hidden="true">
            <span>what it doesn&rsquo;t show</span>
          </p>
          <div>
            <p className="label">What changed inside</p>
            <ol className="changes">
              <li>
                <span className="ref">§ 4.2</span> We will give you <del>30 days&rsquo;</del> <ins>no</ins> notice
                before changing our fees.
              </li>
              <li>
                <span className="ref">§ 7.1</span> You grant us a <del>limited</del>{" "}
                <ins>perpetual, irrevocable</ins> license to your name and likeness.
              </li>
              <li>
                <span className="ref">§ 9.3</span>{" "}
                <ins>For 12 months after you leave, you may not see clients you met through us.</ins>
              </li>
              <li>
                <span className="ref">§ 12</span> Disputes go to <del>the courts of your state</del>{" "}
                <ins>private arbitration</ins>.
              </li>
            </ol>
          </div>
        </div>
        <figcaption>
          An illustrative example, not taken from any one platform. The email runs to a few lines; the changes can
          run to pages.
        </figcaption>
      </figure>
    </Animate>
  );
}

const STEPS = [
  { title: "Read", text: "Twice a day, we load each platform’s public terms page and keep only the agreement text." },
  { title: "Compare", text: "The text is compared, word by word, with the last copy we saved." },
  { title: "Confirm", text: "If anything differs, we load the page again shortly after to rule out glitches." },
  { title: "Record", text: "The new version is saved with its date, and the redline is published here." },
];

/** The four steps of a check, lit in turn. Plays once. */
export function HowItWorks() {
  return (
    <Animate className="steps">
      <ol>
        {STEPS.map((step, i) => (
          <li key={step.title} style={{ "--i": i } as React.CSSProperties}>
            <span className="step-mark" aria-hidden="true">
              {["i", "ii", "iii", "iv"][i]}
            </span>
            <span className="step-title">{step.title}</span>
            <span className="step-text">{step.text}</span>
          </li>
        ))}
      </ol>
      <div className="steps-rail" aria-hidden="true">
        <span />
      </div>
    </Animate>
  );
}

const DAYS = ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"];
/** The illustrative change is online from Tuesday noon to Thursday noon. */
const LIVE_FROM = 1.5;
const LIVE_TO = 3.5;
const pct = (dayPosition: number) => `${(dayPosition / DAYS.length) * 100}%`;

function Track({ checks, label, result }: { checks: number[]; label: string; result: { caught: boolean; text: string } }) {
  return (
    <div className="tl-lane">
      <p className="tl-label">{label}</p>
      <div className="tl-track">
        <span className="tl-band" style={{ left: pct(LIVE_FROM), width: pct(LIVE_TO - LIVE_FROM) }} />
        {checks.map((at) => (
          <span
            key={at}
            className={`tl-tick${at > LIVE_FROM && at < LIVE_TO ? " tl-hit" : ""}`}
            style={{ left: pct(at) }}
          />
        ))}
        <span className="tl-veil" />
      </div>
      <p className={`tl-result ${result.caught ? "tl-caught" : "tl-missed"}`}>{result.text}</p>
    </div>
  );
}

/** Why twice a day: a short-lived change, caught by frequent checks, missed by weekly ones. Plays once. */
export function CheckTimeline() {
  const twiceDaily = DAYS.flatMap((_, d) => [d + 0.25, d + 0.75]);
  const caught = twiceDaily.filter((at) => at > LIVE_FROM && at < LIVE_TO).length;
  return (
    <Animate className="timeline">
      <figure>
        <div className="tl-days" aria-hidden="true">
          {DAYS.map((d) => (
            <span key={d}>{d}</span>
          ))}
        </div>
        <p className="tl-band-label" style={{ marginLeft: pct(LIVE_FROM), width: pct(LIVE_TO - LIVE_FROM) }}>
          New terms online, then withdrawn
        </p>
        <Track
          checks={twiceDaily}
          label="Fine Print, checking twice a day"
          result={{ caught: true, text: `Recorded: ${caught} checks saw the new terms.` }}
        />
        <Track
          checks={[6.5]}
          label="Checking once a week"
          result={{ caught: false, text: "Missed: by Sunday the change was gone." }}
        />
        <figcaption>
          Platforms sometimes publish a change and pull it back within days. Checking twice a day means even a
          short-lived version stays on the record.
        </figcaption>
      </figure>
    </Animate>
  );
}

/**
 * One clause across several versions: widened quietly, pushed too far,
 * withdrawn, then back in softer words. Rows appear in turn. Plays once.
 */
export function ClauseDrift() {
  return (
    <Animate className="drift">
      <figure>
        <ol className="drift-list">
          <li className="drift-row">
            <span className="drift-when">Version 1</span>
            <p className="drift-text">
              You grant us a limited, revocable license to display your name and photo in our directory.
            </p>
            <p className="drift-note">The agreement you signed.</p>
          </li>
          <li className="drift-row">
            <span className="drift-when">Version 2</span>
            <p className="drift-text">
              You grant us a limited, revocable license to display your name and photo in our directory
              <ins> and marketing</ins>.
            </p>
            <p className="drift-note">A small edit to the public page. No email was sent.</p>
          </li>
          <li className="drift-row drift-withdrawn">
            <span className="drift-when">Version 3</span>
            <p className="drift-text">
              You grant us a <del>limited, revocable</del> <ins>perpetual, irrevocable</ins> license to <del>display</del>{" "}
              <ins>use, alter and sublicense</ins> your name, photo<ins>, video and voice</ins>.
            </p>
            <p className="drift-note">Announced by email. Clinicians objected, and it was withdrawn within a week.</p>
          </li>
          <li className="drift-row drift-return">
            <span className="drift-when">Version 4</span>
            <p className="drift-text">
              You grant us a <ins>perpetual</ins> license to your name, photo<ins> and voice</ins> for{" "}
              <ins>any purpose related to our services</ins>.
            </p>
            <p className="drift-note">Six months later, in softer words. No announcement.</p>
          </li>
        </ol>
        <figcaption>
          An illustrative clause, not taken from any one platform. Read one version at a time and each step looks
          small. Read them together and the direction is plain.
        </figcaption>
      </figure>
    </Animate>
  );
}

/** Two sources, one record: public pages watched automatically, and what clinicians are sent. Plays once. */
export function TwoSources() {
  return (
    <Animate className="sources">
      <figure>
        <div className="sources-grid">
          <div className="source source-auto">
            <p className="label">Watched automatically</p>
            <p className="source-title">Public terms pages</p>
            <p className="source-text">Every tracked page is read twice a day and compared, word for word, with the last copy.</p>
          </div>
          <div className="source source-people">
            <p className="label">Shared by clinicians</p>
            <p className="source-title">What you are sent</p>
            <p className="source-text">
              Emails, in-app notices, sign-in pop-ups and contracts that never appear on a public page.
            </p>
          </div>
        </div>
        <div className="sources-join" aria-hidden="true">
          <span className="sources-arm sources-arm-l" />
          <span className="sources-arm sources-arm-r" />
          <span className="sources-stem" />
        </div>
        <div className="sources-record">
          <p className="source-title">The record</p>
          <p className="source-text">Every version, dated, with a redline of what changed. Public and free.</p>
        </div>
      </figure>
    </Animate>
  );
}
