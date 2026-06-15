import {Keys} from './keys.js';
import {wrapRedis} from '../database/redis.js';
import {prisma} from '../database/prisma.js';
import {DEFAULT_EMAIL_CSS} from '@plunk/shared';

export class ProjectService {
  public static async id(id: string) {
    return wrapRedis(Keys.Project.id(id), async () => {
      return prisma.project.findUnique({where: {id}});
    });
  }

  public static async secret(key: string) {
    return wrapRedis(Keys.Project.secret(key), async () => {
      return prisma.project.findUnique({
        where: {
          secret: key,
        },
      });
    });
  }

  public static async public(key: string) {
    return wrapRedis(Keys.Project.public(key), async () => {
      return prisma.project.findUnique({
        where: {
          public: key,
        },
      });
    });
  }

  public static async getGlobalEmailCss(projectId: string): Promise<string> {
    const project = await prisma.project.findUnique({where: {id: projectId}, select: {globalEmailCss: true}});

    return project?.globalEmailCss ?? DEFAULT_EMAIL_CSS;
  }

  public static async updateGlobalEmailCss(projectId: string, globalEmailCss: string): Promise<string> {
    const project = await prisma.project.update({
      where: {id: projectId},
      data: {globalEmailCss},
      select: {globalEmailCss: true},
    });

    return project.globalEmailCss;
  }
}
