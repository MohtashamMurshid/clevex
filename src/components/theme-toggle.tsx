"use client";

import { useEffect } from "react";
import { Monitor, Moon, Sun } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Tooltip, TooltipPopup, TooltipTrigger } from "@/components/ui/tooltip";
import { updateSettings, useSettings, watchSystemTheme } from "@/lib/settings";

const ORDER = ["system", "light", "dark"] as const;

export function ThemeToggle() {
  const { theme } = useSettings();
  useEffect(() => watchSystemTheme(), []);
  const Icon = theme === "light" ? Sun : theme === "dark" ? Moon : Monitor;
  const next = ORDER[(ORDER.indexOf(theme) + 1) % ORDER.length];
  return (
    <Tooltip>
      <TooltipTrigger
        render={
          <Button variant="ghost" size="icon-sm" aria-label="Change theme" onClick={() => updateSettings({ theme: next })} />
        }
      >
        <Icon />
      </TooltipTrigger>
      <TooltipPopup>Theme: {theme}</TooltipPopup>
    </Tooltip>
  );
}
