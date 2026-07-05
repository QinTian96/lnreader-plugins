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
    version = "1.1.2";

    private headers = {
        'User-Agent': 'Mozilla/5.0 (Linux; Android 10; K) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Mobile Safari/537.36',
    };

    async parseNovel(novelPath: string): Promise<Plugin.SourceNovel> {
        const url = `${this.site}${novelPath.replace('/novel/', '/read/')}`;
        const body = await fetchText(url, { headers: this.headers });
        const $ = loadCheerio(body);

        // Targeted extraction to avoid leaking metadata into the summary
        const name = $(".post-title h1").first().text().trim();
        const cover = $(".summary_image img").attr("data-src") || $(".summary_image img").attr("src") || defaultCover;
        
        // Use a single, specific selector for the summary to prevent duplication
        const summary = $(".description-summary").text().trim() || $(".summary__content").text().trim();
        
        const author = $(".author-content a").text().trim();
        const statusText = $(".post-status").text().trim().toLowerCase();
        const status = statusText.includes("ongoing") ? NovelStatus.Ongoing : NovelStatus.Completed;
        const genres = $(".genres-content a").map((i, el) => $(el).text().trim()).get();

        const novel: Plugin.SourceNovel = {
            path: novelPath,
            name,
            cover,
            summary,
            author,
            status,
            genres,
            chapters: []
        };

        // Extract Chapters
        const chapters: Plugin.ChapterItem[] = [];
        $(".listing-chapters_wrap ul.main li a, .chapter-list a").each((i, el) => {
            const path = $(el).attr("href")?.replace(this.site, "") || "";
            if (path) {
                chapters.push({
                    name: $(el).text().trim(),
                    path,
                    chapterNumber: i + 1,
                });
            }
        });

        // AJAX Fallback
        if (chapters.length === 0) {
            const ajaxUrl = `${url.replace(/\/$/, "")}/ajax/chapters/`;
            try {
                const ajaxBody = await fetchText(ajaxUrl, { 
                    headers: { ...this.headers, 'X-Requested-With': 'XMLHttpRequest' } 
                });
                const $c = loadCheerio(ajaxBody);
                $c(".listing-chapters_wrap ul.main li a, .chapter-link a").each((i, el) => {
                    const path = $c(el).attr("href")?.replace(this.site, "") || "";
                    if (path) {
                        chapters.push({
                            name: $c(el).text().trim(),
                            path,
                            chapterNumber: i + 1,
                        });
                    }
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

        // Sanitize to remove UI elements that might appear in chapter text
        $(".nn-comment-toast, .nn-spinner, script, style").remove();
        
        return $(".text-left, .reading-content, .entry-content_wrap").html() || "";
    }

    // ... popularNovels and searchNovels implementation remains as previously defined
}

export default new NovelNicePlugin();
                
