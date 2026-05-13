import {renderOpenAPIOperationFromMDX} from '@/lib/render-openapi-operation';
import {source} from '@/lib/source';
import type {InferPageType} from 'fumadocs-core/source';

export async function getLLMText(page: InferPageType<typeof source>) {
  const isOpenAPI = Boolean((page.data as {_openapi?: unknown})._openapi);

  if (isOpenAPI) {
    const raw = await page.data.getText('raw');
    const rendered = await renderOpenAPIOperationFromMDX(raw, page.data.title, page.url);
    if (rendered) return rendered;
  }

  const processed = await page.data.getText('processed');
  return `# ${page.data.title} (${page.url})

${processed}`;
}
