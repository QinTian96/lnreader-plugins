import { fetchText } from '@libs/fetch';
import { Plugin } from '@/types/plugin';
import { load as loadCheerio } from 'cheerio';
import { defaultCover } from '@libs/defaultCover';
import { NovelStatus } from '@libs/novelStatus';

class NovelNicePlugin implements Plugin.PluginBase {
    id = "novelnice";
    name = "NovelNice";
    icon = "src/en/novelnice/icon.png";
    site = "https://novelnice.com/";
    version = "1.1.3";

    // Reusable headers
    private headers = {
        'User-Agent': 'Mozilla/5.0 (Linux; Android 10; K) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Mobile Safari/537.36',
    };

    async popularNovels(pageNo: number, options: Plugin.PopularNovelsOptions): Promise<Plugin.NovelItem[]> {
        const url = pageNo === 1 ? this.site : `${this.site}page/${pageNo}/`;
        const body = await fetchText(url, { headers: this.headers });
        const $ = loadCheerio(body);
        const novels: Plugin.NovelItem[] = [];

        $(".page-item-detail").each((i, el) => {
            const titleEl = $(el).find(".post-title a, .item-summary h3 a, h4 a").first();
            const name = titleEl.text().trim();
            const path = titleEl.attr("href")?.replace(this.site, "") || "";
            const cover = $(el).find("img").attr("data-src") || $(el).find("img").attr("src") || defaultCover;

            if (name && path) novels.push({ name, path, cover });
        });
        return novels;
    }

    async parseNovel(novelPath: string): Promise<Plugin.SourceNovel> {
        // Normalization: Ensure we are using the /read/ path
        const url = `${this.site}${novelPath.replace('/novel/', '/read/')}`;
        const body = await fetchText(url, { headers: this.headers });
        const $ = loadCheerio(body);

        // Sanitize layout
        $("style, script, #nn-comment-optimize-inline-css").remove();

        const novel: Plugin.SourceNovel = {
            path: novelPath,
            name: $(".post-title h1, .post-title h3, h1").first().text().trim(),
            cover: $(".summary_image img").attr("data-src") || $(".summary_image img").attr("src") || defaultCover,
            summary: $(".description-summary, .summary__content, .summary-text, .post-content_item").text().trim(),
            author: $(".author-content a").text().trim(),
            status: $(".post-status").text().trim().toLowerCase().includes("ongoing") ? NovelStatus.Ongoing : NovelStatus.Completed,
            genres: $(".genres-content a").map((i, el) => $(el).text().trim()).get(),
            chapters: []
        };

        // Extract Chapters
        const chapters: Plugin.ChapterItem[] = [];
        $(".listing-chapters_wrap ul.main li a, .wp-manga-chapter a, .chapter-list a").each((i, el) => {
            chapters.push({
                name: $(el).text().trim(),
                path: $(el).attr("href")?.replace(this.site, "") || "",
                chapterNumber: i + 1,
            });
        });

        // AJAX Fallback
        if (chapters.length === 0) {
            const ajaxUrl = url.endsWith('/') ? `${url}ajax/chapters/` : `${url}/ajax/chapters/`;
            try {
                const ajaxBody = await fetchText(ajaxUrl, { 
                    headers: { ...this.headers, 'X-Requested-With': 'XMLHttpRequest' } 
                });
                const $c = loadCheerio(ajaxBody);
                $c(".listing-chapters_wrap ul.main li a, .chapter-link a").each((i, el) => {
                    chapters.push({
                        name: $c(el).text().trim(),
                        path: $c(el).attr("href")?.replace(this.site, "") || "",
                        chapterNumber: i + 1,
                    });
                });
            } catch (e) { /* silent fail */ }
        }

        novel.chapters = chapters.reverse();
        return novel;
    }

    async parseChapter(chapterPath: string): Promise<string> {
        const url = `${this.site}${chapterPath}`;
        const body = await fetchText(url, { headers: this.headers });
        const $ = loadCheerio(body);

        $("style, script, .nn-comment-toast, .nn-spinner").remove();
        return $(".text-left, .reading-content, .entry-content_wrap, .text-ui").html() || "";
    }

    async searchNovels(searchTerm: string, pageNo: number): Promise<Plugin.NovelItem[]> {
        const url = `${this.site}page/${pageNo}/?s=${encodeURIComponent(searchTerm)}`;
        const body = await fetchText(url, { headers: this.headers });
        const $ = loadCheerio(body);
        const novels: Plugin.NovelItem[] = [];

        $(".page-item-detail, .c-tabs-item__content, .search-wrap").each((i, el) => {
            const titleEl = $(el).find(".post-title a, h3 a, .title a").first();
            const name = titleEl.text().trim();
            const path = titleEl.attr("href")?.replace(this.site, "") || "";
            const cover = $(el).find("img").attr("data-src") || $(el).find("img").attr("src") || defaultCover;
            if (name && path) novels.push({ name, path, cover });
        });
        return novels;
    }
}

export default new NovelNicePlugin();
    
