import express from 'express';
import { fileURLToPath } from 'url';
import { Server } from '@modelcontextprotocol/sdk/server/index.js';
import { StreamableHTTPServerTransport } from '@modelcontextprotocol/sdk/server/streamableHttp.js';
import {
  ListToolsRequestSchema,
  CallToolRequestSchema,
} from '@modelcontextprotocol/sdk/types.js';
import { setContext, getContext, setConclusion, getConclusion } from './store.js';
import { bearerAuth } from './auth.js';
import { registerOAuthRoutes } from './oauth.js';

const app = express();
app.use(express.json());
app.use(express.urlencoded({ extended: false }));

// Request logger
app.use((req, _res, next) => {
  console.log(`${req.method} ${req.path} | auth:${req.headers.authorization ? req.headers.authorization.slice(0,20)+'…' : 'none'} | ct:${req.headers['content-type'] ?? '-'}`);
  next();
});

// OAuth endpoints (no auth required — they're the auth layer)
registerOAuthRoutes(app);

// Health
app.get('/health', (_req, res) => res.json({ ok: true }));

// MCP endpoint — bearer auth gates all tool calls.
// Mounted on both `/mcp` and `/` so it works whether the connector URL
// was entered with or without the /mcp suffix.
app.all(['/mcp', '/'], bearerAuth, async (req, res) => {
  const server = new Server(
    { name: 'session-travel', version: '1.0.0' },
    { capabilities: { tools: {} } },
  );

  server.setRequestHandler(ListToolsRequestSchema, async () => ({
    tools: [
      {
        name: 'ship_context',
        description:
          'Ship the current Claude Code session context to the bridge so it can be picked up in a voice session. Call with the assembled session payload.',
        inputSchema: {
          type: 'object' as const,
          properties: {
            payload: { type: 'string', description: 'Assembled session context (conversation thread with tool summaries)' },
          },
          required: ['payload'],
        },
      },
      {
        name: 'pickup_context',
        description:
          'Pick up the session context shipped from Claude Code. Call this at the start of a voice session to load the context. Returns the full context payload or an error message if the slot is empty.',
        inputSchema: {
          type: 'object' as const,
          properties: {},
        },
      },
      {
        name: 'ship_conclusion',
        description:
          'Ship the voice session conclusion back to Claude Code. Synthesize and send a structured markdown document with this exact format:\n\n## Summary\n[One paragraph: what arrived and what was discussed]\n\n## Decisions\n- [Each decision made]\n\n## Next Steps\n- [Each action item]\n\n## Open Questions\n- [Anything unresolved]\n\nCall this tool with the synthesized markdown as the payload.',
        inputSchema: {
          type: 'object' as const,
          properties: {
            payload: { type: 'string', description: 'Structured markdown conclusion document' },
          },
          required: ['payload'],
        },
      },
      {
        name: 'pickup_conclusion',
        description:
          'Pick up the conclusion shipped from a voice session. Returns the decision record markdown or an error message if no conclusion has been shipped yet.',
        inputSchema: {
          type: 'object' as const,
          properties: {},
        },
      },
    ],
  }));

  server.setRequestHandler(CallToolRequestSchema, async (request) => {
    const { name, arguments: args } = request.params;

    switch (name) {
      case 'ship_context': {
        try {
          setContext(args?.payload as string);
          return { content: [{ type: 'text' as const, text: 'Context slot updated. Ready for voice pickup.' }] };
        } catch (e: unknown) {
          return {
            content: [{ type: 'text' as const, text: `Error: ${(e as Error).message}` }],
            isError: true,
          };
        }
      }

      case 'pickup_context': {
        const ctx = getContext();
        if (!ctx) {
          return {
            content: [{ type: 'text' as const, text: 'No context in slot. Run /ship from Claude Code first.' }],
          };
        }
        return { content: [{ type: 'text' as const, text: ctx }] };
      }

      case 'ship_conclusion': {
        try {
          setConclusion(args?.payload as string);
          return { content: [{ type: 'text' as const, text: 'Conclusion slot updated. Pick it up from Claude Code.' }] };
        } catch (e: unknown) {
          return {
            content: [{ type: 'text' as const, text: `Error: ${(e as Error).message}` }],
            isError: true,
          };
        }
      }

      case 'pickup_conclusion': {
        const conclusion = getConclusion();
        if (!conclusion) {
          return {
            content: [{ type: 'text' as const, text: 'No conclusion in slot. Ship one from a voice session first.' }],
          };
        }
        return { content: [{ type: 'text' as const, text: conclusion }] };
      }

      default:
        return {
          content: [{ type: 'text' as const, text: `Unknown tool: ${name}` }],
          isError: true,
        };
    }
  });

  const transport = new StreamableHTTPServerTransport({
    sessionIdGenerator: undefined, // stateless mode
  });

  res.on('close', () => {
    transport.close().catch(() => {});
    server.close().catch(() => {});
  });

  await server.connect(transport);
  await transport.handleRequest(req, res, req.body);
});

const PORT = parseInt(process.env.PORT ?? '3000', 10);

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  app.listen(PORT, () => console.log(`session-travel listening on :${PORT}`));
}

export { app };
