<template>
  <Generic :item="displayItem">
    <template #indicator>
      <div class="notifs">
        <strong v-if="activity > 0" class="notif activity" title="Activity">
          {{ activity }}
        </strong>
        <strong v-if="missing > 0" class="notif missing" title="Missing">
          {{ missing }}
        </strong>
        <strong v-if="warnings > 0" class="notif warnings" title="Warning">
          {{ warnings }}
        </strong>
        <strong v-if="errors > 0" class="notif errors" title="Error">
          {{ errors }}
        </strong>
        <strong
          v-if="serverError"
          class="notif errors"
          title="Connection error to Radarr API, check url and apikey in config.yml"
          >?</strong
        >
      </div>
    </template>
    <template #content>
      <p class="title is-4">{{ item.name }}</p>
      <template v-if="activity > 0 && currentQueue">
        <p class="subtitle is-6 queue-movie">
          {{ currentQueue.movieTitle }}
        </p>
        <p class="subtitle is-6 queue-details">
          {{ currentQueue.quality }} • {{ currentQueue.size }}
        </p>
        <p class="subtitle is-6 queue-client">
          <span>{{ currentQueue.status }}</span>
          <span v-if="currentQueue.timeleft" class="queue-eta">
            • ETA: {{ currentQueue.timeleft }}
          </span>
        </p>
      </template>
      <template v-else-if="item.subtitle && !serverError">
        <p class="subtitle">
          {{ item.subtitle }}
        </p>
      </template>
      <template v-else-if="serverError">
        <p class="subtitle is-6">
          <span class="error">Connection error</span>
        </p>
      </template>
      <template v-else>
        <p class="subtitle is-6">
          <span class="idle">No active queue items</span>
        </p>
      </template>
    </template>
  </Generic>
</template>

<script>
import service from "@/mixins/service.js";

const V3_API = "/api/v3";
const LEGACY_API = "/api";

export default {
  name: "Radarr",
  mixins: [service],
  props: {
    item: Object,
  },
  data: () => {
    return {
      activity: null,
      missing: null,
      warnings: null,
      errors: null,
      serverError: false,
      queueData: null,
    };
  },
  computed: {
    apiPath() {
      return this.item.legacyApi ? LEGACY_API : V3_API;
    },
    currentQueue() {
      if (!this.queueData || !this.queueData.records || this.queueData.records.length === 0) {
        return null;
      }
      // Get the first item in the queue
      const queue = this.queueData.records[0];
      const movie = queue.movie || {};
      const size = queue.size || 0;
      const downloadClient = queue.downloadClient || "Unknown client";
      const status = queue.status || "Processing";
      const quality = queue.quality?.quality?.name || "Unknown quality";

      // Format movie title with year
      const movieTitle = movie.title
        ? `${movie.title}${movie.year ? ` (${movie.year})` : ''}`
        : queue.title || "Unknown Movie";

      // Format status message
      let statusMessage = "";
      if (status.toLowerCase().includes('download')) {
        statusMessage = `Downloading via ${downloadClient}`;
      } else if (status.toLowerCase().includes('import')) {
        statusMessage = "Importing...";
      } else {
        statusMessage = status;
      }

      return {
        movieTitle: movieTitle,
        status: statusMessage,
        quality: quality,
        size: this.formatSize(size),
        timeleft: queue.timeleft || queue.estimatedCompletionTime ? this.formatTime(queue.timeleft || queue.estimatedCompletionTime) : null,
      };
    },
    displayItem() {
      // Remove tag from DOM when queue is active
      if (this.activity > 0 && this.currentQueue) {
        const { tag, tagstyle, ...itemWithoutTag } = this.item;
        return itemWithoutTag;
      }
      return this.item;
    },
  },
  created: function () {
    const checkInterval = parseInt(this.item.checkInterval, 10) || 0;
    if (checkInterval > 0) {
      setInterval(() => this.fetchConfig(), checkInterval);
    }

    this.fetchConfig();
  },
  methods: {
    fetchConfig: function () {
      const handleError = (e) => {
        console.error(e);
        this.serverError = true;
      };
      this.fetch(`${this.apiPath}/health?apikey=${this.item.apikey}`)
        .then((health) => {
          this.warnings = 0;
          this.errors = 0;
          for (var i = 0; i < health.length; i++) {
            if (health[i].type == "warning") {
              this.warnings++;
            } else if (health[i].type == "error") {
              this.errors++;
            }
          }
        })
        .catch(handleError);
      if (!this.item.legacyApi) {
        this.fetch(`${this.apiPath}/queue/details?apikey=${this.item.apikey}`)
          .then((queue) => {
            for (var i = 0; i < queue.length; i++) {
              if (queue[i].trackedDownloadStatus == "warning") {
                this.warnings++;
              } else if (queue[i].trackedDownloadStaus == "error") {
                this.errors++;
              }
            }
          })
          .catch(handleError);
      }
      this.fetch(`${this.apiPath}/queue?apikey=${this.item.apikey}`)
        .then((queue) => {
          this.activity = 0;
          this.queueData = queue;

          if (this.item.legacyApi) {
            for (var i = 0; i < queue.length; i++) {
              if (queue[i].movie) {
                this.activity++;
              }
            }
          } else {
            this.activity = queue.totalRecords;
          }
        })
        .catch(handleError);
      if (!this.item.legacyApi) {
        this.fetch(
          `${this.apiPath}/wanted/missing?pageSize=1&apikey=${this.item.apikey}`,
        )
          .then((overview) => {
            this.fetch(
              `${this.apiPath}/wanted/missing?pageSize=${overview.totalRecords}&apikey=${this.item.apikey}`,
            ).then((movies) => {
              this.missing = movies.records.filter(
                (m) => m.monitored && m.isAvailable && !m.hasFile,
              ).length;
            });
          })
          .catch(handleError);
      }
    },
    formatSize(bytes) {
      if (!bytes) return "0 B";
      const units = ["B", "KB", "MB", "GB", "TB"];
      let size = bytes;
      let unitIndex = 0;

      while (size >= 1024 && unitIndex < units.length - 1) {
        size /= 1024;
        unitIndex++;
      }

      return `${size.toFixed(1)} ${units[unitIndex]}`;
    },
    formatTime(timeString) {
      if (!timeString) return null;
      // Radarr provides time in format like "00:05:23" or ISO date
      if (timeString.includes(":")) {
        const parts = timeString.split(":");
        const hours = parseInt(parts[0]);
        const minutes = parseInt(parts[1]);

        if (hours > 0) {
          return `${hours}h ${minutes}m`;
        }
        return `${minutes}m`;
      }
      // Handle ISO date format
      try {
        const date = new Date(timeString);
        const now = new Date();
        const diffMs = date - now;
        const diffMins = Math.floor(diffMs / 60000);

        if (diffMins < 60) {
          return `${diffMins}m`;
        }
        const hours = Math.floor(diffMins / 60);
        const mins = diffMins % 60;
        return `${hours}h ${mins}m`;
      } catch {
        return timeString;
      }
    },
  },
};
</script>

<style scoped lang="scss">
.notifs {
  position: absolute;
  color: white;
  font-family: sans-serif;
  top: 0.3em;
  right: 0.5em;
  .notif {
    display: inline-block;
    padding: 0.2em 0.35em;
    border-radius: 0.25em;
    position: relative;
    margin-left: 0.3em;
    font-size: 0.8em;
    &.activity {
      background-color: #4fb5d6;
    }

    &.missing {
      background-color: #9d00ff;
    }
    &.warnings {
      background-color: #d08d2e;
    }

    &.errors {
      background-color: #e51111;
    }
  }
}

.error {
  color: #e51111 !important;
  font-weight: normal;
  font-size: 0.9em;
}

.idle {
  color: #888;
  font-style: italic;
  font-weight: normal;
  font-size: 0.9em;
}

.queue-movie {
  overflow: hidden !important;
  text-overflow: ellipsis !important;
  white-space: nowrap !important;
  margin-bottom: 0.25em !important;
}

.queue-client {
  color: #4fb5d6;
  margin-bottom: 0 !important;
  font-size: 0.85em;
  font-weight: 600;

  .queue-eta {
    color: #f39c12;
    font-weight: 500;
  }
}

.queue-details {
  color: #9d00ff;
  margin-bottom: 0.25em !important;
  font-size: 0.85em;
  font-weight: 500;
}
</style>
