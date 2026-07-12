import { createContext, useContext, useEffect, useState } from "react";
import type { ReactNode } from "react";
import { fetchDomainConfig } from "../api.js";
import type { DomainConfig } from "../lib/domainConfig.js";
import { NEUTRAL_DOMAIN_CONFIG } from "../lib/domainConfig.js";

export interface DomainConfigState {
  config: DomainConfig;
  /** False until the GET /api/domain fetch has settled (success or failure) - `config` is
   * `NEUTRAL_DOMAIN_CONFIG` until then. */
  loaded: boolean;
}

interface DomainConfigProviderProps {
  children: ReactNode;
}

/**
 * Fetches the active domain's scene-presentation model (`GET /api/domain`) once and provides it
 * to the whole app via context (issue #31 item 1) - components read it through `useDomainConfig()`
 * below instead of each re-fetching it themselves. Mount once near the app root (main.tsx).
 */
export function DomainConfigProvider({ children }: DomainConfigProviderProps) {
  const state = useDomainConfigFetch();
  return <DomainConfigContext.Provider value={state}>{children}</DomainConfigContext.Provider>;
}

/** Reads the domain config provided by `DomainConfigProvider`. Falls back to the neutral,
 * not-yet-loaded state if no provider is mounted above (defensive - never throws). */
export function useDomainConfig(): DomainConfigState {
  return useContext(DomainConfigContext);
}

function useDomainConfigFetch(): DomainConfigState {
  const [state, setState] = useState<DomainConfigState>({ config: NEUTRAL_DOMAIN_CONFIG, loaded: false });

  useEffect(() => {
    let cancelled = false;
    void (async () => {
      try {
        const config = await fetchDomainConfig();
        if (!cancelled) {
          setState({ config, loaded: true });
        }
      } catch {
        // Domain config is display-only (labels/categories/colors) - editing continues with the
        // neutral fallback (everything renders under "Other") rather than blocking the app.
        if (!cancelled) {
          setState({ config: NEUTRAL_DOMAIN_CONFIG, loaded: true });
        }
      }
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  return state;
}

const DomainConfigContext = createContext<DomainConfigState>({ config: NEUTRAL_DOMAIN_CONFIG, loaded: false });
