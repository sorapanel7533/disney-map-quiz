// ==UserScript==
// @name         Owned Site Agreement Loop Runner
// @namespace    local-owned-site-tests
// @version      1.0.0
// @description  Runs an agreement/start loop on an owned or authorized test site.
// @match        https://your-owned-site.example/*
// @grant        GM_registerMenuCommand
// @grant        GM_setValue
// @grant        GM_getValue
// @run-at       document-idle
// ==/UserScript==

(function () {
  "use strict";

  const CONFIG = {
    ownershipAcknowledged: false,
    blockedHosts: new Set(["jr-central.co.jp", "www.jr-central.co.jp"]),
    selectors: {
      agree: "text=Agree",
      start: "text=Start lottery",
      result: "[data-testid='lottery-result']"
    },
    iterations: 10,
    timeoutMs: 15000,
    delayMsBetweenIterations: 1000,
    waitAfterStartMs: 1000,
    clearSiteDataBetweenIterations: true
  };

  const STATE_KEY = "ownedSiteLoopRunnerState";

  function getState() {
    return GM_getValue(STATE_KEY, {
      active: false,
      iteration: 0
    });
  }

  function setState(nextState) {
    GM_setValue(STATE_KEY, nextState);
  }

  function sleep(ms) {
    return new Promise((resolve) => setTimeout(resolve, ms));
  }

  function isVisible(element) {
    if (!element) {
      return false;
    }
    const style = window.getComputedStyle(element);
    const rect = element.getBoundingClientRect();
    return style.visibility !== "hidden" && style.display !== "none" && rect.width > 0 && rect.height > 0;
  }

  function findBySelector(selector) {
    if (selector.startsWith("text=")) {
      const needle = selector.slice(5).trim();
      const candidates = Array.from(document.querySelectorAll("button, a, input, label, [role='button'], [data-testid], [onclick]"));
      return candidates.find((element) => {
        const text = element.innerText || element.value || element.getAttribute("aria-label") || "";
        return isVisible(element) && text.includes(needle);
      }) || null;
    }

    return document.querySelector(selector);
  }

  async function waitForSelector(selector, timeoutMs) {
    const deadline = Date.now() + timeoutMs;
    while (Date.now() < deadline) {
      const element = findBySelector(selector);
      if (isVisible(element)) {
        return element;
      }
      await sleep(200);
    }
    throw new Error(`Timed out waiting for selector: ${selector}`);
  }

  async function clickSelector(selector, label) {
    const element = await waitForSelector(selector, CONFIG.timeoutMs);
    element.scrollIntoView({ block: "center", inline: "center" });
    element.click();
    console.log(`[Owned Site Loop] Clicked ${label}: ${selector}`);
  }

  async function clearIndexedDb() {
    if (!window.indexedDB || !indexedDB.databases) {
      return;
    }

    const databases = await indexedDB.databases();
    await Promise.all(
      databases
        .filter((database) => database.name)
        .map((database) => new Promise((resolve) => {
          const request = indexedDB.deleteDatabase(database.name);
          request.onsuccess = resolve;
          request.onerror = resolve;
          request.onblocked = resolve;
        }))
    );
  }

  async function clearSiteData() {
    document.cookie.split(";").forEach((cookie) => {
      const name = cookie.split("=")[0].trim();
      if (!name) {
        return;
      }
      document.cookie = `${name}=; expires=Thu, 01 Jan 1970 00:00:00 GMT; path=/`;
      document.cookie = `${name}=; expires=Thu, 01 Jan 1970 00:00:00 GMT; path=/; domain=${location.hostname}`;
    });

    localStorage.clear();
    sessionStorage.clear();

    if (window.caches) {
      const keys = await caches.keys();
      await Promise.all(keys.map((key) => caches.delete(key)));
    }

    await clearIndexedDb();
    console.log("[Owned Site Loop] Cleared page storage, cookies, Cache API, and IndexedDB.");
  }

  function stopLoop(reason) {
    setState({ active: false, iteration: 0 });
    console.log(`[Owned Site Loop] Stopped. ${reason || ""}`.trim());
  }

  async function run() {
    const state = getState();
    if (!state.active) {
      return;
    }

    if (!CONFIG.ownershipAcknowledged) {
      stopLoop("Set CONFIG.ownershipAcknowledged to true only for your owned or authorized test site.");
      return;
    }

    if (CONFIG.blockedHosts.has(location.hostname)) {
      stopLoop(`Refusing to run on blocked external campaign host: ${location.hostname}`);
      return;
    }

    const iteration = state.iteration + 1;
    if (iteration > CONFIG.iterations) {
      stopLoop("Completed all iterations.");
      return;
    }

    setState({ active: true, iteration });
    console.log(`[Owned Site Loop] Iteration ${iteration}/${CONFIG.iterations}`);

    try {
      await clickSelector(CONFIG.selectors.agree, "agreement");
      await clickSelector(CONFIG.selectors.start, "start");

      if (CONFIG.selectors.result) {
        const result = await waitForSelector(CONFIG.selectors.result, CONFIG.timeoutMs);
        console.log(`[Owned Site Loop] Result: ${(result.innerText || result.value || "(visible)").trim()}`);
      }

      if (CONFIG.waitAfterStartMs > 0) {
        await sleep(CONFIG.waitAfterStartMs);
      }

      if (CONFIG.clearSiteDataBetweenIterations) {
        await clearSiteData();
      }

      if (iteration >= CONFIG.iterations) {
        stopLoop("Completed all iterations.");
        return;
      }

      await sleep(CONFIG.delayMsBetweenIterations);
      location.reload();
    } catch (error) {
      stopLoop(error.message);
    }
  }

  GM_registerMenuCommand("Start owned-site loop", () => {
    setState({ active: true, iteration: 0 });
    location.reload();
  });

  GM_registerMenuCommand("Stop owned-site loop", () => {
    stopLoop("Stopped by user.");
  });

  run();
})();
