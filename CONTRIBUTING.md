# Contributing to Waste Resource Recycle (WRR)

Thank you for your interest in contributing to the **Waste Resource Recycle (WRR) Management System**!

## Code of Conduct
- Be respectful, constructive, and collaborative.
- Adhere strictly to the project architecture, PRD specifications, and business rules documented in [AGENTS.md](AGENTS.md) and [WRR_PRD.md](WRR_PRD.md).

## Development Workflow
1. **Fork & Branch**: Create a feature branch from main:
   `ash
   git checkout -b feature/your-feature-name
   `
2. **Coding Standards**:
   - Backend follows strict layered architecture: outes → controllers → services → models.
   - Never write raw SQL in services or controllers; all SQL belongs in models/ with parameterized queries (?).
   - Frontend is vanilla HTML5, CSS3, and ES6+ JavaScript. **No frontend frameworks** (React/Vue/etc.) per academic proposal guidelines.
   - Respect Content-Security-Policy (CSP): no inline scripts, no inline styles, no onclick handlers.
3. **Testing**:
   Before submitting a Pull Request, ensure all test suites pass:
   `ash
   cd backend
   npm test               # Unit tests (no DB needed)
   npm run check:frontend # Static frontend validation
   npm run test:api       # API integration tests (requires MySQL/MariaDB)
   npm run e2e            # End-to-end integration walkthrough
   `
4. **Commit Guidelines**:
   Use clear, conventional commit messages:
   - eat: add collector payout webhook validation
   - ix: resolve race condition in redemption point hold
   - docs: update API specification for support endpoints

## Pull Request Checklist
- [ ] Code strictly follows layered architecture and security guidelines.
- [ ] All new endpoints are documented in pi-spec.md.
- [ ] Automated tests pass (
pm test, 
pm run test:api, 
pm run e2e).
- [ ] No database credentials, secrets, or .env files are committed.
