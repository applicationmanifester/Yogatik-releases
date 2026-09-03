# How to Connect Yogatik to Canva via Model Context Protocol (MCP)

## Overview
Yogatik includes built-in support for the Model Context Protocol (MCP), allowing you to connect to remote MCP servers like Canva's. Once connected, you can use natural language to create, edit, and manage Canva designs directly from the chat interface.

## Prerequisites
1. A Canva account (any plan).
2. Access to Yogatik's MCP settings (found in Settings → Personalise → MCP Connectors).
3. An internet connection.

## Step-by-Step Setup

### 1. Open MCP Settings
- In Yogatik, open the **Settings** panel (gear icon).
- Navigate to **Personalise** → **MCP Connectors**.
- You'll see a list of configured MCP connectors and popular presets.

### 2. Add a New MCP Server
Click the **"Add"** button (or use the form at the bottom) to add a new server.

Fill in the fields as follows:
- **Name**: `Canva MCP` (or any name you prefer)
- **URL**: `https://mcp.canva.com/mcp`
- **Transport**: `HTTP` (should be selected automatically when you enter an HTTPS URL)
- **Enabled**: ✅ Checked

**Important**: Canva's MCP server requires authentication via OAuth2. You do **not** need to enter a token manually here. Instead, Yogatik will initiate the OAuth flow when you first attempt to use a Canva tool.

### 3. Save the Server
Click the **"Add"** or **"Save"** button to add the server to your list.

You should now see "Canva MCP" in your configured connectors list, likely with a status of "Disconnected" or "Not Authenticated".

### 4. Connect and Authenticate
- Click the **refresh** icon (🔄) next to the Canva MCP entry, or click the global **"Connect"** button at the top of the MCP Connectors page.
- Yogatik will attempt to connect to `https://mcp.canva.com/mcp`.
- Since authentication is required, you should be redirected to a Canva login/authorization page (either in a popup or new tab).
- Log in to your Canva account if prompted.
- Grant permission for Yogatik to access your Canva designs and assets.
- After successful authorization, you should be redirected back to Yogatik.
- The server status should change to "Connected" and show the number of available tools/resources.

### 5. Test the Connection
Once connected, try asking Yogatik to perform a simple Canva action, for example:
> "Create a Canva presentation titled 'Test Presentation'"

Yogatik should:
1. Show a tool usage prompt asking for approval to run the `canva_create_design` tool (or similar).
2. You approve the tool call.
3. Yogatik sends the request to Canva's MCP server.
4. Canva creates the design and returns a result.
5. Yogatik displays the outcome (e.g., a confirmation with a link to the design).

## Troubleshooting

| Issue | Solution |
|-------|----------|
| **Connection fails / timeout** | Verify the URL is exactly `https://mcp.canva.com/mcp`. Check your internet connection. |
| **Authentication loop** | Ensure you are logging into the correct Canva account. Try clearing browser cookies for `canva.com` and retry. |
| **No tools appear after connecting** | The MCP server may still be initializing. Wait a few seconds and refresh the tool list. |
| **Permission denied errors** | Make sure you granted the necessary permissions during the OAuth flow. You may need to reconnect and re-authorize. |
| **Server shows as disabled** | Check that the "Enabled" toggle is turned on for the Canva MCP server entry. |

## Technical Details
- **MCP Server URL**: `https://mcp.canva.com/mcp`
- **Authentication Protocol**: OAuth2 (Dynamic Client Registration or Client ID Metadata Documents)
- **Scopes Required**: `design:read design:write` (handled automatically by the MCP server)
- **Transport**: Streamable HTTP / SSE (JSON-RPC 2.0)
- **Yogatik MCP Client**: Built-in, supports HTTP transport natively.

## Resources
- Canva MCP Documentation: https://www.canva.dev/docs/mcp/
- Canva Connect API Documentation: https://www.canva.dev/docs/connect/
- OAuth2 Guide for Canva: https://www.canva.com/developers/learn/oauth2/
- Yogatik MCP Documentation: See internal docs or settings help.

## Notes
- Each user must authenticate individually; Canva does not support organization-wide tokens for MCP.
- The MCP server exposes the same capabilities as the Canva Connect API, including design creation, editing, asset management, export, and collaboration features.
- If you encounter issues, try disconnecting and reconnecting the server, or remove and re-add it.

---
*These instructions are specific to Yogatik version 3.13+ with MCP support. For other versions, consult the relevant documentation.*