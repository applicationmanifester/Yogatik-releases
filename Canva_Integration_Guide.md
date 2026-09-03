# Connecting Yogatik to Canva via Model Context Protocol (MCP)

## Overview
Canva provides an AI Connector that allows AI assistants (like Yogatik) to interact with Canva's design capabilities through the Model Context Protocol (MCP). This enables creating, editing, and managing designs directly from the chat interface.

## Prerequisites
1. A Canva account (any plan).
2. Access to the Canva Developer Portal to obtain API credentials.
3. An AI assistant that supports MCP (Yogatik can be configured to use MCP tools).

## Steps to Connect

### 1. Register Your Redirect URI
- Go to the [Canva Developer Portal](https://www.canva.com/developers/).
- Create an application (if you don't have one).
- Under "OAuth" settings, add a redirect URI. For local testing, you can use `http://localhost:3000/oauth/callback` or a similar endpoint that your assistant can handle.

### 2. Obtain Client ID and Client Secret
- After creating the app, note the **Client ID** and **Client Secret**.
- These will be used for OAuth2 authentication.

### 3. Implement OAuth2 Flow (if not already built-in)
Yogatik may already have an MCP client. If not, you need to implement:
- Redirect user to Canva's authorization URL:
  ```
  https://www.canva.com/oauth2/authorize?response_type=code&client_id=YOUR_CLIENT_ID&redirect_uri=YOUR_REDIRECT_URI&scope=design:read design:write
  ```
- After user authorizes, Canva redirects back with a `code` parameter.
- Exchange the code for an access token:
  ```
  POST https://www.canva.com/oauth2/token
  Body: grant_type=authorization_code&code=AUTH_CODE&redirect_uri=YOUR_REDIRECT_URI&client_id=YOUR_CLIENT_ID&client_secret=YOUR_CLIENT_SECRET
  ```
- Store the access token securely.

### 4. Use the Canva Connect API (MCP)
With the access token, you can call Canva's Connect API endpoints. Examples:

- **Create a design**:
  ```
  POST https://www.canva.com/openapi/v1/documents
  Headers: Authorization: Bearer ACCESS_TOKEN
  Body: { "type": "presentation", "title": "My Presentation" }
  ```

- **Add elements** (text, images, shapes) to a design using the appropriate endpoints.

- **Export/download** the design in desired format (PNG, JPG, PDF).

### 5. Configure Yogatik to Use MCP
If Yogatik exposes a tool registry for MCP, you can add a Canva tool definition:

```json
{
  "name": "canva_create_design",
  "description": "Create a new Canva design",
  "parameters": {
    "type": "object",
    "properties": {
      "design_type": { "type": "string", "enum": ["presentation", "social_media", "document", "video"] },
      "title": { "type": "string" }
    },
    "required": ["design_type", "title"]
  }
}
```

Implement the tool handler to perform the OAuth-protected API call using the stored access token.

### 6. Test the Integration
- Ask Yogatik to create a design: "Create a Canva presentation titled 'Quarterly Report'."
- Verify that the design appears in your Canva account.

## Troubleshooting
- **Invalid token**: Ensure the access token is not expired; refresh using the refresh token if available.
- **Scope missing**: Make sure the OAuth request includes the necessary scopes (`design:read`, `design:write`).
- **Redirect URI mismatch**: The redirect URI must exactly match what is registered in the Developer Portal.

## Resources
- Canva Connect API Documentation: https://www.canva.dev/docs/connect/
- Canva Model Context Protocol (MCP): https://www.canva.dev/docs/mcp/
- OAuth2 Guide: https://www.canva.com/developers/learn/oauth2/

---
*Guide generated automatically. Adjust steps according to your specific Yogatik version and MCP implementation.*