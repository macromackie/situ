# @situ/reports-ui

Typed React components, bundled OFL fonts, and editorial styles used to render
situ research reports. ADR 0096 defines the auto-derived report contract;
ADR 0097 defines the MDX-authored report contract that consumes this package.

Components are pure, SSR-rendered to static HTML strings, and never ship
client-side JavaScript.

Run Storybook locally for design review:

```bash
cd projects/app/packages/reports-ui
bun run storybook
```

Build a static Storybook export under `storybook-static/`:

```bash
bun run storybook:build
```
