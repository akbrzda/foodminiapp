# AGENTS.md — Universal Instructions for AI Agents

## General Principles

- All communication, code comments, documentation and commit messages must be written in Russian
- Always focus on the meaning of the task, not just execution
- Do not assume — if something is unclear, ask or minimize risky changes
- Do not introduce unnecessary complexity
- Prefer simple and predictable solutions

---

## Project Awareness

Before starting any task:

1. Read available documentation:
   - `README.md`
   - `docs/`
   - `TASKS.md`

2. Understand project structure and conventions
3. Reuse existing patterns instead of inventing new ones

---

## Architecture (Generic)

Most projects follow this structure:

- `backend/` — API, business logic, database
- `admin-panel/` — admin interface (if exists)
- `client/` or `miniapp/` — user-facing app
- `docs/` — documentation
- `TASKS.md` — current task tracking

Do not break existing structure without strong reason.

---

## TASKS.md Management

### Rules:

1. If all tasks are completed — clear the file
2. Always break tasks into subtasks with `[ ]`
3. Update statuses: `[ ]` → `[x]`
4. Remove completed blocks
5. Keep only current work

---

## Commit Message Rules

### General Rules

- Always write commits in Russian
- Keep one consistent style across the project
- Do not use Conventional Commits:
  - `feat:`
  - `fix:`
  - `refactor:`
  - `chore:`
  - `docs:`

### Format

Commit message must be written as a result, not an action:

- Добавлен
- Исправлен
- Улучшен
- Удален
- Обновлен
- Реализован
- Упрощен
- Стабилизирован
- Переработан
- Унифицирован

### Content Rules

A commit must describe:

- what changed in behavior
- what was improved
- what was fixed
- what was simplified
- what was added or removed

A commit must NOT include:

- file names
- paths
- endpoints
- functions/classes/variables
- database tables or migrations
- internal implementation details

Do not turn commit into:

- changelog
- diff summary
- technical report

### Size

Small change:

- one short line

Example:

- Исправлен переход между экранами

Large change:

- one main line
- optionally a few short high-level lines

### Agent Rule

When user asks for commit:

- return commit text in chat
- do NOT run git commit automatically

---

## Code Style

### Comments

Comment only when necessary:

- complex business logic
- non-obvious decisions
- workarounds (with TODO/FIXME)

Do NOT comment obvious code.

### File Size

- > 500 lines → must be split
- Split by logical responsibility

### Naming

- Components — PascalCase
- Variables/functions — camelCase
- Constants — UPPER_SNAKE_CASE

---

## Dependency Management

Before installing any library:

1. Ask user permission
2. Explain why it is needed
3. Check existing alternatives

Do NOT:

- install "just in case"
- duplicate existing functionality

---

## Running Services

Before starting anything:

1. Check if service is already running
2. Do not start duplicates
3. Do not open unnecessary terminals

---

## Error Handling

- Always use try/catch for async operations
- Show user-friendly errors
- Log detailed errors in console

---

## Security

- Validate all input data
- Never trust client input
- Do not log sensitive data
- Use parameterized queries

---

## Performance

Avoid:

- unnecessary data loading
- missing pagination
- duplicated logic

Prefer:

- caching
- batching
- optimized queries

---

## Pre-Commit Checklist

- No debug `console.log`
- No unused code
- No duplicated logic
- Error handling present
- Input validation present

---

## Prohibited

- Auto-committing without user confirmation
- Installing dependencies without approval
- Creating unnecessary files
- Breaking existing architecture without reason

---

## Good Practices

- Think before writing code
- Keep solutions simple
- Follow existing patterns
- Write consistent commits
- Focus on result, not implementation