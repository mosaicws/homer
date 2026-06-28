<template>
  <div
    v-if="config"
    id="app"
    :class="[
      `theme-${config.theme}`,
      `page-${currentPage}`,
      isDark ? 'dark' : 'light',
      !config.footer ? 'no-footer' : '',
    ]"
  >
    <DynamicTheme v-if="config.colors" :themes="config.colors" />

    <!-- Floating toggle for the per-card restart controls. Lives outside the
         navbar because custom.css hides the navbar entirely. Off by default;
         state persists in localStorage. Only shown when at least one service
         is restartable (server-side mapping present). -->
    <button
      v-if="restartableServices.length"
      class="restart-toggle"
      :class="{ active: showRestartControls }"
      :title="
        showRestartControls
          ? 'Hide restart buttons'
          : 'Show restart buttons'
      "
      @click="toggleRestartControls"
    >
      <i class="fas fa-power-off"></i>
    </button>

    <div id="bighead">
      <section v-if="config.header" class="first-line">
        <div v-cloak class="container">
          <div class="logo">
            <a href="#">
              <img v-if="config.logo" :src="config.logo" alt="dashboard logo" />
            </a>
            <i v-if="config.icon" :class="config.icon"></i>
          </div>
          <div class="dashboard-title">
            <span class="headline">{{ config.subtitle }}</span>
            <h1>{{ config.title }}</h1>
          </div>
        </div>
      </section>

      <Navbar
        :open="showMenu"
        :links="config.links"
        @navbar-toggle="showMenu = !showMenu"
      >
        <DarkMode
          :default-value="config.defaults.colorTheme"
          @updated="isDark = $event"
        />

        <SettingToggle
          name="vlayout"
          icon="fa-list"
          icon-alt="fa-columns"
          :default-value="config.defaults.layout == 'columns'"
          @updated="vlayout = $event"
        />

        <SearchInput
          class="navbar-item is-inline-block-mobile"
          :hotkey="searchHotkey()"
          @input="filterServices($event)"
          @search-focus="showMenu = true"
          @search-open="navigateToFirstService"
          @search-cancel="filterServices()"
        />
      </Navbar>
    </div>
    <section id="main-section" class="section">
      <div v-cloak class="container">
        <ConnectivityChecker
          v-if="config.connectivityCheck"
          @network-status-update="offline = $event"
        />

        <GetStarted v-if="configurationNeeded" />

        <div v-if="!offline">
          <!-- Optional messages -->
          <Message :item="config.message" />

          <!-- Unified layout -->
          <div
            :class="[
              'columns',
              'is-multiline',
              { 'layout-vertical': vlayout && !filter },
            ]"
          >
            <ServiceGroup
              v-for="(group, groupIndex) in services"
              :key="`${currentPage}-${groupIndex}`"
              :group="group"
              :is-vertical="vlayout && !filter"
              :proxy="config.proxy"
              :columns="config.columns"
              :group-index="groupIndex"
            />
          </div>
        </div>
      </div>
    </section>

    <footer class="footer">
      <div class="container">
        <div
          v-if="config.footer"
          class="content has-text-centered"
          v-html="config.footer"
        ></div>
      </div>
    </footer>
  </div>
</template>

<script>
import { parse } from "yaml";
import merge from "lodash.merge";

import Navbar from "./components/Navbar.vue";
import GetStarted from "./components/GetStarted.vue";
import ConnectivityChecker from "./components/ConnectivityChecker.vue";
import ServiceGroup from "./components/ServiceGroup.vue";
import Message from "./components/Message.vue";
import SearchInput from "./components/SearchInput.vue";
import SettingToggle from "./components/SettingToggle.vue";
import DarkMode from "./components/DarkMode.vue";
import DynamicTheme from "./components/DynamicTheme.vue";

import defaultConfig from "./assets/defaults.yml?raw";

export default {
  name: "App",
  components: {
    Navbar,
    GetStarted,
    ConnectivityChecker,
    ServiceGroup,
    Message,
    SearchInput,
    SettingToggle,
    DarkMode,
    DynamicTheme,
  },
  provide() {
    return {
      config: () => this.config,
      // Exposed to Generic.vue so each card can decide whether to show its
      // restart button: only when the toggle is on AND the service is in the
      // server-side whitelist.
      restartControls: () => ({
        enabled: this.showRestartControls,
        services: this.restartableServices,
      }),
    };
  },
  data: function () {
    return {
      loaded: false,
      currentPage: null,
      configNotFound: false,
      config: null,
      services: null,
      offline: false,
      filter: "",
      vlayout: true,
      isDark: null,
      showMenu: false,
      showRestartControls: localStorage.getItem("restartControls") === "true",
      restartableServices: [],
    };
  },
  computed: {
    configurationNeeded: function () {
      return (this.loaded && !this.services) || this.configNotFound;
    },
  },
  created: async function () {
    this.buildDashboard();
    this.loadRestartableServices();
    window.onhashchange = this.buildDashboard;
    this.loaded = true;
    console.info(`Homer v${__APP_VERSION__}`);
  },
  beforeUnmount() {
    window.onhashchange = null;
  },
  methods: {
    searchHotkey() {
      if (this.config.hotkey && this.config.hotkey.search) {
        return this.config.hotkey.search;
      }
    },
    toggleRestartControls: function () {
      this.showRestartControls = !this.showRestartControls;
      localStorage.setItem("restartControls", this.showRestartControls);
    },
    loadRestartableServices: async function () {
      // Ask the server-side middleware which services have a Proxmox mapping.
      // Names only — no tokens or vmids reach the browser. Fails silently
      // (empty list = no buttons) if the endpoint isn't available.
      try {
        const response = await fetch("api/proxmox/services");
        if (!response.ok) return;
        const data = await response.json();
        this.restartableServices = data.services || [];
      } catch (e) {
        console.warn("Restart controls unavailable:", e);
      }
    },
    buildDashboard: async function () {
      const defaults = parse(defaultConfig);
      let config;
      try {
        config = await this.getConfig();
        this.currentPage = window.location.hash.substring(1) || "default";

        if (this.currentPage !== "default") {
          let pageConfig = await this.getConfig(
            `assets/${this.currentPage}.yml`,
          );
          config = Object.assign(config, pageConfig);
        }
      } catch (error) {
        console.log(error);
        config = this.handleErrors("⚠️ Error loading configuration", error);
      }
      this.config = merge(defaults, config);
      this.services = this.config.services;

      document.title =
        this.config.documentTitle ||
        [this.config.title, this.config.subtitle].filter(Boolean).join(" | ");

      if (this.config.stylesheet) {
        let stylesheet = "";
        let addtionnal_styles = this.config.stylesheet;
        if (!Array.isArray(this.config.stylesheet)) {
          addtionnal_styles = [addtionnal_styles];
        }
        for (const file of addtionnal_styles) {
          stylesheet += `@import "${file}";`;
        }
        this.createStylesheet(stylesheet);
      }
    },
    getConfig: function (path = "assets/config.yml") {
      return fetch(path).then((response) => {
        if (response.status == 404 || response.redirected) {
          this.configNotFound = true;
          return {};
        }

        if (!response.ok) {
          throw Error(`${response.statusText}: ${response.body}`);
        }

        const that = this;
        return response
          .text()
          .then((body) => {
            return parse(body, { merge: true });
          })
          .then(function (config) {
            if (config.externalConfig) {
              return that.getConfig(config.externalConfig);
            }
            return config;
          });
      });
    },
    matchesFilter: function (item) {
      const needle = this.filter?.toLowerCase();
      return (
        item.name.toLowerCase().includes(needle) ||
        (item.subtitle && item.subtitle.toLowerCase().includes(needle)) ||
        (item.tag && item.tag.toLowerCase().includes(needle)) ||
        (item.keywords && item.keywords.toLowerCase().includes(needle))
      );
    },
    navigateToFirstService: function (target) {
      try {
        const service = this.services[0].items[0];
        window.open(service.url, target || service.target || "_self");
      } catch {
        console.warn("fail to open service");
      }
    },
    filterServices: function (filter) {
      this.filter = filter;

      if (!filter) {
        this.services = this.config.services;
        return;
      }

      const searchResultItems = [];
      for (const group of this.config.services) {
        if (group.items !== null) {
          for (const item of group.items) {
            if (this.matchesFilter(item)) {
              searchResultItems.push(item);
            }
          }
        }
      }

      this.services = [
        {
          name: filter,
          icon: "fas fa-search",
          items: searchResultItems,
        },
      ];
    },
    handleErrors: function (title, content) {
      return {
        message: {
          title: title,
          style: "is-danger",
          content: content,
        },
      };
    },
    createStylesheet: function (css) {
      let style = document.createElement("style");
      style.appendChild(document.createTextNode(css));
      document.head.appendChild(style);
    },
  },
};
</script>

<style scoped lang="scss">
.restart-toggle {
  position: fixed;
  top: 1.1rem;
  right: 1.1rem;
  z-index: 9000;
  width: 2.7rem;
  height: 2.7rem;
  border-radius: 50%;
  border: 1.5px solid rgba(127, 127, 127, 0.45);
  background-color: var(--card-background);
  color: var(--text-title);
  cursor: pointer;
  opacity: 0.55;
  display: flex;
  align-items: center;
  justify-content: center;
  font-size: 1rem;
  box-shadow: 0 2px 6px rgba(0, 0, 0, 0.25);
  transition: opacity 0.2s ease, color 0.2s ease, border-color 0.2s ease,
    box-shadow 0.2s ease, transform 0.1s ease;

  &:hover {
    opacity: 1;
    border-color: rgba(127, 127, 127, 0.8);
  }

  &:active {
    transform: scale(0.93);
  }

  &.active {
    opacity: 1;
    color: #e67e22;
    border-color: #e67e22;
    box-shadow: 0 0 8px rgba(230, 126, 34, 0.5);
  }
}
</style>
