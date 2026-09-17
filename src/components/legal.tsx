"use client";

import { useEffect, useState } from "react";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import { Separator } from "@/components/ui/separator";

const CONSENT_KEY = "jev-consent-v1";

function LegalSection({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div className="space-y-2">
      <h3 className="font-semibold text-foreground">{title}</h3>
      <div className="space-y-2 text-sm leading-relaxed text-muted-foreground">{children}</div>
    </div>
  );
}

function PrivacyDialog({ trigger }: { trigger: React.ReactElement }) {
  return (
    <Dialog>
      <DialogTrigger render={trigger} />
      <DialogContent className="max-h-[85dvh] overflow-y-auto max-w-lg">
        <DialogHeader>
          <DialogTitle>Privacy &amp; Cookies</DialogTitle>
          <DialogDescription>
            Summary of what this site stores and processes. Last updated: September 2026.
          </DialogDescription>
        </DialogHeader>
        <div className="space-y-4">
          <LegalSection title="Cookies">
            <p>
              This site sets no tracking or advertising cookies of its own. Your chosen consent
              preference is stored in your browser&apos;s local storage. The hosting platform
              (Vercel) may set strictly necessary technical cookies for security and load balancing.
            </p>
          </LegalSection>
          <LegalSection title="Analytics">
            <p>
              Page views and basic visit counts are measured with Vercel Web Analytics, which is
              cookieless and does not store personal data or identifiers: counts are aggregated,
              not used to profile visitors, and never merged with the game data in your browser.
            </p>
          </LegalSection>
          <LegalSection title="Local storage (strictly necessary)">
            <p>
              Game progress — XP, rank, badges and benchmark history — is saved in your
              browser&apos;s local storage under the key <code className="font-mono text-xs">jev-cube-game</code>,
              plus your consent choice under <code className="font-mono text-xs">jev-consent-v1</code>.
              This data never leaves your browser and you can clear it at any time via your browser
              settings or the &ldquo;reset&rdquo; controls.
            </p>
          </LegalSection>
          <LegalSection title="AI processing">
            <p>
              When you request a solve, the move sequence you entered is sent to this site&apos;s
              server, evaluated by a third-party AI inference service, and returned as a result. No
              account data, identifiers, or cookies are attached to these requests, and inference
              details are not stored by this site.
            </p>
          </LegalSection>
          <LegalSection title="Your choices">
            <p>
              Because nothing here is used for tracking, both consent options give you the full
              experience. Declining simply records your preference; clearing your browser storage
              revokes it.
            </p>
          </LegalSection>
        </div>
      </DialogContent>
    </Dialog>
  );
}

function DisclaimerDialog({ trigger }: { trigger: React.ReactElement }) {
  return (
    <Dialog>
      <DialogTrigger render={trigger} />
      <DialogContent className="max-h-[85dvh] overflow-y-auto max-w-lg">
        <DialogHeader>
          <DialogTitle>Disclaimer</DialogTitle>
          <DialogDescription>Legal status of this project.</DialogDescription>
        </DialogHeader>
        <div className="space-y-4">
          <LegalSection title="Entertainment only">
            <p>
              This is a fan-made demo project provided &ldquo;as is&rdquo; for entertainment and
              educational purposes, without warranty of any kind. Scores, ratings, ranks and
              &ldquo;XP&rdquo; have no value outside this site.
            </p>
          </LegalSection>
          <LegalSection title="No affiliation">
            <p>
              This project is not affiliated with, endorsed by, or sponsored by Rubik&apos;s Brand
              Ltd or Spin Master Ltd. &ldquo;Rubik&apos;s Cube&rdquo; is a trademark of its
              respective owner; this site merely simulates a classic 3×3 twisty puzzle.
            </p>
          </LegalSection>
          <LegalSection title="Third-party AI">
            <p>
              Judgments, ratings and commentary are produced by a third-party AI judgment model
              accessed through a commercial inference provider. AI output is probabilistic and may
              be inaccurate; it does not represent the views of any person or the site operator.
            </p>
          </LegalSection>
          <LegalSection title="Availability">
            <p>
              Features depend on third-party services (hosting and AI inference providers) and may
              be changed, rate-limited, or discontinued without notice.
            </p>
          </LegalSection>
          <LegalSection title="Acceptable use">
            <p>
              Solve runs are rate-limited per visitor so everyone gets to play. Don&apos;t attempt
              to bypass limits, automate access to the solve endpoint, or interfere with the
              service. You&apos;re responsible for what you submit (move sequences), and the site
              operator is responsible for how end users use the app.
            </p>
          </LegalSection>
        </div>
      </DialogContent>
    </Dialog>
  );
}

function ExperimentalDialog({ trigger }: { trigger: React.ReactElement }) {
  return (
    <Dialog>
      <DialogTrigger render={trigger} />
      <DialogContent className="max-h-[85dvh] overflow-y-auto max-w-lg">
        <DialogHeader>
          <DialogTitle>Experimental notice</DialogTitle>
          <DialogDescription>What &ldquo;experimental&rdquo; means here.</DialogDescription>
        </DialogHeader>
        <div className="space-y-4">
          <LegalSection title="AI judgments are probabilistic">
            <p>
              Difficulty ratings, meme tiers and commentary come from a third-party AI judgment
              model and are generated per request. They can be inconsistent, biased, or
              nonsensical. Treat them as part of the game, not as facts or advice.
            </p>
          </LegalSection>
          <LegalSection title="Meme commentary">
            <p>
              Humor is auto-composed from template banks selected by the model and is aimed at the
              scramble, not at people. If a line lands oddly, that&apos;s the experiment doing
              experimental things.
            </p>
          </LegalSection>
          <LegalSection title="Streaming & performance">
            <p>
              The solve stream is a live server-sent-events feed; timing, pacing and token usage
              vary with load. 3D rendering requires WebGL and may perform differently across
              devices.
            </p>
          </LegalSection>
          <LegalSection title="Changing features">
            <p>
              Mechanics, scoring, and text may change at any time as the experiment evolves. Your
              progress is local and may reset between versions.
            </p>
          </LegalSection>
        </div>
      </DialogContent>
    </Dialog>
  );
}

function ConsentBanner({ onDone }: { onDone: () => void }) {
  const choose = (value: "accepted" | "essential") => {
    try {
      localStorage.setItem(CONSENT_KEY, value);
    } catch {
      // storage unavailable — proceed without persisting
    }
    onDone();
  };
  return (
    <div className="fixed inset-x-0 bottom-0 z-50 p-3 sm:p-4">
      <div className="mx-auto max-w-3xl rounded-xl border bg-popover/95 p-4 shadow-lg backdrop-blur sm:p-5">
        <div className="flex flex-col gap-3 sm:flex-row sm:items-center">
          <p className="flex-1 text-sm leading-relaxed text-popover-foreground">
            <span className="font-semibold">A quick heads-up.</span> This site sets no ads or
            third-party trackers: only strictly necessary data is kept in your browser (game
            progress and this choice), and page views are counted anonymously without cookies.
            Solves are evaluated by a third-party AI model. See our{" "}
            <PrivacyDialog
              trigger={
                <button className="underline underline-offset-2 hover:text-foreground">
                  privacy &amp; cookies
                </button>
              }
            />
            ,{" "}
            <DisclaimerDialog
              trigger={
                <button className="underline underline-offset-2 hover:text-foreground">
                  disclaimer
                </button>
              }
            />{" "}
            and{" "}
            <ExperimentalDialog
              trigger={
                <button className="underline underline-offset-2 hover:text-foreground">
                  experimental notice
                </button>
              }
            />
            .
          </p>
          <div className="flex shrink-0 gap-2">
            <Button variant="outline" size="sm" onClick={() => choose("essential")}>
              Essential only
            </Button>
            <Button size="sm" onClick={() => choose("accepted")}>
              Accept
            </Button>
          </div>
        </div>
      </div>
    </div>
  );
}

export default function LegalChrome({ compact = false }: { compact?: boolean }) {
  const [consent, setConsent] = useState<"accepted" | "essential" | null>(null);
  const [mounted, setMounted] = useState(false);

  useEffect(() => {
    let saved: string | null = null;
    try {
      saved = localStorage.getItem(CONSENT_KEY);
    } catch {
      saved = null;
    }
    setConsent(saved === "accepted" || saved === "essential" ? saved : null);
    setMounted(true);
  }, []);

  const linkCls =
    "h-auto p-0 text-[11px] text-muted-foreground underline-offset-4 hover:underline hover:text-foreground";
  return (
    <>
      {mounted && consent === null && <ConsentBanner onDone={() => setConsent("accepted")} />}

      <footer className="flex-none border-t border-border/60 pt-1.5 pb-1">
        <nav className="flex flex-wrap items-center justify-center gap-x-1 gap-y-1 text-muted-foreground">
          <PrivacyDialog
            trigger={
              <Button variant="link" size="sm" className={linkCls}>
                Privacy &amp; Cookies
              </Button>
            }
          />
          <Separator orientation="vertical" className="mx-1 h-3" />
          <DisclaimerDialog
            trigger={
              <Button variant="link" size="sm" className={linkCls}>
                Disclaimer
              </Button>
            }
          />
          <Separator orientation="vertical" className="mx-1 h-3" />
          <ExperimentalDialog
            trigger={
              <Button variant="link" size="sm" className={linkCls}>
                Experimental Notice
              </Button>
            }
          />
          <span className="ml-2 text-[10px] text-muted-foreground/60">
            © 2026 rubikjev · fan-made, not affiliated with Rubik&apos;s Brand Ltd · AI output may be
            inaccurate
          </span>
        </nav>
      </footer>
    </>
  );
}
