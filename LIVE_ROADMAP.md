# Live — product review and roadmap

Written as the PM for this module, 30 Aug 2026, after a full pass through
`src/live/`, `LiveView.jsx`, the vision path and the two engines.

---

## 1. What Live actually is today

Two engines behind one UI:

| | **gemini** (realtime) | **cascade** (any provider) |
|---|---|---|
| Latency | ~0.8s | ~1.5–2.5s |
| Audio | native, server-side barge-in | STT → LLM → TTS, manual barge-in |
| Vision | native frames at 1fps | frames if the model takes images, else on-device OCR/VLM |
| Tools | yes | yes |
| Voice choice | fixed at setup | changeable mid-call |

Everything works. The engineering is good. **The product question is not "is it
good", it is "what is it for" — and right now Live does not answer that.**

---

## 2. The strategic call: stop competing on latency

The instinct is to chase ChatGPT Advanced Voice and Gemini Live on
responsiveness. **Do not.** That race is lost before it starts:

- Their latency comes from a speech-native model on their own inference. You are
  a client. Your floor is the provider's time-to-first-token, and on a local 7B
  it is seconds. No amount of app-side work changes that.
- Every month you spend shaving 200ms, they ship a model that makes it moot.

What they cannot easily do is the thing you already built:

> **A voice assistant that sees your camera, runs tools on your machine, and
> keeps everything local.**

That is the bet. Everything below follows from it.

---

## 3. The use case to aim at: hands-busy work

Live's real users are people who **cannot type right now** and are **looking at
something**. Cooking, repair, lab bench, field inspection, wiring a rack,
medication checks, accessibility.

You have already built more of this than you may realise: `identify`,
`pill_lookup`, `barcode_lookup`, the new `segment` (crop-then-OCR), the macro
sharpen path, the HUD reticle. **That is a coherent product and it is 80% done.**
It is currently framed as "a video call with an AI", which is the least
interesting description of it.

Concretely: "point your phone at the thing and ask" is a sentence people repeat
to each other. "Talk to your AI" is not.

---

## 4. What to fix before building anything new

These are the things that make people close it and not come back.

**a. The blind-model trap.** A text-only model plus a camera produces confident
nonsense from OCR noise ("Az", "Hoag", "d ="). The new settings panel explains
it, but the app still *lets you get there*. Live should **refuse to start with
the camera on** for a text-only model — or auto-switch to a vision model — with
one line saying why. Explaining a foot-gun is worse than removing it.

**b. Low light.** Every camera screenshot in this project is dim, and both OCR
and small VLMs collapse in the dark. Detect it (`imageStats` already computes a
luma profile) and say "it is too dark for me to read that" instead of guessing.
An honest refusal beats a confident hallucination, especially for a pill.

**c. Cascade cannot switch microphones.** Web Speech picks the device itself.
The picker says so, which is right, but the underlying fix is to move cascade to
on-device Whisper for input — you already have `localSTT.js`. That also removes
the cloud STT dependency, which matters for the privacy pitch.

**d. There is no telemetry on Live at all.** `telemetry.js` measures chat turns.
Nobody knows the p50 time-to-first-word, how often barge-in misfires, or how
many sessions end in the first 30 seconds. **You cannot PM this module blind.**

---

## 5. Roadmap

### Horizon 1 — make it trustworthy (next 4 weeks) — **1, 2 and part of 4 SHIPPED**

Status as of 30 Aug: instrumentation and the vision guardrails are built,
tested and wired. Items 3 and 4 are described below as originally scoped, with
notes on what changed.


1. ~~**Instrument it.**~~ **DONE** — `live/metrics.js`. Time-to-first-word
   (p50/p95), turns per session, camera-on rate, tool-turn rate, barge-in
   false-positive rate, session duration and end reason. Local and in memory,
   timings and counts only, never content. Surfaced in the Diagnostics modal
   beside the existing chat latency card. 20 assertions.
   *Found a real bug while writing it:* `_turnStart` was used as the
   has-a-turn flag, and a timestamp of 0 is falsy, so a turn beginning at t=0
   recorded nothing. `Date.now()` is never 0 in production, which is why that
   class survives review and only a fake clock finds it.
2. ~~**Vision guardrails**~~ **DONE (2 of 3)** — `vision/readable.js`. Darkness,
   overexposure and no-detail frames are detected and the caveat is put FIRST
   in the description, ahead of anything derived from the pixels; OCR from a bad
   frame is labelled as noise the model must not interpret. 17 assertions.
   `imageStats` now also returns the luma tails it was already computing and
   throwing away — a mean alone cannot tell an evenly lit scene from a black
   frame with one bright lamp in it.
   **Still open:** refusing to *start* with a text-only model and the camera on.
   That is a product decision about whether to block or degrade, and it belongs
   with the data from item 1 rather than ahead of it.
3. **On-device Whisper as cascade's default input** where the hardware allows,
   with Web Speech as the fallback rather than the primary.
   **Sequencing note:** deliberately NOT done yet. Whisper is *slower* than Web
   Speech, so making it the default trades measured latency for a privacy gain
   nobody has quantified — exactly the decision item 1 exists to inform. Ship
   the metric, look at the p95, then choose.
4. **Session recap that is actually useful.** `sessionHandoff.js` exists; make
   every call end with a short written summary, the artefacts produced, and the
   sources cited. A voice call that leaves nothing behind is a call you cannot
   act on afterwards.

### Horizon 2 — make it the hands-busy assistant (weeks 5–12)

5. **"Point and ask" as the front door.** A camera-first entry — big shutter,
   the HUD, the three actions — rather than a phone-call metaphor with a camera
   bolted on. The current UI leads with an orb; the value is in the viewfinder.
6. **Object memory within a session.** "The one on the left", "the red one",
   "same as before" — segment + track so pronouns resolve. This is what makes it
   feel like someone in the room rather than a Q&A box.
7. **Speculative turn start.** Begin the turn on the interim transcript, cancel
   if it changes. Worth 200–850ms — the one real latency win left. **Do it after
   the telemetry exists**, and extend the `sameUtterance` commit guard to cover
   it, or it will reintroduce the double-answer bug.
8. **Step-by-step mode.** For repair and cooking: the model holds a plan, you
   say "next", it checks the camera against the current step. This is the
   feature that turns a demo into a tool people schedule time with.

### Horizon 3 — the things only you can do (quarter 2+)

9. **Fully offline Live.** Whisper + local LLM + Kokoro, no network at all. A
   voice assistant that works on a plane, in a basement, in a clean room. No
   frontier vendor will ship this. It is a *category* claim, not a feature.
10. **Desktop screen-watching as a first-class mode.** Not "share screen" — the
    companion watching you work and speaking up when it matters. The pieces
    exist (`companion/`, `liveWatch`, the adaptive cadence).
11. **Multi-party.** Two people, one assistant, in a meeting. Big lift, big
    differentiator, only worth it if 1–8 have landed.

---

## 6. What to kill

- **The orb.** It is beautiful and it communicates nothing a caption does not.
  It occupies the centre of the frame, which is where the camera should be.
- **`LivePill.jsx`** — an unshipped second HUD, 112 lines and 13 CSS rules.
  Wire it or delete it; it has been in limbo for a while.
- **The "phone call" framing** — connecting / ringing / end-call semantics on
  something that is really a viewfinder with a voice.

---

## 7. Metrics that would tell you if this is working

| Metric | Why it is the one that matters |
|---|---|
| **Time to first spoken word** (p50/p95) | The whole perceived-quality budget |
| **Sessions > 60s / sessions started** | Under a minute means it did not work |
| **Turns per session** | One turn is a demo; five is a tool |
| **Camera-on rate** | If it is low, you are a voice app competing on latency — the race you cannot win |
| **Barge-in false positives** | The failure that makes people give up silently |
| **Tool-use rate in Live** | Your actual differentiator; if it is near zero the persona or the model is wrong |

If camera-on rate is low and tool-use is near zero, Live is not the product
described above and the roadmap should be re-cut around what people actually do.

---

## 8. Risks

- **Provider latency is not yours.** Everything in Horizon 1–2 improves
  *perceived* latency. Be honest internally about that distinction or you will
  keep funding work that cannot move the number.
- **Vision quality is the ceiling.** On a text-only model, Live is a worse voice
  assistant than the alternatives. The vision-model requirement is not a nice
  default — it is the product working or not.
- **Two engines is two of everything.** Every feature must be built, tested and
  debugged twice, and they already diverge (voice switching, mic selection).
  Decide whether gemini is the premium path or the legacy one; do not drift.
- **Battery and heat on phones.** 1fps encode plus a neural voice plus WebGPU
  will cook a handset. Nobody has measured it. Measure before Horizon 2.

---

## 9. If I could only do three things

1. **Instrument it** — you are flying blind.
2. **Refuse the blind-model + camera combination** — it is the single biggest
   source of "this thing is broken".
3. **Re-frame the entry point around the camera** — because that is the product
   you have actually built, and nobody can tell.
