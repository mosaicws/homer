<template>
  <Generic :item="displayItem">
    <template #indicator>
      <div class="notifs">
        <strong
          v-if="downloads > 0"
          class="notif downloading"
          :title="`${downloads} active download${downloads > 1 ? 's' : ''}`"
        >
          {{ downloads }}
        </strong>
        <i
          v-if="error"
          class="notif error fa-solid fa-triangle-exclamation"
          title="Unable to fetch current status"
        ></i>
      </div>
    </template>
    <template #content>
      <p class="title is-4">{{ item.name }}</p>
      <template v-if="downloads > 0 && currentDownload">
        <p class="subtitle is-6 download-name">
          {{ currentDownload.filename }}
        </p>
        <progress class="progress is-small download-progress" :value="currentDownload.percentage" max="100">
          {{ currentDownload.percentage }}%
        </progress>
        <p class="subtitle is-6 download-stats">
          <span class="percentage monospace">
            <i class="fas fa-download"></i>
            {{ currentDownload.percentage }}%
          </span>
          <span class="down monospace">
            <i class="fas fa-chart-line"></i>
            <span class="speed-text"><span class="speed-padding">{{ downRate.padding }}</span>{{ downRate.value }}</span>
          </span>
          <span v-if="currentDownload.timeleft" class="eta monospace">
            <i class="fas fa-clock"></i>
            {{ currentDownload.timeleft }}
          </span>
        </p>
      </template>
      <template v-else-if="item.subtitle && !error">
        <p class="subtitle">
          {{ item.subtitle }}
        </p>
      </template>
      <template v-else-if="error">
        <p class="subtitle is-6">
          <span class="error">An error has occurred.</span>
        </p>
      </template>
      <template v-else>
        <p class="subtitle is-6">
          <span class="idle">No active downloads</span>
        </p>
      </template>
    </template>
  </Generic>
</template>

<script>
import service from "@/mixins/service.js";

const units = ["KB", "MB", "GB"];

// Function to convert rate into a human-readable format with separate padding
const displayRate = (rate) => {
  let i = 0;

  while (rate > 1000 && i < units.length) {
    rate /= 1000;
    i++;
  }
  const roundedRate = Math.round(rate || 0);
  const rateStr = roundedRate.toString();
  const padding = "0".repeat(Math.max(0, 3 - rateStr.length));

  return {
    padding: padding,
    value: `${rateStr} ${units[i]}/s`
  };
};

export default {
  name: "SABnzbd",
  mixins: [service],
  props: {
    item: Object,
  },
  data: () => ({
    stats: null,
    error: false,
    dlSpeed: null,
    ulSpeed: null,
  }),
  computed: {
    downloads() {
      if (!this.stats) {
        return "";
      }
      return this.stats.noofslots;
    },
    downRate() {
      return displayRate(this.dlSpeed);
    },
    currentDownload() {
      if (!this.stats || !this.stats.slots || this.stats.slots.length === 0) {
        return null;
      }
      // Get the first active download
      const download = this.stats.slots[0];
      return {
        filename: download.filename || "Unknown",
        percentage: download.percentage || "0",
        timeleft: download.timeleft || download.eta || "",
      };
    },
    displayItem() {
      // Remove tag from DOM when downloads are active
      if (this.downloads > 0 && this.currentDownload) {
        const { tag, tagstyle, ...itemWithoutTag } = this.item;
        return itemWithoutTag;
      }
      return this.item;
    },
  },
  created() {
    const downloadInterval = parseInt(this.item.downloadInterval, 10) || 0;
    if (downloadInterval > 0) {
      setInterval(() => this.fetchStatus(), downloadInterval);
    }

    this.fetchStatus();
  },
  methods: {
    fetchStatus: async function () {
      try {
        const response = await this.fetch(`/api?output=json&apikey=${this.item.apikey}&mode=queue`);
        this.error = false;
        this.stats = response.queue;

        // Fetching download speed from "speed" (convert to KB/s if needed)
        this.dlSpeed = parseFloat(response.queue.speed) * 1024; // Convert MB to KB
      } catch (e) {
        this.error = true;
        console.error(e);
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

    &.downloading {
      background-color: #4fb5d6;
    }

    &.error {
      border-radius: 50%;
      aspect-ratio: 1;
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

.download-name {
  overflow: hidden !important;
  text-overflow: ellipsis !important;
  white-space: nowrap !important;
  margin-bottom: 0.5em !important;
}

.download-progress {
  margin-bottom: 0.5em !important;
  height: 0.5rem;
  transition: all 0.3s ease-in-out;
}

.download-progress::-webkit-progress-value {
  background-color: #20c625ff;
  transition: all 0.3s ease-in-out;
}

.download-progress::-moz-progress-bar {
  background-color: #20c625ff;
  transition: all 0.3s ease-in-out;
}

.download-stats {
  display: flex;
  gap: 0;
  margin-bottom: 0 !important;
  font-size: 1.1em;

  span {
    display: inline-flex;
    align-items: center;
    justify-content: flex-start;
    gap: 0.3em;
    white-space: nowrap;
    overflow: hidden;

    i {
      opacity: 0.7;
      flex-shrink: 0;
      font-size: 0.8em;
    }
  }
}

.down {
  width: 7.5em;
  margin-right: 0;
  color: #4fb5d6;
}

.percentage {
  width: 4.8em;
  color: #4caf50;
}

.eta {
  width: 7em;
  color: #f39c12;
}

.monospace {
  font-family: monospace;
}

.download-stats .monospace {
  font-weight: 600;
}

.speed-text {
  display: inline-flex;
  gap: 0 !important;
  margin: 0;
  padding: 0;
}

.speed-padding {
  opacity: 0.25;
  margin: 0;
  padding: 0;
}
</style>
