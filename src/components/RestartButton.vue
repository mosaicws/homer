<template>
  <i
    v-if="canRestart"
    class="restart-control fas"
    :class="[restartIconClass, restartState]"
    :title="restartTitle"
    @click.stop.prevent="askRestart"
    @touchstart.stop.prevent="askRestart"
  ></i>
  <Teleport to="body">
    <div
      v-if="showRestartConfirm"
      class="rb-overlay"
      @click.stop="cancelRestart"
    >
      <div class="rb-dialog" @click.stop>
        <p class="rb-title">Restart {{ itemName }}?</p>
        <p class="rb-message">
          This reboots the LXC container for “{{ itemName }}”. The service will
          be briefly unavailable while it restarts.
        </p>
        <div class="rb-actions">
          <button class="rb-btn rb-restart" @click.stop="doRestart">
            Restart
          </button>
          <button class="rb-btn rb-cancel" @click.stop="cancelRestart">
            Cancel
          </button>
        </div>
      </div>
    </div>
  </Teleport>
</template>

<script>
export default {
  name: "RestartButton",
  props: {
    itemName: {
      type: String,
      required: true,
    },
  },
  inject: {
    // Provided by App.vue: { enabled, services }. Default keeps the component
    // inert (no button) if used without the provider.
    restartControls: {
      default: () => () => ({ enabled: false, services: [] }),
    },
  },
  data: function () {
    return {
      showRestartConfirm: false,
      restartState: "idle", // idle | working | done | error
    };
  },
  computed: {
    canRestart: function () {
      const rc = this.restartControls();
      return !!(
        rc &&
        rc.enabled &&
        Array.isArray(rc.services) &&
        rc.services.includes(this.itemName)
      );
    },
    restartIconClass: function () {
      switch (this.restartState) {
        case "working":
          return "fa-spinner fa-spin";
        case "done":
          return "fa-check";
        case "error":
          return "fa-xmark";
        default:
          return "fa-arrows-rotate";
      }
    },
    restartTitle: function () {
      switch (this.restartState) {
        case "working":
          return `Restarting ${this.itemName}…`;
        case "done":
          return `${this.itemName} restart triggered`;
        case "error":
          return `Failed to restart ${this.itemName}`;
        default:
          return `Restart ${this.itemName}`;
      }
    },
  },
  methods: {
    askRestart: function () {
      if (this.restartState === "working") return;
      this.showRestartConfirm = true;
    },
    cancelRestart: function () {
      this.showRestartConfirm = false;
    },
    doRestart: async function () {
      this.showRestartConfirm = false;
      this.restartState = "working";
      try {
        const response = await fetch("api/proxmox/restart", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ service: this.itemName }),
        });
        if (!response.ok) {
          throw new Error(`HTTP ${response.status}`);
        }
        this.restartState = "done";
        setTimeout(() => {
          if (this.restartState === "done") this.restartState = "idle";
        }, 3000);
      } catch (e) {
        console.error(`Restart failed for ${this.itemName}:`, e);
        this.restartState = "error";
        setTimeout(() => {
          if (this.restartState === "error") this.restartState = "idle";
        }, 4000);
      }
    },
  },
};
</script>

<style scoped lang="scss">
/* Mirrors the Pi-hole pause button (.control-icon): orange, bordered, rounded,
   inline next to the service name. */
.restart-control {
  margin-left: 0.6em;
  font-size: 0.6em;
  cursor: pointer;
  opacity: 0.7;
  transition: opacity 0.2s ease, transform 0.1s ease, border-color 0.2s ease,
    color 0.2s ease;
  vertical-align: middle;
  position: relative;
  top: -0.1em;
  z-index: 9999;
  pointer-events: all;
  border: 1.5px solid;
  border-radius: 0.3em;
  display: inline-flex;
  align-items: center;
  justify-content: center;
  width: 1.8em;
  height: 1.8em;
  color: #f39c12;
  border-color: rgba(243, 156, 18, 0.4);

  &:hover {
    opacity: 1;
    border-color: rgba(243, 156, 18, 0.7);
  }

  &:active {
    transform: scale(0.92);
  }

  &.done {
    opacity: 1;
    color: #4caf50;
    border-color: rgba(76, 175, 80, 0.6);
  }

  &.error {
    opacity: 1;
    color: #e74c3c;
    border-color: rgba(231, 76, 60, 0.6);
  }
}
</style>

<style>
/* Non-scoped styles for the teleported confirmation dialog. Uniquely prefixed
   (rb-) so they never collide with the shared .confirm-* dialogs, and using
   explicit opaque colours (not theme vars) since the dialog is teleported to
   <body>, outside the #app element where the theme variables are defined. */
.rb-overlay {
  position: fixed;
  inset: 0;
  background-color: rgba(0, 0, 0, 0.6);
  display: flex;
  align-items: center;
  justify-content: center;
  z-index: 10000;
}

.rb-dialog {
  background-color: #ffffff;
  border-radius: 0.5em;
  padding: 1.5em;
  max-width: 400px;
  box-shadow: 0 4px 20px rgba(0, 0, 0, 0.4);
}

.rb-title {
  font-size: 1.2em;
  font-weight: 600;
  margin-bottom: 0.5em;
  color: #1a1a1a;
}

.rb-message {
  margin-bottom: 1.5em;
  color: #333333;
  word-break: break-word;
}

.rb-actions {
  display: flex;
  gap: 0.5em;
  justify-content: flex-end;
}

.rb-btn {
  padding: 0.5em 1em;
  border: none;
  border-radius: 0.3em;
  cursor: pointer;
  font-weight: 600;
  transition: opacity 0.2s ease, transform 0.1s ease;
}

.rb-btn:hover {
  opacity: 0.9;
}

.rb-btn:active {
  transform: scale(0.95);
}

.rb-restart {
  background-color: #f39c12;
  color: #ffffff;
}

.rb-cancel {
  background-color: #888888;
  color: #ffffff;
}
</style>
