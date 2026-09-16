<script setup lang="ts">
import { computed, onMounted, ref } from 'vue';
import {
  listPlugins,
  setPluginEnabled,
  listAvailablePlugins,
  installPlugin,
  uninstallPlugin,
  getPluginDetails,
  addPluginMarketplace,
  listMcpServers,
  addMcpServer,
  removeMcpServer,
  authenticateMcp,
  clearMcpAuthentication,
  readAdminSettings,
  type PluginSummary,
  type AvailablePlugin,
  type McpServerSummary,
  type McpStatus,
  type ScopedSettings,
} from '../claude-transport';
import { errorMessage } from '../error-message';
import { describeMcpLoginOutcome } from '../mcp-auth-outcome';
import {
  createTabFocusRegistry,
  handleTabListKeydown,
  tabButtonId,
  tabPanelId,
} from '../tab-navigation';
import ScrollableListPanel from './ScrollableListPanel.vue';
import IconGlyph from './IconGlyph.vue';

const props = defineProps<{
  cwd: string | null;
}>();

type AdminTab = 'plugins' | 'mcp' | 'settings';
type PluginSubTab = 'installed' | 'install';
const ADMIN_TAB_IDS: AdminTab[] = ['plugins', 'mcp', 'settings'];
const PLUGIN_SUB_TAB_IDS: PluginSubTab[] = ['installed', 'install'];
const adminTabFocus = createTabFocusRegistry();
const pluginSubTabFocus = createTabFocusRegistry();

const adminTab = ref<AdminTab>('plugins');
const pluginSubTab = ref<PluginSubTab>('installed');
const plugins = ref<PluginSummary[]>([]);
const availablePlugins = ref<AvailablePlugin[]>([]);
const availablePluginsLoaded = ref(false);
const pluginSearch = ref('');
const newMarketplaceSource = ref('');
const mcpServers = ref<McpServerSummary[]>([]);
const scopedSettings = ref<ScopedSettings | null>(null);
const adminError = ref<string | null>(null);
const adminLoading = ref(false);
const availablePluginsLoading = ref(false);
const restartNotice = ref(false);
const newMcpName = ref('');
const newMcpCommand = ref('');

function mcpStatusLabel(status: McpStatus): string {
  switch (status.kind) {
    case 'connected':
      return 'Conectado';
    case 'needs-authentication':
      return 'Necesita autenticacion';
    case 'pending-approval':
      return 'Aprobacion pendiente';
    case 'failed':
      return `Fallo: ${status.reason}`;
    case 'unknown':
      return `Desconocido: ${status.raw}`;
  }
}

// Un modificador visual distinto por cada uno de los 5 estados reales, para que sean distinguibles entre si sin leer el texto.
function mcpStatusBadgeClass(status: McpStatus): string {
  switch (status.kind) {
    case 'connected':
      return 'admin-settings__badge--enabled';
    case 'needs-authentication':
      return 'admin-settings__badge--warning';
    case 'pending-approval':
      return 'admin-settings__badge--pending';
    case 'failed':
      return 'admin-settings__badge--danger';
    case 'unknown':
      return 'admin-settings__badge--disabled';
  }
}

// Cada apertura relee de la fuente real, nunca hay una copia local mutable que quede a medias.
async function loadAdminPanel() {
  adminError.value = null;
  adminLoading.value = true;
  try {
    const [pluginList, mcpList, settings] = await Promise.all([
      listPlugins(props.cwd),
      listMcpServers(),
      readAdminSettings(props.cwd),
    ]);
    plugins.value = pluginList;
    mcpServers.value = mcpList;
    scopedSettings.value = settings;
  } catch (err) {
    adminError.value = errorMessage(err);
  } finally {
    adminLoading.value = false;
  }
}

async function togglePlugin(plugin: PluginSummary) {
  adminError.value = null;
  try {
    const result = await setPluginEnabled(plugin.id, !plugin.enabled);
    restartNotice.value = result.requiresRestart;
    await loadAdminPanel();
  } catch (err) {
    adminError.value = errorMessage(err);
  }
}

const expandedPluginDetailsId = ref<string | null>(null);
const pluginDetailsText = ref<Record<string, string>>({});
const pluginDetailsLoadingId = ref<string | null>(null);
const pendingUninstallId = ref<string | null>(null);
const uninstallingId = ref<string | null>(null);

async function togglePluginDetails(plugin: PluginSummary) {
  if (expandedPluginDetailsId.value === plugin.id) {
    expandedPluginDetailsId.value = null;
    return;
  }
  expandedPluginDetailsId.value = plugin.id;
  if (plugin.id in pluginDetailsText.value) return;
  adminError.value = null;
  pluginDetailsLoadingId.value = plugin.id;
  try {
    pluginDetailsText.value[plugin.id] = await getPluginDetails(plugin.id);
  } catch (err) {
    adminError.value = errorMessage(err);
    expandedPluginDetailsId.value = null;
  } finally {
    pluginDetailsLoadingId.value = null;
  }
}

function requestUninstallPlugin(id: string) {
  pendingUninstallId.value = id;
}

function cancelUninstallPlugin() {
  pendingUninstallId.value = null;
}

async function confirmUninstallPlugin(id: string) {
  adminError.value = null;
  uninstallingId.value = id;
  try {
    const result = await uninstallPlugin(id);
    restartNotice.value = result.requiresRestart;
    pendingUninstallId.value = null;
    delete pluginDetailsText.value[id];
    if (expandedPluginDetailsId.value === id)
      expandedPluginDetailsId.value = null;
    await loadAdminPanel();
  } catch (err) {
    adminError.value = errorMessage(err);
  } finally {
    uninstallingId.value = null;
  }
}

function selectAdminTab(tab: AdminTab) {
  adminTab.value = tab;
}

function onAdminTabKeydown(event: KeyboardEvent): void {
  handleTabListKeydown(event, ADMIN_TAB_IDS, adminTab, adminTabFocus);
}

function selectPluginSubTab(tab: PluginSubTab) {
  pluginSubTab.value = tab;
  if (tab === 'install' && !availablePluginsLoaded.value) {
    loadAvailablePlugins();
  }
}

function onPluginSubTabKeydown(event: KeyboardEvent): void {
  handleTabListKeydown(
    event,
    PLUGIN_SUB_TAB_IDS,
    pluginSubTab,
    pluginSubTabFocus,
  );
}

async function loadAvailablePlugins() {
  adminError.value = null;
  availablePluginsLoading.value = true;
  try {
    availablePlugins.value = await listAvailablePlugins(props.cwd);
    availablePluginsLoaded.value = true;
  } catch (err) {
    adminError.value = errorMessage(err);
  } finally {
    availablePluginsLoading.value = false;
  }
}

const filteredAvailablePlugins = computed(() => {
  const query = pluginSearch.value.trim().toLowerCase();
  if (!query) return availablePlugins.value;
  return availablePlugins.value.filter((plugin) =>
    `${plugin.name} ${plugin.description} ${plugin.marketplaceName}`
      .toLowerCase()
      .includes(query),
  );
});

async function installAvailablePlugin(plugin: AvailablePlugin) {
  adminError.value = null;
  try {
    const result = await installPlugin(plugin.pluginId);
    restartNotice.value = result.requiresRestart;
    await loadAdminPanel();
  } catch (err) {
    adminError.value = errorMessage(err);
  }
}

const marketplaceFormError = ref<string | null>(null);
const mcpFormError = ref<string | null>(null);

async function submitAddMarketplace() {
  const source = newMarketplaceSource.value.trim();
  if (!source) {
    marketplaceFormError.value = 'Escribe una URL, ruta o owner/repo.';
    return;
  }
  marketplaceFormError.value = null;
  adminError.value = null;
  try {
    await addPluginMarketplace(source);
    newMarketplaceSource.value = '';
    await loadAvailablePlugins();
  } catch (err) {
    adminError.value = errorMessage(err);
  }
}

async function submitAddMcp() {
  const name = newMcpName.value.trim();
  const command = newMcpCommand.value.trim();
  if (!name || !command) {
    mcpFormError.value = 'Completa el nombre y el comando.';
    return;
  }
  if (mcpServers.value.some((server) => server.name === name)) {
    mcpFormError.value = `Ya existe un servidor MCP llamado "${name}".`;
    return;
  }
  mcpFormError.value = null;
  adminError.value = null;
  try {
    const result = await addMcpServer(name, command);
    restartNotice.value = result.requiresRestart;
    newMcpName.value = '';
    newMcpCommand.value = '';
    await loadAdminPanel();
  } catch (err) {
    adminError.value = errorMessage(err);
  }
}

// D11: mismo patron in-place de 2 pasos ya usado por "Desinstalar" plugin (requestUninstallPlugin/confirmUninstallPlugin/cancelUninstallPlugin) -- "Quitar" MCP era la unica accion destructiva del panel sin esa confirmacion.
const pendingRemoveMcpName = ref<string | null>(null);
const removingMcpName = ref<string | null>(null);

function requestRemoveMcp(name: string) {
  pendingRemoveMcpName.value = name;
}

function cancelRemoveMcp() {
  pendingRemoveMcpName.value = null;
}

async function confirmRemoveMcp(name: string) {
  adminError.value = null;
  removingMcpName.value = name;
  try {
    const result = await removeMcpServer(name);
    restartNotice.value = result.requiresRestart;
    pendingRemoveMcpName.value = null;
    await loadAdminPanel();
  } catch (err) {
    adminError.value = errorMessage(err);
  } finally {
    removingMcpName.value = null;
  }
}

const mcpAuthNotice = ref<string | null>(null);
const authenticatingMcpName = ref<string | null>(null);
const clearingAuthMcpName = ref<string | null>(null);

function mcpNeedsAuthAction(status: McpStatus): boolean {
  return status.kind === 'needs-authentication' || status.kind === 'failed';
}

function mcpAuthActionLabel(status: McpStatus): string {
  return status.kind === 'failed' ? 'Re-autenticar' : 'Autenticar';
}

function mcpCanRetryConnection(status: McpStatus): boolean {
  return status.kind === 'failed' || status.kind === 'unknown';
}

function mcpCanClearAuthentication(status: McpStatus): boolean {
  return status.kind === 'connected';
}

// login abre un navegador real y no puede completarse solo (ver authenticate_mcp en Rust); solo distingue un fallo temprano de un login que sigue en curso, el usuario termina el flujo afuera y despues refresca.
async function startMcpAuthentication(name: string) {
  adminError.value = null;
  mcpAuthNotice.value = null;
  authenticatingMcpName.value = name;
  try {
    const outcome = await authenticateMcp(name);
    const { notice, error } = describeMcpLoginOutcome(name, outcome);
    mcpAuthNotice.value = notice;
    if (error) adminError.value = error;
  } catch (err) {
    adminError.value = errorMessage(err);
  } finally {
    authenticatingMcpName.value = null;
  }
}

async function clearMcpAuth(name: string) {
  adminError.value = null;
  clearingAuthMcpName.value = name;
  try {
    await clearMcpAuthentication(name);
    await loadAdminPanel();
  } catch (err) {
    adminError.value = errorMessage(err);
  } finally {
    clearingAuthMcpName.value = null;
  }
}

// "Reconectar" no existe como comando en claude mcp: list/get ya health-checkean en cada llamada, asi que reintentar conexion es literalmente refrescar el panel.
async function retryMcpConnection() {
  await loadAdminPanel();
}

onMounted(loadAdminPanel);
</script>

<template>
  <div class="admin-settings">
    <p v-if="adminError" class="session-panel__error">
      <IconGlyph name="error" />{{ adminError }}
    </p>
    <p v-if="restartNotice" class="session-panel__notice">
      <IconGlyph name="warning" />El cambio surte efecto en la proxima sesion de
      Claude Code.
    </p>

    <div
      class="admin-settings__tabs"
      role="tablist"
      @keydown="onAdminTabKeydown"
    >
      <button
        :id="tabButtonId('admin', 'plugins')"
        type="button"
        role="tab"
        :aria-selected="adminTab === 'plugins'"
        :aria-controls="tabPanelId('admin', 'plugins')"
        :tabindex="adminTab === 'plugins' ? 0 : -1"
        :ref="(el) => adminTabFocus.register('plugins', el)"
        class="admin-settings__tab"
        :class="{ 'admin-settings__tab--active': adminTab === 'plugins' }"
        @click="selectAdminTab('plugins')"
      >
        Plugins
      </button>
      <button
        :id="tabButtonId('admin', 'mcp')"
        type="button"
        role="tab"
        :aria-selected="adminTab === 'mcp'"
        :aria-controls="tabPanelId('admin', 'mcp')"
        :tabindex="adminTab === 'mcp' ? 0 : -1"
        :ref="(el) => adminTabFocus.register('mcp', el)"
        class="admin-settings__tab"
        :class="{ 'admin-settings__tab--active': adminTab === 'mcp' }"
        @click="selectAdminTab('mcp')"
      >
        MCP
      </button>
      <button
        :id="tabButtonId('admin', 'settings')"
        type="button"
        role="tab"
        :aria-selected="adminTab === 'settings'"
        :aria-controls="tabPanelId('admin', 'settings')"
        :tabindex="adminTab === 'settings' ? 0 : -1"
        :ref="(el) => adminTabFocus.register('settings', el)"
        class="admin-settings__tab"
        :class="{ 'admin-settings__tab--active': adminTab === 'settings' }"
        @click="selectAdminTab('settings')"
      >
        Ajustes
      </button>
    </div>

    <section
      v-if="adminTab === 'plugins'"
      :id="tabPanelId('admin', 'plugins')"
      role="tabpanel"
      :aria-labelledby="tabButtonId('admin', 'plugins')"
      class="admin-settings__section"
    >
      <h3 class="admin-settings__section-title">Plugins</h3>
      <div
        class="admin-settings__tabs admin-settings__tabs--sub"
        role="tablist"
        @keydown="onPluginSubTabKeydown"
      >
        <button
          :id="tabButtonId('plugin-sub', 'installed')"
          type="button"
          role="tab"
          :aria-selected="pluginSubTab === 'installed'"
          :aria-controls="tabPanelId('plugin-sub', 'installed')"
          :tabindex="pluginSubTab === 'installed' ? 0 : -1"
          :ref="(el) => pluginSubTabFocus.register('installed', el)"
          class="admin-settings__tab"
          :class="{
            'admin-settings__tab--active': pluginSubTab === 'installed',
          }"
          @click="selectPluginSubTab('installed')"
        >
          Instalados
        </button>
        <button
          :id="tabButtonId('plugin-sub', 'install')"
          type="button"
          role="tab"
          :aria-selected="pluginSubTab === 'install'"
          :aria-controls="tabPanelId('plugin-sub', 'install')"
          :tabindex="pluginSubTab === 'install' ? 0 : -1"
          :ref="(el) => pluginSubTabFocus.register('install', el)"
          class="admin-settings__tab"
          :class="{
            'admin-settings__tab--active': pluginSubTab === 'install',
          }"
          @click="selectPluginSubTab('install')"
        >
          Instalar
        </button>
      </div>

      <ScrollableListPanel
        v-if="pluginSubTab === 'installed'"
        :id="tabPanelId('plugin-sub', 'installed')"
        role="tabpanel"
        :aria-labelledby="tabButtonId('plugin-sub', 'installed')"
        :loading="adminLoading"
      >
        <template #list>
          <ul class="admin-settings__list">
            <li
              v-for="plugin in plugins"
              :key="plugin.id"
              class="admin-settings__row admin-settings__row--stacked"
            >
              <div class="admin-settings__row-top">
                <span class="admin-settings__row-main">
                  {{ plugin.id }}
                  <span class="admin-settings__meta"
                    >v{{ plugin.version }} · {{ plugin.scope }}</span
                  >
                </span>
                <span
                  class="admin-settings__badge"
                  :class="
                    plugin.enabled
                      ? 'admin-settings__badge--enabled'
                      : 'admin-settings__badge--disabled'
                  "
                >
                  {{ plugin.enabled ? 'Activado' : 'Desactivado' }}
                </span>
              </div>

              <div class="admin-settings__row-actions">
                <button
                  type="button"
                  class="session-panel__button"
                  @click="togglePlugin(plugin)"
                >
                  {{ plugin.enabled ? 'Desactivar' : 'Activar' }}
                </button>
                <button
                  type="button"
                  class="session-panel__button"
                  :aria-expanded="expandedPluginDetailsId === plugin.id"
                  @click="togglePluginDetails(plugin)"
                >
                  {{
                    expandedPluginDetailsId === plugin.id
                      ? 'Ocultar detalles'
                      : 'Detalles'
                  }}
                </button>
                <button
                  v-if="pendingUninstallId !== plugin.id"
                  type="button"
                  class="session-panel__button"
                  @click="requestUninstallPlugin(plugin.id)"
                >
                  Desinstalar
                </button>
                <template v-else>
                  <span class="admin-settings__meta"
                    >¿Desinstalar {{ plugin.id }}?</span
                  >
                  <button
                    type="button"
                    class="session-panel__button session-panel__button--danger"
                    :disabled="uninstallingId === plugin.id"
                    @click="confirmUninstallPlugin(plugin.id)"
                  >
                    {{
                      uninstallingId === plugin.id
                        ? 'Desinstalando...'
                        : 'Si, desinstalar'
                    }}
                  </button>
                  <button
                    type="button"
                    class="session-panel__button"
                    :disabled="uninstallingId === plugin.id"
                    @click="cancelUninstallPlugin"
                  >
                    Cancelar
                  </button>
                </template>
              </div>

              <div
                v-if="expandedPluginDetailsId === plugin.id"
                class="admin-settings__details"
                aria-live="polite"
              >
                <p v-if="pluginDetailsLoadingId === plugin.id">
                  Cargando detalles...
                </p>
                <pre v-else class="admin-settings__settings">{{
                  pluginDetailsText[plugin.id]
                }}</pre>
              </div>
            </li>
          </ul>
        </template>
      </ScrollableListPanel>

      <ScrollableListPanel
        v-else
        :id="tabPanelId('plugin-sub', 'install')"
        role="tabpanel"
        :aria-labelledby="tabButtonId('plugin-sub', 'install')"
        :loading="availablePluginsLoading"
      >
        <template #header>
          <input
            v-model="pluginSearch"
            type="search"
            class="admin-settings__input"
            placeholder="Buscar por nombre, descripcion o marketplace..."
          />
        </template>
        <template #list>
          <ul class="admin-settings__list">
            <li
              v-for="plugin in filteredAvailablePlugins"
              :key="plugin.pluginId"
              class="admin-settings__row"
            >
              <span class="admin-settings__row-main">
                {{ plugin.name }}
                <span class="admin-settings__meta"
                  >{{ plugin.marketplaceName }} ·
                  {{ plugin.installCount }} instalaciones</span
                >
                <span
                  class="admin-settings__meta admin-settings__meta--clamp"
                  >{{ plugin.description }}</span
                >
              </span>
              <button
                type="button"
                class="session-panel__button"
                @click="installAvailablePlugin(plugin)"
              >
                Instalar
              </button>
            </li>
          </ul>
          <p
            v-if="
              availablePluginsLoaded && filteredAvailablePlugins.length === 0
            "
            class="admin-settings__meta"
          >
            Sin resultados.
          </p>
        </template>
        <template #footer>
          <div class="admin-settings__add-form">
            <input
              v-model="newMarketplaceSource"
              type="text"
              class="admin-settings__input"
              placeholder="Agregar marketplace (URL, ruta o owner/repo de GitHub)"
            />
            <button
              type="button"
              class="session-panel__button"
              @click="submitAddMarketplace"
            >
              Agregar marketplace
            </button>
            <span
              v-if="marketplaceFormError"
              class="admin-settings__form-error"
              role="alert"
            >
              {{ marketplaceFormError }}
            </span>
          </div>
        </template>
      </ScrollableListPanel>
    </section>

    <section
      v-if="adminTab === 'mcp'"
      :id="tabPanelId('admin', 'mcp')"
      role="tabpanel"
      :aria-labelledby="tabButtonId('admin', 'mcp')"
      class="admin-settings__section"
    >
      <h3 class="admin-settings__section-title">Servidores MCP</h3>
      <p v-if="mcpAuthNotice" class="session-panel__notice" aria-live="polite">
        <IconGlyph name="warning" />{{ mcpAuthNotice }}
      </p>
      <ScrollableListPanel :loading="adminLoading">
        <template #list>
          <ul class="admin-settings__list">
            <li
              v-for="server in mcpServers"
              :key="server.name"
              class="admin-settings__row admin-settings__row--stacked"
            >
              <div class="admin-settings__row-top">
                <span class="admin-settings__row-main">{{ server.name }}</span>
                <span
                  class="admin-settings__badge"
                  :class="mcpStatusBadgeClass(server.status)"
                >
                  {{ mcpStatusLabel(server.status) }}
                </span>
              </div>
              <div class="admin-settings__row-actions">
                <button
                  v-if="mcpNeedsAuthAction(server.status)"
                  type="button"
                  class="session-panel__button"
                  :disabled="authenticatingMcpName === server.name"
                  @click="startMcpAuthentication(server.name)"
                >
                  {{ mcpAuthActionLabel(server.status) }}
                </button>
                <button
                  v-if="mcpCanClearAuthentication(server.status)"
                  type="button"
                  class="session-panel__button"
                  :disabled="clearingAuthMcpName === server.name"
                  @click="clearMcpAuth(server.name)"
                >
                  Limpiar autenticacion
                </button>
                <button
                  v-if="mcpCanRetryConnection(server.status)"
                  type="button"
                  class="session-panel__button"
                  @click="retryMcpConnection"
                >
                  Reintentar conexion
                </button>
                <button
                  v-if="pendingRemoveMcpName !== server.name"
                  type="button"
                  class="session-panel__button"
                  @click="requestRemoveMcp(server.name)"
                >
                  Quitar
                </button>
                <template v-else>
                  <span class="admin-settings__meta"
                    >¿Quitar {{ server.name }}?</span
                  >
                  <button
                    type="button"
                    class="session-panel__button session-panel__button--danger"
                    :disabled="removingMcpName === server.name"
                    @click="confirmRemoveMcp(server.name)"
                  >
                    {{
                      removingMcpName === server.name
                        ? 'Quitando...'
                        : 'Si, quitar'
                    }}
                  </button>
                  <button
                    type="button"
                    class="session-panel__button"
                    :disabled="removingMcpName === server.name"
                    @click="cancelRemoveMcp"
                  >
                    Cancelar
                  </button>
                </template>
              </div>
            </li>
          </ul>
        </template>
        <template #footer>
          <div class="admin-settings__add-form">
            <input
              v-model="newMcpName"
              type="text"
              class="admin-settings__input"
              placeholder="Nombre"
            />
            <input
              v-model="newMcpCommand"
              type="text"
              class="admin-settings__input"
              placeholder="Comando (ej. npx mi-server-mcp)"
            />
            <button
              type="button"
              class="session-panel__button"
              @click="submitAddMcp"
            >
              Agregar
            </button>
            <span
              v-if="mcpFormError"
              class="admin-settings__form-error"
              role="alert"
            >
              {{ mcpFormError }}
            </span>
          </div>
        </template>
      </ScrollableListPanel>
    </section>

    <section
      v-if="adminTab === 'settings'"
      :id="tabPanelId('admin', 'settings')"
      role="tabpanel"
      :aria-labelledby="tabButtonId('admin', 'settings')"
      class="admin-settings__section"
    >
      <h3 class="admin-settings__section-title">Ajustes (solo lectura)</h3>
      <ScrollableListPanel :loading="adminLoading">
        <template #header>
          <p class="admin-settings__meta">
            Global:
            {{ scopedSettings?.global ? 'presente' : 'sin archivo' }} ·
            Proyecto:
            {{ scopedSettings?.project ? 'presente' : 'sin archivo' }}
          </p>
        </template>
        <template #list>
          <pre v-if="scopedSettings" class="admin-settings__settings">{{
            JSON.stringify(scopedSettings, null, 2)
          }}</pre>
        </template>
      </ScrollableListPanel>
    </section>
  </div>
</template>

<style scoped>
.admin-settings {
  display: flex;
  flex-direction: column;
  gap: var(--space-6);
  flex: 1 1 auto;
  min-height: 0;
}

.admin-settings__section {
  display: flex;
  flex-direction: column;
  gap: var(--space-2);
  flex: 1 1 auto;
  min-height: 0;
}

.admin-settings__section-title {
  font-family: var(--font-display);
  font-size: var(--text-lg);
  font-weight: var(--font-weight-bold);
  margin: 0;
}

.admin-settings__list {
  list-style: none;
  margin: 0;
  padding: 0;
  display: flex;
  flex-direction: column;
  gap: var(--space-1);
}

.admin-settings__row {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: var(--space-2);
  padding: var(--space-2);
  border-radius: var(--radius-sm);
  background: var(--color-surface-raised);
  backdrop-filter: blur(var(--blur-panel));
}

.admin-settings__row--stacked {
  flex-direction: column;
  align-items: stretch;
}

.admin-settings__row-top {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: var(--space-2);
}

.admin-settings__row-actions {
  display: flex;
  align-items: center;
  gap: var(--space-2);
  flex-wrap: wrap;
}

.admin-settings__badge {
  padding: var(--space-1) var(--space-2);
  border-radius: var(--radius-sm);
  font-family: var(--font-sans);
  font-size: var(--text-xs);
  font-weight: var(--font-weight-bold);
  white-space: nowrap;
}

.admin-settings__badge--enabled {
  color: var(--color-success);
  border: var(--border-width-thin) solid var(--color-success);
}

.admin-settings__badge--disabled {
  color: var(--color-text-muted);
  border: var(--border-width-thin) solid var(--color-border-subtle);
}

.admin-settings__badge--warning {
  color: var(--color-warning);
  border: var(--border-width-thin) solid var(--color-warning);
}

.admin-settings__badge--pending {
  color: var(--color-accent-secondary);
  border: var(--border-width-thin) solid var(--color-accent-secondary);
}

.admin-settings__badge--danger {
  color: var(--color-error);
  border: var(--border-width-thin) solid var(--color-error);
}

.admin-settings__details {
  padding: var(--space-2);
  border-radius: var(--radius-sm);
  background: var(--color-surface-base);
}

.admin-settings__row-main {
  display: flex;
  flex-direction: column;
  gap: var(--space-1);
  font-family: var(--font-mono);
  font-size: var(--text-sm);
  color: var(--color-text-primary);
}

.admin-settings__meta {
  font-family: var(--font-sans);
  font-size: var(--text-xs);
  color: var(--color-text-secondary);
}

.admin-settings__form-error {
  font-family: var(--font-sans);
  font-size: var(--text-xs);
  color: var(--color-error);
}

.admin-settings__meta--clamp {
  display: -webkit-box;
  -webkit-line-clamp: 2;
  -webkit-box-orient: vertical;
  overflow: hidden;
}

.admin-settings__add-form {
  display: flex;
  align-items: center;
  gap: var(--space-2);
}

.admin-settings__input {
  padding: var(--space-2) var(--space-4);
  border-radius: var(--radius-md);
  border: var(--border-width-thin) solid var(--color-border-subtle);
  background: var(--color-surface-raised);
  backdrop-filter: blur(var(--blur-panel));
  color: var(--color-text-primary);
  font-family: var(--font-sans);
  font-size: var(--text-sm);
}

.admin-settings__tabs {
  display: flex;
  gap: var(--space-2);
  border-bottom: var(--border-width-thin) solid var(--color-border-subtle);
}

.admin-settings__tabs--sub {
  border-bottom: none;
  margin-bottom: var(--space-2);
}

.admin-settings__tab {
  padding: var(--space-2) var(--space-4);
  border: none;
  background: transparent;
  color: var(--color-text-secondary);
  font-family: var(--font-sans);
  font-size: var(--text-sm);
  cursor: pointer;
  border-bottom: var(--border-width-thin) solid transparent;
}

.admin-settings__tab--active {
  color: var(--color-text-primary);
  font-weight: var(--font-weight-bold);
  border-bottom-color: var(--color-accent-primary);
}

.admin-settings__install {
  display: flex;
  flex-direction: column;
  gap: var(--space-2);
}

.admin-settings__settings {
  margin: 0;
  padding: var(--space-2);
  border-radius: var(--radius-sm);
  background: var(--color-surface-raised);
  backdrop-filter: blur(var(--blur-panel));
  color: var(--color-text-secondary);
  font-family: var(--font-mono);
  font-size: var(--text-xs);
  height: 100%;
  overflow: auto;
  white-space: pre-wrap;
  word-break: break-word;
}
</style>
