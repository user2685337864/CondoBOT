import "dotenv/config";
import {
  ActionRowBuilder,
  ButtonBuilder,
  ButtonStyle,
  ChannelType,
  Client,
  EmbedBuilder,
  Events,
  GatewayIntentBits,
  PermissionFlagsBits,
  REST,
  Routes,
  SlashCommandBuilder,
  StringSelectMenuBuilder,
  StringSelectMenuInteraction,
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
      .setDescription("Sends the ticket opening panel in the current channel"),
  )
  .setDefaultMemberPermissions(PermissionFlagsBits.Administrator);

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
  await rest.put(route, { body: [ticketCommand.toJSON()] });
  console.log(guildId ? "Command registered in the server." : "Global command registered.");
}

async function sendPanel(interaction: import("discord.js").ChatInputCommandInteraction) {
  const embed = new EmbedBuilder()
    .setColor(0x5865f2)
    .setTitle("Support Center")
    .setDescription([
      "Select an option below to open your ticket.",
      "Your ticket will be private and visible to you and the administrators.",
    ].join("\n"));

  const menu = new StringSelectMenuBuilder()
    .setCustomId(PANEL_CUSTOM_ID)
    .setPlaceholder("Select the type of support...")
    .addOptions(ticketTypes);

  await interaction.reply({ embeds: [embed], components: [new ActionRowBuilder<StringSelectMenuBuilder>().addComponents(menu)] });
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

  const ticketEmbed = new EmbedBuilder()
    .setColor(0x57f287)
    .setTitle(`Ticket Open — ${selectedType?.label ?? "Support"}`)
    .setDescription([
      `Hello, ${interaction.user}! Your ticket was opened successfully.`,
      "",
      "Please describe your request in detail and wait for an administrator to assist you.",
    ].join("\n"));

  // Opening a ticket mentions only the user who created it.
  await channel.send({
    content: `${interaction.user}`,
    allowedMentions: { users: [interaction.user.id] },
    embeds: [ticketEmbed],
    components: [ticketButtons()],
  });
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
    await interaction.reply({ embeds: [new EmbedBuilder().setColor(0x5865f2).setTitle("Ticket Claimed").setDescription(`${interaction.user} claimed this ticket.`)] });
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
    } else if (interaction.isStringSelectMenu() && interaction.customId === PANEL_CUSTOM_ID) {
      await openTicket(interaction);
    } else if (interaction.isButton() && [CLAIM_CUSTOM_ID, CLOSE_CUSTOM_ID, CANCEL_CUSTOM_ID].includes(interaction.customId)) {
      await handleTicketButton(interaction);
    }
  } catch (error) {
    console.error(error);
    const content = "This action could not be processed.";
    if (interaction.isRepliable() && !interaction.replied && !interaction.deferred) await interaction.reply({ content, ephemeral: true });
  }
});

client.once(Events.ClientReady, (readyClient) => console.log(`Bot connected as ${readyClient.user.tag}.`));
await registerCommand();
await client.login(token);
