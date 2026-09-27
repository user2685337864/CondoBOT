# CondoBOT — Ticket Panel

Minimal Discord bot with **only** the `/ticket painel` command.

## Behavior

- The panel lets users choose a support type and open a private ticket.
- When a ticket opens, the only mention sent is the user who created it.
- There are no role mentions, ratings, stars, or feedback flows.
- Only members with the native **Administrator** permission can claim a ticket.
- Only administrators can close a ticket with the `Close Ticket` button.
- The user who opened the ticket can close it with the `Cancel` button.
- The bot automatically creates the `Tickets` category when needed.

## Configuration

Create a `.env` file:

```env
DISCORD_BOT_TOKEN=your_token
DISCORD_CLIENT_ID=your_application_id
# Optional: register immediately in one server instead of waiting for global registration
DISCORD_GUILD_ID=your_server_id
```

Install and build:

```bash
npm install
npm run build
npm start
```

The bot needs `Manage Channels`, `View Channels`, `Send Messages`, and `Read Message History` permissions.
