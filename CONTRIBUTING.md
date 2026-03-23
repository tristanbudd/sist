# Contributing to SIST (Ship Information & Surveillance Tracker)

First off, thanks for taking the time to contribute! Whether you are fixing a bug in the AIS ingestion engine or improving the React map interface, we appreciate the help.

## Development Environment Setup

SIST is a full-stack application. You will need both PHP 8.2+ and Node.js 20+ installed.

1. **Fork and Clone** the repository:
   git clone https://github.com/your-username/SIST.git
   cd SIST

2. **Backend Setup (Laravel):**
   composer install
   cp .env.example .env
   php artisan key:generate
   touch database/database.sqlite
   php artisan migrate

3. **Frontend Setup (React/Vite):**
   pnpm install

4. **Start Development Servers:**

    # Terminal 1

    php artisan serve

    # Terminal 2

    pnpm dev

## Workflow

1. **Create a Feature Branch:**
   git checkout -b feat/your-descriptive-feature-name

2. **Make Your Changes:**
    - Keep Laravel logic in `app/` and `routes/`.
    - Keep React components and frontend logic in `resources/js/`.
    - Follow existing patterns (Inertia.js for data bridge, Tailwind for styling).

3. **Run Local Checks:**
   Before committing, ensure everything is green:

    # Check Frontend (ESLint & Prettier)

    pnpm lint
    pnpm format:check

    # Check Backend (Laravel Pint & Tests)

    pnpm format:php:test
    php artisan test

4. **Commit Your Changes:**
   We use Husky for pre-commit hooks. If you are on Windows and the commit fails with "Code 1", ensure your `.husky/pre-commit` file uses **LF** line endings.

    git add .
    git commit -m "feat: adds real-time vessel filtering"

5. **Open a Pull Request:**
   Target the `main` branch. Provide a clear description of the changes and link any relevant issues.

## Guidelines & Best Practices

### Frontend (React)

- **Use the `route()` helper:** We use Ziggy for routing. Do not hardcode URLs; use `route('ships.index')`.
- **Formatting:** Prettier is enforced. Ensure "Format on Save" is enabled in VS Code.
- **Components:** Leverage the existing Layouts and shared components in `resources/js/Components`.

### Backend (Laravel)

- **Formatting:** Laravel Pint is used for PHP. Run `pnpm format:php` to fix styling automatically.
- **Type Hinting:** Use PHP 8.2+ type hints for method arguments and return types.
- **Migrations:** Ensure all database changes have a corresponding migration.

### Database Precision

- When dealing with AIS coordinates, always use `decimal(10, 7)` to ensure map accuracy.

## Code of Conduct

This project follows our [CODE_OF_CONDUCT.md](./CODE_OF_CONDUCT.md). Please be respectful and constructive in all communications.

## Troubleshooting

- **Vite Manifest Error:** If CI fails with "Vite manifest not found", ensure your tests extend `Tests\TestCase`, which handles `$this->withoutVite()`.
- **Husky Errors:** If you cannot commit due to Husky errors on Windows, use the terminal instead of the VS Code Git UI, or use `git commit --no-verify` as a last resort (but ensure CI passes!).
