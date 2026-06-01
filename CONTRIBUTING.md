# Contributing to Hornbill

Thank you for considering contributing to **Hornbill**! This project follows a simple workflow to keep contributions clear, consistent, and aligned with the project's standards.

## Getting Started

1. **Fork the repository** on GitHub.
2. **Clone your fork**:
   ```bash
   git clone https://github.com/<your-username>/hornbill.git
   cd hornbill
   ```
3. **Install dependencies** (requires [Bun](https://bun.sh/)):
   ```bash
   bun install
   ```
4. **Run the development servers**:
   ```bash
   make dev   # Starts both API and Web in watch mode
   ```
5. Ensure the project builds and the tests (if any) pass before making changes.

## Code Style & Linting

- Use the project's ESLint configuration (`eslint.config.js`). Run:
  ```bash
  bun lint   # or `bun lint` if a script is defined
  ```
- Follow the design system defined in `DESIGN.md` for any UI changes.
- Keep TypeScript types strict; avoid `any` unless absolutely necessary.

## Commit Message Rules

All commits must follow the **Conventional Commits** style as enforced by the project’s `AGENTS.md`:

```
<type>(<scope>): <subject>

<body>
```

- **type**: `feat`, `fix`, `refactor`, `style`, `docs`, `chore`
- **scope**: a *single* scope, e.g., `api`, `web`, `core`
- **subject**: ≤ 50 characters, starts with a lower‑case verb in imperative mood.
- **body** (optional): explains *why* the change is needed, not *how*.

Do **not** reference external tickets (Jira, GitHub issues) in the commit message.

## Pull Request Process

1. Create a new branch from `main`. Use a descriptive name, e.g., `feat/payment‑recurrence`.
2. Make your changes and ensure they pass linting and any existing tests.
3. Commit using the format described above.
4. Push the branch and open a Pull Request against the upstream `main` branch.
5. In the PR description, briefly summarize the change and mention any relevant docs that were updated.
6. A maintainer will review the PR. Address any feedback and push additional commits as needed.
7. Once approved, the PR will be merged using **squash‑merge** to keep a clean history.

## Documentation

- Update `README.md` or `docs/` as appropriate for new features.
- If you add or modify recurrence models, ensure `docs/business_logic.md` reflects the change.

## License

By contributing, you agree that your contributions will be licensed under the same **GNU AGPL v3** license as the project.

---

*Happy hacking!*
