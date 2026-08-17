// Lives HERE, next to vite.config.js, on purpose.
//
// There was no postcss config in frontend/, so Vite walked UP the tree and
// found one at the repo root that declared a `tailwindcss` plugin. Tailwind was
// never a dependency of either package.json, so CI died at
// "Cannot find module 'tailwindcss'" on all three runners — while local builds
// passed, because Node resolved it from a stray node_modules in the user's home
// directory. A config file in this folder ends the upward search, so the build
// can no longer depend on what happens to exist above the repo.
//
// Tailwind itself is gone: there was not one @tailwind or @apply directive in
// the project, and its content globs pointed at ./src from the root, where no
// src exists. It never emitted a single rule.
//
// autoprefixer stays and is now a real devDependency. It is not decorative:
// styles.css writes -webkit-backdrop-filter by hand in only 8 of its 19
// backdrop-filter rules, so dropping it would quietly kill blur on Safari for
// the other 11.
export default {
  plugins: {
    autoprefixer: {},
  },
}
