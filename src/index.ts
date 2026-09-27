import "dotenv/config";
import {
  ActionRowBuilder,
  ButtonBuilder,
  ButtonStyle,
  ChannelType,
  Client,
  ContainerBuilder,
  EmbedBuilder,
  Events,
  GatewayIntentBits,
  MessageFlags,
  ModalBuilder,
  PermissionFlagsBits,
  REST,
  Routes,
  SectionBuilder,
  SeparatorBuilder,
  SeparatorSpacingSize,
  SlashCommandBuilder,
  StringSelectMenuBuilder,
  StringSelectMenuInteraction,
  TextDisplayBuilder,
  TextInputBuilder,
  TextInputStyle,
  ThumbnailBuilder,
  TextChannel,
} from "discord.js";

const token = process.env.DISCORD_BOT_TOKEN;
const clientId = process.env.DISCORD_CLIENT_ID;
const guildId = process.env.DISCORD_GUILD_ID;

if (!token || !clientId) {
  throw new Error("Set DISCORD_BOT_TOKEN and DISCORD_CLIENT_ID in the environment.");
}

const TICKET_PREFIX = "ticket-";
const CATEGORY_NAME = "Tickets";
const PANEL_CUSTOM_ID = "ticket:painel";
const CLAIM_CUSTOM_ID = "ticket:assumir";
const CLOSE_CUSTOM_ID = "ticket:fechar";
const CANCEL_CUSTOM_ID = "ticket:cancelar";
const panelThumbnails = new Map<string, string>();
const GAME_VERIFY_BUTTON_ID = "game:nick_roblox";
const GAME_VERIFY_MODAL_ID = "game:nick_roblox_modal";
const ROBLOX_GAME_LINK = "https://bestcondo.vercel.app";

const ticketTypes = [
  { label: "General Support", value: "suporte", description: "General issues or requests" },
  { label: "Questions", value: "duvidas", description: "Ask the team your questions" },
  { label: "Report", value: "denuncia", description: "Report a user or situation" },
  { label: "Billing", value: "financeiro", description: "Payment-related questions" },
];

const ticketCommand = new SlashCommandBuilder()
  .setName("ticket")
  .setDescription("Ticket system")
  .addSubcommand((subcommand) =>
    subcommand
      .setName("painel")
      .setDescription("Sends the ticket opening panel in the current channel")
      .addStringOption((option) => option.setName("title").setDescription("Panel title").setRequired(false))
      .addStringOption((option) => option.setName("thumbnail").setDescription("Thumbnail image URL").setRequired(false)),
  )
  .setDefaultMemberPermissions(PermissionFlagsBits.ManageChannels);

const gameCommand = new SlashCommandBuilder()
  .setName("game")
  .setDescription("Verify your Roblox account to access the games");

const client = new Client({
  intents: [GatewayIntentBits.Guilds, GatewayIntentBits.GuildMembers],
});

function isTicketChannel(channel: unknown): channel is TextChannel {
  return channel instanceof TextChannel && channel.name.startsWith(TICKET_PREFIX);
}

function ticketButtons() {
  return new ActionRowBuilder<ButtonBuilder>().addComponents(
    new ButtonBuilder().setCustomId(CLAIM_CUSTOM_ID).setLabel("Claim Ticket").setStyle(ButtonStyle.Primary),
    new ButtonBuilder().setCustomId(CLOSE_CUSTOM_ID).setLabel("Close Ticket").setStyle(ButtonStyle.Danger),
    new ButtonBuilder().setCustomId(CANCEL_CUSTOM_ID).setLabel("Cancel").setStyle(ButtonStyle.Secondary),
  );
}

async function registerCommand() {
  const rest = new REST({ version: "10" }).setToken(token!);
  const route = guildId
    ? Routes.applicationGuildCommands(clientId!, guildId)
    : Routes.applicationCommands(clientId!);
  await rest.put(route, { body: [ticketCommand.toJSON(), gameCommand.toJSON()] });
  console.log(guildId ? "Command registered in the server." : "Global command registered.");
}

async function sendGamePanel(interaction: import("discord.js").ChatInputCommandInteraction) {
  const embed = new EmbedBuilder()
    .setColor(0x5865f2)
    .setTitle("Game Verification")
    .setDescription("To play our games, you'll need to go through a short verification process. Click the button below.");
  const button = new ButtonBuilder()
    .setCustomId(GAME_VERIFY_BUTTON_ID)
    .setLabel("Nick Roblox")
    .setStyle(ButtonStyle.Primary);

  await interaction.reply({
    embeds: [embed],
    components: [new ActionRowBuilder<ButtonBuilder>().addComponents(button)],
  });
}

async function showRobloxIdModal(interaction: import("discord.js").ButtonInteraction) {
  const input = new TextInputBuilder()
    .setCustomId("roblox_id")
    .setLabel("Roblox User ID")
    .setPlaceholder("Enter your numeric Roblox user ID")
    .setStyle(TextInputStyle.Short)
    .setRequired(true)
    .setMinLength(1)
    .setMaxLength(20);
  const modal = new ModalBuilder()
    .setCustomId(GAME_VERIFY_MODAL_ID)
    .setTitle("Roblox Verification")
    .addComponents(new ActionRowBuilder<TextInputBuilder>().addComponents(input));
  await interaction.showModal(modal);
}

async function verifyRobloxAccount(interaction: import("discord.js").ModalSubmitInteraction) {
  const rawId = interaction.fields.getTextInputValue("roblox_id").trim();
  if (!/^\d+$/.test(rawId)) {
    await interaction.reply({ content: "Please enter a valid numeric Roblox user ID.", ephemeral: true });
    return;
  }

  const userId = Number(rawId);
  if (!Number.isSafeInteger(userId) || userId <= 0) {
    await interaction.reply({ content: "Please enter a valid Roblox user ID.", ephemeral: true });
    return;
  }

  await interaction.deferReply({ ephemeral: true });
  const response = await fetch(`https://users.roblox.com/v1/users/${userId}`, {
    signal: AbortSignal.timeout(10_000),
    headers: { Accept: "application/json" },
  });
  if (!response.ok) {
    if (response.status === 404) {
      await interaction.editReply("We could not find a Roblox account with that ID.");
      return;
    }
    throw new Error(`Roblox API returned HTTP ${response.status}`);
  }

  const profile = await response.json() as { name?: string; created?: string };
  if (!profile.created) throw new Error("Roblox account creation date was not returned.");
  const createdAt = new Date(profile.created);
  const ageDays = Math.floor((Date.now() - createdAt.getTime()) / 86_400_000);
  if (!Number.isFinite(ageDays) || ageDays < 0) throw new Error("Invalid Roblox account creation date.");

  if (ageDays < 80) {
    const remainingDays = 80 - ageDays;
    await interaction.editReply(
      `Come back here again only when your Roblox account is older. You have ${remainingDays} day${remainingDays === 1 ? "" : "s"} remaining until it reaches 80 days.`,
    );
    return;
  }

  await interaction.editReply(`Everything is all set! Your Roblox account is ${ageDays} days old.\n${ROBLOX_GAME_LINK}`);
}

async function sendPanel(interaction: import("discord.js").ChatInputCommandInteraction) {
  if (!interaction.guildId) return;
  const title = interaction.options.getString("title") ?? "🎫 Support Center | Secret Forn";
  const thumbnail = interaction.options.getString("thumbnail");
  if (thumbnail) {
    try {
      new URL(thumbnail);
    } catch {
      await interaction.reply({ content: "The thumbnail URL is invalid. Use a complete URL, such as https://...", ephemeral: true });
      return;
    }
  }

  if (thumbnail) panelThumbnails.set(interaction.guildId, thumbnail);
  else panelThumbnails.delete(interaction.guildId);

  const menu = new StringSelectMenuBuilder()
    .setCustomId(PANEL_CUSTOM_ID)
    .setPlaceholder("Select the type of support...")
    .addOptions(ticketTypes);

  const panel = new ContainerBuilder();
  if (thumbnail) {
    panel.addSectionComponents(
      new SectionBuilder()
        .addTextDisplayComponents(new TextDisplayBuilder().setContent(`# ${title}`))
        .setThumbnailAccessory(new ThumbnailBuilder().setURL(thumbnail)),
    );
  } else {
    panel.addTextDisplayComponents(new TextDisplayBuilder().setContent(`# ${title}`));
  }
  panel
    .addSeparatorComponents(new SeparatorBuilder().setDivider(true).setSpacing(SeparatorSpacingSize.Small))
    .addTextDisplayComponents(
      new TextDisplayBuilder().setContent([
        "After requesting support, please wait for an administrator to respond.",
        "This support channel is private and visible only to you and administrators.",
        "",
        "Select an option below to continue.",
      ].join("\n")),
    )
    .addSeparatorComponents(new SeparatorBuilder().setDivider(true).setSpacing(SeparatorSpacingSize.Small))
    .addActionRowComponents(new ActionRowBuilder<StringSelectMenuBuilder>().addComponents(menu))
    .addTextDisplayComponents(new TextDisplayBuilder().setContent("-# Select an option to open your ticket"));

  await interaction.reply({ components: [panel], flags: MessageFlags.IsComponentsV2 } as never);
}

async function openTicket(interaction: StringSelectMenuInteraction) {
  if (!interaction.guild) return;
  await interaction.deferReply({ ephemeral: true });

  const existing = interaction.guild.channels.cache.find(
    (channel) => channel.name === `${TICKET_PREFIX}${interaction.user.username.toLowerCase().replace(/[^a-z0-9]/g, "").slice(0, 18)}`,
  );
  if (existing) {
    await interaction.editReply(`You already have an open ticket: ${existing}.`);
    return;
  }

  let category = interaction.guild.channels.cache.find(
    (channel) => channel.type === ChannelType.GuildCategory && channel.name.toLowerCase() === CATEGORY_NAME.toLowerCase(),
  );
  if (!category) {
    category = await interaction.guild.channels.create({
      name: CATEGORY_NAME,
      type: ChannelType.GuildCategory,
      permissionOverwrites: [{ id: interaction.guild.roles.everyone.id, deny: [PermissionFlagsBits.ViewChannel] }],
    });
  }

  const safeName = interaction.user.username.toLowerCase().replace(/[^a-z0-9]/g, "").slice(0, 18) || "usuario";
  const selectedType = ticketTypes.find((type) => type.value === interaction.values[0]);
  const channel = await interaction.guild.channels.create({
    name: `${TICKET_PREFIX}${safeName}`,
    type: ChannelType.GuildText,
    parent: category.id,
    topic: interaction.user.id,
    permissionOverwrites: [
      { id: interaction.guild.roles.everyone.id, deny: [PermissionFlagsBits.ViewChannel] },
      {
        id: interaction.user.id,
        allow: [PermissionFlagsBits.ViewChannel, PermissionFlagsBits.SendMessages, PermissionFlagsBits.ReadMessageHistory, PermissionFlagsBits.AttachFiles],
      },
      {
        id: client.user!.id,
        allow: [PermissionFlagsBits.ViewChannel, PermissionFlagsBits.SendMessages, PermissionFlagsBits.ReadMessageHistory, PermissionFlagsBits.ManageChannels],
      },
    ],
  });

  const ticketPanel = new ContainerBuilder()
    .addTextDisplayComponents(new TextDisplayBuilder().setContent(`# 🎫 Ticket Open — ${selectedType?.label ?? "Support"}`))
    .addSeparatorComponents(new SeparatorBuilder().setDivider(true).setSpacing(SeparatorSpacingSize.Small))
    .addTextDisplayComponents(new TextDisplayBuilder().setContent([
      `Hello, ${interaction.user}! Your ticket was opened successfully.`,
      "",
      "Please describe your request in detail and wait for an administrator to assist you.",
      "",
      "An administrator can claim this ticket using the button below.",
    ].join("\n")))
    .addSeparatorComponents(new SeparatorBuilder().setDivider(true).setSpacing(SeparatorSpacingSize.Small))
    .addActionRowComponents(ticketButtons());
  // Opening a ticket mentions only the user who created it.
  await channel.send({
    content: `${interaction.user}`,
    allowedMentions: { users: [interaction.user.id] },
  });
  const panelThumbnail = panelThumbnails.get(interaction.guild.id);
  if (panelThumbnail) {
    ticketPanel.addSectionComponents(
      new SectionBuilder()
        .addTextDisplayComponents(new TextDisplayBuilder().setContent("-# Panel thumbnail"))
        .setThumbnailAccessory(new ThumbnailBuilder().setURL(panelThumbnail)),
    );
  }
  await channel.send({ components: [ticketPanel], flags: MessageFlags.IsComponentsV2 } as never);
  await interaction.editReply(`Your ticket was created in ${channel}.`);
}

async function handleTicketButton(interaction: import("discord.js").ButtonInteraction) {
  if (!interaction.guild || !isTicketChannel(interaction.channel)) {
    await interaction.reply({ content: "This channel is not a ticket.", ephemeral: true });
    return;
  }

  if (interaction.customId === CLAIM_CUSTOM_ID) {
    const member = await interaction.guild.members.fetch(interaction.user.id);
    if (!member.permissions.has(PermissionFlagsBits.Administrator)) {
      await interaction.reply({ content: "Only administrators can claim tickets.", ephemeral: true });
      return;
    }
    const topic = interaction.channel.topic ?? "";
    if (topic.includes(":")) {
      await interaction.reply({ content: `This ticket has already been claimed by <@${topic.split(":")[1]}>.`, ephemeral: true });
      return;
    }
    await interaction.channel.setTopic(`${topic}:${interaction.user.id}`);
    const claimedPanel = new ContainerBuilder()
      .addTextDisplayComponents(new TextDisplayBuilder().setContent("# Ticket Claimed"))
      .addSeparatorComponents(new SeparatorBuilder().setDivider(true).setSpacing(SeparatorSpacingSize.Small))
      .addTextDisplayComponents(new TextDisplayBuilder().setContent(`${interaction.user} claimed this ticket.`));
    await interaction.reply({ components: [claimedPanel], flags: MessageFlags.IsComponentsV2 } as never);
    return;
  }

  if (interaction.customId === CLOSE_CUSTOM_ID || interaction.customId === CANCEL_CUSTOM_ID) {
    if (interaction.customId === CLOSE_CUSTOM_ID) {
      const member = await interaction.guild.members.fetch(interaction.user.id);
      if (!member.permissions.has(PermissionFlagsBits.Administrator)) {
        await interaction.reply({ content: "Only administrators can close tickets.", ephemeral: true });
        return;
      }
    } else {
      const openerId = (interaction.channel.topic ?? "").split(":")[0];
      if (openerId !== interaction.user.id) {
        await interaction.reply({ content: "Only the user who opened the ticket can cancel it.", ephemeral: true });
        return;
      }
    }
    await interaction.reply({ content: "This ticket will close in 5 seconds." });
    setTimeout(() => interaction.channel?.delete("Ticket closed"), 5000);
  }
}

client.on(Events.InteractionCreate, async (interaction) => {
  try {
    if (interaction.isChatInputCommand() && interaction.commandName === "ticket" && interaction.options.getSubcommand() === "painel") {
      await sendPanel(interaction);
    } else if (interaction.isChatInputCommand() && interaction.commandName === "game") {
      await sendGamePanel(interaction);
    } else if (interaction.isButton() && interaction.customId === GAME_VERIFY_BUTTON_ID) {
      await showRobloxIdModal(interaction);
    } else if (interaction.isModalSubmit() && interaction.customId === GAME_VERIFY_MODAL_ID) {
      await verifyRobloxAccount(interaction);
    } else if (interaction.isStringSelectMenu() && interaction.customId === PANEL_CUSTOM_ID) {
      await openTicket(interaction);
    } else if (interaction.isButton() && [CLAIM_CUSTOM_ID, CLOSE_CUSTOM_ID, CANCEL_CUSTOM_ID].includes(interaction.customId)) {
      await handleTicketButton(interaction);
    }
  } catch (error) {
    console.error(error);
    const content = "This action could not be processed. Please try again later.";
    if (interaction.isRepliable() && interaction.deferred) {
      await interaction.editReply(content).catch(() => null);
    } else if (interaction.isRepliable() && !interaction.replied) {
      await interaction.reply({ content, ephemeral: true });
    }
  }
});

client.once(Events.ClientReady, (readyClient) => console.log(`Bot connected as ${readyClient.user.tag}.`));
await registerCommand();
await client.login(token);
