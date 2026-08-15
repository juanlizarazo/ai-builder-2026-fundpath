# AGENTS.md - Claude Code Configuration

## Project Overview

This is the FundPath — Startup State / AI Builder Day Hackathon project for the GOEO Challenge (Aug 14, 2026). The goal: answer "I'm a [industry] startup in Utah with [N] employees and a $[Y] need — what government resources should I know about, and why?"

**Stack:** Angular 21+ (standalone components) + Tailwind CSS, backed by Firebase Cloud Functions (TypeScript). AI layer handles startup profile extraction and opportunity explanation prose.

**Product name:** FundPath

**Domain context:** Utah startups miss non-dilutive federal funding (SBIR/STTR, grants, loans, procurement) because government language is opaque, eligibility rules are complex, and most tools either hallucinate matches or return keyword noise. FundPath translates startup language into ranked, explained, honestly-tiered government opportunities — and knows when to say there's no good match (the Case 5 abstention test).

**Key files:** `docs/PROJECT_CONTEXT.md` — full challenge brief, judging rubric, 5 test cases, eligibility logic. `docs/RESEARCH.md` — deep API reference, endpoint schemas, Utah programs. Read both before touching any feature.

---

## Rule Reference

Rules use the format `[CATEGORY-##]`. Categories:

| Prefix | Category |
|--------|----------|
| `CMT`  | Comments |
| `TS`   | TypeScript Conventions |
| `ANG`  | Angular Conventions |
| `MAT`  | Angular Material |
| `SCSS` | SCSS Conventions |
| `FB`   | Firebase Functions |
| `PKG`  | Package Management |
| `ERR`  | Error Handling |
| `GIT`  | Git & Pull Requests |
| `TEST` | Testing |
| `UI`   | UI/UX Patterns |

---

## Code Style Rules

### Comments

- `[CMT-01]` Do NOT add comments to TypeScript code
- `[CMT-02]` Code should be self-documenting with clear variable/function names
- `[CMT-03]` HTML template comments are acceptable for section organization
- `[CMT-04]` Exception: Complex regex or algorithms may have a brief explanation

### TypeScript Conventions

- `[TS-01]` Use descriptive, human-friendly names for all identifiers — variables, parameters, properties, and functions must clearly communicate intent. No single-letter or cryptic names (e.g., use `subscription` not `s`, `error` not `e`, `value` not `v`, `user` not `u`). Exception: conventional loop counters (`i`, `j`) in simple numeric `for` loops.
- `[TS-02]` Use strict typing everywhere — no `any` unless absolutely necessary. Explicit type annotations are required when the type cannot be inferred (e.g., function parameters, uninitialized variables). When a value is initialized inline, TypeScript inference is sufficient — do not add redundant type annotations (e.g., `private _flag = false` not `private _flag: boolean = false`)
- `[TS-03]` Always include visibility modifiers on methods (`public`, `private`, `protected`)
- `[TS-04]` Always include explicit return types on methods (`:void`, `:Promise<T>`, etc.)
- `[TS-05]` Always use braces `{}` for control flow blocks (no single-line `if` without braces)
- `[TS-06]` Add blank line before `return` statements
- `[TS-07]` Add blank line before `if`/`for`/`while` blocks
- `[TS-08]` Prefer `interface` over `type` when possible
- `[TS-09]` Use `type` only for unions, intersections, or mapped types
- `[TS-10]` Interface names must start with `I` (e.g., `IUser`, `IDeal`, `IMetric`)
- `[TS-11]` Interfaces go in `.interfaces.ts` files
- `[TS-12]` Types go in `.types.ts` files (derived types from const objects go here, not in `.constants.ts`)
- `[TS-13]` Constants go in `.constants.ts` files (only const objects, no type exports)
- `[TS-14]` Helper/utility functions go in `.helper.ts` files (pure functions, use `static` methods)
- `[TS-15]` Services go in `.service.ts` files (instantiated classes, no `static` methods)
- `[TS-16]` Use `private readonly` for injected services
- `[TS-17]` Use `inject()` function instead of constructor injection
- `[TS-18]` Prefix private properties with underscore: `private readonly _myService`

### Angular Conventions

- `[ANG-01]` Use standalone components (no NgModules)
- `[ANG-02]` Use new control flow syntax: `@if`, `@for`, `@switch` (not `*ngIf`, `*ngFor`)
- `[ANG-03]` Use signals for reactive state (`signal()`, `computed()`, `effect()`)
- `[ANG-04]` Component files: `.component.ts`, `.component.html`, `.component.scss`
- `[ANG-05]` Use `ScreenToolbarComponent` for page headers with back navigation
- `[ANG-06]` Use `LoadingService` for global loading state (not local progress bars)
- `[ANG-07]` Use `AlertBannerComponent` for error messages (not snackbars for errors)

### Angular Material

- `[MAT-01]` Use Material components consistently
- `[MAT-02]` Button with icon + text pattern: wrap in a flex div for vertical alignment
  ```html
  <button mat-flat-button>
    <div class="btn-content">
      <mat-icon>icon_name</mat-icon>
      <span>Button Text</span>
    </div>
  </button>
  ```
  ```scss
  .btn-content {
    display: flex;
    align-items: center;
    gap: 8px;
  }
  ```
- `[MAT-03]` Use `mat-flat-button` for primary actions, `mat-stroked-button` for secondary
- `[MAT-04]` Use `appearance="outline"` for form fields

### SCSS Conventions

- `[SCSS-01]` Use component-scoped styles
- `[SCSS-02]` Do NOT style native HTML elements directly (p, h1, div, etc.) — use classes instead
- `[SCSS-03]` Mobile breakpoint: `max-width: 599.98px`
- `[SCSS-04]` Tablet breakpoint: `max-width: 959.98px`
- `[SCSS-05]` Use flexbox and grid for layouts
- `[SCSS-06]` Standard border-radius: `12px` for cards, `8px` for smaller elements

### CSS Theme Variables

Use CSS variables defined in `styles.scss` for consistent theming:

```scss
var(--app-theme--primary, #15445b)      // Primary brand color (dark teal)
var(--app-theme--tertiary, #32a32f)     // Success/positive color (green)
var(--app-theme--tertiary-bg, #e8f5e9)  // Success background (light green)
var(--app-theme--accent, #d97706)       // Accent/warning color (orange)
var(--app-theme--error, #d32f2f)        // Error color (red)
var(--app-theme--error-dark, #ba1a1a)   // Dark error color
var(--app-theme--error-bg, #ffebee)     // Error background (light red)
var(--app-theme--surface, #fafafa)      // Card/surface background (light gray)
var(--app-theme--border, #e0e0e0)       // Border color (gray)
```

### Firebase Functions

- `[FB-01]` Use `onCall` for callable functions
- `[FB-02]` Always validate `request.auth?.uid`
- `[FB-03]` Handle errors with human-friendly messages
- `[FB-04]` Use `HttpsError` for returning errors to client
- `[FB-05]` Use Firebase secrets for sensitive values (API keys, etc.)
- `[FB-06]` Use constants in `.constants.ts` files for configuration values (avoid env vars)
- `[FB-07]` Use Firebase logger instead of `console.log`:
  ```typescript
  import * as logger from 'firebase-functions/logger';

  logger.info('Message', { key: 'value' });
  logger.error('Error message', { error: err.message, context: data });
  ```

**When adding a new Cloud Function:**
1. Create the function in `functions/src/[feature]/`
2. Export it from `functions/src/index.ts`
3. Add a rewrite entry in `firebase.json` under `hosting.rewrites` (before the catch-all `**` rule):
   ```json
   {
     "source": "/functionName",
     "function": "functionName"
   }
   ```

### Package Management

- `[PKG-01]` Use `--exact` flag when installing packages (no `~` or `^` in versions)
  - Example: `yarn add --exact package-name`
- `[PKG-02]` Use **yarn** as the package manager (not npm). Use `yarn` for installs and `yarn run` for scripts.

### Error Handling

- `[ERR-01]` Backend: Parse API errors and return user-friendly messages
- `[ERR-02]` Frontend: Display errors using `AlertBannerComponent`
- `[ERR-03]` Log errors to console for debugging

### File Organization
```
app/src/app/
├── core/                    # Core services, guards, interceptors
│   └── services/
├── shared/                  # Shared components, layouts, forms
│   ├── components/
│   ├── layouts/
│   └── forms/
├── [feature]/              # Feature modules
│   ├── services/
│   ├── [component]/
│   └── [feature].routes.ts
functions/src/
├── [feature]/
│   ├── functions/          # Cloud functions
│   └── services/           # Business logic services
├── constants.ts
└── index.ts                # Function exports
```

### Shared Types Pattern
Types are shared between frontend and backend using local virtual npm packages:
- `functions/lib/firestore/index.d.ts` - Firestore document interfaces (backend)
- `functions/lib/types/index.d.ts` - API contract types (callables request/response)
- `app/src/types/firestore.d.ts` - Firestore document interfaces (frontend, uses Firebase Timestamp)

When adding new Firestore collections:
1. Add interface to `functions/lib/firestore/index.d.ts` (uses `@google-cloud/firestore` types)
2. Add matching interface to `app/src/types/firestore.d.ts` (uses `firebase.firestore.Timestamp`)
3. Use namespace pattern: `FundPath.Firestore.[Feature].I[InterfaceName]`

Example:
```typescript
namespace FundPath.Firestore.Opportunities {
  export interface IOpportunityMatch {
    id?: string;
    startupId: string;
    opportunityId: string;
    fitTier: FitTier;
    createdAt: Timestamp;
  }
}
```

### Git Commits & Pull Requests

**Commit Format** `[GIT-01]`:
- Use conventional commits format: `type: description`
- Types: `feat`, `fix`, `refactor`, `docs`, `test`, `style`, `chore`
- Concise messages focusing on "why" not "what"

**Pull Request Format** `[GIT-02]`:
- Title: Use conventional commits format
  - Example: `feat: add founder navigator AI chat`
- Body: Use this template:
  ```markdown
  ## Changes
  - Bullet point list of main changes

  ## Testing
  - [ ] Step-by-step checklist of what to open, click, and verify
  - [ ] Cover the happy path, edge cases, and any related existing features that could regress
  - [ ] One checkbox per verifiable action (not per feature)
  ```
- `[GIT-03]` When updating an existing PR description, **never overwrite already-checked testing items** (`- [x]`). Preserve all checked boxes and only append new unchecked items for changes added since the last update.

---

## Testing Conventions

### Framework

- `[TEST-01]` Use Jasmine (Angular default) for all tests
- `[TEST-02]` Test files: `[name].spec.ts` matching source file location

### Test Structure

```typescript
describe('ClassName', () => {
  describe('methodName()', () => {
    it('does expected behavior when given input', () => {
      // test implementation
    });
  });
});
```

- `[TEST-03]` Root `describe` block: Class or component name (e.g., `'ResourceHelper'`)
- `[TEST-04]` Nested `describe` blocks: Public method names with `()` suffix
- `[TEST-05]` `it` blocks: Start with verb describing behavior
- `[TEST-06]` Skip boilerplate tests like `'should create'` — focus on real logic

### Testing Rules

- `[TEST-07]` **No `any` types** in test files — use proper typing
- `[TEST-08]` **Only test public interfaces** — don't test private methods directly
- `[TEST-09]` **Don't mock helpers** — helpers are pure functions, use real calls for better coverage
- `[TEST-10]` **Component testing**: Test template bindings and rendered output, not just class logic
- `[TEST-11]` **Services**: Test all public methods with various inputs including edge cases

---

## UI/UX Patterns

### Loading States

- `[UI-01]` Use global `LoadingService` for page/data loading
- `[UI-02]` Use inline spinners for button actions (spinner only, no text while loading)
- `[UI-03]` Minimum loading time for iframes: 2 seconds

### Global Card Styles (`styles.scss`)
Use the global `ss-card` classes for consistent clickable card lists:

```html
<div class="ss-card-grid">
  <mat-card class="ss-card ss-card--clickable" appearance="outlined" routerLink="/path">
    <mat-card-content>
      <div class="ss-card-header">
        <div class="ss-card-icon">
          <mat-icon>icon_name</mat-icon>
        </div>
        <div class="ss-card-content">
          <h4>Card Title</h4>
          <p>Card description text</p>
        </div>
        <mat-icon class="ss-card-arrow">chevron_right</mat-icon>
      </div>
    </mat-card-content>
  </mat-card>
</div>
```

Note: Always use `appearance="outlined"` on mat-card for flat white cards with borders.

Classes:
- `.ss-card` - Base card with border, 12px radius, white background
- `.ss-card--clickable` - Adds hover effects (border color, shadow, translateY)
- `.ss-card-header` - Flexbox row layout with centered items
- `.ss-card-icon` - 48x48 circular icon container with primary background and white icon
- `.ss-card-content` - Flex content area with h4 title and p description
- `.ss-card-arrow` - Chevron arrow (gray, 24px)
- `.ss-card-grid` - Container with flex column, 12px gap, max-width 600px

### Global Page Header Styles (`styles.scss`)
Use the global `ss-page-header` classes for page headers with actions:

```html
<div class="ss-page-header">
  <div class="ss-page-header-left">
    <h1 class="ss-page-title">Page Title</h1>
    <p class="ss-page-subtitle">Page description or subtitle</p>
  </div>
  <button mat-flat-button class="ss-page-action">
    <mat-icon>add</mat-icon>
    <span>Action</span>
  </button>
</div>
```

Classes:
- `.ss-page-header` - Flexbox row with space-between, 24px bottom margin
- `.ss-page-header-left` - Flex container for title/subtitle
- `.ss-page-title` - Bold title (600 weight), no margins
- `.ss-page-subtitle` - Gray subtitle text
- `.ss-page-action` - Button container with icon styling

### Forms

- `[UI-04]` Max width `600px` for form containers on large screens
- `[UI-05]` Use `mat-hint` for field guidance
- `[UI-06]` Show validation errors inline with `mat-error`

### Side Panels / Bottom Sheets

- `[UI-07]` Use `SidePanelComponent` instead of dialogs for contextual content
- `[UI-08]` **Default behavior**: Bottom sheet (slides from bottom) — works on all screen sizes
- `[UI-09]` On desktop (>768px): Slides from right side
- `[UI-10]` On mobile (≤768px): Slides from bottom as a bottom sheet
- `[UI-11]` Max height on mobile: 85vh with border-radius on top corners

#### Async submit pattern (form side panels)

- `[UI-12]` **Child owns the async call.** The component containing the form is responsible for calling the service and must only emit `closed` on success — never before.

- `[UI-13]` **Submit button state during save.** While saving: show a `<mat-spinner diameter="20">` in place of the button label, disable the button with `[disabled]="form.invalid || isSubmitting"`, and disable Cancel with `[disabled]="isSubmitting"`. Pass `[closable]="!isSubmitting"` to `SidePanelComponent` to prevent backdrop/X dismissal mid-save.

  ```html
  <button mat-flat-button color="primary" type="submit" [disabled]="form.invalid || isSubmitting">
    @if (isSubmitting) {
      <mat-spinner diameter="20"></mat-spinner>
    } @else {
      {{ submitLabel }}
    }
  </button>
  <button mat-button type="button" [disabled]="isSubmitting" (click)="onClose()">Cancel</button>
  ```

- `[UI-14]` **Inline error on failure.** On submit error, set a `saveError` string and display it with `<ss-alert-banner>` inside the panel (above the action buttons). Do not close the panel. Clear it on the next submit attempt or on close.

  ```html
  @if (saveError) {
    <ss-alert-banner [message]="saveError" (dismissed)="saveError = ''"></ss-alert-banner>
  }
  ```

- `[UI-15]` **isSubmitting flag pattern.** Use a boolean flag (`isSubmitting = false`) on the component. Set it to `true` before the async call and reset it in `finally`.

  ```typescript
  public async onSubmit(): Promise<void> {
    if (this.form.invalid || this.isSubmitting) { return; }
    this.isSubmitting = true;
    try {
      await this._service.doWork(...);
      this.closed.emit();
    } catch {
      this.saveError = 'Failed to save. Please try again.';
    } finally {
      this.isSubmitting = false;
    }
  }
  ```

---

## File Formatting

- Always include a newline at the end of files
