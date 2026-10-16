# Favourite heart celebration checks

Tested on a local built Worker using a disposable tester profile at a 390 × 844 viewport.

| Check | Result |
| --- | --- |
| Successful favourite save shows 28 heart particles | Passed |
| Overlay has pointer-events: none and aria-hidden: true | Passed |
| Overlay is removed automatically after its animation | Passed |
| Removing a favourite does not trigger a celebration | Passed |
| Saving a different item replays the celebration | Passed |
| Screenshot confirms the mobile visual appearance | Passed — mobile.png |
| TypeScript check and production build | Passed |

Reduced motion is implemented through prefers-reduced-motion: reduce: five static hearts fade gently, with no burst travel. This CSS branch was reviewed; operating-system motion emulation was not run.

The effect triggers only after the existing favourites API confirms success. It does not change favourites storage or payment behavior.
