import { z } from 'zod';
import { requestJson, type UpstreamRequestOptions } from '../../http.js';
import { parseUpstream } from '../../../modules/catalogs/validation.js';
import type { MediaAsset } from '../../../modules/catalogs/types.js';

export const mediaSearchSchema = z.object({
  q: z.string().trim().min(2).max(120), page: z.number().int().min(1).max(100).default(1),
  pageSize: z.number().int().min(1).max(100).default(25),
  mediaType: z.enum(['image', 'video', 'audio']).default('image'),
}).strict();
const envelope = z.object({ collection: z.object({
  items: z.array(z.object({ data: z.array(z.object({
    nasa_id: z.string().min(1), title: z.string().min(1).max(500), media_type: z.enum(['image', 'video', 'audio']),
    center: z.string().optional(), photographer: z.string().optional(), secondary_creator: z.string().optional(),
    description: z.string().optional(), date_created: z.string().optional(),
  })).min(1), links: z.array(z.object({ href: z.string(), rel: z.string().optional() })).optional() })),
  metadata: z.object({ total_hits: z.number().int().nonnegative() }),
}) });

function previewUrl(raw: string | undefined): string | null {
  if (!raw) return null;
  try {
    const url = new URL(raw);
    return url.protocol === 'https:' && url.hostname === 'images-assets.nasa.gov' && !url.username && !url.password && !url.port ? url.href : null;
  } catch { return null; }
}

export class NasaImagesProvider {
  constructor(private readonly options: UpstreamRequestOptions = {}) {}
  async search(input: z.input<typeof mediaSearchSchema>): Promise<{ items: MediaAsset[]; total: number; page: number; pageSize: number }> {
    const query = mediaSearchSchema.parse(input);
    const url = new URL('https://images-api.nasa.gov/search');
    url.search = new URLSearchParams({ q: query.q, page: String(query.page), page_size: String(query.pageSize), media_type: query.mediaType }).toString();
    const result = parseUpstream(envelope, await requestJson(url, this.options));
    return { items: result.collection.items.slice(0, query.pageSize).map((item) => {
      const media = item.data[0]!;
      return {
        externalIdentifier: media.nasa_id, title: media.title, assetType: media.media_type.toUpperCase() as MediaAsset['assetType'],
        sourceUrl: `https://images.nasa.gov/details/${encodeURIComponent(media.nasa_id)}`,
        previewUrl: previewUrl(item.links?.find((link) => link.rel === 'preview')?.href),
        attribution: [media.center ? `NASA/${media.center}` : 'NASA', media.photographer, media.secondary_creator].filter(Boolean).join('; '),
        license: 'NASA media usage guidelines; item-specific third-party rights may apply: https://www.nasa.gov/nasa-brand-center/images-and-media/',
        description: media.description ?? null, dateCreated: media.date_created ?? null,
      };
    }), total: result.collection.metadata.total_hits, page: query.page, pageSize: query.pageSize };
  }
}
