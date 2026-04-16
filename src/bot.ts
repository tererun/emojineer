import {
  Client,
  GatewayIntentBits,
  SlashCommandBuilder,
  REST,
  Routes,
  ModalBuilder,
  TextInputBuilder,
  TextInputStyle,
  ActionRowBuilder,
  ButtonBuilder,
  ButtonStyle,
  StringSelectMenuBuilder,
  AttachmentBuilder,
  PermissionFlagsBits,
  ChannelType,
  LabelBuilder,
} from "discord.js";
import { renderEmoji } from "./emoji-renderer";
import { initFonts, FONT_LIST } from "./fonts";
import {
  loadPermissions,
  checkPermission,
  addRole,
  removeRole,
  addChannel,
  removeChannel,
  resetGuild,
  getGuildPermissions,
} from "./permissions";

const TOKEN = process.env.DISCORD_TOKEN!;
const CLIENT_ID = process.env.DISCORD_CLIENT_ID!;

if (!TOKEN || !CLIENT_ID) {
  console.error(
    "DISCORD_TOKEN と DISCORD_CLIENT_ID を .env に設定してください",
  );
  process.exit(1);
}

interface EmojiSession {
  text: string;
  emojiName: string;
  background: string;
  fontIndex: number;
  imageBuffer: Buffer;
}

const sessions = new Map<string, EmojiSession>();

const client = new Client({
  intents: [GatewayIntentBits.Guilds],
});

async function registerCommands() {
  const emojiCommand = new SlashCommandBuilder()
    .setName("emoji")
    .setDescription("テキストから絵文字を作成します");

  const configCommand = new SlashCommandBuilder()
    .setName("emoji-config")
    .setDescription("絵文字コマンドの権限を設定します")
    .setDefaultMemberPermissions(PermissionFlagsBits.ManageGuild)
    .addSubcommand((sub) =>
      sub.setName("show").setDescription("現在の権限設定を表示します"),
    )
    .addSubcommand((sub) =>
      sub
        .setName("add-role")
        .setDescription("許可ロールを追加します")
        .addRoleOption((opt) =>
          opt
            .setName("role")
            .setDescription("追加するロール")
            .setRequired(true),
        ),
    )
    .addSubcommand((sub) =>
      sub
        .setName("remove-role")
        .setDescription("許可ロールを削除します")
        .addRoleOption((opt) =>
          opt
            .setName("role")
            .setDescription("削除するロール")
            .setRequired(true),
        ),
    )
    .addSubcommand((sub) =>
      sub
        .setName("add-channel")
        .setDescription("許可チャンネルを追加します")
        .addChannelOption((opt) =>
          opt
            .setName("channel")
            .setDescription("追加するチャンネル")
            .addChannelTypes(ChannelType.GuildText)
            .setRequired(true),
        ),
    )
    .addSubcommand((sub) =>
      sub
        .setName("remove-channel")
        .setDescription("許可チャンネルを削除します")
        .addChannelOption((opt) =>
          opt
            .setName("channel")
            .setDescription("削除するチャンネル")
            .addChannelTypes(ChannelType.GuildText)
            .setRequired(true),
        ),
    )
    .addSubcommand((sub) =>
      sub
        .setName("reset")
        .setDescription("このサーバーの権限設定をリセットします"),
    );

  const rest = new REST({ version: "10" }).setToken(TOKEN);
  await rest.put(Routes.applicationCommands(CLIENT_ID), {
    body: [emojiCommand.toJSON(), configCommand.toJSON()],
  });
  console.log("Slash commands registered.");
}

function buildModal(defaults?: {
  emojiName?: string;
  text?: string;
  background?: string;
}): ModalBuilder {
  const modal = new ModalBuilder()
    .setCustomId("emoji_modal")
    .setTitle("絵文字を作成");

  const nameInput = new TextInputBuilder()
    .setCustomId("emoji_name")
    .setStyle(TextInputStyle.Short)
    .setPlaceholder("my_emoji")
    .setRequired(true)
    .setMinLength(2)
    .setMaxLength(32);
  if (defaults?.emojiName) nameInput.setValue(defaults.emojiName);

  const textInput = new TextInputBuilder()
    .setCustomId("emoji_text")
    .setStyle(TextInputStyle.Paragraph)
    .setPlaceholder("絵文字に\nしたい文字")
    .setRequired(true)
    .setMaxLength(100);
  if (defaults?.text) textInput.setValue(defaults.text);

  const bgInput = new TextInputBuilder()
    .setCustomId("emoji_bg")
    .setStyle(TextInputStyle.Short)
    .setPlaceholder("#fff / linear-gradient(45deg, red, blue)")
    .setRequired(false);
  if (defaults?.background) bgInput.setValue(defaults.background);

  modal.addLabelComponents(
    new LabelBuilder()
      .setLabel("絵文字の名前")
      .setTextInputComponent(nameInput),
    new LabelBuilder().setLabel("テキスト").setTextInputComponent(textInput),
    new LabelBuilder().setLabel("色").setTextInputComponent(bgInput),
  );

  return modal;
}

function generateImage(session: EmojiSession): Buffer {
  const font = FONT_LIST[session.fontIndex]!;
  return renderEmoji({
    text: session.text,
    font: font.label,
    background: session.background,
  });
}

function buildPreviewPayload(session: EmojiSession) {
  const font = FONT_LIST[session.fontIndex]!;
  const attachment = new AttachmentBuilder(session.imageBuffer, {
    name: `${session.emojiName}.png`,
  });

  const fontSelect = new StringSelectMenuBuilder()
    .setCustomId("emoji_font_select")
    .addOptions(
      FONT_LIST.map((f, i) => ({
        label: f.label,
        value: String(i),
        default: i === session.fontIndex,
      })),
    );

  const buttons = new ActionRowBuilder<ButtonBuilder>().addComponents(
    new ButtonBuilder()
      .setCustomId("emoji_create")
      .setLabel("作成")
      .setStyle(ButtonStyle.Success),
    new ButtonBuilder()
      .setCustomId("emoji_edit")
      .setLabel("編集")
      .setStyle(ButtonStyle.Primary),
    new ButtonBuilder()
      .setCustomId("emoji_cancel")
      .setLabel("キャンセル")
      .setStyle(ButtonStyle.Secondary),
  );

  return {
    content: [
      `**:${session.emojiName}:** のプレビュー`,
      `テキスト: \`${session.text.replace(/\n/g, "\\n")}\``,
      `フォント: \`${font.label}\``,
      `色: \`${session.background}\``,
    ].join("\n"),
    files: [attachment],
    components: [
      new ActionRowBuilder<StringSelectMenuBuilder>().addComponents(fontSelect),
      buttons,
    ],
  };
}

client.on("clientReady", () => {
  console.log(`Logged in as ${client.user?.tag}`);
});

client.on("interactionCreate", async (interaction) => {
  try {
    // /emoji コマンド → 権限チェック → Modal表示
    if (
      interaction.isChatInputCommand() &&
      interaction.commandName === "emoji"
    ) {
      if (interaction.guild) {
        const member = interaction.guild.members.cache.get(
          interaction.user.id,
        );
        if (
          member &&
          !member.permissions.has(PermissionFlagsBits.ManageGuild)
        ) {
          const memberRoleIds = [...member.roles.cache.keys()];
          if (
            !checkPermission(
              interaction.guildId!,
              interaction.channelId,
              memberRoleIds,
            )
          ) {
            await interaction.reply({
              content: "このコマンドを使用する権限がありません。",
              flags: 64,
            });
            return;
          }
        }
      }

      const existing = sessions.get(interaction.user.id);
      const modal = buildModal(
        existing
          ? {
              emojiName: existing.emojiName,
              text: existing.text,
              background: existing.background,
            }
          : undefined,
      );
      await interaction.showModal(modal);
      return;
    }

    // /emoji-config コマンド → 権限設定
    if (
      interaction.isChatInputCommand() &&
      interaction.commandName === "emoji-config"
    ) {
      if (!interaction.guild) {
        await interaction.reply({
          content: "サーバー内でのみ使用できます。",
          flags: 64,
        });
        return;
      }

      const guildId = interaction.guildId!;
      const sub = interaction.options.getSubcommand();

      switch (sub) {
        case "show": {
          const perms = getGuildPermissions(guildId);
          const roles =
            perms.allowedRoles.length > 0
              ? perms.allowedRoles.map((id) => `<@&${id}>`).join(", ")
              : "制限なし（全員）";
          const channels =
            perms.allowedChannels.length > 0
              ? perms.allowedChannels.map((id) => `<#${id}>`).join(", ")
              : "制限なし（全チャンネル）";
          await interaction.reply({
            content: [
              "**絵文字コマンドの権限設定**",
              `許可ロール: ${roles}`,
              `許可チャンネル: ${channels}`,
              "",
              "*サーバー管理権限を持つメンバーは常に使用可能です*",
            ].join("\n"),
            flags: 64,
          });
          return;
        }
        case "add-role": {
          const role = interaction.options.getRole("role", true);
          if (addRole(guildId, role.id)) {
            await interaction.reply({
              content: `<@&${role.id}> を許可ロールに追加しました。`,
              flags: 64,
            });
          } else {
            await interaction.reply({
              content: `<@&${role.id}> は既に許可ロールに含まれています。`,
              flags: 64,
            });
          }
          return;
        }
        case "remove-role": {
          const role = interaction.options.getRole("role", true);
          if (removeRole(guildId, role.id)) {
            await interaction.reply({
              content: `<@&${role.id}> を許可ロールから削除しました。`,
              flags: 64,
            });
          } else {
            await interaction.reply({
              content: `<@&${role.id}> は許可ロールに含まれていません。`,
              flags: 64,
            });
          }
          return;
        }
        case "add-channel": {
          const channel = interaction.options.getChannel("channel", true);
          if (addChannel(guildId, channel.id)) {
            await interaction.reply({
              content: `<#${channel.id}> を許可チャンネルに追加しました。`,
              flags: 64,
            });
          } else {
            await interaction.reply({
              content: `<#${channel.id}> は既に許可チャンネルに含まれています。`,
              flags: 64,
            });
          }
          return;
        }
        case "remove-channel": {
          const channel = interaction.options.getChannel("channel", true);
          if (removeChannel(guildId, channel.id)) {
            await interaction.reply({
              content: `<#${channel.id}> を許可チャンネルから削除しました。`,
              flags: 64,
            });
          } else {
            await interaction.reply({
              content: `<#${channel.id}> は許可チャンネルに含まれていません。`,
              flags: 64,
            });
          }
          return;
        }
        case "reset": {
          resetGuild(guildId);
          await interaction.reply({
            content:
              "権限設定をリセットしました。全メンバー・全チャンネルで使用可能です。",
            flags: 64,
          });
          return;
        }
      }
      return;
    }

    // Modal送信 → プレビュー表示（フォントはセレクトメニューで選択）
    if (interaction.isModalSubmit() && interaction.customId === "emoji_modal") {
      const emojiName = interaction.fields.getTextInputValue("emoji_name");
      const text = interaction.fields.getTextInputValue("emoji_text");
      const background =
        interaction.fields.getTextInputValue("emoji_bg") || "#ffffff";

      if (!/^[a-zA-Z0-9_]{2,32}$/.test(emojiName)) {
        await interaction.reply({
          content:
            "絵文字の名前は英数字とアンダースコアのみ（2〜32文字）で入力してください。",
          flags: 64,
        });
        return;
      }

      const existing = sessions.get(interaction.user.id);
      const fontIndex = existing?.fontIndex ?? 0;

      const session: EmojiSession = {
        text,
        emojiName,
        background,
        fontIndex,
        imageBuffer: Buffer.alloc(0),
      };
      session.imageBuffer = generateImage(session);
      sessions.set(interaction.user.id, session);

      const payload = buildPreviewPayload(session);

      if (interaction.isFromMessage()) {
        await interaction.update(payload);
      } else {
        await interaction.reply({ ...payload, flags: 64 });
      }
      return;
    }

    // フォントセレクトメニュー → プレビュー更新
    if (
      interaction.isStringSelectMenu() &&
      interaction.customId === "emoji_font_select"
    ) {
      const session = sessions.get(interaction.user.id);
      if (!session) {
        await interaction.reply({
          content: "セッションが見つかりません。/emoji を実行してください。",
          flags: 64,
        });
        return;
      }

      session.fontIndex = parseInt(interaction.values[0]!);
      session.imageBuffer = generateImage(session);

      await interaction.update(buildPreviewPayload(session));
      return;
    }

    // ボタン操作
    if (interaction.isButton()) {
      const session = sessions.get(interaction.user.id);

      switch (interaction.customId) {
        case "emoji_create": {
          if (!session) {
            await interaction.reply({
              content:
                "セッションが見つかりません。/emoji を実行してください。",
              flags: 64,
            });
            return;
          }

          if (!interaction.guild) {
            await interaction.reply({
              content: "サーバー内でのみ使用できます。",
              flags: 64,
            });
            return;
          }

          const member = interaction.guild.members.cache.get(
            interaction.user.id,
          );
          if (
            member &&
            !member.permissions.has(PermissionFlagsBits.ManageGuildExpressions)
          ) {
            await interaction.reply({
              content: "絵文字を管理する権限がありません。",
              flags: 64,
            });
            return;
          }

          try {
            const emoji = await interaction.guild.emojis.create({
              attachment: session.imageBuffer,
              name: session.emojiName,
            });

            await interaction.update({
              content: `絵文字 ${emoji} (\`:${emoji.name}:\`) を作成しました!`,
              files: [],
              components: [],
            });
          } catch (err: any) {
            await interaction.update({
              content: `絵文字の作成に失敗しました: ${err.message}`,
              files: [],
              components: [],
            });
          }

          sessions.delete(interaction.user.id);
          return;
        }

        case "emoji_edit": {
          if (!session) {
            await interaction.reply({
              content:
                "セッションが見つかりません。/emoji を実行してください。",
              flags: 64,
            });
            return;
          }

          const modal = buildModal({
            emojiName: session.emojiName,
            text: session.text,
            background: session.background,
          });
          await interaction.showModal(modal);
          return;
        }

        case "emoji_cancel": {
          sessions.delete(interaction.user.id);
          await interaction.update({
            content: "絵文字の作成をキャンセルしました。",
            files: [],
            components: [],
          });
          return;
        }
      }
    }
  } catch (err) {
    console.error("Error:", err);
  }
});

async function main() {
  loadPermissions();
  await initFonts();
  await registerCommands();
  await client.login(TOKEN);
}

main().catch(console.error);
