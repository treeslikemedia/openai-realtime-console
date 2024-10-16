import { WebSocketServer } from 'ws';
import { RealtimeClient } from '@openai/realtime-api-beta';

const ins = `The user's name is MR. BEAN and they would like you to start every sentence with, "Your Honorable Mister Bean."`;
export class RealtimeRelay {
  constructor(apiKey) {
    this.apiKey = apiKey;
    this.sockets = new WeakMap();
    this.wss = null;
  }

  listen(port) {
    this.wss = new WebSocketServer({ port });
    this.wss.on('connection', this.connectionHandler.bind(this));
    this.log(`Listening on ws://localhost:${port}`);
  }

  async connectionHandler(ws, req) {
    if (!req.url) {
      this.log('No URL provided, closing connection.');
      ws.close();
      return;
    }

    const url = new URL(req.url, `http://${req.headers.host}`);
    const pathname = url.pathname;

    if (pathname !== '/') {
      this.log(`Invalid pathname: "${pathname}"`);
      ws.close();
      return;
    }

    // Instantiate new client
    this.log(`Connecting with key "${this.apiKey.slice(0, 3)}..."`);
    const client = new RealtimeClient({ apiKey: this.apiKey });

    // Add backend-only tools here
    this.addBackendTools(client);

    // Relay: OpenAI Realtime API Event -> Browser Event
    client.realtime.on('server.*', (event) => {
      //Prevent session information (instructions and tools) from being sent to the client
      if(event.type !== 'session.updated') {
        this.log(`Relaying "${event.type}" to Client`);
        ws.send(JSON.stringify(event));
      }
    });

    client.realtime.on('close', () => ws.close());

    // Relay: Browser Event -> OpenAI Realtime API Event
    ws.on('message', async (data) => {
      client.updateSession({ instructions: ins });
      try {
        const event = JSON.parse(data);
        this.log(`Received "${event.type}" from frontend`);
        this.log(`Relaying "${event.type}" to OpenAI`);
 
        await client.realtime.send(event.type, event);
      
      } catch (e) {
        console.error(e.message);
        this.log(`Error parsing event from client: ${data}`);
      }
    });

    ws.on('close', () => client.disconnect());

    // Connect to OpenAI Realtime API
    try {
      this.log(`Connecting to OpenAI...`);
      await client.connect();
    } catch (e) {
      this.log(`Error connecting to OpenAI: ${e.message}`);
      ws.close();
      return;
    }

    this.log(`Connected to OpenAI successfully!`);
  }



  /**
   * Define and add backend-only tools to the RealtimeClient
   * These tools are for backend use only and should never be exposed to the frontend.
   */
  addBackendTools(client) {
    client.addTool(
      {
        name: 'test_tool',
        description: 'Logs a message on the server for debugging.',
        parameters: {
          type: 'object',
          properties: {
            key: {
              type: 'string',
              description: 'The key to log.',
            },
            value: {
              type: 'string',
              description: 'The value to log.',
            },
          },
          required: ['key', 'value'],
        },
      },
      async ({ key, value }) => {
        this.log(`Backend test_tool invoked: key=${key}, value=${value}`);
        return { ok: true }; // You can return any result if needed
      }
    );
  }

  /**
   * Handles test_tool invocation
   */
  async testTool(data) {
    this.log(`Test tool executed with key: ${data.key}, value: ${data.value}`);
    // Process the test tool logic here (e.g., log, interact with services, etc.)
  }

  log(...args) {
    console.log(`[RealtimeRelay]`, ...args);
  }
}
