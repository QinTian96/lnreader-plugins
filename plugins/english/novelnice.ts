import { Plugin } from "@current/plugin-interface";
import { load } from "cheerio";

const headers = {
    'User-Agent': 'Mozilla/5.0 (Linux; Android 10; K) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Mobile Safari/537.36',
    'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,image/webp,image/apng,*/*;q=0.8',
    'Accept-Language': 'en-US,en;q=0.9',
    'Referer': 'https://novelnice.com/',
};

class NovelNicePlugin implements Plugin {
    id = "novelnice";
    name = "NovelNice";
    icon = "src/en/novelnice/icon.png";
    site = "https://novelnice.com/";
    version = "1.1.2";

    async popularNovels(pageNo: number) {
        const url = pageNo === 1 ? this.site : `${this.site}page/${pageNo}/`;
        const result = await fetch(url, { headers });
        const body = await result.text();
        const $ = load(body);

        const novels: any[] = [];
        
        $(".page-item-detail").each((i, el) => {
            const titleEl = $(el).find(".post-title a, .item-summary h3 a, h4 a").first();
            const name = titleEl.text().trim();
            const url = titleEl.attr("href") || "";
            
            const cover = $(el).find("img").attr("data-src") || 
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

        // Strip custom styling and layout configurations explicitly out of memory
        $("style, script, #nn-comment-optimize-inline-css").remove();

        const novel: any = {
            url: novelUrl,
            name: $(".post-title h1, .post-title h3, h1").first().text().trim(),
            cover: $(".summary_image img").attr("data-src") || $(".summary_image img").attr("src") || "",
            summary: $(".description-summary, .summary__content, .summary-text, .post-content_item").text().trim(),
            author: $(".author-content a").text().trim(),
            artist: "",
            status: $(".post-status").text().trim(),
            chapters: []
        };

        // Standard parsing extraction targeted on the unified layout container
        $(".listing-chapters_wrap ul.main li a, .wp-manga-chapter a, .chapter-list a").each((i, el) => {
            const chapterName = $(el).text().trim();
            const chapterUrl = $(el).attr("href") || "";
            if (chapterName && chapterUrl && !novel.chapters.some((c: any) => c.url === chapterUrl)) {
                novel.chapters.push({ name: chapterName, url: chapterUrl });
            }
        });

        // Safe background fallback if pagination blocks hide standard page listings
        if (novel.chapters.length === 0) {
            const ajaxUrl = novelUrl.endsWith('/') ? `${novelUrl}ajax/chapters/` : `${novelUrl}/ajax/chapters/`;
            try {
                const ajaxResult = await fetch(ajaxUrl, {
                    method: 'POST',
                    headers: { ...headers, 'X-Requested-With': 'XMLHttpRequest' }
                });
                const ajaxBody = await ajaxResult.text();
                const $c = load(ajaxBody);

                $c(".listing-chapters_wrap ul.main li a, .wp-manga-chapter a, .chapter-link a").each((i, el) => {
                    const chapterName = $c(el).text().trim();
                    const chapterUrl = $c(el).attr("href") || "";
                    if (chapterName && chapterUrl && !novel.chapters.some((c: any) => c.url === chapterUrl)) {
                        novel.chapters.push({ name: chapterName, url: chapterUrl });
                    }
                });
            } catch (e) {
                // Fail-safe catch
            }
        }

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

        // Stripping dynamic toast elements and injected styling layers out of text layout blocks
        $("style, script, .nn-comment-toast, .nn-spinner").remove();

        const chapterText = $(".text-left, .reading-content, .entry-content_wrap, .text-ui").html() || "";
        return chapterText;
    }

    async searchNovels(searchTerm: string, pageNo: number) {
        const url = `${this.site}page/${pageNo}/?s=${encodeURIComponent(searchTerm)}`;
        const result = await fetch(url, { headers });
        const body = await result.text();
        const $ = load(body);

        const novels: any[] = [];
        $(".page-item-detail, .c-tabs-item__content, .search-wrap").each((i, el) => {
            const titleEl = $(el).find(".post-title a, h3 a, .title a").first();
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
