# Accessibility

Fodr targets **WCAG 2.2 level AA** (spec M5, #44). This page covers how that is checked, what the last manual pass
found, and what is still open.

## How it is checked

### Automated, in every e2e run

[axe](https://github.com/dequelabs/axe-core) checks run through `@axe-core/playwright`, set up in
`apps/web/e2e/support/accessibility.ts`.

**Rules.** The checks run every rule tagged WCAG 2.0, 2.1 and 2.2 at levels A and AA. They also run axe's
`best-practice` rules, which add landmarks and heading order.

**Where they run:**
- **Every test's final page.** An auto fixture in `helpers.ts` checks the page each passing test ends on, so a new spec
  is covered without asking.
- **States in between.** A test calls `expectAccessible(page, '<state>')` for states its final page doesn't show:
  - an open dialog;
  - a form with errors;
  - the plan with its explanation;
  - the transition calendar.

  Add a call when a test passes through a state worth checking.
- **At 320 CSS pixels.** `small-screen.spec.ts` checks the main pages at the width of a small phone, which is also a
  1280 px screen at 400 % zoom (1.4.10 Reflow). It checks that no page scrolls sideways, and runs axe there as well.

**What is checked is the settled page, scrolled to its top.** The check waits for animations and smooth scrolling to
end. Two reasons:
- a dialog that is fading in is half transparent, and axe measures that as low contrast;
- a field left under a sticky bar counts as covered.

An animation that never ends, such as a loading pulse, is checked as it runs. It must pass at every moment.

**Fix the cause.** Don't turn a rule off or exclude an element to let a change through. Today nothing is excluded. If
axe is ever wrong about an element, the exclusion goes next to it, with the reason.

### What axe cannot check: e2e tests of behaviour

| Behaviour | Test |
|---|---|
| The account dialog keeps focus in it, closes on Escape and gives focus back | `landing-and-account.spec.ts` |
| The phone menu keeps focus while open, closes on Escape and gives focus back | `small-screen.spec.ts` |
| Toggle buttons say whether they are pressed ("Typ", "Undvik ingredienser") | `horse-profile.spec.ts` |
| An unknown product is said in text and read with its field | `horse-profile.spec.ts`, `admin-products.spec.ts` |
| A warning in the plan is said in words, not by colour alone | `analysis-and-plan.spec.ts` |
| The landing page's product preview is one picture to a screen reader | `landing-and-account.spec.ts` |
| The horse list reads each horse by its name, without the drawn initial | `horse-profile.spec.ts` |

### Manual

Some things can only be seen or heard, so a pass by hand complements the tests:
- whether the focus indicator is visible;
- how the page sounds.

The last pass is below.

## Manual pass, 2026-10-23

**What was tested.** Branch `44-accessibility`, in Chromium (Playwright 1.63) at 1280×720, 640 and 320 px wide. It
covered every core flow:
- the landing page and the account dialog in each mode (CF1);
- the horse profile and AI fill (CF2, CF3);
- the analysis (CF4);
- the plan, explanation and calendar (CF5, CF6);
- the journal (CF7);
- export and account deletion (CF8);
- product administration (CF9);
- the legal pages and the new-terms screen.

**How.**
- **Keyboard.** A script pressed Tab through each page and dialog. At every stop it recorded the role and name, whether
  a focus indicator was drawn, whether the element was on screen and not covered, and whether focus left an open dialog.
  Reduced motion was on, so styles and positions were final.
- **Focus indicators.** Checked by eye on screenshots of a field, a step tab, the sidebar and the date input.
- **Reflow.** At 320 and 640 px: page width and axe.
- **Accessibility tree.** Playwright's ARIA snapshot of the landing page, the account dialog, the profile, the plan and
  the journal was read for:
  - unnamed or misnamed controls;
  - state that isn't exposed;
  - heading and landmark structure.

**Found and fixed in #44:**
- The phone menu let Tab reach the page under it, where a focused field could be completely hidden (2.4.11). The page
  under it is now inert while the menu is open.
- Fields in the profile could take focus under its sticky save bar (2.4.11). Added `scroll-padding-bottom`.
- Text fields showed only a faint glow on focus: a CSS specificity clash kept their green border off (2.4.7, 1.4.11). The
  focus is now a solid green ring.
- The step tabs clipped their focus ring. It is now drawn inside the tab.
- Tables scrolled sideways on a phone with no keyboard access (2.1.1). `display: block` also made them scroll
  themselves, which loses table semantics in some browsers. Each table now scrolls in a named, focusable region.
- The landing page's product preview was heard as a second app: a sidebar landmark, steps and a list. It is now one
  picture.
- The "Typ" buttons didn't say which was chosen. Horse buttons were read with their drawn initial ("S Sixten"). Warning
  marks were read as "!".

Found earlier in #44 by the automated checks:
- **Text contrast.** `--text-3` was 3.2 to 3.6:1, and the loading pulse faded text to 3.8:1.
- **Focus ring.** It was 25 % alpha, about 1.4:1.
- **Unlabelled fields.** The feed rows' fields had no label.
- **Colour-only states:**
  - the ingredient toggles;
  - unknown products;
  - warning rows.
- **The account dialog.** It had no focus trap and no Escape.
- **Landmarks.** Two were missing.
- **A decorative image.** It carried an empty image role.

**Checked and found right:**
- Focus never escapes an open dialog, and every focus stop draws an indicator. Most are a 3 px green outline, and fields
  get a green border and ring.
- Focus order follows the visual order on every page.
- No page scrolls sideways at 320 or 640 px.
- The account dialog starts in its form.

**Not checked by hand.** A real screen reader: this machine is headless and cannot run one. The listening pass with
VoiceOver on macOS and iOS is #165, with its checklist.

## Known limits

- **Status messages.** Messages such as "Skriver förklaring…" aren't in a live region everywhere. The autosave status
  (`SaveStatus`) is. Whether the rest are missed in practice is a question for the screen reader pass (#165).
- **Logging in on a phone.** Under 820 px the landing page's header shows only "Kom igång". Login is reached from there,
  through the account dialog's switch. That path works, so it isn't a WCAG failure, but it is a detour for a returning
  user.
- **Native date inputs** look and behave as each browser draws them. Their accessibility is the browser's.
