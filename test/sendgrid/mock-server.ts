import { type IncomingMessage, type Server, type ServerResponse, createServer } from "node:http";

type JsonValue = Record<string, unknown> | Array<unknown>;

type DomainAuthRequest = {
	domain: string;
	subdomain: string;
	automatic_security: boolean;
	default: boolean;
};

export type SendGridMailSendRequest = {
	from: { email: string; name?: string };
	reply_to?: { email: string };
	personalizations: Array<{
		to: Array<{ email: string }>;
		custom_args?: { plunk_email_id?: string };
		headers?: Record<string, string>;
	}>;
	subject: string;
	content: Array<{ type: string; value: string }>;
	attachments?: Array<{ filename: string; type: string; content: string; disposition: string }>;
};

export class MockSendGridServer {
	private server: Server | null = null;
	private nextDomainId = 1000;
	public readonly domainAuthRequests: DomainAuthRequest[] = [];
	public readonly validateRequests: string[] = [];
	public readonly deleteRequests: string[] = [];
	public readonly mailSendRequests: SendGridMailSendRequest[] = [];

	public async start(): Promise<string> {
		this.server = createServer((req, res) => {
			void this.route(req, res).catch((error: unknown) => {
				const message = error instanceof Error ? error.message : "Mock SendGrid server error";
				this.json(res, 500, { error: message });
			});
		});

		await new Promise<void>((resolve) => {
			this.server?.listen(0, "127.0.0.1", resolve);
		});

		const address = this.server.address();
		if (!address || typeof address === "string") {
			throw new Error("Mock SendGrid server did not bind to a TCP port");
		}

		return `http://127.0.0.1:${address.port}`;
	}

	public async stop(): Promise<void> {
		if (!this.server) {
			return;
		}

		await new Promise<void>((resolve, reject) => {
			this.server?.close((error) => {
				if (error) {
					reject(error);
					return;
				}
				resolve();
			});
		});
		this.server = null;
	}

	private async route(req: IncomingMessage, res: ServerResponse): Promise<void> {
		const method = req.method ?? "GET";
		const url = new URL(req.url ?? "/", "http://mock.sendgrid.test");

		if (method === "POST" && url.pathname === "/v3/whitelabel/domains") {
			const body = (await this.readJson(req)) as DomainAuthRequest;
			this.domainAuthRequests.push(body);

			const id = this.nextDomainId++;
			this.json(res, 201, {
				id,
				domain: body.domain,
				subdomain: body.subdomain,
				valid: false,
				dns: {
					mail_cname: {
						type: "cname",
						host: `${body.subdomain}.${body.domain}`,
						data: "sendgrid.net",
						valid: false,
					},
					dkim1: {
						type: "cname",
						host: `s1._domainkey.${body.domain}`,
						data: "s1.domainkey.u123456.wl.sendgrid.net",
						valid: false,
					},
					dkim2: {
						type: "cname",
						host: `s2._domainkey.${body.domain}`,
						data: "s2.domainkey.u123456.wl.sendgrid.net",
						valid: false,
					},
				},
			});
			return;
		}

		const validateMatch = url.pathname.match(/^\/v3\/whitelabel\/domains\/(\d+)\/validate$/);
		if (method === "POST" && validateMatch) {
			this.validateRequests.push(validateMatch[1]);
			this.json(res, 200, { valid: true, validation_results: {} });
			return;
		}

		const deleteMatch = url.pathname.match(/^\/v3\/whitelabel\/domains\/(\d+)$/);
		if (method === "DELETE" && deleteMatch) {
			this.deleteRequests.push(deleteMatch[1]);
			res.writeHead(204).end();
			return;
		}

		if (method === "POST" && url.pathname === "/v3/mail/send") {
			const body = (await this.readJson(req)) as SendGridMailSendRequest;
			this.mailSendRequests.push(body);
			res.writeHead(202, { "x-message-id": `sg-message-${this.mailSendRequests.length}`, "content-length": "0" }).end();
			return;
		}

		this.json(res, 404, { error: `Unhandled ${method} ${url.pathname}` });
	}

	private async readJson(req: IncomingMessage): Promise<JsonValue> {
		const chunks: Buffer[] = [];
		for await (const chunk of req) {
			chunks.push(Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk));
		}

		return JSON.parse(Buffer.concat(chunks).toString("utf8")) as JsonValue;
	}

	private json(res: ServerResponse, status: number, body: JsonValue): void {
		const payload = JSON.stringify(body);
		res.writeHead(status, { "content-type": "application/json", "content-length": Buffer.byteLength(payload) });
		res.end(payload);
	}
}
