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
    version = "1.0.3";

    async popularNovels(pageNo: number) {
        // Updated to use the correct Madara query path to prevent the 404 error
        const url = `${this.site}?s=&post_type=wp-manga&m_orderby=views&page=${pageNo}`;
        const result = await fetch(url, { headers });
        const body = await result.text();
        const $ = load(body);

        const novels: any[] = [];
        $(".c-tabs-item__content, .page-item-detail").each((i, el) => {
            const name = $(el).find(".post-title a").text().trim();
            const url = $(el).find(".post-title a").attr("href") || "";
            const cover = $(el).find("img").attr("src") || "";
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
            name: $(".post-title h1").text().trim(),
            cover: $(".summary_image img").attr("src") || "",
            summary: $(".description-summary").text().trim(),
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
            novel.chapters.push({ name: chapterName, url: chapterUrl });
        });

        novel.chapters.reverse();
        return novel;
    }

    async parseChapter(chapterUrl: string) {
        const result = await fetch(chapterUrl, { headers });
        const body = await result.text();
        const $ = load(body);

        const chapterText = $(".text-left").html() || "";
        return chapterText;
    }

    async searchNovels(searchTerm: string, pageNo: number) {
        const url = `${this.site}page/${pageNo}/?s=${encodeURIComponent(searchTerm)}&post_type=wp-manga`;
        const result = await fetch(url, { headers });
        const body = await result.text();
        const $ = load(body);

        const novels: any[] = [];
        $(".c-tabs-item__content").each((i, el) => {
            const name = $(el).find(".post-title a").text().trim();
            const url = $(el).find(".post-title a").attr("href") || "";
            const cover = $(el).find("img").attr("src") || "";
            novels.push({ name, url, cover });
        });

        return novels;
    }
}

export default new NovelNicePlugin();
