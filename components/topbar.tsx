// components/map/topbar.tsx
'use client';

import React, { useEffect, useState } from 'react';
import { FontAwesomeIcon } from '@fortawesome/react-fontawesome';
import { faSun, faMoon, faBars } from '@fortawesome/free-solid-svg-icons';

interface TopbarProps {
  selectedDevice: string | null;
  onToggleSidebar: () => void;
}

export default function Topbar({ selectedDevice, onToggleSidebar }: TopbarProps) {
  const [isDarkMode, setIsDarkMode] = useState(true);

  useEffect(() => {
    const root = document.documentElement;
    if (root.classList.contains('light')) {
      setIsDarkMode(false);
    } else {
      setIsDarkMode(true);
      root.classList.add('dark');
    }
  }, []);

  const toggleTheme = () => {
    const root = document.documentElement;
    if (isDarkMode) {
      root.classList.remove('dark');
      root.classList.add('light');
      setIsDarkMode(false);
    } else {
      root.classList.remove('light');
      root.classList.add('dark');
      setIsDarkMode(true);
    }
  };

  return (
    <header className="h-14 border-b border-border bg-card/30 backdrop-blur px-4 md:px-6 flex items-center justify-between shrink-0">
      <div className="flex items-center gap-3">
        {/* Mobile Hamburger Menu Button */}
        <button
          onClick={onToggleSidebar}
          className="md:hidden h-8 w-8 flex items-center justify-center rounded-md border border-border bg-background text-foreground hover:bg-muted transition-colors cursor-pointer"
          title="Toggle Menu"
        >
          <FontAwesomeIcon icon={faBars} className="h-3.5 w-3.5" />
        </button>

        <div className="text-xs font-medium text-muted-foreground truncate max-w-[200px] sm:max-w-none">
          {selectedDevice ? (
            <span>ID: <strong className="text-foreground font-mono">{selectedDevice}</strong></span>
          ) : (
            <span>Select a terminal</span>
          )}
        </div>
      </div>

      {/* Theme Toggle Button */}
      <button
        onClick={toggleTheme}
        className="h-8 w-8 flex items-center justify-center rounded-md border border-border bg-background text-foreground hover:bg-muted transition-colors cursor-pointer shrink-0"
        title={isDarkMode ? "Switch to Light Mode" : "Switch to Dark Mode"}
      >
        <FontAwesomeIcon icon={isDarkMode ? faSun : faMoon} className="h-3.5 w-3.5" />
      </button>
    </header>
  );
}