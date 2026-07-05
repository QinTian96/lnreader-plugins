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
    version = "1.0.6";

    async popularNovels(pageNo: number) {
        // Targets their main updates index matching the homepage grid
        const url = pageNo === 1 ? this.site : `${this.site}page/${pageNo}/`;
        const result = await fetch(url, { headers });
        const body = await result.text();
        const $ = load(body);

        const novels: any[] = [];
        
        // Target layout containers visible in the screenshot
        $(".item-list, .col-md-6, .grid-item, .page-item-detail").each((i, el) => {
            const titleEl = $(el).find(".title a, .post-title a, h3 a, h4 a").first();
            const name = titleEl.text().trim();
            const url = titleEl.attr("href") || "";
            
            let cover = $(el).find(".image img, .cover img, img").attr("src") || 
                        $(el).find("img").attr("data-src") || "";

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
            name: $(".title h1, .post-title h1").text().trim(),
            cover: $(".image img, .cover img, .summary_image img").attr("src") || "",
            summary: $(".synopsis, .description-summary, .summary__content").text().trim(),
            author: $(".author, .author-content").text().replace("Author:", "").trim(),
            artist: "",
            status: $(".status").text().replace("Status:", "").trim(),
            chapters: []
        };

        // Grabs chapters from both structural formats
        $(".chapter-list a, .wp-manga-chapter a, li.chapter a").each((i, el) => {
            const chapterName = $(el).text().trim();
            const chapterUrl = $(el).attr("href") || "";
            if (chapterName && chapterUrl) {
                novel.chapters.push({ name: chapterName, url: chapterUrl });
            }
        });

        // Only reverse if the source site shows them newest-to-oldest
        if ($(".chapter-list a, li.chapter a").first().text().toLowerCase().includes("chapter 1")) {
            // Already ordered sequentially
        } else {
            novel.chapters.reverse();
        }
        
        return novel;
    }

    async parseChapter(chapterUrl: string) {
        const result = await fetch(chapterUrl, { headers });
        const body = await result.text();
        const $ = load(body);

        // Sweeps every text content container variation
        const chapterText = $(".chapter-content, .text-left, .reading-content, #chapter-content").html() || "";
        return chapterText;
    }

    async searchNovels(searchTerm: string, pageNo: number) {
        const url = `${this.site}page/${pageNo}/?s=${encodeURIComponent(searchTerm)}`;
        const result = await fetch(url, { headers });
        const body = await result.text();
        const $ = load(body);

        const novels: any[] = [];
        $(".item-list, .col-md-6, .grid-item").each((i, el) => {
            const titleEl = $(el).find(".title a, .post-title a").first();
            const name = titleEl.text().trim();
            const url = titleEl.attr("href") || "";
            const cover = $(el).find("img").attr("src") || "";
            
            if (name && url) {
                novels.push({ name, url, cover });
            }
        });

        return novels;
    }
}

export default new NovelNicePlugin();
