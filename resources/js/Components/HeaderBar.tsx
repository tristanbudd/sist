import { useState } from 'react';
import { FaSearch } from 'react-icons/fa';

export default function HeaderBar() {
    const [query, setQuery] = useState('');

    return (
        <header className="fixed top-0 left-0 right-0 z-50 p-4 flex items-start justify-between pointer-events-none">
            {/* Logo Block */}
            <div className="flex items-center gap-3 bg-zinc-950 border border-white/20 rounded-none px-4 py-3 shadow-2xl pointer-events-auto">
                <img src="/images/logo.png" alt="SIST Logo" className="h-7 w-auto" />
                <div className="flex flex-col justify-center leading-none">
                    <span className="text-white text-sm font-bold tracking-wider">SIST</span>
                    <span className="text-zinc-500 text-[9px] font-medium tracking-tight mt-0.5">
                        Ship Intelligence & Suspicion Tracker
                    </span>
                </div>
            </div>

            {/* Search Bar Block */}
            <div className="absolute left-1/2 -translate-x-1/2 flex items-center gap-3 bg-zinc-950 border border-white/20 rounded-none px-4 py-3 shadow-2xl w-full max-w-[400px] pointer-events-auto transition-all focus-within:border-white/40 focus-within:ring-1 focus-within:ring-white/10">
                <FaSearch
                    className={`w-4 h-4 transition-colors ${query ? 'text-white' : 'text-zinc-500'}`}
                />
                <input
                    type="text"
                    value={query}
                    onChange={(e) => setQuery(e.target.value)}
                    placeholder="Search vessels, ports, or coordinates..."
                    className="bg-transparent border-none outline-none text-white text-xs font-semibold w-full placeholder:text-zinc-500 focus:ring-0 tracking-wide"
                />
            </div>

            {/* Right side spacer for future controls */}
            <div className="w-16 hidden md:block" />
        </header>
    );
}
