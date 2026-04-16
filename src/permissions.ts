import { existsSync, readFileSync, writeFileSync, mkdirSync } from "fs";
import { join } from "path";

const CONFIG_DIR = join(import.meta.dir, "../config");
const CONFIG_PATH = join(CONFIG_DIR, "permissions.json");

interface GuildPermissions {
  allowedRoles: string[];
  allowedChannels: string[];
}

interface PermissionsConfig {
  guilds: Record<string, GuildPermissions>;
}

let config: PermissionsConfig = { guilds: {} };

export function loadPermissions(): void {
  if (existsSync(CONFIG_PATH)) {
    const raw = readFileSync(CONFIG_PATH, "utf-8");
    config = JSON.parse(raw);
  }
}

function save(): void {
  mkdirSync(CONFIG_DIR, { recursive: true });
  writeFileSync(CONFIG_PATH, JSON.stringify(config, null, 2));
}

function getGuild(guildId: string): GuildPermissions {
  if (!config.guilds[guildId]) {
    config.guilds[guildId] = { allowedRoles: [], allowedChannels: [] };
  }
  return config.guilds[guildId];
}

export function addRole(guildId: string, roleId: string): boolean {
  const guild = getGuild(guildId);
  if (guild.allowedRoles.includes(roleId)) return false;
  guild.allowedRoles.push(roleId);
  save();
  return true;
}

export function removeRole(guildId: string, roleId: string): boolean {
  const guild = getGuild(guildId);
  const idx = guild.allowedRoles.indexOf(roleId);
  if (idx === -1) return false;
  guild.allowedRoles.splice(idx, 1);
  save();
  return true;
}

export function addChannel(guildId: string, channelId: string): boolean {
  const guild = getGuild(guildId);
  if (guild.allowedChannels.includes(channelId)) return false;
  guild.allowedChannels.push(channelId);
  save();
  return true;
}

export function removeChannel(guildId: string, channelId: string): boolean {
  const guild = getGuild(guildId);
  const idx = guild.allowedChannels.indexOf(channelId);
  if (idx === -1) return false;
  guild.allowedChannels.splice(idx, 1);
  save();
  return true;
}

export function resetGuild(guildId: string): void {
  delete config.guilds[guildId];
  save();
}

export function getGuildPermissions(guildId: string): GuildPermissions {
  return config.guilds[guildId] ?? { allowedRoles: [], allowedChannels: [] };
}

export function checkPermission(
  guildId: string,
  channelId: string,
  memberRoleIds: string[],
): boolean {
  const guild = getGuildPermissions(guildId);

  if (
    guild.allowedChannels.length > 0 &&
    !guild.allowedChannels.includes(channelId)
  ) {
    return false;
  }

  if (
    guild.allowedRoles.length > 0 &&
    !memberRoleIds.some((r) => guild.allowedRoles.includes(r))
  ) {
    return false;
  }

  return true;
}
