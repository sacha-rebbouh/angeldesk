# Vendored dependencies

## `xlsx-0.20.3.tgz` — SheetJS

**Pourquoi vendored.** SheetJS ne publie plus le package `xlsx` sur npm depuis
`0.18.5`. Cette version npm porte deux vulnérabilités HIGH non corrigées :

- Prototype Pollution — [GHSA-4r6h-8v6p-xvw6](https://github.com/advisories/GHSA-4r6h-8v6p-xvw6) (corrigée en ≥ 0.19.3)
- ReDoS — [GHSA-5pgg-2g8v-p4x9](https://github.com/advisories/GHSA-5pgg-2g8v-p4x9) (corrigée en ≥ 0.20.2)

Les versions corrigées ne sont distribuées que via le CDN officiel SheetJS. Le
tarball est committé localement (et `package.json` le référence en
`file:vendor/xlsx-0.20.3.tgz`) plutôt qu'en URL CDN directe, pour que `npm ci`
et le build Vercel ne dépendent pas de la joignabilité de `cdn.sheetjs.com` et
restent byte-reproductibles via le lockfile.

**Provenance (à vérifier à chaque mise à jour) :**

- Source : `https://cdn.sheetjs.com/xlsx-0.20.3/xlsx-0.20.3.tgz`
- Version : `0.20.3`
- SHA-256 : `8dc73fc3b00203e72d176e85b50938627c7b086e607c682e8d3c22c02bb99fe8`

Vérifier : `shasum -a 256 vendor/xlsx-0.20.3.tgz`

**Politique de mise à jour.** Dependabot/Renovate ne suivent pas les releases
hors npm — surveiller manuellement les advisories et les releases SheetJS, puis
re-vendorer (télécharger le nouveau tarball, mettre à jour `package.json` +
SHA-256 ci-dessus + lockfile, rejouer le golden parse-equivalence sur fixtures
réelles, `npm audit --omit=dev`).
