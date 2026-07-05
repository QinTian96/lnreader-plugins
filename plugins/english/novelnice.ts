import { fetchApi } from '@libs/fetch'; // Switched to fetchApi for cookie handling
import { Plugin } from '@/types/plugin';
import { load as loadCheerio } from 'cheerio';
import { defaultCover } from '@libs/defaultCover';
import { NovelStatus } from '@libs/novelStatus';

class NovelNicePlugin implements Plugin.PluginBase {
    id = "novelnice";
    name = "NovelNice";
    icon = "src/en/novelnice/icon.png";
    site = "https://novelnice.com/";
    version = "1.1.7"; // Version bumped for fetchApi integration

    private headers = {
        'User-Agent': 'Mozilla/5.0 (Linux; Android 10; K) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/140.0.0.0 Mobile Safari/537.36',
    };

    async parseNovel(novelPath: string): Promise<Plugin.SourceNovel> {
        const url = `${this.site}read/${novelPath.split('/').pop()}/`;
        const body = await fetchApi(url, { headers: this.headers }).then(r => r.text());
        const $ = loadCheerio(body);

        const genres = $(".genres-content a").map((_, el) => $(el).text().trim()).get();
        const novel: Plugin.SourceNovel = {
            path: novelPath,
            name: $(".post-title h1").first().text().trim(),
            cover: $(".summary_image img").attr("data-src") || $(".summary_image img").attr("src") || defaultCover,
            summary: $(".summary__content, .description-summary").first().text().trim(),
            author: $(".author-content a").first().text().trim(),
            status: $(".post-status").text().toLowerCase().includes("ongoing") ? NovelStatus.Ongoing : NovelStatus.Completed,
            genres,
            chapters: []
        };

        // Use the endpoint structure identified in 1000789988.jpg
        const ajaxUrl = `${url}ajax/chapters/?t=1`;

        try {
            const ajaxResponse = await fetchApi(ajaxUrl, {
                method: 'POST',
                headers: {
                    ...this.headers,
                    'Referer': url,
                    'X-Requested-With': 'XMLHttpRequest'
                }
            });
            const ajaxBody = await ajaxResponse.text();
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
            // Fallback: Static parsing
            $(".wp-manga-chapter a").each((_, el) => {
                novel.chapters.push({
                    name: $(el).text().trim(),
                    path: $(el).attr("href")?.replace(this.site, "") || "",
                    chapterNumber: novel.chapters.length + 1,
                });
            });
            novel.chapters.reverse();
        }

        return novel;
    }

    async searchNovels(searchTerm: string, pageNo: number): Promise<Plugin.NovelItem[]> {
        const url = `${this.site}page/${pageNo}/?s=${encodeURIComponent(searchTerm)}&post_type=wp-manga`;
        const response = await fetchApi(url, { headers: this.headers });
        const body = await response.text();
        
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
