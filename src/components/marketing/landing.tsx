import Link from "next/link";
import { ArrowRight, BookMarked, Camera, FileText, FolderLock, Sparkles, Wrench } from "lucide-react";
import { CleveMark, ProviderGlyph } from "@/components/brand";

const NAVY = "text-[#323753]";

const FEATURES = [
  { icon: FileText, title: "Live PDF", body: "Compiles as you type. Errors land on the exact line." },
  { icon: Sparkles, title: "⌘K edits", body: "Select a passage, say what you want, accept or retry." },
  { icon: Wrench, title: "Fix with AI", body: "One click sends the error log to the model and applies the fix." },
  { icon: BookMarked, title: "arXiv citations", body: "Search papers and drop the BibTeX straight into your .bib." },
  { icon: Camera, title: "Photo to LaTeX", body: "Paste a whiteboard photo. Get equations back." },
  { icon: FolderLock, title: "Synced to your account", body: "Pick up on any device. Export a .zip any time." },
];

const FAQ = [
  {
    q: "Do I need an API key?",
    a: "No. Sign in with your ChatGPT (Plus, Pro or Business) or Claude (Pro or Max) account and clevex uses that plan. An Anthropic API key also works.",
  },
  {
    q: "Where are my papers stored?",
    a: "In your clevex account, so they sync across devices. Your ChatGPT and Claude tokens never leave your browser. Export a project as a .zip whenever you want a copy.",
  },
  {
    q: "Do I need LaTeX installed?",
    a: "No. clevex compiles in the cloud. If Tectonic is installed on your machine, it uses that instead for faster, private builds.",
  },
  {
    q: "Can I host it myself?",
    a: "Yes. It's a Next.js app that deploys to Vercel as-is. Set a password and it's yours alone.",
  },
];

export function Landing() {
  return (
    <div className="min-h-dvh bg-[#f6f5f3] text-[#323753] antialiased">
      {/* Nav */}
      <header className="absolute inset-x-0 top-0 z-30">
        <div className="mx-auto flex h-16 max-w-6xl items-center justify-between px-5 sm:px-8">
          <Link href="/" className="flex items-center gap-2 font-semibold text-[19px] text-white tracking-[-0.02em] drop-shadow-sm">
            <CleveMark className="h-7 w-auto" />
            clevex
          </Link>
          <nav className="flex items-center gap-1 sm:gap-6">
            <a href="#features" className="hidden text-sm text-white/85 hover:text-white sm:inline">
              Features
            </a>
            <a href="#faq" className="hidden text-sm text-white/85 hover:text-white sm:inline">
              FAQ
            </a>
            <Link href="/sign-in" className="hidden text-sm text-white/85 hover:text-white sm:inline">
              Sign in
            </Link>
            <Link
              href="/app"
              className="rounded-lg bg-[#323753] px-4 py-2.5 font-medium text-sm text-white shadow-sm transition-colors hover:bg-[#262a42]"
            >
              Open app
            </Link>
          </nav>
        </div>
      </header>

      {/* Hero */}
      <section className="relative overflow-hidden">
        <div
          aria-hidden
          className="absolute inset-0 bg-[url(/marketing/hero-bg-1.avif)] bg-cover bg-center"
        />
        <div aria-hidden className="absolute inset-x-0 bottom-0 h-56 bg-gradient-to-b from-transparent to-[#f6f5f3]" />
        <div className="relative mx-auto max-w-6xl px-5 pt-36 sm:px-8 sm:pt-44">
          <h1 className="max-w-3xl font-semibold text-[44px] text-white leading-[1.02] tracking-[-0.035em] sm:text-[72px]">
            Write papers with the AI you already pay for.
          </h1>
          <p className="mt-5 max-w-xl text-[17px] text-white/85 leading-relaxed sm:text-lg">
            clevex is a LaTeX workspace with ChatGPT and Claude built in. Sign in with your plan and start writing.
          </p>
          <div className="mt-8 flex flex-wrap gap-3">
            <Link
              href="/app"
              className="inline-flex items-center gap-2 rounded-xl bg-white px-6 py-3.5 font-medium text-[#323753] text-[15px] shadow-sm transition-transform hover:-translate-y-0.5"
            >
              Start writing <ArrowRight className="size-4" />
            </Link>
            <a
              href="#features"
              className="inline-flex items-center rounded-xl bg-white/20 px-6 py-3.5 font-medium text-[15px] text-white backdrop-blur-sm transition-colors hover:bg-white/30"
            >
              See how it works
            </a>
          </div>

          {/* Product frame */}
          <div className="relative mx-auto mt-20 max-w-5xl sm:mt-28">
            <CleveMark className="absolute -top-[62px] right-10 z-10 h-20 w-auto sm:right-16" blink />
            <div className="relative overflow-hidden rounded-t-2xl border border-white/60 bg-white/70 p-1.5 pb-0 shadow-[0_30px_80px_-20px_rgba(30,40,80,0.45)] backdrop-blur">
              <div className="flex items-center gap-1.5 px-2.5 py-2">
                <span className="size-2.5 rounded-full bg-[#d6d4d1]" />
                <span className="size-2.5 rounded-full bg-[#d6d4d1]" />
                <span className="size-2.5 rounded-full bg-[#d6d4d1]" />
              </div>
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img
                src="/marketing/workspace.jpg"
                alt="The clevex workspace: files, LaTeX editor, PDF preview and AI chat side by side"
                className="block w-full rounded-t-lg"
              />
            </div>
          </div>
        </div>
      </section>

      {/* Co-author bento */}
      <section className="mx-auto max-w-6xl px-5 py-24 sm:px-8 sm:py-32">
        <h2 className={`text-center font-semibold text-[34px] leading-tight tracking-[-0.03em] sm:text-5xl ${NAVY}`}>
          A co-author that reads the whole paper.
        </h2>
        <div className="mt-14 grid gap-4 md:grid-cols-2">
          <div className="relative min-h-[420px] overflow-hidden rounded-2xl border border-black/5 bg-[#efece6] p-8">
            <p className="text-[22px] text-[#323753]/60 leading-snug tracking-[-0.01em]">Ask for a change in plain words.</p>
            <div className="absolute inset-x-8 bottom-10 space-y-3">
              <div className="ml-auto w-fit max-w-[85%] rounded-2xl rounded-br-md bg-white px-4 py-2.5 text-[15px] shadow-sm">
                Tighten the abstract and keep the claims the same.
              </div>
              <div className="ml-auto w-fit max-w-[85%] rounded-2xl rounded-br-md bg-white px-4 py-2.5 text-[15px] shadow-sm">
                The build fails on line 48. Fix it.
              </div>
              <div className="ml-auto flex w-fit items-center gap-2 rounded-2xl rounded-br-md bg-white px-4 py-2.5 text-[15px] shadow-sm">
                <Camera className="size-4 text-[#d16e3f]" /> whiteboard.jpg → turn this into an align block
              </div>
            </div>
          </div>
          <div className="relative min-h-[420px] overflow-hidden rounded-2xl bg-[#0b1440] p-8 text-white">
            <div aria-hidden className="absolute inset-0 bg-[url(/marketing/bluebackground.avif)] bg-cover bg-center opacity-90" />
            <p className="relative text-[22px] leading-snug tracking-[-0.01em]">
              clevex{" "}
              <span className="rounded-full border border-white/30 px-3 py-0.5">✦ edits</span> it for you.
            </p>
            <div className="absolute inset-x-8 bottom-10 overflow-hidden rounded-xl bg-white text-[#323753] shadow-2xl">
              <div className="flex items-center justify-between border-b border-black/5 bg-[#f6f5f3] px-4 py-2.5 text-[13px]">
                <span className="font-medium font-mono">main.tex</span>
                <span className="rounded-md bg-[#d16e3f] px-2.5 py-1 font-medium text-white text-xs">Apply</span>
              </div>
              <div className="py-2 font-mono text-[12.5px] leading-6">
                <div className="bg-[#fdecea] px-4 text-[#323753]/60 line-through">− Experiments on long-document tasks back this up.</div>
                <div className="bg-[#e7f3ea] px-4">+ Experiments on long documents confirm this.</div>
                <div className="px-4 text-[#323753]/40">\end&#123;abstract&#125;</div>
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* Features */}
      <section id="features" className="mx-auto max-w-6xl scroll-mt-20 px-5 pb-24 sm:px-8 sm:pb-32">
        <h2 className={`text-center font-semibold text-[34px] leading-tight tracking-[-0.03em] sm:text-5xl ${NAVY}`}>
          Everything a paper needs.
        </h2>
        <div className="mt-14 grid gap-px overflow-hidden rounded-2xl border border-black/5 bg-black/5 sm:grid-cols-2 lg:grid-cols-3">
          {FEATURES.map((f) => (
            <div key={f.title} className="bg-[#fbfaf9] p-7">
              <f.icon className="size-5 text-[#d16e3f]" />
              <h3 className="mt-4 font-semibold text-[17px] tracking-[-0.01em]">{f.title}</h3>
              <p className="mt-1.5 text-[15px] text-[#323753]/65 leading-relaxed">{f.body}</p>
            </div>
          ))}
        </div>
      </section>

      {/* Subscriptions */}
      <section className="mx-auto max-w-6xl px-5 pb-24 sm:px-8 sm:pb-32">
        <div className="relative overflow-hidden rounded-3xl px-8 py-14 text-center sm:px-16 sm:py-20">
          <div aria-hidden className="absolute inset-0 rotate-180 bg-[url(/marketing/orange-bg.avif)] bg-cover bg-center" />
          <div className="relative">
            <h2 className="font-semibold text-[34px] text-white leading-tight tracking-[-0.03em] [text-shadow:0_1px_20px_rgba(120,40,0,0.25)] sm:text-5xl">
              Runs on the plan you have.
            </h2>
            <p className="mx-auto mt-4 max-w-lg text-[17px] text-white">
              Sign in once. Your tokens stay in your browser, and you switch models mid-chat.
            </p>
            <div className="mt-10 flex flex-wrap justify-center gap-3">
              {[
                { p: "chatgpt" as const, name: "ChatGPT", plans: "Plus · Pro · Business" },
                { p: "claude" as const, name: "Claude", plans: "Pro · Max" },
              ].map((x) => (
                <div key={x.p} className="flex items-center gap-3 rounded-2xl bg-white/90 py-3 pr-6 pl-3 text-left shadow-sm backdrop-blur">
                  <span className="grid size-10 place-items-center rounded-xl bg-white shadow-sm">
                    <ProviderGlyph provider={x.p} className="size-5 dark:invert-0" />
                  </span>
                  <span>
                    <span className="block font-semibold text-[15px]">{x.name}</span>
                    <span className="block text-[#323753]/60 text-[13px]">{x.plans}</span>
                  </span>
                </div>
              ))}
            </div>
          </div>
        </div>
      </section>

      {/* FAQ */}
      <section id="faq" className="mx-auto max-w-3xl scroll-mt-20 px-5 pb-24 sm:px-8 sm:pb-32">
        <h2 className={`text-center font-semibold text-[34px] leading-tight tracking-[-0.03em] sm:text-5xl ${NAVY}`}>
          Common questions
        </h2>
        <div className="mt-12 divide-y divide-black/8 border-black/8 border-y">
          {FAQ.map((f) => (
            <details key={f.q} className="group py-5">
              <summary className="flex cursor-pointer list-none items-center justify-between gap-4 font-medium text-[17px] [&::-webkit-details-marker]:hidden">
                {f.q}
                <span className="grid size-7 shrink-0 place-items-center rounded-full bg-black/5 text-lg leading-none transition-transform group-open:rotate-45">
                  +
                </span>
              </summary>
              <p className="mt-3 pr-10 text-[15px] text-[#323753]/70 leading-relaxed">{f.a}</p>
            </details>
          ))}
        </div>
      </section>

      {/* Final CTA */}
      <section className="relative overflow-hidden">
        <div aria-hidden className="absolute inset-0 bg-[url(/marketing/hero-bg-1.avif)] bg-cover bg-bottom" />
        <div aria-hidden className="absolute inset-x-0 top-0 h-40 bg-gradient-to-b from-[#f6f5f3] to-transparent" />
        <div className="relative mx-auto max-w-6xl px-5 pt-40 pb-44 text-center sm:px-8">
          <h2 className="font-semibold text-[34px] text-white leading-tight tracking-[-0.03em] sm:text-5xl">
            Your next paper starts here.
          </h2>
          <Link
            href="/app"
            className="mt-8 inline-flex items-center gap-2 rounded-xl bg-white px-6 py-3.5 font-medium text-[#323753] text-[15px] shadow-sm transition-transform hover:-translate-y-0.5"
          >
            Start writing <ArrowRight className="size-4" />
          </Link>
        </div>
      </section>

      <footer className="mx-auto flex max-w-6xl flex-wrap items-center justify-between gap-3 px-5 py-8 text-[#323753]/60 text-sm sm:px-8">
        <span className="flex items-center gap-2">
          <CleveMark className="h-4 w-auto" /> clevex · a Cleve side project
        </span>
        <Link href="/app" className="hover:text-[#323753]">
          Open app
        </Link>
      </footer>
    </div>
  );
}
