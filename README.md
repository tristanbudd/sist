# SIST (Ship Intelligence & Suspicion Tracker)

![](https://img.shields.io/github/stars/tristanbudd/sist.svg)
![](https://img.shields.io/github/watchers/tristanbudd/sist.svg)
![](https://img.shields.io/github/license/tristanbudd/sist.svg)

![](https://img.shields.io/github/issues-raw/tristanbudd/sist.svg)
![](https://img.shields.io/github/issues-closed-raw/tristanbudd/sist.svg)
![](https://img.shields.io/github/issues-pr-raw/tristanbudd/sist.svg)
![](https://img.shields.io/github/issues-pr-closed-raw/tristanbudd/sist.svg)

SIST (Ship Intelligence & Suspicion Tracker) - A modern AIS monitoring and analysis platform designed to detect suspicious vessel activity, anomalies, and patterns in maritime data.

---

## Project Description

SIST provides a powerful interface for tracking, analysing, and flagging vessel behaviour using AIS (Automatic Identification System) data.

The platform is built with a Laravel backend and a React + Inertia.js frontend, offering a fast, responsive, and scalable architecture for real-time maritime intelligence.

It aims to support:
- Monitoring vessel movement and behaviour.
- Detecting anomalies and suspicious activity.
- Visualising maritime data in a clear, actionable way.
- Providing a foundation for further intelligence tooling.

---

## Features
[TO BE COMPLETED]

---

## Preview

[TO BE COMPLETED]

---

## Tech Stack

- **Backend:** Laravel (PHP ≥ 8.3)
- **Frontend:** React 18 + Inertia.js
- **Build Tooling:** Vite
- **Styling:** Tailwind CSS
- **Linting & Formatting:** ESLint, Prettier, Laravel Pint
- **Git Hooks:** Husky + lint-staged

---

## Installation & Setup

### 1. Clone the repository
```bash
git clone https://github.com/tristanbudd/sist.git
cd sist
```
### 2. Install dependencies

#### PHP dependencies
```bash
composer install
```
#### Node dependencies (pnpm)
```bash
pnpm install
```
### 3. Environment setup
```bash
cp .env.example .env

Update your .env file:

APP_NAME=SIST
APP_ENV=local

DB_CONNECTION=mysql
DB_HOST=127.0.0.1
DB_PORT=3306
DB_DATABASE=sist
DB_USERNAME=root
DB_PASSWORD=
```

### 4. Generate app key
```bash
php artisan key:generate
```
### 5. Run migrations
```bash
php artisan migrate
```
### 6. Start development servers

# Laravel backend
```bash
php artisan serve
```

# Frontend (Vite)
```bash
pnpm dev
```
---

## Scripts
```bash
pnpm dev             # Start Vite dev server
pnpm build           # Build frontend assets

pnpm lint            # Run ESLint
pnpm lint:fix        # Fix lint issues

pnpm format          # Format frontend files
pnpm format:check    # Check formatting

pnpm format:php      # Format PHP (Laravel Pint)
pnpm format:php:test # Check PHP formatting
```
---

## Development Notes

- Uses modern Laravel + Inertia architecture (SPA without full API separation)
- Frontend is located in resources/js
- Tailwind CSS is configured via Vite
- Husky + lint-staged enforce code quality on commits

---

## Contributing

Contributions are welcome.

1. Fork the repository
2. Create a feature branch
3. Commit your changes
4. Ensure linting and formatting pass
5. Open a pull request

Please read [CONTRIBUTING.md](https://github.com/tristanbudd/sist/blob/main/CONTRIBUTING.md) for more details.

---

## Security

If you discover a vulnerability, please open a private issue or follow [SECURITY.md](https://github.com/tristanbudd/sist/blob/main/SECURITY.md).

---

## License

[MIT](LICENSE)
