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
    version = "1.0.4";

    async popularNovels(pageNo: number) {
        // Broad search parameters to pull the full list reliably
        const url = `${this.site}page/${pageNo}/?s=&post_type=wp-manga&m_orderby=views`;
        const result = await fetch(url, { headers });
        const body = await result.text();
        const $ = load(body);

        const novels: any[] = [];
        
        // Aggressive fallback selectors targeting different Madara variations
        $(".c-tabs-item__content, .page-item-detail, .row.c-tabs-item__content, .manga-item").each((i, el) => {
            const titleEl = $(el).find(".post-title a, .h4 a, h3 a, h4 a").first();
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
            name: $(".post-title h1, .post-title h3").text().trim(),
            cover: $(".summary_image img").attr("data-src") || $(".summary_image img").attr("src") || "",
            summary: $(".description-summary, .summary__content").text().trim(),
            author: $(".author-content a").text().trim(),
            artist: $(".artist-content a").text().trim(),
            status: $(".post-status").text().trim(),
            chapters: []
        };

        const ajaxUrl = novelUrl.endsWith('/') ? `${novelUrl}ajax/chapters/` : `${novelUrl}/ajax/chapters/`;
        const ajaxResult = await fetch(ajaxUrl, {
            method: 'POST',
            headers: {
                ...headers,
                'X-Requested-With': 'XMLHttpRequest'
            }
        });
        const ajaxBody = await ajaxResult.text();
        const $c = load(ajaxBody);

        $c(".wp-manga-chapter").each((i, el) => {
            const chapterName = $c(el).find("a").text().trim();
            const chapterUrl = $c(el).find("a").attr("href") || "";
            if (chapterName && chapterUrl) {
                novel.chapters.push({ name: chapterName, url: chapterUrl });
            }
        });

        novel.chapters.reverse();
        return novel;
    }

    async parseChapter(chapterUrl: string) {
        const result = await fetch(chapterUrl, { headers });
        const body = await result.text();
        const $ = load(body);

        const chapterText = $(".text-left, .reading-content, .entry-content_wrap").html() || "";
        return chapterText;
    }

    async searchNovels(searchTerm: string, pageNo: number) {
        const url = `${this.site}page/${pageNo}/?s=${encodeURIComponent(searchTerm)}&post_type=wp-manga`;
        const result = await fetch(url, { headers });
        const body = await result.text();
        const $ = load(body);

        const novels: any[] = [];
        $(".c-tabs-item__content, .page-item-detail, .manga-item").each((i, el) => {
            const titleEl = $(el).find(".post-title a, .h4 a").first();
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
                
