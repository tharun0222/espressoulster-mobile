# Menu quantity controls

Tested in a local built Worker with a tester profile, at a 390 × 844 viewport.

| Check | Result |
| --- | --- |
| Add changes to minus, quantity 1, plus | Passed |
| Plus changes quantity from 1 to 2 | Passed |
| Cart reflects quantity 2 and ₹450 for two ₹225 Cappuccinos | Passed |
| Minus changes quantity from 2 to 1 | Passed |
| Minus at 1 removes the item and restores Add | Passed |
| Mobile layout and screenshot | Passed — mobile.png |
| TypeScript and production build | Passed |

For configured items the menu adjusts the most recently added configuration while retaining its options and instructions. Existing cart synchronization handles persistence. Increment is disabled at 99 and for items that become unavailable or lose a price. These safeguards were reviewed in source; the unavailable and 99 boundary scenarios were not exercised in the browser.
