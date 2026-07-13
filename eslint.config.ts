// TypeScript 7's native package does not expose the compiler API required by
// typescript-eslint. The private compatibility workspace runs type-aware ESLint
// with classic TypeScript while builds and public type checks keep TypeScript 7.
export { default } from './tooling/eslint-compat/eslint.config'
