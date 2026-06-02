import { Controller, Get, Middleware, Post } from "@overnightjs/core";
import { IdentitySchemas, UtilitySchemas } from "@plunk/shared";
import type { Request, Response } from "express";
import { NotFound } from "../exceptions";
import { type IJwt, isAuthenticated } from "../middleware/auth";
import { DomainService } from "../services/EmailProviderService";
import { ProjectService } from "../services/ProjectService";
import { Keys } from "../services/keys";
import { redis } from "../services/redis";

@Controller("identities")
export class Identities {
	@Get("id/:id")
	@Middleware([isAuthenticated])
	public async getVerification(req: Request, res: Response) {
		const { id } = UtilitySchemas.id.parse(req.params);

		const project = await ProjectService.id(id);

		if (!project) {
			throw new NotFound("project");
		}

		if (!project.email) {
			return res.status(200).json({ success: false });
		}

		const details = await DomainService.details(project);

		return res.status(200).json(details);
	}

	@Middleware([isAuthenticated])
	@Post("create")
	public async addIdentity(req: Request, res: Response) {
		const { id, email } = IdentitySchemas.create.parse(req.body);
		const { userId } = res.locals.auth as IJwt;
		const project = await ProjectService.id(id);

		if (!project) {
			throw new NotFound("project");
		}

		const details = await DomainService.create(project, email);

		await redis.del(Keys.User.projects(userId));
		await redis.del(Keys.Project.id(project.id));

		return res.status(200).json({ success: true, ...details });
	}

	@Middleware([isAuthenticated])
	@Post("reset")
	public async resetIdentity(req: Request, res: Response) {
		const { id } = UtilitySchemas.id.parse(req.body);
		const { userId } = res.locals.auth as IJwt;
		const project = await ProjectService.id(id);

		if (!project) {
			throw new NotFound("project");
		}

		await DomainService.delete(project);

		await redis.del(Keys.User.projects(userId));
		await redis.del(Keys.Project.id(project.id));

		return res.status(200).json({ success: true });
	}

	@Post("update")
	public async updateIdentitiesApi(_req: Request, res: Response) {
		await new Identities().updateIdentities();
		return res.status(200).json({ success: true });
	}

	public async updateIdentities() {
		await DomainService.updateAll();
	}
}
