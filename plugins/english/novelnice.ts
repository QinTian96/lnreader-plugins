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
    version = "1.2.3";

    private headers = {
        'User-Agent': 'Mozilla/5.0 (Linux; Android 10; K) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/140.0.0.0 Mobile Safari/537.36',
    };

    async parseNovel(novelPath: string): Promise<Plugin.SourceNovel> {
        const url = `${this.site}${novelPath.replace(/\/$/, "")}/`;
        const body = await fetchText(url, { headers: this.headers });
        const $ = loadCheerio(body);

        const mangaId = $("#manga-chapters-holder")?.attr("data-id");

        const novel: Plugin.SourceNovel = {
            path: novelPath,
            name: $(".post-title h1")?.text()?.trim() || "Unknown",
            cover: $(".summary_image img")?.attr("data-src") || $(".summary_image img")?.attr("src") || defaultCover,
            summary: $(".summary__content")?.text()?.trim() || "No summary.",
            author: $(".author-content a")?.text()?.trim() || "Unknown",
            status: $(".post-status")?.text()?.toLowerCase()?.includes("ongoing") ? NovelStatus.Ongoing : NovelStatus.Completed,
            genres: $(".genres-content a")?.map((_, el) => $(el)?.text()?.trim())?.get() || [],
            chapters: []
        };

        if (mangaId) {
            const ajaxUrl = `${this.site}wp-admin/admin-ajax.php`;
            try {
                const ajaxResponse = await fetchText(ajaxUrl, {
                    method: 'POST',
                    headers: { 
                        ...this.headers, 
                        'Content-Type': 'application/x-www-form-urlencoded',
                        'Referer': url, 
                        'X-Requested-With': 'XMLHttpRequest' 
                    },
                    body: `action=manga_get_chapters&manga=${mangaId}`
                });
                const $c = loadCheerio(ajaxResponse);
                $c("li.wp-manga-chapter a").each((_, el) => {
                    novel.chapters.push({
                        name: $c(el)?.text()?.trim() || "Chapter",
                        path: $c(el)?.attr("href")?.replace(this.site, "") || "",
                        chapterNumber: novel.chapters.length + 1,
                    });
                });
                novel.chapters.reverse();
            } catch (e) {
                $(".wp-manga-chapter a").each((_, el) => {
                    novel.chapters.push({
                        name: $(el)?.text()?.trim() || "Chapter",
                        path: $(el)?.attr("href")?.replace(this.site, "") || "",
                        chapterNumber: novel.chapters.length + 1,
                    });
                });
                novel.chapters.reverse();
            }
        }
        return novel;
    }

    async searchNovels(searchTerm: string, pageNo: number): Promise<Plugin.NovelItem[]> {
        const url = `${this.site}?s=${encodeURIComponent(searchTerm)}&post_type=wp-manga&page=${pageNo}`;
        const body = await fetchText(url, { headers: this.headers });
        const $ = loadCheerio(body);
        const novels: Plugin.NovelItem[] = [];

        $(".c-tabs-item__content").each((_, el) => {
            const element = $(el);
            const titleEl = element.find(".post-title a")?.first();
            const name = titleEl?.text()?.trim();
            const path = titleEl?.attr("href")?.replace(this.site, "");
            const cover = element.find("img")?.attr("data-src") || element.find("img")?.attr("src") || defaultCover;
            
            if (name && path) novels.push({ name, path, cover });
        });
        return novels;
    }

    async parseChapter(chapterPath: string): Promise<string> {
        const url = `${this.site}${chapterPath}`;
        const body = await fetchText(url, { headers: this.headers });
        const $ = loadCheerio(body);
        return $(".reading-content")?.html() || "";
    }
}

export default new NovelNicePlugin();
