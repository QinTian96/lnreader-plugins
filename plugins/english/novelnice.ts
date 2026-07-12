import { fetchApi } from '@libs/fetch';
import { Plugin } from '@/types/plugin';
import { Filters } from '@libs/filterInputs';
import { load as loadCheerio } from 'cheerio';
import { defaultCover } from '@libs/defaultCover';
import { NovelStatus } from '@libs/novelStatus';

class NovelnicePlugin implements Plugin.PluginBase {
  id = 'novelnice';
  name = 'Novelnice';
  icon = 'src/en/novelnice/icon.png';
  site = 'https://novelnice.com/';
  version = '2.4.5';
  filters: Filters | undefined = undefined;
  imageRequestInit?: Plugin.ImageRequestInit | undefined = undefined;
  webStorageUtilized?: boolean = true;

  private async getCheerio(url: string) {
    const r = await fetchApi(url);
    if (!r.ok) {
      throw new Error(
        'Could not reach site (' + r.status + ') try to open in webview.',
      );
    }
    const html = await r.text();
    const $ = loadCheerio(html);

    if (
      $('title').text().includes('Performing security verification') || 
      $('title').text().includes('Cloudflare')
    ) {
      throw new Error('Cloudflare Turnstile blocking requests. Please pass validation via WebView.');
    }

    return $;
  }

  // 1. POPULAR / LATEST NOVELS BROWSE
  async popularNovels(
    pageNo: number,
    {
      showLatestNovels,
      filters,
    }: Plugin.PopularNovelsOptions<typeof this.filters>,
  ): Promise<Plugin.NovelItem[]> {
    const url = pageNo === 1 ? this.site : `${this.site}page/${pageNo}/`;
    const $ = await this.getCheerio(url);
    const novels: Plugin.NovelItem[] = [];

    $('.page-item-detail').each((_, el) => {
      const $el = $(el);
      const novelName = $el.find('.post-title h3 a').text().trim();
      const novelHref = $el.find('.post-title h3 a').attr('href');

      if (!novelHref) return;
      const path = new URL(novelHref, this.site).pathname.substring(1);

      const imgElement = $el.find('.item-thumb img');
      const rawSrc = imgElement.attr('src') || imgElement.attr('data-src');
      const novelCover = rawSrc ? new URL(rawSrc, this.site).href : defaultCover;

      novels.push({
        name: novelName,
        cover: novelCover,
        path,
      });
    });

    return novels;
  }

  // 2. NOVEL DETAILS & DYNAMIC MULTI-PAGE AJAX CHAPTER SCRAPER
  async parseNovel(novelPath: string): Promise<Plugin.SourceNovel> {
    const $ = await this.getCheerio(this.site + novelPath);
    
    const novel: Plugin.SourceNovel = {
      path: novelPath,
      name: $('.post-title h1').text().trim() || 'Untitled',
    };

    const coverUrl = $('.summary_image img').attr('src') || $('.summary_image img').attr('data-src');
    novel.cover = coverUrl ? new URL(coverUrl, this.site).href : defaultCover;

    novel.author = $('.author-content a').text().trim() || 'Unknown';
    
    const rawStatus = $('.post-status .summary-content').text().trim().toLowerCase();
    novel.status = rawStatus.includes('ongoing') ? NovelStatus.Ongoing : NovelStatus.Completed;

    const summaryElement = $('.description-summary .summary__content');
    summaryElement.find('.c-content-readmore, script').remove();
    novel.summary = summaryElement.text().trim() || 'Summary Not Found';

    $('.post-content_item').each((_, el) => {
      const heading = $(el).find('.summary-heading h5').text().trim().toLowerCase();
      
      if (heading.includes('genre') || heading.includes('tag')) {
        novel.genres = $(el)
          .find('.summary-content a')
          .map((_, tagEl) => $(tagEl).text().trim())
          .toArray()
          .join(',');
      }
    });

    const chapters: Plugin.ChapterItem[] = [];
    let chapterPage = 1;
    let hasMoreChapters = true;
    const seenPaths = new Set<string>();

    while (hasMoreChapters) {
      const ajaxUrl = `${this.site}${novelPath}/ajax/chapters/?t=${chapterPage}`;

      const ajaxResponse = await fetchApi(ajaxUrl, {
        method: 'POST',
        headers: {
          'Accept': '*/*',
          'X-Requested-With': 'XMLHttpRequest',
          'Referer': this.site + novelPath
        }
      });

      if (!ajaxResponse.ok) {
        break; 
      }

      const ajaxHtml = await ajaxResponse.text();
      const $ajax = loadCheerio(ajaxHtml);
      const foundAnchors = $ajax('a');

      if (foundAnchors.length === 0) {
        hasMoreChapters = false;
        break;
      }

      let parsedOnThisPage = 0;

      foundAnchors.each((_, el) => {
        const chapterName = $ajax(el).text().trim();
        const chapterHref = $ajax(el).attr('href');

        if (chapterName && chapterHref && !chapterHref.includes('?t=')) {
          const chapterPath = new URL(chapterHref, this.site).pathname.substring(1);
          
          if (!seenPaths.has(chapterPath)) {
            seenPaths.add(chapterPath);
            parsedOnThisPage++;
            
            // Fixed payload parameters to strictly match documentation standards
            chapters.push({
              name: chapterName,
              path: chapterPath,
              chapterNumber: chapters.length + 1
            });
          }
        }
      });

      if (parsedOnThisPage === 0) {
        hasMoreChapters = false;
        break;
      }

      chapterPage++;
    }

    // Sort chapters layout chronologically
    novel.chapters = chapters.reverse();
    return novel;
  }

  // 3. READING CONTENT PARSING & CLEANUP
  async parseChapter(chapterPath: string): Promise<string> {
    const $ = await this.getCheerio(this.site + chapterPath);
    const chapterTextElement = $('.text-left');

    chapterTextElement.find('#text-chapter-toolbar, script, style, iframe, .ads-content').remove();

    chapterTextElement.find('p').each((_, el) => {
      const $p = $(el);
      const text = $p.text();
      if (text.includes('Content source:') || text.includes('WebNovel.com')) {
        $p.remove();
      }
    });

    return chapterTextElement.html() || '';
  }

  // 4. SEARCH QUERY DISPATCH
  async searchNovels(
    searchTerm: string,
    pageNo: number,
  ): Promise<Plugin.NovelItem[]> {
    const params = new URLSearchParams({
      s: searchTerm,
      post_type: 'wp-manga',
    });
    
    const url = `${this.site}page/${pageNo}/?${params.toString()}`;
    const $ = await this.getCheerio(url);
    const novels: Plugin.NovelItem[] = [];

    $('.page-item-detail').each((_, el) => {
      const $el = $(el);
      const novelName = $el.find('.post-title h3 a').text().trim();
      const novelHref = $el.find('.post-title h3 a').attr('href');

      if (!novelHref) return;
      const path = new URL(novelHref, this.site).pathname.substring(1);

      const imgElement = $el.find('.item-thumb img');
      const rawSrc = imgElement.attr('src') || imgElement.attr('data-src');
      const novelCover = rawSrc ? new URL(rawSrc, this.site).href : defaultCover;

      novels.push({
        name: novelName,
        cover: novelCover,
        path,
      });
    });

    return novels;
  }

  resolveUrl = (path: string, isNovel?: boolean) =>
    this.site + path;
}

export default new NovelnicePlugin();
