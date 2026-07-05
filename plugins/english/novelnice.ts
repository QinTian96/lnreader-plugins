import { Plugin } from "@current/plugin-interface";
import { load } from "cheerio";

const headers = {
    'User-Agent': 'Mozilla/5.0 (Linux; Android 10; K) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Mobile Safari/537.36',
    'Referer': 'https://novelnice.com/',
};

class NovelNicePlugin implements Plugin {
    id = "novelnice";
    name = "NovelNice";
    icon = "src/en/novelnice/icon.png";
    site = "https://novelnice.com/";
    version = "1.0.7";

    async popularNovels(pageNo: number) {
        const url = pageNo === 1 ? this.site : `${this.site}page/${pageNo}/`;
        const result = await fetch(url, { headers });
        const body = await result.text();
        const $ = load(body);

        const novels: any[] = [];
        
        // Loop through the precise structural grid parent wrapper blocks
        $(".page-item-detail, .manga-item, .item-list").each((i, el) => {
            // Force it to grab ONLY the specific title element to avoid double tracking links
            const titleEl = $(el).find(".post-title a, .title a, h3 a, h4 a").first();
            const name = titleEl.text().trim();
            const url = titleEl.attr("href") || "";
            
            let cover = $(el).find("img").attr("data-src") || 
                        $(el).find("img").attr("data-lazy-src") || 
                        $(el).find("img").attr("src") || "";

            if (name && url) {
                novels.push({ name, url, cover });
            }
        });

        return novels;
    }

    async parseNovel(novelUrl: string) {
        const result = await fetch(novelUrl, { headers });
        const body = await result.text();
        const $ = load(body);

        const novel: any = {
            url: novelUrl,
            name: $(".post-title h1, .post-title h3, .title h1").first().text().trim(),
            cover: $(".summary_image img, .item-thumb img").attr("data-src") || $(".summary_image img, .item-thumb img").attr("src") || "",
            summary: $(".description-summary, .summary__content, .summary-text, .panel-story-info_description").text().trim(),
            author: $(".author-content a, .author").text().replace("Author:", "").trim(),
            artist: "",
            status: $(".post-status, .status").text().replace("Status:", "").trim(),
            chapters: []
        };

        // Standard direct HTML parser check for Madara/WordPress setups
        $(".wp-manga-chapter a, li.chapter a, .chapter-list a").each((i, el) => {
            const chapterName = $(el).text().trim();
            const chapterUrl = $(el).attr("href") || "";
            if (chapterName && chapterUrl) {
                // Ensure duplicate responsive hidden layers are skipped
                if (!novel.chapters.some((c: any) => c.url === chapterUrl)) {
                    novel.chapters.push({ name: chapterName, url: chapterUrl });
                }
            }
        });

        // If the main layout left the list blank, hit the fallback background endpoint
        if (novel.chapters.length === 0) {
            const ajaxUrl = novelUrl.endsWith('/') ? `${novelUrl}ajax/chapters/` : `${novelUrl}/ajax/chapters/`;
            try {
                const ajaxResult = await fetch(ajaxUrl, {
                    method: 'POST',
                    headers: { ...headers, 'X-Requested-With': 'XMLHttpRequest' }
                });
                const ajaxBody = await ajaxResult.text();
                const $c = load(ajaxBody);

                $c(".wp-manga-chapter a, li.chapter a").each((i, el) => {
                    const chapterName = $c(el).text().trim();
                    const chapterUrl = $c(el).attr("href") || "";
                    if (chapterName && chapterUrl && !novel.chapters.some((c: any) => c.url === chapterUrl)) {
                        novel.chapters.push({ name: chapterName, url: chapterUrl });
                    }
                });
            } catch (e) {
                // Background fallback safe catch
            }
        }

        // Arrange sequentially if the site lists newest first
        if (novel.chapters.length > 0) {
            const firstChapterName = novel.chapters[0].name.toLowerCase();
            if (!firstChapterName.includes("chapter 1") && !firstChapterName.includes("ch.1")) {
                novel.chapters.reverse();
            }
        }
        
        return novel;
    }

    async parseChapter(chapterUrl: string) {
        const result = await fetch(chapterUrl, { headers });
        const body = await result.text();
        const $ = load(body);

        const chapterText = $(".text-left, .reading-content, .entry-content_wrap, #chapter-content").html() || "";
        return chapterText;
    }

    async searchNovels(searchTerm: string, pageNo: number) {
        const url = `${this.site}page/${pageNo}/?s=${encodeURIComponent(searchTerm)}&post_type=wp-manga`;
        const result = await fetch(url, { headers });
        const body = await result.text();
        const $ = load(body);

        const novels: any[] = [];
        $(".page-item-detail, .manga-item, .c-tabs-item__content").each((i, el) => {
            const titleEl = $(el).find(".post-title a, .title a").first();
            const name = titleEl.text().trim();
            const url = titleEl.attr("href") || "";
            const cover = $(el).find("img").attr("data-src") || $(el).find("img").attr("src") || "";
            
            if (name && url) {
                novels.push({ name, url, cover });
            }
        });

        return novels;
    }
}

export default new NovelNicePlugin();
            
