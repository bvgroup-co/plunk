import {Controller, Delete, Get, Middleware, Patch, Post} from '@overnightjs/core';
import {TemplateType} from '@plunk/db';
import {TemplateSchemas} from '@plunk/shared';
import type {NextFunction, Request, Response} from 'express';

import {requireAuth, requireEmailVerified} from '../middleware/auth.js';
import {DomainService} from '../services/DomainService.js';
import {TemplateService} from '../services/TemplateService.js';
import {CatchAsync} from '../utils/asyncHandler.js';

@Controller('templates')
export class Templates {
  /**
   * GET /templates
   * List all templates for the authenticated project
   */
  @Get('')
  @Middleware([requireAuth, requireEmailVerified])
  @CatchAsync
  public async list(req: Request, res: Response, _next: NextFunction) {
    const auth = res.locals.auth;
    const page = parseInt(req.query.page as string) || 1;
    const pageSize = Math.min(parseInt(req.query.pageSize as string) || 20, 100);
    const search = req.query.search as string | undefined;
    const type = req.query.type as TemplateType | undefined;

    const result = await TemplateService.list(auth.projectId!, page, pageSize, search, type);

    return res.status(200).json(result);
  }

  /**
   * GET /templates/:id
   * Get a specific template by ID
   */
  @Get(':id')
  @Middleware([requireAuth, requireEmailVerified])
  @CatchAsync
  public async get(req: Request, res: Response, _next: NextFunction) {
    const auth = res.locals.auth;
    const templateId = req.params.id;

    if (!templateId) {
      return res.status(400).json({error: 'Template ID is required'});
    }

    const template = await TemplateService.get(auth.projectId!, templateId);

    return res.status(200).json(template);
  }

  /**
   * POST /templates
   * Create a new template
   */
  @Post('')
  @Middleware([requireAuth, requireEmailVerified])
  @CatchAsync
  public async create(req: Request, res: Response, _next: NextFunction) {
    const auth = res.locals.auth;
    const data = TemplateSchemas.create.parse(req.body);

    // Verify domain ownership and verification
    await DomainService.verifyEmailDomain(data.from, auth.projectId!);

    const template = await TemplateService.create(auth.projectId!, data);

    return res.status(201).json(template);
  }

  /**
   * PATCH /templates/:id
   * Update a template
   */
  @Patch(':id')
  @Middleware([requireAuth, requireEmailVerified])
  @CatchAsync
  public async update(req: Request, res: Response, _next: NextFunction) {
    const auth = res.locals.auth;
    const templateId = req.params.id;
    const data = TemplateSchemas.update.parse(req.body);

    if (!templateId) {
      return res.status(400).json({error: 'Template ID is required'});
    }

    // Verify domain ownership and verification if 'from' is being updated
    if (data.from) {
      await DomainService.verifyEmailDomain(data.from, auth.projectId!);
    }

    const template = await TemplateService.update(auth.projectId!, templateId, data);

    return res.status(200).json(template);
  }

  /**
   * DELETE /templates/:id
   * Delete a template
   */
  @Delete(':id')
  @Middleware([requireAuth, requireEmailVerified])
  @CatchAsync
  public async delete(req: Request, res: Response, _next: NextFunction) {
    const auth = res.locals.auth;
    const templateId = req.params.id;

    if (!templateId) {
      return res.status(400).json({error: 'Template ID is required'});
    }

    await TemplateService.delete(auth.projectId!, templateId);

    return res.status(204).send();
  }

  /**
   * POST /templates/:id/duplicate
   * Duplicate a template
   */
  @Post(':id/duplicate')
  @Middleware([requireAuth, requireEmailVerified])
  @CatchAsync
  public async duplicate(req: Request, res: Response, _next: NextFunction) {
    const auth = res.locals.auth;
    const templateId = req.params.id;

    if (!templateId) {
      return res.status(400).json({error: 'Template ID is required'});
    }

    const template = await TemplateService.duplicate(auth.projectId!, templateId);

    return res.status(201).json(template);
  }

  /**
   * GET /templates/:id/usage
   * Get template usage statistics
   */
  @Get(':id/usage')
  @Middleware([requireAuth, requireEmailVerified])
  @CatchAsync
  public async getUsage(req: Request, res: Response, _next: NextFunction) {
    const auth = res.locals.auth;
    const templateId = req.params.id;

    if (!templateId) {
      return res.status(400).json({error: 'Template ID is required'});
    }

    const usage = await TemplateService.getUsage(auth.projectId!, templateId);

    return res.status(200).json(usage);
  }
}
