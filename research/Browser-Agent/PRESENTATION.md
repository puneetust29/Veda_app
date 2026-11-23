# Browser Agent -- Presentation Guide

**Audience:** CTO + Tech Leads
**Duration:** 1 hour
**Format:** Screen share (walkthrough + live demo)
**Goal:** Demo, get approval, show progress, secure investment to continue

---

## THE STORY ARC

```
"We had a problem. We solved part of it with third parties. 
Then Anthropic released something that changes everything. 
We built a working prototype in one day. Here's what it does, 
how it works, and where we take it next."
```

---

## TIMING BREAKDOWN

| Time | Section | Minutes |
|---|---|---|
| 0:00 | 1. The Problem | 5 min |
| 0:05 | 2. What We Tried Before | 7 min |
| 0:12 | 3. The Breakthrough | 5 min |
| 0:17 | 4. Live Demo | 15 min |
| 0:32 | 5. How It Works (Architecture) | 10 min |
| 0:42 | 6. What We Learned (Challenges) | 5 min |
| 0:47 | 7. Where We Go Next | 5 min |
| 0:52 | 8. Q&A | 8 min |

---

## SECTION 1: THE PROBLEM (5 min)

### What to say:

"Most of the services our users need -- booking hotels, checking flight prices,
managing subscriptions, shopping -- live on websites. These websites don't have
public APIs. The only way to interact with them is the way a human does: open a
browser, read the page, click buttons, fill forms.

The question is: can we build an AI that does this for the user? Can someone type
'find me hotels in Tokyo on Booking.com' and get results back without ever
opening a browser themselves?

This is what the industry calls a **browser agent**. OpenAI has Operator. Google
has Gemini with browsing. Muse has a browser-task system. Everyone is building
this. The question is: can we?"

### What to show:

- Open the Muse research document briefly (show we studied the competition)
- Show the system design HLD/LLD we wrote (`research/muse-research/`)
- Point: "We designed this months ago. Now we've built it."

---

## SECTION 2: WHAT WE TRIED BEFORE (7 min)

### What to say:

"This isn't our first attempt at browser automation. We've built two features
that drive real browsers. Let me show you what they taught us.

**Grocery checkout (Pepesto):** We built a WebView on the user's phone that
navigates Asda's website and adds items to their basket. But here's the thing --
our code doesn't decide what to click. A third-party API called Pepesto looks at
screenshots and tells us what to do. We're just the middleman. If Pepesto goes
away, the feature dies.

**Uber login (uber-mcp):** We built a chat-based login flow where the user
provides their Uber credentials through chat messages. But again -- the browser
runs on uber-mcp's server, not ours. The decision-making is theirs, not ours.

Both features proved the mechanics work. But in both cases, **we don't own the
brain**. We rent it from a third party."

### What to show:

- Show the grocery architecture diagram from `research/Food-Grocery/Browser-Agent-Architecture.md`
- Show the comparison table (Pepesto brain vs uber-mcp brain vs Claude brain)

### The transition:

"So we knew what we needed: the same browser automation infrastructure, but with
our own AI making the decisions. And then Anthropic released exactly the tool
we needed."

---

## SECTION 3: THE BREAKTHROUGH (5 min)

### What to say:

"In their latest SDK release, Anthropic added something called the Browser Use
Toolset. It's official. It's production-grade. And it changes everything.

Here's what it does: you give Claude a browser. Claude can see the page -- via
screenshots and the page's accessibility tree. Claude decides what to do: navigate,
click, type, scroll, read. Your code just executes the actions in a real Chrome
browser.

Claude IS the brain. We provide the hands. No third-party dependency for the
intelligence. If we have an Anthropic API key and a Chrome browser, we have a
browser agent.

We built a working prototype in one day. Let me show you."

### What to show:

- Open `https://platform.claude.com/docs/en/agents-and-tools/tool-use/browser-use-sdk`
- Show the partner integrations (Browser Use, Browserbase, E2B)
- Point out: "27 browser tools built in. We implemented 10 for the prototype."

---

## SECTION 4: LIVE DEMO (15 min)

### BEFORE THE DEMO -- SAY THIS:

"I'm going to show you three things:
1. The agent working perfectly on a real website
2. The agent handling a login flow with human-in-the-loop
3. The agent hitting a wall and reporting it honestly

All three are important. The third one is not a failure -- it's correct behavior."

### DEMO PREPARATION:

Before the presentation, have these ready:
- Backend running: `./scripts/start.sh` (or manually start backend + simulator)
- Terminal open in `backend/` directory
- The app open on the simulator, signed in, on the Dashboard

### DEMO 1: Medium.com -- Trending Articles (5 min)

**What to do:**
1. Open VedaChat (tap "Ask Veda" on Dashboard)
2. Type: `Go to medium.com and find me trending tech articles`
3. Wait for status updates to stream in
4. Show Claude's response with real article titles and descriptions

**What to say while waiting:**
"Right now, on our backend server, a real headless Chrome just launched. Claude
is navigating to medium.com. It's reading the page structure. It's clicking through
to the trending topics section. The user sees none of this -- just status updates
in chat.

Notice the user never sees a browser. No WebView, no popup, no Safari. Just chat
messages streaming back."

**After the result appears:**
"Claude just navigated a real website, adapted when it found a login wall, found
an alternative route to the content, and brought back real data. Five real article
titles from Medium, with authors and dates. All in about 30 seconds."

### DEMO 2: Medium.com -- Login with OTP (7 min)

**What to do:**
1. In the same chat, type: `Sign in to medium with 287262@ust.com`
2. Wait for Claude to navigate, click Sign In, enter email
3. Claude will ask for the verification code
4. Check your email for the Medium code
5. Type the code in the chat: `the code is XXXXXX`
6. Claude enters it in the same browser session

**What to say while waiting:**
"This is the human-in-the-loop flow. Claude is driving the browser, but it
can't read our email. So it does everything it can -- navigates to the sign-in
page, clicks 'Sign in with email', types the email address -- and then asks
the user for the one thing it can't do itself: the verification code.

The critical thing here is that the browser stays open between messages. When
the user replies with the code, Claude doesn't start a new browser. It's the
same Chrome, the same tab, the same code-entry page. It just types the code
and clicks Submit."

**If the code expires or fails:**
"The code expired because there's a delay in the demo. In production, this
would be near-instant. The important thing is the architecture works -- the
browser persisted, the conversation continued, Claude knew exactly where it
was on the page."

### DEMO 3: Priceline -- Honest Failure (3 min)

**What to do:**
1. Type: `Find me flights from Seattle to Tokyo on priceline`
2. Wait for Claude's response about bot detection

**What to say:**
"Priceline uses Cloudflare Turnstile -- one of the most aggressive bot detection
systems on the web. Claude navigated there, saw the CAPTCHA wall, and did exactly
what our design document says it should: reported the obstacle honestly and
suggested alternatives.

This is not a bug. This is correct behavior. From our browser agent design spec:
'Site explicitly refuses AI agents -- tell the user plainly.' Claude doesn't try
to bypass it, doesn't pretend it succeeded, doesn't get stuck in a retry loop.
It tells the truth.

The fix for this is Browserbase -- Anthropic's official partner for running
browsers that pass bot detection. It's a deployment solution, not an architecture
change. Our code doesn't change at all."

---

## SECTION 5: HOW IT WORKS (10 min)

### What to show:

Open `research/Browser-Agent/Browser-Agent-Architecture.md` and walk through:

**1. The high-level architecture diagram (2 min)**

"Three components. The mobile app sends a text message. Our backend launches
a headless Chrome and runs Claude's agent loop. Status updates stream back as
Server-Sent Events. The user never sees a browser."

**2. The agent loop (2 min)**

"Claude sees the page via read_page -- an accessibility tree of every heading,
link, button, and input, each tagged with a reference like ref_5. Claude decides
what to do, returns a tool call like 'left_click ref_5'. Our driver executes it
in Chrome via CDP. Then Claude sees the updated page and decides the next step.
This repeats until the task is done."

**3. Persistent sessions (2 min)**

"The browser stays open between chat messages. This is what makes the login flow
work. First message: Claude enters the email. Second message: the user provides
the code. Same Chrome, same tab, same cookies. We store sessions in memory,
keyed by customer ID, with a 5-minute idle cleanup and automatic dead-session
recovery."

**4. The code (2 min)**

Show the directory structure:
```
backend/app/agents/browser/
    driver.py    -- 390 lines, the Chrome driver
    agent.py     -- 30 lines, orchestrator stub
    manifest.yaml -- 8 lines, registration

backend/app/routers/
    browser.py   -- 250 lines, SSE endpoint + session management

mobile/src/hooks/
    useVedaChat.ts -- keyword detection, routes to browser agent
```

"The entire feature is about 700 lines of backend code and 85 lines of mobile
code. We built it in one day."

**5. What Claude has access to (2 min)**

"Claude's Browser Use SDK has 27 tools. We implemented 10 for the prototype:
navigate, screenshot, read_page, left_click, type, key, scroll, get_page_text,
wait, and browser_state. The SDK automatically disables the rest and tells
Claude they're unavailable. Adding more tools is incremental -- each one is a
method override in driver.py."

---

## SECTION 6: WHAT WE LEARNED (5 min)

### What to say:

"We hit 12 challenges building this. Let me share the most important ones.

**Python version:** The Browser Use SDK requires Python 3.12. Our backend runs
3.9. We solved it by creating a separate venv with Python 3.12 from a standalone
build -- no admin privileges needed.

**Bot detection:** Priceline and Google block headless Chrome. We added stealth
flags (hide navigator.webdriver, realistic user-agent) which works for Medium
but not for Cloudflare Turnstile. Production fix: Browserbase.

**Character entry:** Our first type() implementation dropped period characters.
Email addresses like 287262@ust.com became 287262@ustcom. We fixed it by
switching from keyDown/keyUp events to insertText -- a different CDP method
that handles all characters reliably.

**Session persistence:** OTP codes expired because each request launched a new
browser. We built persistent sessions with health checks and auto-recovery.
If a Chrome process dies between messages, the next request automatically
starts a fresh one instead of showing a cryptic error."

---

## SECTION 7: WHERE WE GO NEXT (5 min)

### What to show:

The roadmap table from the architecture doc.

### What to say:

"The prototype proves the architecture works. Here's what production looks like:

**P0 -- Browserbase integration.** One day of work. Swaps our local Chrome for
a cloud browser that passes bot detection. Priceline, Google, Asda -- all
unblocked. No code changes to our driver.

**P1 -- More browser tools.** form_input, find, select_option, scroll_to.
Each is a method override in driver.py. Incremental work.

**P2 -- Credential vault.** Secure per-site credential storage instead of
credentials in chat messages. Aligns with our browser agent design document.

**P3 -- Hybrid mode.** The most interesting one. Instead of headless Chrome on
the server, use the phone's WebView as the browser but Claude as the brain.
Best of both worlds: passes all bot detection (real phone traffic) and Claude
makes all the decisions (no third-party brain). This is the architecture the
grocery checkout already proves mechanically -- we just swap Pepesto for Claude.

The investment ask: continued engineering time to move from prototype to
production on these priorities."

---

## SECTION 8: Q&A (8 min)

See the Hard Questions section below.

---

---

## HARD QUESTIONS AND ANSWERS

### Q: "How much does this cost per request?"

**A:** "Each browser task makes multiple Claude API calls -- typically 3-10 turns,
each with tool calls. At current pricing for claude-sonnet-5-5, a typical task
costs roughly $0.05-0.15 depending on complexity. Screenshots (images) are more
expensive than read_page (text). We default to read_page for cost efficiency.

For comparison, the grocery checkout using Pepesto costs about 1.24 EUR per
session. We're in the same ballpark but with no third-party dependency and
unlimited site coverage."

### Q: "How does this scale? One Chrome per user?"

**A:** "Yes, currently one Chrome process per active session. For a POC this is
fine. For production, Browserbase handles this -- they run cloud browsers at
scale, with connection pooling and cleanup. It's their core business.

Sessions are short-lived (5 minutes idle timeout) and lightweight (headless
Chrome uses about 100-200MB RAM). With the session cleanup, concurrent usage
is bounded."

### Q: "What about security? Credentials in chat messages?"

**A:** "In the prototype, yes -- the user types their email in chat and Claude
types it into the website. The credential never enters our logs or database (Claude
sends it directly to the browser via our driver), but it does transit the Claude
API.

For production, we'd build a credential vault -- exactly as specified in our
browser agent design document. Credentials would be stored encrypted, referenced
by an opaque handle, and injected at the point of use by the driver without
ever entering the Claude prompt."

### Q: "Why not just use Selenium or Playwright directly?"

**A:** "Selenium and Playwright are browser automation libraries -- they can
click buttons and fill forms. But they can't decide WHAT to click. Someone has
to write the script.

The browser agent doesn't need scripts. Claude looks at the page, understands
what it sees, and decides what to do. If the page layout changes, Claude adapts.
If a popup appears, Claude handles it. If the site redesigns, Claude figures
out the new layout. That's the difference between automation (scripted) and
agency (autonomous).

We do use CDP (the same protocol Playwright uses) for the mechanical part. But
Claude is the intelligence layer on top."

### Q: "What about Cloudflare / bot detection? Priceline didn't work."

**A:** "Correct. Cloudflare Turnstile detects headless Chrome through browser
fingerprinting -- not just user-agent strings but WebGL rendering, canvas
fingerprints, timing analysis.

Three solutions:
1. **Browserbase** (Anthropic partner) -- cloud browsers with real fingerprints.
   One-day integration, our driver code doesn't change.
2. **Hybrid mode** -- use the phone's WebView as the browser, Claude as the brain.
   Real phone traffic passes all bot detection. We've already proven this
   architecture works with the grocery checkout.
3. **Some sites don't have aggressive detection.** Medium works perfectly. Many
   travel sites, government portals, and business tools work fine headless."

### Q: "How is this different from OpenAI Operator?"

**A:** "Three differences:
1. **Geography:** Operator is US-focused. We're building for European and global
   markets (Priceline, Booking, European airlines).
2. **Integration:** Operator is a standalone product. Our browser agent is
   embedded in a telecom companion app -- it has context about the user's
   flights, roaming plans, travel schedule.
3. **Ownership:** Operator is OpenAI's product. This is our product, running
   on our infrastructure, with our URL policies and our security controls."

### Q: "Is this production-ready?"

**A:** "No. This is a working prototype that proves the architecture. For
production we need:
- Browserbase for bot detection bypass
- Credential vault for secure login
- Database-backed session persistence (currently in-memory)
- Rate limiting and cost controls
- More browser tools (form_input, tabs, file upload)
- Formal task state machine

The architecture document covers all of these. The prototype proves the
hard parts work -- Claude can drive a browser, sessions persist, human-in-
the-loop works. The remaining work is engineering, not research."

### Q: "Why claude-sonnet-5-5 specifically?"

**A:** "It's currently the only model that supports the browser_toolset_20260801.
We tested claude-sonnet-4-6 and it was explicitly rejected by the API. Anthropic
will likely add browser support to more models over time. It doesn't affect our
architecture -- the model is a single constant in the router."

### Q: "What happens if Claude makes a mistake?"

**A:** "Claude operates within constraints:
- **URL policy:** It can only visit domains we whitelist. It cannot navigate to
  arbitrary websites.
- **No payment:** It cannot complete purchases or submit payments. It can fill
  a cart but the user pays.
- **Honest reporting:** If it's unsure, it says so. If it's blocked, it reports
  the block. It doesn't fake success.
- **Human-in-the-loop:** For sensitive actions (OTP codes, choices), it asks the
  user. The user stays in control.

If Claude clicks the wrong button, it sees the result on the next read_page and
adapts. The loop is self-correcting."

### Q: "How long did this take to build?"

**A:** "One day. Research, environment setup, driver implementation, backend
integration, mobile integration, testing, and documentation -- all in one session.

The total code is about 700 lines of backend Python and 85 lines of TypeScript.
The architecture document is 620 lines. The build journal documents 12 challenges
we hit and resolved.

This was possible because:
1. Anthropic's SDK does the hard work (the agent loop, tool management)
2. Our existing chat infrastructure (SSE streaming, auth) was reusable
3. CDP is a well-documented protocol -- no browser library needed"

---

## DEMO CHECKLIST (run 30 minutes before the presentation)

```
[ ] Backend running on .venv-browser (Python 3.12)
    cd backend && .venv-browser/bin/uvicorn app.main:app --host 0.0.0.0 --port 8000 --reload

[ ] curl http://localhost:8000/health returns {"status":"ok"}

[ ] iOS Simulator booted (iPhone 17 Pro, iOS 26.5)
    xcrun simctl boot "iPhone 17 Pro" && open -a Simulator

[ ] Expo running
    cd mobile && NODE_TLS_REJECT_UNAUTHORIZED=0 npx expo start --go --clear

[ ] App opened in simulator
    xcrun simctl openurl booted "exp://127.0.0.1:8081"

[ ] Signed in with test account (+1 5550001111, OTP: 500005)

[ ] Dashboard visible with "Ask Veda" button enabled

[ ] Test the browser agent once before the meeting:
    Type "Go to example.com and tell me what you see"
    Verify it works end-to-end

[ ] Have your Medium email ready (287262@ust.com)
    Open your email client so you can get the OTP code quickly

[ ] Terminal visible for showing backend logs if needed
    tail -f /tmp/veda-backend.log
```

---

## IF THINGS GO WRONG DURING THE DEMO

| Problem | Recovery |
|---|---|
| Backend crashed | "Let me restart -- this is a development setup." Run: `pkill -f uvicorn && .venv-browser/bin/uvicorn app.main:app --port 8000 --reload &` |
| Browser session expired | "The idle timeout kicked in. Watch -- the next message automatically starts a fresh browser." Just send the message again. |
| Medium OTP expired | "The code expired because of the demo delay. In production this would be near-instant. The architecture point is that the browser session persisted." |
| Priceline blocks (expected) | "This is the correct behavior. Claude reported the wall honestly. Browserbase solves this for production." |
| App won't load on simulator | Switch to backend-only demo: `curl` commands to show the SSE stream in terminal |
| Claude gives unexpected answer | "Claude is autonomous -- it makes real-time decisions based on what it sees. This is actually the strength: it adapts to whatever the page shows." |
