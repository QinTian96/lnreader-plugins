import { CheerioAPI, load } from 'cheerio';
import { fetchApi } from '@libs/fetch';
import { Plugin } from '@/types/plugin';
import { NovelStatus } from '@libs/novelStatus';
import { Filters, FilterTypes } from '@libs/filterInputs';
import { defaultCover } from '@/types/constants';

class NovelNice implements Plugin.PluginBase {
  id = 'novelnice';
  name = 'NovelNice';
  version = '1.0.0';
  icon = 'src/en/novelnice/icon.png';
  site = 'https://novelnice.com/';
  webStorageUtilized = false;
  novelList = new Set<string>();

  async getCheerio(url: string, search: boolean): Promise<CheerioAPI> {
    const r = await fetchApi(url);
    if (!r.ok && search !== true)
      throw new Error(
        'Could not reach site (' + r.status + ') try to open in webview.',
      );
    const $ = load(await r.text());

    if ($('title').text().includes('Cloudflare')) {
      throw new Error('Cloudflare is blocking requests. Try again later.');
    }

    return $;
  }

  parseNovels(
    loadedCheerio: CheerioAPI,
    selector = '.page-item-detail',
    isFirstPage = false,
  ): Plugin.NovelItem[] {
    const novels: Plugin.NovelItem[] = [];

    const elements = loadedCheerio(selector).toArray();
    for (const el of elements) {
      const $el = loadedCheerio(el);

      const novelName = $el.find('.post-title a').text().trim();
      const novelPath = $el.find('.post-title a').attr('href');

      if (!novelPath) continue;

      const path = new URL(novelPath, this.site).pathname.substring(1);

      if (!isFirstPage) {
        if (this.novelList.has(path)) continue;
        this.novelList.add(path);
      } else {
        this.novelList.add(path);
      }

      const imgElement = $el.find('img');
      const rawSrc = imgElement.attr('data-src') ?? imgElement.attr('src');
      const novelCover = rawSrc
        ? new URL(rawSrc, this.site).href
        : defaultCover;

      novels.push({
        name: novelName,
        cover: novelCover,
        path,
      });
    }

    return novels;
  }

  async popularNovels(
    pageNo: number,
    {
      showLatestNovels,
    }: Plugin.PopularNovelsOptions<typeof this.filters>,
  ): Promise<Plugin.NovelItem[]> {
    if (pageNo === 1) {
      this.novelList.clear();
    }

    // Sort order based on latest or general popularity updates
    const orderBy = showLatestNovels ? 'latest' : 'views';
    const url = `${this.site}manga-list/page/${pageNo}/?m_orderby=${orderBy}`;

    const loadedCheerio = await this.getCheerio(url, false);
    return this.parseNovels(loadedCheerio, '.page-item-detail', pageNo === 1);
  }

  async parseNovel(novelPath: string): Promise<Plugin.SourceNovel> {
    const $ = await this.getCheerio(this.site + novelPath, false);
    const baseUrl = this.site;

    const novel: Partial<Plugin.SourceNovel> = {
      path: novelPath,
    };

    novel.name = $('.post-title h1').text().trim() || 'No Title Found';
    
    const coverUrl = $('.summary_image img').attr('data-src') ?? $('.summary_image img').attr('src');
    novel.cover = coverUrl ? new URL(coverUrl, baseUrl).href : defaultCover;

    const genresArray: string[] = [];
    $('.genres-content a').each((_, el) => {
      genresArray.push($(el).text().trim());
    });
    novel.genres = genresArray.join(',');

    const summary = $('.description-summary');
    summary.find('br').replaceWith('\n');
    novel.summary = summary.text().split('\n').map(line => line.trim()).join('\n').trim() || 'Summary Not Found';

    novel.author = $('.author-content a').text().trim() || 'Unknown';

    const rawStatus = $('.post-status .summary-content').text().trim();
    const map: Record<string, string> = {
      ongoing: NovelStatus.Ongoing,
      completed: NovelStatus.Completed,
    };
    novel.status = map[rawStatus.toLowerCase()] ?? NovelStatus.Unknown;

    const chapters: Plugin.ChapterItem[] = [];
    $('.wp-manga-chapter a').each((_, el) => {
      const chapterName = $(el).text().trim();
      const chapterUrl = $(el).attr('href');
      if (chapterUrl) {
        chapters.push({
          name: chapterName,
          path: new URL(chapterUrl, baseUrl).pathname.substring(1),
        });
      }
    });

    // Sub-pages store chapters newest-first, flip them to chronological reading layout
    novel.chapters = chapters.reverse();

    return novel as Plugin.SourceNovel;
  }

  async parseChapter(chapterPath: string): Promise<string> {
    const url = this.site + chapterPath;
    const loadedCheerio = await this.getCheerio(url, false);

    const chapterText = loadedCheerio('.text-left');
    chapterText.find('script, style').remove(); // Strip scripts or ads styling inside the container

    return chapterText.html() || '';
  }

  async searchNovels(
    searchTerm: string,
    page: number,
  ): Promise<Plugin.NovelItem[]> {
    if (page === 1) {
      this.novelList.clear();
    }
    const url = `${this.site}page/${page}/?s=${encodeURIComponent(searchTerm)}&post_type=wp-manga`;
    const loadedCheerio = await this.getCheerio(url, true);

    return this.parseNovels(loadedCheerio, '.c-tabs-item__content', page === 1);
  }

  filters = {} satisfies Filters;
}

export default new NovelNice();
        
