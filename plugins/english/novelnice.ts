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
    version = "1.1.6"; // Incremented version

    private headers = {
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0.0.0 Safari/537.36',
        'Referer': 'https://novelnice.com/',
        'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,image/avif,image/webp,*/*;q=0.8',
    };

    async popularNovels(pageNo: number, options: Plugin.PopularNovelsOptions): Promise<Plugin.NovelItem[]> {
        const url = pageNo === 1 ? this.site : `${this.site}page/${pageNo}/`;
        const body = await fetchText(url, { headers: this.headers });
        const $ = loadCheerio(body);
        const novels: Plugin.NovelItem[] = [];

        $(".page-item-detail").each((i, el) => {
            const titleEl = $(el).find(".post-title a").first();
            const name = titleEl.text().trim();
            const path = titleEl.attr("href")?.replace(this.site, "") || "";
            const cover = $(el).find("img").attr("data-src") || $(el).find("img").attr("src") || defaultCover;

            if (name && path) novels.push({ name, path, cover });
        });
        return novels;
    }

    async parseNovel(novelPath: string): Promise<Plugin.SourceNovel> {
        const url = `${this.site}${novelPath.replace('/novel/', '/read/')}`;
        const body = await fetchText(url, { headers: this.headers });
        const $ = loadCheerio(body);

        // Targeted summary extraction: strip UI clutter
        const summaryContainer = $(".summary__content, .description-summary").first();
        summaryContainer.find("h3, .summary-title, .btn").remove();
        const summary = summaryContainer.text().trim() || "No summary available.";

        // Metadata extraction with selector isolation
        const author = $(".author-content a").first().text().trim();
        const statusText = $(".post-status").text().trim().toLowerCase();
        const status = statusText.includes("ongoing") ? NovelStatus.Ongoing : NovelStatus.Completed;
        const genres = $(".genres-content a").map((_, el) => $(el).text().trim()).get().filter(g => g.length > 0);

        const novel: Plugin.SourceNovel = {
            path: novelPath,
            name: $(".post-title h1").first().text().trim(),
            cover: $(".summary_image img").attr("data-src") || $(".summary_image img").attr("src") || defaultCover,
            summary,
            author,
            status,
            genres,
            chapters: []
        };

        // AJAX Chapter Loading
        const novelId = $("#manga-chapters-holder").attr("data-id");
        if (novelId) {
            try {
                const ajaxUrl = `${this.site}wp-admin/admin-ajax.php`;
                const ajaxBody = await fetchText(ajaxUrl, {
                    method: 'POST',
                    headers: { ...this.headers, 'Content-Type': 'application/x-www-form-urlencoded', 'X-Requested-With': 'XMLHttpRequest' },
                    body: `action=manga_get_chapters&manga=${novelId}`
                });
                const $c = loadCheerio(ajaxBody);
                $c("li.wp-manga-chapter a").each((_, el) => {
                    novel.chapters.push({
                        name: $c(el).text().trim(),
                        path: $c(el).attr("href")?.replace(this.site, "") || "",
                        chapterNumber: novel.chapters.length + 1,
                    });
                });
                novel.chapters.reverse();
            } catch (e) {
                // Fallback to static parsing
                $(".wp-manga-chapter a").each((_, el) => {
                    novel.chapters.push({
                        name: $(el).text().trim(),
                        path: $(el).attr("href")?.replace(this.site, "") || "",
                        chapterNumber: novel.chapters.length + 1,
                    });
                });
                novel.chapters.reverse();
            }
        }

        return novel;
    }

    async parseChapter(chapterPath: string): Promise<string> {
        const url = `${this.site}${chapterPath}`;
        const body = await fetchText(url, { headers: this.headers });
        const $ = loadCheerio(body);
        
        $(".nn-comment-toast, .nn-spinner, script, style").remove();
        return $(".text-left, .reading-content, .entry-content_wrap").html() || "";
    }

    async searchNovels(searchTerm: string, pageNo: number): Promise<Plugin.NovelItem[]> {
        const url = `${this.site}page/${pageNo}/?s=${encodeURIComponent(searchTerm)}&post_type=wp-manga`;
        const body = await fetchText(url, { headers: this.headers });
        
        if (body.includes("captcha") || body.includes("challenge")) {
            throw new Error("Security challenge detected. Please open this novel in WebView.");
        }

        const $ = loadCheerio(body);
        const novels: Plugin.NovelItem[] = [];

        $(".c-tabs-item__content").each((_, el) => {
            const titleEl = $(el).find(".post-title a").first();
            const name = titleEl.text().trim();
            const path = titleEl.attr("href")?.replace(this.site, "") || "";
            const cover = $(el).find("img").attr("data-src") || $(el).find("img").attr("src") || defaultCover;
            if (name && path) novels.push({ name, path, cover });
        });
        return novels;
    }
}

export default new NovelNicePlugin();
