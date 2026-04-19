Place one JSON spec per real document in this folder.

Workflow:

1. Create a spec:
```json
{
  "label": "e4n",
  "documentPath": "/absolute/path/to/document.pdf"
}
```

2. Generate the initial golden expectation:
```bash
npx dotenv -e .env.local -- npx tsx scripts/check-document-golden.ts goldens/document-extraction/e4n.json --update
```

3. Re-run after extractor changes:
```bash
npx dotenv -e .env.local -- npx tsx scripts/check-document-golden.ts goldens/document-extraction/e4n.json
```

The expectation is intentionally compact:
- `blockingPages`
- `inspectionPages`
- targeted per-page assertions for non-ready or blocking pages

This keeps the corpus cheap to maintain while still catching regressions in:
- blocking logic
- page taxonomy
- semantic sufficiency
- review/no-review decisions
