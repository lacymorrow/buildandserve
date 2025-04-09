# ShipKit Testing Plan

This document outlines the plan for adding comprehensive unit and integration tests to the ShipKit project using Vitest and React Testing Library.

## Goals

- Increase test coverage across critical application areas.
- Ensure robustness and reliability of core features.
- Write unique, diverse, and intuitive tests focusing on actual functionality.
- Fix existing test errors and address skipped tests.

## Existing Setup

- Testing Framework: Vitest
- Location: `tests/` directory at the project root.
- Existing Tests: Cover some hooks (`use-copy-to-clipboard`) and server services (`github-service`, `team-service`). Note: `use-copy-to-clipboard` tests will be removed as they require browser APIs.
- Runner Command: `pnpm test`

## Areas to Test

### 1. Hooks (`src/hooks/`)

- **Priority:** High
- **Action:**
  - [ ] **Add:** Write tests for other custom hooks, covering various states, return values, and side effects. Focus on hooks whose logic can be tested without direct browser API interaction (e.g., state management, calculations).
    - Example: `use-yyy.ts`, `use-xxx.ts` etc.
  - **Note:** Hooks heavily reliant on browser-specific APIs (like Clipboard, Geolocation, etc.) are better suited for integration/E2E tests.

### 2. Server Services (`src/server/services/`)

- **Priority:** High
- **Action:**
  - [ ] **Review:** Examine existing tests for `github-service.test.ts` and `team-service.test.ts` for completeness and edge cases.
  - [x] **Add:** Implement tests for remaining services. Focus on:
    - Correct data fetching and manipulation.
    - Interaction with the database (ensure cleanup).
    - Handling of feature flags/environment variables (e.g., GitHub service enabled/disabled).
    - Error handling.
    - Example Services: `auth-service.ts`, `email-service.ts`, `user-service.ts`, `feedback-service.ts` (skipped test addressed).
    - Added tests for `auth-service.ts` covering user sync, credential flows, session updates, and password reset.
    - Added tests for `resend-service.ts` covering success, failure, and uninitialized client scenarios.
    - Added initial tests for `user-service.ts` (covering `ensureUserExists`, `findOrCreateUserByEmail`) with necessary mocks.

### 3. Server Actions (`src/server/actions/`)

- **Priority:** High
- **Action:**
  - [ ] **Add:** Write tests for server actions. Focus on:
    - Input validation.
    - Correct invocation of services.
    - Return values (success and error states).
    - Permissions and authorization checks if applicable.
    - Database interactions triggered by actions (ensure cleanup).

### 4. UI Components (`src/components/`)

- **Priority:** Medium
- **Action:**
  - [ ] **Add:** Implement tests using React Testing Library for critical UI components. Focus on:
    - Rendering based on props and state.
    - User interactions (clicks, form submissions).
    - Conditional rendering.
    - Accessibility attributes.
    - Start with core components like those in `auth/`, `forms/`, `layout/`, `primitives/`.

### 5. Utility Functions (`src/lib/`)

- **Priority:** Medium
- **Action:**
  - [ ] **Add:** Write unit tests for utility functions, covering different inputs and edge cases.
    - Example: `utils.ts`, `validators.ts` etc.

### 6. Configuration (`src/`)

- **Priority:** Low
- **Action:**
  - [ ] **Review/Fix:** Investigate why `tests/unit/server/next.config.test.ts` is skipped and add relevant tests if necessary.
  - [ ] **Add:** Consider tests for other configuration files if they contain complex logic (`payload.config.ts`, `env.ts`).

## Testing Principles

- **Arrange, Act, Assert (AAA):** Structure tests clearly.
- **Isolation:** Unit tests should test one thing in isolation. Mock dependencies *only* when testing external systems or complex internal dependencies that are tested elsewhere. Prefer testing the actual integrated functionality where feasible.
- **Environment Suitability:** Recognize when functionality relies heavily on browser-specific or environment-specific APIs (e.g., DOM manipulation, Clipboard, Network status, File System). Such features are often better candidates for integration or end-to-end (E2E) tests rather than pure unit tests in simulated environments like JSDOM. Mocking these APIs in unit tests may only verify the *call* to the mock, not the *actual functionality*.
- **Coverage:** Aim for comprehensive coverage of logic, branches, and edge cases.
- **Readability:** Use descriptive names for tests (`it('should...')`).
- **Cleanup:** Ensure tests clean up after themselves (e.g., database state). Use Vitest's `beforeEach`, `afterEach`, `beforeAll`, `afterAll` hooks.

## Next Steps

1. Address skipped tests (`feedback-service`, `next.config`).
2. Proceed with adding tests based on the priorities outlined above, starting with Server Services and Actions.
