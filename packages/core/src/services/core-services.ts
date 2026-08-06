import { assertRuntimeConfig, type CoreRuntimeConfig } from '../runtime/config.js';
import { createVaultLocator } from '../vault/locate.js';
import { createProjectLoader } from '../vault/loader.js';
import { createProjectManager } from './projectManager.js';
import { createProjectPluginConfig } from './project-plugin-config.js';
import { createChannelManager } from './channelManager.js';
import { createSettingsService } from './settingsService.js';
import { createAuditLog } from './audit-log.js';
import { createAuthorizedPaths } from './authorizedPaths.js';
import { createPromptBuilder } from './promptBuilder.js';
import { createVaultTools } from '../tools/vaultTools.js';
import { createToolRegistry } from '../tools/toolRegistry.js';
import { createContourCustomTools } from '../tools/pi-vault-tools.js';
import { createChannelAdapter } from '../agent/channel-adapter.js';
import { createFlowAssets } from './flowAssets.js';
import { createFlowSummary } from './flowSummary.js';

/**
 * The Core composition root. Every file-backed Core capability closes over the
 * supplied immutable config, so separate hosts can coexist in one process.
 */
export function createCoreServices(input: CoreRuntimeConfig) {
  const config = assertRuntimeConfig(input);
  const projects = createProjectManager(config);
  const plugins = createProjectPluginConfig(config);
  const channels = createChannelManager(config);
  const settings = createSettingsService(config);
  const auditLog = createAuditLog(config);
  const authorizedPaths = createAuthorizedPaths(projects, auditLog);
  const locator = createVaultLocator(config);
  const loader = createProjectLoader(config.vaultsDir, config.legacyVault);
  const vault = {
    ...locator,
    ...loader,
  };
  const vaultTools = createVaultTools(loader);
  const toolRegistry = createToolRegistry(vaultTools);
  const prompt = createPromptBuilder(config, {
    loadProjects: loader.loadProjects,
    getProjectConfigStatus: projects.getProjectConfigStatus,
  });

  const tools = { createContourCustomTools: (projectId?: string) => createContourCustomTools(toolRegistry, projectId) };
  const agent = createChannelAdapter(channels);
  const flowAssets = createFlowAssets(locator, loader);
  const flowSummary = createFlowSummary(locator, loader, channels, agent);

  return Object.freeze({
    config,
    vault,
    projects,
    plugins,
    channels,
    settings,
    auditLog,
    authorizedPaths,
    prompt,
    vaultTools,
    toolRegistry,
    tools,
    agent,
    flowAssets,
    flowSummary,
  });
}

export type CoreServices = ReturnType<typeof createCoreServices>;
