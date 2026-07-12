import * as cheerio from "cheerio";
import { Plugin } from "@current-types/plugin"; // Adjust type import based on local workspace environment

const sourceId = "novelnice";
const baseUrl = "https://novelnice.com";

const NovelnicePlugin: Plugin = {
    id: sourceId,
    name: "Novelnice",
    icon: "assets/icon.png", // Ensure this matches your asset file path
    site: baseUrl,
    version: "1.0.0",

    // 1. POPULAR / LATEST BROWSE FUNCTION
    async popularNovels(page, { filters }) {
        // Construct standard Madara page layouts cleanly
        const url = page === 1 ? `${baseUrl}/` : `${baseUrl}/page/${page}/`;
        
        const response = await fetch(url);
        const html = await response.text();
        const $ = cheerio.load(html);
        
        const novels: any[] = [];

        $('.page-item-detail').each((i, el) => {
            const name = $(el).find('.post-title h3 a').text().trim();
            const url = $(el).find('.post-title h3 a').attr('href') || "";
            const cover = $(el).find('.item-thumb img').attr('src') || "";

            if (name && url) {
                novels.push({ name, url, cover });
            }
        });

        // If elements exist, assume next pages exist (standard safe guess for LNReader layout)
        return { novels, totalPages: novels.length > 0 ? page + 1 : page };
    },

    // 2. NOVEL DETAILS & DYNAMIC AJAX CHAPTER EXTRACTION
    async parseNovel(novelUrl) {
        const response = await fetch(novelUrl);
        const html = await response.text();
        const $ = cheerio.load(html);

        // Map parsed metadata values safely
        const name = $('.post-title h1').text().trim();
        const cover = $('.summary_image img').attr('src') || "";
        const author = $('.author-content a').text().trim();
        const status = $('.post-status .summary-content').text().trim();
        const summary = $('.description-summary .summary__content').text().trim();

        // Target the unique AJAX loader hook node to pull the backend ID element
        const mangaId = $('#manga-chapters-holder').attr('data-id');
        const chapters: any[] = [];

        if (mangaId) {
            // Bypass execution trap: Query backend script endpoint directly mimicking browser form configurations
            const ajaxUrl = `${baseUrl}/wp-admin/admin-ajax.php`;
            const formData = new URLSearchParams();
            formData.append('action', 'ajax_manga_list');
            formData.append('id', mangaId);

            const ajaxResponse = await fetch(ajaxUrl, {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/x-www-form-urlencoded',
                },
                body: formData.toString()
            });

            const ajaxHtml = await ajaxResponse.text();
            const $ajax = cheerio.load(ajaxHtml);

            // Scrape the dynamically delivered layout from HTML payload
            $ajax('.wp-manga-chapter a, .chapter-item a').each((i, el) => {
                const chapterName = $ajax(el).text().trim();
                const chapterUrl = $ajax(el).attr('href') || "";

                if (chapterName && chapterUrl) {
                    chapters.push({
                        name: chapterName,
                        url: chapterUrl,
                        releaseTime: null // Populate metadata later dynamically if required
                    });
                }
            });

            // Keep the true reading sequencing intact (oldest to newest tracking)
            chapters.reverse();
        }

        return {
            name,
            cover,
            summary,
            author,
            status,
            chapters
        };
    },

    // 3. READING CONTENT PARSING & CLEANUP
    async parseChapter(chapterUrl) {
        const response = await fetch(chapterUrl);
        const html = await response.text();
        const $ = cheerio.load(html);

        // Isolate the text layer container 
        const container = $('.text-left');

        // Execute precise surgical DOM strips to sanitize reading environment
        container.find('#text-chapter-toolbar, script, style, iframe, .ads-content').remove();
        
        // Remove WebNovel/source attribution watermarks matching exact string patterns
        container.find('p').each((i, el) => {
            const text = $(el).text();
            if (text.includes("Content source:") || text.includes("WebNovel.com")) {
                $(el).remove();
            }
        });

        return container.html() || "Content rendering failed.";
    },

    // 4. SEARCH QUERY DISPATCH
    async searchNovels(searchTerm, page) {
        const url = `${baseUrl}/page/${page}/?s=${encodeURIComponent(searchTerm)}&post_type=wp-manga`;
        
        const response = await fetch(url);
        const html = await response.text();
        const $ = cheerio.load(html);
        
        const novels: any[] = [];

        // Search returns equivalent elements layout mappings as homepage components loop
        $('.page-item-detail').each((i, el) => {
            const name = $(el).find('.post-title h3 a').text().trim();
            const url = $(el).find('.post-title h3 a').attr('href') || "";
            const cover = $(el).find('.item-thumb img').attr('src') || "";

            if (name && url) {
                novels.push({ name, url, cover });
            }
        });

        return { novels, totalPages: novels.length > 0 ? page + 1 : page };
    }
};

export default NovelnicePlugin;
