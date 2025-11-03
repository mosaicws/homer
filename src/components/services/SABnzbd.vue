<template>
  <Generic :item="item">
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
        <p class="subtitle is-6 download-stats">
          <span class="down monospace">
            <i class="fas fa-download"></i>
            {{ downRate }}
          </span>
          <span class="progress monospace">
            <i class="fas fa-chart-line"></i>
            {{ currentDownload.percentage }}%
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

// Function to convert rate into a human-readable format
const displayRate = (rate) => {
  let i = 0;

  while (rate > 1000 && i < units.length) {
    rate /= 1000;
    i++;
  }
  return (
    Intl.NumberFormat(undefined, { maximumFractionDigits: 2 }).format(
      rate || 0,
    ) + ` ${units[i]}/s`
  );
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
        const response = await this.fetch(
          `/api?output=json&apikey=${this.item.apikey}&mode=queue`,
        );
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
}

.idle {
  color: #888;
  font-style: italic;
}

.download-name {
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
  margin-bottom: 0.25em;
}

.download-stats {
  display: flex;
  gap: 1em;
  flex-wrap: wrap;

  span {
    display: inline-flex;
    align-items: center;
    gap: 0.3em;

    i {
      opacity: 0.7;
    }
  }
}

.down {
  margin-right: 0;
}

.progress {
  color: #4fb5d6;
}

.eta {
  color: #f39c12;
}

.monospace {
  font-weight: 300;
  font-family: monospace;
}
</style>
