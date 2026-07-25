# Design Assets

The `design/` directory was temporarily removed from the active repository to reduce project size and avoid maintaining high-fidelity design assets during the current development phase.

The application source code should not depend on `design/` at runtime.

By default, structure checks do not require `design/` to exist.

To re-enable design asset validation, run:

```bash
CHECK_DESIGN_ASSETS=1 npm run check:structure
```

Expected design asset location when restored:

```text
design/Petmate_33_pages_2.1/
|-- image_manifest.csv
|-- *.md
`-- assets/
```

To restore the design folder, recover it from a backup branch, archive, or previous Git revision.

Suggested backup command before removal:

```bash
mkdir -p ../_archive
tar -czf ../_archive/design-backup-$(date +%Y%m%d-%H%M%S).tar.gz design
```
