import { CheerioAPI, load } from 'cheerio';
import { fetchApi } from '@libs/fetch';
import { Plugin } from '@/types/plugin';
import { NovelStatus } from '@libs/novelStatus';
import { defaultCover } from '@/types/constants';

class NovelNicePlugin implements Plugin.PluginBase {
  id = 'novelnice';
  name = 'NovelNice';
  version = '1.4.4';
  icon = 'src/en/novelnice/icon.png';
  site = 'https://novelnice.com/';

  private headers = {
    'User-Agent': 'Mozilla/5.0 (Linux; Android 10; K) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/140.0.0.0 Mobile Safari/537.36',
  };

  // Centralized request helper mimicking the stable architecture
  async getCheerio(url: string): Promise<CheerioAPI> {
    const r = await fetchApi(url, { headers: this.headers });
    if (!r.ok) throw new Error('Could not reach site (' + r.status + ')');
    
    const body = await r.text();
    const $ = load(body);

    if ($('title').text().includes('Cloudflare')) {
      throw new Error('Cloudflare is blocking requests. Open in WebView to fix.');
    }
    return $;
  }

  async parseNovel(novelPath: string): Promise<Plugin.SourceNovel> {
    const url = `${this.site}read/${novelPath.split('/').pop()}/`;
    const $ = await this.getCheerio(url);

    const mangaId = $("#manga-chapters-holder")?.attr("data-id");

    const novel: Plugin.SourceNovel = {
      path: novelPath,
      name: $(".post-title h1")?.text()?.trim() || "Unknown",
      cover: $(".summary_image img")?.attr("data-src") || $(".summary_image img")?.attr("src") || defaultCover,
      summary: $(".summary__content")?.text()?.trim() || "No summary.",
      author: $(".author-content a")?.text()?.trim() || "Unknown",
      status: $(".post-status")?.text()?.toLowerCase()?.includes("ongoing") ? NovelStatus.Ongoing : NovelStatus.Completed,
      genres: $(".genres-content a")?.map((_, el) => $(el).text().trim()).get() || [],
      chapters: []
    };

    if (mangaId) {
      // Using AJAX endpoint identified in previous network logs
      const ajaxUrl = `${this.site}wp-admin/admin-ajax.php`;
      try {
        const response = await fetchApi(ajaxUrl, {
          method: 'POST',
          headers: { 
            ...this.headers, 
            'Content-Type': 'application/x-www-form-urlencoded',
            'Referer': url, 
            'X-Requested-With': 'XMLHttpRequest' 
          },
          body: `action=manga_get_chapters&manga=${mangaId}`
        });
        const ajaxBody = await response.text();
        const $c = load(ajaxBody);
        $c("li.wp-manga-chapter a").each((_, el) => {
          novel.chapters.push({
            name: $c(el).text().trim(),
            path: $c(el).attr("href")?.replace(this.site, "") || "",
            chapterNumber: novel.chapters.length + 1,
          });
        });
        novel.chapters.reverse();
      } catch (e) {
        console.error("AJAX chapter loading failed:", e);
      }
    }
    return novel;
  }

  async parseChapter(chapterPath: string): Promise<string> {
    const url = `${this.site}${chapterPath}`;
    const $ = await this.getCheerio(url);
    return $(".reading-content")?.html() || "";
  }

  async searchNovels(searchTerm: string, page: number): Promise<Plugin.NovelItem[]> {
    const url = `${this.site}?s=${encodeURIComponent(searchTerm)}&post_type=wp-manga&page=${page}`;
    const $ = await this.getCheerio(url);
    const novels: Plugin.NovelItem[] = [];

    $(".c-tabs-item__content").each((_, el) => {
      const $el = $(el);
      const titleEl = $el.find(".post-title a").first();
      const name = titleEl?.text()?.trim();
      const path = titleEl?.attr("href")?.replace(this.site, "");
      const cover = $el.find("img")?.attr("data-src") || $el.find("img")?.attr("src") || defaultCover;
      
      if (name && path) novels.push({ name, path, cover });
    });
    return novels;
  }
}

export default new NovelFire(); // Note: class renamed to match structure, change accordingly
