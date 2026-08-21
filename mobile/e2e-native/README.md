# Native E2E Tests — Maestro

These flows test the iOS and Android native targets of the Veda app using
[Maestro](https://maestro.mobile.dev). They complement the Playwright suite
(`e2e/`) which covers the Expo web target.

## Prerequisites

1. **Install Maestro CLI**
   ```bash
   curl -Ls "https://get.maestro.mobile.dev" | bash
   ```

2. **Build the Expo dev client** with the mock stream flag so tests are
   deterministic and offline-safe:
   ```bash
   # iOS simulator
   EXPO_PUBLIC_CHAT_MOCK=1 npx expo run:ios

   # Android emulator
   EXPO_PUBLIC_CHAT_MOCK=1 npx expo run:android
   ```

3. **Start the Metro bundler** (if not started automatically by the above):
   ```bash
   npx expo start
   ```

## Running tests

```bash
# Run the full native suite
maestro test e2e-native/

# Run a single flow
maestro test e2e-native/flows/auth/01-sign-in.yaml

# Run all flows in a directory
maestro test e2e-native/flows/chat/

# Run with a different app bundle ID (e.g. a release build)
maestro test --env APP_ID=com.myorg.veda e2e-native/
```

## Directory structure

```
e2e-native/
├── config.yaml                        # Global Maestro config (appId)
├── README.md                          # This file
├── subflows/
│   └── sign-in.yaml                   # Reusable: sign in + land on Dashboard
└── flows/
    ├── auth/
    │   ├── 01-sign-in.yaml            # Sign-in screen renders + happy path
    │   ├── 02-sign-out.yaml           # Sign out → back to sign-in
    │   └── 03-session-persists.yaml   # Token survives app background/foreground
    ├── dashboard/
    │   ├── 01-flight-cards.yaml       # Cards render with correct content
    │   ├── 02-navigate-all-plans.yaml # "All plans" → Roaming Plans screen
    │   ├── 03-navigate-my-plans.yaml  # "My plans" → Subscriptions screen
    │   └── 04-tap-flight-opens-chat.yaml  # Tap card → Chat screen
    ├── chat/
    │   ├── 01-greeting-and-stream.yaml    # Greeting + mock stream milestones
    │   ├── 02-confirmation-prompt.yaml    # Prompt renders with both CTAs
    │   ├── 03-activate-plan.yaml          # Activate → receipt + completion
    │   ├── 04-activate-then-view-plans.yaml # Activate → View my plans → Subscriptions
    │   ├── 05-decline-plan.yaml           # Not now → declined state
    │   ├── 06-follow-up-on-topic.yaml     # On-topic follow-up gets reply
    │   ├── 07-follow-up-off-topic.yaml    # Off-topic gets redirect
    │   └── 08-uber-ride-button.yaml       # Uber button visible + tappable
    ├── subscriptions/
    │   ├── 01-empty-state.yaml            # No plans → empty copy
    │   └── 02-subscription-card-after-activation.yaml  # Full journey
    └── roaming-plans/
        └── 01-plan-catalog.yaml           # Cards, specs, section headers
```

## CI integration

Add to your CI pipeline after building the dev client:

```yaml
- name: Run Maestro native E2E
  run: maestro test e2e-native/
```

Maestro automatically writes JUnit XML results to `~/.maestro/tests/` —
point your CI reporter at that directory.
