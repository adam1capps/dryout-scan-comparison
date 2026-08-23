import { useEffect, useState } from "react";

/**
 * Notices when a newer build has been deployed than the one this tab is running.
 *
 * A deploy replaces the files on the server, but an open tab keeps executing the
 * JavaScript it loaded — potentially for hours, across edits. That is how a bug
 * fixed and deployed can still be crashing the page in front of someone: they
 * are not running the fix. The report is edited over long sessions, so this is
 * routine rather than an edge case.
 *
 * Detection compares the hashed bundle filename in the served index.html with
 * the one this tab loaded. Vite renames the bundle on every content change, so
 * a different name means different code.
 */
export function useDeployVersion() {
  const [stale, setStale] = useState(false);

  useEffect(() => {
    // The <script type="module"> Vite injects, i.e. the bundle we are running.
    const running = document
      .querySelector('script[type="module"][src*="/_app/"]')
      ?.getAttribute("src");
    // In dev there is no hashed bundle, so there is nothing to compare.
    if (!running) return undefined;

    let cancelled = false;

    const check = async () => {
      if (cancelled || document.hidden) return;
      try {
        // cache: "no-store" so this asks the server rather than the tab's cache,
        // which is the very thing being tested for.
        const res = await fetch("/", { cache: "no-store" });
        if (!res.ok) return;
        const html = await res.text();
        const deployed = html.match(/\/_app\/[A-Za-z0-9_-]+\.js/)?.[0];
        if (deployed && deployed !== running && !cancelled) setStale(true);
      } catch {
        // Offline or a blip. Staleness is not urgent enough to report a failure.
      }
    };

    // On returning to the tab is when it matters most — that is the moment
    // someone resumes work on possibly-old code.
    const onVisible = () => {
      if (!document.hidden) check();
    };
    document.addEventListener("visibilitychange", onVisible);
    const timer = setInterval(check, 5 * 60 * 1000);
    check();

    return () => {
      cancelled = true;
      clearInterval(timer);
      clearTimeout(timer);
      document.removeEventListener("visibilitychange", onVisible);
    };
  }, []);

  return stale;
}
