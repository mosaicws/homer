/**
 * This module provides a single-timer solution for managing automatic data updates
 * across all service components in Homer. Instead of each service component creating
 * its own setInterval timer, all components register with this centralized scheduler.
 *
 */

const TICK_INTERVAL_MS = 1000; // 1 second tick resolution
const MIN_INTERVAL_MS = TICK_INTERVAL_MS; // Minimum allowed update interval

class UpdateScheduler {
  constructor() {
    this.registeredComponents = new Map();
    this.globalTimer = null;
    this.tickCount = 0;
  }

  register(component, intervalMs, updateMethod) {
    if (!component || !updateMethod || intervalMs <= 0) {
      console.warn("UpdateScheduler: Invalid registration parameters");
      return;
    }

    if (intervalMs < MIN_INTERVAL_MS) {
      console.warn(
        `UpdateScheduler: Interval ${intervalMs}ms is below minimum. Adjusting to ${MIN_INTERVAL_MS}ms`,
      );
      intervalMs = MIN_INTERVAL_MS;
    }

    const intervalSeconds = Math.floor(intervalMs / 1000);
    const componentId = this.generateComponentId(component);

    if (!componentId) {
      console.error(`UpdateScheduler: invalid component id`);
      return;
    }

    this.registeredComponents.set(componentId, {
      component,
      interval: intervalSeconds,
      method: updateMethod,
      // Baseline against the live tick counter (monotonic across pause/resume),
      // so the first scheduled update lands a full interval after registration.
      lastUpdate: this.tickCount,
    });

    this.startGlobalTimer();
    console.log(
      `UpdateScheduler: Registered component with ${intervalSeconds}s interval`,
    );
  }

  unregister(component) {
    const componentId = this.generateComponentId(component);
    const removed = this.registeredComponents.delete(componentId);

    if (removed) {
      console.log("UpdateScheduler: Unregistered component");
    }

    if (this.registeredComponents.size === 0) {
      this.stopGlobalTimer();
    }
  }

  generateComponentId(component) {
    // Use component's unique identifier or Vue instance uid
    return component._uid || component.$.uid
  }

  startGlobalTimer() {
    if (!this.globalTimer) {
      // NOTE: tickCount is intentionally NOT reset here. It must stay monotonic
      // across stop/start (e.g. tab hide/show) so registered components'
      // `lastUpdate` baselines remain valid. Resetting it stranded components
      // with a large `lastUpdate` against a counter restarting from 0, freezing
      // cards for as long as the tab had previously been open. (Local divergence
      // from upstream — see UPGRADE_NOTES.md.)
      this.globalTimer = setInterval(() => {
        this.tickCount++;
        this.processUpdates();
      }, TICK_INTERVAL_MS);

      console.log("UpdateScheduler: Global timer started");
    }
  }

  stopGlobalTimer() {
    if (this.globalTimer) {
      clearInterval(this.globalTimer);
      this.globalTimer = null;
      // tickCount is preserved (see startGlobalTimer) so it stays monotonic.
      console.log("UpdateScheduler: Global timer stopped");
    }
  }

  processUpdates() {
    for (const [, config] of this.registeredComponents) {
      try {
        if (this.tickCount - config.lastUpdate >= config.interval) {
          config.method.call(config.component);
          config.lastUpdate = this.tickCount;
        }
      } catch (error) {
        console.error("UpdateScheduler: Error during component update:", error);
      }
    }
  }

  // Run every registered component's update method now and re-baseline it.
  // Used when the tab becomes visible again so cards refresh immediately
  // instead of waiting up to a full interval for the next scheduled tick.
  triggerImmediateUpdate() {
    for (const [, config] of this.registeredComponents) {
      try {
        config.method.call(config.component);
        config.lastUpdate = this.tickCount;
      } catch (error) {
        console.error("UpdateScheduler: Error during component update:", error);
      }
    }
  }
}

// Create and export global singleton instance
const updateScheduler = new UpdateScheduler();

// Pause updates when tab is hidden (power saving)
if (typeof document !== "undefined") {
  document.addEventListener("visibilitychange", () => {
    if (document.hidden) {
      updateScheduler.stopGlobalTimer();
    } else if (updateScheduler.registeredComponents.size > 0) {
      updateScheduler.startGlobalTimer();
      // Refresh immediately on return so cards aren't stale while we wait for
      // the next scheduled tick.
      updateScheduler.triggerImmediateUpdate();
    }
  });
}

export default updateScheduler;
