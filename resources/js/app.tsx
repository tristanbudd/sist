import '../css/app.css';
import './bootstrap';

import { createInertiaApp } from '@inertiajs/react';
import { createRoot } from 'react-dom/client';

const appName = import.meta.env.VITE_APP_NAME || 'SIST';

const pages = import.meta.glob('./Pages/**/*.tsx', { eager: true });

createInertiaApp({
    title: (title) => `${appName} | ${title}`,

    resolve: (name) => {
        const page = pages[`./Pages/${name}.tsx`];
        if (!page) console.error(`Page Not Found | No page component found for: ${name}`);
        return page;
    },

    setup({ el, App, props }) {
        const root = createRoot(el);
        root.render(<App {...props} />);
    },

    progress: {
        color: '#0a0a0a',
    },
});
