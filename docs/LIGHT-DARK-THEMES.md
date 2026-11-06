# Version 1 light and dark appearance

Prepared against Version 1 hosted version 128, source commit `276433c50e5e698dce7215d92a8dcdb51783d773`.

- Light mode retains Version 1's cream and green presentation.
- Dark mode scopes Version 2's black and orange presentation to `html[data-theme="dark"]`, including menu, cart, checkout, scanner, subscriptions and portal dialogs.
- Theme controls are in the header, entry screen and Profile → Appearance. The choice is stored on the current browser and applied before hydration; first visits default to light.
- Opening/splash markup and its timer were removed. No Version 2 video was added.
- Backend logic, database migrations, runtime credentials, Site identity and storage bindings are unchanged.

Verification: all 33 existing Node test files passed, final production build passed, TypeScript passed and diff checks passed. Mobile visual checks showed light and dark modes at 390px, no opening overlay, and dark mode retained after reload. Profile Appearance controls were present; an additional control click was interrupted by browser automation stalling.

The owner explicitly approved publication on 23 October 2026: deploy Version 1 with light and dark themes and no opening animation. The existing Site identity, public audience, credentials and storage bindings are retained.

The separate Version 2 Site is now private, not permanently deleted: the available hosting tools expose audience changes but no deletion/unpublish operation.
