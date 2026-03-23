# CI/CD Setup (SIST)

This project uses Husky for pre-commit checks and GitHub Actions for continuous integration. Because SIST is a full-stack application (Laravel Backend + React Frontend), our pipeline runs parallel checks for both PHP and JavaScript environments.

## Pre-commit Hooks (Husky)

Husky is configured to automatically run checks before each commit to ensure code quality across both the frontend and backend.

### What runs on pre-commit:

- **ESLint** - Auto-fixes linting issues on staged React/JS files (resources/js/\*).
- **Prettier** - Auto-formats staged JS, JSX, and CSS files.
- **Laravel Pint** - Auto-formats staged PHP files to adhere to Laravel standards.

### How it works:

1. You stage files with `git add .`
2. You commit with `git commit`
3. Husky triggers `lint-staged`
4. Only staged files are checked and auto-fixed
5. If checks pass, the commit proceeds
6. If checks fail (e.g., a syntax error that cannot be auto-fixed), the commit is blocked.

### Configuration:

- **.husky/pre-commit** - Triggers `pnpm exec lint-staged`.
- **package.json -> lint-staged** - Defines which linters run on which file extensions.
- **eslint.config.js** - ESLint Flat Config rules for React.

### Bypassing pre-commit (Not Recommended):

git commit --no-verify

---

## GitHub Actions CI

Continuous Integration runs on every push to `main` and on all pull requests. It splits into two parallel jobs to maximize speed.

### CI Pipeline (.github/workflows/ci.yml):

#### Job 1: Frontend (Node.js)

1. **Checkout code** - Gets the repository code.
2. **Setup pnpm** - Installs the pnpm package manager (v9).
3. **Setup Node.js** - Installs Node.js 20 with the pnpm cache.
4. **Install dependencies** - Runs `pnpm install --frozen-lockfile`.
5. **Run ESLint** - Checks for React/JS linting errors.
6. **Check formatting** - Verifies Prettier formatting.
7. **Build Vite Assets** - Creates the production build of the React app.

#### Job 2: Backend (PHP)

1. **Checkout code** - Gets the repository code.
2. **Setup PHP** - Installs PHP 8.5 with required extensions (SQLite, PDO, etc.).
3. **Install Composer Dependencies** - Installs Laravel vendor packages.
4. **Prepare Application** - Copies `.env.example` and generates an app key.
5. **Format Check** - Runs `./vendor/bin/pint --test` (Fails if PHP is poorly formatted).
6. **Run Tests** - Executes PHPUnit/Pest tests using an in-memory SQLite database.

### Viewing CI Results:

- Go to the "Actions" tab in your GitHub repository.
- Click on any workflow run to see details.
- Failed checks will block PR merges (if branch protection is enabled).

---

## VS Code Integration & Auto-Formatting

This repository is pre-configured with workspace settings to ensure a seamless developer experience.

When opening this project in VS Code, you will be prompted to install the recommended extensions (ESLint, Prettier, Laravel Pint). Once installed, the workspace `.vscode/settings.json` enforces **Format on Save** and **Auto-Fix on Save** globally:

- **React/JS/CSS:** Handled automatically by Prettier & ESLint.
- **PHP:** Handled automatically by Laravel Pint.

You should rarely, if ever, have formatting issues block a commit if these extensions are active.

---

## Available Scripts

### Frontend (React / Vite)

pnpm dev # Start the Vite development server (HMR)
pnpm build # Build React assets for production
pnpm lint # Check for linting errors in resources/js
pnpm lint:fix # Auto-fix linting errors
pnpm format # Format all JS/CSS files with Prettier
pnpm format:check # Check if JS/CSS files are formatted

### Backend (Laravel / PHP)

php artisan serve # Start the PHP development server
php artisan test # Run backend test suite
pnpm format:php # Format all PHP files using Laravel Pint
./vendor/bin/pint # Direct access to Laravel Pint binary

---

## Setup for New Contributors

When cloning the repository for the first time, run these commands to set up the dual environment:

1. Install PHP dependencies:
   composer install

2. Set up the environment file:
   cp .env.example .env
   php artisan key:generate

3. Create the local SQLite database and migrate:
   touch database/database.sqlite
   php artisan migrate

4. Install Node dependencies (This automatically sets up Husky):
   pnpm install

5. Start the development servers (Requires two terminal tabs):
   php artisan serve
   pnpm dev

---

## Troubleshooting

### Pre-commit hook not running:

If Husky didn't initialize properly upon cloning, manually wire it up:
pnpm exec husky init

### Husky failing silently (Code 1) on Windows:

If Git Bash crashes instantly when trying to commit, it is likely the Windows CRLF bug.

1. Open `.husky/pre-commit` in VS Code.
2. Look at the bottom right corner of the window. Change **CRLF** to **LF**.
3. Save the file and try your commit again.

### VS Code commit button failing:

If the visual Git UI in VS Code fails silently, it is likely due to missing environment variables for `pnpm`. Use the terminal instead:
git commit -m "your message here"

### Lint-staged failing with hidden errors:

To see exactly what file is breaking the commit:
pnpm exec lint-staged

### CI failing but local checks pass:

- Ensure your `pnpm-lock.yaml` and `composer.lock` are committed.
- Verify you are running PHP 8.5 and Node 20 locally.
