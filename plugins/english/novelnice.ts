import { CheerioAPI, load } from 'cheerio';
import { fetchApi } from '@libs/fetch';
import { Plugin } from '@/types/plugin';
import { NovelStatus } from '@libs/novelStatus';
import { defaultCover } from '@/types/constants';
import { storage } from '@libs/storage';

class Novelnice implements Plugin.PluginBase {
  id = 'novelnice';
  name = 'Novelnice';
  version = '2.1.0';
  icon = 'src/en/novelnice/icon.png'; // Update path if your local directory layout differs
  site = 'https://novelnice.com/';
  webStorageUtilized = true;

  // Handles standard fetching, error management, and Cloudflare page check detection
  async getCheerio(url: string): Promise<CheerioAPI> {
    const r = await fetchApi(url);
    if (!r.ok) {
      throw new Error(
        'Could not reach site (' + r.status + ') try to open in webview.',
      );
    }
    const $ = load(await r.text());

    if ($('title').text().includes('Performing security verification') || $('title').text().includes('Cloudflare')) {
      throw new Error('Cloudflare Turnstile security is blocking requests. Please solve verification in WebView.');
    }

    return $;
  }

  // 1. POPULAR / LATEST BROWSE FUNCTION
  async popularNovels(
    pageNo: number,
    options: Plugin.PopularNovelsOptions
  ): Promise<Plugin.NovelItem[]> {
    const url = pageNo === 1 ? this.site : `${this.site}page/${pageNo}/`;
    const $ = await this.getCheerio(url);
    const novels: Plugin.NovelItem[] = [];

    $('.page-item-detail').each((_, el) => {
      const $el = $(el);
      const novelName = $el.find('.post-title h3 a').text().trim();
      const novelHref = $el.find('.post-title h3 a').attr('href');

      if (!novelHref) return;
      // Convert absolute URL string into a relative path string matching framework specifications
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

  // 2. NOVEL DETAILS & DYNAMIC AJAX CHAPTER EXTRACTION
  async parseNovel(novelPath: string): Promise<Plugin.SourceNovel> {
    const $ = await this.getCheerio(this.site + novelPath);
    
    const novel: Partial<Plugin.SourceNovel> = {
      path: novelPath,
      chapters: [],
    };

    novel.name = $('.post-title h1').text().trim() || 'No Title Found';
    
    const coverUrl = $('.summary_image img').attr('src') || $('.summary_image img').attr('data-src');
    novel.cover = coverUrl ? new URL(coverUrl, this.site).href : defaultCover;

    novel.author = $('.author-content a').text().trim() || 'Unknown';
    
    const rawStatus = $('.post-status .summary-content').text().trim().toLowerCase();
    novel.status = rawStatus.includes('ongoing') ? NovelStatus.Ongoing : NovelStatus.Completed;

    const summaryElement = $('.description-summary .summary__content');
    summaryElement.find('.c-content-readmore, script').remove();
    novel.summary = summaryElement.text().trim() || 'Summary Not Found';

    // Solve AJAX Chapter Hook Block
    const mangaId = $('#manga-chapters-holder').attr('data-id');
    if (mangaId) {
      const ajaxUrl = `${this.site}wp-admin/admin-ajax.php`;
      const params = new URLSearchParams({
        action: 'ajax_manga_list',
        id: mangaId,
      });

      // Execute POST request to get the complete raw chapter HTML payload
      const ajaxResponse = await fetchApi(`${ajaxUrl}?${params.toString()}`, {
        method: 'POST',
      });

      if (ajaxResponse.ok) {
        const ajaxHtml = await ajaxResponse.text();
        const $ajax = load(ajaxHtml);

        $ajax('.wp-manga-chapter a, .chapter-item a').each((_, el) => {
          const chapterName = $ajax(el).text().trim();
          const chapterHref = $ajax(el).attr('href');

          if (chapterName && chapterHref) {
            const chapterPath = new URL(chapterHref, this.site).pathname.substring(1);
            novel.chapters!.push({
              name: chapterName,
              path: chapterPath,
            });
          }
        });

        // Ensure chronological structure tracking: oldest chapters first
        novel.chapters!.reverse();
      }
    }

    return novel as Plugin.SourceNovel;
  }

  // 3. READING CONTENT PARSING & CLEANUP
  async parseChapter(chapterPath: string): Promise<string> {
    const $ = await this.getCheerio(this.site + chapterPath);
    const chapterText = $('.text-left');

    // Clean up structural junk elements
    chapterText.find('#text-chapter-toolbar, script, style, iframe, .ads-content').remove();

    // Strip out matching watermark paragraphs cleanly
    chapterText.find('p').each((_, el) => {
      const $p = $(el);
      const text = $p.text();
      if (text.includes('Content source:') || text.includes('WebNovel.com')) {
        $p.remove();
      }
    });

    return chapterText.html() || '';
  }

  // 4. SEARCH QUERY DISPATCH
  async searchNovels(searchTerm: string, page: number): Promise<Plugin.NovelItem[]> {
    const params = new URLSearchParams({
      s: searchTerm,
      post_type: 'wp-manga',
    });
    
    const url = `${this.site}page/${page}/?${params.toString()}`;
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
}

export default new Novelnice();
            
