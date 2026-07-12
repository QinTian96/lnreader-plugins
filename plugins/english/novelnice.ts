import { CheerioAPI, load } from 'cheerio';
import { fetchApi } from '@libs/fetch';
import { Plugin } from '@/types/plugin';
import { NovelStatus } from '@libs/novelStatus';
import { defaultCover } from '@/types/constants';

class Novelnice implements Plugin.PluginBase {
  id = 'novelnice';
  name = 'Novelnice';
  version = '2.2.3';
  icon = 'src/en/novelnice/icon.png';
  site = 'https://novelnice.com/';
  webStorageUtilized = true;

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

  // 2. NOVEL DETAILS & EXTENSIVELY CORRECTED MULTI-PAGE AJAX CHAPTER EXTRACTOR
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

    // Extract Genres dynamically out of the unique .post-content_item list sequence
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

    // RE-ENGINEERED AJAX PAGINATION LOOP
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
      const $ajax = load(ajaxHtml);
      
      // Target ALL returned hyperlinks inside the isolated pagination response text
      const foundAnchors = $ajax('a');

      if (foundAnchors.length === 0) {
        hasMoreChapters = false;
        break;
      }

      let parsedOnThisPage = 0;

      foundAnchors.each((_, el) => {
        const chapterName = $ajax(el).text().trim();
        const chapterHref = $ajax(el).attr('href');

        // Capture story links while safely ignoring pagination markers (e.g. ">>", "2")
        if (chapterName && chapterHref && !chapterHref.includes('?t=')) {
          const chapterPath = new URL(chapterHref, this.site).pathname.substring(1);
          
          if (!seenPaths.has(chapterPath)) {
            seenPaths.add(chapterPath);
            parsedOnThisPage++;
            
            novel.chapters!.push({
              name: chapterName,
              path: chapterPath,
            });
          }
        }
      });

      // Break loop if zero new chapters are successfully handled to avoid an infinite execution lock
      if (parsedOnThisPage === 0) {
        hasMoreChapters = false;
        break;
      }

      chapterPage++;
    }

    // Sort chapters in oldest-to-newest configuration sequence
    novel.chapters!.reverse();

    return novel as Plugin.SourceNovel;
  }

  // 3. READING CONTENT PARSING & CLEANUP
  async parseChapter(chapterPath: string): Promise<string> {
    const $ = await this.getCheerio(this.site + chapterPath);
    const chapterText = $('.text-left');

    chapterText.find('#text-chapter-toolbar, script, style, iframe, .ads-content').remove();

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
