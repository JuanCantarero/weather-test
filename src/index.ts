import { McpAgent } from "agents/mcp";
import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { z } from "zod";

// Constants for NWS API
const NWS_API_BASE = "https://api.weather.gov";
const USER_AGENT = "weather-app/1.0";

interface AlertFeature {
	properties: {
		event?: string;
		areaDesc?: string;
		severity?: string;
		description?: string;
		instruction?: string;
	};
}

// Define our MCP agent with tools
export class MyMCP extends McpAgent {
	server = new McpServer({
		name: "Authless Calculator",
		version: "1.0.0",
	});

	async init() {
		// Simple addition tool
		this.server.tool("add", { a: z.number(), b: z.number() }, async ({ a, b }) => ({
			content: [{ type: "text", text: String(a + b) }],
		}));

		// Calculator tool with multiple operations
		this.server.tool(
			"calculate",
			{
				operation: z.enum(["add", "subtract", "multiply", "divide"]),
				a: z.number(),
				b: z.number(),
			},
			async ({ operation, a, b }) => {
				let result: number;
				switch (operation) {
					case "add":
						result = a + b;
						break;
					case "subtract":
						result = a - b;
						break;
					case "multiply":
						result = a * b;
						break;
					case "divide":
						if (b === 0)
							return {
								content: [
									{
										type: "text",
										text: "Error: Cannot divide by zero",
									},
								],
							};
						result = a / b;
						break;
				}
				return { content: [{ type: "text", text: String(result) }] };
			},
		);

		// Weather alerts tool
		this.server.tool(
			"get_alerts",
			{ state: z.string().length(2).describe("Two-letter US state code (e.g. CA, NY, IL)") },
			async ({ state }) => {
				const stateCode = state.toUpperCase();
				const url = `${NWS_API_BASE}/alerts/active/area/${stateCode}`;

				try {
					const response = await fetch(url, {
						headers: {
							"User-Agent": USER_AGENT,
							Accept: "application/geo+json",
						},
					});

					if (!response.ok) {
						return {
							content: [
								{
									type: "text",
									text: `Error fetching alerts: ${response.status} ${response.statusText}`,
								},
							],
						};
					}

					const data = await response.json();
					const features = data.features as AlertFeature[];

					if (!features || features.length === 0) {
						return {
							content: [{ type: "text", text: "No active alerts for this state." }],
						};
					}

					const alerts = features.map((feature) => {
						const props = feature.properties;
						return `Event: ${props.event || "Unknown"}
Area: ${props.areaDesc || "Unknown"}
Severity: ${props.severity || "Unknown"}
Description: ${props.description || "No description available"}
Instructions: ${props.instruction || "No specific instructions provided"}`;
					});

					return {
						content: [{ type: "text", text: alerts.join("\n---\n") }],
					};
				} catch (error) {
					return {
						content: [
							{
								type: "text",
								text: `Error fetching weather alerts: ${error instanceof Error ? error.message : String(error)}`,
							},
						],
					};
				}
			},
		);
	}
}

export default {
	fetch(request: Request, env: Env, ctx: ExecutionContext) {
		const url = new URL(request.url);

		if (url.pathname === "/sse" || url.pathname === "/sse/message") {
			return MyMCP.serveSSE("/sse").fetch(request, env, ctx);
		}

		if (url.pathname === "/mcp") {
			return MyMCP.serve("/mcp").fetch(request, env, ctx);
		}

		return new Response("Not found", { status: 404 });
	},
};
