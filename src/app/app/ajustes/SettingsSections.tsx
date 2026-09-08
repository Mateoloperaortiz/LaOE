"use client";

import { Children, isValidElement, type ReactNode, useEffect, useState } from "react";

/** Las anclas existentes siguen funcionando, también tras guardar o con atrás/adelante. */
export function SettingsSections({
  sections,
  label,
  initialSection,
  children,
}: {
  sections: { id: string; label: string }[];
  label: string;
  initialSection: string;
  children: ReactNode;
}) {
  const [active, setActive] = useState(initialSection);
  useEffect(() => {
    const sync = () => {
      const id = window.location.hash.slice(1);
      setActive(sections.some((section) => section.id === id) ? id : initialSection);
    };
    sync();
    window.addEventListener("hashchange", sync);
    window.addEventListener("popstate", sync);
    return () => {
      window.removeEventListener("hashchange", sync);
      window.removeEventListener("popstate", sync);
    };
  }, [initialSection, sections]);
  return (
    <div className="settings-layout">
      <nav aria-label={label} className="settings-navigation">
        {sections.map((section) => (
          <a
            key={section.id}
            href={`#${section.id}`}
            aria-current={active === section.id ? "location" : undefined}
            onClick={() => setActive(section.id)}
          >
            {section.label}
          </a>
        ))}
      </nav>
      <div className="min-w-0">
        {Children.map(children, (child) => {
          if (!isValidElement<{ id: string }>(child)) return null;
          return <div hidden={child.props.id !== active}>{child}</div>;
        })}
      </div>
    </div>
  );
}
