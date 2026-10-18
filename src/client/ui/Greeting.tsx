import { useEffect, useState } from 'react';
import { greeting, periodOf } from '../../shared/i18n';
import { useApp } from '../lib/store';
import { useLang } from '../lib/i18n';

/**
 * Time-of-day greeting on the dashboards, from this device's clock. The
 * wording varies once a day, not on every render. The owner, when reading in
 * English, also sees a quiet French line, since the Comoros team works in French.
 */
export function useGreeting(name: string | null | undefined, seed: string): { main: string; second: string | null } {
  const lang = useLang();
  const { user } = useApp();
  const [now, setNow] = useState(() => new Date());
  useEffect(() => {
    // Re-check every 10 minutes so the greeting follows the time of day.
    const t = setInterval(() => {
      const d = new Date();
      setNow((prev) => (periodOf(prev.getHours()) !== periodOf(d.getHours()) || prev.getDate() !== d.getDate() ? d : prev));
    }, 10 * 60_000);
    return () => clearInterval(t);
  }, []);
  const main = greeting(lang, now, name, seed);
  const second = user?.role === 'owner' && lang === 'en' ? greeting('fr', now, name, seed) : null;
  return { main, second };
}

export function Greeting({ name, seed }: { name: string | null | undefined; seed: string }) {
  const { main, second } = useGreeting(name, seed);
  return (
    <div className="greeting">
      <h1 className="page-title" style={{ marginTop: 6 }}>
        {main}
      </h1>
      {second && (
        <div className="greeting-alt" lang="fr">
          {second}
        </div>
      )}
    </div>
  );
}
