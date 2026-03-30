# Linting and Formatting Setup (SIST)

This project is configured with ESLint, Prettier, and Laravel Pint, following industry-standard best practices for modern full-stack Laravel + React (Inertia.js) development.

Because SIST combines a PHP backend with a React frontend in the same repository, our linting strategy is strictly separated by file type to ensure tools do not conflict.

## Configuration Files

- **tsconfig.json** - Controls TypeScript compiler rules and strict type-checking for the frontend.
- **.prettierrc** - Prettier configuration for TypeScript, React (TSX), and CSS formatting.
- **.prettierignore** - Protects compiled assets and Laravel backend files from Prettier.
- **eslint.config.js** - Modern ESLint "Flat Config" handling React 19, TS/TSX parsing, and global variables.
- **pint.json** _(Optional)_ - Laravel Pint configuration (uses Laravel defaults if missing).

## Available Scripts

### React / Frontend (TypeScript)

- **pnpm typecheck** - Runs the TypeScript compiler (`tsc --noEmit`) to catch type and interface errors.
- **pnpm lint** - Check for linting errors in resources/js/ using ESLint.
- **pnpm lint:fix** - Fix auto-fixable ESLint errors.
- **pnpm format** - Format all TS/TSX/CSS files with Prettier.
- **pnpm format:check** - Check if files are formatted correctly (used in CI).

### Laravel / Backend

- **pnpm format:php** - Format all PHP files using Laravel Pint
- **./vendor/bin/pint --test** - Check if PHP files are formatted correctly (used in CI)

## Key Features

### Prettier Settings (Frontend)

- **Semi-colons**: Enabled (true)
- **Single quotes**: Enabled (true) for TS/TSX
- **Print width**: 100 characters (optimal for modern wide screens)
- **Tab width**: 4 spaces (aligns with standard Laravel formatting)
- **Trailing commas**: ES5 compatible

### ESLint Rules (Frontend)

**React/TSX:**

- Uses the official eslint-plugin-react Flat Config alongside TypeScript parsing.
- **No React import needed**: react/react-in-jsx-scope is disabled for React 17+.
- **Prop Types**: react/prop-types is disabled because we use **TypeScript Interfaces** for strict prop validation.
- **Apostrophes**: react/no-unescaped-entities is disabled to allow natural text writing.

**Code Quality & Laravel Compatibility:**

- **Ziggy Routes**: `route` is defined as a readonly global variable, preventing ESLint from throwing errors when using Laravel's route() helper in React.
- **Strict Ignores**: Completely ignores vendor/, storage/, public/, and bootstrap/cache/ to prevent scanning backend files.
- Warns on console.log (allows console.warn, console.info, and console.error).

### Laravel Pint (Backend)

- Built on top of PHP-CS-Fixer.
- Enforces the official Laravel coding style across all Models, Controllers, and Configurations.
- Automatically removes unused imports and fixes array syntax.

## VS Code Integration (Recommended)

This repository is pre-configured for VS Code. When you open the project, it will recommend the necessary extensions. For the best development experience, ensure these are installed:

1. **ESLint** (dbaeumer.vscode-eslint)
2. **Prettier** (esbenp.prettier-vscode)
3. **Laravel Pint** (open-southeners.laravel-pint)

The workspace .vscode/settings.json is already configured to format on save:

{
"editor.formatOnSave": true,
"editor.defaultFormatter": "esbenp.prettier-vscode",
"editor.codeActionsOnSave": {
"source.fixAll.eslint": "explicit"
},
"[php]": {
"editor.defaultFormatter": "open-southeners.laravel-pint"
}
}

## Pre-commit Hook (Already Configured)

This project uses Husky and lint-staged to guarantee code quality before every commit. You do not need to install this manually; it runs automatically after pnpm install.

**How it works (from package.json):**
"lint-staged": {
"resources/**/\*.{js,jsx,ts,tsx}": [
"eslint --fix",
"prettier --write"
],
"resources/**/_.{css,scss}": [
"prettier --write"
],
"\*\*/_.php": [
"./vendor/bin/pint"
]
}

## Best Practices

1. **Trust the automation**: Let your editor format on save. It saves time and prevents CI failures.
2. **Review auto-fixes**: While lint:fix is helpful, always double-check staged changes before pushing.
3. **Commit via Terminal if UI fails**: On Windows, the VS Code commit button can sometimes fail to trigger Husky due to path issues. If this happens, use `git commit -m "message"` in the terminal.

## Laravel / Inertia Specifics

When building React components for SIST:

- **Routing**: Use the global route('route.name') helper. TypeScript is configured to recognize it via Ziggy in `global.d.ts`.
- **Props**: Data passed from Laravel Controllers arrives as standard React props. Always type these using the PageProps interface defined in resources/js/types/global.d.ts.
- **No API Calls Needed**: Because we use Inertia.js, you generally do not need axios or fetch to get page data; Laravel injects it directly into your page components.
