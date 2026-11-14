"use client";

import { useServerInsertedHTML } from "next/navigation";
import { useRef } from "react";

export function ThemeScript() {
  const isInserted = useRef(false);

  useServerInsertedHTML(() => {
    if (isInserted.current) return null;
    isInserted.current = true;
    return (
      <script
        dangerouslySetInnerHTML={{
          __html: `(function(){try{var t=localStorage.getItem('crewlane-theme');var d=window.matchMedia('(prefers-color-scheme: dark)').matches;if(t==='dark'||(!t&&d)){document.documentElement.classList.add('dark');}else{document.documentElement.classList.remove('dark');}}catch(e){}})();`,
        }}
      />
    );
  });

  return null;
}
