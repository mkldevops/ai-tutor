# AI Tutor — Design system "Orbi in orbit"

Reference for every new page. The V3 boards on the design canvas are the source of truth:
https://claude.ai/artifact/8gTR3keLUXEd1W4YjbH9rg (`V3-OrbiHome`, `V3-OrbiQuestion`, `V3-OrbiError`,
`V3-OrbiDone`, `V3-Parent`).

## 1. Principles

1. **Mature, never babyish.** Learners are 7–11, but the product must feel like a premium tool, not a toy.
   No blush cheeks, cartoon stars, bouncy confetti, pastel notebooks or toddler props.
2. **The tutor is a person-like presence, the learner does the thinking.** Orbi asks, never gives answers.
3. **One focus per screen.** One question, one decision, one primary button.
4. **Show the learning, not the points.** Mastery, recall dates and confidence are the rewards. Ranks exist
   but stay secondary.
5. **Calm space.** Space is the metaphor (missions, flight plan, orbits), expressed with thin lines and
   light, not illustrations.

## 2. Two surfaces

| Surface | Who | Theme | Feel |
|---|---|---|---|
| **Learner** | Child | Dark "deep space" | Immersive, focused, glowing accents |
| **Parent** | Adult | Light "paper" + navy rail | Editorial, factual, calm |

The parent surface reuses the same fonts, Orbi and the orbit skill map (on a navy card), so both feel like
one product.

## 3. Colour tokens

### Learner (dark)

| Token | Value | Use |
|---|---|---|
| `--space-900` | `#070A1C` | Outer background edge |
| `--space-800` | `#0D1330` | Base background, text on light buttons |
| `--space-700` | `#1C2550` | Background glow centre |
| `--star` | `#EEF0F7` | Primary text, primary button fill, mastered nodes |
| `--mist` | `#B7BCD3` | Body copy, secondary text |
| `--dust` | `#8E94B0` | Labels, meta, captions |
| `--void` | `#6A708C` | Disabled, not-reached (decorative or ≥ 18px only) |
| `--rim` | `#4A5070` | Inactive outlines, separators |
| `--glass` | `rgba(255,255,255,0.05)` | Card fill |
| `--glass-line` | `rgba(255,255,255,0.10)` | Card border |
| `--glass-strong` | `rgba(255,255,255,0.08)` + `0.14` border | Speech bubbles |

### Signal colours (shared)

Each tutoring state owns one colour. Do not reuse a signal colour for decoration.

| Token | Value | Meaning |
|---|---|---|
| `--accent` (teal) | `#5EE3D8` | Ready, correct, today, selected, progress |
| `--hint` (amber) | `#FFB547` | Hint mode, current position, a slip to review |
| `--focus` (coral) | `#FF7A5C` | Not quite / misconception (never "failure red") |
| `--lavender` | `#9DB1FF` | Alternate accent only (theme option) |

### Parent (light)

| Token | Value | Use |
|---|---|---|
| `--paper` | `#F4F2EE` | Page background |
| `--card` | `#FFFFFF` + `#E4E1DA` border | Cards |
| `--ink` | `#0D1330` | Headings, primary text |
| `--ink-soft` | `#3A3F5C` | Body |
| `--ink-mute` | `#6A708C` | Meta |
| `--link` | `#2A3C8F` | Links, accent emphasis on paper |
| `--good` | `#1E7A55` | Positive trend |
| `--watch` | `#E0832A` | "Practise together" flag |

### Background recipe (learner)

```css
background: radial-gradient(circle at 30% 50%, #1C2550 0%, #0D1330 48%, #070A1C 100%);
```

Move the gradient centre towards Orbi on each screen. Add 1–2 orbit ellipses (`stroke #FFF`, opacity
0.05–0.07) and at most 5 single-pixel stars (opacity 0.4–0.6). Nothing more.

## 4. Typography

| Role | Font | Notes |
|---|---|---|
| Display / numbers | **Bricolage Grotesque** 700 (answers 600), -0.02em, optical size auto | Headlines, scores, answer choices, big stats |
| UI / body | **Lexend** 400–700 (built to reduce reading effort) | Everything else |
| Meta / labels | **JetBrains Mono** 500, UPPERCASE | Step names, status chips, small data labels |

Google Fonts URL:
`https://fonts.googleapis.com/css2?family=Bricolage+Grotesque:opsz,wght@12..96,500..800&family=Lexend:wght@400..700&family=JetBrains+Mono:wght@500&display=swap`

Scale (desktop; mobile ≈ 0.6× for display sizes):

| Token | Size / line-height | Use |
|---|---|---|
| `display-xl` | 168 / 0.86, -0.03em | Result score (`7/8`) |
| `display-l` | 72 / 0.96, -0.02em | Home headline |
| `display-m` | 56–64 / 1.02, -0.02em | Question prompt |
| `display-s` | 42–52 / 1.0 | Stats, day names (`Sun`) |
| `answer` | 26–28 display 600 | Answer buttons |
| `body-l` | 17–18 / 1.5 | Lead copy |
| `body` | 15–16 / 1.45 | Bubbles, cards |
| `meta` | 12–13 mono, uppercase | Labels |

Rules:

- Headline pattern: plain statement + accent-coloured key words (`Rounding, levelled up.`). Mark them with `<i>`;
  it renders upright in the accent colour. Neither font has a true italic, so never rely on slant.
- Numbers the child must reason about are always in Bricolage Grotesque, tabular where they align.
- Minimum body size for children: 15px. Never below 12px, even for meta.

## 5. Shape, spacing, depth

- Radii stay tight: panels `12px`, cards and stat tiles `10px`, buttons, inputs and answers `8px`, chips `6px`.
  Only avatars and status dots are round.
- Speech bubble: one squared corner pointing at Orbi (`2 10 10 10`).
- Spacing base 4px; common gaps 8 / 12 / 16 / 20 / 24. Card padding 16px, panel 20–24px. Page gutter 44px desktop, 16px mobile.
- No drop shadows on the dark surface: depth comes from glass fills, glow and halo gradients.
- Parent surface: flat white cards, 1px border, no shadow.

## 6. Orbi, the mascot

Glossy white robot head with a black glass face. Expression lives only in the eye light.

Anatomy (SVG, 420×400 viewBox):

- Head `rect 200×170 rx80`, shell = radial gradient `#FFF → #E6E8EF → #9DA3B8`.
- Face `rect 160×112 rx52`, gradient `#23263A → #04050B`, one white reflection stroke at 22% opacity.
- Side "ear" pods `#C9CDD9`; small body with a glowing core dot; two floating arm pods.
- Tilted orbit ring around the body: back arc drawn **before** the robot (35% opacity), front arc **after**,
  a small moon on the ring. Ring and halo take the current state colour.
- Glow: `feGaussianBlur stdDeviation 3` merged over the source.
- Prefix every gradient / filter id per file (`hShell`, `qShell`…) to avoid collisions.

### Expression states

| State | When | Eyes | Colour |
|---|---|---|---|
| `ready` | Home, waiting | Two vertical pills | teal |
| `thinking` | AI replying (replaces spinners) | Pills glance up + 3 fading dots | teal |
| `hint` | Hint given | One pill, one raised "brow" arc + short pill | amber |
| `correct` / `proud` | Right answer, mission complete | Upward arcs; one arm raised on results | teal |
| `notQuite` | Wrong answer | Flat narrowed bars + angled brows | coral |
| `solo` | Independent test | Dim thin white lines, chat closed | white 70% |

Orbi never cries, frowns or looks disappointed. "Not quite" reads as *focused*.

## 7. Core components

| Component | Spec |
|---|---|
| `PrimaryButton` | Pill, h 56–58, fill `--star`, text `--space-800`, 700, 17px. One per screen. |
| `GhostButton` | Pill, 1px `rgba(255,255,255,.2)`, text `--star`, 500. |
| `AnswerChoice` | h 60–66, radius 8, display 600, 26–28. Selected: 2px `--accent` + 10% accent fill. Eliminated: dashed coral border, strike-through, disabled. |
| `ConfidenceScale` | 5 square-ish buttons (54×46, radius 8). Selected = accent fill. On check-out, show the check-in value dashed. `fieldset` with legend. |
| `SpeechBubble` | Glass strong, radius with squared corner toward Orbi. Bold + state colour on the key word. |
| `StatusChip` | Mono 11–12, radius 6, 1px `rgba(255,255,255,.14)` or tinted fill for state (`HINT 1 OF 2`). |
| `FlightPlan` | Lesson steps: Recall → Explain → Practise → Solo flight. Vertical timeline on home, horizontal progress rail in-lesson. Solo flight is a square marker. |
| `OrbitMap` | Skills as planets on concentric ellipses around a core topic. Filled `--star` = Lasting, ring = Secure, accent = today/new, dashed `--rim` = not reached. Always with a legend. |
| `MasteryArc` | Met → Practised → Secure → Lasting on a single arc; current = accent with halo ring. |
| `NumberLine` | Drawn as a shallow arc (an orbit), endpoints `--star`, midpoint `--rim`, current value amber with halo. |
| `PlaceValueTiles` | One tile per digit, display 44 + mono place label; the deciding digit gets accent border, others fade to 45%. |
| `RankBar` | Mono labels (`NAVIGATOR` → `COMMANDER`), 6px track, accent fill. Secondary placement only. |
| `RecallCard` | Display day name (`Sun`) + one sentence on what passing unlocks. |
| `StatTile` (parent) | Label 13 mute, display 42 value, unit 20 mute, trend line 13 in `--good`. |

## 8. Layouts

- **Learner, desktop 1280×800:** header (logo, step rail or pill nav, rank/streak chips, avatar);
  content left (~520–760px); Orbi + tutor panel right (~300–360px) or Orbi as hero centre-left.
- **In-lesson:** Orbi lives in a right glass panel (avatar, state chip, bubble, 2 follow-up chips, "Ask Orbi"
  input at the bottom). In `solo`, the panel collapses to the dimmed Orbi only.
- **Results:** huge display score left, Orbi centre, progress cards stacked right, primary action last.
- **Parent:** 240px navy rail (sections + child switcher), editorial headline, 4 stat tiles, then
  OrbitMap (navy card) + "One thing to practise together", recall, Orbi settings.
- **Mobile:** single column, Orbi shrinks to 96–120px above the bubble, primary button sticky bottom,
  16px gutter, no horizontal scroll.

## 9. Pedagogy patterns to repeat

- Confidence check-in before a mission, check-out after; show both.
- Feedback praises the method ("You used place value, not guessing"), never the child's intelligence.
- Wrong answer: name the misconception, show the rule visually, offer one retry. Mention that practice
  mistakes do not count.
- Every result ends with the next recall date and what it unlocks.
- Parent copy gives one concrete question to ask at home, in plain words.

## 10. Voice

- Short, direct, warm-cool. British English (`practise` verb, `colour`).
- Orbi speaks in one or two sentences and ends on a question when tutoring.
- Space vocabulary is light seasoning: mission, flight plan, solo flight, landing, orbit. Do not overdo it.
- Avoid: "Awesome!!", "Oops!", emoji, exclamation chains, baby talk.

## 11. Motion

- Orbi: slow float (4–6px, 4s ease-in-out loop), blink every ~6s, eye-shape morph 180ms between states.
- Ring: very slow rotation of the moon along the orbit (20s+).
- Feedback: answer border colour transition 150ms; result score counts up once.
- One orchestrated entrance per screen (stagger 60–80ms). No confetti, no shaking.
- Respect `prefers-reduced-motion`: disable float, rotation and count-up.

## 12. Accessibility

- Contrast: text on `--space-800` uses `--star`, `--mist` or `--dust` (all ≥ 4.5:1). `--void` only for
  decorative or ≥ 18px text.
- Colour never carries meaning alone: pair with icon shape, label or strike-through.
- Every SVG illustration: `role="img"` + descriptive `aria-label`; decorative SVGs `aria-hidden="true"`.
- Real `<button>`, `<a>`, `<label>` + `<input>`. Grouped choices use `role="group"` + `aria-label`.
- Touch targets ≥ 44px. Visible focus ring: 2px `--accent` offset 2px (dark) / `--ink` (light).

## 13. Tailwind 4 tokens

Target `src/styles.css` `@theme` (replaces the current indigo/rounded placeholder):

```css
@theme {
  --font-display: "Bricolage Grotesque", system-ui, sans-serif;
  --font-sans: "Lexend", system-ui, sans-serif;
  --font-mono: "JetBrains Mono", ui-monospace, monospace;

  --color-space-900: #070a1c;
  --color-space-800: #0d1330;
  --color-space-700: #1c2550;
  --color-star: #eef0f7;
  --color-mist: #b7bcd3;
  --color-dust: #8e94b0;
  --color-void: #6a708c;
  --color-rim: #4a5070;

  --color-accent: #5ee3d8;
  --color-hint: #ffb547;
  --color-focus: #ff7a5c;

  --color-paper: #f4f2ee;
  --color-ink: #0d1330;
  --color-ink-soft: #3a3f5c;
  --color-ink-mute: #6a708c;
  --color-link: #2a3c8f;
  --color-good: #1e7a55;
  --color-watch: #e0832a;

  --radius-card: 10px;
  --radius-answer: 8px;
}
```

## 14. New page checklist

- [ ] Right surface (learner dark / parent light)?
- [ ] One primary button, radius 8, `--star` fill?
- [ ] Headline in Bricolage Grotesque with one accent-coloured phrase?
- [ ] Orbi present in the correct state colour (or deliberately absent on parent pages)?
- [ ] Signal colours used only for their meaning?
- [ ] Background: gradient + ≤ 2 orbits + ≤ 5 stars, no illustrations?
- [ ] Confidence, recall date or mastery shown where learning happened?
- [ ] Copy: short, British English, no emoji, tutor asks rather than tells?
- [ ] Accessible: labels, contrast, focus, 44px targets, reduced motion?
- [ ] Mobile single column at 16px gutter checked?
