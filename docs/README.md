# Documentation Hub

This folder contains deep dive documentation for the repository.

## Reading Order

1. [Architecture Overview](./architecture-overview.md)
2. [Calc Engine Deep Dive](./calc-engine-deep-dive.md)
3. [UI Flow Deep Dive](./ui-flow-deep-dive.md)
4. [Data and Content Sources](./data-and-content-sources.md)
5. [Testing and Validation](./testing-and-validation.md)
6. [Raidalculate Deep Dive](./raidalculate-deep-dive.md) (raid boss finder page)

## Audience

- Contributors who need to understand where logic lives.
- Maintainers who need to change calculation behavior safely.
- Reviewers who need a quick map from UI code to engine code.

## Repository Snapshot

- App type: static multi page web app.
- UI code: `src/js/` plus page HTML files in src.
- Engine code: `src/calc/` with generation specific mechanics and data catalogs.
- Tests: `src/calc/test/`.
